// Persistance : préférences et progression dans localStorage (petit JSON
// validé + copie de secours), fichiers volumineux (images, modèles) dans
// IndexedDB sous forme de Blob — jamais en base64 dans localStorage.
import { defaultSave, migrateLegacy, validateSave } from './save.js';

const KEY = 'mnnrow.save.v1';
const BACKUP = 'mnnrow.save.backup';

function safeStorage() {
  try {
    const t = '__mnn_test';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    const mem = new Map();
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
}

export class Storage {
  constructor() {
    this.ls = safeStorage();
    this.data = defaultSave();
    this.warnings = [];
    this.legacyImages = {};
  }

  load() {
    let raw = null;
    try {
      raw = this.ls.getItem(KEY);
      this.data = validateSave(raw ? JSON.parse(raw) : null);
    } catch {
      this.warnings.push('Sauvegarde corrompue : restauration de la copie de secours.');
      try {
        this.data = validateSave(JSON.parse(this.ls.getItem(BACKUP) || 'null'));
      } catch {
        this.data = defaultSave();
      }
    }
    if (!raw) {
      const { notes, images } = migrateLegacy(this.ls, this.data);
      if (notes.length) this.warnings.push(`Données du prototype importées : ${notes.join(', ')}.`);
      this.legacyImages = images;
    }
    return this.data;
  }

  save() {
    try {
      const json = JSON.stringify(this.data);
      const prev = this.ls.getItem(KEY);
      if (prev) this.ls.setItem(BACKUP, prev);
      this.ls.setItem(KEY, json);
      return true;
    } catch {
      return false;
    }
  }

  reset() {
    this.data = defaultSave();
    this.save();
  }
}

// --- IndexedDB (Blobs) ----------------------------------------------------------
const DB_NAME = 'mnnrow-assets';
const STORE = 'files';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponible'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction annulée'));
  }));
}

export const AssetDB = {
  put(id, record) {
    return tx('readwrite', (s) => s.put(record, id));
  },
  get(id) {
    return tx('readonly', (s) => s.get(id));
  },
  delete(id) {
    return tx('readwrite', (s) => s.delete(id));
  },
  clear() {
    return tx('readwrite', (s) => s.clear());
  },
};
