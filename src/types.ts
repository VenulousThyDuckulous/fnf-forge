// Shared TypeScript types for FNF Mod Forge.

export interface ProjectFile {
  /** Normalized path with forward slashes, e.g. "songs/my-song/Inst.ogg" */
  path: string;
  kind: 'text' | 'binary';
  /** UTF-8 text for kind==='text' */
  text?: string;
  /** Raw bytes for kind==='binary' (base64 when persisted to JSON fallback) */
  data?: ArrayBuffer | null;
  mime?: string;
  size: number;
  updatedAt: number;
}

export interface SongEntry {
  id: string;
  name: string;
  displayName: string;
  bpm: number;
  speed: number;
  needsVoices: boolean;
  instPath?: string;
  voicesPath?: string;
  extraTracks: { name: string; path: string; volume: number }[];
  chartPaths: string[];
}

export interface CharacterDef {
  name: string;
  displayName: string;
  icon: string;
  healthIcon: string;
  x: number;
  y: number;
  camX: number;
  camY: number;
  scale: number;
  flipX: boolean;
  flipY: boolean;
  animations: CharAnimation[];
  spritePath?: string;
  rawJson: Record<string, unknown>;
  filePath: string;
}

export interface CharAnimation {
  name: string;
  prefix: string;
  fps: number;
  loop: boolean;
  indices: number[];
}

export interface StageDef {
  name: string;
  filePath: string;
  background: string;
  foreground: string;
  layers: StageLayer[];
  camX: number;
  camY: number;
  zoom: number;
  bfPos: [number, number];
  dadPos: [number, number];
  gfPos: [number, number];
  rawJson: Record<string, unknown>;
}

export interface StageLayer {
  id: string;
  image: string;
  x: number;
  y: number;
  scale: number;
  scrollX: number;
  scrollY: number;
}

export interface WeekDef {
  name: string;
  filePath: string;
  songs: string[];
  opponent: string;
  menuChar: string;
  background: string;
  unlocked: boolean;
  hideFreeplay?: boolean;
  rawJson: Record<string, unknown>;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  portrait: string;
  position: 'left' | 'center' | 'right';
  background: string;
}

export interface DialogueFile {
  name: string;
  filePath: string;
  lines: DialogueLine[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Psych Engine chart types (lossless: we keep unknown props in `raw`) ----

export interface PsychNote {
  time: number;
  lane: number; // 0..lanes-1
  sustain: number; // ms
  kind?: string | number;
}

export interface PsychSection {
  mustHit: boolean;
  gfSection?: boolean;
  altAnim?: boolean;
  changeBPM?: boolean;
  bpm?: number;
  lengthInSteps: number;
  notes: PsychNote[];
  cameraFocus?: 'dad' | 'bf' | 'gf';
}

export interface PsychChart {
  song: string;
  bpm: number;
  speed: number;
  needsVoices: boolean;
  player1: string;
  player2: string;
  gfVersion: string;
  stage: string;
  sections: PsychSection[];
  events: PsychEvent[];
  bpmChanges: { stepTime: number; songTime: number; bpm: number }[];
  notesPerLane: number;
  /** Full original JSON so unknown fields survive round-trip */
  raw: Record<string, unknown>;
}

export interface PsychEvent {
  time: number;
  name: string;
  v1: string;
  v2: string;
}

export type ViewId =
  | 'dashboard' | 'songs' | 'charts' | 'characters' | 'stages'
  | 'weeks' | 'dialogue' | 'assets' | 'ai' | 'charteditor'
  | 'sprite' | 'soundfont' | 'audio' | 'settings';

export interface AppSettings {
  theme: 'dark' | 'darker' | 'light';
  gridColor: string;
  laneColors: string[];
  defaultBpm: number;
  defaultScroll: number;
  autosave: boolean;
  aiEndpoint: string;
  aiKey: string;
  aiModel: string;
}
