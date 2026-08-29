/* MyFocusly — sync Google Drive (branch personal / multiplataforma) */
(function (global) {
  "use strict";

  var DRIVE_FILE_NAME = "myfocusly-backup.json";
  var OAUTH_SCOPES =
    "https://www.googleapis.com/auth/drive.appdata openid email profile";
  var CLOUD_PUSH_DEBOUNCE_MS = 5000;
  var CLOUD_ONLY = true;
  var TOKEN_STORAGE_KEY = "myfocusly-google-token";
  var FILE_ID_STORAGE_KEY = "myfocusly-drive-file-id";

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
    accessToken = payload.access_token;
    tokenExpiresAt = payload.expires_at;
  }

  function clearStoredSession() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(FILE_ID_STORAGE_KEY);
    accessToken = null;
    tokenExpiresAt = 0;
    sessionUser = null;
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
            deps.showToast("Conta conectada. Backup no seu Google Drive.");
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
    if (!file || !file.id) {
      await pushCloud(true);
      return;
    }
    var metaRes = await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
        encodeURIComponent(file.id) +
        "?alt=media",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!metaRes.ok) throw new Error("Erro ao baixar backup do Drive.");
    var remote = await metaRes.json();
    if (!remote || !Array.isArray(remote.entries)) {
      await pushCloud(true);
      return;
    }
    deps.mergeDiary(remote);
    cloudLastSyncAt = Date.now();
    if (deps.getAccountOpen()) deps.render();
  }

  async function pushCloud(force) {
    if (!accessToken) return;
    var payload = cloudPayload();
    var fileId = getStoredFileId();
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
      return (
        '<div class="cloud-block">' +
        '<p class="hint"><strong>Google Drive:</strong> ' + deps.escapeHtml(sessionUser.email || label) + "</p>" +
        '<p class="hint">' +
        deps.escapeHtml(syncHint) +
        "</p>" +
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
  };
})(window);
