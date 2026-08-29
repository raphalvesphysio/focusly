/* MyFocusly — sync Google Drive (branch personal / multiplataforma) */
(function (global) {
  "use strict";

  var DRIVE_FILE_NAME = "myfocusly-backup.json";
  var OAUTH_SCOPES =
    "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/calendar.readonly openid email profile";
  var GCAL_CACHE_TTL_MS = 5 * 60 * 1000;
  var gcalCache = { from: "", to: "", events: [], fetchedAt: 0 };
  var gcalFetchPromise = null;
  var CLOUD_PUSH_DEBOUNCE_MS = 5000;
  var CLOUD_ONLY = true;
  var TOKEN_STORAGE_KEY = "myfocusly-google-token";
  var FILE_ID_STORAGE_KEY = "myfocusly-drive-file-id";
  var CLIENT_ID_STORAGE_KEY = "myfocusly-google-client-id";

  function diaryItemCount(st) {
    st = st || {};
    return (st.entries || []).length + (st.tasks || []).length + (st.agenda || []).length;
  }

  async function downloadRemoteFile(fileId) {
    var metaRes = await fetch(
      "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!metaRes.ok) return null;
    try {
      return await metaRes.json();
    } catch (e) {
      return null;
    }
  }

  var deps = null;
  var googleClientId = null;
  var cloudReady = false;
  var cloudLastSyncAt = 0;
  var cloudPushTimer = null;
  var accessToken = null;
  var tokenExpiresAt = 0;
  var sessionUser = null;
  var tokenClient = null;
  var gsiReady = false;

  function cloudPayload() {
    var STATE = deps.getState();
    return {
      entries: STATE.entries,
      tasks: STATE.tasks,
      agenda: STATE.agenda,
      tags: STATE.tags,
      projects: STATE.projects,
      subjectsByTag: STATE.subjectsByTag,
      deleted: STATE.deleted,
      settings: STATE.settings,
      updatedAt: STATE.updatedAt || Date.now(),
    };
  }

  function loadGsiLib() {
    if (global.google && global.google.accounts && global.google.accounts.oauth2) {
      gsiReady = true;
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = function () {
        gsiReady = true;
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Google Sign-In"));
      };
      document.head.appendChild(s);
    });
  }

  async function loadCloudConfig() {
    var paths = [
      "cloud/config.json",
      "/cloud/config.json",
      "../cloud/config.json",
      "google.config.json",
      "/google.config.json",
    ];
    for (var i = 0; i < paths.length; i++) {
      try {
        var res = await fetch(paths[i], { cache: "no-store" });
        if (!res.ok) continue;
        var cfg = await res.json();
        var id = cfg && (cfg.googleClientId || cfg.clientId);
        if (id && !String(id).includes("SEU-CLIENT-ID")) {
          googleClientId = String(id).trim();
          return googleClientId;
        }
      } catch (e) {}
    }
    return null;
  }

  function readStoredToken() {
    try {
      var raw = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.access_token || !data.expires_at) return null;
      if (data.expires_at <= Date.now() + 60000) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function storeToken(tokenResponse) {
    var expiresIn = Number(tokenResponse.expires_in || 3600);
    var payload = {
      access_token: tokenResponse.access_token,
      expires_at: Date.now() + expiresIn * 1000,
    };
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
    if (googleClientId) localStorage.setItem(CLIENT_ID_STORAGE_KEY, googleClientId);
    accessToken = payload.access_token;
    tokenExpiresAt = payload.expires_at;
  }

  function clearTokenIfClientChanged() {
    if (!googleClientId) return;
    try {
      var prev = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
      if (prev && prev !== googleClientId) {
        clearStoredSession();
        if (deps && deps.showToast) {
          deps.showToast("Conta Google resetada (novo Client ID). Entre de novo.");
        }
      }
    } catch (e) {}
  }

  function clearStoredSession() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(FILE_ID_STORAGE_KEY);
    accessToken = null;
    tokenExpiresAt = 0;
    sessionUser = null;
    gcalCache = { from: "", to: "", events: [], fetchedAt: 0 };
    gcalFetchPromise = null;
  }

  function isGcalEnabled() {
    if (!sessionUser || !accessToken) return false;
    var STATE = deps && deps.getState ? deps.getState() : null;
    var settings = STATE && STATE.settings;
    return !settings || settings.showGcal !== false;
  }

  function mapGcalEvent(ev) {
    var allDay = !!(ev.start && ev.start.date);
    if (allDay) {
      var from = ev.start.date;
      var toEx = ev.end && ev.end.date ? ev.end.date : from;
      var endDate = from;
      try {
        var d = new Date(toEx + "T00:00:00");
        d.setDate(d.getDate() - 1);
        endDate =
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0");
        if (endDate < from) endDate = from;
      } catch (e) {
        endDate = from;
      }
      return {
        id: "gcal:" + ev.id,
        date: from,
        endDate: endDate,
        time: "",
        endTime: "",
        allDay: true,
        title: ev.summary || "(sem título)",
        source: "gcal",
        calendarEventId: ev.id,
      };
    }
    var startDt = new Date(ev.start.dateTime);
    var endDt = new Date(ev.end.dateTime);
    function isoLocal(dt) {
      return (
        dt.getFullYear() +
        "-" +
        String(dt.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(dt.getDate()).padStart(2, "0")
      );
    }
    function timeLocal(dt) {
      return (
        String(dt.getHours()).padStart(2, "0") +
        ":" +
        String(dt.getMinutes()).padStart(2, "0")
      );
    }
    return {
      id: "gcal:" + ev.id,
      date: isoLocal(startDt),
      endDate: isoLocal(endDt),
      time: timeLocal(startDt),
      endTime: timeLocal(endDt),
      allDay: false,
      title: ev.summary || "(sem título)",
      source: "gcal",
      calendarEventId: ev.id,
    };
  }

  async function fetchGcalEvents(fromIso, toIso) {
    if (!accessToken || !isGcalEnabled()) {
      gcalCache = { from: fromIso, to: toIso, events: [], fetchedAt: Date.now() };
      return [];
    }
    var now = Date.now();
    if (
      gcalCache.from === fromIso &&
      gcalCache.to === toIso &&
      now - gcalCache.fetchedAt < GCAL_CACHE_TTL_MS
    ) {
      return gcalCache.events;
    }
    if (gcalFetchPromise) return gcalFetchPromise;
    gcalFetchPromise = (async function () {
      try {
        var timeMin = fromIso + "T00:00:00Z";
        var timeMax = toIso + "T23:59:59Z";
        var url =
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
          "singleEvents=true&orderBy=startTime&maxResults=250&timeMin=" +
          encodeURIComponent(timeMin) +
          "&timeMax=" +
          encodeURIComponent(timeMax);
        var res = await fetch(url, {
          headers: { Authorization: "Bearer " + accessToken },
        });
        if (res.status === 401 || res.status === 403) {
          gcalCache = { from: fromIso, to: toIso, events: [], fetchedAt: now };
          return [];
        }
        if (!res.ok) throw new Error("Erro ao ler Google Agenda.");
        var data = await res.json();
        var events = (data.items || [])
          .filter(function (ev) {
            return ev.status !== "cancelled";
          })
          .map(mapGcalEvent);
        gcalCache = { from: fromIso, to: toIso, events: events, fetchedAt: Date.now() };
        return events;
      } finally {
        gcalFetchPromise = null;
      }
    })();
    return gcalFetchPromise;
  }

  function getGcalEvents() {
    return gcalCache.events || [];
  }

  function invalidateGcalCache() {
    gcalCache.fetchedAt = 0;
  }

  function setGcalEnabled(on) {
    var STATE = deps.getState();
    if (!STATE.settings) STATE.settings = {};
    STATE.settings.showGcal = !!on;
    invalidateGcalCache();
    deps.persist();
    if (on && accessToken) {
      fetchGcalEvents(gcalCache.from || toIso(new Date()), gcalCache.to || toIso(new Date())).then(function () {
        deps.render();
      });
    } else {
      deps.render();
    }
  }

  function toIso(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  async function fetchUserInfo(token) {
    var res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("Não foi possível ler sua conta Google.");
    return res.json();
  }

  async function applyAccessToken(tokenResponse) {
    storeToken(tokenResponse);
    try {
      var info = await fetchUserInfo(accessToken);
      sessionUser = { email: info.email, name: info.name, picture: info.picture };
    } catch (e) {
      sessionUser = { email: "Conta Google", name: "Google", picture: null };
    }
    await pullCloud();
  }

  function ensureTokenClient() {
    if (!googleClientId) return null;
    if (tokenClient) return tokenClient;
    tokenClient = global.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: OAUTH_SCOPES,
      callback: function (response) {
        if (response.error) {
          deps.showToast(response.error_description || response.error);
          deps.render();
          return;
        }
    applyAccessToken(response)
          .then(function () {
            invalidateGcalCache();
            if (deps.onGoogleConnected) deps.onGoogleConnected();
            deps.showToast("Conta conectada. Backup no Google Drive + Agenda.");
            deps.render();
          })
          .catch(function (e) {
            clearStoredSession();
            deps.showToast(e.message || "Erro ao conectar.");
            deps.render();
          });
      },
    });
    return tokenClient;
  }

  async function refreshCloudSession() {
    if (!googleClientId) return null;
    var stored = readStoredToken();
    if (!stored) {
      sessionUser = null;
      accessToken = null;
      return null;
    }
    accessToken = stored.access_token;
    tokenExpiresAt = stored.expires_at;
    try {
      sessionUser = await fetchUserInfo(accessToken);
      sessionUser = { email: sessionUser.email, name: sessionUser.name, picture: sessionUser.picture };
      return sessionUser;
    } catch (e) {
      clearStoredSession();
      return null;
    }
  }

  function getStoredFileId() {
    try {
      return localStorage.getItem(FILE_ID_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredFileId(id) {
    try {
      if (id) localStorage.setItem(FILE_ID_STORAGE_KEY, id);
      else localStorage.removeItem(FILE_ID_STORAGE_KEY);
    } catch (e) {}
  }

  async function findDriveFile() {
    var q = "name='" + DRIVE_FILE_NAME.replace(/'/g, "\\'") + "' and trashed=false";
    var url =
      "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=" +
      encodeURIComponent(q) +
      "&fields=files(id,name,modifiedTime)";
    var res = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
    if (!res.ok) throw new Error("Erro ao ler o Drive.");
    var data = await res.json();
    var files = data.files || [];
    return files.length ? files[0] : null;
  }

  async function createDriveFile(payload) {
    var boundary = "focusly_" + Date.now();
    var meta = JSON.stringify({ name: DRIVE_FILE_NAME, parents: ["appDataFolder"] });
    var body =
      "--" +
      boundary +
      "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      meta +
      "\r\n--" +
      boundary +
      "\r\nContent-Type: application/json\r\n\r\n" +
      JSON.stringify(payload) +
      "\r\n--" +
      boundary +
      "--";
    var res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "multipart/related; boundary=" + boundary,
      },
      body: body,
    });
    if (!res.ok) throw new Error("Erro ao criar backup no Drive.");
    var data = await res.json();
    setStoredFileId(data.id);
    return data.id;
  }

  async function updateDriveFile(fileId, payload) {
    var res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(fileId) + "?uploadType=media",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) throw new Error("Erro ao salvar no Drive.");
  }

  async function pullCloud() {
    if (!accessToken) return;
    var file = await findDriveFile();
    if (file && file.id) setStoredFileId(file.id);
    var local = deps.getState();
    var localN = diaryItemCount(local);
    if (!file || !file.id) {
      if (localN > 0) await pushCloud(true);
      return;
    }
    var remote = await downloadRemoteFile(file.id);
    if (!remote || !Array.isArray(remote.entries)) {
      if (localN > 0) await pushCloud(true);
      return;
    }
    var remoteN = diaryItemCount(remote);
    if (localN > 0 && remoteN === 0) {
      await pushCloud(true);
      cloudLastSyncAt = Date.now();
      if (deps.render) deps.render();
      return;
    }
    if (localN > remoteN && (local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      await pushCloud(true);
      cloudLastSyncAt = Date.now();
      if (deps.render) deps.render();
      return;
    }
    deps.mergeDiary(remote);
    cloudLastSyncAt = Date.now();
    if (deps.getAccountOpen && deps.getAccountOpen()) deps.render();
    else if (deps.render) deps.render();
  }

  async function pushCloud(force) {
    if (!accessToken) return;
    var payload = cloudPayload();
    var localN = diaryItemCount(payload);
    var fileId = getStoredFileId();
    if (localN === 0) {
      var existing = fileId ? { id: fileId } : await findDriveFile();
      if (existing && existing.id) {
        var remote = await downloadRemoteFile(existing.id);
        if (remote && diaryItemCount(remote) > 0) return;
      }
    }
    if (fileId) {
      try {
        await updateDriveFile(fileId, payload);
      } catch (e) {
        fileId = null;
        setStoredFileId(null);
      }
    }
    if (!fileId) {
      var existing = await findDriveFile();
      if (existing && existing.id) {
        fileId = existing.id;
        setStoredFileId(fileId);
        await updateDriveFile(fileId, payload);
      } else {
        await createDriveFile(payload);
      }
    }
    cloudLastSyncAt = Date.now();
    if (deps.onCloudSynced) deps.onCloudSynced();
    if (!force && deps.getAccountOpen()) deps.render();
  }

  function scheduleCloudPush() {
    if (!accessToken || !cloudReady) return;
    if (cloudPushTimer) clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(function () {
      cloudPushTimer = null;
      pushCloud(false).catch(function () {});
    }, CLOUD_PUSH_DEBOUNCE_MS);
  }

  async function initCloud() {
    googleClientId = await loadCloudConfig();
    if (!googleClientId) return;
    clearTokenIfClientChanged();
    cloudReady = true;
    try {
      await loadGsiLib();
      await refreshCloudSession();
      if (sessionUser) await pullCloud();
    } catch (e) {}
  }

  async function signInWithGoogle() {
    if (!googleClientId) {
      deps.showToast("Google Drive não configurado.");
      return;
    }
    try {
      await loadGsiLib();
      var client = ensureTokenClient();
      if (!client) {
        deps.showToast("Google Drive não configurado.");
        return;
      }
      client.requestAccessToken({ prompt: sessionUser ? "" : "consent" });
    } catch (e) {
      deps.showToast("Não foi possível abrir o login Google.");
    }
  }

  async function signOutCloud() {
    if (accessToken) {
      try {
        await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(accessToken), {
          method: "POST",
        });
      } catch (e) {}
    }
    clearStoredSession();
    deps.showToast("Desconectado.");
    deps.render();
  }

  async function syncCloudNow() {
    if (!accessToken) {
      deps.showToast("Entre com Google primeiro.");
      return;
    }
    try {
      await pullCloud();
      await pushCloud(true);
      deps.showToast("Sincronizado com o Google Drive.");
      deps.render();
    } catch (e) {
      deps.showToast("Erro ao sincronizar: " + (e.message || "tente de novo"));
    }
  }

  function renderCloudBlock() {
    if (!cloudReady) {
      return (
        '<div class="cloud-block"><p class="hint">Sync PC + iPad: configure o Client ID do Google em <code>cloud/config.json</code>. Veja <code>cloud/SETUP.md</code>.</p></div>'
      );
    }
    if (sessionUser) {
      var label = sessionUser.email ? sessionUser.email.split("@")[0] : "Conta";
      var syncHint = cloudLastSyncAt
        ? "Último sync: " + (cloudLastSyncAt > Date.now() - 60000 ? "agora" : "há pouco") + "."
        : "Sync automático ao salvar.";
      var STATE = deps.getState();
      var gcalOn = !STATE.settings || STATE.settings.showGcal !== false;
      return (
        '<div class="cloud-block">' +
        '<p class="hint"><strong>Google Drive:</strong> ' + deps.escapeHtml(sessionUser.email || label) + "</p>" +
        '<p class="hint">' +
        deps.escapeHtml(syncHint) +
        "</p>" +
        '<label class="check-line cloud-gcal-toggle"><input type="checkbox"' +
        (gcalOn ? " checked" : "") +
        ' onchange="MyFocuslyCloud.setGcalEnabled(this.checked)"><span>Mostrar Google Agenda no calendário</span></label>' +
        '<p class="hint">Eventos do Google aparecem em azul. Não entram no backup.</p>' +
        '<div class="field-actions">' +
        '<button type="button" class="btn btn-ghost" onclick="MyFocuslyCloud.syncCloudNow()">Sincronizar agora</button>' +
        '<button type="button" class="btn btn-ghost" onclick="MyFocuslyCloud.signOutCloud()">Sair</button></div></div>'
      );
    }
    return (
      '<div class="cloud-block">' +
      '<p class="hint">Entre com Google para usar o app. Os dados ficam <strong>só no seu Drive</strong>.</p>' +
      '<button type="button" class="btn-google" onclick="MyFocuslyCloud.signInWithGoogle()">Entrar com Google</button></div>'
    );
  }

  function backupStatusOk(backupIsStale) {
    if (sessionUser && cloudLastSyncAt) return true;
    return !backupIsStale;
  }

  global.MyFocuslyCloud = {
    configure: function (api) {
      deps = api;
    },
    isCloudOnly: function () {
      return CLOUD_ONLY;
    },
    initCloud: initCloud,
    scheduleCloudPush: scheduleCloudPush,
    renderCloudBlock: renderCloudBlock,
    backupStatusOk: backupStatusOk,
    getSessionUser: function () {
      return sessionUser;
    },
    getCloudLastSyncAt: function () {
      return cloudLastSyncAt;
    },
    pushCloud: pushCloud,
    signInWithGoogle: signInWithGoogle,
    signOutCloud: signOutCloud,
    syncCloudNow: syncCloudNow,
    isGcalEnabled: isGcalEnabled,
    fetchGcalEvents: fetchGcalEvents,
    getGcalEvents: getGcalEvents,
    invalidateGcalCache: invalidateGcalCache,
    setGcalEnabled: setGcalEnabled,
  };
})(window);
