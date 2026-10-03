import { useStore } from '../store/ProjectContext';
import type { ViewId } from '../types';

const PROJ: { id: ViewId; label: string; ico: string }[] = [
  { id: 'dashboard', label: 'Dashboard', ico: '🏠' },
  { id: 'songs', label: 'Songs', ico: '🎵' },
  { id: 'charts', label: 'Charts', ico: '🎹' },
  { id: 'characters', label: 'Characters', ico: '🧍' },
  { id: 'stages', label: 'Stages', ico: '🖼' },
  { id: 'weeks', label: 'Weeks', ico: '📅' },
  { id: 'dialogue', label: 'Dialogue', ico: '💬' },
  { id: 'assets', label: 'Assets', ico: '📁' }
];
const TOOLS: { id: ViewId; label: string; ico: string }[] = [
  { id: 'ai', label: 'AI Assistant', ico: '✨' },
  { id: 'charteditor', label: 'Chart Editor', ico: '🎼' },
  { id: 'sprite', label: 'Sprite Tool', ico: '🧩' },
  { id: 'soundfont', label: 'Soundfont Tool', ico: '🎺' },
  { id: 'audio', label: 'Audio Tool', ico: '🔊' }
];

export default function Sidebar() {
  const { view, setView } = useStore();
  return (
    <nav className="sidebar">
      <div className="side-h">PROJECT</div>
      {PROJ.map(p => (
        <button key={p.id} className={`navitem ${view === p.id ? 'active' : ''}`} onClick={() => setView(p.id)} title={p.label}>
          <span className="ico">{p.ico}</span><span className="lbl">{p.label}</span>
        </button>
      ))}
      <div className="side-h">TOOLS</div>
      {TOOLS.map(p => (
        <button key={p.id} className={`navitem ${view === p.id ? 'active' : ''}`} onClick={() => setView(p.id)} title={p.label}>
          <span className="ico">{p.ico}</span><span className="lbl">{p.label}</span>
        </button>
      ))}
      <div className="side-h">SYSTEM</div>
      <button className={`navitem ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')} title="Settings">
        <span className="ico">⚙</span><span className="lbl">Settings</span>
      </button>
    </nav>
  );
}
