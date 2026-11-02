// Captura del micrófono y bucle de detección (solo navegador).
import { detectPitch, downsample2, PitchSmoother } from './pitch.js';

export class TunerEngine {
  constructor({ onPitch, onLevel } = {}) {
    this.onPitch = onPitch || (() => {});
    this.onLevel = onLevel || (() => {});
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.running = false;
    this.minFreq = 40;
    this.sensitivity = 0.5; // 0..1
    this.mutedUntil = 0;
    this.smoother = new PitchSmoother();
    this._loop = this._loop.bind(this);
  }

  getContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador no permite usar el micrófono (se requiere HTTPS).');
    }
    const ctx = this.getContext();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    await ctx.resume();
    const source = ctx.createMediaStreamSource(this.stream);
    // Filtros: quitar zumbido grave y agudos que no aportan a la fundamental.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 28;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = ctx.sampleRate > 60000 ? 8192 : 4096;
    this.buf = new Float32Array(this.analyser.fftSize);
    source.connect(hp).connect(lp).connect(this.analyser);
    this.source = source;
    this.running = true;
    this.smoother.reset();
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
  }

  /** Ignora el micrófono un rato (p. ej. mientras suena un tono de referencia). */
  mute(ms) {
    this.mutedUntil = performance.now() + ms;
    this.smoother.reset();
  }

  _loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    // ~30 análisis por segundo es suficiente y ahorra batería.
    if (now - (this._last || 0) < 30) return;
    this._last = now;

    this.analyser.getFloatTimeDomainData(this.buf);
    let data = this.buf;
    let sr = this.ctx.sampleRate;
    while (sr > 30000) {
      data = downsample2(data);
      sr /= 2;
    }
    const rmsThreshold = 0.02 * (1 - this.sensitivity) ** 2 + 0.0015;
    const res = now < this.mutedUntil ? null : detectPitch(data, sr, { minFreq: this.minFreq, maxFreq: 1400, rmsThreshold });
    let level = 0;
    for (let i = 0; i < data.length; i += 4) level = Math.max(level, Math.abs(data[i]));
    this.onLevel(level);
    const freq = this.smoother.push(res ? res.freq : null, now);
    this.onPitch(freq, res);
  }
}
