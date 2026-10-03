import { useMemo, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { discoverCharacters } from '../psych/importExport';
import type { CharAnimation } from '../types';

export default function CharacterEditor() {
  const { project, upsertText, upsertBinary, fileUrl, toast, setView, setCurrentFile } = useStore();
  const chars = useMemo(() => discoverCharacters(project.files), [project.files]);
  const [sel, setSel] = useState<string | null>(chars[0]?.filePath ?? null);
  const [form, setForm] = useState({ name: 'my-char', x: 100, y: 400, scale: 1, flipX: false });
  const [anims, setAnims] = useState<CharAnimation[]>([{ name: 'idle', prefix: 'idle', fps: 24, loop: true, indices: [] }]);

  const cur = chars.find(c => c.filePath === sel);

  function load(c: NonNullable<typeof cur>) {
    setSel(c.filePath);
    setForm({ name: c.name, x: c.x, y: c.y, scale: c.scale, flipX: c.flipX });
    setAnims(c.animations.length ? c.animations : [{ name: 'idle', prefix: 'idle', fps: 24, loop: true, indices: [] }]);
  }

  function save() {
    const path = sel ?? `characters/${form.name}.json`;
    const prev = project.files[path]?.kind === 'text' ? JSON.parse(project.files[path].text ?? '{}') : {};
    const out = {
      ...prev, name: form.name, x: form.x, y: form.y, scale: form.scale, flip_x: form.flipX,
      animations: anims.map(a => ({ anim: a.name, name: a.prefix, fps: a.fps, loop: a.loop, indices: a.indices }))
    };
    upsertText(path, JSON.stringify(out, null, 2), 'application/json');
    toast(`Character saved → ${path}`, 'ok');
  }

  async function uploadSprite(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const path = `images/characters/${form.name}.${f.name.split('.').pop()}`;
    await upsertBinary(path, await f.arrayBuffer(), f.type);
    toast(`Sprite stored → ${path}. Configure frames in Sprite Tool.`, 'ok');
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Character Creator</h1>
      <div className="grid2">
        <div className="panel">
          <h2>Characters ({chars.length})</h2>
          {chars.map(c => <div className="list-item" key={c.filePath}><span style={{ flex: 1 }}>{c.displayName} <span className="mut">{c.filePath}</span></span><button className="btn small" onClick={() => load(c)}>Edit</button></div>)}
          <h3>New / editing</h3>
          <div className="row">
            <div className="field"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>X</label><input type="number" value={form.x} onChange={e => setForm({ ...form, x: Number(e.target.value) })} /></div>
            <div className="field"><label>Y</label><input type="number" value={form.y} onChange={e => setForm({ ...form, y: Number(e.target.value) })} /></div>
            <div className="field"><label>Scale</label><input type="number" step="0.1" value={form.scale} onChange={e => setForm({ ...form, scale: Number(e.target.value) || 1 })} /></div>
          </div>
          <label className="pill"><input type="checkbox" checked={form.flipX} onChange={e => setForm({ ...form, flipX: e.target.checked })} /> Flip X</label>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary small" onClick={save}>💾 Save character JSON</button>
            <label className="btn small">Upload sprite<input type="file" accept="image/*" className="hidden-input" onChange={e => void uploadSprite(e.target.files)} /></label>
            <button className="btn small" onClick={() => { setCurrentFile(sel); setView('sprite'); }}>Open Sprite Tool →</button>
          </div>
          <p className="mut">We do not pretend a random image is a perfect FNF spritesheet — use the Sprite Tool to slice frames and set FPS/loop/order, then reference the XML/frames here.</p>
        </div>
        <div className="panel">
          <h2>Animations</h2>
          {anims.map((a, i) => (
            <div key={i} className="panel" style={{ padding: 10 }}>
              <div className="row">
                <div className="field"><label>Anim</label><input value={a.name} onChange={e => setAnims(anims.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
                <div className="field"><label>Prefix</label><input value={a.prefix} onChange={e => setAnims(anims.map((x, j) => j === i ? { ...x, prefix: e.target.value } : x))} /></div>
                <div className="field"><label>FPS</label><input type="number" value={a.fps} onChange={e => setAnims(anims.map((x, j) => j === i ? { ...x, fps: Number(e.target.value) || 24 } : x))} /></div>
                <label className="pill"><input type="checkbox" checked={a.loop} onChange={e => setAnims(anims.map((x, j) => j === i ? { ...x, loop: e.target.checked } : x))} /> Loop</label>
                <button className="btn small danger" onClick={() => setAnims(anims.filter((_, j) => j !== i))}>✕</button>
              </div>
            </div>
          ))}
          <button className="btn small" onClick={() => setAnims([...anims, { name: 'singLEFT', prefix: 'singLEFT', fps: 24, loop: false, indices: [] }])}>＋ Animation</button>
          {cur?.spritePath && <p className="mut">Sprite ref: <span className="kbd">{cur.spritePath}</span></p>}
          {sel && fileUrl(sel.replace('.json', '.png')) && <img src={fileUrl(sel.replace('.json', '.png')) ?? ''} alt="" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />}
        </div>
      </div>
    </div>
  );
}
