// Minimal SF2 (SoundFont 2) inspector: parses the RIFF/pdta preset headers
// locally so we can list banks/presets/instruments without any CDN.
// Sample-accurate rendering of SF2 voices is out of scope for a static app;
// preview uses a WebAudio synthesized tone at the preset's root key.
// LIMITATION (isolated here): exact SF2 sample playback requires a full
// SoundFont synth engine. This tool inspects + previews + catalogs.

export interface Sf2Preset {
  name: string;
  preset: number;
  bank: number;
  instrument: string;
  rootKey: number;
}

export interface Sf2Info {
  fileName: string;
  size: number;
  soundEngine: string;
  bankName: string;
  presets: Sf2Preset[];
  instruments: string[];
  warnings: string[];
}

function readAscii(view: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = view.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

function findChunk(view: DataView, id: string, from = 0, to?: number): number {
  const end = to ?? view.byteLength - 8;
  for (let o = from; o < end; o += 2) {
    const tag = String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    if (tag === id) return o;
  }
  return -1;
}

export function parseSf2(buffer: ArrayBuffer, fileName: string): Sf2Info {
  const view = new DataView(buffer);
  const warnings: string[] = [];
  if (buffer.byteLength < 12) throw new Error('File is too small to be a SoundFont.');
  const riff = readAscii(view, 0, 4);
  const sfbk = readAscii(view, 8, 4);
  if (riff !== 'RIFF' || sfbk !== 'sfbk') {
    throw new Error('Not a SoundFont 2 file (missing RIFF/sfbk header).');
  }
  const pdtaOff = findChunk(view, 'pdta');
  if (pdtaOff < 0) throw new Error('SoundFont has no preset table (pdta chunk missing).');

  // Walk sub-chunks inside pdta: phdr (preset headers, 38 bytes), inst (56 bytes)
  const presetNames: { name: string; preset: number; bank: number }[] = [];
  const instNames: string[] = [];
  let cursor = pdtaOff + 8;
  const pdtaSize = view.getUint32(pdtaOff + 4, true);
  const pdtaEnd = Math.min(view.byteLength - 8, cursor + pdtaSize);
  while (cursor < pdtaEnd - 8) {
    const tag = readAscii(view, cursor, 4);
    const size = view.getUint32(cursor + 4, true);
    const body = cursor + 8;
    if (tag === 'phdr' && size >= 38) {
      const count = Math.floor(size / 38);
      for (let i = 0; i < count; i++) {
        const o = body + i * 38;
        if (o + 38 > view.byteLength) break;
        const name = readAscii(view, o, 20) || `Preset ${i}`;
        const preset = view.getUint16(o + 20, true);
        const bank = view.getUint16(o + 22, true);
        presetNames.push({ name, preset, bank });
      }
    } else if (tag === 'inst' && size >= 22) {
      const count = Math.floor(size / 22);
      // inst rec is 22 bytes; name is first 20
      for (let i = 0; i < count; i++) {
        const o = body + i * 22;
        if (o + 20 > view.byteLength) break;
        const name = readAscii(view, o, 20);
        if (name) instNames.push(name);
      }
    }
    cursor = body + size + (size % 2);
    if (size === 0) break;
  }
  if (presetNames.length === 0) warnings.push('No presets found in the preset table; the file may use an unusual layout.');
  if (instNames.length === 0) warnings.push('No instrument names found.');

  // Drop the terminal "EOP" record most SF2 files include.
  const presetsRaw = presetNames.filter(p => p.name !== 'EOP');
  const presets: Sf2Preset[] = presetsRaw.map((p, i) => ({
    ...p,
    instrument: instNames[i] ?? instNames[0] ?? '—',
    rootKey: 60
  }));

  const infoOff = findChunk(view, 'INFO');
  void infoOff;
  return {
    fileName,
    size: buffer.byteLength,
    soundEngine: 'EMU8000/SoundFont2',
    bankName: fileName.replace(/\.sf2$/i, ''),
    presets,
    instruments: instNames.filter(n => n !== 'EOI'),
    warnings
  };
}
