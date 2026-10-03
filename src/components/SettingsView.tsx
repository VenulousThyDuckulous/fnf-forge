import { useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { listLocalProjects } from '../storage/db';

export default function SettingsView() {
  const { settings, setSettings, toast, newProject } = useStore();
  const [confirm, setConfirm] = useState(false);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      <div className="grid2">
        <div className="panel">
          <h2>Editor</h2>
          <div className="field"><label>Theme</label>
            <select value={settings.theme} onChange={e => setSettings({ theme: e.target.value as 'dark' | 'darker' | 'light' })}>
              <option value="dark">Dark (default)</option><option value="darker">Darker</option><option value="light">Light</option>
            </select></div>
          <div className="field"><label>Grid color</label><input type="color" value={settings.gridColor} onChange={e => setSettings({ gridColor: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label>Default BPM</label><input type="number" value={settings.defaultBpm} onChange={e => setSettings({ defaultBpm: Number(e.target.value) || 150 })} /></div>
            <div className="field"><label>Default scroll speed</label><input type="number" step="0.1" value={settings.defaultScroll} onChange={e => setSettings({ defaultScroll: Number(e.target.value) || 1 })} /></div>
          </div>
          <label className="pill"><input type="checkbox" checked={settings.autosave} onChange={e => setSettings({ autosave: e.target.checked })} /> Autosave to browser storage</label>
          <h3>Lane colors</h3>
          <div className="row">
            {settings.laneColors.map((c, i) => (
              <input key={i} type="color" value={c} title={`Lane ${i}`} onChange={e => setSettings({ laneColors: settings.laneColors.map((x, j) => j === i ? e.target.value : x) })} />
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>AI provider (your own key, stored locally)</h2>
          <div className="field"><label>API endpoint (OpenAI-compatible base URL)</label>
            <input value={settings.aiEndpoint} onChange={e => setSettings({ aiEndpoint: e.target.value })} placeholder="https://api.openai.com/v1" /></div>
          <div className="field"><label>API key (never hard-coded, never committed)</label>
            <input type="password" value={settings.aiKey} onChange={e => setSettings({ aiKey: e.target.value })} placeholder="sk-…" /></div>
          <div className="field"><label>Model</label><input value={settings.aiModel} onChange={e => setSettings({ aiModel: e.target.value })} placeholder="gpt-4o-mini" /></div>
          <p className="mut">Without an endpoint + key, the app uses the built-in offline procedural generator. No request ever leaves your browser unless you configure a provider.</p>
          <h2>Danger zone</h2>
          {confirm
            ? <div className="row"><button className="btn danger small" onClick={() => {
                localStorage.removeItem('fnfmf-projects-v1');
                try { indexedDB.deleteDatabase('fnf-mod-forge-db'); } catch { /* ignore */ }
                toast(`Cleared ${listLocalProjects().length} local project(s). Reloading…`, 'ok');
                setTimeout(() => location.reload(), 800);
              }}>Confirm: wipe all local projects</button>
              <button className="btn small ghost" onClick={() => setConfirm(false)}>Cancel</button></div>
            : <div className="row"><button className="btn danger small" onClick={() => setConfirm(true)}>Clear local projects…</button>
              <button className="btn small" onClick={() => void newProject('Fresh Mod').then(() => toast('Fresh project ready.', 'ok'))}>Reset to template</button></div>}
          <h3>Shortcuts</h3>
          <p className="mut"><span className="kbd">Space</span> play/pause · <span className="kbd">D F J K</span> lanes · <span className="kbd">Ctrl+Z</span>/<span className="kbd">Ctrl+Y</span> undo/redo · <span className="kbd">[</span>/<span className="kbd">]</span> sections · <span className="kbd">Del</span> delete</p>
        </div>
      </div>
    </div>
  );
}
