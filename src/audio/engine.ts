// WebAudio engine: playback of project audio blobs, metronome, waveform peaks.

export class AudioEngine {
  ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
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
    const ctx = this.ensure();
    this.stop();
    this.src = ctx.createBufferSource();
    this.src.buffer = buffer;
    this.src.loop = loop;
    this.gain = ctx.createGain();
    this.gain.gain.value = volume;
    this.src.connect(this.gain).connect(ctx.destination);
    const startAt = Math.max(0, trimStartMs / 1000);
    const dur = trimEndMs > trimStartMs ? (trimEndMs - trimStartMs) / 1000 : buffer.duration - startAt;
    this.durationMs = Math.max(0, dur * 1000);
    this.startedAt = ctx.currentTime;
    this.offsetMs = trimStartMs;
    this.playing = true;
    this.volume = volume;
    this.src.onended = () => { if (this.playing && !loop) { this.playing = false; } };
    this.src.start(0, startAt, Math.max(0.05, dur));
  }

  stop(): void {
    try { this.src?.stop(); } catch { /* already stopped */ }
    try { this.src?.disconnect(); } catch { /* ignore */ }
    this.src = null;
    this.playing = false;
    this.stopMetronome();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
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
