import { BACKUP_FILENAME } from "./constants.js";

export const FS_ACCESS_SUPPORTED =
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

export async function ensureFolderPermission(handle, requestIfNeeded) {
  if (!handle) return false;
  const opts = { mode: "readwrite" };
  try {
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if (!requestIfNeeded) return false;
    return (await handle.requestPermission(opts)) === "granted";
  } catch (e) {
    return false;
  }
}

export async function writeStateToFolder(handle, state) {
  const fileHandle = await handle.getFileHandle(BACKUP_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(state, null, 2));
  await writable.close();
}

export async function readStateFromFolder(handle) {
  const fileHandle = await handle.getFileHandle(BACKUP_FILENAME);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

export async function pickBackupFolder() {
  if (!FS_ACCESS_SUPPORTED) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const ok = await ensureFolderPermission(handle, true);
    return ok ? handle : null;
  } catch (e) {
    return null;
  }
}

export function downloadState(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = BACKUP_FILENAME;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function readStateFromFile(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        resolve(JSON.parse(reader.result));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
