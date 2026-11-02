// Dibuja un diagrama de acorde en SVG (cuerdas verticales, 6ª a la izquierda).
import { voicingMidis } from './chords.js';
import { mod12, pcName } from './notes.js';

const W = 150;
const LEFT = 26;
const SP = 21; // separación entre cuerdas
const TOP = 30;
const FH = 24; // alto de traste
const FRETS = 5;

const x = (s) => LEFT + s * SP;

export function chordDiagramSVG(voicing, rootPc, nameOpts = {}, spell = null) {
  const fretted = voicing.frets.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const base = maxF <= FRETS ? 1 : Math.min(...fretted);
  const y = (fret) => TOP + (fret - base + 0.5) * FH;
  const bottom = TOP + FRETS * FH;
  const H = bottom + 24;
  const parts = [];

  // Trastes y cejuela
  for (let i = 0; i <= FRETS; i++) {
    const yy = TOP + i * FH;
    if (i === 0 && base === 1) parts.push(`<line class="cd-nut" x1="${x(0)}" x2="${x(5)}" y1="${yy}" y2="${yy}"/>`);
    else parts.push(`<line class="cd-fret" x1="${x(0)}" x2="${x(5)}" y1="${yy}" y2="${yy}"/>`);
  }
  for (let s = 0; s < 6; s++) {
    parts.push(`<line class="cd-string" x1="${x(s)}" x2="${x(s)}" y1="${TOP}" y2="${bottom}" style="stroke-width:${(2.1 - s * 0.22).toFixed(2)}"/>`);
  }
  if (base > 1) parts.push(`<text class="cd-fretnum" x="${LEFT - 9}" y="${y(base)}">${base}</text>`);

  // Cejillas
  for (const b of voicing.barres || []) {
    const yy = y(b.fret);
    parts.push(`<rect class="cd-barre" x="${x(b.from) - 8}" y="${yy - 8}" width="${x(b.to) - x(b.from) + 16}" height="16" rx="8"/>`);
  }

  const midis = voicingMidis(voicing);
  voicing.frets.forEach((f, s) => {
    const cx = x(s);
    if (f < 0) {
      const yy = TOP - 13;
      parts.push(`<path class="cd-mark" d="M${cx - 5} ${yy - 5}l10 10m0 -10l-10 10"/>`);
    } else if (f === 0) {
      parts.push(`<circle class="cd-mark open" cx="${cx}" cy="${TOP - 13}" r="5.5"/>`);
    } else {
      const isRoot = mod12(midis[s]) === rootPc;
      const inBarre = (voicing.barres || []).some((b) => b.fret === f && s >= b.from && s <= b.to && b.finger === voicing.fingers[s]);
      if (!inBarre || isRoot) parts.push(`<circle class="cd-dot${isRoot ? ' root' : ''}" cx="${cx}" cy="${y(f)}" r="8.5"/>`);
      const finger = voicing.fingers[s];
      if (finger) parts.push(`<text class="cd-finger" x="${cx}" y="${y(f) + 0.5}">${finger}</text>`);
    }
    if (midis[s] !== null) {
      const pc = mod12(midis[s]);
      const text = spell ? spell(pc) : pcName(pc, nameOpts).text;
      const isRoot = pc === rootPc;
      parts.push(`<text class="cd-noteName${isRoot ? ' root' : ''}" x="${cx}" y="${bottom + 15}">${text}</text>`);
    }
  });

  const label = describeVoicing(voicing);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}

/** Descripción accesible: "6ª: X, 5ª: traste 3, ..." */
export function describeVoicing(v) {
  return v.frets
    .map((f, i) => `${6 - i}ª ${f < 0 ? 'no tocar' : f === 0 ? 'al aire' : `traste ${f}`}`)
    .join(', ');
}
