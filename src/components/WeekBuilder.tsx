import { useMemo, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { discoverSongs, discoverWeeks } from '../psych/importExport';

export default function WeekBuilder() {
  const { project, upsertText, toast } = useStore();
  const weeks = useMemo(() => discoverWeeks(project.files), [project.files]);
  const songs = useMemo(() => discoverSongs(project.files), [project.files]);
  const [sel, setSel] = useState<string | null>(weeks[0]?.filePath ?? null);
  const cur = weeks.find(w => w.filePath === sel);
  const [form, setForm] = useState({ name: 'Week 1', opponent: 'dad', menuChar: 'dad', background: 'stage', unlocked: true });
  const [list, setList] = useState<string[]>(cur?.songs ?? (songs[0] ? [songs[0].name] : ['tutorial']));
  const [drag, setDrag] = useState<number | null>(null);

  function load(fp: string) {
    const w = weeks.find(x => x.filePath === fp);
    setSel(fp);
    if (w) { setForm({ name: w.name, opponent: w.opponent, menuChar: w.menuChar, background: w.background, unlocked: w.unlocked }); setList(w.songs); }
  }

  function save() {
    const path = sel ?? `weeks/${form.name.toLowerCase().replace(/[^\w]+/g, '-')}.json`;
    const prev = project.files[path]?.kind === 'text' ? JSON.parse(project.files[path].text ?? '{}') : {};
    upsertText(path, JSON.stringify({
      ...prev, name: form.name, songs: list.map(s => [s, 'dad', [0, 0, 0]]),
      opponent: form.opponent, menuChar: form.menuChar, background: form.background, locked: !form.unlocked
    }, null, 2), 'application/json');
    toast(`Week saved → ${path}`, 'ok');
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Week Builder</h1>
      <div className="grid2">
        <div className="panel">
          <h2>Weeks ({weeks.length})</h2>
          {weeks.map(w => <div className="list-item" key={w.filePath}><span style={{ flex: 1 }}>{w.name} <span className="mut">· {w.songs.length} songs</span></span><button className="btn small" onClick={() => load(w.filePath)}>Edit</button></div>)}
          <h3>Week details</h3>
          <div className="row">
            <div className="field"><label>Week name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Opponent</label><input value={form.opponent} onChange={e => setForm({ ...form, opponent: e.target.value })} /></div>
            <div className="field"><label>Menu character</label><input value={form.menuChar} onChange={e => setForm({ ...form, menuChar: e.target.value })} /></div>
            <div className="field"><label>Background</label><input value={form.background} onChange={e => setForm({ ...form, background: e.target.value })} /></div>
          </div>
          <label className="pill"><input type="checkbox" checked={form.unlocked} onChange={e => setForm({ ...form, unlocked: e.target.checked })} /> Unlocked from start</label>
          <div className="row" style={{ marginTop: 8 }}><button className="btn primary small" onClick={save}>💾 Save week</button></div>
        </div>
        <div className="panel">
          <h2>Song order (drag to reorder)</h2>
          {list.map((s, i) => (
            <div key={`${s}-${i}`} className="list-item" draggable
              onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (drag === null) return;
                const n = [...list]; const [m] = n.splice(drag, 1); n.splice(i, 0, m);
                setList(n); setDrag(null);
              }}>
              <span style={{ cursor: 'grab' }}>☰</span>
              <span style={{ flex: 1 }}><b>{i + 1}.</b> {s}</span>
              <button className="btn small" onClick={() => setList(list.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <div className="row">
            <select id="week-add" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 8px' }}>
              {songs.map(s => <option key={s.id} value={s.name}>{s.displayName}</option>)}
            </select>
            <button className="btn small" onClick={() => {
              const el = document.getElementById('week-add') as HTMLSelectElement | null;
              if (el?.value) setList([...list, el.value]);
            }}>＋ Add song</button>
          </div>
          {songs.length === 0 && <p className="mut">No songs yet — create one in Song Studio first.</p>}
        </div>
      </div>
    </div>
  );
}
