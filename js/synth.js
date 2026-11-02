// Sintetizador de cuerda pulsada por síntesis aditiva: afinación exacta
// (importante para los tonos de referencia) y timbre parecido a una guitarra.

/** Genera las muestras de una cuerda pulsada. Función pura (sirve en Node). */
export function renderPluck(freq, sampleRate, duration = 2.5, { harmonics = 14, pluckPos = 0.18 } = {}) {
  const n = Math.floor(sampleRate * duration);
  const out = new Float32Array(n);
  const nyquist = sampleRate / 2;
  let norm = 0;
  for (let k = 1; k <= harmonics; k++) {
    const fk = freq * k;
    if (fk >= nyquist * 0.9) break;
    // Amplitud según la posición de pulsación (forma de una cuerda pinzada).
    const amp = Math.abs(Math.sin(Math.PI * k * pluckPos)) / (k * 0.9);
    const decay = 1.2 + 0.9 * k + fk / 900; // los armónicos agudos decaen más rápido
    const w = (2 * Math.PI * fk) / sampleRate;
    const phase = k * 0.7;
    norm += amp;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      out[i] += amp * Math.exp(-decay * t) * Math.sin(w * i + phase);
    }
  }
  const attack = Math.floor(sampleRate * 0.004);
  for (let i = 0; i < n; i++) {
    let env = 1;
    if (i < attack) env = i / attack;
    const tail = n - i;
    if (tail < sampleRate * 0.05) env *= tail / (sampleRate * 0.05);
    out[i] = (out[i] / norm) * env;
  }
  return out;
}

export class Synth {
  constructor(getContext) {
    this.getContext = getContext;
    this.cache = new Map();
    this.active = [];
  }

  buffer(freq, duration) {
    const ctx = this.getContext();
    const key = `${freq.toFixed(3)}:${duration}:${ctx.sampleRate}`;
    if (!this.cache.has(key)) {
      const data = renderPluck(freq, ctx.sampleRate, duration);
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data, 0);
      this.cache.set(key, buf);
    }
    return this.cache.get(key);
  }

  stop() {
    const ctx = this.getContext();
    for (const { src, gain } of this.active) {
      try {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        src.stop(ctx.currentTime + 0.1);
      } catch { /* ya detenido */ }
    }
    this.active = [];
  }

  play(freq, { when = 0, duration = 2.5, volume = 0.6 } = {}) {
    const ctx = this.getContext();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(freq, duration);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime + when);
    const entry = { src, gain };
    this.active.push(entry);
    src.onended = () => {
      this.active = this.active.filter((e) => e !== entry);
    };
  }

  /** Rasgueo: notas de grave a agudo con un pequeño desfase. */
  strum(freqs, { gap = 0.045, duration = 3 } = {}) {
    this.stop();
    freqs.forEach((f, i) => this.play(f, { when: i * gap, duration, volume: 0.32 }));
  }
}
