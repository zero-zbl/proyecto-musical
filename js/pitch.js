// Detección de frecuencia fundamental con el algoritmo YIN
// (de Cheveigné & Kawahara, 2002) e interpolación parabólica.
// Módulo puro: sin dependencias del navegador, testeable en Node.

/**
 * @param {Float32Array|number[]} buf  muestras de audio
 * @param {number} sampleRate
 * @param {object} [opts]
 * @returns {{freq:number, clarity:number, rms:number}|null}
 */
export function detectPitch(buf, sampleRate, opts = {}) {
  const {
    minFreq = 40,
    maxFreq = 1400,
    threshold = 0.15,
    maxAperiodicity = 0.4,
    rmsThreshold = 0.005,
  } = opts;
  const n = buf.length;

  // Quitar componente continua y medir energía.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  const x = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i] - mean;
    x[i] = v;
    energy += v * v;
  }
  const rms = Math.sqrt(energy / n);
  if (rms < rmsThreshold) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.ceil(sampleRate / minFreq), Math.floor(n / 2));
  if (tauMax <= tauMin + 2) return null;
  const w = n - tauMax - 1;

  // Función de diferencia d(tau) y diferencia normalizada acumulada d'(tau),
  // calculadas de forma incremental: se detiene en cuanto encuentra el mínimo.
  const d = new Float32Array(tauMax + 2);
  const cmnd = new Float32Array(tauMax + 2);
  cmnd[0] = 1;
  let running = 0;
  let computed = 0;
  const computeUpTo = (limit) => {
    for (let tau = computed + 1; tau <= limit; tau++) {
      let sum = 0;
      for (let j = 0; j < w; j++) {
        const diff = x[j] - x[j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
      running += sum;
      cmnd[tau] = running > 0 ? (sum * tau) / running : 1;
    }
    if (limit > computed) computed = limit;
  };

  // Primer mínimo bajo el umbral (evita errores de octava hacia abajo).
  let tauEst = -1;
  computeUpTo(tauMin);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    computeUpTo(tau + 1);
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) {
        tau++;
        computeUpTo(tau + 1);
      }
      tauEst = tau;
      break;
    }
  }
  // Si nada cruza el umbral, usar el mínimo global si es razonablemente periódico.
  if (tauEst === -1) {
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) if (cmnd[tau] < cmnd[best]) best = tau;
    if (cmnd[best] > maxAperiodicity) return null;
    tauEst = best;
  }
  if (tauEst >= tauMax) return null;

  // Interpolación parabólica para precisión sub-muestra.
  let betterTau = tauEst;
  if (tauEst > 1 && tauEst < tauMax) {
    // Sobre d(tau) sin normalizar: menos sesgo que sobre d'(tau) en períodos cortos.
    const s0 = d[tauEst - 1];
    const s1 = d[tauEst];
    const s2 = d[tauEst + 1];
    const denom = s0 + s2 - 2 * s1;
    if (denom !== 0) {
      const shift = (s0 - s2) / (2 * denom);
      if (Math.abs(shift) < 1) betterTau = tauEst + shift;
    }
  }

  const freq = sampleRate / betterTau;
  if (freq < minFreq || freq > maxFreq) return null;
  return { freq, clarity: 1 - cmnd[tauEst], rms };
}

/**
 * Reduce la frecuencia de muestreo a la mitad promediando pares
 * (filtro pasa-bajo simple). Reduce ~4x el costo de YIN.
 */
export function downsample2(buf) {
  const out = new Float32Array(buf.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * (buf[2 * i] + buf[2 * i + 1]);
  return out;
}

/**
 * Estabilizador: mediana de lecturas recientes, olvida tras silencios
 * y exige confirmación ante saltos grandes (p. ej. errores de octava).
 */
export class PitchSmoother {
  constructor({ size = 5, gapMs = 250, jumpCents = 80, confirmFrames = 3 } = {}) {
    this.size = size;
    this.gapMs = gapMs;
    this.jumpCents = jumpCents;
    this.confirmFrames = confirmFrames;
    this.reset();
  }

  reset() {
    this.values = [];
    this.lastTime = -Infinity;
    this.pending = [];
  }

  /** @returns {number|null} frecuencia estabilizada */
  push(freq, timeMs) {
    if (freq == null) {
      if (timeMs - this.lastTime > this.gapMs) this.reset();
      return null;
    }
    if (timeMs - this.lastTime > this.gapMs) this.reset();
    this.lastTime = timeMs;

    const current = this.current();
    if (current != null && Math.abs(1200 * Math.log2(freq / current)) > this.jumpCents) {
      // Salto grande: confirmar con varias lecturas coherentes antes de aceptar.
      // Se conservan solo las lecturas coherentes con la más reciente, para que una
      // lectura de transición aislada no bloquee la confirmación del nuevo tono.
      this.pending = this.pending.filter((f) => Math.abs(1200 * Math.log2(f / freq)) < this.jumpCents);
      this.pending.push(freq);
      if (this.pending.length >= this.confirmFrames) {
        this.values = this.pending.slice();
        this.pending = [];
        return this.current();
      }
      return current;
    }
    this.pending = [];
    this.values.push(freq);
    if (this.values.length > this.size) this.values.shift();
    return this.current();
  }

  current() {
    if (!this.values.length) return null;
    const s = [...this.values].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
}
