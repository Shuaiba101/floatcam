const DB_NAME = 'album-organizer-v1';
const DB_VERSION = 1;
const SESSION_KEY = 'active';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore('kv').put(value, key);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore('kv').delete(key);
  });
}

export async function saveSession(payload) {
  await idbSet(SESSION_KEY, payload);
}

export async function loadSession() {
  return idbGet(SESSION_KEY);
}

export async function clearSession() {
  await idbDelete(SESSION_KEY);
}

export async function ensureDirPermission(dirHandle) {
  if (!dirHandle) return false;
  let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') return true;
  if (perm === 'prompt') {
    perm = await dirHandle.requestPermission({ mode: 'readwrite' });
  }
  return perm === 'granted';
}

export async function relinkFolderHandles(dirHandle, items) {
  const byName = new Map(items.map((it) => [it.name, it]));
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    const item = byName.get(entry.name);
    if (item) item.handle = entry;
  }
}

/** @param {FileSystemDirectoryHandle} dirHandle */
export async function listImageFileEntries(dirHandle, isImageName) {
  const entries = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && isImageName(entry.name)) {
      entries.push(entry);
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return entries;
}