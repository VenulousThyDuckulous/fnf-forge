// Project file detection + ZIP import/export (JSZip). Compatible with the
// common Psych Engine layouts without assuming one exact tree.

import JSZip from 'jszip';
import type { ProjectFile, SongEntry, CharacterDef, StageDef, WeekDef, DialogueFile } from '../types';
import { normalizePath, baseOf, extOf, uid } from '../utils/helpers';

export const TEXT_EXTS = new Set(['json', 'txt', 'lua', 'xml', 'hx', 'hxp', 'md', 'cfg', 'frag', 'vert', 'frag', 'ts', 'js']);
export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
export const AUDIO_EXTS = new Set(['ogg', 'mp3', 'wav', 'flac', 'm4a', 'oga']);

export function mimeFor(path: string): string {
  const e = extOf(path);
  if (e === 'json') return 'application/json';
  if (e === 'lua') return 'text/x-lua';
  if (e === 'xml') return 'application/xml';
  if (e === 'ogg' || e === 'oga') return 'audio/ogg';
  if (e === 'mp3') return 'audio/mpeg';
  if (e === 'wav') return 'audio/wav';
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'sf2') return 'audio/x-soundfont';
  return 'application/octet-stream';
}

export async function filesFromZip(data: ArrayBuffer): Promise<Record<string, ProjectFile>> {
  const zip = await JSZip.loadAsync(data);
  const out: Record<string, ProjectFile> = {};
  const jobs: Promise<void>[] = [];
  zip.forEach((rel, entry) => {
    if (entry.dir) return;
    const path = normalizePath(rel).replace(/^mods\/[^/]+\//, '');
    if (path.startsWith('__MACOSX') || baseOf(path).startsWith('.')) return;
    jobs.push((async () => {
      const ext = extOf(path);
      if (TEXT_EXTS.has(ext)) {
        const text = await entry.async('string');
        out[path] = { path, kind: 'text', text, size: text.length, updatedAt: Date.now(), mime: mimeFor(path) };
      } else {
        const buf = await entry.async('arraybuffer');
        out[path] = { path, kind: 'binary', data: buf, size: buf.byteLength, updatedAt: Date.now(), mime: mimeFor(path) };
      }
    })());
  });
  await Promise.all(jobs);
  return out;
}

export async function filesFromFileList(list: FileList | File[]): Promise<Record<string, ProjectFile>> {
  const out: Record<string, ProjectFile> = {};
  const arr = Array.from(list);
  await Promise.all(arr.map(async (f) => {
    const rel = normalizePath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    const clean = rel.replace(/^mods\/[^/]+\//, '');
    const ext = extOf(clean);
    if (TEXT_EXTS.has(ext)) {
      const text = await f.text();
      out[clean] = { path: clean, kind: 'text', text, size: f.size, updatedAt: Date.now(), mime: f.type || mimeFor(clean) };
    } else {
      const buf = await f.arrayBuffer();
      out[clean] = { path: clean, kind: 'binary', data: buf, size: f.size, updatedAt: Date.now(), mime: f.type || mimeFor(clean) };
    }
  }));
  return out;
}

export async function zipFromFiles(files: Record<string, ProjectFile>, rootFolder: string): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(rootFolder || 'mod');
  if (!root) throw new Error('Could not create ZIP folder.');
  for (const f of Object.values(files)) {
    if (f.kind === 'text') root.file(f.path, f.text ?? '');
    else if (f.data) root.file(f.path, f.data);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function parseJsonFile(f: ProjectFile | undefined): Record<string, unknown> | null {
  if (!f || f.kind !== 'text') return null;
  try { return JSON.parse(f.text ?? 'null') as Record<string, unknown>; }
  catch { return null; }
}

function safeJsonName(path: string): string {
  const b = baseOf(path);
  return b.replace(/\.(json|lua|xml)$/i, '');
}

// ---- Discovery ----

export function discoverSongs(files: Record<string, ProjectFile>): SongEntry[] {
  const songs = new Map<string, SongEntry>();
  for (const path of Object.keys(files)) {
    const low = path.toLowerCase();
    // Charts: data/<song>/<song>-<diff>.json or songs/<song>.json
    const m1 = low.match(/^(?:assets\/)?data\/([^/]+)\/([^/]+)\.json$/);
    const m2 = low.match(/^(?:assets\/)?songs\/([^/]+)\.json$/);
    const m3 = low.match(/^songs\/([^/]+)\/([^/]+)\.(ogg|mp3|wav)$/);
    const m4 = low.match(/^music\/([^/]+)\.(ogg|mp3|wav)$/);
    if (m1) {
      const folder = m1[1];
      const key = folder;
      const s = songs.get(key) ?? { id: key, name: folder, displayName: folder, bpm: 150, speed: 1, needsVoices: false, extraTracks: [], chartPaths: [] };
      s.chartPaths.push(path);
      songs.set(key, s);
    } else if (m2) {
      const key = m2[1].replace(/-(easy|normal|hard|erect|nightmare)$/, '');
      const s = songs.get(key) ?? { id: key, name: key, displayName: key, bpm: 150, speed: 1, needsVoices: false, extraTracks: [], chartPaths: [] };
      if (!s.chartPaths.includes(path)) s.chartPaths.push(path);
      songs.set(key, s);
    } else if (m3) {
      const key = m3[1];
      const s = songs.get(key) ?? { id: key, name: key, displayName: key, bpm: 150, speed: 1, needsVoices: false, extraTracks: [], chartPaths: [] };
      const kind = /voices/i.test(baseOf(path)) ? 'voices' : /inst/i.test(baseOf(path)) ? 'inst' : 'inst';
      if (kind === 'voices') { s.voicesPath = path; s.needsVoices = true; }
      else if (!s.instPath) s.instPath = path;
      songs.set(key, s);
    } else if (m4) {
      const key = m4[1].replace(/-(inst|voices)$/i, '');
      const s = songs.get(key) ?? { id: key, name: key, displayName: key, bpm: 150, speed: 1, needsVoices: false, extraTracks: [], chartPaths: [] };
      if (/-voices$/i.test(m4[1])) { s.voicesPath = path; s.needsVoices = true; }
      else if (!s.instPath) s.instPath = path;
      songs.set(key, s);
    }
  }
  // Hydrate bpm/speed from first chart when parseable
  for (const s of songs.values()) {
    const first = s.chartPaths[0] ? files[s.chartPaths[0]] : undefined;
    const j = parseJsonFile(first);
    if (j) {
      const inner = (j.song && typeof j.song === 'object' ? j.song : j) as Record<string, unknown>;
      if (typeof inner.bpm === 'number') s.bpm = inner.bpm;
      if (typeof inner.speed === 'number') s.speed = inner.speed;
      if (typeof inner.song === 'string') s.displayName = inner.song;
      if (typeof inner.needsVoices === 'boolean') s.needsVoices = inner.needsVoices;
    }
    s.chartPaths.sort();
  }
  return [...songs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function discoverCharacters(files: Record<string, ProjectFile>): CharacterDef[] {
  const out: CharacterDef[] = [];
  for (const path of Object.keys(files)) {
    if (!/characters?\//i.test(path) || extOf(path) !== 'json') continue;
    const j = parseJsonFile(files[path]);
    if (!j) continue;
    const name = safeJsonName(path);
    out.push({
      name,
      displayName: String(j.name ?? name),
      icon: String(j.icon ?? j.healthicon ?? ''),
      healthIcon: String(j.healthicon ?? j.icon ?? ''),
      x: num(j.x, pair(j.position, [0, 0])[0]),
      y: num(j.y, pair(j.position, [0, 0])[1]),
      camX: num(j.camx, pair(j.camera_position, [0, 0])[0]),
      camY: num(j.camy, pair(j.camera_position, [0, 0])[1]),
      scale: num(j.scale, Array.isArray(j.scales) ? num((j.scales as unknown[])[0], 1) : 1),
      flipX: Boolean(j.flip_x ?? false),
      flipY: Boolean(j.flip_y ?? false),
      animations: Array.isArray(j.animations) ? (j.animations as Record<string, unknown>[]).map(a => ({
        name: String(a.anim ?? a.name ?? 'idle'),
        prefix: String(a.name ?? a.prefix ?? ''),
        fps: num(a.fps, 24),
        loop: Boolean(a.loop ?? true),
        indices: Array.isArray(a.indices) ? (a.indices as number[]) : []
      })) : [],
      spritePath: typeof j.image === 'string' ? j.image : undefined,
      rawJson: j,
      filePath: path
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function discoverStages(files: Record<string, ProjectFile>): StageDef[] {
  const out: StageDef[] = [];
  for (const path of Object.keys(files)) {
    if (!/stages?\//i.test(path) || extOf(path) !== 'json') continue;
    const j = parseJsonFile(files[path]);
    if (!j) continue;
    out.push({
      name: safeJsonName(path),
      filePath: path,
      background: String(j.background ?? ''),
      foreground: String(j.foreground ?? ''),
      layers: Array.isArray(j.layers) ? (j.layers as Record<string, unknown>[]).map((l, i) => ({
        id: String(l.id ?? `layer-${i}`),
        image: String(l.image ?? ''),
        x: num(l.x, 0), y: num(l.y, 0), scale: num(l.scale, 1),
        scrollX: num(l.scrollX ?? l.scrollx, 1), scrollY: num(l.scrollY ?? l.scrolly, 1)
      })) : [],
      camX: num(j.camX, pair(j.camera, [0, 0])[0]),
      camY: num(j.camY, pair(j.camera, [0, 0])[1]),
      zoom: num(j.zoom ?? j.defaultCamZoom, 1),
      bfPos: pair(j.boyfriend ?? j.bf, [770, 450]),
      dadPos: pair(j.dad ?? j.opponent, [100, 450]),
      gfPos: pair(j.gf ?? j.girlfriend, [400, 300]),
      rawJson: j
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function discoverWeeks(files: Record<string, ProjectFile>): WeekDef[] {
  const out: WeekDef[] = [];
  for (const path of Object.keys(files)) {
    if (!/weeks?\//i.test(path) || extOf(path) !== 'json') continue;
    const j = parseJsonFile(files[path]);
    if (!j) continue;
    const songsArr = Array.isArray(j.songs) ? (j.songs as unknown[]).map(s => Array.isArray(s) ? String(s[0]) : String(s)) : [];
    out.push({
      name: String(j.name ?? j.weekName ?? safeJsonName(path)),
      filePath: path,
      songs: songsArr,
      opponent: String(j.opponent ?? j.character ?? 'dad'),
      menuChar: String(j.menuChar ?? j.menuCharacter ?? 'dad'),
      background: String(j.background ?? j.weekBackground ?? 'stage'),
      unlocked: j.locked !== true && j.unlocked !== false,
      hideFreeplay: Boolean(j.hideFreeplay ?? false),
      rawJson: j
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function discoverDialogues(files: Record<string, ProjectFile>): DialogueFile[] {
  const out: DialogueFile[] = [];
  for (const path of Object.keys(files)) {
    const low = path.toLowerCase();
    if (!(low.includes('dialogue') || low.includes('dialog')) || extOf(path) !== 'json') continue;
    const j = parseJsonFile(files[path]);
    if (!j) continue;
    const arr = Array.isArray(j) ? j : Array.isArray(j.dialogue) ? j.dialogue as unknown[] : [];
    out.push({
      name: safeJsonName(path),
      filePath: path,
      lines: (arr as Record<string, unknown>[]).map(l => ({
        speaker: String(l.speaker ?? l.character ?? 'bf'),
        text: String(l.text ?? l.dialogue ?? ''),
        portrait: String(l.portrait ?? ''),
        position: (['left', 'center', 'right'] as const).includes(l.position as 'left') ? (l.position as 'left' | 'center' | 'right') : 'left',
        background: String(l.background ?? '')
      }))
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function num(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

function pair(v: unknown, fb: [number, number]): [number, number] {
  if (Array.isArray(v)) return [num(v[0], fb[0]), num(v[1], fb[1])];
  return fb;
}

export function newProjectId(): string { return uid('proj'); }
