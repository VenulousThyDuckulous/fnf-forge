// IndexedDB persistence. Binary assets live in IndexedDB; project JSON index
// is mirrored to localStorage so projects survive refreshes and scale.

import { base64ToArrayBuffer, arrayBufferToBase64 } from '../utils/helpers';
import type { ProjectFile } from '../types';

const DB = 'fnf-mod-forge-db';
const STORE_FILES = 'files';
const STORE_PROJECTS = 'projects';

export interface PersistedProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: Record<string, { kind: 'text' | 'binary'; text?: string; b64?: string; mime?: string; size: number; updatedAt: number }>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(store: string, key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const rq = tx.objectStore(store).get(key);
    rq.onsuccess = () => { db.close(); resolve(rq.result); };
    rq.onerror = () => reject(rq.error);
  });
}

async function idbDel(store: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

const LS_KEY = 'fnfmf-projects-v1';

export function listLocalProjects(): PersistedProject[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PersistedProject[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeLocalIndex(projects: PersistedProject[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(projects)); } catch { /* quota: keep going, IDB has data */ }
}

export async function persistProject(p: PersistedProject): Promise<void> {
  const all = listLocalProjects().filter(x => x.id !== p.id);
  all.unshift(p);
  writeLocalIndex(all);
  try { await idbSet(STORE_PROJECTS, p.id, p); } catch { /* ignore */ }
}

export async function deletePersistedProject(id: string): Promise<void> {
  writeLocalIndex(listLocalProjects().filter(x => x.id !== id));
  try { await idbDel(STORE_PROJECTS, id); } catch { /* ignore */ }
}

export async function loadPersistedProject(id: string): Promise<PersistedProject | null> {
  try {
    const fromIdb = (await idbGet(STORE_PROJECTS, id)) as PersistedProject | undefined;
    if (fromIdb) return fromIdb;
  } catch { /* fall through */ }
  return listLocalProjects().find(x => x.id === id) ?? null;
}

/** Store one binary blob in IDB (keyed per project+path) and return base64 for LS mirror. */
export async function storeBinary(projectId: string, path: string, buf: ArrayBuffer): Promise<string> {
  const b64 = arrayBufferToBase64(buf);
  try { await idbSet(STORE_FILES, `${projectId}::${path}`, b64); } catch { /* ignore */ }
  return b64;
}

export async function readBinary(projectId: string, path: string, fallbackB64?: string): Promise<ArrayBuffer | null> {
  try {
    const hit = (await idbGet(STORE_FILES, `${projectId}::${path}`)) as string | undefined;
    if (typeof hit === 'string' && hit.length) return base64ToArrayBuffer(hit);
  } catch { /* ignore */ }
  if (fallbackB64) {
    try { return base64ToArrayBuffer(fallbackB64); } catch { return null; }
  }
  return null;
}

/** Hydrate persisted files into live ProjectFile objects. */
export async function hydrateFiles(projectId: string, files: PersistedProject['files']): Promise<Record<string, ProjectFile>> {
  const out: Record<string, ProjectFile> = {};
  for (const [path, f] of Object.entries(files)) {
    if (f.kind === 'text') {
      out[path] = { path, kind: 'text', text: f.text ?? '', size: f.size, updatedAt: f.updatedAt, mime: f.mime };
    } else {
      const buf = await readBinary(projectId, path, f.b64);
      out[path] = { path, kind: 'binary', data: buf, size: f.size, updatedAt: f.updatedAt, mime: f.mime };
    }
  }
  return out;
}

export function dehydrateFiles(files: Record<string, ProjectFile>, b64cache: Record<string, string>): PersistedProject['files'] {
  const out: PersistedProject['files'] = {};
  for (const [path, f] of Object.entries(files)) {
    if (f.kind === 'text') {
      out[path] = { kind: 'text', text: f.text ?? '', size: f.size, updatedAt: f.updatedAt, mime: f.mime };
    } else {
      let b64 = b64cache[path];
      if (!b64 && f.data) {
        try { b64 = arrayBufferToBase64(f.data); b64cache[path] = b64; } catch { b64 = ''; }
      }
      out[path] = { kind: 'binary', b64: b64 ?? '', size: f.size, updatedAt: f.updatedAt, mime: f.mime };
    }
  }
  return out;
}
