import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { discoverSongs } from '../psych/importExport';
import { audioEngine, AudioEngine } from '../audio/engine';
import { baseOf } from '../utils/helpers';

export default function SongStudio() {
  const { project, upsertText, upsertBinary, fileUrl, toast, setView, setCurrentFile } = useStore();
  const songs = useMemo(() => discoverSongs(project.files), [project.files]);
  const [sel, setSel] = useState<string | null>(songs[0]?.id ?? null);
  const [form, setForm] = useState({ name: 'my-song', display: 'My Song', bpm: 150, speed: 1, vol: 0.9, voicesVol: 0.9 });
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const waveRef = useRef<HTMLCanvasElement>(null);

  const song = songs.find(s => s.id === sel) ?? null;

  useEffect(() => {
    if (song) setForm(f => ({ ...f, name: song.name, display: song.displayName, bpm: song.bpm, speed: song.speed }));
  }, [song?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = waveRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width = c.clientWidth * 2 || 800;
    const H = c.height = 128;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#2ed3ff';
    if (peaks.length === 0) {
      ctx.fillStyle = '#5b6378';
      ctx.font = '24px sans-serif';
      ctx.fillText('Upload an instrumental to see the waveform', 20, H / 2);
      return;
    }
    const bw = W / peaks.length;
    peaks.forEach((p, i) => {
      const h = Math.max(2, p * H * 0.95);
      ctx.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - 0.5), h);
    });
  }, [peaks]);

  async function upload(kind: 'inst' | 'voices' | 'extra', files: FileList | null) {
    const f = files?.[0];
    if (!f || !song) return;
    const path = kind === 'inst' ? `songs/${song.name}/Inst.${ext(f.name)}`
      : kind === 'voices' ? `songs/${song.name}/Voices.${ext(f.name)}`
      : `songs/${song.name}/${f.name}`;
    await upsertBinary(path, await f.arrayBuffer(), f.type);
    toast(`Stored ${path}`, 'ok');
    if (kind === 'inst') void loadPreview(path);
  }

  function ext(n: string) { return (n.split('.').pop() || 'ogg').toLowerCase(); }

  async function loadPreview(path: string) {
    try {
      const url = fileUrl(path);
      if (!url) { toast('Audio data not available yet.', 'error'); return; }
      const res = await fetch(url);
      const ab = await audioEngine.decode(await res.blob());
      setBuf(ab);
      setPeaks(AudioEngine.peaks(ab, 400));
    } catch (e) { toast(`Could not decode audio: ${e instanceof Error ? e.message : e}`, 'error'); }
  }

  function createSong() {
    const id = form.name.trim().toLowerCase().replace(/[^\w\-]+/g, '-') || 'my-song';
    const chartPath = `data/${id}/${id}-hard.json`;
    if (project.files[chartPath]) { toast('A chart already exists at ' + chartPath, 'error'); return; }
    const chart = { song: { song: form.display || id, bpm: form.bpm, speed: form.speed, needsVoices: false, player1: 'bf', player2: 'dad', gf: 'gf', stage: 'stage', notes: [], events: [] } };
    upsertText(chartPath, JSON.stringify(chart, null, 2), 'application/json');
    setSel(id);
    toast(`Song "${id}" created. Add audio + chart next.`, 'ok');
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Song Studio</h1>
      <div className="grid2">
        <div className="panel">
          <h2>Songs ({songs.length})</h2>
          {songs.map(s => (
            <div className="list-item" key={s.id}>
              <span style={{ flex: 1 }}><b>{s.displayName}</b> <span className="mut">{s.bpm} BPM · {s.chartPaths.length} chart(s)</span></span>
              <button className={`btn small ${sel === s.id ? 'active' : ''}`} onClick={() => setSel(s.id)}>Select</button>
              <button className="btn small" onClick={() => {
                const cp = s.chartPaths[0];
                if (cp) { setCurrentFile(cp); setView('charteditor'); }
                else toast('No chart file for this song yet.', 'error');
              }}>Chart →</button>
            </div>
          ))}
          {songs.length === 0 && <p className="mut">No songs detected. Create one below or import a mod ZIP.</p>}
          <h3>New song</h3>
          <div className="row">
            <div className="field"><label>Song id</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Display name</label><input value={form.display} onChange={e => setForm({ ...form, display: e.target.value })} /></div>
            <div className="field"><label>BPM</label><input type="number" value={form.bpm} onChange={e => setForm({ ...form, bpm: Number(e.target.value) || 150 })} /></div>
            <div className="field"><label>Speed</label><input type="number" step="0.1" value={form.speed} onChange={e => setForm({ ...form, speed: Number(e.target.value) || 1 })} /></div>
          </div>
          <button className="btn primary" onClick={createSong}>＋ Create song + chart stub</button>
          <p className="mut">We never claim to transcode audio in-browser. Upload browser-playable files (OGG/MP3/WAV). If Psych needs a different codec, convert with an external tool (e.g. Audacity/ffmpeg) — the app tells you instead of faking it.</p>
        </div>
        <div className="panel">
          <h2>{song ? `Audio — ${song.displayName}` : 'Select a song'}</h2>
          {!song && <p className="mut">Select a song on the left.</p>}
          {song && (
            <>
              <p className="mut">Inst: {song.instPath ? baseOf(song.instPath) : '—'} · Voices: {song.voicesPath ? baseOf(song.voicesPath) : '—'}</p>
              <div className="row">
                <label className="btn small">Upload Inst<input type="file" accept="audio/*" className="hidden-input" onChange={e => void upload('inst', e.target.files)} /></label>
                <label className="btn small">Upload Voices<input type="file" accept="audio/*" className="hidden-input" onChange={e => void upload('voices', e.target.files)} /></label>
                <label className="btn small">+ Extra track<input type="file" accept="audio/*" className="hidden-input" onChange={e => void upload('extra', e.target.files)} /></label>
              </div>
              <h3>Preview</h3>
              <canvas ref={waveRef} className="wave" />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn small" disabled={!song.instPath} onClick={() => song.instPath && void loadPreview(song.instPath)}>Load Inst waveform</button>
                <button className="btn small" disabled={!buf} onClick={() => {
                  if (!buf) return;
                  if (playing) { audioEngine.stop(); setPlaying(false); }
                  else { void audioEngine.playBuffer(buf, form.vol).then(() => setPlaying(true)); audioEngine['src'] && (audioEngine as unknown as { src: { onended: () => void } }).src && setPlaying(true); setTimeout(() => setPlaying(false), buf.duration * 1000); }
                }}>{playing ? '⏹ Stop' : '▶ Play instrumental'}</button>
                <div className="field" style={{ margin: 0 }}><label>Volume {Math.round(form.vol * 100)}%</label>
                  <input type="range" min={0} max={1} step={0.01} value={form.vol} onChange={e => { setForm({ ...form, vol: Number(e.target.value) }); audioEngine.setVolume(Number(e.target.value)); }} /></div>
              </div>
              {song.voicesPath && <p className="mut">Voices track stored at <span className="kbd">{song.voicesPath}</span> and exported with the mod.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
