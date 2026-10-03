import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, ProjectFile, ViewId } from '../types';
import { normalizePath, uid } from '../utils/helpers';
import { dehydrateFiles, hydrateFiles, listLocalProjects, persistProject as persistToDb, deletePersistedProject, storeBinary, type PersistedProject } from '../storage/db';

export interface ProjectState {
  id: string;
  name: string;
  files: Record<string, ProjectFile>;
  updatedAt: number;
}

interface Toast { id: string; msg: string; kind: 'info' | 'error' | 'ok'; }

interface Store {
  project: ProjectState;
  projects: { id: string; name: string; updatedAt: number }[];
  view: ViewId;
  setView: (v: ViewId) => void;
  currentFile: string | null;
  setCurrentFile: (p: string | null) => void;
  dirty: boolean;
  saveStatus: string;
  errors: string[];
  toasts: Toast[];
  toast: (msg: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;
  settings: AppSettings;
  setSettings: (s: Partial<AppSettings>) => void;
  // file ops
  upsertText: (path: string, text: string, mime?: string) => void;
  upsertBinary: (path: string, data: ArrayBuffer, mime?: string) => Promise<void>;
  removePath: (path: string) => void;
  renamePath: (oldPath: string, newPath: string) => void;
  getFile: (path: string) => ProjectFile | undefined;
  fileUrl: (path: string) => string | null;
  // project ops
  newProject: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (name: string) => void;
  replaceAllFiles: (files: Record<string, ProjectFile>, name?: string) => void;
  saveNow: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Ctx = createContext<Store | null>(null);

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark', gridColor: '#2a2f45',
  laneColors: ['#c24bff', '#2ed3ff', '#3dff7a', '#ff4d5e'],
  defaultBpm: 150, defaultScroll: 1, autosave: true,
  aiEndpoint: '', aiKey: '', aiModel: 'gpt-4o-mini'
};

function blankProject(name: string): ProjectState {
  const id = uid('proj');
  const now = Date.now();
  const readme = `# ${name}\n\nFriday Night Funkin' Psych Engine mod.\n\n- Charts: data/<song>/<song>-hard.json\n- Characters: characters/<name>.json\n- Stages: stages/<name>.json\n- Weeks: weeks/week1.json\n`;
  return {
    id, name, updatedAt: now,
    files: {
      'README.md': { path: 'README.md', kind: 'text', text: readme, size: readme.length, updatedAt: now, mime: 'text/markdown' },
      'data/tutorial/tutorial-hard.json': {
        path: 'data/tutorial/tutorial-hard.json', kind: 'text',
        text: JSON.stringify({ song: { song: 'tutorial', bpm: 100, speed: 1, needsVoices: false, player1: 'bf', player2: 'dad', gf: 'gf', stage: 'stage', notes: [{ mustHitSection: true, lengthInSteps: 16, sectionNotes: [[0, 0, 0], [500, 1, 0], [1000, 2, 0], [1500, 3, 0]] }], events: [] } }, null, 2),
        size: 200, updatedAt: now, mime: 'application/json'
      },
      'characters/bf.json': {
        path: 'characters/bf.json', kind: 'text',
        text: JSON.stringify({ name: 'bf', icon: 'bf', x: 770, y: 450, scale: 1, flip_x: false, animations: [{ anim: 'idle', name: 'BF idle dance', fps: 24, loop: true }] }, null, 2),
        size: 100, updatedAt: now, mime: 'application/json'
      },
      'stages/stage.json': {
        path: 'stages/stage.json', kind: 'text',
        text: JSON.stringify({ name: 'stage', zoom: 0.9, boyfriend: [770, 450], dad: [100, 450], gf: [400, 300], layers: [] }, null, 2),
        size: 100, updatedAt: now, mime: 'application/json'
      },
      'weeks/week1.json': {
        path: 'weeks/week1.json', kind: 'text',
        text: JSON.stringify({ name: 'Week 1', songs: ['tutorial'], opponent: 'dad', menuChar: 'dad', background: 'stage', locked: false }, null, 2),
        size: 100, updatedAt: now, mime: 'application/json'
      }
    }
  };
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<ProjectState>(() => blankProject('My FNF Mod'));
  const [projects, setProjects] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [view, setViewState] = useState<ViewId>('dashboard');
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [errors, setErrors] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem('fnfmf-settings');
      if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
    } catch { /* ignore */ }
    return DEFAULT_SETTINGS;
  });
  const undoStack = useRef<Record<string, ProjectFile>[]>([]);
  const redoStack = useRef<Record<string, ProjectFile>[]>([]);
  const [tick, setTick] = useState(0);
  const b64cache = useRef<Record<string, string>>({});
  const urlCache = useRef<Record<string, string>>({});
  const saveTimer = useRef<number | null>(null);

  const report = useCallback((e: unknown, context: string) => {
    const msg = e instanceof Error ? e.message : String(e);
    setErrors(prev => [`${context}: ${msg}`, ...prev].slice(0, 8));
  }, []);

  const toast = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = uid('t');
    setToasts(prev => [...prev, { id, msg, kind }].slice(-4));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const pushUndo = useCallback((files: Record<string, ProjectFile>) => {
    undoStack.current.push(structuredCloneFiles(files));
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    setTick(t => t + 1);
  }, []);

  function structuredCloneFiles(files: Record<string, ProjectFile>): Record<string, ProjectFile> {
    const out: Record<string, ProjectFile> = {};
    for (const [k, f] of Object.entries(files)) out[k] = { ...f };
    return out;
  }

  const setView = useCallback((v: ViewId) => setViewState(v), []);

  const setSettings = useCallback((s: Partial<AppSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...s };
      try { localStorage.setItem('fnfmf-settings', JSON.stringify({ ...next, aiKey: next.aiKey })); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ---- file ops ----
  const upsertText = useCallback((path: string, text: string, mime?: string) => {
    const p = normalizePath(path);
    setProject(prev => {
      pushUndo(prev.files);
      return {
        ...prev, updatedAt: Date.now(),
        files: { ...prev.files, [p]: { path: p, kind: 'text', text, size: text.length, updatedAt: Date.now(), mime: mime ?? 'text/plain' } }
      };
    });
    setDirty(true); setSaveStatus('Unsaved changes');
  }, [pushUndo]);

  const upsertBinary = useCallback(async (path: string, data: ArrayBuffer, mime?: string) => {
    const p = normalizePath(path);
    try { b64cache.current[p] = ''; await storeBinary(project.id, p, data); } catch (e) { report(e, 'Binary store'); }
    setProject(prev => {
      pushUndo(prev.files);
      return { ...prev, updatedAt: Date.now(), files: { ...prev.files, [p]: { path: p, kind: 'binary', data, size: data.byteLength, updatedAt: Date.now(), mime: mime ?? 'application/octet-stream' } } };
    });
    setDirty(true); setSaveStatus('Unsaved changes');
  }, [project.id, pushUndo, report]);

  const removePath = useCallback((path: string) => {
    setProject(prev => {
      if (!prev.files[path]) return prev;
      pushUndo(prev.files);
      const next = { ...prev.files };
      delete next[path];
      return { ...prev, updatedAt: Date.now(), files: next };
    });
    setDirty(true); setSaveStatus('Unsaved changes');
  }, [pushUndo]);

  const renamePath = useCallback((oldPath: string, newPath: string) => {
    const np = normalizePath(newPath);
    setProject(prev => {
      const f = prev.files[oldPath];
      if (!f) return prev;
      pushUndo(prev.files);
      const next = { ...prev.files };
      delete next[oldPath];
      next[np] = { ...f, path: np, updatedAt: Date.now() };
      return { ...prev, updatedAt: Date.now(), files: next };
    });
    setDirty(true);
  }, [pushUndo]);

  const getFile = useCallback((path: string) => project.files[path], [project]);

  const fileUrl = useCallback((path: string): string | null => {
    const f = project.files[path];
    if (!f || f.kind !== 'binary' || !f.data) return null;
    if (!urlCache.current[path]) {
      urlCache.current[path] = URL.createObjectURL(new Blob([f.data], { type: f.mime || 'application/octet-stream' }));
    }
    return urlCache.current[path];
  }, [project.files]);

  const replaceAllFiles = useCallback((files: Record<string, ProjectFile>, name?: string) => {
    setProject(prev => {
      pushUndo(prev.files);
      return { ...prev, name: name ?? prev.name, updatedAt: Date.now(), files };
    });
    urlCache.current = {};
    b64cache.current = {};
    setDirty(true); setSaveStatus('Unsaved changes');
  }, [pushUndo]);

  // ---- undo/redo ----
  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setProject(p => {
      redoStack.current.push(structuredCloneFiles(p.files));
      return { ...p, files: prev, updatedAt: Date.now() };
    });
    setDirty(true); setTick(t => t + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setProject(p => {
      undoStack.current.push(structuredCloneFiles(p.files));
      return { ...p, files: next, updatedAt: Date.now() };
    });
    setDirty(true); setTick(t => t + 1);
  }, []);

  // ---- persistence ----
  const saveNow = useCallback(async () => {
    setSaveStatus('Saving…');
    try {
      const persisted: PersistedProject = {
        id: project.id, name: project.name,
        createdAt: project.updatedAt, updatedAt: Date.now(),
        files: dehydrateFiles(project.files, b64cache.current)
      };
      await persistToDb(persisted);
      setProjects(listLocalProjects().map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })));
      setDirty(false); setSaveStatus('Saved ✓');
    } catch (e) {
      report(e, 'Save failed');
      setSaveStatus('Save failed');
    }
  }, [project, report]);

  useEffect(() => {
    setProjects(listLocalProjects().map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })));
    // restore last-open project if present
    const last = localStorage.getItem('fnfmf-last');
    (async () => {
      if (last) {
        try {
          const { loadPersistedProject } = await import('../storage/db');
          const p = await loadPersistedProject(last);
          if (p) {
            const files = await hydrateFiles(p.id, p.files);
            setProject({ id: p.id, name: p.name, files, updatedAt: p.updatedAt });
            setSaveStatus('Saved ✓');
          }
        } catch { /* start blank */ }
      }
    })();
  }, []);

  useEffect(() => {
    try { localStorage.setItem('fnfmf-last', project.id); } catch { /* ignore */ }
  }, [project.id]);

  useEffect(() => {
    if (!settings.autosave || !dirty) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveNow(); }, 1500);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [dirty, settings.autosave, saveNow, project]);

  const newProject = useCallback(async (name: string) => {
    await saveNow().catch(() => undefined);
    const blank = blankProject(name || 'Untitled Mod');
    undoStack.current = []; redoStack.current = [];
    urlCache.current = {}; b64cache.current = {};
    setProject(blank);
    setDirty(true);
    await persistToDb({ id: blank.id, name: blank.name, createdAt: blank.updatedAt, updatedAt: blank.updatedAt, files: dehydrateFiles(blank.files, {}) }).catch(() => undefined);
    setProjects(listLocalProjects().map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })));
    setCurrentFile(null);
    setViewState('dashboard');
  }, [saveNow]);

  const openProject = useCallback(async (id: string) => {
    const { loadPersistedProject } = await import('../storage/db');
    const p = await loadPersistedProject(id);
    if (!p) throw new Error('Project not found in local storage.');
    const files = await hydrateFiles(p.id, p.files);
    undoStack.current = []; redoStack.current = [];
    urlCache.current = {}; b64cache.current = {};
    setProject({ id: p.id, name: p.name, files, updatedAt: p.updatedAt });
    setDirty(false); setSaveStatus('Saved ✓');
    setCurrentFile(null);
    setViewState('dashboard');
  }, []);

  const duplicateProject = useCallback(async (id: string) => {
    const { loadPersistedProject } = await import('../storage/db');
    const p = await loadPersistedProject(id);
    if (!p) throw new Error('Project not found.');
    const files = await hydrateFiles(p.id, p.files);
    const copy: PersistedProject = {
      id: uid('proj'), name: `${p.name} (copy)`,
      createdAt: Date.now(), updatedAt: Date.now(),
      files: dehydrateFiles(files as Record<string, ProjectFile>, {})
    };
    await persistToDb(copy);
    setProjects(listLocalProjects().map(x => ({ id: x.id, name: x.name, updatedAt: x.updatedAt })));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await deletePersistedProject(id);
    setProjects(listLocalProjects().map(x => ({ id: x.id, name: x.name, updatedAt: x.updatedAt })));
  }, []);

  const renameProject = useCallback((name: string) => {
    setProject(p => ({ ...p, name, updatedAt: Date.now() }));
    setDirty(true); setSaveStatus('Unsaved changes');
  }, []);

  const value = useMemo<Store>(() => ({
    project, projects, view, setView, currentFile, setCurrentFile,
    dirty, saveStatus, errors, toasts, toast, dismissToast,
    settings, setSettings,
    upsertText, upsertBinary, removePath, renamePath, getFile, fileUrl,
    newProject, openProject, duplicateProject, deleteProject, renameProject,
    replaceAllFiles, saveNow, undo, redo,
    canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0
  }), [project, projects, view, currentFile, dirty, saveStatus, errors, toasts, toast, dismissToast, settings, setSettings, upsertText, upsertBinary, removePath, renamePath, getFile, fileUrl, newProject, openProject, duplicateProject, deleteProject, renameProject, replaceAllFiles, saveNow, undo, redo, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside ProjectProvider');
  return s;
}
