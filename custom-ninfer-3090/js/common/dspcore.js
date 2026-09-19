/*
 * DIGITAL SPACEPORT ARCADE — shared arcade framework (dspcore)
 * Vanilla JS. No dependencies. Powers all three games.
 *
 * Modules (all on window.DSP):
 *   pixel   – low-res canvas setup, bitmap 5x7 font, rect/sprite/text helpers
 *   audio   – WebAudio chiptune step-sequencer + SFX synth (zero assets)
 *   input   – keyboard + on-screen touch controls
 *   scores  – persistent per-game high-score table (localStorage)
 *   state   – BOOT/ATTRACT/PLAY/PAUSE/GAMEOVER state machine
 *   fx      – starfield, particles, screen shake, flash
 *   loop    – fixed-timestep (60Hz) update + render
 *   startGame(spec) – entry point each game calls
 */
(function () {
'use strict';

const DSP = (window.DSP = window.DSP || {});
const W = 320, H = 180;                 // logical low-res resolution (16:9)
const STEP = 1 / 60;                     // fixed update timestep

/* =========================================================================
 * BITMAP FONT — authentic 5x7 pixel glyphs, pre-rendered to mini canvases
 * ========================================================================= */
const FONT = {
  ' ': ['.....','.....','.....','.....','.....','.....','.....'],
  '0': ['.XXX.','X...X','X..XX','X.X.X','XX..X','X...X','.XXX.'],
  '1': ['..X..','.XX..','..X..','..X..','..X..','..X..','.XXX.'],
  '2': ['.XXX.','X...X','....X','..XX.','.X...','X....','XXXXX'],
  '3': ['XXXXX','...X.','..X..','...X.','....X','X...X','.XXX.'],
  '4': ['...X.','..XX.','.X.X.','X..X.','XXXXX','...X.','...X.'],
  '5': ['XXXXX','X....','XXXX.','....X','....X','X...X','.XXX.'],
  '6': ['.XXX.','X....','X....','XXXX.','X...X','X...X','.XXX.'],
  '7': ['XXXXX','....X','...X.','..X..','..X..','..X..','..X..'],
  '8': ['.XXX.','X...X','X...X','.XXX.','X...X','X...X','.XXX.'],
  '9': ['.XXX.','X...X','X...X','.XXXX','....X','....X','.XXX.'],
  'A': ['.XXX.','X...X','X...X','XXXXX','X...X','X...X','X...X'],
  'B': ['XXXX.','X...X','X...X','XXXX.','X...X','X...X','XXXX.'],
  'C': ['.XXXX','X....','X....','X....','X....','X....','.XXXX'],
  'D': ['XXXX.','X...X','X...X','X...X','X...X','X...X','XXXX.'],
  'E': ['XXXXX','X....','X....','XXXX.','X....','X....','XXXXX'],
  'F': ['XXXXX','X....','X....','XXXX.','X....','X....','X....'],
  'G': ['.XXXX','X....','X....','X.XXX','X...X','X...X','.XXXX'],
  'H': ['X...X','X...X','X...X','XXXXX','X...X','X...X','X...X'],
  'I': ['XXXXX','..X..','..X..','..X..','..X..','..X..','XXXXX'],
  'J': ['XXXX.','...X.','...X.','...X.','...X.','X..X.','.XX..'],
  'K': ['X...X','X..X.','X.X..','XX...','X.X..','X..X.','X...X'],
  'L': ['X....','X....','X....','X....','X....','X....','XXXXX'],
  'M': ['X...X','XX.XX','X.X.X','X.X.X','X...X','X...X','X...X'],
  'N': ['X...X','XX..X','X.X.X','X..XX','X...X','X...X','X...X'],
  'O': ['.XXX.','X...X','X...X','X...X','X...X','X...X','.XXX.'],
  'P': ['XXXX.','X...X','X...X','XXXX.','X....','X....','X....'],
  'Q': ['.XXX.','X...X','X...X','X.X.X','X..X.','X...X','.XX.X'],
  'R': ['XXXX.','X...X','X...X','XXXX.','X.X..','X..X.','X...X'],
  'S': ['.XXXX','X....','X....','.XXX.','....X','....X','XXXX.'],
  'T': ['XXXXX','..X..','..X..','..X..','..X..','..X..','..X..'],
  'U': ['X...X','X...X','X...X','X...X','X...X','X...X','.XXX.'],
  'V': ['X...X','X...X','X...X','X...X','X...X','.X.X.','..X..'],
  'W': ['X...X','X...X','X...X','X.X.X','X.X.X','XX.XX','X...X'],
  'X': ['X...X','X...X','.X.X.','..X..','.X.X.','X...X','X...X'],
  'Y': ['X...X','X...X','.X.X.','..X..','..X..','..X..','..X..'],
  'Z': ['XXXXX','...X.','..X..','.X...','X....','X....','XXXXX'],
  '.': ['.....','.....','.....','.....','.....','..X..','..X..'],
  ',': ['.....','.....','.....','.....','.....','..X..','.X.'],
  '!': ['..X..','..X..','..X..','..X..','..X..','.....','..X..'],
  '?': ['.XXX.','X...X','....X','..X..','..X..','.....','..X..'],
  '-': ['.....','.....','.....','.XXX.','.....','.....','.....'],
  '/': ['....X','....X','...X.','..X..','.X...','X....','X....'],
  '+': ['.....','..X..','..X..','XXXXX','..X..','..X..','.....'],
  '>': ['.X...','..X..','...X.','....X','...X.','..X..','.X...'],
  '<': ['...X.','..X..','.X...','X....','.X...','..X..','...X.'],
  '(': ['...X.','..X..','.X...','.X...','.X...','..X..','...X.'],
  ')': ['.X...','..X..','...X.','...X.','...X.','..X..','.X...'],
  ':': ['.....','..X..','.....','.....','..X..','.....','.....'],
  "'": ['..X..','..X..','.....','.....','.....','.....','.....'],
  '"': ['.X.X.','X...X','.....','.....','.....','.....','.....'],
  '*': ['.....','X.X.X','.XXX.','..X..','.XXX.','X.X.X','.....'],
  '©': ['.XXX.','X...X','X.X.X','X.X.X','X.X.X','X...X','.XXX.'],
  '▲': ['..X..','.XXX.','XXXXX','XXXXX','XXXXX','.....','.....'],
  '▼': ['.....','.....','XXXXX','XXXXX','.XXX.','..X..','..X..'],
  '●': ['.....','.XX..','X..X','X..X','X..X','.XX..','.....'],
  '♥': ['.X.X.','XXXXX','XXXXX','.XXX.','..X..','.....','.....'],
  '■': ['.....','XXXXX','XXXXX','XXXXX','XXXXX','.....','.....'],
};

function buildGlyphs() {
  const g = {};
  for (const ch in FONT) {
    const c = document.createElement('canvas');
    c.width = 5; c.height = 7;
    const cx = c.getContext('2d');
    const rows = FONT[ch];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (rows[r][col] === 'X') { cx.fillRect(col, r, 1, 1); }
      }
    }
    g[ch] = c;
  }
  g['?'] = g['?'] || g['A']; // fallback
  return g;
}
let GLYPHS = null;

/* =========================================================================
 * PIXEL — canvas setup + drawing helpers (all in 320x180 logical space)
 * ========================================================================= */
DSP.pixel = {
  canvas: null, ctx: null,
  init(displayCanvas) {
    this.canvas = displayCanvas;
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = displayCanvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    if (!GLYPHS) GLYPHS = buildGlyphs();
    return this.ctx;
  },
  clear(color) { this.ctx.fillStyle = color || '#05010f'; this.ctx.fillRect(0, 0, W, H); },
  rect(x, y, w, h, color) { this.ctx.fillStyle = color; this.ctx.fillRect(x | 0, y | 0, w, h); },
  rectOutline(x, y, w, h, color, thick) {
    const t = thick || 1;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x | 0, y | 0, w, t);
    this.ctx.fillRect(x | 0, (y + h - t) | 0, w, t);
    this.ctx.fillRect(x | 0, y | 0, t, h);
    this.ctx.fillRect((x + w - t) | 0, y | 0, t, h);
  },
  text(str, x, y, color, scale) {
    str = String(str).toUpperCase();
    const s = scale || 1;
    this.ctx.fillStyle = color || '#ffffff';
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHS[str[i]] || GLYPHS['?'];
      this.ctx.drawImage(g, x + i * 6 * s, y, 5 * s, 7 * s);
    }
  },
  textC(str, cx, y, color, scale) {
    const s = scale || 1;
    const w = str.length * 6 * s - s;
    this.text(str, Math.round(cx - w / 2), y, color, s);
  },
  // draw a sprite: `sprite` is an array of strings, `palette` maps char->color
  drawSprite(sprite, palette, x, y, scale) {
    const s = scale || 1;
    for (let r = 0; r < sprite.length; r++) {
      const row = sprite[r];
      for (let c = 0; c < row.length; c++) {
        const col = palette[row[c]];
        if (col) { this.ctx.fillStyle = col; this.ctx.fillRect(x + c * s, y + r * s, s, s); }
      }
    }
  },
};

/* =========================================================================
 * AUDIO — WebAudio chiptune step-sequencer + SFX. Zero audio assets.
 * ========================================================================= */
DSP.audio = {
  ctx: null, master: null, muted: false,
  seq: null, _timer: null,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
    try { localStorage.setItem('dsp_muted', m ? '1' : '0'); } catch (e) {}
  },
  _note(type, freq, t, dur, vol, slideTo) {
    const c = this.ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  _noise(t, dur, vol, low) {
    const c = this.ensure();
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = vol;
    let node = src;
    if (low) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800; node.connect(f); node = f; }
    node.connect(g); g.connect(this.master);
    src.start(t);
  },
  sfx(name) {
    try { this.ensure(); } catch (e) { return; }
    const t = this.ctx.currentTime;
    switch (name) {
      case 'coin':
        this._note('square', 988, t, 0.07, 0.3);
        this._note('square', 1319, t + 0.08, 0.22, 0.3);
        break;
      case 'shoot':
        this._note('square', 1046, t, 0.04, 0.22);
        this._note('square', 660, t + 0.03, 0.05, 0.16);
        break;
      case 'boom':
        this._noise(t, 0.35, 0.5, true);
        this._note('sawtooth', 150, t, 0.35, 0.35, 50);
        break;
      case 'crash':
        this._noise(t, 0.9, 0.6, true);
        this._note('sawtooth', 220, t, 0.7, 0.4, 40);
        break;
      case 'land':
        this._note('triangle', 523, t, 0.08, 0.3);
        this._note('triangle', 659, t + 0.09, 0.08, 0.3);
        this._note('triangle', 784, t + 0.18, 0.16, 0.3);
        break;
      case 'powerup':
        [523, 659, 784, 1046].forEach((f, i) => this._note('square', f, t + i * 0.05, 0.09, 0.26));
        break;
      case 'extra':
        [784, 988, 1175, 1568, 1175, 1568].forEach((f, i) => this._note('square', f, t + i * 0.09, 0.1, 0.3));
        break;
      case 'start':
        [392, 523, 659, 784].forEach((f, i) => this._note('square', f, t + i * 0.06, 0.08, 0.3));
        break;
      case 'ui':
        this._note('square', 880, t, 0.05, 0.2);
        break;
      case 'life':
        [659, 880, 1046, 1319].forEach((f, i) => this._note('triangle', f, t + i * 0.08, 0.1, 0.32));
        break;
      case 'tier':
        [440, 554, 659, 880, 1108].forEach((f, i) => this._note('sawtooth', f, t + i * 0.05, 0.12, 0.28));
        break;
      case 'tick':
        this._note('square', 1200, t, 0.03, 0.12);
        break;
      case 'hurt':
        this._note('sawtooth', 300, t, 0.18, 0.3, 80);
        this._noise(t, 0.15, 0.3, true);
        break;
      case 'ufo':
        this._note('square', 660, t, 0.12, 0.2, 990);
        this._note('square', 660, t + 0.14, 0.12, 0.2, 990);
        break;
    }
  },

  /* --- chiptune step sequencer (look-ahead scheduler) --- */
  startTune(spec) {
    if (!spec) return;
    this.stopTune();
    try { this.ensure(); } catch (e) { return; }
    this.seq = {
      bpm: spec.bpm || 110,
      spb: spec.spb || 4,           // steps per beat
      total: spec.total || (spec.steps || 16),
      tracks: spec.tracks || [],
      step: 0,
      nextTime: this.ctx.currentTime + 0.06,
    };
    const s = this.seq;
    this._timer = setInterval(() => this._sched(), 25);
    this._sched();
  },
  stopTune() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.seq = null;
  },
  setBpm(bpm) { if (this.seq && bpm) this.seq.bpm = bpm; },
  pauseTune(p) {
    if (!this.ctx) return;
    if (p) { this.ctx.suspend(); } else { this.ctx.resume(); }
  },
  _sched() {
    const s = this.seq; if (!s) return;
    const stepDur = 60 / s.bpm / s.spb;
    let guard = 0;
    while (s.nextTime < this.ctx.currentTime + 0.14 && guard++ < 64) {
      this._playStep(s.step, s.nextTime, stepDur);
      s.nextTime += stepDur;
      s.step = (s.step + 1) % s.total;
    }
  },
  _playStep(step, t, stepDur) {
    const s = this.seq;
    for (const tr of s.tracks) {
      const v = tr.pattern[step % tr.pattern.length];
      if (v == null) continue;
      if (tr.wave === 'noise') { this._noise(t, stepDur * (tr.len || 0.9), tr.gain != null ? tr.gain : 0.14, true); continue; }
      const freq = 440 * Math.pow(2, (v - 69) / 12);
      const dur = stepDur * (tr.len || 0.9);
      this._note(tr.wave || 'square', freq, t, dur, tr.gain != null ? tr.gain : 0.2);
    }
  },
};

/* restore mute preference */
try { DSP.audio.muted = localStorage.getItem('dsp_muted') === '1'; } catch (e) {}

/* =========================================================================
 * INPUT — keyboard + on-screen touch buttons
 * ========================================================================= */
DSP.input = {
  down: {}, just: {}, buttons: {}, touch: {},
  keyMap: {
    ArrowLeft: 'left', a: 'left',
    ArrowRight: 'right', d: 'right',
    ArrowDown: 'down', s: 'down',
    ArrowUp: 'up', w: 'up',
    ' ': 'fire', 'Spacebar': 'fire',
    enter: 'start', Enter: 'start',
    p: 'pause', P: 'pause', Escape: 'pause',
    m: 'mute', M: 'mute',
    z: 'alt', Z: 'alt',
    r: 'restart', R: 'restart',
  },
  init() {
    const self = this;
    window.addEventListener('keydown', (e) => {
      const k = self.keyMap[e.key] || e.key;
      if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) e.preventDefault();
      if (!self.down[k]) self.just[k] = true;
      self.down[k] = true;
    });
    window.addEventListener('keyup', (e) => {
      const k = self.keyMap[e.key] || e.key;
      self.down[k] = false;
    });
    window.addEventListener('blur', () => { self.down = {}; self.touch = {}; });
    return this;
  },
  pressed(k) { return !!(this.down[k] || this.touch[k]); },
  justPressed(k) { return !!(this.just[k] || (this.touchJust && this.touchJust[k])); },
  // on-screen button wiring: el -> action
  bindButton(el, action) {
    const self = this;
    const on = (e) => { e.preventDefault(); if (!this.touch[action]) this.touchJust = this.touchJust || {}; this.touchJust[action] = true; this.touch[action] = true; };
    const off = (e) => { e.preventDefault(); this.touch[action] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
    el.style.touchAction = 'none';
  },
  endFrame() { this.just = {}; this.touchJust = {}; },
};

/* =========================================================================
 * SCORES — persistent per-game high-score table (top 8, 3-char names)
 * ========================================================================= */
DSP.scores = function (gameId) {
  const key = 'dsp_hs_' + gameId;
  function load() {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const a = JSON.parse(raw);
        if (Array.isArray(a)) return a.slice(0, 8);
      }
    } catch (e) {}
    return [];
  }
  function save(list) {
    try { localStorage.setItem(key, JSON.stringify(list.slice(0, 8))); } catch (e) {}
  }
  let list = load();
  return {
    get: () => list.slice(0, 8),
    submit(score) {
      // returns rank (0-based) if this score made the table, else -1
      score = Math.floor(score);
      if (score <= 0) return -1;
      const copy = list.slice();
      let rank = -1;
      for (let i = 0; i < copy.length; i++) {
        if (score > copy[i].score) { copy.splice(i, 0, { name: '??', score: score }); rank = i; break; }
      }
      if (rank === -1 && copy.length < 8) { copy.push({ name: '??', score: score }); rank = copy.length - 1; }
      if (rank >= 8) rank = -1;
      if (rank >= 0) { list = copy.slice(0, 8); save(list); }
      return rank;
    },
    setName(rank, name) {
      if (rank >= 0 && rank < list.length) { list[rank].name = (name || '???').toUpperCase().slice(0, 3); save(list); }
    },
    isTop: (rank) => rank === 0,
    reset() { list = []; save(list); },
  };
};

/* =========================================================================
 * FX — starfield, particles, screen shake, flash
 * ========================================================================= */
DSP.fx = {
  stars: [], parts: [], shakeT: 0, shakeMag: 0, flash: 0, flashColor: '#ffffff',
  initStars(n) {
    this.stars = [];
    for (let i = 0; i < (n || 70); i++) {
      this.stars.push({ x: (Math.random() * W) | 0, y: (Math.random() * (H - 30)) | 0, s: Math.random() < 0.2 ? 2 : 1, sp: 0.2 + Math.random() * 0.8 });
    }
  },
  drawStars(ctx, scroll) {
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin((performance.now() / 300 + s.x));
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.5 * tw) + ')';
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
  },
  burst(x, y, color, n, spd) {
    for (let i = 0; i < (n || 12); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * (spd || 60);
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, color: color, size: Math.random() < 0.3 ? 2 : 1 });
    }
  },
  updateParts(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 40 * dt;
      p.life -= dt;
      if (p.life <= 0) this.parts.splice(i, 1);
    }
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flash > 0) this.flash -= dt * 3;
  },
  drawParts(ctx) {
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  },
  shake(mag, t) { this.shakeMag = mag; this.shakeT = t; },
  flashScreen(color, amt) { this.flashColor = color; this.flash = amt || 0.4; },
  ctxOffset(ctx) {
    if (this.shakeT > 0) {
      const m = this.shakeMag * (this.shakeT > 0 ? 1 : 0);
      const ox = (Math.random() * 2 - 1) * m, oy = (Math.random() * 2 - 1) * m;
      ctx.save(); ctx.translate(ox | 0, oy | 0); return true;
    }
    return false;
  },
  drawFlash(ctx) {
    if (this.flash > 0) {
      ctx.globalAlpha = Math.max(0, this.flash) * 0.6;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  },
};

/* =========================================================================
 * STATE MACHINE + GAME LOOP
 * States: BOOT, ATTRACT, PLAY, PAUSE, GAMEOVER
 * ========================================================================= */
DSP.startGame = function (spec) {
  const S = {
    spec: spec,
    st: 'BOOT',
    bootLine: 0,
    bootT: 0,
    loadT: 0,
    attractT: 0,
    demo: null,
    state: null,
    over: null,
    rank: -1,
    nameIdx: 0, nameBuf: '',
    time: 0,
    coinBlink: 0,
  };
  const ctx = DSP.pixel.init(document.getElementById('game'));
  DSP.input.init();
  DSP.fx.initStars(spec.stars || 70);
  const scores = DSP.scores(spec.id);
  const A = DSP.audio;

  // build on-screen touch buttons if requested
  const tb = document.getElementById('touch');
  if (tb && spec.buttons) {
    tb.innerHTML = '';
    for (const b of spec.buttons) {
      const el = document.createElement('div');
      el.className = 'tbtn ' + (b.cls || '');
      el.textContent = b.label || '';
      DSP.input.bindButton(el, b.action);
      if (b.style) el.style.cssText += b.style;
      tb.appendChild(el);
    }
  }

  function newGame() {
    S.state = spec.newGame();
    S.over = null;
    S.time = 0;
    S.rank = -1;
    S.nameBuf = '';
    S.nameIdx = 0;
    A.stopTune();
    A.ensure();
    A.startTune(spec.music);
  }

  function toAttract() {
    S.st = 'ATTRACT';
    S.attractT = 0;
    A.stopTune();
    // set up an attract-mode demo instance if the game provides one
    if (spec.newAttract) { try { S.demo = spec.newAttract(); } catch (e) { S.demo = null; } }
  }

  function startGame() {
    A.ensure();
    A.sfx('coin');
    newGame();
    S.st = 'PLAY';
  }

  function doPause() {
    if (S.st === 'PLAY') { S.st = 'PAUSE'; A.pauseTune(true); A.sfx('ui'); }
    else if (S.st === 'PAUSE') { S.st = 'PLAY'; A.pauseTune(false); A.sfx('ui'); }
  }

  function endGame(reason) {
    if (S.st !== 'PLAY') return;
    S.over = { score: S.state.score | 0, reason: reason || 'GAME OVER' };
    S.rank = scores.submit(S.over.score);
    A.stopTune();
    A.sfx('crash');
    S.st = 'GAMEOVER';
    if (S.rank >= 0 && S.rank < 5) { S.nameBuf = ''; S.nameIdx = 0; S.nameEnter = true; }
    else S.nameEnter = false;
  }

  function submitName() {
    if (S.rank >= 0) scores.setName(S.rank, S.nameBuf || 'AAA');
    A.sfx('ui');
    toAttract();
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    const inp = DSP.input;
    S.coinBlink += dt;
    DSP.fx.updateParts(dt);

    if (inp.justPressed('mute')) { A.setMuted(!A.muted); A.sfx('ui'); }

    switch (S.st) {
      case 'BOOT': {
        S.bootT += dt;
        const lines = spec.bootLines || [];
        S.bootLine = Math.min(lines.length, Math.floor(S.bootT / (spec.bootLineTime || 0.28)) + 1);
        if (S.bootLine >= lines.length) S.loadT += dt;
        const done = S.bootLine >= lines.length && S.loadT >= (spec.loadTime || 0.9);
        if (done || inp.justPressed('start') || inp.justPressed('fire')) toAttract();
        break;
      }
      case 'ATTRACT': {
        S.attractT += dt;
        if (S.demo && spec.updateAttract) { try { spec.updateAttract(S.demo, dt, inp); } catch (e) {} }
        if (inp.justPressed('start') || inp.justPressed('fire') || inp.justPressed('restart')) startGame();
        break;
      }
      case 'PLAY': {
        S.time += dt;
        if (inp.justPressed('pause')) { doPause(); break; }
        try { spec.update(S.state, dt, inp, A); } catch (e) { console.error(e); }
        if (S.state.over) { endGame(S.state.over); }
        break;
      }
      case 'PAUSE': {
        if (inp.justPressed('pause')) doPause();
        break;
      }
      case 'GAMEOVER': {
        if (S.nameEnter) {
          // name entry: left/right pick char, up/down shift, enter accept, esc skip
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          if (inp.justPressed('left')) { S.nameBuf = S.nameBuf.slice(0, S.nameIdx) + shiftChar(S.nameBuf[S.nameIdx] || 'A', -1) + S.nameBuf.slice(S.nameIdx + 1); A.sfx('tick'); }
          if (inp.justPressed('right')) { S.nameBuf = S.nameBuf.slice(0, S.nameIdx) + shiftChar(S.nameBuf[S.nameIdx] || 'A', +1) + S.nameBuf.slice(S.nameIdx + 1); A.sfx('tick'); }
          if (inp.justPressed('up')) { S.nameIdx = (S.nameIdx + 2) % 3; A.sfx('tick'); }
          if (inp.justPressed('down')) { S.nameIdx = (S.nameIdx + 1) % 3; A.sfx('tick'); }
          if (inp.justPressed('start') || inp.justPressed('fire')) { if (S.nameBuf.length < 3) S.nameBuf += 'AAA'.slice(S.nameBuf.length); submitName(); }
          if (inp.justPressed('pause')) submitName();
        } else if (inp.justPressed('start') || inp.justPressed('fire') || inp.justPressed('restart') || S.attractT2Done()) {
          toAttract();
        }
        S.gameOverT = (S.gameOverT || 0) + dt;
        if (!S.nameEnter && S.gameOverT > 6) toAttract();
        break;
      }
    }
    inp.endFrame();
  }
  function shiftChar(ch, dir) {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let i = c.indexOf(ch); if (i < 0) i = 0;
    return c[(i + dir + c.length) % c.length];
  }
  // helper used by GAMEOVER auto-return
  S.attractT2Done = function () { return (S.gameOverT || 0) > 6; };

  /* ---------------- render ---------------- */
  function render() {
    const c = ctx;
    c.save();
    const shaked = DSP.fx.ctxOffset(c);
    spec.render(S, c);
    if (shaked) c.restore();
    DSP.fx.drawFlash(c);
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), acc = 0, raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) { update(STEP); acc -= STEP; n++; }
    render();
  }
  raf = requestAnimationFrame(frame);

  // auto-pause when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.st === 'PLAY') { S.st = 'PAUSE'; A.pauseTune(true); }
  });
  window.addEventListener('beforeunload', () => { A.stopTune(); });

  S.scores = scores;
  S.startGame = startGame;
  // debug/integration handle — lets playtest harnesses & dev tools inspect state
  window.__DSP_STATE = S;
  return S;
};

// expose a helper for games to draw the shared HUD chrome (Crt is CSS)
DSP.hud = {
  // draw a boxed label/value row
  panel(c, x, y, w, label, value, lcol, vcol) {
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x, y, w, 9);
    c.fillStyle = lcol || '#39ff88'; c.font = '';
    DSP.pixel.text(label, x + 2, y + 2, lcol || '#39ff88');
    DSP.pixel.text(String(value), x + w - 2 - String(value).length * 6, y + 2, vcol || '#ffffff');
  },
};

/* =========================================================================
 * Shared chiptune palettes + a small note helper for game authors
 * ========================================================================= */
DSP.n = function (midi, steps) {
  // return an array of `steps` entries all set to `midi` (for a whole-bar note)
  return new Array(steps).fill(midi);
};
DSP.rest = function (steps) { return new Array(steps).fill(null); };
// build a pattern by joining step-sized chunks: e.g. P(16, [ [67,4],[null,4],[72,4],[64,4] ])
DSP.P = function (total, chunks) {
  const out = new Array(total).fill(null);
  for (const ch of chunks) {
    const [note, len, off] = [ch[0], ch[1] || 1, ch[2] || 0];
    for (let i = 0; i < len; i++) out[(off + i) % total] = note;
  }
  return out;
};

})();
