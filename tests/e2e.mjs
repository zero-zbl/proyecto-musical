// Prueba end-to-end en Chromium: micrófono simulado con timbre de guitarra,
// verificando todo el pipeline (Web Audio → YIN → interfaz).
// Uso: npm run test:e2e   (opcional: SCREENSHOTS=dir para guardar capturas)
import assert from 'node:assert/strict';
import { createServer } from '../tools/serve.mjs';
import { loadPlaywright } from '../tools/load-playwright.mjs';
import { renderPluck } from '../js/synth.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { chromium } = await loadPlaywright();
const shotsDir = process.env.SCREENSHOTS;
const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

// Fuente de audio falsa: suma de armónicos (fundamental débil, como la 6ª cuerda).
const FAKE_MIC = () => {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(dest);
  const amps = [0.4, 1, 0.6, 0.4, 0.25, 0.15];
  const oscs = amps.map((a, k) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = a * 0.12;
    o.connect(g).connect(master);
    o.start();
    return { o, k: k + 1 };
  });
  window.__fake = {
    set(freq) {
      ctx.resume();
      oscs.forEach(({ o, k }) => o.frequency.setValueAtTime(freq * k, ctx.currentTime));
      master.gain.setValueAtTime(1, ctx.currentTime);
    },
    silence() {
      master.gain.setValueAtTime(0, ctx.currentTime);
    },
  };
  navigator.mediaDevices.getUserMedia = async () => {
    await ctx.resume();
    return dest.stream;
  };
};

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log(`✔ ${name}`);
  } catch (e) {
    results.push(['fail', name, e]);
    console.log(`✖ ${name}\n   ${e.message.split('\n').join('\n   ')}`);
  }
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await context.addInitScript(FAKE_MIC);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const meter = () =>
  page.evaluate(() => {
    const m = document.querySelector('#meter');
    return {
      state: m.dataset.state,
      cents: m.dataset.cents != null ? Number(m.dataset.cents) : null,
      freq: m.dataset.freq != null ? Number(m.dataset.freq) : null,
      string: m.dataset.string != null ? Number(m.dataset.string) : null,
      note: document.querySelector('#noteName').textContent.trim(),
      hint: document.querySelector('#hintText').textContent,
    };
  });

/** Emite una frecuencia y espera una lectura estable. */
async function play(freq, wait = 700) {
  await page.evaluate((f) => window.__fake.set(f), freq);
  await page.waitForTimeout(wait);
  return meter();
}
const shot = async (name) => {
  if (!shotsDir) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
};

await page.goto(base);
await page.waitForSelector('.string-row');

await step('carga inicial: 6 cuerdas en afinación estándar, sin errores', async () => {
  assert.equal(await page.locator('.string-row').count(), 6);
  assert.equal(await page.textContent('#tuningNotes'), 'E A D G B E');
  await shot('01-inicio');
});

await step('activar micrófono', async () => {
  await page.click('#micBtn');
  await page.waitForFunction(() => document.querySelector('#micBtnText').textContent.includes('Detener'));
});

await step('auto: La2 (110 Hz) afinado → 5ª cuerda, verde y marcada', async () => {
  const m = await play(110, 1400);
  assert.equal(m.string, 1, JSON.stringify(m));
  assert.ok(Math.abs(m.cents) < 1.5, `cents ${m.cents}`);
  assert.equal(m.state, 'tuned');
  assert.match(m.hint, /Afinado/);
  assert.ok(m.note.startsWith('A'));
  assert.ok(await page.locator('.string-row[data-i="1"].tuned').count(), 'la cuerda no quedó marcada');
  await shot('02-afinado');
});

await step('auto: 108 Hz → 5ª cuerda baja (≈ −32 cents)', async () => {
  const m = await play(108);
  assert.equal(m.string, 1);
  assert.ok(Math.abs(m.cents - -31.77) < 1.5, `cents ${m.cents}`);
  assert.equal(m.state, 'off');
  assert.match(m.hint, /Bajo/);
  await shot('03-bajo');
});

await step('auto: 83.5 Hz → 6ª cuerda alta (≈ +23 cents)', async () => {
  const m = await play(83.5);
  assert.equal(m.string, 0);
  assert.ok(Math.abs(m.cents - 22.8) < 1.5, `cents ${m.cents}`);
  assert.match(m.hint, /Alto/);
});

await step('auto: cada cuerda estándar ligeramente desafinada se identifica bien', async () => {
  const freqs = [82.41, 110, 146.83, 196, 246.94, 329.63];
  for (let i = 0; i < 6; i++) {
    const f = freqs[i] * 2 ** (-6 / 1200);
    const m = await play(f, 600);
    assert.equal(m.string, i, `cuerda ${6 - i}: ${JSON.stringify(m)}`);
    assert.ok(Math.abs(m.cents - -6) < 1.5, `cuerda ${6 - i}: cents ${m.cents}`);
    assert.equal(m.state, 'near');
  }
});

await step('cambio de afinación a Drop D desde la hoja', async () => {
  await page.click('#tuningBtn');
  await page.click('[data-tuning="drop-d"]');
  assert.equal(await page.textContent('#tuningName'), 'Drop D');
  assert.equal(await page.textContent('#tuningNotes'), 'D A D G B E');
  const m = await play(73.42, 1000);
  assert.equal(m.string, 0);
  assert.ok(Math.abs(m.cents) < 1.5, `cents ${m.cents}`);
  assert.ok(m.note.startsWith('D'));
});

await step('Drop B: Si1 (61.7 Hz) en 6ª cuerda', async () => {
  await page.click('#tuningBtn');
  await page.click('[data-tuning="drop-b"]');
  const m = await play(61.74, 1000);
  assert.equal(m.string, 0, JSON.stringify(m));
  assert.ok(Math.abs(m.cents) < 2, `cents ${m.cents}`);
});

await step('Open G: la 5ª cuerda es Sol2', async () => {
  await page.click('#tuningBtn');
  await page.click('[data-tuning="open-g"]');
  const m = await play(98, 900);
  assert.equal(m.string, 1);
  assert.ok(Math.abs(m.cents) < 1.5);
  await shot('04-open-g');
});

await step('manual: cuerda 3 (Sol3) seleccionada y se toca Re3 → "sube 5 semitonos"', async () => {
  await page.click('#tuningBtn');
  await page.click('[data-tuning="standard"]');
  await page.click('.string-pill[data-select="3"]');
  assert.equal(await page.getAttribute('[data-mode="manual"]', 'aria-selected'), 'true');
  const m = await play(146.83);
  assert.equal(m.string, 3);
  assert.match(m.hint, /sube 5 semitonos/);
  assert.ok(m.note.startsWith('G'));
  await shot('05-manual');
});

await step('manual: al afinar avanza automáticamente a la siguiente cuerda', async () => {
  await page.click('#resetTuned');
  await page.click('.string-pill[data-select="2"]');
  await play(146.83, 1800);
  assert.ok(await page.locator('.string-row[data-i="2"].tuned').count());
  assert.ok(await page.locator('.string-row[data-i="3"].selected').count(), 'no avanzó a la 3ª cuerda');
});

await step('cromático: La4 440 Hz', async () => {
  await page.click('[data-mode="chromatic"]');
  const m = await play(440);
  assert.equal(m.note, 'A4');
  assert.equal(m.state, 'tuned');
  const m2 = await play(466.16);
  assert.equal(m2.note, 'A♯4');
});

await step('silencio → vuelve a estado de espera', async () => {
  await page.evaluate(() => window.__fake.silence());
  await page.waitForTimeout(1900);
  const m = await meter();
  assert.equal(m.state, 'idle');
});

await step('calibración 432 Hz en ajustes', async () => {
  await page.click('.tabbar [data-view="settings"]');
  for (let i = 0; i < 8; i++) await page.click('[data-a4="-1"]');
  assert.equal(await page.textContent('#a4Value'), '432 Hz');
  await page.click('.tabbar [data-view="tuner"]');
  const m = await play(432);
  assert.equal(m.note, 'A4');
  assert.ok(Math.abs(m.cents) < 1.5, `cents ${m.cents}`);
  const m2 = await play(440);
  assert.ok(Math.abs(m2.cents - 31.77) < 1.5, `cents ${m2.cents}`);
  await page.click('.tabbar [data-view="settings"]');
  for (let i = 0; i < 8; i++) await page.click('[data-a4="1"]');
  await page.click('.tabbar [data-view="tuner"]');
  await page.click('[data-mode="auto"]');
});

await step('tono de referencia suena sin errores y no se autodetecta', async () => {
  await page.evaluate(() => window.__fake.silence());
  await page.waitForFunction(() => document.querySelector('#meter').dataset.state === 'idle', null, { timeout: 3000 });
  await page.click('.play-btn[data-play="0"]');
  await page.waitForTimeout(1200);
  assert.equal((await meter()).state, 'idle');
});

await step('detener micrófono', async () => {
  await page.click('#micBtn');
  assert.match(await page.textContent('#micBtnText'), /Activar/);
});

await step('afinación personalizada', async () => {
  await page.click('#tuningBtn');
  await page.click('[data-tuning="custom"]');
  await page.click('[data-cs="0"][data-d="-1"]');
  await page.click('[data-cs="0"][data-d="-1"]');
  await page.click('#customSave');
  assert.equal(await page.textContent('#tuningName'), 'Personalizada');
  assert.equal(await page.textContent('#tuningNotes'), 'D A D G B E');
});

await step('acordes: mayores (12), búsqueda y posiciones', async () => {
  await page.click('.tabbar [data-view="chords"]');
  assert.equal(await page.locator('.chord-card').count(), 12);
  await shot('06-acordes');
  await page.fill('#chordSearch', 'Am7');
  assert.equal(await page.locator('.chord-card .chord-name').first().textContent(), 'Am7');
  const first = page.locator('.chord-card').first();
  const before = await first.locator('svg').innerHTML();
  await first.locator('[data-step="1"]').click();
  const after = await page.locator('.chord-card').first().locator('svg').innerHTML();
  assert.notEqual(before, after);
  await page.locator('.chord-card').first().locator('.chord-diagram').click(); // rasgueo
  await page.fill('#chordSearch', 'Solm');
  assert.equal(await page.locator('.chord-card .chord-name').first().textContent(), 'Gm');
  await page.fill('#chordSearch', 'Bbmaj7');
  assert.match(await page.locator('.chord-card .chord-name').first().textContent(), /A♯maj7/);
  await page.fill('#chordSearch', 'zzz');
  assert.equal(await page.locator('.chord-card').count(), 0);
  await page.fill('#chordSearch', '');
});

await step('acordes: filtros por categoría y tónica', async () => {
  await page.click('[data-cat="todos"]');
  await page.click('[data-root="0"]');
  assert.equal(await page.locator('.chord-card').count(), 17);
  await page.click('[data-cat="septimas"]');
  await page.click('[data-root="accidentals"]');
  assert.equal(await page.locator('.chord-card').count(), 25);
  await page.click('[data-cat="menores"]');
  await page.click('[data-root="all"]');
  assert.equal(await page.locator('.chord-card').count(), 12);
  await shot('07-menores');
  await page.click('[data-cat="todos"]');
  assert.equal(await page.locator('.chord-card').count(), 12 * 17);
  await page.click('[data-cat="mayores"]');
});

await step('notación latina y bemoles persisten tras recargar', async () => {
  await page.click('.tabbar [data-view="settings"]');
  await page.click('#notationSeg [data-v="latin"]');
  await page.click('#accSeg [data-v="flat"]');
  await shot('08-ajustes');
  await page.reload();
  await page.waitForSelector('.string-row');
  assert.equal(await page.textContent('#tuningNotes'), 'Re La Re Sol Si Mi');
  await page.click('.tabbar [data-view="chords"]');
  assert.equal(await page.locator('.chord-card .chord-name').nth(1).textContent(), 'Re♭ (Do♯)');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

await step('diseño móvil: sin desbordamiento horizontal en ninguna vista', async () => {
  for (const view of ['tuner', 'chords', 'settings']) {
    await page.click(`.tabbar [data-view="${view}"]`);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 390, `${view}: ancho ${w}`);
  }
  await page.click('.tabbar [data-view="tuner"]');
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  assert.ok(h <= 844, `el afinador no cabe en pantalla: alto ${h}`);
  await page.click('.tabbar [data-view="tuner"]');
});

await step('PWA: service worker activo y la app carga sin conexión', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.string-row');
  assert.equal(await page.locator('.string-row').count(), 6);
  await context.setOffline(false);
});

await step('sin errores de JavaScript en consola', async () => {
  assert.deepEqual(errors, []);
});

// Pantalla pequeña (iPhone SE)
await step('pantalla pequeña 320x568 sin desbordamiento', async () => {
  const p2 = await context.newPage();
  await p2.setViewportSize({ width: 320, height: 568 });
  await p2.goto(base);
  await p2.waitForSelector('.string-row');
  const w = await p2.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 320, `ancho ${w}`);
  if (shotsDir) await p2.screenshot({ path: `${shotsDir}/09-pequena.png` });
  await p2.close();
});

await browser.close();

// Micrófono "real" de Chromium alimentado con un WAV: punteos de Mi2 a −10 cents.
function writeWav(file, samples, sr) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000), 44 + i * 2));
  fs.writeFileSync(file, buf);
}
await step('micrófono real de Chromium (WAV): Mi2 −10 cents', async () => {
  const sr = 48000;
  const f = 82.407 * 2 ** (-10 / 1200);
  const pluck = renderPluck(f, sr, 2);
  const audio = new Float32Array(sr * 8);
  for (let t = 0; t + pluck.length <= audio.length; t += pluck.length) audio.set(pluck.map((v) => v * 0.7), t);
  const wav = path.join(os.tmpdir(), `temple-e2-${process.pid}.wav`);
  writeWav(wav, audio, sr);
  const b2 = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`],
  });
  try {
    const ctx2 = await b2.newContext({ permissions: ['microphone'] });
    const p = await ctx2.newPage();
    await p.goto(base);
    await p.click('#micBtn');
    const readings = [];
    for (let i = 0; i < 30; i++) {
      await p.waitForTimeout(100);
      const d = await p.evaluate(() => ({ ...document.querySelector('#meter').dataset }));
      if (d.cents != null) readings.push(d);
    }
    assert.ok(readings.length > 5, `pocas lecturas: ${readings.length}`);
    for (const r of readings) assert.equal(r.string, '0', JSON.stringify(r));
    const cs = readings.map((r) => Number(r.cents)).sort((a, b) => a - b);
    const median = cs[cs.length >> 1];
    assert.ok(Math.abs(median - -10) < 1.5, `mediana ${median} cents`);
  } finally {
    await b2.close();
    fs.rmSync(wav, { force: true });
  }
});

server.close();
const failed = results.filter((r) => r[0] === 'fail');
console.log(`\n${results.length - failed.length}/${results.length} pasos correctos`);
process.exit(failed.length ? 1 : 0);
