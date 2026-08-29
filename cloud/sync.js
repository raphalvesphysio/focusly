/* MyFocusly — sync Supabase (branch personal / multiplataforma) */
(function (global) {
  "use strict";

  var CLOUD_TABLE = "study_data";
  var CLOUD_PUSH_DEBOUNCE_MS = 15000;
  var deps = null;
  var cloudConfig = null;
  var supabaseClient = null;
  var sessionUser = null;
  var cloudReady = false;
  var cloudLastSyncAt = 0;
  var cloudPushTimer = null;

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

  function loadSupabaseLib() {
    if (global.supabase) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("Supabase"));
      };
      document.head.appendChild(s);
    });
  }

  async function loadCloudConfig() {
    var paths = [
      "cloud/config.json",
      "/cloud/config.json",
      "supabase.config.json",
      "/supabase.config.json",
      "../supabase.config.json",
    ];
    for (var i = 0; i < paths.length; i++) {
      try {
        var res = await fetch(paths[i], { cache: "no-store" });
        if (!res.ok) continue;
        var cfg = await res.json();
        if (cfg && cfg.url && cfg.anonKey && !String(cfg.url).includes("SEU-PROJETO")) {
          cloudConfig = { url: String(cfg.url).trim(), anonKey: String(cfg.anonKey).trim() };
          return cloudConfig;
        }
      } catch (e) {}
    }
    return null;
  }

  async function getSupabaseClient() {
    if (!cloudConfig) return null;
    await loadSupabaseLib();
    if (!supabaseClient) supabaseClient = global.supabase.createClient(cloudConfig.url, cloudConfig.anonKey);
    return supabaseClient;
  }

  async function refreshCloudSession() {
    var client = await getSupabaseClient();
    if (!client) return null;
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    sessionUser = result.data.session && result.data.session.user ? result.data.session.user : null;
    return sessionUser;
  }

  async function pullCloud() {
    if (!sessionUser) return;
    var client = await getSupabaseClient();
    var result = await client
      .from(CLOUD_TABLE)
      .select("payload, updated_at")
      .eq("user_id", sessionUser.id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data || !result.data.payload) {
      await pushCloud(true);
      return;
    }
    deps.mergeDiary(result.data.payload);
    cloudLastSyncAt = Date.now();
    if (deps.getAccountOpen()) deps.render();
  }

  async function pushCloud(force) {
    if (!sessionUser) return;
    var client = await getSupabaseClient();
    var result = await client.from(CLOUD_TABLE).upsert({
      user_id: sessionUser.id,
      payload: cloudPayload(),
      updated_at: new Date().toISOString(),
    });
    if (result.error) throw result.error;
    cloudLastSyncAt = Date.now();
    if (!force && deps.getAccountOpen()) deps.render();
  }

  function scheduleCloudPush() {
    if (!sessionUser || !cloudReady) return;
    if (cloudPushTimer) clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(function () {
      cloudPushTimer = null;
      pushCloud(false).catch(function () {});
    }, CLOUD_PUSH_DEBOUNCE_MS);
  }

  async function initCloud() {
    cloudConfig = await loadCloudConfig();
    if (!cloudConfig) return;
    cloudReady = true;
    try {
      await refreshCloudSession();
      if (sessionUser) await pullCloud();
    } catch (e) {}
    var client = await getSupabaseClient();
    if (client) {
      client.auth.onAuthStateChange(function (event) {
        if (event === "SIGNED_IN") {
          refreshCloudSession()
            .then(function () {
              return pullCloud();
            })
            .then(function () {
              deps.showToast("Conta conectada. Sync na nuvem ativo.");
              deps.render();
            })
            .catch(function () {
              deps.render();
            });
        }
        if (event === "SIGNED_OUT") {
          sessionUser = null;
          deps.render();
        }
      });
    }
  }

  async function signInWithGoogle() {
    var client = await getSupabaseClient();
    if (!client) {
      deps.showToast("Nuvem não configurada.");
      return;
    }
    var redirectTo = location.origin + location.pathname;
    var result = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo },
    });
    if (result.error) deps.showToast(result.error.message);
  }

  async function signInWithEmail() {
    var client = await getSupabaseClient();
    if (!client) {
      deps.showToast("Nuvem não configurada.");
      return;
    }
    var input = document.getElementById("cloud-email");
    var email = input ? String(input.value || "").trim() : "";
    if (!email) {
      deps.showToast("Informe seu e-mail.");
      return;
    }
    var redirectTo = location.origin + location.pathname;
    var result = await client.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: redirectTo },
    });
    if (result.error) deps.showToast(result.error.message);
    else deps.showToast("Link enviado para " + email + ".");
  }

  async function signOutCloud() {
    var client = await getSupabaseClient();
    if (client) await client.auth.signOut();
    sessionUser = null;
    deps.showToast("Desconectado.");
    deps.render();
  }

  async function syncCloudNow() {
    if (!sessionUser) {
      deps.showToast("Entre na sua conta primeiro.");
      return;
    }
    try {
      await pullCloud();
      await pushCloud(true);
      deps.showToast("Sincronizado com a nuvem.");
      deps.render();
    } catch (e) {
      deps.showToast("Erro ao sincronizar: " + (e.message || "tente de novo"));
    }
  }

  function renderCloudBlock() {
    if (!cloudReady) {
      return (
        '<div class="cloud-block"><p class="hint">Sync na nuvem (PC + iPad): configure <code>cloud/config.json</code>. Veja <code>supabase/SETUP.md</code>.</p></div>'
      );
    }
    if (sessionUser) {
      var label = sessionUser.email ? sessionUser.email.split("@")[0] : "Conta";
      var syncHint = cloudLastSyncAt
        ? "Último sync: " + (cloudLastSyncAt > Date.now() - 60000 ? "agora" : "há pouco") + "."
        : "Sync automático ao salvar.";
      return (
        '<div class="cloud-block">' +
        '<p class="hint"><strong>Nuvem:</strong> ' + deps.escapeHtml(sessionUser.email || label) + "</p>" +
        '<p class="hint">' + deps.escapeHtml(syncHint) + " PC e iPad usam os mesmos dados.</p>" +
        '<div class="field-actions">' +
        '<button type="button" class="btn btn-ghost" onclick="MyFocuslyCloud.syncCloudNow()">Sincronizar agora</button>' +
        '<button type="button" class="btn btn-ghost" onclick="MyFocuslyCloud.signOutCloud()">Sair</button></div></div>'
      );
    }
    return (
      '<div class="cloud-block">' +
      '<p class="hint"><strong>Entrar</strong> para backup automático na nuvem (PC + iPad).</p>' +
      '<button type="button" class="btn-google" onclick="MyFocuslyCloud.signInWithGoogle()">Entrar com Google</button>' +
      '<div class="cloud-email-row">' +
      '<input type="email" id="cloud-email" placeholder="ou seu e-mail" autocomplete="email">' +
      '<button type="button" class="btn btn-ghost" onclick="MyFocuslyCloud.signInWithEmail()">Enviar link</button></div></div>'
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
    initCloud: initCloud,
    scheduleCloudPush: scheduleCloudPush,
    renderCloudBlock: renderCloudBlock,
    backupStatusOk: backupStatusOk,
    getSessionUser: function () {
      return sessionUser;
    },
    pushCloud: pushCloud,
    signInWithGoogle: signInWithGoogle,
    signInWithEmail: signInWithEmail,
    signOutCloud: signOutCloud,
    syncCloudNow: syncCloudNow,
  };
})(window);
