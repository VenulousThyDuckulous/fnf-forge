import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/ProjectContext';
import type { PsychChart, PsychNote, SongEntry } from '../types';
import { parsePsychChart, serializePsychChart, emptyChart, sectionStartMs, stepLengthMs, chartLengthMs } from '../psych/chart';
import { discoverSongs } from '../psych/importExport';
import { downloadBlob, formatTime, clamp } from '../utils/helpers';
import { audioEngine } from '../audio/engine';
import { generatePatternNotes, detectPatternKind, localProvider, openAiLikeProvider, type PatternKind } from '../ai/providers';

const LANES = [0, 1, 2, 3];
const LANE_KEYS: Record<string, number> = { d: 0, f: 1, j: 2, k: 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };

export default function ChartEditor({ standalone }: { standalone?: boolean }) {
  void standalone;
  const { project, upsertText, currentFile, setCurrentFile, toast, undo, redo, settings, fileUrl } = useStore();
  const songs = useMemo(() => discoverSongs(project.files), [project.files]);
  const chartFiles = useMemo(() => Object.keys(project.files).filter(p => p.endsWith('.json') && (/data\//i.test(p) || /songs?\//i.test(p))).sort(), [project.files]);
  const [file, setFile] = useState<string | null>(currentFile ?? chartFiles[0] ?? songs[0]?.chartPaths[0] ?? null);
  const [chart, setChart] = useState<PsychChart>(() => emptyChart('tutorial', settings.defaultBpm));
  const [parseWarn, setParseWarn] = useState('');
  const [sec, setSec] = useState(0);
  const [snap, setSnap] = useState(4); // grid subdivisions per beat (1=quarters … 16=64ths)
  const [zoom, setZoom] = useState(1);
  const [scroll, setScroll] = useState(settings.defaultScroll);
  const [playing, setPlaying] = useState(false);
  const [metro, setMetro] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [cursorMs, setCursorMs] = useState<number | null>(null); // keyboard placement cursor (absolute ms)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragNote, setDragNote] = useState<{ key: string; dx: number; dy: number } | null>(null);
  const [aiPrompt, setAiPrompt] = useState('Make the next 8 measures harder.');
  const [aiOut, setAiOut] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playTimer = useRef<number | null>(null);
  const hist = useRef<PsychChart[]>([]);
  const histRedo = useRef<PsychChart[]>([]);

  // load file
  useEffect(() => {
    if (currentFile && chartFiles.includes(currentFile)) setFile(currentFile);
  }, [currentFile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!file) return;
    const f = project.files[file];
    if (!f || f.kind !== 'text') return;
    try {
      const j = JSON.parse(f.text ?? '{}');
      const c = parsePsychChart(j);
      setChart(c);
      setSec(0); setSelected(new Set()); hist.current = []; histRedo.current = [];
      setParseWarn('');
      setCurrentFile(file);
      audioEngine.stop();
      setPlaying(false);
      setPlayhead(0);
      noAudioWarned.current = null;
    } catch (e) {
      setParseWarn(`Could not parse chart (${e instanceof Error ? e.message : e}). Showing empty chart; original file untouched until you save.`);
      setChart(emptyChart('broken', settings.defaultBpm));
    }
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  const section = chart.sections[clamp(sec, 0, chart.sections.length - 1)];
  const secStart = sectionStartMs(chart, clamp(sec, 0, chart.sections.length - 1));

  // keep the keyboard cursor inside the visible section
  useEffect(() => {
    if (!section) return;
    const bpm = section.changeBPM && section.bpm ? section.bpm : chart.bpm;
    const secEnd = secStart + section.lengthInSteps * stepLengthMs(bpm);
    setCursorMs(prev => (prev === null || prev < secStart || prev > secEnd) ? Math.round(secStart) : prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec, file]);
  const pxPerMs = 0.25 * zoom * scroll;
  const gridH = Math.max(320, (section ? section.lengthInSteps * stepLengthMs(section.changeBPM && section.bpm ? section.bpm : chart.bpm) : 1000) * pxPerMs);

  function commit(next: PsychChart) {
    hist.current.push(JSON.parse(JSON.stringify(chart)) as PsychChart);
    if (hist.current.length > 80) hist.current.shift();
    histRedo.current = [];
    setChart(next);
  }
  function localUndo() { const p = hist.current.pop(); if (!p) return; histRedo.current.push(chart); setChart(p); }
  function localRedo() { const n = histRedo.current.pop(); if (!n) return; hist.current.push(chart); setChart(n); }

  function noteKey(n: PsychNote) { return `${n.time}:${n.lane}`; }

  function quantize(timeMs: number): number {
    return quantizeInSection(chart, clamp(sec, 0, chart.sections.length - 1), timeMs);
  }

  function addNoteAt(lane: number, yMs: number) {
    if (!section) return;
    const t = Math.max(0, Math.round(quantize(yMs)));
    const next = { ...chart, sections: chart.sections.map((s, i) => i === sec ? { ...s, notes: [...s.notes, { time: t, lane, sustain: 0 }] } : s) };
    commit(next);
    setCursorMs(t);
  }

  /** Keyboard note entry: drops a note in `lane` at the live playhead while
   * playing, otherwise at the cursor (click the grid to move the cursor). */
  function placeAtCursor(lane: number) {
    if (!section) return;
    let t: number;
    if (playing) {
      t = playhead;
      // jump to whichever section contains the playhead
      let acc = 0;
      for (let i = 0; i < chart.sections.length; i++) {
        const s = chart.sections[i];
        const bpm = s.changeBPM && s.bpm ? s.bpm : chart.bpm;
        const dur = s.lengthInSteps * stepLengthMs(bpm);
        if (t < acc + dur) {
          if (i !== sec) { setSec(i); setCursorMs(Math.round(t)); }
          const q = quantizeInSection(chart, i, t);
          commit({ ...chart, sections: chart.sections.map((x, j) => j === i ? { ...x, notes: [...x.notes, { time: Math.max(0, Math.round(q)), lane, sustain: 0 }] } : x) });
          return;
        }
        acc += dur;
      }
      return; // past the end — ignore
    }
    t = cursorMs ?? secStart;
    // clamp cursor into current section
    const bpm = section.changeBPM && section.bpm ? section.bpm : chart.bpm;
    const secEnd = secStart + section.lengthInSteps * stepLengthMs(bpm);
    t = clamp(t, secStart, secEnd);
    addNoteAt(lane, t);
  }

  function quantizeInSection(c: PsychChart, sectionIdx: number, timeMs: number): number {
    const s = c.sections[sectionIdx];
    const bpm = s.changeBPM && s.bpm ? s.bpm : c.bpm;
    const step = stepLengthMs(bpm) * (16 / Math.max(1, snap * 4));
    const start = sectionStartMs(c, sectionIdx);
    return start + Math.round((timeMs - start) / step) * step;
  }

  function deleteSelected() {
    const keys = selected;
    if (keys.size === 0) return;
    commit({ ...chart, sections: chart.sections.map(s => ({ ...s, notes: s.notes.filter(n => !keys.has(noteKey(n))) })) });
    setSelected(new Set());
  }

  function save() {
    if (!file) { toast('No chart file selected.', 'error'); return; }
    try {
      upsertText(file, JSON.stringify(serializePsychChart(chart), null, 2), 'application/json');
      toast(`Chart saved → ${file}`, 'ok');
    } catch (e) { toast(`Save failed: ${e instanceof Error ? e.message : e}`, 'error'); }
  }

  // playback: scrolling playhead through chart length, synced to song audio clock
  useEffect(() => {
    if (!playing) { if (playTimer.current) window.clearInterval(playTimer.current); playTimer.current = null; return; }
    const t0 = Date.now() - playhead;
    playTimer.current = window.setInterval(() => {
      const t = audioEngine.playing ? audioEngine.positionMs() : Date.now() - t0;
      setPlayhead(t);
      const len = chartLengthMs(chart);
      if (t > len + 2000) { setPlaying(false); setPlayhead(0); audioEngine.stop(); }
    }, 50);
    return () => { if (playTimer.current) window.clearInterval(playTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // stop song audio when leaving the editor
  useEffect(() => () => { audioEngine.stop(); }, []);

  function songForChart(): SongEntry | null {
    if (file) {
      const byFile = songs.find(s => s.chartPaths.includes(file));
      if (byFile) return byFile;
    }
    const name = chart.song.toLowerCase();
    return songs.find(s => s.name.toLowerCase() === name || s.displayName.toLowerCase() === name) ?? null;
  }

  const audioCache = useRef<Record<string, { inst: AudioBuffer; voices: AudioBuffer | null }>>({});
  const noAudioWarned = useRef<string | null>(null);

  async function ensureSongAudio(): Promise<{ inst: AudioBuffer; voices: AudioBuffer | null } | null> {
    const song = songForChart();
    if (!song?.instPath) {
      if (noAudioWarned.current !== file) {
        noAudioWarned.current = file;
        toast('No instrumental found for this song — upload one in Song Studio. Previewing silently.', 'error');
      }
      return null;
    }
    const key = `${song.instPath}|${song.voicesPath ?? ''}`;
    if (audioCache.current[key]) return audioCache.current[key];
    try {
      const load = async (p: string) => {
        const url = fileUrl(p);
        if (!url) throw new Error('audio data missing from project');
        const res = await fetch(url);
        return audioEngine.decode(await res.blob());
      };
      const inst = await load(song.instPath);
      let voices: AudioBuffer | null = null;
      if (song.voicesPath) {
        try { voices = await load(song.voicesPath); }
        catch { toast('Voices track could not be decoded — playing instrumental only.', 'error'); }
      }
      audioCache.current[key] = { inst, voices };
      return audioCache.current[key];
    } catch (e) {
      toast(`Could not decode song audio (${e instanceof Error ? e.message : e}). Previewing silently.`, 'error');
      return null;
    }
  }

  async function togglePlay() {
    if (playing) { audioEngine.stop(); setPlaying(false); return; }
    let audio: { inst: AudioBuffer; voices: AudioBuffer | null } | null = null;
    try { audio = await ensureSongAudio(); } catch { audio = null; }
    if (audio) {
      try { await audioEngine.playSong(audio.inst, audio.voices, 0.9, 0.8, playhead); }
      catch (e) { toast(`Audio playback failed (${e instanceof Error ? e.message : e}). Previewing silently.`, 'error'); }
    }
    setPlaying(true);
  }

  useEffect(() => {
    if (metro && playing) audioEngine.startMetronome(chart.bpm);
    else audioEngine.stopMetronome();
  }, [metro, playing, chart.bpm]);

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const laneKey = LANE_KEYS[e.key.toLowerCase()];
      if (laneKey !== undefined && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        placeAtCursor(laneKey);
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); void togglePlay(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); localUndo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); localRedo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); }
      else if (e.key === '[') setSec(s => Math.max(0, s - 1));
      else if (e.key === ']') setSec(s => Math.min(chart.sections.length - 1, s + 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, selected, sec, playing, playhead, cursorMs, snap]);

  async function runAi(insert: boolean) {
    setAiBusy(true);
    setAiOut('');
    try {
      const kind: PatternKind = detectPatternKind(aiPrompt);
      // 1) try configured remote provider for prose plan
      let prose = '';
      const opts = { endpoint: settings.aiEndpoint, apiKey: settings.aiKey, model: settings.aiModel, prompt: `FNF chart request: ${aiPrompt}. Song BPM ${chart.bpm}, section ${sec}. Reply with a short plan.`, context: { song: chart.song } };
      try {
        if (openAiLikeProvider.isConfigured(opts)) prose = await openAiLikeProvider.generate(opts);
        else prose = await localProvider.generate({ ...opts, prompt: aiPrompt, context: { song: chart.song } });
      } catch (e) { prose = `Provider error (${e instanceof Error ? e.message : e}). Using local generator instead.`; }
      setAiOut(prose);
      if (insert) {
        const notes = generatePatternNotes({ kind, chart, fromSection: sec, numSections: /8 measures|8 bars|8 sections/i.test(aiPrompt) ? 4 : 1, snap, seed: Date.now() % 100000 });
        commit({ ...chart, sections: chart.sections.map((s, i) => i >= sec && i < sec + (/8 measures|8 bars|8 sections/i.test(aiPrompt) ? 4 : 1) ? { ...s, notes: [...s.notes, ...notes.filter(n => n.time >= sectionStartMs(chart, i) && n.time < sectionStartMs(chart, i + 1))] } : s) });
        toast(`Inserted ${notes.length} AI notes (${kind}).`, 'ok');
      }
    } finally { setAiBusy(false); }
  }

  function exportSingle() {
    downloadBlob(new Blob([JSON.stringify(serializePsychChart(chart), null, 2)], { type: 'application/json' }), `${chart.song}-chart.json`);
  }

  const laneColors = settings.laneColors;

  return (
    <div className="ce-wrap">
      <div className="ce-toolbar">
        <select value={file ?? ''} onChange={e => setFile(e.target.value)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 8px', maxWidth: 300 }}>
          <option value="">— select chart —</option>
          {chartFiles.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn small primary" onClick={save}>💾 Save chart</button>
        <button className="btn small" onClick={exportSingle}>⬇ Export JSON</button>
        <button className="btn small" onClick={() => { localUndo(); undo(); }} title="Ctrl+Z">↩</button>
        <button className="btn small" onClick={() => { localRedo(); redo(); }} title="Ctrl+Y">↪</button>
        <button className="btn small" onClick={() => void togglePlay()}>{playing ? '⏸ Pause (Space)' : '▶ Play (Space)'}</button>
        <label className="pill"><input type="checkbox" checked={metro} onChange={e => setMetro(e.target.checked)} /> Metronome</label>
        <label className="pill">Snap
          <select value={snap} onChange={e => setSnap(Number(e.target.value))} style={{ background: 'transparent', border: 0 }}>
            {[1, 2, 4, 8, 12, 16].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="pill">Zoom <input type="range" min={0.5} max={3} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
        <label className="pill">Scroll <input type="range" min={0.5} max={2.5} step={0.1} value={scroll} onChange={e => setScroll(Number(e.target.value))} /></label>
        <span className="tag">Sec {sec + 1}/{chart.sections.length} · {formatTime(secStart)} · {chart.bpm} BPM</span>
        <span className="tag" title={songForChart()?.instPath ?? 'No instrumental in project'}>{songForChart()?.instPath ? '🔊 song audio' : '🔇 no instrumental'}</span>
      </div>
      {parseWarn && <div className="panel" style={{ borderColor: 'var(--warn)' }}><span className="err">{parseWarn}</span></div>}

      <div className="ce-body">
        <div className="ce-grid-scroll" ref={scrollRef}
          onClick={e => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const laneW = rect.width / 4;
            const lane = clamp(Math.floor((e.clientX - rect.left) / laneW), 0, 3);
            const y = (e.currentTarget.scrollTop + (e.clientY - rect.top)) / pxPerMs + secStart;
            if ((e.target as HTMLElement).dataset.note) return;
            addNoteAt(lane, y);
          }}>
          <div style={{ position: 'relative', height: gridH, display: 'flex' }}>
            {LANES.map(l => (
              <div key={l} style={{ flex: 1, borderLeft: `1px solid ${settings.gridColor}`, background: l % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <div style={{ position: 'sticky', top: 0, textAlign: 'center', color: 'var(--muted)', fontSize: 11, padding: 4, background: 'rgba(0,0,0,0.35)', zIndex: 2 }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: laneColors[l], marginRight: 4 }} />{['D', 'F', 'J', 'K'][l]}
                </div>
              </div>
            ))}
            {/* beat lines */}
            {section && Array.from({ length: section.lengthInSteps + 1 }).map((_, i) => {
              const bpm = section.changeBPM && section.bpm ? section.bpm : chart.bpm;
              const y = i * stepLengthMs(bpm) * pxPerMs;
              const strong = i % 4 === 0;
              return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: y, borderTop: `1px ${strong ? 'solid' : 'dashed'} ${strong ? 'var(--border2)' : 'var(--border)'}`, pointerEvents: 'none' }} />;
            })}
            {/* notes */}
            {section?.notes.map((n, idx) => {
              const y = (n.time - secStart) * pxPerMs;
              if (y < -40 || y > gridH + 40) return null;
              const k = noteKey(n);
              const sel2 = selected.has(k);
              return (
                <div key={`${k}:${idx}`} data-note="1"
                  title={`${formatTime(n.time)} lane ${n.lane}${n.sustain ? ` sustain ${Math.round(n.sustain)}ms` : ''} — drag to move, right-click to delete`}
                  onMouseDown={e => { e.stopPropagation(); setDragNote({ key: k, dx: e.clientX, dy: e.clientY }); }}
                  onMouseUp={() => setDragNote(null)}
                  onMouseMove={e => {
                    if (!dragNote || dragNote.key !== k || e.buttons !== 1) return;
                    const rect = scrollRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const laneW = rect.width / 4;
                    const lane = clamp(Math.floor((e.clientX - rect.left) / laneW), 0, 3);
                    setChart(prev => ({ ...prev, sections: prev.sections.map((s, i) => i === sec ? { ...s, notes: s.notes.map(x => noteKey(x) === k ? { ...x, lane } : x) } : s) }));
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    setSelected(prev => { const n2 = new Set(prev); if (n2.has(k)) n2.delete(k); else n2.add(k); return n2; });
                  }}
                  onContextMenu={e => {
                    e.preventDefault(); e.stopPropagation();
                    commit({ ...chart, sections: chart.sections.map((s, i) => i === sec ? { ...s, notes: s.notes.filter(x => noteKey(x) !== k) } : s) });
                  }}
                  style={{
                    position: 'absolute', left: `calc(${(n.lane % 4) * 25}% + 6px)`, top: y,
                    width: 'calc(25% - 12px)', height: 18, borderRadius: 5,
                    background: laneColors[n.lane % 4], border: sel2 ? '2px solid #fff' : '1px solid rgba(0,0,0,0.5)',
                    cursor: 'grab', zIndex: 3
                  }} />
              );
            })}
            {/* sustains */}
            {section?.notes.filter(n => n.sustain > 0).map((n, idx) => {
              const y = (n.time - secStart) * pxPerMs;
              return <div key={`s${noteKey(n)}:${idx}`} style={{ position: 'absolute', left: `calc(${(n.lane % 4) * 25}% + 14px)`, top: y + 18, width: 8, height: Math.max(4, n.sustain * pxPerMs), background: laneColors[n.lane % 4], opacity: 0.55, borderRadius: 4, pointerEvents: 'none' }} />;
            })}
            {/* playhead */}
            {playing && <div style={{ position: 'absolute', left: 0, right: 0, top: (playhead - secStart) * pxPerMs, borderTop: '2px solid var(--err)', pointerEvents: 'none' }} />}
            {/* keyboard cursor (paused) */}
            {!playing && cursorMs !== null && <div title="Keyboard cursor — D/F/J/K or arrows drop a note here" style={{ position: 'absolute', left: 0, right: 0, top: (cursorMs - secStart) * pxPerMs, borderTop: '2px dashed var(--acc2)', pointerEvents: 'none' }} />}
          </div>
        </div>

        <div className="ce-side">
          <div className="panel">
            <h2>Section {sec + 1}</h2>
            <div className="row">
              <button className="btn small" onClick={() => setSec(s => Math.max(0, s - 1))}>← Prev <span className="kbd">[</span></button>
              <button className="btn small" onClick={() => setSec(s => Math.min(chart.sections.length - 1, s + 1))}>Next <span className="kbd">]</span> →</button>
              <button className="btn small" onClick={() => commit({ ...chart, sections: [...chart.sections.slice(0, sec + 1), { mustHit: true, lengthInSteps: 16, notes: [], cameraFocus: 'bf' }, ...chart.sections.slice(sec + 1)] })}>＋ Section</button>
            </div>
            {section && (
              <>
                <div className="field"><label>Length in steps</label>
                  <input type="number" value={section.lengthInSteps} onChange={e => commit({ ...chart, sections: chart.sections.map((s, i) => i === sec ? { ...s, lengthInSteps: clamp(Number(e.target.value) || 16, 4, 64) } : s) })} /></div>
                <label className="pill"><input type="checkbox" checked={section.mustHit} onChange={e => commit({ ...chart, sections: chart.sections.map((s, i) => i === sec ? { ...s, mustHit: e.target.checked, cameraFocus: e.target.checked ? 'bf' : 'dad' } : s) })} /> Must-hit player</label>
                <div className="field"><label>Camera focus</label>
                  <select value={section.cameraFocus ?? (section.mustHit ? 'bf' : 'dad')} onChange={e => commit({ ...chart, sections: chart.sections.map((s, i) => i === sec ? { ...s, cameraFocus: e.target.value as 'bf' | 'dad' | 'gf', mustHit: e.target.value === 'bf' } : s) })}>
                    <option value="bf">Boyfriend</option><option value="dad">Opponent (Dad)</option><option value="gf">Girlfriend</option>
                  </select></div>
                <label className="pill"><input type="checkbox" checked={!!section.changeBPM} onChange={e => commit({ ...chart, sections: chart.sections.map((s, i) => i === sec ? { ...s, changeBPM: e.target.checked, bpm: s.bpm ?? chart.bpm } : s) })} /> BPM change here</label>
                {section.changeBPM && <div className="field"><label>Section BPM</label><input type="number" value={section.bpm ?? chart.bpm} onChange={e => commit({ ...chart, sections: chart.sections.map((s, i) => i === sec ? { ...s, bpm: Number(e.target.value) || chart.bpm } : s) })} /></div>}
              </>
            )}
            <h3>Song</h3>
            <div className="field"><label>BPM</label><input type="number" value={chart.bpm} onChange={e => setChart({ ...chart, bpm: Number(e.target.value) || 120 })} /></div>
            <div className="field"><label>Scroll speed</label><input type="number" step="0.1" value={chart.speed} onChange={e => setChart({ ...chart, speed: Number(e.target.value) || 1 })} /></div>
            <div className="row">
              <button className="btn small danger" onClick={deleteSelected} disabled={selected.size === 0}>Delete selected ({selected.size}) <span className="kbd">Del</span></button>
              <button className="btn small" onClick={() => {
                const s = section; if (!s) return;
                commit({ ...chart, sections: chart.sections.map((x, i) => i === sec ? { ...s, notes: s.notes.map(n => selected.has(noteKey(n)) ? { ...n, sustain: (n.sustain || 0) + 125 } : n) } : x) });
              }}>+ Sustain</button>
            </div>
            <p className="mut">Click grid to place + move cursor · <span className="kbd">D F J K</span>/<span className="kbd">←↓↑→</span> drop notes at cursor (or playhead while playing) · click note to select · drag to move lanes · right-click deletes.</p>
          </div>

          <div className="panel">
            <h2>✨ AI Chart Assistant</h2>
            <div className="field"><label>Request (e.g. “Add a jackhammer pattern”)</label>
              <textarea rows={3} value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} /></div>
            <div className="row">
              <button className="btn small primary" disabled={aiBusy} onClick={() => void runAi(true)}>{aiBusy ? 'Working…' : 'Generate + Insert'}</button>
              <button className="btn small" disabled={aiBusy} onClick={() => void runAi(false)}>Plan only</button>
            </div>
            {aiOut && <pre className="code" style={{ marginTop: 8 }}>{aiOut}</pre>}
            <p className="mut">No provider configured? The offline procedural generator runs automatically. Configure endpoint/key in Settings → AI provider.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
