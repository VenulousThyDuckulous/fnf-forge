import { useMemo, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { discoverDialogues } from '../psych/importExport';
import type { DialogueLine } from '../types';
import { downloadBlob } from '../utils/helpers';

export default function DialogueEditor() {
  const { project, upsertText, toast } = useStore();
  const files = useMemo(() => discoverDialogues(project.files), [project.files]);
  const [sel, setSel] = useState<string | null>(files[0]?.filePath ?? null);
  const cur = files.find(f => f.filePath === sel);
  const [lines, setLines] = useState<DialogueLine[]>(cur?.lines ?? [{ speaker: 'dad', text: 'Beep!', portrait: '', position: 'left', background: '' }]);
  const [preview, setPreview] = useState(0);

  function load(fp: string) {
    const f = files.find(x => x.filePath === fp);
    setSel(fp);
    setLines(f?.lines ?? []);
    setPreview(0);
  }

  function save() {
    const path = sel ?? `data/dialogue-${Date.now().toString(36)}.json`;
    upsertText(path, JSON.stringify({ dialogue: lines }, null, 2), 'application/json');
    toast(`Dialogue saved → ${path}`, 'ok');
  }

  const line = lines[preview];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dialogue Editor</h1>
      <div className="grid2">
        <div className="panel">
          <h2>Dialogue files ({files.length})</h2>
          {files.map(f => <div className="list-item" key={f.filePath}><span style={{ flex: 1 }}>{f.name} <span className="mut">· {f.lines.length} lines</span></span><button className="btn small" onClick={() => load(f.filePath)}>Edit</button></div>)}
          <div className="row">
            <button className="btn small" onClick={() => { setSel(null); setLines([{ speaker: 'dad', text: '', portrait: '', position: 'left', background: '' }]); }}>＋ New dialogue</button>
            <button className="btn small primary" onClick={save}>💾 Save</button>
            <button className="btn small" onClick={() => downloadBlob(new Blob([JSON.stringify({ dialogue: lines }, null, 2)], { type: 'application/json' }), 'dialogue.json')}>⬇ Export</button>
          </div>
          <h3>Lines</h3>
          {lines.map((l, i) => (
            <div key={i} className="panel" style={{ padding: 10 }}>
              <div className="row">
                <div className="field"><label>Speaker</label><input value={l.speaker} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, speaker: e.target.value } : x))} /></div>
                <div className="field"><label>Position</label>
                  <select value={l.position} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, position: e.target.value as DialogueLine['position'] } : x))}>
                    <option value="left">left</option><option value="center">center</option><option value="right">right</option>
                  </select></div>
                <div className="field"><label>Portrait</label><input value={l.portrait} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, portrait: e.target.value } : x))} /></div>
                <button className="btn small danger" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
              </div>
              <div className="field"><label>Text</label><textarea rows={2} value={l.text} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} /></div>
            </div>
          ))}
          <button className="btn small" onClick={() => setLines([...lines, { speaker: 'bf', text: '', portrait: '', position: 'left', background: '' }])}>＋ Line</button>
        </div>
        <div className="panel">
          <h2>Preview</h2>
          <div style={{ background: '#05060c', border: '1px solid var(--border)', borderRadius: 10, padding: 16, minHeight: 220 }}>
            {line ? (
              <>
                <div className="tag">{line.speaker} · {line.position}</div>
                <p style={{ fontSize: 17, fontFamily: 'monospace' }}>{line.text || <span className="mut">(empty line)</span>}</p>
                <p className="mut">▼ press Z to continue</p>
              </>
            ) : <p className="mut">No lines.</p>}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" disabled={preview <= 0} onClick={() => setPreview(p => Math.max(0, p - 1))}>← Prev</button>
            <span className="tag">{lines.length ? `${preview + 1}/${lines.length}` : '0/0'}</span>
            <button className="btn small" disabled={preview >= lines.length - 1} onClick={() => setPreview(p => Math.min(lines.length - 1, p + 1))}>Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
