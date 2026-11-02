import { TunerEngine } from './tuner.js';
import { Synth } from './synth.js';
import { TUNINGS, CUSTOM_ID, getTuning, tuningMidis, closestString, minDetectFreq } from './tunings.js';
import { midiToFreq, midiName, pcName, pcDualName, nearestNote, cents as centsOf, mod12 } from './notes.js';
import { CHORD_TYPES, CATEGORIES, getVoicings, parseChordName, voicingMidis, chordSpeller } from './chords.js';
import { chordDiagramSVG } from './chord-diagram.js';

const APP_VERSION = '1.0.0';
const STORE_KEY = 'temple-settings-v1';
const DEFAULTS = {
  tuningId: 'standard',
  custom: null,
  a4: 440,
  tolerance: 3,
  sensitivity: 0.5,
  notation: 'american',
  accidentals: 'sharp',
  mode: 'auto',
  wake: true,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------- Ajustes
const settings = loadSettings();

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch { /* almacenamiento no disponible */ }
}
const nameOpts = () => ({ notation: settings.notation, accidentals: settings.accidentals });

// ---------------------------------------------------------------- Estado
const state = {
  tuning: getTuning(settings.tuningId, settings.custom),
  midis: [],
  freqs: [],
  selected: 0,
  activeString: -1,
  tuned: new Set(),
  inTuneSince: 0,
  lastPitchAt: 0,
  listening: false,
};

const engine = new TunerEngine({ onPitch, onLevel });
const synth = new Synth(() => engine.getContext());
engine.sensitivity = settings.sensitivity;

function applyTuning() {
  state.tuning = getTuning(settings.tuningId, settings.custom);
  state.midis = tuningMidis(state.tuning);
  state.freqs = state.midis.map((m) => midiToFreq(m, settings.a4));
  engine.minFreq = minDetectFreq(state.freqs);
  state.tuned.clear();
  $('#tuningName').textContent = state.tuning.name;
  $('#tuningNotes').textContent = state.midis.map((m) => pcName(mod12(m), nameOpts()).text).join(' ');
  renderStrings();
}

function midiToNoteStr(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[mod12(midi)] + (Math.floor(midi / 12) - 1);
}

// ---------------------------------------------------------------- Navegación
$$('.tabbar button').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});
function showView(name) {
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $('.topbar .tuning-btn').style.visibility = name === 'tuner' ? 'visible' : 'hidden';
  if (name === 'chords') renderChords();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- Medidor
const GAUGE = { cx: 150, cy: 150, r: 116, maxAngle: 68 };
const angleFor = (c) => (Math.max(-50, Math.min(50, c)) / 50) * GAUGE.maxAngle;
function polar(angleDeg, r) {
  const a = (angleDeg * Math.PI) / 180;
  return [GAUGE.cx + r * Math.sin(a), GAUGE.cy - r * Math.cos(a)];
}
function arcPath(a1, a2, r) {
  const [x1, y1] = polar(a1, r);
  const [x2, y2] = polar(a2, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
function buildGauge() {
  const g = $('#gaugeTicks');
  let html = `<path class="arc" d="${arcPath(-GAUGE.maxAngle, GAUGE.maxAngle, GAUGE.r)}"/>`;
  for (let c = -50; c <= 50; c += 5) {
    const major = c % 25 === 0;
    const [x1, y1] = polar(angleFor(c), GAUGE.r + 13);
    const [x2, y2] = polar(angleFor(c), GAUGE.r + (major ? 23 : 18));
    html += `<line class="tick${major ? ' major' : ''}${c === 0 ? ' zero' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  const [lx, ly] = polar(-GAUGE.maxAngle, GAUGE.r - 26);
  const [rx, ry] = polar(GAUGE.maxAngle, GAUGE.r - 26);
  html += `<text class="tick-label" x="${lx}" y="${ly}">♭</text><text class="tick-label" x="${rx}" y="${ry}">♯</text>`;
  g.innerHTML = html;
  updateTolZone();
}
function updateTolZone() {
  const a = angleFor(settings.tolerance);
  $('#tolZone').setAttribute('d', arcPath(-a, a, GAUGE.r));
}

let needleCents = 0;
function setNeedle(c) {
  needleCents = c;
  $('#needle').style.transform = `rotate(${angleFor(c)}deg)`;
}

function setNoteDisplay(midi, showOctave = true) {
  const el = $('#noteName');
  if (midi == null) {
    el.innerHTML = '<span class="note-base">–</span>';
    return;
  }
  const n = midiName(midi, nameOpts());
  el.innerHTML = `<span class="note-base">${n.base}</span><span class="note-acc">${n.acc}</span>${showOctave ? `<sub class="note-oct">${n.octave}</sub>` : ''}`;
}

function setIdle(message = 'Toca una cuerda') {
  const meter = $('#meter');
  meter.dataset.state = 'idle';
  delete meter.dataset.cents;
  delete meter.dataset.freq;
  if (settings.mode === 'manual') setNoteDisplay(state.midis[state.selected]);
  else setNoteDisplay(null);
  $('#centsText').textContent = state.listening ? message : 'Activa el micrófono para afinar';
  $('#hintText').textContent = '';
  $('#freqText').innerHTML = '&nbsp;';
  setNeedle(0);
  state.activeString = -1;
  updateStringStates(null);
}

function onLevel(level) {
  $('#levelBar').style.width = `${Math.min(100, Math.sqrt(level) * 140)}%`;
}

function onPitch(freq) {
  const now = performance.now();
  if (freq == null) {
    // Mantener la última lectura un momento para que sea legible.
    if (state.lastPitchAt && now - state.lastPitchAt > 1200) {
      state.lastPitchAt = 0;
      state.inTuneSince = 0;
      setIdle();
    }
    return;
  }
  state.lastPitchAt = now;

  let targetMidi;
  let targetFreq;
  let stringIdx = -1;
  if (settings.mode === 'chromatic') {
    const n = nearestNote(freq, settings.a4);
    targetMidi = n.midi;
    targetFreq = n.target;
  } else if (settings.mode === 'manual') {
    stringIdx = state.selected;
    targetMidi = state.midis[stringIdx];
    targetFreq = state.freqs[stringIdx];
  } else {
    stringIdx = closestString(freq, state.freqs).index;
    targetMidi = state.midis[stringIdx];
    targetFreq = state.freqs[stringIdx];
  }
  const c = centsOf(freq, targetFreq);
  const abs = Math.abs(c);
  const tol = settings.tolerance;
  const status = abs <= tol ? 'tuned' : abs <= 15 ? 'near' : 'off';

  const meter = $('#meter');
  meter.dataset.state = status;
  meter.dataset.cents = c.toFixed(1);
  meter.dataset.freq = freq.toFixed(2);
  meter.dataset.string = String(stringIdx);
  setNoteDisplay(targetMidi);
  setNeedle(c);

  const sign = c > 0 ? '+' : c < 0 ? '−' : '';
  $('#centsText').textContent = `${sign}${Math.abs(c).toFixed(abs < 10 ? 1 : 0)} cents`;
  let hint;
  if (status === 'tuned') hint = 'Afinado ✓';
  else if (abs >= 100) {
    const semis = Math.round(abs / 100);
    hint = c < 0 ? `Muy bajo · sube ${semis} semitono${semis > 1 ? 's' : ''}` : `Muy alto · baja ${semis} semitono${semis > 1 ? 's' : ''}`;
  } else if (c < 0) hint = abs > 15 ? 'Bajo · tensa la cuerda ↑' : 'Un poco bajo ↑';
  else hint = abs > 15 ? 'Alto · afloja la cuerda ↓' : 'Un poco alto ↓';
  $('#hintText').textContent = hint;
  $('#freqText').textContent = `${freq.toFixed(1)} Hz · objetivo ${targetFreq.toFixed(1)} Hz`;

  state.activeString = stringIdx;
  updateStringStates(status);

  // Marcar cuerda afinada tras mantenerse dentro de la tolerancia.
  if (status === 'tuned' && stringIdx >= 0) {
    if (!state.inTuneSince) state.inTuneSince = now;
    else if (now - state.inTuneSince > 450 && !state.tuned.has(stringIdx)) markTuned(stringIdx);
  } else state.inTuneSince = 0;
}

function markTuned(idx) {
  state.tuned.add(idx);
  navigator.vibrate?.(60);
  updateStringStates('tuned');
  if (state.tuned.size === 6) {
    toast('¡Guitarra afinada! 🎸');
    navigator.vibrate?.([60, 80, 60]);
  } else if (settings.mode === 'manual') {
    // Avanzar automáticamente a la siguiente cuerda sin afinar.
    setTimeout(() => {
      if (settings.mode !== 'manual' || state.selected !== idx) return;
      for (let k = 1; k <= 6; k++) {
        const next = (idx + k) % 6;
        if (!state.tuned.has(next)) {
          selectString(next);
          break;
        }
      }
    }, 900);
  }
}

// ---------------------------------------------------------------- Cuerdas
function renderStrings() {
  const box = $('#strings');
  box.innerHTML = state.midis
    .map((m, i) => {
      const n = midiName(m, nameOpts());
      const width = (4.2 - i * 0.6).toFixed(1);
      return `<div class="string-row" role="listitem" data-i="${i}">
        <button class="string-pill" type="button" data-select="${i}" aria-label="Cuerda ${6 - i}: ${n.text}${n.octave}">
          <span class="num">${6 - i}</span>${n.text}<sub>${n.octave}</sub>
        </button>
        <div class="string-line" data-select="${i}" style="--w:${width}px"></div>
        <div class="string-tools">
          <span class="check" aria-hidden="true">✓</span>
          <button class="play-btn" type="button" data-play="${i}" aria-label="Escuchar ${n.text}${n.octave}">
            <svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>`;
    })
    .join('');
  updateStringStates(null);
  updateTunedCount();
}

function updateStringStates(status) {
  $$('.string-row').forEach((row) => {
    const i = Number(row.dataset.i);
    row.classList.toggle('selected', settings.mode === 'manual' && i === state.selected);
    row.classList.toggle('active', i === state.activeString);
    row.classList.toggle('tuned', state.tuned.has(i));
    if (i === state.activeString && status) row.dataset.state = status;
    else delete row.dataset.state;
  });
  updateTunedCount();
}
function updateTunedCount() {
  $('#tunedCount').textContent = `${state.tuned.size}/6 afinadas`;
}

function selectString(i) {
  state.selected = i;
  if (settings.mode !== 'manual') setMode('manual');
  updateStringStates(null);
  if (!state.lastPitchAt) setIdle();
}

$('#strings').addEventListener('click', (e) => {
  const play = e.target.closest('[data-play]');
  if (play) {
    playReference(Number(play.dataset.play));
    return;
  }
  const sel = e.target.closest('[data-select]');
  if (sel) selectString(Number(sel.dataset.select));
});

function playReference(i) {
  engine.mute(2300);
  synth.stop();
  synth.play(state.freqs[i], { duration: 2.2 });
}

$('#resetTuned').addEventListener('click', () => {
  state.tuned.clear();
  updateStringStates(null);
});

// ---------------------------------------------------------------- Modo
function setMode(mode) {
  settings.mode = mode;
  saveSettings();
  $$('.mode-switch button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#view-tuner').classList.toggle('chromatic', mode === 'chromatic');
  state.inTuneSince = 0;
  updateStringStates(null);
  if (!state.lastPitchAt) setIdle();
}
$$('.mode-switch button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

// ---------------------------------------------------------------- Micrófono
let wakeLock = null;
async function requestWakeLock() {
  if (!settings.wake || !state.listening || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* no soportado o denegado */ }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

$('#micBtn').addEventListener('click', async () => {
  const err = $('#micError');
  err.hidden = true;
  if (state.listening) {
    engine.stop();
    state.listening = false;
    releaseWakeLock();
    updateMicButton();
    onLevel(0);
    setIdle();
    return;
  }
  try {
    await engine.start();
    state.listening = true;
    updateMicButton();
    setIdle();
    requestWakeLock();
  } catch (e) {
    err.hidden = false;
    err.textContent = micErrorMessage(e);
  }
});

function micErrorMessage(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    return 'Permiso de micrófono denegado. Actívalo en la configuración del navegador para este sitio y vuelve a intentarlo.';
  }
  if (e?.name === 'NotFoundError') return 'No se encontró ningún micrófono en el dispositivo.';
  return `No se pudo acceder al micrófono: ${e?.message || e}`;
}

function updateMicButton() {
  const b = $('#micBtn');
  b.classList.toggle('on', state.listening);
  $('#meterFoot').classList.toggle('on', state.listening);
  $('#micBtnText').textContent = state.listening ? 'Detener' : 'Activar micrófono';
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.listening) {
    engine.ctx?.resume();
    requestWakeLock();
  }
});

// ---------------------------------------------------------------- Hoja de afinaciones
const tuningSheet = $('#tuningSheet');
const customSheet = $('#customSheet');
$('#tuningBtn').addEventListener('click', () => {
  renderTuningList();
  tuningSheet.showModal();
});
$$('dialog').forEach((d) => {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
});

function tuningNotesText(notesMidis) {
  return notesMidis.map((m) => pcName(mod12(m), nameOpts()).text).join(' ');
}

function renderTuningList() {
  const groups = {};
  for (const t of TUNINGS) (groups[t.group] ||= []).push(t);
  let html = '';
  for (const [group, list] of Object.entries(groups)) {
    html += `<div class="tuning-group">${group}</div>`;
    for (const t of list) {
      html += `<button class="tuning-item${settings.tuningId === t.id ? ' on' : ''}" data-tuning="${t.id}">
        <span class="t-name">${t.name}</span><span class="t-notes">${tuningNotesText(tuningMidis(t))}</span></button>`;
    }
  }
  const custom = settings.custom ? getTuning(CUSTOM_ID, settings.custom) : null;
  html += `<div class="tuning-group">Personalizada</div>
    <button class="tuning-item${settings.tuningId === CUSTOM_ID ? ' on' : ''}" data-tuning="${CUSTOM_ID}">
      <span><span class="t-name">Personalizada</span><br><span class="t-notes">${custom ? tuningNotesText(tuningMidis(custom)) : 'Crea tu propia afinación'}</span></span>
      <span class="edit">Editar</span></button>`;
  $('#tuningList').innerHTML = html;
}

$('#tuningList').addEventListener('click', (e) => {
  const item = e.target.closest('[data-tuning]');
  if (!item) return;
  const id = item.dataset.tuning;
  if (id === CUSTOM_ID) {
    tuningSheet.close();
    openCustomEditor();
    return;
  }
  settings.tuningId = id;
  saveSettings();
  applyTuning();
  setIdle();
  tuningSheet.close();
  toast(`Afinación: ${state.tuning.name}`);
});

let customDraft = [];
function openCustomEditor() {
  customDraft = tuningMidis(state.tuning).slice();
  renderCustomRows();
  customSheet.showModal();
}
function renderCustomRows() {
  $('#customRows').innerHTML = customDraft
    .map((m, i) => {
      const n = midiName(m, nameOpts());
      return `<div class="custom-row"><span>Cuerda ${6 - i}</span>
        <div class="stepper"><button type="button" data-cs="${i}" data-d="-1" aria-label="Bajar semitono">−</button>
        <output>${n.text}${n.octave}</output>
        <button type="button" data-cs="${i}" data-d="1" aria-label="Subir semitono">+</button></div></div>`;
    })
    .join('');
}
$('#customRows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cs]');
  if (!b) return;
  const i = Number(b.dataset.cs);
  customDraft[i] = Math.max(28, Math.min(76, customDraft[i] + Number(b.dataset.d)));
  renderCustomRows();
  synth.play(midiToFreq(customDraft[i], settings.a4), { duration: 1.2 });
});
$('#customSave').addEventListener('click', () => {
  settings.custom = customDraft.map(midiToNoteStr);
  settings.tuningId = CUSTOM_ID;
  saveSettings();
  applyTuning();
  setIdle();
  customSheet.close();
  toast('Afinación personalizada activa');
});

// ---------------------------------------------------------------- Acordes
const chordState = { category: 'mayores', root: 'all', query: '', voicingIdx: new Map() };
const ACCIDENTAL_PCS = new Set([1, 3, 6, 8, 10]);

function renderChordFilters() {
  $('#categoryChips').innerHTML = CATEGORIES.map(
    (c) => `<button class="chip${chordState.category === c.id ? ' on' : ''}" data-cat="${c.id}" role="tab">${c.label}</button>`,
  ).join('');
  const roots = [
    ['all', 'Todas'],
    ['naturals', 'Naturales'],
    ['accidentals', '♯ / ♭'],
    ...Array.from({ length: 12 }, (_, pc) => [String(pc), pcDualName(pc, { notation: settings.notation })]),
  ];
  $('#rootChips').innerHTML = roots
    .map(([id, label]) => `<button class="chip${String(chordState.root) === id ? ' on' : ''}" data-root="${id}" role="tab">${label}</button>`)
    .join('');
}

$('#categoryChips').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cat]');
  if (!c) return;
  chordState.category = c.dataset.cat;
  renderChords();
});
$('#rootChips').addEventListener('click', (e) => {
  const c = e.target.closest('[data-root]');
  if (!c) return;
  chordState.root = c.dataset.root;
  renderChords();
});
$('#chordSearch').addEventListener('input', (e) => {
  chordState.query = e.target.value;
  renderChords();
});

function chordName(root, type) {
  return pcName(root, nameOpts()).text + type.suffix;
}

function normalize(s) {
  return s.toLowerCase().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
}

function chordAliases(root, type) {
  const out = [];
  for (const notation of ['american', 'latin']) {
    for (const accidentals of ['sharp', 'flat']) {
      const base = pcName(root, { notation, accidentals }).text;
      out.push(normalize(base + type.suffix));
      if (type.id === 'maj') out.push(normalize(base + 'maj'));
      if (type.id === 'm') out.push(normalize(base + 'min'));
    }
  }
  return out;
}

function chordList() {
  const q = normalize(chordState.query);
  const list = [];
  if (q) {
    const exact = parseChordName(chordState.query);
    if (exact) list.push({ root: exact.root, type: CHORD_TYPES.find((t) => t.id === exact.typeId) });
    for (let root = 0; root < 12; root++) {
      for (const type of CHORD_TYPES) {
        if (exact && exact.root === root && exact.typeId === type.id) continue;
        if (chordAliases(root, type).some((a) => a.startsWith(q))) list.push({ root, type });
      }
    }
    return list;
  }
  for (const type of CHORD_TYPES) {
    if (chordState.category !== 'todos' && type.category !== chordState.category) continue;
    for (let root = 0; root < 12; root++) {
      const r = chordState.root;
      if (r === 'naturals' && ACCIDENTAL_PCS.has(root)) continue;
      if (r === 'accidentals' && !ACCIDENTAL_PCS.has(root)) continue;
      if (r !== 'all' && r !== 'naturals' && r !== 'accidentals' && Number(r) !== root) continue;
      list.push({ root, type });
    }
  }
  return list;
}

function renderChords() {
  renderChordFilters();
  const searching = Boolean(chordState.query.trim());
  $('#categoryChips').style.display = searching ? 'none' : '';
  $('#rootChips').style.display = searching ? 'none' : '';
  const list = chordList();
  const grid = $('#chordGrid');
  if (!list.length) {
    grid.innerHTML = `<p class="empty">No se encontró “${escapeHtml(chordState.query)}”.<br>Prueba con C, Am7, F#m, Solmaj7…</p>`;
    return;
  }
  grid.innerHTML = list.map(({ root, type }) => chordCardHTML(root, type)).join('');
}

function chordCardHTML(root, type) {
  const key = `${root}:${type.id}`;
  const voicings = getVoicings(root, type.id);
  const idx = Math.min(chordState.voicingIdx.get(key) || 0, voicings.length - 1);
  const v = voicings[idx];
  const name = chordName(root, type);
  const dual = ACCIDENTAL_PCS.has(root)
    ? ` <span class="muted small">(${pcName(root, { ...nameOpts(), accidentals: settings.accidentals === 'sharp' ? 'flat' : 'sharp' }).text}${type.suffix})</span>`
    : '';
  return `<article class="chord-card" data-key="${key}">
    <div class="chord-head"><span class="chord-name">${name}${dual}</span><span class="chord-type">${type.label}</span></div>
    <button class="chord-diagram" type="button" data-strum="${key}" aria-label="Escuchar ${name}">${chordDiagramSVG(v, root, nameOpts(), chordSpeller(root, type.id, nameOpts()))}</button>
    <div class="chord-foot">
      <button class="pager" type="button" data-step="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Posición anterior">‹</button>
      <span class="shape">${v.shape}<br>${idx + 1} / ${voicings.length}</span>
      <button class="pager" type="button" data-step="1" ${idx === voicings.length - 1 ? 'disabled' : ''} aria-label="Posición siguiente">›</button>
    </div>
  </article>`;
}

$('#chordGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.chord-card');
  if (!card) return;
  const key = card.dataset.key;
  const [root, typeId] = key.split(':');
  const type = CHORD_TYPES.find((t) => t.id === typeId);
  const voicings = getVoicings(Number(root), typeId);
  const step = e.target.closest('[data-step]');
  if (step) {
    const cur = chordState.voicingIdx.get(key) || 0;
    chordState.voicingIdx.set(key, Math.max(0, Math.min(voicings.length - 1, cur + Number(step.dataset.step))));
    card.outerHTML = chordCardHTML(Number(root), type);
    return;
  }
  if (e.target.closest('[data-strum]')) {
    const v = voicings[chordState.voicingIdx.get(key) || 0];
    const freqs = voicingMidis(v)
      .filter((m) => m !== null)
      .map((m) => midiToFreq(m, settings.a4));
    if (state.listening) engine.mute(3200);
    synth.strum(freqs);
  }
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------------------------------------------------------------- Vista de ajustes
function bindSeg(id, key, parse = (v) => v, after = () => {}) {
  const seg = $(id);
  const refresh = () => $$('button', seg).forEach((b) => b.classList.toggle('on', String(settings[key]) === b.dataset.v));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings[key] = parse(b.dataset.v);
    saveSettings();
    refresh();
    after();
  });
  refresh();
}

function refreshNames() {
  applyTuning();
  setIdle();
  if ($('#view-chords').classList.contains('active')) renderChords();
}

bindSeg('#tolSeg', 'tolerance', Number, updateTolZone);
bindSeg('#notationSeg', 'notation', String, refreshNames);
bindSeg('#accSeg', 'accidentals', String, refreshNames);

function setA4(v) {
  settings.a4 = Math.max(420, Math.min(460, v));
  saveSettings();
  $('#a4Value').textContent = `${settings.a4} Hz`;
  $('#a4Range').value = settings.a4;
  const tuned = new Set(state.tuned);
  applyTuning();
  state.tuned = tuned;
  updateStringStates(null);
}
$$('[data-a4]').forEach((b) => b.addEventListener('click', () => setA4(settings.a4 + Number(b.dataset.a4))));
$('#a4Range').addEventListener('input', (e) => setA4(Number(e.target.value)));

$('#sensRange').value = settings.sensitivity;
$('#sensRange').addEventListener('input', (e) => {
  settings.sensitivity = Number(e.target.value);
  engine.sensitivity = settings.sensitivity;
  saveSettings();
});

$('#wakeToggle').checked = settings.wake;
$('#wakeToggle').addEventListener('change', (e) => {
  settings.wake = e.target.checked;
  saveSettings();
  if (settings.wake) requestWakeLock();
  else releaseWakeLock();
});

$('#appVersion').textContent = `v${APP_VERSION}`;

// ---------------------------------------------------------------- Toast
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------- Inicio
buildGauge();
setA4(settings.a4);
setMode(settings.mode);
setIdle();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
