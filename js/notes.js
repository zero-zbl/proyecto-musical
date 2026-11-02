// Utilidades de teoría musical: nombres de notas, conversión frecuencia <-> MIDI, cents.

const LETTERS_SHARP = [
  ['C', ''], ['C', '#'], ['D', ''], ['D', '#'], ['E', ''], ['F', ''],
  ['F', '#'], ['G', ''], ['G', '#'], ['A', ''], ['A', '#'], ['B', ''],
];
const LETTERS_FLAT = [
  ['C', ''], ['D', 'b'], ['D', ''], ['E', 'b'], ['E', ''], ['F', ''],
  ['G', 'b'], ['G', ''], ['A', 'b'], ['A', ''], ['B', 'b'], ['B', ''],
];
const LATIN = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const DEFAULT_A4 = 440;

export function midiToFreq(midi, a4 = DEFAULT_A4) {
  return a4 * 2 ** ((midi - 69) / 12);
}

export function freqToMidi(freq, a4 = DEFAULT_A4) {
  return 69 + 12 * Math.log2(freq / a4);
}

export function cents(freq, ref) {
  return 1200 * Math.log2(freq / ref);
}

export function mod12(n) {
  return ((n % 12) + 12) % 12;
}

/** Convierte "E2", "F#3", "Bb1", "Do#3", "Sib2" a número MIDI. */
export function parseNote(str) {
  const m = /^([A-Ga-g]|Do|Re|Mi|Fa|Sol|La|Si)([#b♯♭]?)(-?\d)$/i.exec(str.trim());
  if (!m) throw new Error(`Nota inválida: ${str}`);
  const pc = parsePitchClass(m[1] + m[2]);
  return (Number(m[3]) + 1) * 12 + pc;
}

/** Convierte "C", "C#", "Db", "Sol", "Sib" a clase de altura 0-11 (o null). */
export function parsePitchClass(str) {
  const m = /^(Do|Re|Mi|Fa|Sol|La|Si|[A-Ga-g])([#b♯♭]?)/i.exec(str.trim());
  if (!m) return null;
  let base = m[1];
  let letter;
  if (base.length === 1) letter = base.toUpperCase();
  else {
    const key = base[0].toUpperCase() + base.slice(1).toLowerCase();
    letter = Object.keys(LATIN).find((k) => LATIN[k] === key);
  }
  if (!letter) return null;
  let pc = LETTER_PC[letter];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  return mod12(pc);
}

/** Longitud del token de tónica reconocido por parsePitchClass. */
export function pitchClassTokenLength(str) {
  const m = /^(Do|Re|Mi|Fa|Sol|La|Si|[A-Ga-g])([#b♯♭]?)/i.exec(str.trim());
  return m ? m[0].length : 0;
}

/**
 * Nombre de una clase de altura.
 * opts.notation: 'american' | 'latin'; opts.accidentals: 'sharp' | 'flat'
 * Devuelve { base, acc, text } donde acc es '♯', '♭' o ''.
 */
export function pcName(pc, opts = {}) {
  const table = opts.accidentals === 'flat' ? LETTERS_FLAT : LETTERS_SHARP;
  const [letter, acc] = table[mod12(pc)];
  const base = opts.notation === 'latin' ? LATIN[letter] : letter;
  const accSym = acc === '#' ? '♯' : acc === 'b' ? '♭' : '';
  return { base, acc: accSym, text: base + accSym };
}

/** Nombre con ambas alternativas para teclas negras: "C♯/D♭". */
export function pcDualName(pc, opts = {}) {
  const s = pcName(pc, { ...opts, accidentals: 'sharp' }).text;
  const f = pcName(pc, { ...opts, accidentals: 'flat' }).text;
  return s === f ? s : `${s}/${f}`;
}

export function midiName(midi, opts = {}) {
  const n = pcName(mod12(Math.round(midi)), opts);
  return { ...n, octave: Math.floor(Math.round(midi) / 12) - 1 };
}

/** Nota más cercana a una frecuencia. */
export function nearestNote(freq, a4 = DEFAULT_A4) {
  const exact = freqToMidi(freq, a4);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100, target: midiToFreq(midi, a4) };
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];

/** Índice de letra (0=C … 6=B) con que se escribe una clase de altura según la preferencia. */
export function letterIndexOf(pc, accidentals = 'sharp') {
  const table = accidentals === 'flat' ? LETTERS_FLAT : LETTERS_SHARP;
  return LETTERS.indexOf(table[mod12(pc)][0]);
}

/**
 * Escribe una clase de altura usando una letra concreta (p. ej. pc 3 con letra E → E♭).
 * Devuelve null si haría falta un doble sostenido/bemol.
 */
export function spellWithLetter(pc, letterIdx, opts = {}) {
  const li = ((letterIdx % 7) + 7) % 7;
  let diff = mod12(pc - LETTER_PCS[li]);
  if (diff > 6) diff -= 12;
  if (Math.abs(diff) > 1) return null;
  const letter = LETTERS[li];
  const base = opts.notation === 'latin' ? LATIN[letter] : letter;
  const acc = diff === 1 ? '♯' : diff === -1 ? '♭' : '';
  return { base, acc, text: base + acc };
}
