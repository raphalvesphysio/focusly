export function emptyTimer() {
  return {
    sessionId: "",
    status: "finished",
    startedAt: 0,
    sessionStartedAt: 0,
    accumulated: 0,
    entryId: null,
    task: "",
    project: "",
    tags: "",
  };
}

export function getTimer(state) {
  return (state && state.runtime && state.runtime.timer) || null;
}

/** Segundos corridos: pausas em accumulated; trecho aberto usa startedAt → agora. */
export function liveTimerSeconds(timer, now) {
  if (!timer) return 0;
  now = now == null ? Date.now() : now;
  if (timer.status === "open" && timer.startedAt) {
    return (timer.accumulated || 0) + Math.floor((now - timer.startedAt) / 1000);
  }
  return timer.accumulated || 0;
}

export function isTimerOpen(timer) {
  return !!(timer && timer.status === "open");
}

export function formatHMS(total) {
  total = Math.max(0, Math.floor(total));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = function (n) {
    return n < 10 ? "0" + n : "" + n;
  };
  return h + ":" + pad(m) + ":" + pad(s);
}

export function mergeRuntime(local, remote) {
  const lt = local && local.runtime && local.runtime.timer;
  const rt = remote && remote.runtime && remote.runtime.timer;
  if (!lt && !rt) return undefined;
  if (!lt) return { timer: rt };
  if (!rt) return { timer: lt };

  if (rt.status === "open" && lt.status !== "open") return { timer: rt };
  if (lt.status === "open" && rt.status !== "open") return { timer: lt };

  if (rt.status === "open" && lt.status === "open") {
    const rStart = rt.sessionStartedAt || rt.startedAt || 0;
    const lStart = lt.sessionStartedAt || lt.startedAt || 0;
    return { timer: rStart <= lStart ? rt : lt };
  }

  const rAt = rt.finishedAt || 0;
  const lAt = lt.finishedAt || 0;
  return { timer: rAt >= lAt ? rt : lt };
}

/** Ao reabrir: sessão aberta no backup continua; tempo = agora − início (+ pausas). */
export function syncTimerOnLoad(state) {
  const timer = getTimer(state);
  if (!isTimerOpen(timer) || !timer.startedAt) return state;

  state.settings = state.settings || {};
  state.settings.timerResumedAt = Date.now();
  state.settings.timerResumedSeconds = liveTimerSeconds(timer);
  return state;
}

export function newSessionId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
