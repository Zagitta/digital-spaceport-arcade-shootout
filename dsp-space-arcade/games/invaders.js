/* ============================================================
   NOVA BLASTER — Digital Spaceport Arcade, Cabinet 02
   Classic alien-grid defense: marching swarm, one-bullet
   cannon, eroding bunkers, UFO scout, wave escalation.
   The march tempo (audio + step rate) follows the surviving
   population — the authentic invader trick.
   Uses DSP core (../js/common/dspcore.js).
   ============================================================ */
(function () {
'use strict';

const DSP2 = window.DSP;

/* ---------------- layout constants ---------------- */
const COLS = 11;          // aliens per row
const CELL_W = 24;        // horizontal spacing between columns
const CELL_H = 14;        // vertical spacing between rows
const GRID_X0 = 16;       // left edge of column 0
const SHIELD_Y = 138;     // top of the bunker line
const PLAYER_Y = 152;     // player cannon baseline
const BULLET_SPD = 170;   // px/s, player bullet
const BOMB_SPD = BULLET_SPD * 2.5;
const PLAYER_SPD = 90;    // px/s lateral
const EXTRA_LIFE_AT = [1500, 4500];
const LIVES_CAP = 5;

/* ---------------- sprites (palette keys) ---------------- */
// two walk frames per tier; '.' = transparent
const SPR_ALIEN = {
  // tier 0 — squid (top row, 30 pts)
  squid: [
    [
      '..X..X..',
      '.XXXXXX.',
      'XX.XX.XX',
      'XXXXXXXX',
      '.X.XX.X.',
      '..X..X..',
    ],
    [
      '..X..X..',
      '.XXXXXX.',
      'XX.XX.XX',
      'XXXXXXXX',
      'X.XXXX.X',
      'X......X',
    ],
  ],
  // tier 1 — crab (middle rows, 20 pts)
  crab: [
    [
      '.X....X.',
      '..X..X..',
      '.XXXXXX.',
      'X.XXXX.X',
      'XXXXXXXX',
      '.X.XX.X.',
    ],
    [
      '.X....X.',
      'X.X..X.X',
      'X.XXXX.X',
      '.XXXXXX.',
      '.XXXXXX.',
      '..X..X..',
    ],
  ],
  // tier 2 — octopus (bottom rows, 10 pts)
  octo: [
    [
      'XXXXXXXX',
      'XXXXXXXX',
      'XX.XX.XX',
      'XXXXXXXX',
      '.X.XX.X.',
      '..X..X..',
    ],
    [
      'XXXXXXXX',
      'XXXXXXXX',
      'XX.XX.XX',
      'XXXXXXXX',
      '..X..X..',
      '.X.XX.X.',
    ],
  ],
};
const SPR_UFO = [
  '...RRR...',
  '..RRRRR..',
  '.RWWRWW.',
  'RRRRRRRRR',
  '.R.R.R.R.',
];
const PAL = { X: '#ffffff', R: '#ff2bd6', W: '#ffe600' };

/* ---------------- music: 112bpm march ---------------- */
const MUSIC = {
  bpm: 112, spb: 4, total: 32,
  tracks: [
    // lead — square, sparse stabs on the off-beat
    { wave: 'square', gain: 0.14,
      pattern: DSP2.P(32, [
        [null,2,0],[67,2,2],[null,2,4],[71,2,6],
        [null,2,8],[69,2,10],[null,2,12],[64,2,14],
        [null,2,16],[67,2,18],[null,2,20],[72,2,22],
        [null,2,24],[71,2,26],[69,2,28],[null,2,30],
      ]) },
    // bass — triangle, root pulse
    { wave: 'triangle', gain: 0.30,
      pattern: DSP2.P(32, [
        [43,4,0],[null,0,4],[43,4,8],[null,0,12],
        [40,4,16],[null,0,20],[43,4,24],[45,4,28],
      ]) },
    // hat — sparse noise ticks
    { wave: 'noise', gain: 0.05, len: 0.35,
      pattern: DSP2.P(32, [
        [60,1,1],[null,1,2],[60,1,5],[null,1,6],
        [60,1,9],[null,1,10],[60,1,13],[null,1,14],
        [60,1,17],[null,1,18],[60,1,21],[null,1,22],
        [60,1,25],[null,1,26],[60,1,29],[null,1,30],
      ]) },
  ],
};

/* ---------------- world builders ---------------- */
function buildGrid(rows) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const tier = r === 0 ? 0 : (r <= Math.ceil(rows / 2) ? 1 : 2);
      grid.push({ row: r, col: c, alive: true, tier: tier });
    }
  }
  return grid;
}

// 4 destructible bunkers, each a 14x10 grid of 2px cells with an arch cutout
function buildShields() {
  const shields = [];
  const xs = [34, 102, 170, 238];
  for (const x of xs) {
    const cells = [];
    for (let cy = 0; cy < 10; cy++) {
      for (let cx = 0; cx < 14; cx++) {
        let alive = true;
        // round the top corners
        if (cy === 0 && (cx === 0 || cx === 13)) alive = false;
        if (cy === 1 && (cx === 0 || cx === 13)) alive = false;
        // central arch (gap at the bottom)
        if (cy >= 5 && cx >= 5 && cx <= 8) alive = false;
        cells.push(alive);
      }
    }
    shields.push({ x: x, y: SHIELD_Y, cells: cells });
  }
  return shields;
}

/* ---------------- game state factory ---------------- */
function newGame() {
  const st = {
    score: 0,
    lives: 3,
    wave: 1,
    over: null,
    // player
    px: 160,
    bullet: null,            // {y} single on-screen bullet
    fireCd: 0,
    // swarm
    rows: 5,
    grid: buildGrid(5),
    dir: 1,                  // 1 right, -1 left
    gx: GRID_X0,             // current left edge of the grid
    gy: 30,                  // current top of the grid
    stepT: 0,                // countdown to next march step
    frame: 0,                // sprite frame 0/1
    // bombs
    bombs: [],
    bombT: 1.5,              // time until next bomb drop
    // ufo scout
    ufo: null,               // {x, dir, val}
    ufoT: 12 + Math.random() * 10,
    // bunkers
    shields: buildShields(),
    // extra-life bookkeeping
    extraIdx: 0,
    // transient fx flags
    msg: '', msgT: 0,
    deadFx: 0,               // brief pause after player death
  };
  st.msg = 'WAVE 1 · DEFEND THE LINE';
  st.msgT = 2.2;
  return st;
}

/* attract-mode demo instance: a self-marching grid + auto cannon */
function newAttract() {
  const d = {
    rows: 5,
    grid: buildGrid(5),
    dir: 1,
    gx: GRID_X0,
    gy: 30,
    stepT: 0,
    frame: 0,
    px: 160,
    bullet: null,
    fireT: 0,
    t: 0,
  };
  return d;
}

/* ---------------- helpers ---------------- */
function liveCount(st) {
  let n = 0;
  for (const a of st.grid) if (a.alive) n++;
  return n;
}

function gridBounds(st) {
  let minX = 999, maxX = -999, minY = 999, maxY = -999;
  for (const a of st.grid) {
    if (!a.alive) continue;
    const x = st.gx + a.col * CELL_W;
    const y = st.gy + a.row * CELL_H;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
}

// march tempo: faster as the population drops
function stepInterval(st) {
  const total = st.rows * COLS;
  const live = liveCount(st);
  if (live <= 0) return 0.2;
  const frac = live / total;                    // 1 -> full grid, 0 -> empty
  let base = 0.55 * (0.35 + 0.65 * frac);       // 0.19s .. 0.55s
  base *= Math.max(0.5, 1 - (st.wave - 1) * 0.09); // waves march faster
  return Math.max(0.12, base);
}

function killAlien(st, a, audio) {
  a.alive = false;
  const pts = a.tier === 0 ? 30 : (a.tier === 1 ? 20 : 10);
  st.score += pts;
  const ax = st.gx + a.col * CELL_W + 4;
  const ay = st.gy + a.row * CELL_H + 3;
  DSP2.fx.burst(ax, ay, a.tier === 0 ? '#ff2bd6' : (a.tier === 1 ? '#21e6ff' : '#39ff88'), 10, 55);
  audio.sfx('boom');
  checkExtras(st, audio);
}

function checkExtras(st, audio) {
  while (st.extraIdx < EXTRA_LIFE_AT.length && st.score >= EXTRA_LIFE_AT[st.extraIdx]) {
    st.extraIdx++;
    if (st.lives < LIVES_CAP) {
      st.lives++;
      st.msg = 'EXTRA LIFE!';
      st.msgT = 1.6;
      audio.sfx('extra');
    } else {
      st.msg = 'SCORE BONUS';
      st.msgT = 1.4;
      audio.sfx('powerup');
    }
  }
}

function nextWave(st, audio) {
  st.wave++;
  st.rows = Math.min(7, st.rows + 1);
  st.grid = buildGrid(st.rows);
  st.gx = GRID_X0;
  st.gy = 30;
  st.dir = 1;
  st.stepT = 0;
  st.frame = 0;
  st.bombs = [];
  st.bombT = 1.5;
  st.shields = buildShields();
  st.msg = 'WAVE ' + st.wave + ' · SWARM REINFORCED';
  st.msgT = 2.2;
  audio.sfx('tier');
}

/* shield erosion: erase a small cluster of cells around hit point */
function erodeShield(sh, hx, hy, radius) {
  const cw = 2; // cell size in px
  const c0x = Math.floor((hx - sh.x) / cw);
  const c0y = Math.floor((hy - sh.y) / cw);
  for (let cy = 0; cy < 10; cy++) {
    for (let cx = 0; cx < 14; cx++) {
      if (!sh.cells[cy * 14 + cx]) continue;
      const dx = cx - c0x, dy = cy - c0y;
      if (dx * dx + dy * dy <= radius * radius) sh.cells[cy * 14 + cx] = false;
    }
  }
}

function shieldHit(st, x, y) {
  for (const sh of st.shields) {
    if (x < sh.x || x >= sh.x + 28 || y < sh.y || y >= sh.y + 20) continue;
    const idx = Math.floor((y - sh.y) / 2) * 14 + Math.floor((x - sh.x) / 2);
    if (idx >= 0 && idx < 140 && sh.cells[idx]) {
      erodeShield(sh, x, y, 2.2);
      return true;
    }
  }
  return false;
}

/* ---------------- update (PLAY only) ---------------- */
function update(st, dt, inp, audio) {
  if (st.over) return;

  if (st.msgT > 0) st.msgT -= dt;

  // --- player death pause ---
  if (st.deadFx > 0) {
    st.deadFx -= dt;
    if (st.deadFx <= 0) {
      st.px = 160;
      st.bullet = null;
      st.bombs = [];
      st.bombT = 1.5;
    }
    return;
  }

  // --- player movement + firing ---
  if (inp.pressed('left'))  st.px -= PLAYER_SPD * dt;
  if (inp.pressed('right')) st.px += PLAYER_SPD * dt;
  st.px = Math.max(10, Math.min(310, st.px));

  if (st.fireCd > 0) st.fireCd -= dt;
  if (inp.justPressed('fire') && !st.bullet && st.fireCd <= 0) {
    st.bullet = { y: PLAYER_Y - 6 };
    st.fireCd = 0.35;
    audio.sfx('shoot');
  }

  // --- alien march ---
  const live = liveCount(st);
  if (live > 0) {
    st.stepT += dt;
    const interval = stepInterval(st);
    while (st.stepT >= interval && liveCount(st) > 0) {
      st.stepT -= interval;
      doMarchStep(st, audio);
    }
    // invasion check: swarm reached the bunker line
    const b = gridBounds(st);
    if (b.maxY + 8 >= SHIELD_Y) {
      st.over = 'THE SWARM HAS LANDED';
      return;
    }
  } else {
    // grid cleared → next wave
    nextWave(st, audio);
    return;
  }

  // --- bombs ---
  st.bombT -= dt;
  if (st.bombT <= 0 && live > 0) {
    // pick a random living column, drop from its lowest alien
    const cols = {};
    for (const a of st.grid) {
      if (!a.alive) continue;
      if (cols[a.col] == null || a.row > cols[a.col].row) cols[a.col] = a;
    }
    const keys = Object.keys(cols);
    if (keys.length) {
      const a = cols[keys[(Math.random() * keys.length) | 0]];
      st.bombs.push({ x: st.gx + a.col * CELL_W + 4, y: st.gy + a.row * CELL_H + 8 });
    }
    st.bombT = 0.8 + Math.random() * 1.4;
  }
  for (let i = st.bombs.length - 1; i >= 0; i--) {
    const bm = st.bombs[i];
    bm.y += BOMB_SPD * dt;
    // bomb vs player bullet
    if (st.bullet && Math.abs(bm.y - st.bullet.y) < 4 && Math.abs(bm.x - (st.px)) < 5) {
      st.bombs.splice(i, 1);
      st.bullet = null;
      DSP2.fx.burst(bm.x, bm.y, '#ffe600', 8, 40);
      audio.sfx('tick');
      continue;
    }
    // bomb vs shield
    if (shieldHit(st, bm.x, bm.y)) {
      st.bombs.splice(i, 1);
      DSP2.fx.burst(bm.x, bm.y, '#39ff88', 6, 30);
      continue;
    }
    // bomb vs player
    if (bm.y >= PLAYER_Y - 2 && Math.abs(bm.x - st.px) < 7) {
      st.bombs.splice(i, 1);
      playerHit(st, audio);
      return;
    }
    if (bm.y > 176) st.bombs.splice(i, 1);
  }

  // --- player bullet ---
  if (st.bullet) {
    st.bullet.y -= BULLET_SPD * dt;
    // vs aliens
    let consumed = false;
    if (!consumed) {
      const bx = st.px;
      for (const a of st.grid) {
        if (!a.alive) continue;
        const ax = st.gx + a.col * CELL_W + 4;
        const ay = st.gy + a.row * CELL_H + 3;
        if (Math.abs(bx - ax) < 8 && st.bullet.y <= ay + 6 && st.bullet.y >= ay - 2) {
          killAlien(st, a, audio);
          consumed = true;
          break;
        }
      }
    }
    // vs ufo
    if (!consumed && st.ufo && Math.abs(st.bullet.y - st.ufo.y) < 5 && Math.abs(st.px - st.ufo.x) < 9) {
      st.score += st.ufo.val;
      st.msg = 'UFO +' + st.ufo.val;
      st.msgT = 1.2;
      DSP2.fx.burst(st.ufo.x, st.ufo.y, '#ff2bd6', 18, 70);
      audio.sfx('powerup');
      st.ufo = null;
      consumed = true;
      checkExtras(st, audio);
    }
    // vs shield
    if (!consumed && shieldHit(st, st.px, st.bullet.y)) {
      DSP2.fx.burst(st.px, st.bullet.y, '#39ff88', 6, 30);
      consumed = true;
    }
    if (consumed || st.bullet.y < 14) st.bullet = null;
  }

  // --- ufo scout ---
  if (st.ufo) {
    st.ufo.x += st.ufo.dir * 34 * dt;
    if (st.ufo.x < -14 || st.ufo.x > 334) st.ufo = null;
  } else {
    st.ufoT -= dt;
    if (st.ufoT <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      st.ufo = {
        x: dir === 1 ? -12 : 332,
        dir: dir,
        y: 16,
        val: [50, 100, 150, 300][(Math.random() * 4) | 0],
      };
      st.ufoT = 15 + Math.random() * 10;
      audio.sfx('ufo');
    }
  }
}

function doMarchStep(st, audio) {
  const b = gridBounds(st);
  const edge = st.dir === 1 ? (b.maxX + 12 >= 312) : (b.minX <= 8);
  st.frame ^= 1;
  if (edge) {
    // drop a step and turn around in place (classic behavior)
    st.gy += 8;
    st.dir = -st.dir;
  } else {
    st.gx += st.dir * 8;
  }
  // march pitch follows the tempo; keep the tick audible but not machine-gun
  audio.setBpm(Math.round(112 * (0.55 / stepInterval(st))));
  st.tickFlip = !st.tickFlip;
  if (stepInterval(st) >= 0.24 || st.tickFlip) audio.sfx('tick');
}

function playerHit(st, audio) {
  st.lives--;
  st.bullet = null;
  st.bombs = [];
  audio.sfx('crash');
  DSP2.fx.shake(5, 0.4);
  DSP2.fx.burst(st.px, PLAYER_Y, '#ff8a00', 26, 90);
  DSP2.fx.flashScreen('#ff3355', 0.5);
  if (st.lives <= 0) {
    st.over = 'GAME OVER';
  } else {
    st.deadFx = 1.2;
    st.msg = 'CANNON DOWN · ' + st.lives + ' LEFT';
    st.msgT = 1.2;
  }
}

/* ---------------- attract demo update ---------------- */
function updateAttract(demo, dt, inp) {
  demo.t += dt;
  demo.stepT += dt;
  const interval = 0.5;
  while (demo.stepT >= interval) {
    demo.stepT -= interval;
    demo.frame ^= 1;
    const b = demoBounds(demo);
    const edge = demo.dir === 1 ? (b.maxX + 12 >= 312) : (b.minX <= 8);
    if (edge) { demo.gy += 8; demo.dir = -demo.dir; }
    else demo.gx += demo.dir * 8;
    if (demo.gy > 110) { demo.gy = 30; demo.gx = GRID_X0; demo.dir = 1; }
  }
  // auto-firing cannon
  demo.px = 160 + Math.sin(demo.t * 0.8) * 120;
  demo.fireT -= dt;
  if (demo.fireT <= 0) {
    demo.bullet = { y: PLAYER_Y - 6 };
    demo.fireT = 0.9;
  }
  if (demo.bullet) {
    demo.bullet.y -= BULLET_SPD * dt;
    if (demo.bullet.y < 14) demo.bullet = null;
  }
}
function demoBounds(d) {
  let minX = 999, maxX = -999;
  for (const a of d.grid) {
    if (!a.alive) continue;
    const x = d.gx + a.col * CELL_W;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  return { minX: minX, maxX: maxX };
}

/* ---------------- rendering ---------------- */
function drawSwarm(c, grid, gx, gy, frame) {
  const palMap = [
    { X: '#ff2bd6' },   // squid — magenta
    { X: '#21e6ff' },   // crab — cyan
    { X: '#39ff88' },   // octo — green
  ];
  for (const a of grid) {
    if (!a.alive) continue;
    const spr = a.tier === 0 ? SPR_ALIEN.squid : (a.tier === 1 ? SPR_ALIEN.crab : SPR_ALIEN.octo);
    DSP2.pixel.drawSprite(spr[frame], palMap[a.tier], gx + a.col * CELL_W, gy + a.row * CELL_H, 1);
  }
}

function drawPlayer(c, st) {
  const x = (st.px - 6) | 0, y = PLAYER_Y;
  DSP2.pixel.rect(x, y + 4, 12, 4, '#21e6ff');
  DSP2.pixel.rect(x + 4, y + 1, 4, 4, '#21e6ff');
  DSP2.pixel.rect(x + 5, y - 2, 2, 4, '#ffe600');
}

function drawShields(c, st) {
  for (const sh of st.shields) {
    for (let cy = 0; cy < 10; cy++) {
      for (let cx = 0; cx < 14; cx++) {
        if (sh.cells[cy * 14 + cx]) {
          DSP2.pixel.rect(sh.x + cx * 2, sh.y + cy * 2, 2, 2, '#39ff88');
        }
      }
    }
  }
}

function drawHUD(c, st) {
  c.fillStyle = 'rgba(5,1,15,0.7)';
  c.fillRect(0, 0, 320, 12);
  DSP2.pixel.text('SCORE ' + String(st.score | 0).padStart(6, '0'), 3, 3, '#ffe600');
  DSP2.pixel.text('WAVE ' + st.wave, 118, 3, '#9b5cff');
  // life icons (mini cannons)
  for (let i = 0; i < st.lives; i++) {
    const lx = 178 + i * 10;
    DSP2.pixel.rect(lx, 4, 8, 3, '#21e6ff');
    DSP2.pixel.rect(lx + 3, 2, 2, 3, '#21e6ff');
  }
  // high score ribbon (from persistent table)
  const hs = S_TOP_SCORE;
  if (hs) DSP2.pixel.text('HI ' + String(hs).padStart(6, '0'), 240, 3, '#ff2bd6');
  // message
  if (st.msgT > 0 && st.msg) {
    DSP2.pixel.textC(st.msg, 160, 56, '#ffe600', 2);
  }
}

let S_TOP_SCORE = 0; // refreshed each render pass

function drawGame(c, S) {
  const st = S.state;
  c.fillStyle = '#05010f';
  c.fillRect(0, 0, 320, 180);
  DSP2.fx.drawStars(c, 0);
  // ground line
  DSP2.pixel.rect(0, 170, 320, 1, '#3c4670');
  drawShields(c, st);
  drawSwarm(c, st.grid, st.gx, st.gy, st.frame);
  // ufo
  if (st.ufo) {
    DSP2.pixel.drawSprite(SPR_UFO, PAL, (st.ufo.x - 4) | 0, st.ufo.y - 3, 1);
  }
  // bombs
  for (const bm of st.bombs) {
    DSP2.pixel.rect(bm.x, bm.y, 2, 4, '#ff3355');
    DSP2.pixel.rect(bm.x - 1, bm.y + 1, 1, 1, '#ffe600');
  }
  // player bullet
  if (st.bullet) {
    DSP2.pixel.rect(st.px - 1, st.bullet.y, 2, 5, '#ffffff');
  }
  if (st.deadFx <= 0) drawPlayer(c, st);
  DSP2.fx.drawParts(c);
  drawHUD(c, st);
}

function drawBoot(c, S) {
  c.fillStyle = '#02010a';
  c.fillRect(0, 0, 320, 180);
  const lines = S.spec.bootLines;
  for (let i = 0; i < Math.min(S.bootLine, lines.length); i++) {
    DSP2.pixel.text(lines[i], 8, 14 + i * 12, i < 2 ? '#39ff88' : '#21e6ff');
  }
  if (S.bootLine >= lines.length) {
    const p = Math.min(1, S.loadT / S.spec.loadTime);
    DSP2.pixel.text('LOADING CABINET 02', 8, 14 + lines.length * 12 + 10, '#ff2bd6');
    DSP2.pixel.rect(8, 150, 300, 8, '#1b2440');
    DSP2.pixel.rect(9, 151, Math.floor(298 * p), 6, '#ff2bd6');
    DSP2.pixel.textC('PRESS ENTER TO SKIP', 160, 166, '#8a94b8');
  } else {
    if (((performance.now() / 300) | 0) % 2) {
      const lastLen = S.bootLine ? (lines[Math.min(S.bootLine, lines.length) - 1].length + 1) * 6 : 0;
      DSP2.pixel.text('_', 8 + lastLen, 14 + S.bootLine * 12 - 2, '#39ff88');
    }
  }
}

function drawAttract(c, S) {
  c.fillStyle = '#05010f';
  c.fillRect(0, 0, 320, 180);
  DSP2.fx.drawStars(c, 0);
  const demo = S.demo || newAttract();
  // demo world
  DSP2.pixel.rect(0, 170, 320, 1, '#3c4670');
  drawSwarm(c, demo.grid, demo.gx, demo.gy, demo.frame);
  if (demo.bullet) DSP2.pixel.rect((demo.px - 1) | 0, demo.bullet.y, 2, 5, '#ffffff');
  drawPlayerAt(c, demo.px);

  // title card
  c.fillStyle = 'rgba(5,1,15,0.82)';
  c.fillRect(40, 44, 240, 72);
  DSP2.pixel.rectOutline(40, 44, 240, 72, '#ff2bd6', 1);
  DSP2.pixel.textC('NOVA BLASTER', 160, 54, '#ff2bd6', 3);
  DSP2.pixel.textC('CABINET 02 · ALIEN GRID DEFENSE', 160, 80, '#21e6ff', 1);
  DSP2.pixel.textC('HOLD THE LINE', 160, 94, '#8a94b8');
  DSP2.pixel.textC('THE SWARM NEVER STOPS', 160, 104, '#8a94b8');

  if (((performance.now() / 450) | 0) % 2) {
    DSP2.pixel.textC('INSERT COIN', 160, 152, '#ffe600', 2);
  }
  DSP2.pixel.textC('PRESS START', 160, 124, '#39ff88');
  const hs = S.scores.get();
  if (hs.length) {
    DSP2.pixel.textC('TOP ' + String(hs[0].score).padStart(6, '0'), 160, 12, '#ffe600');
  }
}
function drawPlayerAt(c, px) {
  const x = (px - 6) | 0, y = PLAYER_Y;
  DSP2.pixel.rect(x, y + 4, 12, 4, '#21e6ff');
  DSP2.pixel.rect(x + 4, y + 1, 4, 4, '#21e6ff');
  DSP2.pixel.rect(x + 5, y - 2, 2, 4, '#ffe600');
}

function drawPause(c, S) {
  drawGame(c, S);
  c.fillStyle = 'rgba(2,1,10,0.72)';
  c.fillRect(0, 0, 320, 180);
  DSP2.pixel.textC('PAUSED', 160, 74, '#ffe600', 3);
  DSP2.pixel.textC('P TO RESUME', 160, 100, '#21e6ff');
}

function drawGameOver(c, S) {
  // frozen battlefield behind the panel
  c.fillStyle = '#05010f';
  c.fillRect(0, 0, 320, 180);
  DSP2.fx.drawStars(c, 0);
  const st = S.state;
  if (st) {
    DSP2.pixel.rect(0, 170, 320, 1, '#3c4670');
    drawShields(c, st);
    drawSwarm(c, st.grid, st.gx, st.gy, st.frame);
  }
  DSP2.fx.drawParts(c);
  c.fillStyle = 'rgba(5,1,15,0.86)';
  c.fillRect(0, 0, 320, 180);
  DSP2.pixel.rectOutline(46, 26, 228, 128, '#ff2bd6');
  c.fillStyle = 'rgba(11,4,38,0.9)';
  c.fillRect(47, 27, 226, 126);

  DSP2.pixel.textC('GAME OVER', 160, 38, '#ff3355', 3);
  DSP2.pixel.textC(S.over.reason, 160, 58, '#8a94b8');
  DSP2.pixel.textC('FINAL ' + String(S.over.score).padStart(6, '0'), 160, 74, '#ffe600', 2);

  const hs = S.scores.get();
  DSP2.pixel.text('TOP PILOTS', 60, 92, '#9b5cff');
  for (let i = 0; i < Math.min(5, hs.length); i++) {
    const row = String(i + 1).padStart(2, '0') + ' ' + hs[i].name + '  ' + String(hs[i].score).padStart(6, '0');
    const isMe = (i === S.rank);
    DSP2.pixel.text(row, 60, 104 + i * 10, isMe ? '#ffe600' : '#8a94b8');
    if (isMe) DSP2.pixel.text('NEW', 214, 104 + i * 10, '#ff2bd6');
  }

  if (S.nameEnter) {
    if (((performance.now() / 300) | 0) % 2) {
      DSP2.pixel.textC('ENTER CALLSIGN', 160, 160, '#39ff88', 2);
    }
    const buf = (S.nameBuf || 'AAA').padEnd(3, '?');
    for (let i = 0; i < 3; i++) {
      DSP2.pixel.rect(146 + i * 16, 164, 12, 12, i === S.nameIdx ? '#ff2bd6' : '#1b2440');
      DSP2.pixel.textC(buf[i], 152 + i * 16, 166, '#fff');
    }
  } else if (S.gameOverT > 2 && ((performance.now() / 500) | 0) % 2) {
    DSP2.pixel.textC('PRESS START FOR ANOTHER RUN', 160, 162, '#21e6ff');
  }
}

/* ---------------- register ---------------- */
DSP2.startGame({
  id: 'invaders',
  title: 'NOVA BLASTER',
  stars: 90,
  bootLines: [
    'DSP BIOS v5.0 · CABINET 02',
    'DEFENSE GRID ONLINE',
    'SWARM TRACKERS CALIBRATED',
    'BUNKER INTEGRITY VERIFIED',
    'CANNON LINK ESTABLISHED',
  ],
  loadTime: 0.9,
  bootLineTime: 0.3,
  music: MUSIC,
  buttons: [
    { action: 'left', label: '◄' },
    { action: 'right', label: '►' },
    { action: 'fire', label: 'FIRE' },
  ],
  newGame: newGame,
  newAttract: newAttract,
  updateAttract: updateAttract,
  update: update,
  render: function (S, c) {
    const ctx = c;
    if (S.st === 'BOOT') { drawBoot(ctx, S); return; }
    if (S.st === 'ATTRACT') { drawAttract(ctx, S); return; }
    if (S.st === 'GAMEOVER') { drawGameOver(ctx, S); return; }
    if (S.st === 'PAUSE') { drawPause(ctx, S); return; }
    // PLAY
    const hs = S.scores.get();
    S_TOP_SCORE = hs.length ? hs[0].score : 0;
    drawGame(ctx, S);
  },
});

})();
