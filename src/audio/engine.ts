// WebAudio engine: playback of project audio blobs, metronome, waveform peaks.

export interface LayerSpec {
  buffer: AudioBuffer;
  volume: number;
  loop: boolean;
  /** seconds into the buffer to begin (before the shared offset) */
  startAt: number;
  /** seconds to play; 0 = to end of buffer */
  dur: number;
}

interface LayerJob { node: { src: AudioBufferSourceNode; gain: GainNode }; durMs: number; }

export class AudioEngine {
  ctx: AudioContext | null = null;
  private nodes: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  startedAt = 0;
  offsetMs = 0;
  playing = false;
  durationMs = 0;
  volume = 1;
  private metroTimer: number | null = null;

  ensure(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  async decode(file: Blob): Promise<AudioBuffer> {
    const ctx = this.ensure();
    const buf = await file.arrayBuffer();
    // decodeAudioData detaches the buffer copy; slice to be safe across browsers
    return ctx.decodeAudioData(buf.slice(0));
  }

  async playBuffer(buffer: AudioBuffer, volume = 1, loop = false, trimStartMs = 0, trimEndMs = 0): Promise<void> {
    const startSec = Math.max(0, trimStartMs / 1000);
    const dur = trimEndMs > trimStartMs ? (trimEndMs - trimStartMs) / 1000 : buffer.duration - startSec;
    // NOTE: offsetMs carries the trim; spec.startAt stays 0 so playLayers doesn't add it twice.
    await this.playLayers([{ buffer, volume, loop, startAt: 0, dur }], trimStartMs);
  }

  /** Play instrumental + optional voices in sync (chart preview). */
  async playSong(inst: AudioBuffer, voices: AudioBuffer | null, vol = 0.9, voicesVol = 0.8, offsetMs = 0): Promise<void> {
    const layers: LayerSpec[] = [{ buffer: inst, volume: vol, loop: false, startAt: 0, dur: 0 }];
    if (voices) layers.push({ buffer: voices, volume: voicesVol, loop: false, startAt: 0, dur: 0 });
    await this.playLayers(layers, Math.max(0, offsetMs));
  }

  private async playLayers(specs: LayerSpec[], offsetMs: number): Promise<void> {
    const ctx = this.ensure();
    this.stop();
    this.offsetMs = offsetMs;
    this.volume = specs[0]?.volume ?? 1;
    const jobs: LayerJob[] = [];
    for (const s of specs) {
      const startAt = (s.startAt || 0) + offsetMs / 1000;
      const src = ctx.createBufferSource();
      src.buffer = s.buffer;
      src.loop = s.loop;
      const gain = ctx.createGain();
      gain.gain.value = s.volume;
      src.connect(gain).connect(ctx.destination);
      const playDur = s.dur > 0 ? s.dur : Math.max(0, s.buffer.duration - startAt);
      const node = { src, gain };
      this.nodes.push(node);
      jobs.push({ node, durMs: Math.max(0, playDur * 1000) });
      try {
        if (startAt >= s.buffer.duration) continue; // offset past the end: skip layer
        src.start(0, Math.min(startAt, s.buffer.duration - 0.01), Math.max(0.05, playDur));
      } catch {
        // browser refused to start this layer; drop it
        this.nodes = this.nodes.filter(n => n !== node);
      }
    }
    if (this.nodes.length === 0) throw new Error('No audio could be started (offset may be past the end).');
    this.durationMs = Math.max(...jobs.filter(j => this.nodes.includes(j.node)).map(j => j.durMs), 0);
    this.startedAt = ctx.currentTime;
    this.playing = true;
    const main = this.nodes[0].src;
    main.onended = () => { this.playing = false; };
  }

  stop(): void {
    for (const n of this.nodes) {
      try { n.src.onended = null; n.src.stop(); } catch { /* already stopped */ }
      try { n.src.disconnect(); n.gain.disconnect(); } catch { /* ignore */ }
    }
    this.nodes = [];
    this.playing = false;
    this.stopMetronome();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const n of this.nodes) n.gain.gain.setTargetAtTime(v, t, 0.02);
  }

  positionMs(): number {
    if (!this.ctx || !this.playing) return this.offsetMs;
    return this.offsetMs + (this.ctx.currentTime - this.startedAt) * 1000;
  }

  startMetronome(bpm: number, volume = 0.4): void {
    this.stopMetronome();
    const ctx = this.ensure();
    const beat = 60000 / bpm;
    const tick = () => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 1600;
      g.gain.value = volume * 0.5;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime;
      g.gain.setValueAtTime(volume * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.start(t);
      o.stop(t + 0.08);
    };
    tick();
    this.metroTimer = window.setInterval(tick, beat);
  }

  stopMetronome(): void {
    if (this.metroTimer !== null) { clearInterval(this.metroTimer); this.metroTimer = null; }
  }

  /** Downsampled peaks for waveform rendering. */
  static peaks(buffer: AudioBuffer, count = 800): number[] {
    const ch = buffer.getChannelData(0);
    const out: number[] = new Array(count).fill(0);
    const step = Math.max(1, Math.floor(ch.length / count));
    for (let i = 0; i < count; i++) {
      let m = 0;
      const s = i * step;
      for (let j = s; j < s + step && j < ch.length; j += 7) {
        const v = Math.abs(ch[j]);
        if (v > m) m = v;
      }
      out[i] = m;
    }
    return out;
  }
}

export const audioEngine = new AudioEngine();

/** Simple synthesized preview for SF2 presets (fallback when exact rendering is unavailable). */
export function previewTone(midiNote = 60, seconds = 0.8, volume = 0.4, wave: OscillatorType = 'triangle'): void {
  const ctx = audioEngine.ensure();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  o.frequency.value = 440 * Math.pow(2, (midiNote - 69) / 12);
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + seconds + 0.05);
}
