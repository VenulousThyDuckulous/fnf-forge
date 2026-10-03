// AI provider abstraction + local procedural chart generator fallback.
// No secret keys in source: the user configures endpoint/key in Settings.

import type { PsychChart, PsychNote } from '../types';
import { chartLengthMs, sectionStartMs } from '../psych/chart';

export interface AiGenerateOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  context?: Record<string, unknown>;
}

export interface AiProvider {
  id: string;
  label: string;
  isConfigured(opts: AiGenerateOptions): boolean;
  generate(opts: AiGenerateOptions): Promise<string>;
}

/** Generic OpenAI-compatible chat-completions provider (user-supplied endpoint). */
export const openAiLikeProvider: AiProvider = {
  id: 'openai-like',
  label: 'OpenAI-compatible',
  isConfigured: (o) => o.endpoint.trim().length > 0 && o.apiKey.trim().length > 0,
  async generate(o) {
    const url = o.endpoint.replace(/\/$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
      body: JSON.stringify({
        model: o.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: o.systemPrompt ?? 'You are an FNF chart assistant. Reply with JSON only when asked for JSON.' },
          { role: 'user', content: o.prompt }
        ],
        temperature: 0.8
      })
    });
    if (!res.ok) throw new Error(`AI provider returned HTTP ${res.status}. Check endpoint/key/model.`);
    const j = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('AI provider returned an empty response.');
    return text;
  }
};

/** Local provider: always available, purely procedural. */
export const localProvider: AiProvider = {
  id: 'local',
  label: 'Local generator (offline)',
  isConfigured: () => true,
  async generate(o) {
    return localBrain(o.prompt, o.context);
  }
};

function localBrain(prompt: string, context?: Record<string, unknown>): string {
  const p = prompt.toLowerCase();
  if (p.includes('week') || p.includes('dialogue') || p.includes('character') || p.includes('stage') || p.includes('song concept') || p.includes('mod description')) {
    return localModIdea(prompt, context);
  }
  return localPatternExplain(prompt);
}

function localModIdea(prompt: string, context?: Record<string, unknown>): string {
  const proj = (context?.projectName as string) || 'Untitled Mod';
  return [
    `# Idea for "${proj}" (generated locally, offline)`,
    ``,
    `Request: ${prompt}`,
    ``,
    `## Week concept`,
    `- Title: Neon Static — 3 songs: "Boot Sequence", "Signal Lost", "Rebroadcast".`,
    `- Opponent: R0-B0, a pirate-TV robot. Week background: flickering rooftop antenna array.`,
    ``,
    `## Dialogue beats`,
    `1. R0-B0 (center): "SIGNAL FOUND. CHALLENGER DETECTED."`,
    `2. BF (left): "Beep bo bop!" / GF (right): "He says bring it!"`,
    `3. R0-B0: "DIFFICULTY SCALING... MAXIMUM."`,
    ``,
    `## Chart guidance`,
    `- "Boot Sequence": beginner 8ths, ~120 BPM, mostly singles.`,
    `- "Signal Lost": jacks on the downbeat + chord hits every 4 bars.`,
    `- "Rebroadcast": dense ending — 16th streams in the last 8 bars.`,
    ``,
    `## Stage concept`,
    `- Layers: night-sky gradient, antenna silhouettes (scroll 0.3), rooftop (scroll 1.0).`,
    `- Zoom 0.8, GF on the water tower, flicker event on drops.`,
    ``,
    `Tip: connect an AI provider in Settings for fully custom prose.`
  ].join('\n');
}

function localPatternExplain(prompt: string): string {
  return [
    `Local pattern plan for: "${prompt}"`,
    ``,
    `- Pick a pattern below in the Chart Editor assistant and click Generate + Insert.`,
    `- Patterns available: jackhammer, chords, streams, beginner, dense-ending, fast.`,
    `- The generator writes notes into the selected section range at the current snap.`,
    ``,
    `No AI provider is configured, so this ran 100% offline in your browser.`
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Procedural pattern generator: inserts real PsychNote[] into a chart range.
// ---------------------------------------------------------------------------

export type PatternKind = 'jackhammer' | 'chords' | 'stream' | 'beginner' | 'dense-ending' | 'fast' | 'mixed';

export function detectPatternKind(prompt: string): PatternKind {
  const p = prompt.toLowerCase();
  if (p.includes('jack')) return 'jackhammer';
  if (p.includes('chord')) return 'chords';
  if (p.includes('stream') || p.includes('dense')) return 'stream';
  if (p.includes('beginner') || p.includes('simple') || p.includes('easy')) return 'beginner';
  if (p.includes('ending')) return 'dense-ending';
  if (p.includes('fast')) return 'fast';
  return 'mixed';
}

export interface PatternRequest {
  kind: PatternKind;
  chart: PsychChart;
  fromSection: number;
  numSections: number;
  snap: number; // e.g. 4 = 16ths subdivisions per beat count base
  seed?: number;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generatePatternNotes(req: PatternRequest): PsychNote[] {
  const { chart, fromSection, numSections, kind } = req;
  const rnd = mulberry(req.seed ?? 12345);
  const notes: PsychNote[] = [];
  const end = Math.min(chart.sections.length, fromSection + Math.max(1, numSections));
  for (let si = fromSection; si < end; si++) {
    const sec = chart.sections[si];
    const bpm = sec.changeBPM && sec.bpm ? sec.bpm : chart.bpm;
    const beatMs = 60000 / bpm;
    const start = sectionStartMs(chart, si);
    const steps = sec.lengthInSteps;
    const totalBeats = steps / 4;
    const push = (beat: number, lane: number, sustain = 0) => {
      notes.push({ time: Math.round(start + beat * beatMs), lane: lane % 4, sustain });
    };
    if (kind === 'beginner') {
      for (let b = 0; b < totalBeats; b += 1) push(b, Math.floor(rnd() * 4));
      if (totalBeats >= 4) push(totalBeats - 1, Math.floor(rnd() * 4), beatMs * 0.9);
    } else if (kind === 'jackhammer') {
      const lane = Math.floor(rnd() * 4);
      for (let s = 0; s < totalBeats * 2; s++) push(s * 0.5, s % 4 === 3 ? (lane + 1) % 4 : lane);
    } else if (kind === 'chords') {
      for (let b = 0; b < totalBeats; b += 1) {
        if (b % 2 === 0) { const l = Math.floor(rnd() * 4); push(b, l); push(b, (l + 2) % 4); }
        else push(b, Math.floor(rnd() * 4));
      }
    } else if (kind === 'stream' || kind === 'dense-ending' || kind === 'fast') {
      const div = 0.5;
      for (let t = 0; t < totalBeats; t += div) {
        const lane = Math.floor(rnd() * 4);
        push(t, lane);
        if (kind === 'dense-ending' && t > totalBeats * 0.6 && rnd() > 0.6) push(t, (lane + 2) % 4);
      }
    } else {
      for (let b = 0; b < totalBeats; b += 0.5) {
        if (rnd() > 0.25) push(b, Math.floor(rnd() * 4));
        if (b % 2 === 0 && rnd() > 0.75) push(b, Math.floor(rnd() * 4));
      }
    }
  }
  void chartLengthMs;
  return notes.sort((a, b) => a.time - b.time);
}
