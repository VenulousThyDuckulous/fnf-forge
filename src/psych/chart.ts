// Psych Engine chart parsing. Supports the common Psych Engine formats:
//  A) { song: { song, bpm, speed, ..., notes: [ {mustHitSection, lengthInSteps, sectionNotes: [[time,lane,sustain,kind]]} ], events } }
//  B) Flat { song, bpm, sections: [...], events, ... }
// Unknown properties are preserved in `raw` and merged back on export.

import type { PsychChart, PsychNote, PsychSection, PsychEvent } from '../types';

export function emptyChart(song = 'my-song', bpm = 150): PsychChart {
  const sections: PsychSection[] = [];
  for (let i = 0; i < 8; i++) {
    sections.push({ mustHit: i % 2 === 1, lengthInSteps: 16, notes: [], cameraFocus: i % 2 === 1 ? 'bf' : 'dad' });
  }
  return {
    song, bpm, speed: 1, needsVoices: false,
    player1: 'bf', player2: 'dad', gfVersion: 'gf', stage: 'stage',
    sections, events: [], bpmChanges: [], notesPerLane: 4, raw: {}
  };
}

interface RawSection {
  mustHitSection?: boolean;
  mustHit?: boolean;
  gfSection?: boolean;
  altAnim?: boolean;
  changeBPM?: boolean;
  bpm?: number;
  lengthInSteps?: number;
  sectionNotes?: unknown[];
  notes?: unknown[];
  [k: string]: unknown;
}

function toNote(entry: unknown): PsychNote | null {
  if (Array.isArray(entry)) {
    const [time, lane, sustain, kind] = entry as [unknown, unknown, unknown, unknown];
    if (typeof time !== 'number' || typeof lane !== 'number') return null;
    return {
      time, lane: Math.max(0, Math.floor(lane as number)),
      sustain: typeof sustain === 'number' ? sustain : 0,
      kind: (kind as string | number | undefined) ?? undefined
    };
  }
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    if (typeof o.time !== 'number' || typeof o.lane !== 'number') return null;
    return {
      time: o.time, lane: Math.max(0, Math.floor(o.lane as number)),
      sustain: typeof o.sustain === 'number' ? o.sustain : (typeof o.length === 'number' ? o.length : 0),
      kind: (o.kind ?? o.type) as string | number | undefined
    };
  }
  return null;
}

function parseSection(raw: RawSection, fallbackBpm: number): PsychSection {
  const arr = (raw.sectionNotes ?? raw.notes ?? []) as unknown[];
  const notes: PsychNote[] = [];
  for (const n of arr) {
    const note = toNote(n);
    if (note) notes.push(note);
  }
  let focus: PsychSection['cameraFocus'] = (raw.mustHitSection ?? raw.mustHit ?? true) ? 'bf' : 'dad';
  if (typeof raw.gfSection === 'boolean' && raw.gfSection) focus = 'gf';
  return {
    mustHit: Boolean(raw.mustHitSection ?? raw.mustHit ?? true),
    gfSection: Boolean(raw.gfSection ?? false),
    altAnim: Boolean(raw.altAnim ?? false),
    changeBPM: Boolean(raw.changeBPM ?? false),
    bpm: typeof raw.bpm === 'number' ? raw.bpm : fallbackBpm,
    lengthInSteps: typeof raw.lengthInSteps === 'number' ? raw.lengthInSteps : 16,
    notes,
    cameraFocus: focus
  };
}

function toEvents(e: unknown): PsychEvent[] {
  // Psych Engine native: [time, [[name, v1, v2], ...]] — one entry per timestamp
  // with nested sub-events. We also accept flat [time, name, v1, v2] tuples
  // and {time,name,v1,v2} objects for robustness.
  if (Array.isArray(e)) {
    const [time, second] = e as [unknown, unknown];
    if (typeof time === 'number' && Array.isArray(second) && second.length > 0 && Array.isArray(second[0])) {
      const out: PsychEvent[] = [];
      for (const sub of second as unknown[]) {
        if (Array.isArray(sub)) {
          const [name, v1, v2] = sub as [unknown, unknown, unknown];
          out.push({ time, name: String(name ?? ''), v1: String(v1 ?? ''), v2: String(v2 ?? '') });
        }
      }
      return out;
    }
    const single = toEvent(e);
    return single ? [single] : [];
  }
  const single = toEvent(e);
  return single ? [single] : [];
}

function toEvent(e: unknown): PsychEvent | null {
  if (Array.isArray(e)) {
    const [time, name, v1, v2] = e as [unknown, unknown, unknown, unknown];
    if (typeof time !== 'number') return null;
    return { time, name: String(name ?? ''), v1: String(v1 ?? ''), v2: String(v2 ?? '') };
  }
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.time !== 'number') return null;
    return { time: o.time, name: String(o.name ?? o.event ?? ''), v1: String(o.v1 ?? o.value1 ?? ''), v2: String(o.v2 ?? o.value2 ?? '') };
  }
  return null;
}

export function parsePsychChart(json: unknown): PsychChart {
  if (!json || typeof json !== 'object') throw new Error('Chart JSON must be an object.');
  const root = json as Record<string, unknown>;
  // Format A nests everything under `song`
  const inner = (root.song && typeof root.song === 'object' ? root.song : root) as Record<string, unknown>;
  const song = String(inner.song ?? root.song ?? 'my-song');
  const bpm = typeof (inner.bpm ?? root.bpm) === 'number' ? (inner.bpm ?? root.bpm) as number : 150;
  const rawSections = (inner.notes ?? inner.sections ?? root.notes ?? root.sections ?? []) as unknown[];
  const sections: PsychSection[] = (Array.isArray(rawSections) ? rawSections : []).map(s =>
    parseSection((s ?? {}) as RawSection, bpm));
  if (sections.length === 0) sections.push(...emptyChart(song, bpm).sections);
  const rawEvents = (inner.events ?? root.events ?? []) as unknown[];
  const events: PsychEvent[] = [];
  for (const ev of (Array.isArray(rawEvents) ? rawEvents : [])) {
    for (const parsed of toEvents(ev)) events.push(parsed);
  }
  const raw: Record<string, unknown> = { ...(root as object) };
  return {
    song,
    bpm,
    speed: (inner.speed ?? root.speed ?? 1) as number,
    needsVoices: Boolean(inner.needsVoices ?? root.needsVoices ?? false),
    player1: String(inner.player1 ?? root.player1 ?? 'bf'),
    player2: String(inner.player2 ?? root.player2 ?? 'dad'),
    gfVersion: String(inner.gf ?? inner.gfVersion ?? root.gf ?? 'gf'),
    stage: String(inner.stage ?? root.stage ?? 'stage'),
    sections, events,
    bpmChanges: Array.isArray(root.bpmChanges) ? (root.bpmChanges as PsychChart['bpmChanges']) : [],
    notesPerLane: typeof root.notesPerLane === 'number' ? root.notesPerLane as number : detectLanes(sections),
    raw
  };
}

export function detectLanes(sections: PsychSection[]): number {
  let max = 3;
  for (const s of sections) for (const n of s.notes) max = Math.max(max, n.lane);
  return max < 4 ? 4 : max + 1 >= 8 ? 8 : max + 1;
}

/** Serialize back to Psych Engine format A, preserving unknown root/song props. */
export function serializePsychChart(chart: PsychChart): Record<string, unknown> {
  const innerKnown = new Set(['song', 'bpm', 'speed', 'needsVoices', 'player1', 'player2', 'gf', 'gfVersion', 'stage', 'notes', 'sections', 'events']);
  const prevInner: Record<string, unknown> =
    chart.raw.song && typeof chart.raw.song === 'object' ? { ...(chart.raw.song as object) } : {};
  const songObj: Record<string, unknown> = { ...prevInner };
  songObj.song = chart.song;
  songObj.bpm = chart.bpm;
  songObj.speed = chart.speed;
  songObj.needsVoices = chart.needsVoices;
  songObj.player1 = chart.player1;
  songObj.player2 = chart.player2;
  songObj.gf = chart.gfVersion;
  songObj.stage = chart.stage;
  songObj.notes = chart.sections.map(s => ({
    mustHitSection: s.mustHit,
    gfSection: s.gfSection ?? false,
    altAnim: s.altAnim ?? false,
    changeBPM: s.changeBPM ?? false,
    bpm: s.bpm ?? chart.bpm,
    lengthInSteps: s.lengthInSteps,
    sectionNotes: s.notes
      .slice()
      .sort((a, b) => a.time - b.time)
      .map(n => n.kind !== undefined ? [n.time, n.lane, n.sustain, n.kind] : [n.time, n.lane, n.sustain])
  }));
  // Psych-native grouped event format: [[time, [[name, v1, v2], ...]], ...]
  const grouped = new Map<number, PsychEvent[]>();
  for (const e of chart.events.slice().sort((a, b) => a.time - b.time)) {
    const g = grouped.get(e.time) ?? [];
    g.push(e);
    grouped.set(e.time, g);
  }
  songObj.events = [...grouped.entries()].map(([time, evs]) => [time, evs.map(e => [e.name, e.v1, e.v2])]);
  const out: Record<string, unknown> = { ...chart.raw };
  for (const k of innerKnown) delete out[k];
  out.song = songObj;
  return out;
}

/** Step length in ms for a section given its BPM. */
export function stepLengthMs(bpm: number): number {
  return 60000 / bpm / 4;
}

export function sectionStartMs(chart: PsychChart, sectionIndex: number): number {
  let t = 0;
  for (let i = 0; i < sectionIndex && i < chart.sections.length; i++) {
    const s = chart.sections[i];
    t += s.lengthInSteps * stepLengthMs(s.changeBPM && s.bpm ? s.bpm : chart.bpm);
  }
  return t;
}

export function chartLengthMs(chart: PsychChart): number {
  return sectionStartMs(chart, chart.sections.length);
}
