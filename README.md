# FNF Mod Forge 🎤

Browser-based **Friday Night Funkin' Psych Engine mod development IDE**. Static-only — runs on GitHub Pages, no backend.

## Run

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # preview the build
```

## Deploy to GitHub Pages

The Vite `base` is `./` (relative) so the build works under any
`https://USERNAME.github.io/REPOSITORY/` without hard-coding names.

**Option A — Actions (recommended):** this repo includes
`.github/workflows/deploy-fnf-mod-forge.yml`, which builds `fnf-mod-forge/`
and publishes `fnf-mod-forge/dist` to Pages on every push to `main`.
Enable Pages → Source: **GitHub Actions**.

**Option B — manual:** `npm run deploy` (publishes `dist/` via `gh-pages`).

To override the base path explicitly:

```bash
BASE_PATH=/my-repo/ npm run build
```

## What works (all client-side)

- Project system: new/rename/duplicate/delete, IndexedDB + localStorage persistence, autosave
- Import: mod ZIP (JSZip), individual files, folder picker; structure auto-detected (songs/charts/characters/stages/weeks/dialogue/images/sounds)
- Export: full mod ZIP preserving structure, single chart JSON, single assets
- Dashboard with counts, recent files, quick actions
- Song Studio: metadata, Inst/Voices/extra uploads stored in project, waveform + preview (OGG/MP3/WAV; no fake transcoding — external conversion flagged)
- Chart Editor: 4-lane grid, snap, zoom, scroll, sections, must-hit/camera, BPM changes, sustains, drag/select/delete, playhead preview + metronome, undo/redo, keyboard (Space, D/F/J/K, arrows, Ctrl+Z/Y, [ ], Del), Psych Engine JSON import/export preserving unknown fields
- AI Chart Assistant + AI Mod Assistant: provider abstraction (OpenAI-compatible endpoint/key in Settings, never in source); offline procedural generator fallback — no fake hard-coded "AI"
- Character Creator + Sprite Tool (grid slicing, frame order, FPS, strip export)
- Stage Editor with layered visual preview, Week Builder with drag reorder, Dialogue Editor with preview
- SF2 Tool: local RIFF/pdta parser (no CDN), preset/instrument catalog, synth-tone preview with the limitation isolated in code
- Audio Tool: upload/preview/volume/loop/trim/waveform
- Asset Manager: browse/rename/delete (confirmed)/download/replace/preview
- Settings: theme, grid colors, defaults, autosave, AI provider, wipe storage
- Graceful error handling everywhere (malformed JSON/SF2/audio/ZIP never crash the app)
