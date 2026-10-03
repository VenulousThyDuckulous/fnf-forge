import { useRef, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { filesFromZip, filesFromFileList, zipFromFiles } from '../psych/importExport';
import { downloadBlob } from '../utils/helpers';

export default function TopBar() {
  const { project, renameProject, saveNow, undo, redo, canUndo, canRedo, setView, setCurrentFile, toast, replaceAllFiles, saveStatus } = useStore();
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  async function onZip(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const files = await filesFromZip(await f.arrayBuffer());
      const n = Object.keys(files).length;
      if (n === 0) { toast('ZIP contained no readable files.', 'error'); return; }
      replaceAllFiles(files);
      toast(`Imported ${n} files from ${f.name}.`, 'ok');
    } catch (err) { toast(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
  }

  async function onFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    e.target.value = '';
    if (!list || list.length === 0) return;
    try {
      const files = await filesFromFileList(list);
      replaceAllFiles(files);
      toast(`Imported ${Object.keys(files).length} files from folder.`, 'ok');
    } catch (err) { toast(`Folder import failed: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
  }

  async function onExport() {
    try {
      const blob = await zipFromFiles(project.files, project.name.replace(/[^\w\-]+/g, '-').toLowerCase() || 'mod');
      downloadBlob(blob, `${project.name.replace(/[^\w\-]+/g, '-').toLowerCase() || 'mod'}.zip`);
      toast('Mod exported as ZIP.', 'ok');
    } catch (err) { toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
  }

  return (
    <header className="topbar">
      <div className="logo"><span className="badge">🎤 FORGE</span><span>FNF Mod Forge</span></div>
      <input className="projname" value={project.name} onChange={e => renameProject(e.target.value)} title="Project / mod name" />
      <span className="tag">{saveStatus}</span>
      <div style={{ flex: 1 }} />
      <button className="btn small" onClick={() => { void saveNow(); }} title="Save to browser storage">💾 Save</button>
      <button className="btn small" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">↩ Undo</button>
      <button className="btn small" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">↪ Redo</button>
      <button className="btn small" onClick={() => zipRef.current?.click()} title="Import mod ZIP">📥 Import</button>
      <button className="btn small" onClick={() => folderRef.current?.click()} title="Import mod folder (uses file picker)">📁 Folder</button>
      <button className="btn small primary" onClick={() => void onExport()} title="Export full mod ZIP">📦 Export Mod</button>
      <button className="btn small" onClick={() => setPreviewOpen(true)} title="Preview project summary">👁 Preview</button>
      <input ref={zipRef} type="file" accept=".zip" className="hidden-input" onChange={onZip} />
      <input ref={folderRef} type="file" className="hidden-input" multiple onChange={onFolder} {...{ webkitdirectory: '', directory: '' } as Record<string, string>} />
      {previewOpen && (
        <div className="modal-ov" onClick={() => setPreviewOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Mod preview — {project.name}</h3>
            <p className="mut">{Object.keys(project.files).length} files in project.</p>
            <pre className="code">{Object.keys(project.files).sort().slice(0, 60).join('\n')}{Object.keys(project.files).length > 60 ? '\n…' : ''}</pre>
            <div className="row">
              <button className="btn" onClick={() => { setPreviewOpen(false); setView('charteditor'); }}>Open Chart Editor</button>
              <button className="btn" onClick={() => { setPreviewOpen(false); setCurrentFile(null); setView('assets'); }}>Open Assets</button>
              <button className="btn ghost" onClick={() => setPreviewOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
