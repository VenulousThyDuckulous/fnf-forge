import { useStore } from '../store/ProjectContext';

export default function StatusBar() {
  const { project, currentFile, saveStatus, dirty, errors } = useStore();
  const n = Object.keys(project.files).length;
  return (
    <footer className="statusbar">
      <span><span className={`dot ${dirty ? 'dirty' : ''}`} />{dirty ? 'Modified' : 'Clean'} · {n} files</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentFile ?? 'No file selected'}</span>
      <span>{saveStatus}</span>
      <span className={errors.length ? 'err' : ''}>{errors.length ? `${errors.length} error(s)` : 'No errors'}</span>
    </footer>
  );
}
