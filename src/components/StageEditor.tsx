import { useMemo, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { discoverStages } from '../psych/importExport';
import type { StageLayer } from '../types';
import { uid } from '../utils/helpers';

export default function StageEditor() {
  const { project, upsertText, upsertBinary, fileUrl, toast } = useStore();
  const stages = useMemo(() => discoverStages(project.files), [project.files]);
  const [sel, setSel] = useState<string | null>(stages[0]?.filePath ?? null);
  const cur = stages.find(s => s.filePath === sel);
  const [form, setForm] = useState({ name: cur?.name ?? 'my-stage', zoom: cur?.zoom ?? 0.9, camX: 0, camY: 0 });
  const [layers, setLayers] = useState<StageLayer[]>(cur?.layers ?? [
    { id: 'bg', image: '', x: -400, y: -200, scale: 1, scrollX: 0.3, scrollY: 0.3 },
    { id: 'fg', image: '', x: 0, y: 500, scale: 1, scrollX: 1, scrollY: 1 }
  ]);

  function load(fp: string) {
    const s = stages.find(x => x.filePath === fp);
    setSel(fp);
    if (s) { setForm({ name: s.name, zoom: s.zoom, camX: s.camX, camY: s.camY }); setLayers(s.layers.length ? s.layers : []); }
  }

  function save() {
    const path = sel ?? `stages/${form.name}.json`;
    const prev = project.files[path]?.kind === 'text' ? JSON.parse(project.files[path].text ?? '{}') : {};
    upsertText(path, JSON.stringify({
      ...prev, name: form.name, zoom: form.zoom, camX: form.camX, camY: form.camY,
      layers: layers.map(l => ({ id: l.id, image: l.image, x: l.x, y: l.y, scale: l.scale, scrollX: l.scrollX, scrollY: l.scrollY }))
    }, null, 2), 'application/json');
    toast(`Stage saved → ${path}`, 'ok');
  }

  async function uploadFor(layerId: string, files: FileList | null, slot: 'bg' | 'layer') {
    const f = files?.[0];
    if (!f) return;
    const path = `images/stages/${f.name}`;
    await upsertBinary(path, await f.arrayBuffer(), f.type);
    if (slot === 'bg') { /* stored, referenced below */ }
    setLayers(ls => ls.map(l => l.id === layerId ? { ...l, image: path } : l));
    toast(`Stored ${path}`, 'ok');
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Stage Editor</h1>
      <div className="grid2">
        <div className="panel">
          <h2>Stages ({stages.length})</h2>
          {stages.map(s => <div className="list-item" key={s.filePath}><span style={{ flex: 1 }}>{s.name}</span><button className="btn small" onClick={() => load(s.filePath)}>Edit</button></div>)}
          <h3>Stage</h3>
          <div className="row">
            <div className="field"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Zoom</label><input type="number" step="0.05" value={form.zoom} onChange={e => setForm({ ...form, zoom: Number(e.target.value) || 0.9 })} /></div>
            <div className="field"><label>Cam X</label><input type="number" value={form.camX} onChange={e => setForm({ ...form, camX: Number(e.target.value) || 0 })} /></div>
            <div className="field"><label>Cam Y</label><input type="number" value={form.camY} onChange={e => setForm({ ...form, camY: Number(e.target.value) || 0 })} /></div>
          </div>
          <button className="btn primary small" onClick={save}>💾 Save stage</button>
          <h3>Layers (back → front)</h3>
          {layers.map(l => (
            <div key={l.id} className="panel" style={{ padding: 10 }}>
              <div className="row">
                <div className="field"><label>ID</label><input value={l.id} onChange={e => setLayers(layers.map(x => x.id === l.id ? { ...x, id: e.target.value } : x))} /></div>
                <div className="field"><label>Image path</label><input value={l.image} style={{ minWidth: 200 }} onChange={e => setLayers(layers.map(x => x.id === l.id ? { ...x, image: e.target.value } : x))} /></div>
                <button className="btn small danger" onClick={() => setLayers(layers.filter(x => x.id !== l.id))}>✕</button>
              </div>
              <div className="row">
                {[['x', l.x], ['y', l.y], ['scale', l.scale], ['scrollX', l.scrollX], ['scrollY', l.scrollY]].map(([k, v]) => (
                  <div className="field" key={k as string} style={{ margin: 0 }}><label>{k}</label>
                    <input type="number" step="0.1" value={v as number} onChange={e => setLayers(layers.map(x => x.id === l.id ? { ...x, [k as string]: Number(e.target.value) || 0 } : x))} /></div>
                ))}
                <label className="btn small">Upload<input type="file" accept="image/*" className="hidden-input" onChange={e => void uploadFor(l.id, e.target.files, 'layer')} /></label>
              </div>
            </div>
          ))}
          <button className="btn small" onClick={() => setLayers([...layers, { id: `layer-${uid('l').slice(-4)}`, image: '', x: 0, y: 0, scale: 1, scrollX: 1, scrollY: 1 }])}>＋ Layer</button>
        </div>
        <div className="panel">
          <h2>Visual preview (zoom {form.zoom})</h2>
          <div style={{ position: 'relative', height: 380, overflow: 'hidden', borderRadius: 10, border: '1px solid var(--border)', background: 'linear-gradient(#0b1030,#3b1d5e 60%,#101020)' }}>
            {layers.map(l => {
              const u = l.image ? fileUrl(l.image) : null;
              return (
                <div key={l.id} style={{ position: 'absolute', left: `${50 + l.x / 20}%`, top: `${45 + l.y / 20}%`, transform: `translate(-50%,-50%) scale(${l.scale * form.zoom})`, opacity: 0.95, border: '1px dashed var(--border2)', padding: 6, fontSize: 11, color: 'var(--muted)', maxWidth: '70%' }}>
                  {u ? <img src={u} alt={l.id} style={{ maxWidth: 260, display: 'block', borderRadius: 6 }} /> : `⬚ ${l.id} — no image (parallax ${l.scrollX},${l.scrollY})`}
                  <div>{l.id}</div>
                </div>
              );
            })}
            <div style={{ position: 'absolute', left: '30%', bottom: 40 }}>🧍 DAD</div>
            <div style={{ position: 'absolute', left: '48%', bottom: 60 }}>🎤 GF</div>
            <div style={{ position: 'absolute', right: '28%', bottom: 40 }}>🧑 BF</div>
          </div>
          <p className="mut">Layer order = draw order. Character markers show approximate positions; exact Psych offsets live in the JSON.</p>
        </div>
      </div>
    </div>
  );
}
