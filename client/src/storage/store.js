import {
  AUTO_BACKUP_DEADLINE_MS,
  AUTO_BACKUP_DEBOUNCE_MS,
  emptyState,
} from "./constants.js";
import { mergeState } from "./merge.js";
import {
  clearFolderHandle,
  loadCachedState,
  loadFolderHandle,
  saveCachedState,
  saveFolderHandle,
} from "./idb.js";
import {
  downloadState,
  ensureFolderPermission,
  FS_ACCESS_SUPPORTED,
  pickBackupFolder,
  readStateFromFile,
  readStateFromFolder,
  writeStateToFolder,
} from "./fs-access.js";
import {
  emptyTimer,
  getTimer,
  isTimerOpen,
  liveTimerSeconds,
  newSessionId,
  syncTimerOnLoad,
} from "./session.js";

let state = emptyState();
let folderHandle = null;
let debounceTimer = null;
let deadlineTimer = null;
let listeners = new Set();

function notify() {
  listeners.forEach(function (fn) {
    fn(state);
  });
}

function desktopBackup() {
  return window.focuslyDesktop && window.focuslyDesktop.backup;
}

function hasBackupTarget() {
  const d = desktopBackup();
  if (d && d.isAvailable && d.isAvailable()) {
    return !!(state.settings && state.settings.backupFolderName);
  }
  return !!(state.settings && state.settings.backupFolderName);
}

export function subscribe(fn) {
  listeners.add(fn);
  return function () {
    listeners.delete(fn);
  };
}

export function getState() {
  return state;
}

export function getTimerLiveSeconds() {
  return liveTimerSeconds(getTimer(state));
}

export function getTimerSession() {
  const timer = getTimer(state);
  if (!timer || timer.status === "finished") return null;
  return {
    timer,
    liveSeconds: liveTimerSeconds(timer),
    open: isTimerOpen(timer),
  };
}

async function readBackupState() {
  const d = desktopBackup();
  if (d && d.isAvailable && d.isAvailable()) {
    try {
      const config = await d.getConfig();
      if (config && config.folderName) {
        state.settings = state.settings || {};
        state.settings.backupFolderName = config.folderName;
      }
      return await d.read();
    } catch (e) {
      return null;
    }
  }
  if (FS_ACCESS_SUPPORTED) {
    let handle = folderHandle || (await loadFolderHandle());
    if (!handle) return null;
    const ok = await ensureFolderPermission(handle, false);
    if (!ok) return null;
    folderHandle = handle;
    try {
      return await readStateFromFolder(handle);
    } catch (e) {
      return null;
    }
  }
  return null;
}

export async function initStore() {
  const cached = await loadCachedState();
  if (cached && Array.isArray(cached.entries)) state = cached;

  const backup = await readBackupState();
  if (backup) {
    state = mergeState(state, backup);
    const backupTimer = getTimer(backup);
    const cachedTimer = getTimer(cached);
    if (isTimerOpen(backupTimer) && !isTimerOpen(cachedTimer)) {
      state.runtime = backup.runtime;
    }
  }

  state = syncTimerOnLoad(state);
  await saveCachedState(state);
  notify();
}

export async function saveStore(partial) {
  if (partial) {
    state = Object.assign({}, state, partial);
  }
  state.updatedAt = Date.now();
  await saveCachedState(state);
  scheduleAutoBackup();
  notify();
}

function scheduleAutoBackup() {
  if (!hasBackupTarget()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runAutoBackup, AUTO_BACKUP_DEBOUNCE_MS);
  if (!deadlineTimer) deadlineTimer = setTimeout(runAutoBackup, AUTO_BACKUP_DEADLINE_MS);
}

export async function flushAutoBackup() {
  if (isTimerOpen(getTimer(state))) {
    await writeBackupNow(false);
    return;
  }
  if (debounceTimer || deadlineTimer) await runAutoBackup();
}

async function runAutoBackup() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (deadlineTimer) {
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
  }
  if (!hasBackupTarget()) return;

  try {
    await writeBackupNow(false);
  } catch (e) {}
}

export async function chooseBackupFolder() {
  const d = desktopBackup();
  if (d && d.isAvailable && d.isAvailable()) {
    const config = await d.chooseFolder();
    if (!config) return null;
    state.settings = state.settings || {};
    state.settings.backupFolderName = config.folderName;
    state.settings.lastBackupAt = Date.now();
    await saveCachedState(state);
    notify();
    return config;
  }

  if (!FS_ACCESS_SUPPORTED) return null;
  const handle = await pickBackupFolder();
  if (!handle) return null;
  await saveFolderHandle(handle);
  folderHandle = handle;
  state.settings = state.settings || {};
  state.settings.backupFolderName = handle.name;
  state.settings.lastBackupAt = Date.now();
  await saveCachedState(state);
  await writeBackupNow(true);
  notify();
  return { folderName: handle.name };
}

export async function forgetBackupFolder() {
  const d = desktopBackup();
  if (d && d.isAvailable && d.isAvailable()) await d.forget();
  await clearFolderHandle();
  folderHandle = null;
  if (state.settings) delete state.settings.backupFolderName;
  await saveCachedState(state);
  notify();
}

export async function writeBackupNow(requestPermission) {
  state.updatedAt = Date.now();
  await saveCachedState(state);

  const d = desktopBackup();
  if (d && d.isAvailable && d.isAvailable()) {
    await d.write(state);
    state.settings = state.settings || {};
    state.settings.lastBackupAt = Date.now();
    await saveCachedState(state);
    notify();
    return { mode: "desktop" };
  }

  let handle = folderHandle;
  if (!handle && FS_ACCESS_SUPPORTED) handle = await loadFolderHandle();
  if (handle) {
    const ok = await ensureFolderPermission(handle, !!requestPermission);
    if (!ok) throw new Error("permission");
    folderHandle = handle;
    await writeStateToFolder(handle, state);
    state.settings = state.settings || {};
    state.settings.lastBackupAt = Date.now();
    await saveCachedState(state);
    notify();
    return { mode: "folder" };
  }

  downloadState(state);
  state.settings = state.settings || {};
  state.settings.lastBackupAt = Date.now();
  await saveCachedState(state);
  notify();
  return { mode: "download" };
}

export async function importBackupFile(file) {
  const remote = await readStateFromFile(file);
  if (!remote || !Array.isArray(remote.entries)) throw new Error("invalid");
  state = mergeState(state, remote);
  state = syncTimerOnLoad(state);
  state.updatedAt = Date.now();
  await saveCachedState(state);
  await writeBackupNow(true);
  notify();
  return state;
}

/** INÍCIO — grava sessão aberta no backup na hora (ex.: tarefa aberta 13:00). */
export async function startTimerSession(meta) {
  meta = meta || {};
  const now = Date.now();
  const prev = getTimer(state);
  const isNew = !prev || prev.status === "finished";
  const isResume = prev && prev.status === "paused";

  state.runtime = state.runtime || {};
  state.runtime.timer = {
    sessionId: isNew ? newSessionId() : prev.sessionId,
    status: "open",
    startedAt: now,
    sessionStartedAt: isNew ? now : prev.sessionStartedAt || prev.startedAt || now,
    accumulated: isResume ? prev.accumulated || 0 : isNew ? 0 : prev.accumulated || 0,
    entryId: meta.entryId != null ? meta.entryId : prev ? prev.entryId : null,
    task: meta.task != null ? meta.task : prev ? prev.task : "",
    project: meta.project != null ? meta.project : prev ? prev.project : "",
    tags: meta.tags != null ? meta.tags : prev ? prev.tags : "",
  };
  state.updatedAt = now;
  await saveCachedState(state);
  await writeBackupNow(false);
  notify();
  return state.runtime.timer;
}

/** Pausa — congela segundos até aqui; backup imediato. */
export async function pauseTimerSession() {
  const timer = getTimer(state);
  if (!timer || timer.status !== "open") return null;
  state.runtime.timer = Object.assign({}, timer, {
    status: "paused",
    accumulated: liveTimerSeconds(timer),
    startedAt: 0,
  });
  state.updatedAt = Date.now();
  await saveCachedState(state);
  await writeBackupNow(false);
  notify();
  return state.runtime.timer;
}

/** FIM — encerra sessão; sem retorno de FIM o backup mantém status open. */
export async function finishTimerSession() {
  const timer = getTimer(state);
  if (!timer || timer.status === "finished") return null;
  const seconds = liveTimerSeconds(timer);
  state.runtime.timer = Object.assign({}, timer, {
    status: "finished",
    accumulated: seconds,
    startedAt: 0,
    finishedAt: Date.now(),
  });
  state.updatedAt = Date.now();
  await saveCachedState(state);
  await writeBackupNow(false);
  notify();
  return { timer: state.runtime.timer, seconds };
}

export function backupStatus() {
  const name = state.settings && state.settings.backupFolderName;
  const last = state.settings && state.settings.lastBackupAt;
  return {
    folderName: name || "",
    lastBackupAt: last || 0,
    fsAccess: FS_ACCESS_SUPPORTED,
    desktop: !!(desktopBackup() && desktopBackup().isAvailable && desktopBackup().isAvailable()),
  };
}
