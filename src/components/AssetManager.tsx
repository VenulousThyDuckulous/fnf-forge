import { useMemo, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { commonRootOf } from '../psych/importExport';
import { downloadBlob, baseOf, isAudioPath, isImagePath, extOf } from '../utils/helpers';

export default function AssetManager() {
  const { project, removePath, renamePath, upsertBinary, upsertText, fileUrl, toast, setCurrentFile, setView } = useStore();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const paths = useMemo(() => Object.keys(project.files).sort().filter(p => {
    if (q && !p.toLowerCase().includes(q.toLowerCase())) return false;
    if (kind === 'images') return isImagePath(p);
    if (kind === 'audio') return isAudioPath(p);
    if (kind === 'json') return extOf(p) === 'json';
    if (kind === 'code') return ['lua', 'xml', 'hx', 'txt'].includes(extOf(p));
    return true;
  }), [project.files, q, kind]);

  const pv = preview ? project.files[preview] : undefined;
  const pvUrl = preview ? fileUrl(preview) : null;
  const nestedRoot = useMemo(() => commonRootOf(Object.keys(project.files)), [project.files]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Asset Manager <span className="tag">{paths.length} files</span></h1>
      {nestedRoot && (
        <div className="panel" style={{ borderColor: 'var(--warn)' }}>
          <b>⚠ Everything is nested inside “{nestedRoot}/”.</b>
          <p className="mut" style={{ margin: '4px 0 8px' }}>Song/chart/week detection needs Psych Engine folders at the top level. Strip the wrapper folder to fix detection and audio playback.</p>
          <button className="btn small primary" onClick={() => {
            for (const p of Object.keys(project.files)) {
              if (p.startsWith(nestedRoot + '/')) renamePath(p, p.slice(nestedRoot.length + 1));
            }
            toast(`Stripped “${nestedRoot}/” — structure fixed.`, 'ok');
          }}>🔧 Strip “{nestedRoot}/” & fix structure</button>
        </div>
      )}
      <div className="panel">
        <div className="row">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter files…" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', minWidth: 220 }} />
          <select value={kind} onChange={e => setKind(e.target.value)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px' }}>
            <option value="all">All</option><option value="images">Images</option><option value="audio">Audio</option><option value="json">JSON</option><option value="code">Lua/XML/etc</option>
          </select>
          <label className="btn small">＋ Add files<input type="file" multiple className="hidden-input" onChange={async e => {
            const list = e.target.files;
            if (!list) return;
            for (const f of Array.from(list)) {
              const textish = /\.(json|txt|lua|xml|md|hx)$/i.test(f.name);
              if (textish) upsertText(`assets/${f.name}`, await f.text());
              else await upsertBinary(`assets/${f.name}`, await f.arrayBuffer(), f.type);
            }
            toast(`Added ${list.length} file(s).`, 'ok');
          }} /></label>
        </div>
      </div>
      <div className="panel">
        <table className="tbl"><thead><tr><th>Path</th><th>Kind</th><th>Size</th><th>Actions</th></tr></thead>
          <tbody>{paths.slice(0, 400).map(p => {
            const f = project.files[p];
            return (
              <tr key={p}>
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</td>
                <td><span className="tag">{f.kind}/{extOf(p) || '?'}</span></td>
                <td className="mut">{f.kind === 'text' ? `${(f.text ?? '').length} ch` : `${(f.size / 1024).toFixed(1)} KB`}</td>
                <td><div className="row">
                  <button className="btn small" onClick={() => setPreview(p)}>Preview</button>
                  <button className="btn small" onClick={() => {
                    const np = prompt('Rename to:', p);
                    if (np && np !== p) { renamePath(p, np); toast('Renamed.', 'ok'); }
                  }}>Rename</button>
                  <button className="btn small" onClick={() => {
                    const blob = f.kind === 'text' ? new Blob([f.text ?? ''], { type: 'text/plain' }) : new Blob([f.data ?? new ArrayBuffer(0)], { type: f.mime });
                    downloadBlob(blob, baseOf(p));
                  }}>Download</button>
                  <label className="btn small">Replace<input type="file" className="hidden-input" onChange={async e => {
                    const nf = e.target.files?.[0];
                    if (!nf) return;
                    if (f.kind === 'text') upsertText(p, await nf.text());
                    else await upsertBinary(p, await nf.arrayBuffer(), nf.type);
                    toast('Replaced.', 'ok');
                  }} /></label>
                  {confirm === p
                    ? <><button className="btn small danger" onClick={() => { removePath(p); setConfirm(null); toast('Deleted.', 'ok'); }}>Confirm</button><button className="btn small ghost" onClick={() => setConfirm(null)}>Cancel</button></>
                    : <button className="btn small danger" onClick={() => setConfirm(p)}>Delete</button>}
                </div></td>
              </tr>
            );
          })}</tbody></table>
        {paths.length > 400 && <p className="mut">Showing first 400 — refine the filter.</p>}
      </div>
      {preview && pv && (
        <div className="modal-ov" onClick={() => setPreview(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 360 }}>
            <h3 style={{ marginTop: 0 }}>{preview}</h3>
            {pv.kind === 'text' && <pre className="code">{(pv.text ?? '').slice(0, 8000)}</pre>}
            {pv.kind === 'binary' && isImagePath(preview) && pvUrl && <img src={pvUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />}
            {pv.kind === 'binary' && isAudioPath(preview) && pvUrl && <audio controls src={pvUrl} style={{ width: '100%' }} />}
            {pv.kind === 'binary' && !isImagePath(preview) && !isAudioPath(preview) && <p className="mut">Binary preview not available. Download to inspect.</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => { setCurrentFile(preview); setView(preview.endsWith('.json') ? 'charteditor' : 'assets'); setPreview(null); }}>Open</button>
              <button className="btn small ghost" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
