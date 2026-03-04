"""
Music Notes Learning App
Draws treble & bass clef staves with labeled notes.
Notation: solfège (До Ре Ми…) or letter (C D E…)
Extra ledger lines above/below each staff (configurable count 1-4).
Export to PNG with custom size.
"""

import sys
import random
from pathlib import Path
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QSlider, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QRadioButton, QButtonGroup,
    QGraphicsView, QGraphicsScene,
    QGroupBox, QFileDialog, QSpinBox, QSizePolicy, QCheckBox,
)
from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import (
    QPen, QBrush, QColor, QPainter, QFont, QPixmap,
    QPainterPath,
)

# ──────────────────────────────────────────────────────────────────────────────
# Note name tables
# ──────────────────────────────────────────────────────────────────────────────
SOLFEGE = ["До", "Ре", "Ми", "Фа", "Соль", "Ля", "Си"]
LETTERS = ["C", "D", "E", "F", "G", "A", "B"]

# ──────────────────────────────────────────────────────────────────────────────
# Visual constants
# ──────────────────────────────────────────────────────────────────────────────
LS   = 16          # line spacing (pixels between staff lines)
NR   = LS * 0.62   # note oval half-height
NW   = LS * 0.85   # note oval half-width
STEM = LS * 3.2    # stem length

# Piano key dimensions
PIANO_WKW = 20    # white key width
PIANO_WKH = 100    # white key height
PIANO_BKW = 13    # black key width
PIANO_BKH = 54    # black key height
PIANO_GAP = 42    # gap between label row and piano top

NOTE_COLORS = [
    QColor(210,  40,  40),   # C – red
    QColor(215, 120,   0),   # D – orange
    QColor(140, 150,   0),   # E – yellow-green
    QColor( 30, 160,  50),   # F – green
    QColor(  0, 130, 200),   # G – blue
    QColor(100,  50, 210),   # A – indigo
    QColor(180,  40, 160),   # B – violet
]

# Anchor = note sitting on the TOP staff line (step 0)
# step increases downward, each step = one diatonic position
TREBLE_ANCHOR = (3, 5)   # F5  – top line of treble staff
BASS_ANCHOR   = (5, 3)   # A3  – top line of bass staff

EXPORT_DPI  = 150   # target DPI for PNG export
SCREEN_DPI  = 96    # assumed screen resolution (scene units per inch)


# ──────────────────────────────────────────────────────────────────────────────
# Note-generation helpers
# ──────────────────────────────────────────────────────────────────────────────

def _note_for_step(top_note_idx: int, top_octave: int, step: int):
    """Return (note_idx 0-6, octave) for the diatonic note `step` positions below anchor."""
    idx, oct_ = top_note_idx, top_octave
    if step >= 0:
        for _ in range(step):
            idx -= 1
            if idx < 0:
                idx = 6
                oct_ -= 1
    else:
        for _ in range(-step):
            idx += 1
            if idx > 6:
                idx = 0
                oct_ += 1
    return idx, oct_


def _ledger_steps_for(step: int):
    """Return list of even-step positions that require ledger lines for a note at `step`."""
    if step > 8:           # below staff → lines at 10, 12, 14 …
        return list(range(10, step + 1, 2))
    elif step < 0:         # above staff → lines at -2, -4, -6 …
        return list(range(-2, step - 1, -2))
    return []


def _build_notes(anchor_note_idx, anchor_octave, n_above: int, n_below: int):
    """
    Build the complete note list for one staff.

    Covers the 5-line staff (step 0–8) plus n_above extra ledger groups above
    and n_below below (each group = 2 diatonic steps: ledger line + adjacent space).

    Returns list of (note_idx, step, octave_str, ledger_steps_list).
    """
    result = []
    for step in range(-2 * n_above, 8 + 2 * n_below + 1):
        note_idx, octave = _note_for_step(anchor_note_idx, anchor_octave, step)
        result.append((note_idx, step, str(octave), _ledger_steps_for(step)))
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Main window
# ──────────────────────────────────────────────────────────────────────────────
class MusicNotesApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Изучение нот / Music Notes Learning")
        self.resize(1280, 760)
        self.use_solfege   = True
        self.label_near    = False   # True = label under note head; False = label row below staff
        self.quiz_mode     = False   # True = shuffled, no color, no labels
        self._build_ui()
        self._draw()

    # ── UI ────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        root = QWidget()
        self.setCentralWidget(root)
        vlay = QVBoxLayout(root)
        vlay.setContentsMargins(8, 8, 8, 8)

        toolbar = QHBoxLayout()
        toolbar.setSpacing(8)

        # ── Notation ──
        grp_n = QGroupBox("Labels")
        hn = QHBoxLayout(grp_n)
        hn.setContentsMargins(6, 4, 6, 4)
        self.rb_sol = QRadioButton("Do Re Mi… (Solfège)")
        self.rb_abc = QRadioButton("C D E… (Letters)")
        self.rb_sol.setChecked(True)
        self.rb_sol.toggled.connect(self._redraw)
        self._bg = QButtonGroup(self)
        self._bg.addButton(self.rb_sol)
        self._bg.addButton(self.rb_abc)
        hn.addWidget(self.rb_sol)
        hn.addWidget(self.rb_abc)
        # label position
        hn.addWidget(QLabel("  Position:"))
        self.rb_lbl_bottom = QRadioButton("Below Staff")
        self.rb_lbl_near   = QRadioButton("Near Note")
        self.rb_lbl_bottom.setChecked(True)
        self.rb_lbl_bottom.toggled.connect(self._redraw)
        self._bg_lbl = QButtonGroup(self)
        self._bg_lbl.addButton(self.rb_lbl_bottom)
        self._bg_lbl.addButton(self.rb_lbl_near)
        hn.addWidget(self.rb_lbl_bottom)
        hn.addWidget(self.rb_lbl_near)

        # ── Extra ledger lines ──
        grp_l = QGroupBox("Extra Ledger Lines")
        hl = QHBoxLayout(grp_l)
        hl.setContentsMargins(6, 4, 6, 4)
        self.cb_ledger = QCheckBox("Show")
        self.cb_ledger.setChecked(False)
        self.cb_ledger.toggled.connect(self._redraw)
        hl.addWidget(self.cb_ledger)
        hl.addWidget(QLabel("Count:"))
        self.sb_ledger = QSpinBox()
        self.sb_ledger.setRange(1, 6)
        self.sb_ledger.setValue(2)
        self.sb_ledger.setFixedWidth(48)
        self.sb_ledger.setToolTip(
            "Number of extra ledger line groups above & below each staff"
        )
        self.sb_ledger.valueChanged.connect(self._redraw)
        hl.addWidget(self.sb_ledger)
        info = QLabel("(above & below)")
        info.setStyleSheet("color:#666; font-size:10px;")
        hl.addWidget(info)

        # ── Export ──
        grp_e = QGroupBox("Export PNG")
        he = QHBoxLayout(grp_e)
        he.setContentsMargins(6, 4, 6, 4)
        he.addWidget(QLabel("DPI:"))
        self.sb_dpi = QSpinBox()
        self.sb_dpi.setRange(72, 600)
        self.sb_dpi.setValue(EXPORT_DPI)
        self.sb_dpi.setSingleStep(25)
        self.sb_dpi.setFixedWidth(54)
        self.sb_dpi.setToolTip("Export resolution in dots per inch")
        he.addWidget(self.sb_dpi)
        he.addWidget(QLabel("W:"))
        self.sb_w = QSpinBox()
        self.sb_w.setRange(400, 16000)
        self.sb_w.setValue(1900)
        self.sb_w.setSingleStep(100)
        self.sb_w.setFixedWidth(62)
        he.addWidget(self.sb_w)
        he.addWidget(QLabel("H:"))
        self.sb_h = QSpinBox()
        self.sb_h.setRange(200, 12000)
        self.sb_h.setValue(900)
        self.sb_h.setSingleStep(100)
        self.sb_h.setFixedWidth(62)
        he.addWidget(self.sb_h)
        btn_upd = QPushButton("📐 Update Size")
        btn_upd.setFixedHeight(28)
        btn_upd.setToolTip("Crop to scene content and recompute pixel size from DPI")
        btn_upd.clicked.connect(self._update_export_size)
        he.addWidget(btn_upd)
        btn_exp = QPushButton("💾  Save PNG")
        btn_exp.setFixedHeight(28)
        btn_exp.clicked.connect(self._export_png)
        he.addWidget(btn_exp)

        # ── Quiz mode ──
        grp_q = QGroupBox("Quiz")
        hq = QHBoxLayout(grp_q)
        hq.setContentsMargins(6, 4, 6, 4)
        self.cb_quiz = QCheckBox("Random")
        self.cb_quiz.setChecked(False)
        self.cb_quiz.toggled.connect(self._redraw)
        hq.addWidget(self.cb_quiz)
        btn_reshuffle = QPushButton("🔀 Shuffle")
        btn_reshuffle.setFixedHeight(26)
        btn_reshuffle.clicked.connect(self._reshuffle)
        hq.addWidget(btn_reshuffle)

        # ── Piano ──
        grp_p = QGroupBox("Piano")
        hp = QHBoxLayout(grp_p)
        hp.setContentsMargins(6, 4, 6, 4)
        self.cb_piano = QCheckBox("Show")
        self.cb_piano_overlap = QCheckBox("Overlap Staff")
        self.cb_piano_col = QCheckBox("Colored")
        self.cb_piano_opacity = QSlider(Qt.Orientation.Horizontal)
        self.cb_piano_opacity.setRange(0, 100)
        self.cb_piano_opacity.setValue(100)
        self.cb_piano_opacity.setFixedWidth(100)
        self.cb_piano_opacity.setToolTip("Piano opacity")
        self.cb_piano.setChecked(False)
        self.cb_piano.toggled.connect(self._redraw)
        self.cb_piano_overlap.toggled.connect(self._redraw)
        self.cb_piano_col.toggled.connect(self._redraw)
        self.cb_piano_opacity.valueChanged.connect(self._redraw)
        hp.addWidget(self.cb_piano)
        hp.addWidget(self.cb_piano_overlap)
        hp.addWidget(self.cb_piano_col)
        hp.addWidget(self.cb_piano_opacity)

        toolbar.addWidget(grp_n)
        toolbar.addWidget(grp_l)
        toolbar.addWidget(grp_q)
        toolbar.addWidget(grp_p)
        toolbar.addWidget(grp_e)
        toolbar.addStretch()
        vlay.addLayout(toolbar)

        # ── Graphics view ──
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene)
        self.view.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.view.setBackgroundBrush(QBrush(QColor(255, 255, 255)))
        self.view.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
        self.view.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        vlay.addWidget(self.view)

    # ── helpers ───────────────────────────────────────────────────────────────
    def _note_name(self, idx: int) -> str:
        return SOLFEGE[idx] if self.use_solfege else LETTERS[idx]

    def _update_export_size(self):
        """Set W/H spinboxes to the pixel size of current scene content at the chosen DPI."""
        r = self.scene.itemsBoundingRect()
        if not r.isValid():
            return
        scale = self.sb_dpi.value() / SCREEN_DPI
        self.sb_w.setValue(max(400,  int(r.width()  * scale)))
        self.sb_h.setValue(max(200,  int(r.height() * scale)))

    def _reshuffle(self):
        """Re-randomise quiz order and redraw."""
        self._draw(force_reshuffle=True)

    def _redraw(self):
        self.use_solfege = self.rb_sol.isChecked()
        self.label_near  = self.rb_lbl_near.isChecked()
        self.quiz_mode   = self.cb_quiz.isChecked()
        self._draw()

    # ── main draw ─────────────────────────────────────────────────────────────
    def _draw(self, force_reshuffle: bool = False):
        self.use_solfege = self.rb_sol.isChecked()
        self.label_near  = self.rb_lbl_near.isChecked()
        self.quiz_mode   = self.cb_quiz.isChecked()
        self.scene.clear()

        N           = self.sb_ledger.value() if self.cb_ledger.isChecked() else 0
        show_piano  = self.cb_piano.isChecked()
        MARGIN_LEFT = 110
        NOTE_STEP   = 50
        CLEF_W      = 52

        treble_notes = _build_notes(*TREBLE_ANCHOR, N, N)
        bass_notes   = _build_notes(*BASS_ANCHOR,   N, N)

        # Reverse so notes go low→high left→right, matching piano key direction
        treble_notes = list(reversed(treble_notes))
        bass_notes   = list(reversed(bass_notes))

        if self.quiz_mode:
            treble_notes = random.sample(treble_notes, len(treble_notes))
            bass_notes   = random.sample(bass_notes,   len(bass_notes))

        staff_w = (MARGIN_LEFT + CLEF_W
                   + max(len(treble_notes), len(bass_notes)) * NOTE_STEP + 40)

        # ── Treble vertical layout ──
        TREBLE_TOP       = 80 + N * LS
        treble_max_step  = 8 + 2 * N
        treble_bottom_y  = TREBLE_TOP + treble_max_step * (LS / 2)
        treble_lry       = max(TREBLE_TOP + 4*LS + 12, treble_bottom_y + NR + 8)
        treble_piano_top = treble_lry + PIANO_GAP

        overlap = show_piano and self.cb_piano_overlap.isChecked()

        # ── BASS_TOP: in overlap mode keys sit behind notes so no vertical
        #    space is needed below the treble staff for the piano ──
        if show_piano and not overlap:
            below_treble = treble_piano_top + PIANO_WKH + 24
        else:
            below_treble = treble_lry + 18
        BASS_TOP = below_treble + 60 + N * LS

        bass_max_step = 8 + 2 * N
        bass_bottom_y = BASS_TOP + bass_max_step * (LS / 2)
        bass_lry      = max(BASS_TOP + 4*LS + 12, bass_bottom_y + NR + 8)
        bass_piano_top = bass_lry + PIANO_GAP

        # ── In overlap mode the key bounds are computed from actual note positions ──
        # (will be filled in after _draw_notes returns)
        treble_key_top = treble_key_bot = None
        bass_key_top   = bass_key_bot   = None

        pen_staff = QPen(QColor(20, 20, 20), 1.6)

        # Draw staves
        for top_y, notes, label, clef in [
            (TREBLE_TOP, treble_notes, "Treble Clef", "treble"),
            (BASS_TOP,   bass_notes,   "Bass Clef",   "bass"),
        ]:
            self._draw_staff(top_y, MARGIN_LEFT, staff_w, pen_staff, label, clef)

        # Draw notes (returns positions for piano)
        treble_pos = self._draw_notes(TREBLE_TOP, MARGIN_LEFT + CLEF_W, NOTE_STEP, treble_notes)
        bass_pos   = self._draw_notes(BASS_TOP,   MARGIN_LEFT + CLEF_W, NOTE_STEP, bass_notes)

        if overlap:
            treble_key_top = min(yn - NR for (_, yn, _, _) in treble_pos) - 2
            treble_key_bot = max(yn + NR for (_, yn, _, _) in treble_pos) + 2
            bass_key_top   = min(yn - NR for (_, yn, _, _) in bass_pos) - 2
            bass_key_bot   = max(yn + NR for (_, yn, _, _) in bass_pos) + 2

        # Draw pianos aligned to note positions
        if show_piano:
            self._draw_piano(treble_pos, treble_piano_top, NOTE_STEP,
                             key_top=treble_key_top, key_bottom=treble_key_bot)
            self._draw_piano(bass_pos,   bass_piano_top,   NOTE_STEP,
                             key_top=bass_key_top,   key_bottom=bass_key_bot)

        rect = self.scene.itemsBoundingRect().adjusted(-28, -28, 28, 28)
        self.scene.setSceneRect(rect)
        self.view.fitInView(rect, Qt.AspectRatioMode.KeepAspectRatio)

    # ── staff ─────────────────────────────────────────────────────────────────
    def _draw_staff(self, top_y, x_start, x_end, pen_staff, label_text, clef_type):
        sc = self.scene

        lbl = sc.addText(label_text, QFont("Arial", 8, QFont.Weight.Bold))
        lbl.setDefaultTextColor(QColor(60, 60, 60))
        lbl.setPos(x_start, top_y - 26)

        for i in range(5):
            y = top_y + i * LS
            sc.addLine(x_start, y, x_end, y, pen_staff)

        pen_bar   = QPen(QColor(20, 20, 20), 1.8)
        pen_thick = QPen(QColor(20, 20, 20), 3.5)
        sc.addLine(x_start,   top_y, x_start,   top_y + 4*LS, pen_bar)
        sc.addLine(x_end - 4, top_y, x_end - 4, top_y + 4*LS, pen_bar)
        sc.addLine(x_end,     top_y, x_end,      top_y + 4*LS, pen_thick)

        if clef_type == "treble":
            self._draw_treble_clef(x_start + 6, top_y)
        else:
            self._draw_bass_clef(x_start + 4, top_y)

    # ── treble clef ───────────────────────────────────────────────────────────
    def _draw_treble_clef(self, x0, top_y):
        sc  = self.scene
        s   = LS / 16.0
        bot = top_y + 4 * LS
        pen2 = QPen(QColor(20, 20, 20), 2.0)

        # Vertical stroke
        sc.addLine(x0 + 8*s, top_y - 14*s, x0 + 8*s, bot + 12*s, pen2)

        # G-circle wrapping the 2nd line from bottom (top_y + 3*LS)
        g_y = top_y + 3 * LS
        r   = LS * 1.05
        sc.addEllipse(x0 + 8*s - r, g_y - r*0.9, r*2, r*1.65,
                      pen2, QBrush(Qt.BrushStyle.NoBrush))

        # Bottom curl
        curl = QPainterPath()
        cx, cy = x0 + 8*s, bot + 5*s
        curl.moveTo(cx, cy - 6*s)
        curl.cubicTo(cx-14*s, cy-2*s,  cx-14*s, cy+14*s,  cx, cy+14*s)
        curl.cubicTo(cx+10*s, cy+14*s, cx+10*s, cy+2*s,   cx, cy)
        sc.addPath(curl, pen2, QBrush(Qt.BrushStyle.NoBrush))

    # ── bass clef ─────────────────────────────────────────────────────────────
    def _draw_bass_clef(self, x0, top_y):
        sc   = self.scene
        s    = LS / 16.0
        pen2 = QPen(QColor(20, 20, 20), 2.0)

        cx = x0 + 20*s
        cy = top_y + LS * 1.0
        body = QPainterPath()
        body.moveTo(cx + 14*s, cy)
        body.cubicTo(cx+14*s, cy-10*s, cx-10*s, cy-14*s, cx-12*s, cy+LS)
        body.cubicTo(cx-10*s, cy+LS*2+14*s, cx+14*s, cy+LS*2+10*s, cx+14*s, cy+LS*2)
        sc.addPath(body, pen2, QBrush(Qt.BrushStyle.NoBrush))

        dot_r = LS * 0.22
        for dy in [LS * 0.55, LS * 1.45]:
            sc.addEllipse(cx+16*s - dot_r, top_y+dy - dot_r,
                          dot_r*2, dot_r*2,
                          QPen(Qt.PenStyle.NoPen), QBrush(QColor(20, 20, 20)))

    # ── notes ─────────────────────────────────────────────────────────────────
    def _draw_notes(self, top_y, x_start, note_step, notes):
        """Draw all notes for one staff.
        Returns list of (x, y_center, note_idx, octave_int) for piano connectors.
        """
        sc         = self.scene
        quiz       = self.quiz_mode
        label_near = self.label_near

        QUIZ_COLOR = QColor(30, 30, 30)
        QUIZ_DARK  = QColor(10, 10, 10)
        QUIZ_FILL  = QColor(50, 50, 50)

        max_y       = max(top_y + s * (LS / 2) for (_, s, _, _) in notes)
        label_row_y = max(top_y + 4*LS + 12, max_y + NR + 8)
        led_pen     = QPen(QColor(20, 20, 20), 1.5)
        positions   = []   # (x, y_center, note_idx, octave_int)

        for i, (note_idx, step, octave, ledger_steps) in enumerate(notes):
            x = x_start + i * note_step + note_step / 2
            y = top_y + step * (LS / 2)
            positions.append((x, y, note_idx, int(octave)))

            if quiz:
                color   = QUIZ_COLOR
                dark    = QUIZ_DARK
                brush_n = QBrush(QUIZ_FILL)
            else:
                color   = NOTE_COLORS[note_idx]
                dark    = color.darker(160)
                brush_n = QBrush(color)
            pen_n    = QPen(dark, 1.5)
            stem_pen = QPen(dark, 1.6)

            for ls_step in ledger_steps:
                ly = top_y + ls_step * (LS / 2)
                sc.addLine(x - NW*1.6, ly, x + NW*1.6, ly, led_pen)

            sc.addEllipse(x - NW, y - NR, NW*2, NR*2, pen_n, brush_n)

            stem_up = step >= 4
            # if stem_up:
            #     sc.addLine(x + NW - 1, y, x + NW - 1, y - STEM, stem_pen)
            # else:
            #     sc.addLine(x - NW + 1, y, x - NW + 1, y + STEM, stem_pen)

            if not quiz:
                name = self._note_name(note_idx)
                font = QFont("Arial", 8, QFont.Weight.Bold)
                if label_near:
                    lbl = sc.addText(name, font)
                    lbl.setDefaultTextColor(dark)
                    lbl.setPos(x - lbl.boundingRect().width() / 2, y + NR + 1)
                else:
                    lbl = sc.addText(name, font)
                    lbl.setDefaultTextColor(dark)
                    lbl.setPos(x - lbl.boundingRect().width() / 2, label_row_y)

                badge = sc.addText(octave, QFont("Arial", 6))
                badge.setDefaultTextColor(QColor(110, 110, 110))
                badge.setPos(x + NW, y - NR - 11)

        return positions

    # ── piano keyboard ─────────────────────────────────────────────────────────
    def _draw_piano(self, positions, y_top, note_step, key_top=None, key_bottom=None):
        """
        Draw a piano keyboard aligned with note x positions.

        key_top / key_bottom : if given (overlap mode), keys span exactly from
                               key_top to key_bottom, covering only the note area.
        """
        sc      = self.scene
        quiz    = self.quiz_mode
        overlap = key_top is not None
        WKW     = note_step
        BKW     = int(WKW * 0.58)
        opacity = self.cb_piano_opacity.value() / 100

        # In overlap mode keys span exactly the note bounding box
        draw_top = key_top  if overlap else y_top
        draw_bot = key_bottom if (overlap and key_bottom is not None) else (y_top + PIANO_WKH)
        WKH      = int(draw_bot - draw_top)
        BKH      = int(WKH * 0.63)

        if quiz:
            return

        wk_pen  = QPen(QColor(70, 70, 70), 1.0)
        bk_pen  = QPen(QColor(10, 10, 10), 0.8)
        bk_fill = QBrush(QColor(28, 28, 28))
        y_bottom = draw_top + WKH   # == y_top + PIANO_WKH

        # white keys
        for (xn, yn, nidx, oct_) in positions:
            kx     = xn - WKW / 2
            fill_c = NOTE_COLORS[nidx].lighter(160) if self.cb_piano_col.isChecked() \
                     else QColor(245, 245, 245)
            rect = sc.addRect(kx, draw_top, WKW, WKH, wk_pen, QBrush(fill_c))
            rect.setZValue(-1)
            rect.setOpacity(opacity)

            if nidx == 0:   # C tick below keyboard
                tick = QPen(QColor(140, 140, 140), 0.8)
                sc.addLine(kx, y_bottom + 1, kx, y_bottom + 6, tick)

        # black keys
        sorted_pos = sorted(positions, key=lambda p: p[3] * 7 + p[2])
        for i in range(len(sorted_pos) - 1):
            nidx_lower = sorted_pos[i][2]
            if nidx_lower in {2, 6}:
                continue
            x_a = sorted_pos[i][0]
            x_b = sorted_pos[i + 1][0]
            bkx = (x_a + x_b) / 2 - BKW / 2
            rect = sc.addRect(bkx, draw_top, BKW, BKH, bk_pen, bk_fill)
            rect.setZValue(-0.5)
            rect.setOpacity(opacity)

    # ── export ────────────────────────────────────────────────────────────────
    @staticmethod
    def _versioned_path(folder: Path, stem: str = "music_notes") -> Path:
        """Return folder/stem.png; if it exists, try stem_v2.png, stem_v3.png …"""
        candidate = folder / f"{stem}.png"
        if not candidate.exists():
            return candidate
        v = 2
        while True:
            candidate = folder / f"{stem}_v{v}.png"
            if not candidate.exists():
                return candidate
            v += 1

    def _export_png(self):
        # ── auto-update size from scene content ──
        self._update_export_size()
        w = self.sb_w.value()
        h = self.sb_h.value()

        # ── default save folder: ~/Pictures/notes ──
        out_dir = Path.home() / "Pictures" / "notes"
        out_dir.mkdir(parents=True, exist_ok=True)
        default_path = str(self._versioned_path(out_dir))

        path, _ = QFileDialog.getSaveFileName(
            self, "Сохранить / Save as PNG",
            default_path, "PNG Files (*.png)"
        )
        if not path:
            return

        # ── render scene content (crop to bounding rect) at EXPORT_DPI ──
        src_rect = self.scene.itemsBoundingRect()
        pixmap = QPixmap(w, h)
        pixmap.fill(QColor(255, 255, 255))
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        self.scene.render(painter,
                          target=pixmap.rect(),
                          source=src_rect)
        painter.end()

        # ── embed DPI metadata ──
        from PySide6.QtCore import QByteArray, QBuffer, QIODevice
        buf    = QByteArray()
        device = QBuffer(buf)
        device.open(QIODevice.OpenModeFlag.WriteOnly)
        pixmap.save(device, "PNG")
        device.close()

        # Write raw bytes via pathlib (preserves QPixmap PNG stream as-is)
        dest = Path(path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(buf.data())

        # Use Pillow to stamp DPI if available, otherwise skip silently
        try:
            from PIL import Image
            import io
            dpi_val = self.sb_dpi.value()
            img = Image.open(io.BytesIO(buf.data()))
            img.save(str(dest), dpi=(dpi_val, dpi_val))
        except ImportError:
            pass   # Pillow not installed – file already written above

        self.setWindowTitle(f"✔  {dest.name}  →  {dest.parent}")

    # ── fit on resize ─────────────────────────────────────────────────────────
    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.scene.sceneRect().isValid():
            self.view.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)


# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    w = MusicNotesApp()
    w.show()
    sys.exit(app.exec())
