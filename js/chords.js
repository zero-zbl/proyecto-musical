// Biblioteca de acordes: posiciones abiertas + formas móviles (cejilla)
// generadas para las 12 tónicas. Cuerdas: índice 0 = 6ª (Mi grave) ... 5 = 1ª.
// frets: -1 = no tocar (X), 0 = al aire, n = traste. fingers: 0 = sin dedo, 1-4 = dedo.
import { mod12, parsePitchClass, pitchClassTokenLength, pcName, letterIndexOf, spellWithLetter } from './notes.js';

const STANDARD_PCS = [4, 9, 2, 7, 11, 4]; // E A D G B E
const STANDARD_MIDI = [40, 45, 50, 55, 59, 64];

// Tipos de acorde: intervalos (semitonos desde la tónica), requeridos y opcionales.
export const CHORD_TYPES = [
  { id: 'maj', suffix: '', label: 'Mayor', category: 'mayores', intervals: [0, 4, 7], optional: [7] },
  { id: 'm', suffix: 'm', label: 'Menor', category: 'menores', intervals: [0, 3, 7], optional: [7] },
  { id: '7', suffix: '7', label: 'Séptima', category: 'septimas', intervals: [0, 4, 7, 10], optional: [7] },
  { id: 'm7', suffix: 'm7', label: 'Menor séptima', category: 'septimas', intervals: [0, 3, 7, 10], optional: [7] },
  { id: 'maj7', suffix: 'maj7', label: 'Séptima mayor', category: 'septimas', intervals: [0, 4, 7, 11], optional: [7] },
  { id: 'm7b5', suffix: 'm7♭5', label: 'Semidisminuido', category: 'septimas', intervals: [0, 3, 6, 10], optional: [] },
  { id: '7sus4', suffix: '7sus4', label: 'Séptima sus4', category: 'septimas', intervals: [0, 5, 7, 10], optional: [7] },
  { id: 'sus2', suffix: 'sus2', label: 'Suspendido 2ª', category: 'suspendidos', intervals: [0, 2, 7], optional: [] },
  { id: 'sus4', suffix: 'sus4', label: 'Suspendido 4ª', category: 'suspendidos', intervals: [0, 5, 7], optional: [] },
  { id: 'dim', suffix: 'dim', label: 'Disminuido', category: 'dimaug', intervals: [0, 3, 6], optional: [] },
  { id: 'dim7', suffix: 'dim7', label: 'Disminuido 7ª', category: 'dimaug', intervals: [0, 3, 6, 9], optional: [] },
  { id: 'aug', suffix: 'aug', label: 'Aumentado', category: 'dimaug', intervals: [0, 4, 8], optional: [] },
  { id: '6', suffix: '6', label: 'Sexta', category: 'extendidos', intervals: [0, 4, 7, 9], optional: [7] },
  { id: 'm6', suffix: 'm6', label: 'Menor sexta', category: 'extendidos', intervals: [0, 3, 7, 9], optional: [7] },
  { id: '9', suffix: '9', label: 'Novena', category: 'extendidos', intervals: [0, 4, 7, 10, 2], optional: [7] },
  { id: 'add9', suffix: 'add9', label: 'Novena añadida', category: 'extendidos', intervals: [0, 4, 7, 2], optional: [7] },
  { id: '5', suffix: '5', label: 'Quinta (power)', category: 'quintas', intervals: [0, 7], optional: [] },
];

export const CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'mayores', label: 'Mayores' },
  { id: 'menores', label: 'Menores' },
  { id: 'septimas', label: 'Séptimas' },
  { id: 'suspendidos', label: 'Suspendidos' },
  { id: 'dimaug', label: 'Dism. / Aum.' },
  { id: 'extendidos', label: '6ª y 9ª' },
  { id: 'quintas', label: 'Power chords' },
];

// Posiciones abiertas (tónica por clase de altura con sostenidos).
// [frets, fingers]
const OPEN = {
  'C': [[-1, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0]],
  'D': [[-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2]],
  'E': [[0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0]],
  'G': [[3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3]],
  'A': [[-1, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0]],
  'Dm': [[-1, -1, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1]],
  'Em': [[0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0]],
  'Am': [[-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0]],
  'C7': [[-1, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0]],
  'D7': [[-1, -1, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3]],
  'E7': [[0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0]],
  'G7': [[3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1]],
  'A7': [[-1, 0, 2, 0, 2, 0], [0, 0, 2, 0, 3, 0]],
  'B7': [[-1, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4]],
  'Am7': [[-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0]],
  'Em7': [[0, 2, 2, 0, 3, 0], [0, 1, 2, 0, 4, 0]],
  'Dm7': [[-1, -1, 0, 2, 1, 1], [0, 0, 0, 2, 1, 1]],
  'Cmaj7': [[-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0]],
  'Dmaj7': [[-1, -1, 0, 2, 2, 2], [0, 0, 0, 1, 2, 3]],
  'Emaj7': [[0, 2, 1, 1, 0, 0], [0, 3, 1, 2, 0, 0]],
  'Fmaj7': [[-1, -1, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0]],
  'Gmaj7': [[3, 2, 0, 0, 0, 2], [3, 2, 0, 0, 0, 1]],
  'Amaj7': [[-1, 0, 2, 1, 2, 0], [0, 0, 2, 1, 3, 0]],
  'Asus2': [[-1, 0, 2, 2, 0, 0], [0, 0, 1, 2, 0, 0]],
  'Dsus2': [[-1, -1, 0, 2, 3, 0], [0, 0, 0, 1, 3, 0]],
  'Asus4': [[-1, 0, 2, 2, 3, 0], [0, 0, 1, 2, 3, 0]],
  'Csus4': [[-1, 3, 3, 0, 1, 1], [0, 3, 4, 0, 1, 1]],
  'Dsus4': [[-1, -1, 0, 2, 3, 3], [0, 0, 0, 1, 3, 4]],
  'Esus4': [[0, 2, 2, 2, 0, 0], [0, 2, 3, 4, 0, 0]],
  'Gsus4': [[3, 3, 0, 0, 1, 3], [2, 3, 0, 0, 1, 4]],
  'A7sus4': [[-1, 0, 2, 0, 3, 0], [0, 0, 2, 0, 3, 0]],
  'D7sus4': [[-1, -1, 0, 2, 1, 3], [0, 0, 0, 2, 1, 4]],
  'E7sus4': [[0, 2, 0, 2, 0, 0], [0, 2, 0, 3, 0, 0]],
  'Cadd9': [[-1, 3, 2, 0, 3, 0], [0, 2, 1, 0, 3, 0]],
  'Gadd9': [[3, 0, 0, 2, 0, 3], [2, 0, 0, 1, 0, 3]],
  'C6': [[-1, 3, 2, 2, 1, 0], [0, 4, 2, 3, 1, 0]],
  'D6': [[-1, -1, 0, 2, 0, 2], [0, 0, 0, 1, 0, 2]],
  'E6': [[0, 2, 2, 1, 2, 0], [0, 2, 3, 1, 4, 0]],
  'A6': [[-1, 0, 2, 2, 2, 2], [0, 0, 1, 1, 1, 1]],
  'Am6': [[-1, 0, 2, 2, 1, 2], [0, 0, 2, 3, 1, 4]],
  'Em6': [[0, 2, 2, 0, 2, 0], [0, 2, 3, 0, 4, 0]],
  'E9': [[0, 2, 0, 1, 0, 2], [0, 2, 0, 1, 0, 3]],
  'Caug': [[-1, 3, 2, 1, 1, 0], [0, 4, 3, 1, 2, 0]],
  'Ddim': [[-1, -1, 0, 1, 3, 1], [0, 0, 0, 1, 3, 2]],
  'Bm7b5': [[-1, 2, 3, 2, 3, -1], [0, 1, 3, 2, 4, 0]],
  'E5': [[0, 2, 2, -1, -1, -1], [0, 1, 2, 0, 0, 0]],
  'A5': [[-1, 0, 2, 2, -1, -1], [0, 0, 1, 2, 0, 0]],
  'D5': [[-1, -1, 0, 2, 3, -1], [0, 0, 0, 1, 2, 0]],
};

// Formas móviles. rootString: cuerda donde está la tónica (0 = 6ª, 1 = 5ª, 2 = 4ª).
// offsets relativos al traste de la tónica (null = no tocar).
const X = null;
const SHAPES = {
  maj: [
    { name: 'Forma E', rootString: 0, offsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1] },
  ],
  m: [
    { name: 'Forma Em', rootString: 0, offsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
    { name: 'Forma Am', rootString: 1, offsets: [X, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
  ],
  7: [
    { name: 'Forma E7', rootString: 0, offsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
    { name: 'Forma A7', rootString: 1, offsets: [X, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  ],
  m7: [
    { name: 'Forma Em7', rootString: 0, offsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
    { name: 'Forma Am7', rootString: 1, offsets: [X, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
  ],
  maj7: [
    { name: 'Forma Emaj7', rootString: 0, offsets: [0, X, 1, 1, 0, X], fingers: [1, 0, 3, 4, 2, 0] },
    { name: 'Forma Amaj7', rootString: 1, offsets: [X, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
  ],
  m7b5: [
    { name: 'Forma E', rootString: 0, offsets: [0, X, 0, 0, -1, X], fingers: [2, 0, 3, 4, 1, 0] },
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 1, 0, 1, X], fingers: [0, 1, 3, 2, 4, 0] },
  ],
  '7sus4': [
    { name: 'Forma E', rootString: 0, offsets: [0, 2, 0, 2, 0, 0], fingers: [1, 3, 1, 4, 1, 1] },
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 2, 0, 3, 0], fingers: [0, 1, 3, 1, 4, 1] },
  ],
  sus2: [
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1] },
    { name: 'Forma D', rootString: 2, offsets: [X, X, 0, 2, 3, 0], fingers: [0, 0, 1, 3, 4, 1] },
  ],
  sus4: [
    { name: 'Forma E', rootString: 0, offsets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1] },
  ],
  dim: [
    { name: 'Forma E', rootString: 0, offsets: [0, 1, 2, 0, X, X], fingers: [1, 2, 3, 1, 0, 0] },
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 1, 2, 1, X], fingers: [0, 1, 2, 4, 3, 0] },
  ],
  dim7: [
    { name: 'Forma D', rootString: 2, offsets: [X, X, 0, 1, 0, 1], fingers: [0, 0, 1, 3, 2, 4] },
    { name: 'Forma E', rootString: 0, offsets: [0, X, -1, 0, -1, X], fingers: [2, 0, 1, 3, 1, 0] },
  ],
  aug: [
    { name: 'Forma E', rootString: 0, offsets: [0, 3, 2, 1, 1, X], fingers: [1, 4, 3, 2, 2, 0] },
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 3, 2, 2, X], fingers: [0, 1, 4, 2, 3, 0] },
  ],
  6: [
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 2, 2, 2, 2], fingers: [0, 1, 3, 3, 3, 3] },
    { name: 'Forma E', rootString: 0, offsets: [0, X, -1, 1, 0, X], fingers: [2, 0, 1, 4, 3, 0] },
  ],
  m6: [
    { name: 'Forma A', rootString: 1, offsets: [X, 0, X, -1, 1, 0], fingers: [0, 2, 0, 1, 4, 3] },
    { name: 'Forma E', rootString: 0, offsets: [0, X, -1, 0, 0, X], fingers: [2, 0, 1, 3, 4, 0] },
  ],
  9: [
    { name: 'Forma A', rootString: 1, offsets: [X, 0, -1, 0, 0, 0], fingers: [0, 2, 1, 3, 3, 3] },
  ],
  add9: [
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 2, 4, 2, X], fingers: [0, 1, 2, 4, 3, 0] },
  ],
  5: [
    { name: 'Forma E', rootString: 0, offsets: [0, 2, 2, X, X, X], fingers: [1, 3, 4, 0, 0, 0] },
    { name: 'Forma A', rootString: 1, offsets: [X, 0, 2, 2, X, X], fingers: [0, 1, 3, 4, 0, 0] },
  ],
};

const SHARP_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAX_FRET = 15;

function fromShape(shape, rootPc) {
  const stringPc = STANDARD_PCS[shape.rootString];
  const minOffset = Math.min(...shape.offsets.filter((o) => o !== null));
  let r = mod12(rootPc - stringPc);
  if (r + minOffset < 0) r += 12;
  const frets = shape.offsets.map((o) => (o === null ? -1 : r + o));
  if (Math.max(...frets) > MAX_FRET) return null;
  let fingers = shape.fingers.slice();
  if (frets.some((f, i) => f === 0 && shape.offsets[i] !== null)) {
    // Con cuerdas al aire: los dedos sobre el traste 0 se liberan y se renumeran.
    fingers = fingers.map((fg, i) => (frets[i] === 0 ? 0 : fg));
    const used = fingers.filter((f) => f > 0);
    const shift = used.length ? Math.min(...used) - 1 : 0;
    fingers = fingers.map((f) => (f > 0 ? f - shift : 0));
  }
  return { frets, fingers, shape: shape.name };
}

/** Todas las posiciones para una tónica (0-11) y un tipo de acorde. */
export function getVoicings(rootPc, typeId) {
  const type = CHORD_TYPES.find((t) => t.id === typeId);
  const key = SHARP_KEYS[mod12(rootPc)] + (type.id === 'maj' ? '' : type.id);
  const list = [];
  const open = OPEN[key];
  if (open) list.push({ frets: open[0], fingers: open[1], shape: 'Abierto' });
  for (const shape of SHAPES[typeId] || []) {
    const v = fromShape(shape, rootPc);
    if (v) list.push(v);
  }
  // Eliminar duplicados y ordenar: abiertos primero, luego por posición en el mástil.
  const seen = new Set();
  const unique = list.filter((v) => {
    const k = v.frets.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pos = (v) => Math.min(...v.frets.filter((f) => f > 0).concat([99]));
  const isOpen = (v) => v.frets.some((f) => f === 0);
  return unique
    .map((v) => ({ ...v, barres: detectBarres(v) }))
    .sort((a, b) => (isOpen(b) - isOpen(a)) || pos(a) - pos(b));
}

/** Cejillas: mismo dedo en el mismo traste sobre varias cuerdas. */
export function detectBarres(v) {
  const groups = {};
  v.frets.forEach((f, i) => {
    const fg = v.fingers[i];
    if (f > 0 && fg > 0) {
      const k = `${fg}:${f}`;
      (groups[k] ||= []).push(i);
    }
  });
  return Object.entries(groups)
    .filter(([, strings]) => strings.length > 1)
    .map(([k, strings]) => {
      const [finger, fret] = k.split(':').map(Number);
      return { finger, fret, from: Math.min(...strings), to: Math.max(...strings) };
    });
}

/** Notas MIDI que suenan (afinación estándar). */
export function voicingMidis(v) {
  return v.frets.map((f, i) => (f < 0 ? null : STANDARD_MIDI[i] + f));
}

export function allChords() {
  const out = [];
  for (let pc = 0; pc < 12; pc++) {
    for (const type of CHORD_TYPES) out.push({ root: pc, type, voicings: getVoicings(pc, type.id) });
  }
  return out;
}

const SUFFIX_ALIASES = [
  [/^(maj7|ma7|M7|Δ7?|7M)$/, 'maj7'],
  [/^(m7b5|m7♭5|ø7?|min7b5)$/, 'm7b5'],
  [/^(dim7|°7|o7)$/, 'dim7'],
  [/^(dim|°|o)$/, 'dim'],
  [/^(aug|\+)$/, 'aug'],
  [/^(m7|min7|-7)$/, 'm7'],
  [/^(m6|min6|-6)$/, 'm6'],
  [/^(m|min|-|menor)$/, 'm'],
  [/^(7sus4|7sus)$/, '7sus4'],
  [/^(sus2)$/, 'sus2'],
  [/^(sus4|sus)$/, 'sus4'],
  [/^(add9|add2)$/, 'add9'],
  [/^(9)$/, '9'],
  [/^(7)$/, '7'],
  [/^(6)$/, '6'],
  [/^(5)$/, '5'],
  [/^(maj|M|mayor)?$/, 'maj'],
];

/** Interpreta "C#m7", "Dbmaj7", "Lam", "Sol7", "F#"… → { root, typeId } o null. */
export function parseChordName(str) {
  const s = str.trim().replace(/\s+/g, '');
  if (!s) return null;
  const len = pitchClassTokenLength(s);
  if (!len) return null;
  const root = parsePitchClass(s.slice(0, len));
  const rest = s.slice(len);
  for (const [re, id] of SUFFIX_ALIASES) {
    if (re.test(rest)) return { root, typeId: id };
  }
  return null;
}

// Grado (0 = tónica … 6 = séptima) de cada intervalo, para escribir bien las notas.
const DEGREE = { 0: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6 };

/**
 * Nombres correctos de las notas de un acorde: Cm → C E♭ G (no D♯).
 * Devuelve una función pc → texto.
 */
export function chordSpeller(rootPc, typeId, opts = {}) {
  const type = CHORD_TYPES.find((t) => t.id === typeId);
  const rootLetter = letterIndexOf(rootPc, opts.accidentals);
  const names = new Map();
  for (const iv of type.intervals) {
    const pc = mod12(rootPc + iv);
    const sp = spellWithLetter(pc, rootLetter + DEGREE[iv], opts);
    names.set(pc, (sp || pcName(pc, opts)).text);
  }
  return (pc) => names.get(mod12(pc)) || pcName(pc, opts).text;
}
