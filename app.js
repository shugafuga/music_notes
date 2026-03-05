'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const LS   = 16;         // line spacing (px between staff lines)
const NR   = LS * 0.62;  // note oval half-height
const NW   = LS * 0.85;  // note oval half-width
const MARGIN_LEFT = 18;
const NOTE_STEP   = 50;
const CLEF_W      = 52;
const PADDING     = 40;
const PIANO_WKH   = 100; // white key height
const PIANO_GAP   = 42;  // gap between label row and piano top

const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// note_idx → { r, g, b }
const NOTE_COLORS = [
  { r: 210, g:  40, b:  40 }, // C – red
  { r: 215, g: 120, b:   0 }, // D – orange
  { r: 140, g: 150, b:   0 }, // E – yellow-green
  { r:  30, g: 160, b:  50 }, // F – green
  { r:   0, g: 130, b: 200 }, // G – blue
  { r: 100, g:  50, b: 210 }, // A – indigo
  { r: 180, g:  40, b: 160 }, // B – violet
];

// top note of each staff: [note_idx, octave]
const TREBLE_ANCHOR = [3, 5]; // F5 – top line of treble staff
const BASS_ANCHOR   = [5, 3]; // A3 – top line of bass staff

// ─── App State ────────────────────────────────────────────────────────────────
const SCREEN_DPI = 96; // assumed screen resolution

const state = {
  useSolfege:   true,
  labelNear:    false,
  quizMode:     false,
  showLedger:   false,
  ledgerCount:  2,
  showPiano:    false,
  pianoOverlap: false,
  pianoColored: false,
  pianoOpacity: 1.0,
  sheetBg:      '#ffffff',
  sheetMargin:  40,
  scale:        1.0,
  exportDpi:    150,
  // set by drawAll, read by exportPNG / size display
  _contentW:    0,
  _contentH:    0,
};

let shuffledTreble = null;
let shuffledBass   = null;
let pendingDraw    = false;

// ─── Clef Images ──────────────────────────────────────────────────────────────
const clefImgs = {
  treble: new Image(),
  bass:   new Image(),
};
clefImgs.treble.src = 'treble-clef.png';
clefImgs.bass.src   = 'bass-clef.png';
clefImgs.treble.onload = () => scheduleDraw();
clefImgs.bass.onload   = () => scheduleDraw();

// ─── Color Helpers ────────────────────────────────────────────────────────────
function rgba({ r, g, b }, alpha = 1) {
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Mimic Qt's QColor::darker(factor): multiply channels by 100/factor. */
function darken({ r, g, b }, factor = 160) {
  const f = 100 / factor;
  return { r: Math.round(r * f), g: Math.round(g * f), b: Math.round(b * f) };
}

/** Mimic Qt's QColor::lighter(factor): multiply channels by factor/100, clamp 255. */
function lighten({ r, g, b }, factor = 160) {
  const f = factor / 100;
  return {
    r: Math.min(255, Math.round(r * f)),
    g: Math.min(255, Math.round(g * f)),
    b: Math.min(255, Math.round(b * f)),
  };
}

// ─── Note Math ────────────────────────────────────────────────────────────────

/**
 * Return [note_idx, octave] for the diatonic note `step` positions
 * below the anchor (positive step = lower pitch).
 */
function noteForStep(topNoteIdx, topOctave, step) {
  let idx = topNoteIdx, oct = topOctave;
  if (step >= 0) {
    for (let i = 0; i < step; i++) {
      idx--;
      if (idx < 0) { idx = 6; oct--; }
    }
  } else {
    for (let i = 0; i < -step; i++) {
      idx++;
      if (idx > 6) { idx = 0; oct++; }
    }
  }
  return [idx, oct];
}

/**
 * Return array of step positions that require ledger lines
 * for a note head drawn at `step`.
 */
function ledgerStepsFor(step) {
  if (step > 8) {
    const r = [];
    for (let s = 10; s <= step; s += 2) r.push(s);
    return r;
  }
  if (step < 0) {
    const r = [];
    for (let s = -2; s >= step; s -= 2) r.push(s);
    return r;
  }
  return [];
}

/**
 * Build the complete note list for one staff.
 * Returns [{noteIdx, step, octave, ledgerSteps}, …]
 */
function buildNotes(anchorNoteIdx, anchorOctave, nAbove, nBelow) {
  const result = [];
  const stepMin = -2 * nAbove;
  const stepMax =  8 + 2 * nBelow;
  for (let step = stepMin; step <= stepMax; step++) {
    const [noteIdx, octave] = noteForStep(anchorNoteIdx, anchorOctave, step);
    result.push({
      noteIdx,
      step,
      octave: String(octave),
      ledgerSteps: ledgerStepsFor(step),
    });
  }
  return result;
}

// ─── Shuffle ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Drawing: Clef Symbols ────────────────────────────────────────────────────

function drawTrebleClef(ctx, x0, topY) {
  const img = clefImgs.treble;
  if (!img.complete || !img.naturalWidth) return;
  const h = LS * 7.5;
  const w = h * img.naturalWidth / img.naturalHeight;
  const y = topY - 2 * LS;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.drawImage(img, x0, y, w, h);
  ctx.restore();
}

function drawBassClef(ctx, x0, topY) {
  const img = clefImgs.bass;
  if (!img.complete || !img.naturalWidth) return;
  const h = LS * 2.7;
  const w = h * img.naturalWidth / img.naturalHeight;
  const y = topY - 0.1 * LS;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.drawImage(img, x0, y, w, h);
  ctx.restore();
}

// ─── Drawing: Staff ───────────────────────────────────────────────────────────

function drawStaff(ctx, topY, xStart, xEnd, labelText, clefType) {
  ctx.save();

  // Label above staff
  ctx.fillStyle = '#3c3c3c';
  ctx.font      = 'bold 11px Arial';
  ctx.fillText(labelText, xStart, topY - 14);

  // 5 horizontal lines
  ctx.strokeStyle = 'rgba(20,20,20,0.9)';
  ctx.lineWidth   = 1.6;
  for (let i = 0; i < 5; i++) {
    const y = topY + i * LS;
    ctx.beginPath();
    ctx.moveTo(xStart, y);
    ctx.lineTo(xEnd,   y);
    ctx.stroke();
  }

  // Opening bar line
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(xStart, topY); ctx.lineTo(xStart, topY + 4 * LS);
  ctx.stroke();

  // Thin closing bar line
  ctx.beginPath();
  ctx.moveTo(xEnd - 4, topY); ctx.lineTo(xEnd - 4, topY + 4 * LS);
  ctx.stroke();

  // Thick closing bar line
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(xEnd, topY); ctx.lineTo(xEnd, topY + 4 * LS);
  ctx.stroke();

  ctx.restore();

  if (clefType === 'treble') {
    drawTrebleClef(ctx, xStart + 6, topY);
  } else {
    drawBassClef(ctx, xStart + 4, topY);
  }
}

// ─── Drawing: Notes ───────────────────────────────────────────────────────────

/**
 * Draw all notes for one staff.
 * nw / nr = actual oval half-width / half-height (may be smaller than NW/NR
 *           when notes are dense, to prevent overlap).
 * Returns [{x, y, noteIdx, octave}, …] for piano connectors.
 */
function drawNotes(ctx, topY, xStart, noteStepPx, notes, quiz, useSolfege, labelNear, nw, nr) {
  const QUIZ_FILL = { r: 50, g: 50, b: 50 };
  const QUIZ_DARK = { r: 30, g: 30, b: 30 };

  const maxStep  = Math.max(...notes.map(n => n.step));
  const maxY     = topY + maxStep * (LS / 2);
  const labelY   = Math.max(topY + 4 * LS + 12, maxY + nr + 8);

  const positions = [];

  for (let i = 0; i < notes.length; i++) {
    const { noteIdx, step, octave, ledgerSteps } = notes[i];
    const x = xStart + i * noteStepPx + noteStepPx / 2;
    const y = topY + step * (LS / 2);
    positions.push({ x, y, noteIdx, octave: parseInt(octave, 10) });

    const fillColor = quiz ? QUIZ_FILL : NOTE_COLORS[noteIdx];
    const darkColor = quiz ? QUIZ_DARK : darken(NOTE_COLORS[noteIdx]);

    // Ledger lines
    ctx.save();
    ctx.strokeStyle = '#141414';
    ctx.lineWidth   = 1.5;
    for (const ls of ledgerSteps) {
      const ly = topY + ls * (LS / 2);
      ctx.beginPath();
      ctx.moveTo(x - nw * 1.6, ly);
      ctx.lineTo(x + nw * 1.6, ly);
      ctx.stroke();
    }
    ctx.restore();

    // Note oval
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, nw, nr, 0, 0, 2 * Math.PI);
    ctx.fillStyle   = rgba(fillColor);
    ctx.fill();
    ctx.strokeStyle = rgba(darkColor);
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    // Labels (hidden in quiz mode)
    if (!quiz) {
      const name = useSolfege ? SOLFEGE[noteIdx] : LETTERS[noteIdx];

      ctx.save();
      ctx.font      = 'bold 9px Arial';
      ctx.fillStyle = rgba(darkColor);
      const textW   = ctx.measureText(name).width;
      if (labelNear) {
        ctx.fillText(name, x - textW / 2, y + nr + 10);
      } else {
        ctx.fillText(name, x - textW / 2, labelY + 10);
      }

      // Octave badge (top-right of note head)
      ctx.font      = '7px Arial';
      ctx.fillStyle = 'rgba(100,100,100,0.85)';
      ctx.fillText(octave, x + nw, y - nr - 2);
      ctx.restore();
    }
  }

  return positions;
}

// ─── Drawing: Piano ───────────────────────────────────────────────────────────

function drawPiano(ctx, positions, yTop, noteStepPx, colored, opacity) {
  if (!positions.length || opacity < 0.01) return;

  const WKW = noteStepPx;
  const WKH = PIANO_WKH;
  const BKW = Math.floor(WKW * 0.58);
  const BKH = Math.floor(WKH * 0.63);

  // Sort by ascending pitch so adjacent entries correspond to adjacent piano keys
  const sorted = [...positions].sort(
    (a, b) => (a.octave * 7 + a.noteIdx) - (b.octave * 7 + b.noteIdx),
  );

  ctx.save();
  ctx.globalAlpha = opacity;

  // White key bodies (no stroke to avoid visible seams under black keys)
  for (const { x, noteIdx } of positions) {
    const kx   = x - WKW / 2;
    const fill = colored
      ? rgba(lighten(NOTE_COLORS[noteIdx], 160))
      : '#f5f5f5';
    ctx.fillStyle = fill;
    ctx.fillRect(kx, yTop, WKW, WKH);
  }

  // Separator lines between adjacent keys
  for (let i = 0; i < sorted.length - 1; i++) {
    const nidxLow = sorted[i].noteIdx;
    const xSep    = (sorted[i].x + sorted[i + 1].x) / 2;
    const hasBlk  = nidxLow !== 2 && nidxLow !== 6; // E→F and B→C have no sharp
    ctx.strokeStyle = 'rgba(110,110,110,0.9)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(xSep, hasBlk ? yTop + BKH : yTop);
    ctx.lineTo(xSep, yTop + WKH);
    ctx.stroke();
  }

  // Outer keyboard border
  const xLeft  = sorted[0].x           - WKW / 2;
  const xRight = sorted[sorted.length - 1].x + WKW / 2;
  ctx.strokeStyle = '#505050';
  ctx.lineWidth   = 1.2;
  ctx.strokeRect(xLeft, yTop, xRight - xLeft, WKH);

  // C tick marks below keyboard
  for (const { x, noteIdx } of sorted) {
    if (noteIdx === 0) {
      ctx.strokeStyle = 'rgba(140,140,140,0.8)';
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - WKW / 2, yTop + WKH + 1);
      ctx.lineTo(x - WKW / 2, yTop + WKH + 5);
      ctx.stroke();
    }
  }

  // Black keys
  ctx.fillStyle = '#1c1c1c';
  for (let i = 0; i < sorted.length - 1; i++) {
    const nidxLow = sorted[i].noteIdx;
    if (nidxLow === 2 || nidxLow === 6) continue; // no accidental between E-F, B-C
    const bkx = (sorted[i].x + sorted[i + 1].x) / 2 - BKW / 2;
    ctx.fillRect(bkx, yTop, BKW, BKH);
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(bkx, yTop, BKW, BKH);
  }

  ctx.restore();
}

// ─── Drawing: Piano (overlap mode — keys behind notes) ────────────────────────

/**
 * Draw piano keys that span exactly the vertical extent of the note heads
 * (overlap mode). Must be called BEFORE drawNotes so notes appear on top.
 */
function drawPianoOverlap(ctx, positions, noteStepPx, colored, opacity, nr) {
  if (!positions.length || opacity < 0.01) return;

  const WKW = noteStepPx;
  const BKW = Math.floor(WKW * 0.58);

  const sorted = [...positions].sort(
    (a, b) => (a.octave * 7 + a.noteIdx) - (b.octave * 7 + b.noteIdx),
  );

  // Span keys to cover all note heads
  const minY = Math.min(...positions.map(p => p.y)) - nr - 2;
  const maxY = Math.max(...positions.map(p => p.y)) + nr + 2;
  const WKH  = maxY - minY;
  const BKH  = Math.floor(WKH * 0.55);
  const yTop = minY;

  ctx.save();
  ctx.globalAlpha = opacity;

  // White key bodies
  for (const { x, noteIdx } of positions) {
    const kx   = x - WKW / 2;
    const fill = colored
      ? rgba(lighten(NOTE_COLORS[noteIdx], 150), 0.35)
      : 'rgba(255,255,255,0.18)';
    ctx.fillStyle = fill;
    ctx.fillRect(kx, yTop, WKW, WKH);
  }

  // Separators
  for (let i = 0; i < sorted.length - 1; i++) {
    const nidxLow = sorted[i].noteIdx;
    const xSep    = (sorted[i].x + sorted[i + 1].x) / 2;
    const hasBlk  = nidxLow !== 2 && nidxLow !== 6;
    ctx.strokeStyle = 'rgba(120,130,160,0.4)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(xSep, hasBlk ? yTop + BKH : yTop);
    ctx.lineTo(xSep, yTop + WKH);
    ctx.stroke();
  }

  // Outer border
  const xLeft  = sorted[0].x           - WKW / 2;
  const xRight = sorted[sorted.length - 1].x + WKW / 2;
  ctx.strokeStyle = 'rgba(120,130,160,0.5)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(xLeft, yTop, xRight - xLeft, WKH);

  // Black keys
  for (let i = 0; i < sorted.length - 1; i++) {
    const nidxLow = sorted[i].noteIdx;
    if (nidxLow === 2 || nidxLow === 6) continue;
    const bkx = (sorted[i].x + sorted[i + 1].x) / 2 - BKW / 2;
    ctx.fillStyle = colored ? 'rgba(20,20,30,0.45)' : 'rgba(20,20,30,0.4)';
    ctx.fillRect(bkx, yTop, BKW, BKH);
  }

  ctx.restore();
}

// ─── Helpers: calc note positions without drawing ─────────────────────────────

function calcPositions(topY, xStart, noteStepPx, notes) {
  return notes.map((note, i) => ({
    x:       xStart + i * noteStepPx + noteStepPx / 2,
    y:       topY + note.step * (LS / 2),
    noteIdx: note.noteIdx,
    octave:  parseInt(note.octave, 10),
  }));
}

const A4_RATIO = 297 / 210; // width / height  (A4 landscape)

// ─── Export size display ──────────────────────────────────────────────────────────

function updateExportSizeDisplay() {
  const scale = state.exportDpi / SCREEN_DPI;
  const w = Math.round(state._contentW * scale);
  const h = Math.round(state._contentH * scale);
  const el = document.getElementById('export-size');
  if (el) el.textContent = `${w.toLocaleString()} × ${h.toLocaleString()} px`;
}

// ─── Main Draw ────────────────────────────────────────────────────────────────

function drawAll() {
  pendingDraw = false;

  const canvas  = document.getElementById('main-canvas');
  const wrapEl  = document.getElementById('canvas-wrap');
  const ctx     = canvas.getContext('2d');

  const N       = state.showLedger ? state.ledgerCount : 0;
  const PAD     = state.sheetMargin;
  const overlap = state.showPiano && state.pianoOverlap && !state.quizMode;

  // Apply margin as padding (top & bottom only — no left/right gap)
  wrapEl.style.paddingTop    = PAD + 'px';
  wrapEl.style.paddingBottom = PAD + 'px';
  wrapEl.style.paddingLeft   = '0';
  wrapEl.style.paddingRight  = '0';
  void wrapEl.offsetWidth; // force layout
  const availW = wrapEl.clientWidth;

  // Build note lists
  let trebleNotes = buildNotes(...TREBLE_ANCHOR, N, N);
  let bassNotes   = buildNotes(...BASS_ANCHOR,   N, N);
  trebleNotes = trebleNotes.reverse();
  bassNotes   = bassNotes.reverse();

  if (state.quizMode) {
    if (!shuffledTreble) shuffledTreble = shuffle([...trebleNotes]);
    if (!shuffledBass)   shuffledBass   = shuffle([...bassNotes]);
    trebleNotes = shuffledTreble;
    bassNotes   = shuffledBass;
  } else {
    shuffledTreble = null;
    shuffledBass   = null;
  }

  const numNotes = Math.max(trebleNotes.length, bassNotes.length);

  // ── Pass 1: compute content height (independent of width) ────────────────
  const TREBLE_TOP     = 80 + N * LS;
  const trebleMaxStep  = 8 + 2 * N;
  const trebleBottomY  = TREBLE_TOP + trebleMaxStep * (LS / 2);
  const trebleLabelY   = Math.max(TREBLE_TOP + 4 * LS + 12, trebleBottomY + NR + 8);
  const treblePianoTop = trebleLabelY + PIANO_GAP;

  const belowTreble = (state.showPiano && !overlap)
    ? treblePianoTop + PIANO_WKH + 24
    : trebleLabelY + 18;

  const BASS_TOP     = belowTreble + 60 + N * LS;
  const bassMaxStep  = 8 + 2 * N;
  const bassBottomY  = BASS_TOP + bassMaxStep * (LS / 2);
  const bassLabelY   = Math.max(BASS_TOP + 4 * LS + 12, bassBottomY + NR + 8);
  const bassPianoTop = bassLabelY + PIANO_GAP;

  const totalH = (state.showPiano && !overlap)
    ? bassPianoTop + PIANO_WKH + 30
    : bassLabelY + 30;

  // ── Pass 2: A4-landscape width, clamped to available space ────────────────
  const a4W    = Math.round(totalH * A4_RATIO);
  const staffW = Math.min(a4W, availW);

  // Note step + oval size (auto-shrink to prevent overlap)
  const baseW    = MARGIN_LEFT + CLEF_W + PADDING;
  const noteStep = Math.max(18, (staffW - baseW) / numNotes);
  const nw = Math.min(NW, noteStep * 0.44);  // half-width capped to avoid overlap
  const nr = nw * (NR / NW);                 // keep aspect ratio

  // Store scaled size for export / size display
  const sc = state.scale;
  state._contentW = Math.round(staffW * sc);
  state._contentH = Math.round(totalH * sc);

  // ── Size canvas at sc × DPR resolution ───────────────────────────────────
  const dpr   = window.devicePixelRatio || 1;
  const physW = Math.round(staffW * sc * dpr);
  const physH = Math.round(totalH * sc * dpr);
  if (canvas.width !== physW || canvas.height !== physH) {
    canvas.width  = physW;
    canvas.height = physH;
  }
  canvas.style.width  = Math.round(staffW * sc) + 'px';
  canvas.style.height = Math.round(totalH * sc) + 'px';

  // Update scale label
  const lbl = document.getElementById('scale-label');
  if (lbl) lbl.textContent = Math.round(sc * 100) + '%';

  ctx.save();
  ctx.scale(sc * dpr, sc * dpr);
  ctx.clearRect(0, 0, staffW, totalH);

  // Sheet background
  ctx.fillStyle = state.sheetBg;
  ctx.fillRect(0, 0, staffW, totalH);

  const xEnd   = staffW - 8;
  const xStart = MARGIN_LEFT + CLEF_W;

  // Pre-calculate positions (needed for overlap piano drawn before notes)
  const treblePos = calcPositions(TREBLE_TOP, xStart, noteStep, trebleNotes);
  const bassPos   = calcPositions(BASS_TOP,   xStart, noteStep, bassNotes);

  // ── Overlap piano — drawn FIRST so notes appear on top ───────────────────
  if (overlap) {
    drawPianoOverlap(ctx, treblePos, noteStep, state.pianoColored, state.pianoOpacity, nr);
    drawPianoOverlap(ctx, bassPos,   noteStep, state.pianoColored, state.pianoOpacity, nr);
  }

  // ── Staves ───────────────────────────────────────────────────────────────
  drawStaff(ctx, TREBLE_TOP, MARGIN_LEFT, xEnd, 'Treble Clef', 'treble');
  drawStaff(ctx, BASS_TOP,   MARGIN_LEFT, xEnd, 'Bass Clef',   'bass');

  // ── Notes ────────────────────────────────────────────────────────────────
  drawNotes(ctx, TREBLE_TOP, xStart, noteStep, trebleNotes,
    state.quizMode, state.useSolfege, state.labelNear, nw, nr);
  drawNotes(ctx, BASS_TOP,   xStart, noteStep, bassNotes,
    state.quizMode, state.useSolfege, state.labelNear, nw, nr);

  // ── Normal (below) piano keyboards ──────────────────────────────────────
  if (state.showPiano && !overlap && !state.quizMode) {
    drawPiano(ctx, treblePos, treblePianoTop, noteStep, state.pianoColored, state.pianoOpacity);
    drawPiano(ctx, bassPos,   bassPianoTop,   noteStep, state.pianoColored, state.pianoOpacity);
  }

  ctx.restore();

  // Update export size readout
  updateExportSizeDisplay();
}

// ─── Settings Persistence ────────────────────────────────────────────────────
const SETTINGS_KEY = 'musicNotesSettings';
let settingsLoaded = false;

function saveSettings() {
  if (!settingsLoaded) return;  // don't overwrite before we've loaded
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      useSolfege:   state.useSolfege,
      labelNear:    state.labelNear,
      quizMode:     state.quizMode,
      showLedger:   state.showLedger,
      ledgerCount:  state.ledgerCount,
      showPiano:    state.showPiano,
      pianoOverlap: state.pianoOverlap,
      pianoColored: state.pianoColored,
      pianoOpacity: state.pianoOpacity,
      sheetBg:      state.sheetBg,
      sheetMargin:  state.sheetMargin,
      scale:        state.scale,
      exportDpi:    state.exportDpi,
    }));
  } catch (_) {}
}

function loadSettings() {
  let s;
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return; }
  if (!s || typeof s !== 'object') return;

  const def = (key, val) => { if (s[key] !== undefined) state[key] = s[key]; };
  def('useSolfege');  def('labelNear');   def('quizMode');
  def('showLedger');  def('ledgerCount'); def('showPiano');
  def('pianoOverlap'); def('pianoColored'); def('pianoOpacity');
  def('sheetBg');     def('sheetMargin'); def('scale');
  def('exportDpi');

  // Sync DOM to restored state
  document.getElementById('rb-solfege').checked        = state.useSolfege;
  document.getElementById('rb-letters').checked        = !state.useSolfege;
  document.getElementById('rb-below').checked          = !state.labelNear;
  document.getElementById('rb-near').checked           = state.labelNear;
  document.getElementById('cb-quiz').checked           = state.quizMode;
  document.getElementById('cb-ledger').checked         = state.showLedger;
  document.getElementById('sb-ledger').value           = state.ledgerCount;
  document.getElementById('cb-piano').checked          = state.showPiano;
  document.getElementById('cb-piano-overlap').checked  = state.pianoOverlap;
  document.getElementById('cb-piano-col').checked      = state.pianoColored;
  document.getElementById('sl-opacity').value          = Math.round(state.pianoOpacity * 100);
  document.getElementById('cp-sheet-bg').value         = state.sheetBg;
  document.getElementById('sb-margin').value           = state.sheetMargin;
  document.getElementById('sl-scale').value            = Math.round(state.scale * 100);
  document.getElementById('sb-dpi').value              = state.exportDpi;
  settingsLoaded = true;
}

// ─── Scheduled Redraw ────────────────────────────────────────────────────────
function scheduleDraw() {
  saveSettings();
  if (!pendingDraw) {
    pendingDraw = true;
    requestAnimationFrame(drawAll);
  }
}

// ─── Export PNG ───────────────────────────────────────────────────────────────
function exportPNG() {
  const src    = document.getElementById('main-canvas');
  const scale  = state.exportDpi / SCREEN_DPI;
  const exportW = Math.round(state._contentW * scale);
  const exportH = Math.round(state._contentH * scale);

  const off  = document.createElement('canvas');
  off.width  = exportW;
  off.height = exportH;
  const octx = off.getContext('2d');
  // Scale from the physical canvas pixels (which already include DPR)
  octx.drawImage(src, 0, 0, exportW, exportH);

  const link    = document.createElement('a');
  link.download = 'music_notes.png';
  link.href     = off.toDataURL('image/png');
  link.click();
}

// ─── UI Init ──────────────────────────────────────────────────────────────────
function initUI() {
  loadSettings();

  // Notation
  document.getElementById('rb-solfege').addEventListener('change', () => {
    state.useSolfege = true;  scheduleDraw();
  });
  document.getElementById('rb-letters').addEventListener('change', () => {
    state.useSolfege = false; scheduleDraw();
  });

  // Label position
  document.getElementById('rb-below').addEventListener('change', () => {
    state.labelNear = false; scheduleDraw();
  });
  document.getElementById('rb-near').addEventListener('change', () => {
    state.labelNear = true;  scheduleDraw();
  });

  // Ledger lines
  document.getElementById('cb-ledger').addEventListener('change', e => {
    state.showLedger = e.target.checked; scheduleDraw();
  });
  document.getElementById('sb-ledger').addEventListener('input', e => {
    state.ledgerCount = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 2));
    scheduleDraw();
  });

  // Quiz
  document.getElementById('cb-quiz').addEventListener('change', e => {
    state.quizMode   = e.target.checked;
    shuffledTreble   = null;
    shuffledBass     = null;
    scheduleDraw();
  });
  document.getElementById('btn-shuffle').addEventListener('click', () => {
    shuffledTreble = null;
    shuffledBass   = null;
    scheduleDraw();
  });

  // Piano
  document.getElementById('cb-piano').addEventListener('change', e => {
    state.showPiano = e.target.checked; scheduleDraw();
  });
  document.getElementById('cb-piano-overlap').addEventListener('change', e => {
    state.pianoOverlap = e.target.checked; scheduleDraw();
  });
  document.getElementById('cb-piano-col').addEventListener('change', e => {
    state.pianoColored = e.target.checked; scheduleDraw();
  });
  document.getElementById('sl-opacity').addEventListener('input', e => {
    state.pianoOpacity = e.target.value / 100; scheduleDraw();
  });

  // Sheet
  document.getElementById('cp-sheet-bg').addEventListener('input', e => {
    state.sheetBg = e.target.value; scheduleDraw();
  });
  document.getElementById('sb-margin').addEventListener('input', e => {
    state.sheetMargin = Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0));
    scheduleDraw();
  });
  document.getElementById('sl-scale').addEventListener('input', e => {
    state.scale = e.target.value / 100;
    scheduleDraw();
  });

  // Export
  document.getElementById('sb-dpi').addEventListener('input', e => {
    state.exportDpi = Math.max(72, Math.min(600, parseInt(e.target.value, 10) || 150));
    updateExportSizeDisplay();
  });
  document.getElementById('btn-export').addEventListener('click', exportPNG);

  // Initial draw
  scheduleDraw();
}

// Redraw on resize (canvas may need to reapply DPR)
window.addEventListener('resize', scheduleDraw);
window.addEventListener('load',   initUI);
