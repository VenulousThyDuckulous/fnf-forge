import { useState } from 'react';
import { useStore } from '../store/ProjectContext';
import { parseSf2 } from '../sf2/sf2parser';
import type { Sf2Info } from '../sf2/sf2parser';
import { previewTone } from '../audio/engine';

export default function SoundfontTool() {
  const { upsertBinary, toast } = useStore();
  const [info, setInfo] = useState<Sf2Info | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<number>(0);

  async function onFile(files: FileList | null) {
    const f = files?.[0];
    setErr(''); setInfo(null);
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseSf2(buf, f.name);
      setInfo(parsed);
      setSel(0);
      await upsertBinary(`soundfonts/${f.name}`, buf, 'audio/x-soundfont').catch(() => undefined);
      toast(`SF2 cataloged: ${parsed.presets.length} presets.`, 'ok');
    } catch (e) {
      setErr('Could not load this SF2 file. The file may be malformed or this browser may not support the required audio feature.');
      toast(`SF2 failed: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  const presets = (info?.presets ?? []).filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  const current = presets[sel];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Soundfont Tool</h1>
      <div className="grid2">
        <div className="panel">
          <label className="btn primary small">Upload .sf2<input type="file" accept=".sf2" className="hidden-input" onChange={e => void onFile(e.target.files)} /></label>
          {err && <p className="err">{err}</p>}
          {info && (
            <>
              <h3>{info.fileName} · {(info.size / 1024).toFixed(1)} KB</h3>
              <div className="field"><label>Filter presets</label><input value={filter} onChange={e => { setFilter(e.target.value); setSel(0); }} placeholder="grand piano…" /></div>
              <div style={{ maxHeight: 380, overflow: 'auto' }}>
                <table className="tbl"><thead><tr><th>Preset</th><th>Bank:Prog</th><th>Instrument</th></tr></thead>
                  <tbody>{presets.slice(0, 300).map((p, i) => (
                    <tr key={`${p.bank}:${p.preset}:${i}`} onClick={() => setSel(i)} style={{ cursor: 'pointer', background: i === sel ? 'var(--panel2)' : undefined }}>
                      <td>{p.name}</td><td className="mut">{p.bank}:{p.preset}</td><td className="mut">{p.instrument}</td>
                    </tr>
                  ))}</tbody></table>
              </div>
              {info.warnings.map((w, i) => <p key={i} className="mut">⚠ {w}</p>)}
            </>
          )}
          {!info && !err && <p className="mut">Upload a SoundFont to inspect presets/instruments. Parsing is 100% local (no CDN). Bundled with Vite — works offline on GitHub Pages.</p>}
        </div>
        <div className="panel">
          <h2>Preview</h2>
          {current ? (
            <>
              <p><b>{current.name}</b> <span className="mut">{current.bank}:{current.preset} · {current.instrument}</span></p>
              <div className="row">
                {[60, 64, 67, 72].map(m => (
                  <button key={m} className="btn small" onClick={() => previewTone(m, 0.9, 0.35)}>▶ {['C', 'E', 'G', 'C5'][m === 60 ? 0 : m === 64 ? 1 : m === 67 ? 2 : 3]} ({m})</button>
                ))}
              </div>
              <p className="mut">Preview is a synthesized tone at the preset pitch — exact SF2 sample rendering needs a full SoundFont synth engine, which is out of scope for a static site. Use an external tool (e.g. Polyphone/FL Studio) to audition exact samples; this catalog (names, banks, instruments) is exported with your project notes.</p>
              <h3>Instruments ({info?.instruments.length})</h3>
              <pre className="code">{(info?.instruments ?? []).slice(0, 60).join('\n')}</pre>
            </>
          ) : <p className="mut">Select a preset to preview.</p>}
        </div>
      </div>
    </div>
  );
}
