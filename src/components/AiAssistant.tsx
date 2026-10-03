import { useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { localProvider, openAiLikeProvider } from '../ai/providers';

const IDEAS = [
  'Give me a song concept for a haunted-arcade week.',
  'Write a 4-line dialogue between Dad and BF.',
  'Design a stage concept: rooftop at night.',
  'Suggest a week structure with 3 songs and unlocks.',
  'Write a mod description for the gamebanana page.',
  'Suggest chart events for a blackout drop.'
];

export default function AiAssistant() {
  const { project, settings, setView } = useStore();
  const [prompt, setPrompt] = useState(IDEAS[0]);
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setOut('');
    const ctx = {
      projectName: project.name,
      files: Object.keys(project.files).slice(0, 80),
      fileCount: Object.keys(project.files).length
    };
    const opts = {
      endpoint: settings.aiEndpoint, apiKey: settings.aiKey, model: settings.aiModel,
      systemPrompt: `You help design Friday Night Funkin' Psych Engine mods. Project: ${project.name}. Files: ${ctx.files.join(', ')}. Be concrete and practical.`,
      prompt, context: ctx as unknown as Record<string, unknown>
    };
    try {
      if (openAiLikeProvider.isConfigured(opts)) setOut(await openAiLikeProvider.generate(opts));
      else setOut(await localProvider.generate(opts));
    } catch (e) {
      setOut(`Error: ${e instanceof Error ? e.message : e}\n\nFalling back to the offline generator…\n\n` + await localProvider.generate(opts).catch(() => 'Offline generator failed.'));
    } finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>✨ AI Mod Assistant</h1>
      <div className="grid2">
        <div className="panel">
          <div className="field"><label>Ask for song concepts, weeks, dialogue, characters, stages, events…</label>
            <textarea rows={5} value={prompt} onChange={e => setPrompt(e.target.value)} /></div>
          <div className="row">
            <button className="btn primary small" disabled={busy || !prompt.trim()} onClick={() => void run()}>{busy ? 'Thinking…' : 'Generate'}</button>
            <button className="btn small" onClick={() => setView('settings')}>⚙ Provider settings</button>
          </div>
          <h3>Try</h3>
          {IDEAS.map(i => <div key={i}><button className="btn small ghost" style={{ marginBottom: 4 }} onClick={() => setPrompt(i)}>{i}</button></div>)}
          <p className="mut">Provider: {settings.aiEndpoint ? 'custom endpoint' : 'none'} → {settings.aiEndpoint && settings.aiKey ? 'remote' : 'offline local generator'}. Keys stay in your browser (Settings → never in source).</p>
        </div>
        <div className="panel">
          <h2>Result</h2>
          {out ? <pre className="code" style={{ maxHeight: 520, whiteSpace: 'pre-wrap' }}>{out}</pre> : <p className="mut">Results appear here.</p>}
        </div>
      </div>
    </div>
  );
}
