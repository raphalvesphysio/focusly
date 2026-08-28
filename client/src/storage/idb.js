import { IDB_NAME, IDB_STORE, IDB_STATE_KEY, IDB_FOLDER_KEY } from "./constants.js";

function openDb() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = function () {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = function () {
      resolve();
    };
    tx.onerror = function () {
      reject(tx.error);
    };
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = function () {
      resolve();
    };
    tx.onerror = function () {
      reject(tx.error);
    };
  });
}

export async function loadCachedState() {
  try {
    return await idbGet(IDB_STATE_KEY);
  } catch (e) {
    return null;
  }
}

export async function saveCachedState(state) {
  try {
    await idbSet(IDB_STATE_KEY, state);
  } catch (e) {}
}

export async function loadFolderHandle() {
  try {
    return await idbGet(IDB_FOLDER_KEY);
  } catch (e) {
    return null;
  }
}

export async function saveFolderHandle(handle) {
  await idbSet(IDB_FOLDER_KEY, handle);
}

export async function clearFolderHandle() {
  await idbDelete(IDB_FOLDER_KEY);
}
