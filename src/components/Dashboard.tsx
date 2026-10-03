import { useMemo, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { discoverSongs, discoverCharacters, discoverStages, discoverWeeks } from '../psych/importExport';
import { uid } from '../utils/helpers';

export default function Dashboard() {
  const { project, setView, setCurrentFile, newProject, openProject, projects, duplicateProject, deleteProject, toast, saveNow } = useStore();
  const [name, setName] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const stats = useMemo(() => {
    const songs = discoverSongs(project.files);
    const charts = Object.keys(project.files).filter(p => p.endsWith('.json') && (/data\//i.test(p) || /songs?\//i.test(p)));
    return {
      songs: songs.length,
      charts: charts.length,
      characters: discoverCharacters(project.files).length,
      stages: discoverStages(project.files).length,
      weeks: discoverWeeks(project.files).length
    };
  }, [project.files]);

  const recent = useMemo(() =>
    Object.values(project.files).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [project.files]);

  return (
    <div>
      <h1 style={{ margin: '0 0 4px' }}>{project.name}</h1>
      <p className="mut" style={{ marginTop: 0 }}>Psych Engine mod workspace · {Object.keys(project.files).length} files</p>
      <div className="cards">
        {[['🎵 Songs', stats.songs], ['🎹 Charts', stats.charts], ['🧍 Characters', stats.characters], ['🖼 Stages', stats.stages], ['📅 Weeks', stats.weeks]].map(([l, v]) => (
          <div className="card" key={l as string}><h3>{l}</h3><div className="big">{v}</div></div>
        ))}
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="panel">
          <h2>Quick actions</h2>
          <div className="row">
            <button className="btn primary" onClick={() => setView('songs')}>＋ New Song</button>
            <button className="btn" onClick={() => setView('charteditor')}>🎼 Open Chart Editor</button>
            <button className="btn" onClick={() => setView('characters')}>🧍 Add Character</button>
            <button className="btn" onClick={() => setView('stages')}>🖼 Add Stage</button>
            <button className="btn" onClick={() => setView('ai')}>✨ AI Assistant</button>
          </div>
          <h3>New project</h3>
          <div className="row">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Mod name…" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px' }} />
            <button className="btn" onClick={() => { void newProject(name || `Mod ${projects.length + 1}`).then(() => toast('Project created.', 'ok')); setName(''); }}>Create</button>
            <button className="btn" onClick={() => void saveNow()}>💾 Save now</button>
          </div>
        </div>
        <div className="panel">
          <h2>Recent files</h2>
          {recent.length === 0 && <p className="mut">No files yet.</p>}
          {recent.map(f => (
            <div className="list-item" key={f.path}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.path}</span>
              <button className="btn small" onClick={() => { setCurrentFile(f.path); setView(f.path.includes('data/') || f.path.includes('songs/') ? 'charteditor' : 'assets'); }}>Open</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Local projects</h2>
        {projects.length === 0 && <p className="mut">Only the current in-memory project. Press Save to persist it.</p>}
        {projects.map(p => (
          <div className="list-item" key={p.id}>
            <span style={{ flex: 1 }}>{p.name} <span className="mut">· {new Date(p.updatedAt).toLocaleString()}</span></span>
            {p.id !== project.id && <button className="btn small" onClick={() => { void openProject(p.id).then(() => toast('Project opened.', 'ok')).catch(e => toast(String(e), 'error')); }}>Open</button>}
            <button className="btn small" onClick={() => { void duplicateProject(p.id).then(() => toast('Duplicated.', 'ok')); }}>Duplicate</button>
            {confirmDel === p.id
              ? <><button className="btn small danger" onClick={() => { void deleteProject(p.id).then(() => toast('Deleted.', 'ok')); setConfirmDel(null); }}>Confirm delete</button><button className="btn small ghost" onClick={() => setConfirmDel(null)}>Cancel</button></>
              : <button className="btn small danger" onClick={() => setConfirmDel(p.id)}>Delete</button>}
          </div>
        ))}
        <p className="mut">Projects persist in IndexedDB/localStorage and survive refreshes. Rename via the top bar. Key: <span className="kbd">{uid('example').slice(0, 8)}…</span></p>
      </div>
    </div>
  );
}
