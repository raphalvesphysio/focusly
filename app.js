(() => {
  const STORAGE_KEY = "conta-estudo-v1";
  const CLOUD_KEY = "conta-estudo-cloud";
  const SQL = `create table if not exists public.study_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.study_data enable row level security;

drop policy if exists "users_own_study_data" on public.study_data;
create policy "users_own_study_data"
  on public.study_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`;

  const DAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MONTHS_LONG = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];

  const els = {
    accountChip: document.getElementById("accountChip"),
    accountLabel: document.getElementById("accountLabel"),
    syncDot: document.getElementById("syncDot"),
    timerDisplay: document.getElementById("timerDisplay"),
    timerStatus: document.getElementById("timerStatus"),
    subjectInput: document.getElementById("subjectInput"),
    toggleBtn: document.getElementById("toggleBtn"),
    stopBtn: document.getElementById("stopBtn"),
    addTimeBtn: document.getElementById("addTimeBtn"),
    pomodoroToggle: document.getElementById("pomodoroToggle"),
    prevWeek: document.getElementById("prevWeek"),
    nextWeek: document.getElementById("nextWeek"),
    weekTitle: document.getElementById("weekTitle"),
    weekRange: document.getElementById("weekRange"),
    daysGrid: document.getElementById("daysGrid"),
    weekTotal: document.getElementById("weekTotal"),
    goalLabel: document.getElementById("goalLabel"),
    goalPct: document.getElementById("goalPct"),
    goalBar: document.getElementById("goalBar"),
    notesTitle: document.getElementById("notesTitle"),
    notesDate: document.getElementById("notesDate"),
    notesInput: document.getElementById("notesInput"),
    sessionList: document.getElementById("sessionList"),
    accountModal: document.getElementById("accountModal"),
    closeAccount: document.getElementById("closeAccount"),
    sbUrl: document.getElementById("sbUrl"),
    sbKey: document.getElementById("sbKey"),
    saveCloud: document.getElementById("saveCloud"),
    sqlText: document.getElementById("sqlText"),
    copySql: document.getElementById("copySql"),
    authEmail: document.getElementById("authEmail"),
    authPass: document.getElementById("authPass"),
    signInBtn: document.getElementById("signInBtn"),
    signUpBtn: document.getElementById("signUpBtn"),
    signOutBtn: document.getElementById("signOutBtn"),
    authStatus: document.getElementById("authStatus"),
    goalHours: document.getElementById("goalHours"),
    exportBtn: document.getElementById("exportBtn"),
    importFile: document.getElementById("importFile"),
    addTimeModal: document.getElementById("addTimeModal"),
    closeAddTime: document.getElementById("closeAddTime"),
    addHours: document.getElementById("addHours"),
    addMins: document.getElementById("addMins"),
    addNote: document.getElementById("addNote"),
    confirmAddTime: document.getElementById("confirmAddTime"),
    toast: document.getElementById("toast"),
  };

  let data = loadLocal();
  let weekStart = startOfWeek(new Date());
  let selectedDate = todayKey();
  let tickId = null;
  let lastNotesDay = null;
  let cloud = loadCloudConfig();
  let supabaseClient = null;
  let sessionUser = null;
  let saveTimer = null;
  let pomodoroFired = false;

  els.sqlText.textContent = SQL;

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekKeys(start) {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return dateKey(d);
    });
  }

  function formatHMS(total) {
    const s = Math.max(0, Math.floor(total));
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }

  function formatHuman(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h && m) return `${h}h ${m}min`;
    if (h) return `${h}h`;
    if (m) return `${m}min`;
    return s ? `${s}s` : "0min";
  }

  function emptyData() {
    return {
      version: 1,
      updatedAt: Date.now(),
      weeklyGoalMinutes: 600,
      subject: "",
      pomodoro: false,
      timer: { running: false, startedAt: null, accumulated: 0, lastTick: null },
      days: {},
    };
  }

  function ensureDay(key) {
    if (!data.days[key]) data.days[key] = { seconds: 0, notes: "", sessions: [] };
    return data.days[key];
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyData();
      return { ...emptyData(), ...JSON.parse(raw) };
    } catch {
      return emptyData();
    }
  }

  function persistLocal() {
    data.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function scheduleSave() {
    persistLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushCloud, 900);
  }

  function loadCloudConfig() {
    try {
      return JSON.parse(localStorage.getItem(CLOUD_KEY) || "null");
    } catch {
      return null;
    }
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      els.toast.hidden = true;
    }, 2400);
  }

  function liveSeconds() {
    const t = data.timer;
    if (!t.running || !t.lastTick) return t.accumulated || 0;
    return (t.accumulated || 0) + (Date.now() - t.lastTick) / 1000;
  }

  function applyElapsed() {
    const t = data.timer;
    if (!t.running || !t.lastTick) return;
    const now = Date.now();
    let cursor = t.lastTick;
    while (now - cursor >= 1000) {
      const from = new Date(cursor);
      const dayEnd = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1).getTime();
      const takeMs = Math.min(now, dayEnd) - cursor;
      const whole = Math.floor(takeMs / 1000);
      if (whole <= 0) break;
      ensureDay(dateKey(from)).seconds += whole;
      t.accumulated = (t.accumulated || 0) + whole;
      cursor += whole * 1000;
    }
    t.lastTick = cursor;
  }

  function startTimer() {
    applyElapsed();
    data.timer.running = true;
    data.timer.startedAt = data.timer.startedAt || Date.now();
    data.timer.lastTick = Date.now();
    pomodoroFired = false;
    scheduleSave();
    loop();
    render();
  }

  function pauseTimer() {
    applyElapsed();
    data.timer.running = false;
    scheduleSave();
    render();
  }

  function stopTimer() {
    applyElapsed();
    const seconds = data.timer.accumulated || 0;
    const key = todayKey();
    if (seconds >= 1) {
      ensureDay(key).sessions.push({
        id: uid(),
        seconds,
        subject: (data.subject || "").trim(),
        endedAt: Date.now(),
        kind: "timer",
      });
      selectedDate = key;
      weekStart = startOfWeek(new Date());
      lastNotesDay = null;
    }
    data.timer = { running: false, startedAt: null, accumulated: 0, lastTick: null };
    pomodoroFired = false;
    scheduleSave();
    render();
    if (seconds >= 1) toast("Sessão salva no caderno de hoje");
    else toast("Nada para salvar ainda");
  }

  function addManualTime(hours, minutes, note) {
    const seconds = Math.round(hours * 3600 + minutes * 60);
    if (seconds <= 0) return toast("Informe um tempo maior que zero");
    const day = ensureDay(selectedDate);
    day.seconds += seconds;
    day.sessions.push({
      id: uid(),
      seconds,
      subject: (note || data.subject || "").trim(),
      endedAt: Date.now(),
      kind: "manual",
    });
    scheduleSave();
    render();
    toast("Tempo lançado");
  }

  function loop() {
    clearInterval(tickId);
    let lastPersist = 0;
    tickId = setInterval(() => {
      if (!data.timer.running) {
        clearInterval(tickId);
        return;
      }
      applyElapsed();
      maybePomodoro();
      renderTimer();
      renderWeekTotals();
      if (Date.now() - lastPersist > 5000) {
        scheduleSave();
        lastPersist = Date.now();
      }
    }, 250);
  }

  function maybePomodoro() {
    if (!data.pomodoro || pomodoroFired) return;
    if (liveSeconds() >= 25 * 60) {
      pomodoroFired = true;
      toast("Bloco de 25 min concluído");
      if (Notification && Notification.permission === "granted") {
        new Notification("Conta Estudo", { body: "Bloco de 25 minutos concluído." });
      }
    }
  }

  function renderTimer() {
    els.timerDisplay.textContent = formatHMS(liveSeconds());
    els.toggleBtn.textContent = data.timer.running ? "Pausar" : data.timer.accumulated ? "Continuar" : "Começar";
    els.stopBtn.disabled = !data.timer.running && !data.timer.accumulated;
    els.timerStatus.textContent = data.timer.running
      ? "Estudando agora"
      : data.timer.accumulated
        ? "Pausado — o tempo já conta no dia"
        : "Pronto para começar";
    document.body.classList.toggle("is-studying", !!data.timer.running);
  }

  function renderWeek() {
    const keys = weekKeys(weekStart);
    const end = parseKey(keys[6]);
    const isCurrent = dateKey(weekStart) === dateKey(startOfWeek(new Date()));
    els.weekTitle.textContent = isCurrent ? "Esta semana" : "Semana";
    els.weekRange.textContent = `${weekStart.getDate()} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
    els.daysGrid.replaceChildren(
      ...keys.map((key, index) => {
        const d = parseKey(key);
        const seconds = displayedDaySeconds(key);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "day" + (key === selectedDate ? " active" : "") + (key === todayKey() ? " today" : "");
        btn.innerHTML = `<span class="name"></span><span class="date"></span><span class="time"></span><span class="barlet"><span></span></span>`;
        btn.querySelector(".name").textContent = DAYS[index];
        btn.querySelector(".date").textContent = String(d.getDate());
        btn.querySelector(".time").textContent = formatHuman(seconds);
        btn.addEventListener("click", () => {
          selectedDate = key;
          lastNotesDay = null;
          render();
        });
        return btn;
      })
    );
    renderWeekTotals();
  }

  function displayedDaySeconds(key) {
    let seconds = data.days[key]?.seconds || 0;
    if (data.timer.running && data.timer.lastTick && key === todayKey()) {
      seconds += (Date.now() - data.timer.lastTick) / 1000;
    }
    return seconds;
  }

  function weekSeconds() {
    return weekKeys(weekStart).reduce((sum, key) => sum + displayedDaySeconds(key), 0);
  }

  function renderWeekTotals() {
    const total = weekSeconds();
    const goalSec = (data.weeklyGoalMinutes || 600) * 60;
    const pct = Math.min(100, Math.round((total / goalSec) * 100));
    els.weekTotal.textContent = formatHuman(total);
    els.goalLabel.textContent = `Meta ${formatHuman(goalSec)}`;
    els.goalPct.textContent = `${pct}%`;
    els.goalBar.style.width = `${pct}%`;
    const keys = weekKeys(weekStart);
    const max = Math.max(...keys.map((key) => displayedDaySeconds(key)), 1);
    [...els.daysGrid.children].forEach((btn, i) => {
      const seconds = displayedDaySeconds(keys[i]);
      btn.querySelector(".time").textContent = formatHuman(seconds);
      btn.querySelector(".barlet span").style.width = `${Math.round((seconds / max) * 100)}%`;
    });
  }

  function renderNotes() {
    const d = parseKey(selectedDate);
    const weekday = DAYS[(d.getDay() + 6) % 7];
    els.notesDate.textContent = `${weekday}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
    const day = ensureDay(selectedDate);
    if (lastNotesDay !== selectedDate) {
      els.notesInput.value = day.notes || "";
      lastNotesDay = selectedDate;
    }
    if (!day.sessions.length) {
      els.sessionList.innerHTML = `<li class="empty">Nenhuma sessão neste dia.</li>`;
      return;
    }
    els.sessionList.replaceChildren(
      ...[...day.sessions].reverse().map((session) => {
        const li = document.createElement("li");
        const left = document.createElement("span");
        const right = document.createElement("span");
        const when = new Date(session.endedAt);
        left.textContent = session.subject || (session.kind === "manual" ? "Lançamento manual" : "Sessão");
        right.textContent = `${formatHuman(session.seconds)} · ${pad(when.getHours())}:${pad(when.getMinutes())}`;
        li.append(left, right);
        return li;
      })
    );
  }

  function renderAccount() {
    if (sessionUser) {
      els.accountLabel.textContent = sessionUser.email.split("@")[0];
      els.syncDot.classList.add("ok");
      els.signOutBtn.hidden = false;
      els.authStatus.textContent = `Conectado como ${sessionUser.email}`;
    } else if (cloud) {
      els.accountLabel.textContent = "Entrar";
      els.syncDot.classList.remove("ok");
      els.signOutBtn.hidden = true;
      els.authStatus.textContent = "Nuvem configurada. Entre para sincronizar.";
    } else {
      els.accountLabel.textContent = "Local";
      els.syncDot.classList.remove("ok");
      els.signOutBtn.hidden = true;
      els.authStatus.textContent = "";
    }
    if (cloud) {
      els.sbUrl.value = cloud.url;
      els.sbKey.value = cloud.key;
    }
    els.goalHours.value = String((data.weeklyGoalMinutes || 600) / 60);
    els.subjectInput.value = data.subject || "";
    els.pomodoroToggle.checked = !!data.pomodoro;
  }

  function render() {
    renderTimer();
    renderWeek();
    renderNotes();
    renderAccount();
  }

  async function loadSupabaseLib() {
    if (window.supabase) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Não foi possível carregar o Supabase"));
      document.head.appendChild(s);
    });
  }

  async function getClient() {
    if (!cloud) throw new Error("Configure a nuvem primeiro");
    await loadSupabaseLib();
    if (!supabaseClient) supabaseClient = window.supabase.createClient(cloud.url, cloud.key);
    return supabaseClient;
  }

  async function refreshUser() {
    if (!cloud) return;
    try {
      const client = await getClient();
      const { data: auth } = await client.auth.getUser();
      sessionUser = auth.user || null;
      if (sessionUser) await pullCloud();
    } catch (err) {
      els.authStatus.textContent = err.message;
    }
    renderAccount();
  }

  async function pullCloud() {
    const client = await getClient();
    const { data: row, error } = await client
      .from("study_data")
      .select("payload, updated_at")
      .eq("user_id", sessionUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      await pushCloud();
      return;
    }
    const remote = row.payload || {};
    const remoteAt = new Date(row.updated_at).getTime();
    if (remoteAt > (data.updatedAt || 0)) {
      const running = data.timer;
      data = { ...emptyData(), ...remote, timer: running.running ? running : remote.timer || running };
      persistLocal();
      lastNotesDay = null;
      toast("Dados da nuvem carregados");
    }
  }

  async function pushCloud() {
    if (!sessionUser || !cloud) return;
    try {
      const client = await getClient();
      const payload = { ...data, timer: { ...data.timer } };
      const { error } = await client.from("study_data").upsert({
        user_id: sessionUser.id,
        payload,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (err) {
      els.authStatus.textContent = err.message;
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conta-estudo-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        data = { ...emptyData(), ...parsed };
        persistLocal();
        lastNotesDay = null;
        render();
        scheduleSave();
        toast("Backup importado");
      } catch {
        toast("Arquivo inválido");
      }
    };
    reader.readAsText(file);
  }

  els.toggleBtn.addEventListener("click", () => {
    if (data.timer.running) pauseTimer();
    else startTimer();
  });
  els.stopBtn.addEventListener("click", stopTimer);
  els.addTimeBtn.addEventListener("click", () => {
    els.addTimeModal.hidden = false;
  });
  els.closeAddTime.addEventListener("click", () => {
    els.addTimeModal.hidden = true;
  });
  els.confirmAddTime.addEventListener("click", () => {
    addManualTime(Number(els.addHours.value || 0), Number(els.addMins.value || 0), els.addNote.value);
    els.addTimeModal.hidden = true;
  });
  els.subjectInput.addEventListener("input", () => {
    data.subject = els.subjectInput.value;
    scheduleSave();
  });
  els.pomodoroToggle.addEventListener("change", async () => {
    data.pomodoro = els.pomodoroToggle.checked;
    if (data.pomodoro && Notification && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    scheduleSave();
  });
  els.prevWeek.addEventListener("click", () => {
    weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7);
    selectedDate = dateKey(weekStart);
    lastNotesDay = null;
    render();
  });
  els.nextWeek.addEventListener("click", () => {
    weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
    selectedDate = dateKey(weekStart);
    lastNotesDay = null;
    render();
  });
  els.notesInput.addEventListener("input", () => {
    ensureDay(selectedDate).notes = els.notesInput.value;
    lastNotesDay = selectedDate;
    scheduleSave();
  });
  els.accountChip.addEventListener("click", () => {
    els.accountModal.hidden = false;
  });
  els.closeAccount.addEventListener("click", () => {
    els.accountModal.hidden = true;
  });
  els.saveCloud.addEventListener("click", () => {
    cloud = { url: els.sbUrl.value.trim().replace(/\/$/, ""), key: els.sbKey.value.trim() };
    if (!cloud.url || !cloud.key) return toast("Preencha URL e chave");
    localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud));
    supabaseClient = null;
    toast("Conexão guardada neste aparelho");
    refreshUser();
  });
  els.copySql.addEventListener("click", async () => {
    await navigator.clipboard.writeText(SQL);
    toast("SQL copiado");
  });
  els.signUpBtn.addEventListener("click", async () => {
    try {
      const client = await getClient();
      const { error } = await client.auth.signUp({
        email: els.authEmail.value.trim(),
        password: els.authPass.value,
      });
      if (error) throw error;
      els.authStatus.textContent = "Conta criada. Se pedir confirmação, veja o e-mail; senão, entre agora.";
      toast("Conta criada");
    } catch (err) {
      els.authStatus.textContent = err.message;
    }
  });
  els.signInBtn.addEventListener("click", async () => {
    try {
      const client = await getClient();
      const { data: auth, error } = await client.auth.signInWithPassword({
        email: els.authEmail.value.trim(),
        password: els.authPass.value,
      });
      if (error) throw error;
      sessionUser = auth.user;
      await pullCloud();
      await pushCloud();
      els.accountModal.hidden = true;
      render();
      toast("Sincronizado");
    } catch (err) {
      els.authStatus.textContent = err.message;
    }
  });
  els.signOutBtn.addEventListener("click", async () => {
    try {
      const client = await getClient();
      await client.auth.signOut();
    } catch {}
    sessionUser = null;
    renderAccount();
    toast("Saiu da conta");
  });
  els.goalHours.addEventListener("change", () => {
    const hours = Number(els.goalHours.value);
    if (hours > 0) data.weeklyGoalMinutes = hours * 60;
    scheduleSave();
    renderWeekTotals();
  });
  els.exportBtn.addEventListener("click", exportJson);
  els.importFile.addEventListener("change", () => {
    const file = els.importFile.files[0];
    if (file) importJson(file);
    els.importFile.value = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      applyElapsed();
      persistLocal();
      render();
    }
  });
  window.addEventListener("beforeunload", persistLocal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      els.accountModal.hidden = true;
      els.addTimeModal.hidden = true;
    }
  });
  els.accountModal.addEventListener("click", (event) => {
    if (event.target === els.accountModal) els.accountModal.hidden = true;
  });
  els.addTimeModal.addEventListener("click", (event) => {
    if (event.target === els.addTimeModal) els.addTimeModal.hidden = true;
  });

  if (data.timer.running) loop();
  render();
  refreshUser();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
