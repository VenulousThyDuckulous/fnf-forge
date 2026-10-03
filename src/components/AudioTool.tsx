import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { audioEngine, AudioEngine } from '../audio/engine';
import { isAudioPath, baseOf } from '../utils/helpers';

export default function AudioTool() {
  const { project, upsertBinary, fileUrl, toast } = useStore();
  const audioFiles = Object.keys(project.files).filter(isAudioPath).sort();
  const [sel, setSel] = useState<string | null>(audioFiles[0] ?? null);
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [vol, setVol] = useState(0.9);
  const [loop, setLoop] = useState(false);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [playing, setPlaying] = useState(false);
  const [rename, setRename] = useState('');
  const waveRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = waveRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width = c.clientWidth * 2 || 800;
    const H = c.height = 128;
    ctx.clearRect(0, 0, W, H);
    if (!peaks.length) {
      ctx.fillStyle = '#5b6378'; ctx.font = '24px sans-serif';
      ctx.fillText('Select an asset to render its waveform', 20, H / 2);
      return;
    }
    const dur = buf?.duration ?? 1;
    const t0 = trim[0] / 1000 / dur, t1 = trim[1] > trim[0] ? trim[1] / 1000 / dur : 1;
    peaks.forEach((p, i) => {
      const frac = i / peaks.length;
      const inRange = frac >= t0 && frac <= t1;
      ctx.fillStyle = inRange ? '#2ed3ff' : '#3a4260';
      const h = Math.max(2, p * H * 0.95);
      ctx.fillRect((i / peaks.length) * W, (H - h) / 2, Math.max(1, W / peaks.length - 0.5), h);
    });
  }, [peaks, trim, buf]);

  async function load(path: string) {
    setSel(path);
    try {
      const url = fileUrl(path);
      if (!url) throw new Error('Missing audio data.');
      const res = await fetch(url);
      const ab = await audioEngine.decode(await res.blob());
      setBuf(ab);
      setPeaks(AudioEngine.peaks(ab, 500));
      setTrim([0, Math.round(ab.duration * 1000)]);
      setRename(baseOf(path));
    } catch (e) { toast(`Could not decode ${path}: ${e instanceof Error ? e.message : e}`, 'error'); }
  }

  async function onUpload(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const path = `sounds/${f.name}`;
    await upsertBinary(path, await f.arrayBuffer(), f.type);
    toast(`Added ${path}`, 'ok');
    setSel(path);
  }

  function play() {
    if (!buf) return;
    if (playing) { audioEngine.stop(); setPlaying(false); return; }
    void audioEngine.playBuffer(buf, vol, loop, trim[0], trim[1]).then(() => {
      setPlaying(true);
      if (!loop) setTimeout(() => setPlaying(false), Math.max(0, trim[1] - trim[0]));
    }).catch(e => toast(`Playback failed: ${e instanceof Error ? e.message : e}`, 'error'));
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Audio Tool</h1>
      <div className="grid2">
        <div className="panel">
          <div className="row">
            <label className="btn primary small">Upload audio<input type="file" accept="audio/*" className="hidden-input" onChange={e => void onUpload(e.target.files)} /></label>
            <span className="tag">{audioFiles.length} clips</span>
          </div>
          <div style={{ maxHeight: 380, overflow: 'auto', marginTop: 8 }}>
            {audioFiles.map(p => <div className="list-item" key={p}><span style={{ flex: 1 }}>{p}</span><button className={`btn small ${sel === p ? 'active' : ''}`} onClick={() => void load(p)}>Load</button></div>)}
            {audioFiles.length === 0 && <p className="mut">No audio in project yet.</p>}
          </div>
        </div>
        <div className="panel">
          <h2>{sel ?? 'No clip selected'}</h2>
          <canvas ref={waveRef} className="wave" />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small primary" disabled={!buf} onClick={play}>{playing ? '⏹ Stop' : '▶ Play'}</button>
            <label className="pill"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> Loop</label>
            <div className="field" style={{ margin: 0 }}><label>Volume</label><input type="range" min={0} max={1} step={0.01} value={vol} onChange={e => { setVol(Number(e.target.value)); audioEngine.setVolume(Number(e.target.value)); }} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Trim start (ms)</label><input type="number" value={trim[0]} onChange={e => setTrim([Number(e.target.value) || 0, trim[1]])} /></div>
            <div className="field"><label>Trim end (ms)</label><input type="number" value={trim[1]} onChange={e => setTrim([trim[0], Number(e.target.value) || 0])} /></div>
            <div className="field"><label>Rename asset to</label><input value={rename} onChange={e => setRename(e.target.value)} placeholder="new-name.ogg" /></div>
          </div>
          <p className="mut">Trim is non-destructive preview only (stored as playback offsets). Rename copies bytes to a new path via Assets → Replace.</p>
        </div>
      </div>
    </div>
  );
}
