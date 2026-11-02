// Afinaciones de guitarra (cuerdas de la 6ª, la más grave, a la 1ª, la más aguda).
import { parseNote, midiToFreq, cents } from './notes.js';

export const TUNINGS = [
  { id: 'standard', name: 'Estándar', group: 'Estándar', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'half-down', name: 'Medio tono abajo', group: 'Estándar', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
  { id: 'full-down', name: 'Un tono abajo', group: 'Estándar', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'drop-d', name: 'Drop D', group: 'Drop', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'drop-cs', name: 'Drop C♯', group: 'Drop', notes: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] },
  { id: 'drop-c', name: 'Drop C', group: 'Drop', notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'drop-b', name: 'Drop B', group: 'Drop', notes: ['B1', 'F#2', 'B2', 'E3', 'G#3', 'C#4'] },
  { id: 'drop-a', name: 'Drop A', group: 'Drop', notes: ['A1', 'E2', 'A2', 'D3', 'F#3', 'B3'] },
  { id: 'open-d', name: 'Open D', group: 'Abiertas', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  { id: 'open-dm', name: 'Open D menor', group: 'Abiertas', notes: ['D2', 'A2', 'D3', 'F3', 'A3', 'D4'] },
  { id: 'open-g', name: 'Open G', group: 'Abiertas', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'open-e', name: 'Open E', group: 'Abiertas', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  { id: 'open-a', name: 'Open A', group: 'Abiertas', notes: ['E2', 'A2', 'E3', 'A3', 'C#4', 'E4'] },
  { id: 'open-c', name: 'Open C', group: 'Abiertas', notes: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'] },
  { id: 'dadgad', name: 'DADGAD', group: 'Otras', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  { id: 'double-drop-d', name: 'Doble Drop D', group: 'Otras', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'nashville', name: 'Nashville', group: 'Otras', notes: ['E3', 'A3', 'D4', 'G4', 'B3', 'E4'] },
];

export const CUSTOM_ID = 'custom';

export function getTuning(id, custom) {
  if (id === CUSTOM_ID && custom) return { id: CUSTOM_ID, name: 'Personalizada', group: 'Personalizada', notes: custom };
  return TUNINGS.find((t) => t.id === id) || TUNINGS[0];
}

/** MIDI de cada cuerda (índice 0 = 6ª cuerda). */
export function tuningMidis(tuning) {
  return tuning.notes.map(parseNote);
}

export function tuningFreqs(tuning, a4 = 440) {
  return tuningMidis(tuning).map((m) => midiToFreq(m, a4));
}

/** Cuerda más cercana (en cents) a la frecuencia detectada. */
export function closestString(freq, freqs) {
  let best = 0;
  let bestAbs = Infinity;
  freqs.forEach((f, i) => {
    const c = Math.abs(cents(freq, f));
    if (c < bestAbs) {
      bestAbs = c;
      best = i;
    }
  });
  return { index: best, cents: cents(freq, freqs[best]) };
}

/** Mínima frecuencia que el detector debe cubrir para esta afinación. */
export function minDetectFreq(freqs) {
  return Math.max(30, Math.min(...freqs) * 0.7);
}
