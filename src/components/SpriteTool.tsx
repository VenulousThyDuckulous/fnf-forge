import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { downloadBlob } from '../utils/helpers';

export default function SpriteTool() {
  const { upsertBinary, toast } = useStore();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [url, setUrl] = useState('');
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(2);
  const [fps, setFps] = useState(12);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [order, setOrder] = useState('0,1,2,3');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<HTMLCanvasElement>(null);
  const timer = useRef<number | null>(null);

  async function onFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    await upsertBinary(`images/sprites/${f.name}`, buf, f.type).catch(() => undefined);
    const u = URL.createObjectURL(new Blob([buf], { type: f.type }));
    const im = new Image();
    im.onload = () => { setImg(im); setUrl(u); setFrame(0); };
    im.src = u;
  }

  const total = Math.max(1, cols * rows);
  const seq = order.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0 && n < total);

  useEffect(() => {
    if (!playing || !img) return;
    const frames = seq.length ? seq : [...Array(total).keys()];
    timer.current = window.setInterval(() => setFrame(f => (f + 1) % frames.length), 1000 / Math.max(1, fps));
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, fps, img, total]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const fw = img.width / cols, fh = img.height / rows;
    const frames = seq.length ? seq : [...Array(total).keys()];
    const idx = frames[frame % frames.length] ?? 0;
    const sx = (idx % cols) * fw, sy = Math.floor(idx / cols) * fh;
    c.width = Math.max(1, Math.round(fw)); c.height = Math.max(1, Math.round(fh));
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, sx, sy, fw, fh, 0, 0, c.width, c.height);
  }, [img, frame, cols, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = sheetRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    c.width = img.width; c.height = img.height;
    ctx.drawImage(img, 0, 0);
    ctx.strokeStyle = '#2ed3ff';
    const fw = img.width / cols, fh = img.height / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) ctx.strokeRect(x * fw + 0.5, y * fh + 0.5, fw - 1, fh - 1);
  }, [img, cols, rows]);

  function exportFrames() {
    if (!img) { toast('Upload an image first.', 'error'); return; }
    const fw = img.width / cols, fh = img.height / rows;
    const c = document.createElement('canvas');
    c.width = Math.round(fw); c.height = Math.round(fh);
    const ctx = c.getContext('2d')!;
    const frames = seq.length ? seq : [...Array(total).keys()];
    // Export as a horizontal strip PNG
    const strip = document.createElement('canvas');
    strip.width = c.width * frames.length; strip.height = c.height;
    const sctx = strip.getContext('2d')!;
    frames.forEach((fi, k) => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, (fi % cols) * fw, Math.floor(fi / cols) * fh, fw, fh, 0, 0, c.width, c.height);
      sctx.drawImage(c, k * c.width, 0);
    });
    strip.toBlob(b => { if (b) { downloadBlob(b, 'spritesheet-strip.png'); toast('Exported frame strip PNG.', 'ok'); } });
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Sprite Tool</h1>
      <div className="grid2">
        <div className="panel">
          <div className="row">
            <label className="btn primary small">Upload image<input type="file" accept="image/*" className="hidden-input" onChange={e => void onFile(e.target.files)} /></label>
            <div className="field" style={{ margin: 0 }}><label>Cols</label><input type="number" value={cols} min={1} max={32} onChange={e => setCols(Number(e.target.value) || 1)} /></div>
            <div className="field" style={{ margin: 0 }}><label>Rows</label><input type="number" value={rows} min={1} max={32} onChange={e => setRows(Number(e.target.value) || 1)} /></div>
            <div className="field" style={{ margin: 0 }}><label>FPS</label><input type="number" value={fps} min={1} max={60} onChange={e => setFps(Number(e.target.value) || 12)} /></div>
          </div>
          <div className="field"><label>Frame order (comma-separated indices)</label><input value={order} onChange={e => setOrder(e.target.value)} placeholder="0,1,2,3" /></div>
          <div className="row">
            <button className="btn small" onClick={() => setPlaying(p => !p)} disabled={!img}>{playing ? '⏸ Pause' : '▶ Preview animation'}</button>
            <button className="btn small" onClick={exportFrames} disabled={!img}>⬇ Export strip</button>
            <span className="tag">{total} frames · showing {(seq[frame % Math.max(1, seq.length)] ?? frame) + ''}</span>
          </div>
          {!img && <p className="mut">Upload a sprite sheet to slice it on a grid, preview animations, and export a strip.</p>}
          {url && <canvas ref={sheetRef} style={{ width: '100%', marginTop: 10, border: '1px solid var(--border)', borderRadius: 8 }} />}
        </div>
        <div className="panel">
          <h2>Frame preview</h2>
          <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 420, imageRendering: 'pixelated', border: '1px solid var(--border)', borderRadius: 8, background: 'repeating-conic-gradient(#1a2033 0 25%, #10141f 0 50%) 0 0/24px 24px' }} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => setFrame(f => (f + 1) % Math.max(1, seq.length || total))}>Next frame</button>
          </div>
        </div>
      </div>
    </div>
  );
}
