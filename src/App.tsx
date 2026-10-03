import { useStore } from './store/ProjectContext';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import Dashboard from './components/Dashboard';
import SongStudio from './components/SongStudio';
import ChartEditor from './components/ChartEditor';
import CharacterEditor from './components/CharacterEditor';
import SpriteTool from './components/SpriteTool';
import StageEditor from './components/StageEditor';
import WeekBuilder from './components/WeekBuilder';
import DialogueEditor from './components/DialogueEditor';
import SoundfontTool from './components/SoundfontTool';
import AudioTool from './components/AudioTool';
import AssetManager from './components/AssetManager';
import AiAssistant from './components/AiAssistant';
import SettingsView from './components/SettingsView';

export default function App() {
  const { view, toasts, dismissToast } = useStore();
  return (
    <div className="app">
      <TopBar />
      <div className="layout">
        <Sidebar />
        <div className="main">
          <div className="view">
            {view === 'dashboard' && <Dashboard />}
            {view === 'songs' && <SongStudio />}
            {view === 'charts' && <ChartEditor standalone />}
            {view === 'charteditor' && <ChartEditor standalone />}
            {view === 'characters' && <CharacterEditor />}
            {view === 'sprite' && <SpriteTool />}
            {view === 'stages' && <StageEditor />}
            {view === 'weeks' && <WeekBuilder />}
            {view === 'dialogue' && <DialogueEditor />}
            {view === 'soundfont' && <SoundfontTool />}
            {view === 'audio' && <AudioTool />}
            {view === 'assets' && <AssetManager />}
            {view === 'ai' && <AiAssistant />}
            {view === 'settings' && <SettingsView />}
          </div>
          <StatusBar />
        </div>
      </div>
      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
            <div><button className="btn small ghost" onClick={() => dismissToast(t.id)}>Dismiss</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
