import test from 'node:test';
import assert from 'node:assert/strict';
import { allChords, CHORD_TYPES, voicingMidis, parseChordName, getVoicings, detectBarres, chordSpeller } from '../js/chords.js';
import { mod12 } from '../js/notes.js';

const chords = allChords();

test('cada acorde (12 tónicas x tipos) tiene al menos una posición', () => {
  assert.equal(chords.length, 12 * CHORD_TYPES.length);
  for (const c of chords) assert.ok(c.voicings.length >= 1, `${c.root}${c.type.id} sin posiciones`);
});

test('todas las posiciones producen exactamente las notas del acorde con la tónica en el bajo', () => {
  for (const c of chords) {
    const allowed = new Set(c.type.intervals.map((i) => mod12(c.root + i)));
    const required = c.type.intervals.filter((i) => !c.type.optional.includes(i)).map((i) => mod12(c.root + i));
    for (const v of c.voicings) {
      const label = `${c.root}/${c.type.id} [${v.frets.join(',')}]`;
      const midis = voicingMidis(v).filter((m) => m !== null);
      assert.ok(midis.length >= 2, `${label}: muy pocas cuerdas`);
      const pcs = new Set(midis.map(mod12));
      for (const pc of pcs) assert.ok(allowed.has(pc), `${label}: nota ajena ${pc}`);
      for (const pc of required) assert.ok(pcs.has(pc), `${label}: falta ${pc}`);
      assert.equal(mod12(Math.min(...midis)), c.root, `${label}: el bajo no es la tónica`);
    }
  }
});

test('las posiciones son tocables: dedos coherentes y extensión máxima de 4 trastes', () => {
  for (const c of chords) {
    for (const v of c.voicings) {
      const label = `${c.root}/${c.type.id} [${v.frets.join(',')}]`;
      const fretted = v.frets.filter((f) => f > 0);
      if (fretted.length) assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 4, `${label}: demasiado abierto`);
      v.frets.forEach((f, i) => {
        if (f <= 0) assert.equal(v.fingers[i], 0, `${label}: dedo en cuerda al aire/muteada`);
        else assert.ok(v.fingers[i] >= 1 && v.fingers[i] <= 4, `${label}: falta dedo en cuerda ${6 - i}`);
      });
      // Un mismo dedo no puede estar en dos trastes distintos.
      const byFinger = {};
      v.frets.forEach((f, i) => {
        if (f > 0) (byFinger[v.fingers[i]] ||= new Set()).add(f);
      });
      for (const [fg, set] of Object.entries(byFinger)) assert.equal(set.size, 1, `${label}: dedo ${fg} en dos trastes`);
      // Dedos ordenados: un dedo de número mayor no puede ir en un traste más bajo.
      const entries = v.frets.map((f, i) => [f, v.fingers[i]]).filter(([f]) => f > 0);
      for (const [f1, g1] of entries) for (const [f2, g2] of entries) {
        if (g1 < g2) assert.ok(f1 <= f2, `${label}: dedo ${g1} en traste ${f1} por encima del dedo ${g2} en ${f2}`);
      }
      // Una cejilla no puede pasar por debajo de una cuerda al aire.
      for (const b of v.barres) {
        for (let s = b.from; s <= b.to; s++) assert.notEqual(v.frets[s], 0, `${label}: cejilla sobre cuerda al aire`);
      }
    }
  }
});

test('acordes abiertos conocidos', () => {
  const first = (root, t) => getVoicings(root, t)[0].frets.join(',');
  assert.equal(first(0, 'maj'), '-1,3,2,0,1,0'); // C
  assert.equal(first(7, 'maj'), '3,2,0,0,0,3'); // G
  assert.equal(first(9, 'm'), '-1,0,2,2,1,0'); // Am
  assert.equal(first(5, 'maj'), '1,3,3,2,1,1'); // F con cejilla
  assert.equal(first(11, 'm'), '-1,2,4,4,3,2'); // Bm
});

test('cejilla de F detectada en el traste 1 de la 6ª a la 1ª', () => {
  const f = getVoicings(5, 'maj')[0];
  assert.deepEqual(detectBarres(f), [{ finger: 1, fret: 1, from: 0, to: 5 }]);
});

test('interpreta nombres de acordes', () => {
  assert.deepEqual(parseChordName('C'), { root: 0, typeId: 'maj' });
  assert.deepEqual(parseChordName('C#m7'), { root: 1, typeId: 'm7' });
  assert.deepEqual(parseChordName('Dbmaj7'), { root: 1, typeId: 'maj7' });
  assert.deepEqual(parseChordName('Lam'), { root: 9, typeId: 'm' });
  assert.deepEqual(parseChordName('Sol7'), { root: 7, typeId: '7' });
  assert.deepEqual(parseChordName('Sib'), { root: 10, typeId: 'maj' });
  assert.deepEqual(parseChordName('bm'), { root: 11, typeId: 'm' });
  assert.deepEqual(parseChordName('F#dim7'), { root: 6, typeId: 'dim7' });
  assert.deepEqual(parseChordName('E5'), { root: 4, typeId: '5' });
  assert.equal(parseChordName('xyz'), null);
});

test('ortografía de notas del acorde', () => {
  const spell = (root, t, opts = {}) => {
    const sp = chordSpeller(root, t, opts);
    const type = CHORD_TYPES.find((x) => x.id === t);
    return type.intervals.map((i) => sp(mod12(root + i))).join(' ');
  };
  assert.equal(spell(0, 'm'), 'C E♭ G');
  assert.equal(spell(5, 'maj'), 'F A C');
  assert.equal(spell(5, '7'), 'F A C E♭');
  assert.equal(spell(2, 'maj'), 'D F♯ A');
  assert.equal(spell(11, 'maj'), 'B D♯ F♯');
  assert.equal(spell(10, 'maj', { accidentals: 'flat' }), 'B♭ D F');
  assert.equal(spell(1, 'm', { accidentals: 'flat' }), 'D♭ F♭ A♭');
  assert.equal(spell(3, 'maj7'), 'D♯ F♯♯ A♯ C♯♯'.replace('F♯♯', 'G').replace('C♯♯', 'D')); // sin dobles sostenidos
  assert.equal(spell(9, 'aug'), 'A C♯ E♯');
  assert.equal(spell(0, 'dim7'), 'C E♭ G♭ A');
  assert.equal(spell(7, 'm', { notation: 'latin' }), 'Sol Si♭ Re');
});
