import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, downsample2, PitchSmoother } from '../js/pitch.js';
import { renderPluck } from '../js/synth.js';
import { TUNINGS, tuningFreqs, closestString, minDetectFreq } from '../js/tunings.js';
import { cents, nearestNote, parseNote, midiToFreq, pcName, freqToMidi } from '../js/notes.js';

const SR = 48000;
const FRAME = 4096; // igual que el AnalyserNode de la app

function sine(freq, n = FRAME, sr = SR, amp = 0.5) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return b;
}

// Señal tipo guitarra: fundamental débil y 2º armónico dominante (caso típico de la 6ª cuerda),
// con leve inarmonicidad.
function guitarLike(freq, n = FRAME, sr = SR) {
  const b = new Float32Array(n);
  const amps = [0.35, 1, 0.6, 0.45, 0.3, 0.2, 0.15, 0.1];
  for (let i = 0; i < n; i++) {
    let v = 0;
    amps.forEach((a, k) => {
      const h = k + 1;
      const fk = freq * h * Math.sqrt(1 + 0.00005 * h * h);
      v += a * Math.sin((2 * Math.PI * fk * i) / sr + h);
    });
    b[i] = 0.2 * v;
  }
  return b;
}

let seed = 12345;
function noise() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
}

// Simula el pipeline de la app: captura a 48 kHz y reducción a 24 kHz.
function detectLikeApp(buf, opts) {
  return detectPitch(downsample2(buf), SR / 2, opts);
}

test('detecta senos puros de 40 Hz a 1000 Hz con error < 1 cent', () => {
  for (const f of [41.2, 55, 61.74, 73.42, 82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.25, 987.77]) {
    const r = detectLikeApp(sine(f), { minFreq: 35 });
    assert.ok(r, `sin detección para ${f}`);
    assert.ok(Math.abs(cents(r.freq, f)) < 1, `${f} Hz → ${r.freq.toFixed(3)} Hz`);
  }
});

test('todas las cuerdas de todas las afinaciones con timbre de guitarra (fundamental débil)', () => {
  for (const t of TUNINGS) {
    const freqs = tuningFreqs(t);
    const minFreq = minDetectFreq(freqs);
    freqs.forEach((f, i) => {
      for (const detune of [-30, -8, 0, 4, 25]) {
        const real = f * 2 ** (detune / 1200);
        const r = detectLikeApp(guitarLike(real), { minFreq });
        assert.ok(r, `${t.name} cuerda ${6 - i}: sin detección`);
        const err = cents(r.freq, real);
        assert.ok(Math.abs(err) < 2, `${t.name} cuerda ${6 - i} (${detune}c): error ${err.toFixed(2)} cents`);
        const s = closestString(r.freq, freqs);
        assert.equal(s.index, i, `${t.name}: cuerda ${6 - i} identificada como ${6 - s.index}`);
        assert.ok(Math.abs(s.cents - detune) < 2);
      }
    });
  }
});

test('nota pulsada sintetizada (decaimiento, ataque) en distintas fases de la nota', () => {
  for (const f of [82.41, 110, 146.83, 196, 246.94, 329.63, 61.74]) {
    const audio = renderPluck(f, SR, 2);
    for (const start of [2000, 12000, 30000, 60000]) {
      const r = detectLikeApp(audio.subarray(start, start + FRAME));
      assert.ok(r, `sin detección ${f} en ${start}`);
      assert.ok(Math.abs(cents(r.freq, f)) < 1.5, `${f}: ${r.freq.toFixed(2)} en ${start}`);
    }
  }
});

test('robusto ante ruido moderado (SNR ~ 20 dB)', () => {
  for (const f of [82.41, 110, 196, 329.63]) {
    const b = guitarLike(f);
    for (let i = 0; i < b.length; i++) b[i] += noise() * 0.06;
    const r = detectLikeApp(b);
    assert.ok(r && Math.abs(cents(r.freq, f)) < 5, `${f} con ruido → ${r && r.freq}`);
  }
});

test('silencio y ruido blanco no producen nota', () => {
  assert.equal(detectLikeApp(new Float32Array(FRAME)), null);
  const quiet = sine(110, FRAME, SR, 0.001);
  assert.equal(detectLikeApp(quiet), null);
  const wn = new Float32Array(FRAME).map(() => noise() * 0.5);
  assert.equal(detectLikeApp(wn), null);
});

test('rendimiento: un cuadro de análisis toma pocos milisegundos', () => {
  const b = guitarLike(82.41);
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) detectLikeApp(b, { minFreq: 40 });
  const ms = (performance.now() - t0) / 50;
  assert.ok(ms < 15, `${ms.toFixed(2)} ms por cuadro`);
});

test('PitchSmoother: mediana, filtra errores de octava aislados y se reinicia tras silencio', () => {
  const s = new PitchSmoother();
  let t = 0;
  for (const f of [110, 110.2, 109.9, 110.1]) s.push(f, (t += 16));
  assert.ok(Math.abs(s.push(220, (t += 16)) - 110) < 0.5, 'salto aislado de octava ignorado');
  assert.ok(Math.abs(s.push(110, (t += 16)) - 110) < 0.5);
  // Cambio real de cuerda: se acepta tras varias lecturas coherentes.
  s.push(146.8, (t += 16));
  s.push(146.8, (t += 16));
  assert.ok(Math.abs(s.push(146.8, (t += 16)) - 146.8) < 0.1);
  // Lectura de transición aislada durante el cambio de cuerda no debe bloquear el cambio.
  s.push(300, (t += 16));
  s.push(196, (t += 16));
  s.push(196, (t += 16));
  assert.ok(Math.abs(s.push(196, (t += 16)) - 196) < 0.1, 'cambio bloqueado por lectura de transición');
  // Silencio largo → reinicio.
  assert.equal(s.push(null, (t += 500)), null);
  assert.ok(Math.abs(s.push(82.4, (t += 16)) - 82.4) < 0.01);
});

test('utilidades de notas', () => {
  assert.equal(parseNote('A4'), 69);
  assert.equal(parseNote('E2'), 40);
  assert.equal(parseNote('Bb1'), 34);
  assert.equal(parseNote('F#3'), 54);
  assert.ok(Math.abs(midiToFreq(40) - 82.4069) < 0.001);
  assert.ok(Math.abs(midiToFreq(69, 432) - 432) < 1e-9);
  assert.equal(Math.round(freqToMidi(440)), 69);
  const n = nearestNote(445);
  assert.equal(n.midi, 69);
  assert.ok(Math.abs(n.cents - 19.56) < 0.1);
  assert.equal(pcName(1).text, 'C♯');
  assert.equal(pcName(1, { accidentals: 'flat' }).text, 'D♭');
  assert.equal(pcName(10, { notation: 'latin', accidentals: 'flat' }).text, 'Si♭');
  assert.equal(pcName(7, { notation: 'latin' }).text, 'Sol');
});

test('afinaciones: 6 cuerdas, ordenadas razonablemente y con ids únicos', () => {
  const ids = new Set();
  for (const t of TUNINGS) {
    assert.equal(t.notes.length, 6);
    assert.ok(!ids.has(t.id));
    ids.add(t.id);
    tuningFreqs(t).forEach((f) => assert.ok(f > 50 && f < 400, `${t.name}: ${f}`));
  }
  const dropD = TUNINGS.find((t) => t.id === 'drop-d');
  assert.ok(Math.abs(tuningFreqs(dropD)[0] - 73.416) < 0.01);
});
