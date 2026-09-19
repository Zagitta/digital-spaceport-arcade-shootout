/* ============================================================
   LUNAR LIFTER — Digital Spaceport Arcade, Cabinet 01
   8-bit lunar lander. Physics: gravity, lateral thrusters,
   fuel budget, slope+velocity touchdown rules, 3 moon stages.
   Uses DSP core (../js/common/dspcore.js).
   ============================================================ */
(function () {
'use strict';

const DSP2 = window.DSP;

/* ---------------- sprites (palette keys) ---------------- */
const PAL = {
  W: '#ffffff', G: '#8a94b8', B: '#3c4670',
  P: '#ff2bd6', C: '#21e6ff', Y: '#ffe600', O: '#ff8a00',
  R: '#ff3355', D: '#1b2440', L: '#c3cdf0', V: '#9b5cff',
};
const SPR = {
  ship: [
    '...C...',
    '..CLC..',
    '.WLLLLW',
    'WCWWWWCW',
    'WLLLLLLW',
    '.L.LL.L',
    '..B.B..',
    '..B.B..',
  ],
  flame: [
    '..O..',
    '.YOO.',
    '.OYYO',
    '..Y..',
  ],
  pad: [
    'YY..YY',
    'Y...Y.',
    '.YYY..',
    '..Y...',
  ],
  ufo: [
    '...CCC...',
    '..CWWWC..',
    '.CWWWWWC.',
    'CWWCCCWWC',
  ],
};

/* ---------------- music: tense 92bpm minor ---------------- */
const MUSIC = {
  bpm: 92, spb: 4, total: 32,
  tracks: [
    // lead (A minor, i-VI-III-VII feel)
    { wave: 'square', gain: 0.16,
      pattern: DSP2.P(32, [
        [69,2,0],[null,2,2],[72,2,4],[76,2,6],
        [74,2,8],[72,2,10],[null,2,12],[null,2,14],
        [67,2,16],[null,2,18],[71,2,20],[74,2,22],
        [72,2,24],[69,2,26],[67,2,28],[null,2,30],
      ]) },
    // bass
    { wave: 'triangle', gain: 0.30,
      pattern: DSP2.P(32, [
        [45,4,0],[null,0,4],[43,4,8],[null,0,12],
        [40,4,16],[null,0,20],[47,4,24],[45,4,28],
      ]) },
    // hat
    { wave: 'noise', gain: 0.05, len: 0.4,
      pattern: DSP2.P(32, [[60,1,0],[null,1,1],[60,1,2],[null,1,3],[60,1,4],[null,1,5],[60,1,6],[null,1,7],
        [60,1,8],[null,1,9],[60,1,10],[null,1,11],[60,1,12],[null,1,13],[60,1,14],[null,1,15],
        [60,1,16],[null,1,17],[60,1,18],[null,1,19],[60,1,20],[null,1,21],[60,1,22],[null,1,23],
        [60,1,24],[null,1,25],[60,1,26],[null,1,27],[60,1,28],[null,1,29],[60,1,30],[null,1,31]]) },
  ],
};

/* ---------------- stage config ---------------- */
const STAGES = [
  { name: 'MOON ONE · CRATER HOLLOW', fuel: 100, g: 22,  rough: 1.0, rocks: 4 },
  { name: 'MOON TWO · RIDGE RUN',     fuel: 80,  g: 26,  rough: 1.7, rocks: 6 },
  { name: 'MOON THREE · THE VOID',    fuel: 65,  g: 30,  rough: 2.4, rocks: 9 },
];

/* ---------------- world generation ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genStage(cfg, seed) {
  const rnd = mulberry32(seed);
  const H0 = 128;
  const heights = new Array(320);
  let y = H0;
  for (let x = 0; x < 320; x++) {
    y += (rnd() - 0.5) * 2.4 * cfg.rough;
    y += Math.sin(x * 0.05 + seed) * 0.18 * cfg.rough;
    if (y < 104) y = 104;
    if (y > 158) y = 158;
    heights[x] = y;
  }
  // carve flat landing pad: pick a safe spot away from edges
  const padW = 26;
  let padX = 24 + Math.floor(rnd() * (320 - padW - 48));
  // flatten
  for (let x = padX; x < padX + padW; x++) {
    for (let i = 0; i < 320; i++) {
      const d = Math.abs(i - (padX + padW / 2));
      if (d < padW) {
        heights[i] = heights[i] + (heights[padX + padW / 2 | 0] - heights[i]) * (1 - d / (padW / 2 + 2));
      }
    }
  }
  // rocks / craters (visual + slope hazards)
  const rocks = [];
  for (let i = 0; i < cfg.rocks; i++) {
    const rx = 8 + Math.floor(rnd() * 300);
    if (Math.abs(rx - padX) < padW + 14) { i--; continue; }
    const r = 2 + Math.floor(rnd() * 4);
    rocks.push({ x: rx, y: heights[rx] - 1, r: r });
    // crater: push terrain up a bit
    for (let d = -r; d <= r; d++) {
      const xx = rx + d;
      if (xx >= 0 && xx < 320) heights[xx] = Math.min(158, heights[xx] - (r - Math.abs(d)) * 0.6);
    }
  }
  const padY = heights[padX + padW / 2 | 0];
  return { cfg, heights, padX, padW, padY, rocks };
}

/* ---------------- game state factory ---------------- */
function newGame() {
  const st = {
    score: 0,
    stageIdx: 0,
    lives: 3,
    ship: { x: 160, y: 20, vx: 0, vy: 0, thrust: 0, lat: 0, fuel: STAGES[0].fuel, tilt: 0 },
    fuel: STAGES[0].fuel,
    world: null,
    state: 'fly',      // fly | landed | crashed | between
    tState: 0,
    flame: 0,
    msg: '', msgT: 0,
    over: null,
    extraNext: 2000,
    seed: (Math.random() * 1e9) | 0,
  };
  st.world = genStage(STAGES[0], st.seed);
  st.fuel = STAGES[0].fuel;
  return st;
}

function loadStage(st, idx, audio) {
  st.stageIdx = idx;
  const cfg = STAGES[idx];
  st.world = genStage(cfg, st.seed + idx * 7919);
  st.fuel = cfg.fuel;
  st.ship.x = 40 + ((Math.random() * 240) | 0);
  st.ship.y = 16;
  st.ship.vx = 0; st.ship.vy = 0;
  st.state = 'fly';
  st.tState = 0;
  st.msg = cfg.name;
  st.msgT = 2.2;
  if (audio) audio.sfx('powerup');
}

function surfaceAt(world, x) {
  const xi = Math.max(0, Math.min(319, x | 0));
  return world.heights[xi];
}
function slopeAt(world, x) {
  const xi = Math.max(0, Math.min(318, x | 0));
  return (world.heights[xi + 1] - world.heights[xi]);
}

/* ---------------- update ---------------- */
function update(st, dt, inp, audio) {
  const ship = st.ship;
  const w = st.world;

  if (st.msgT > 0) st.msgT -= dt;
  st.flame = Math.max(0, st.flame - dt * 6);

  if (st.state === 'between') {
    st.tState += dt;
    if (st.tState > 1.6) {
      if (st.stageIdx + 1 < STAGES.length) {
        loadStage(st, st.stageIdx + 1, audio);
      } else {
        // campaign complete
        st.score += 5000;
        st.over = 'ALL MOONS CLEARED';
      }
    }
    return;
  }
  if (st.state === 'crashed' || st.state === 'landed' || st.state === 'grounded') {
    st.tState += dt;
    if (st.state === 'crashed') {
      if (st.tState > 1.4) {
        st.lives--;
        if (st.lives <= 0) { st.over = 'SIGNAL LOST'; }
        else { loadStage(st, st.stageIdx, audio); st.msg = 'RE-DEPLOY'; st.msgT = 1.5; }
      }
    } else if (st.state === 'landed') {
      if (st.tState > 1.8) {
        st.state = 'between'; st.tState = 0;
        st.score += 500; // stage clear
      }
    } else {
      // GROUNDED (gentle off-pad touchdown): rest on the surface, taxi to the pad,
      // or take off again with remaining fuel. No per-frame re-trigger / fuel drain.
      const cfg = w.cfg;
      if (inp.pressed('left'))  { ship.vx -= 50 * dt; st.fuel -= 7 * dt; st.flame = 1; }
      if (inp.pressed('right')) { ship.vx += 50 * dt; st.fuel -= 7 * dt; st.flame = 1; }
      ship.vx *= Math.pow(0.3, dt);
      ship.x = Math.max(8, Math.min(312, ship.x + ship.vx * dt));
      const gs = surfaceAt(w, ship.x);
      const onGround = ship.y >= gs - 8 - 0.25;
      const thrusting = inp.pressed('up') && st.fuel > 1;
      if (onGround) {
        if (thrusting) {
          ship.vy -= 74 * dt; st.fuel -= 14 * dt; st.flame = 1;
          if (ship.vy < -8) { ship.y = gs - 9; st.state = 'fly'; st.tState = 0; } // liftoff
        } else {
          ship.vy = 0; // resting on the surface (no gravity)
        }
      } else {
        ship.vy += cfg.g * dt;          // airborne after a hop: gravity applies
        ship.y += ship.vy * dt;
        if (ship.y >= gs - 8) { ship.y = gs - 8; ship.vy = 0; } // fell back down
      }
      // stranded: out of fuel and unable to lift off -> crash after a grace period
      if (st.fuel <= 1 && !inp.pressed('up')) { st.strandT += dt; } else { st.strandT = 0; }
      if (st.strandT > 2.5) { crashShip(st, audio); }
    }
    return;
  }

  // --- flying ---
  const cfg = w.cfg;
  // lateral thrusters
  const latPower = 60;
  if (inp.pressed('left'))  { ship.vx -= latPower * dt; st.fuel -= 9 * dt; st.flame = 1; }
  if (inp.pressed('right')) { ship.vx += latPower * dt; st.fuel -= 9 * dt; st.flame = 1; }
  // vertical boost / brake
  if (inp.pressed('up')) {
    ship.vy -= 74 * dt;
    st.fuel -= 14 * dt;
    st.flame = 1;
  }
  if (inp.pressed('down')) {
    ship.vy += 40 * dt;
    st.fuel -= 6 * dt;
    st.flame = 1;
  }
  // damping
  ship.vx *= Math.pow(0.35, dt);
  ship.vy += cfg.g * dt;
  ship.vy = Math.min(ship.vy, 90);
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  // walls
  if (ship.x < 8)   { ship.x = 8;   ship.vx = Math.max(0, ship.vx); crashShip(st, audio); }
  if (ship.x > 312) { ship.x = 312; ship.vx = Math.min(0, ship.vx); crashShip(st, audio); }
  if (ship.y < 4)   { ship.y = 4;   ship.vy = Math.max(0, ship.vy); }

  // fuel out
  if (st.fuel <= 0) st.fuel = 0;

  // terrain collision
  const surf = surfaceAt(w, ship.x);
  if (ship.y + 7 >= surf) {
    const slope = slopeAt(w, ship.x);
    const onPad = ship.x >= w.padX && ship.x <= w.padX + w.padW;
    const v = Math.abs(ship.vy), h = Math.abs(ship.vx), s = Math.abs(slope);
    if (onPad && v <= 8 && h <= 12 && s <= 1.6) {
      // clean landing on pad
      const soft = Math.max(0, 8 - v) * 25 + Math.max(0, 12 - h) * 10;
      st.score += 300 + Math.floor(soft);
      st.score += Math.floor(st.fuel) * 10;
      st.ship.y = surf - 8;
      st.ship.vy = 0; st.ship.vx = 0;
      st.state = 'landed';
      st.tState = 0;
      st.msg = 'TOUCHDOWN + ' + st.score;
      st.msgT = 2.0;
      audio.sfx('land');
      audio.sfx('powerup');
      DSP2.fx.burst(ship.x, surf, '#39ff88', 26, 70);
      return;
    }
    if (v <= 10 && h <= 14 && s <= 2.2 && !onPad) {
      // gentle off-pad touchdown: survivable, but you're off the pad.
      // Penalty once, then rest on the surface (grounded) so the player can
      // taxi to the pad or relift — no per-frame re-trigger / fuel drain.
      const penalty = Math.floor(v * 12);
      st.fuel = Math.max(5, st.fuel - 20);
      st.score = Math.max(0, st.score - penalty);
      st.ship.y = surf - 8;
      st.ship.vy = 0; st.ship.vx *= 0.3;
      st.state = 'grounded';
      st.tState = 0;
      st.strandT = 0;
      st.msg = 'OFF-PAD! -' + penalty;
      st.msgT = 1.6;
      audio.sfx('hurt');
      DSP2.fx.shake(3, 0.3);
      DSP2.fx.burst(ship.x, surf, '#ff8a00', 14, 50);
      return;
    }
    crashShip(st, audio);
    return;
  }

  // score trickle by altitude maintained (skill play)
  st.score += dt * 4;
}

function crashShip(st, audio) {
  if (st.state !== 'fly' && st.state !== 'grounded') return;
  st.state = 'crashed';
  st.tState = 0;
  st.msg = 'SIGNAL LOST';
  st.msgT = 1.5;
  audio.sfx('crash');
  DSP2.fx.shake(6, 0.5);
  DSP2.fx.burst(st.ship.x, st.ship.y + 4, '#ff8a00', 34, 110);
  DSP2.fx.burst(st.ship.x, st.ship.y + 4, '#ffe600', 22, 90);
  DSP2.fx.flashScreen('#ff3355', 0.5);
  // extra life cadence
}

/* ---------------- rendering ---------------- */
function drawWorld(c, st) {
  const w = st.world;
  // sky gradient bands (cheap)
  DSP2.pixel.rect(0, 0, 320, 40, '#070313');
  DSP2.pixel.rect(0, 40, 320, 40, '#0a0520');
  DSP2.pixel.rect(0, 80, 320, 100, '#0d0728');
  // distant planet
  DSP2.pixel.drawSprite([
    '.CCCC.',
    'CCLLCC',
    'CLLLLC',
    'CCLLCC',
    '.CCCC.',
  ], { C: '#2b3a6e', L: '#3d5288' }, 258, 14, 2);
  // stars
  DSP2.fx.drawStars(c, 0);
  // terrain fill
  c.fillStyle = '#232c4e';
  c.beginPath();
  c.moveTo(0, 180);
  for (let x = 0; x < 320; x += 2) c.lineTo(x, w.heights[x]);
  c.lineTo(320, 180);
  c.closePath();
  c.fill();
  // terrain ridge highlight
  c.fillStyle = '#8a94b8';
  for (let x = 0; x < 320; x += 2) {
    c.fillRect(x, w.heights[x], 2, 1);
  }
  // rocks
  for (const r of w.rocks) {
    DSP2.pixel.rect(r.x - r.r, r.y - r.r + 1, r.r * 2, r.r, '#3c4670');
    DSP2.pixel.rect(r.x - r.r + 1, r.y - r.r, r.r * 2 - 2, 1, '#8a94b8');
  }
  // landing pad
  const px = w.padX, pw = w.padW, py = w.padY;
  DSP2.pixel.rect(px - 1, py + 1, pw + 2, 4, '#21e6ff');
  DSP2.pixel.rect(px, py, pw, 2, '#0b0426');
  for (let i = 0; i < pw / 4; i++) {
    DSP2.pixel.rect(px + 2 + i * 4, py - 1, 2, 1, i % 2 ? '#ffe600' : '#ff2bd6');
  }
  // pad beacon
  const bl = (Math.sin(performance.now() / 200) > 0) ? '#39ff88' : '#14503a';
  DSP2.pixel.rect(px + pw / 2 - 1, py - 6, 2, 4, bl);
  DSP2.pixel.rect(px + pw / 2 - 1, py - 7, 2, 1, '#39ff88');
}

function drawShip(c, st) {
  const ship = st.ship;
  const x = (ship.x - 4) | 0, y = (ship.y - 3) | 0;
  if (st.flame > 0 && st.state === 'fly') {
    const f = 1 + ((performance.now() / 60) | 0) % 2;
    DSP2.pixel.drawSprite(SPR.flame, PAL, x + 2, y + 8 + f * 2, 1);
  }
  if (st.state === 'crashed') return;
  DSP2.pixel.drawSprite(SPR.ship, PAL, x, y, 1);
}

function drawHUD(c, st) {
  const y = 0;
  // top bar
  c.fillStyle = 'rgba(5,1,15,0.7)';
  c.fillRect(0, y, 320, 12);
  DSP2.pixel.text('SCORE ' + String(st.score | 0).padStart(6, '0'), 3, y + 3, '#ffe600');
  DSP2.pixel.text('STAGE ' + (st.stageIdx + 1) + '/3', 120, y + 3, '#9b5cff');
  // lives as ship icons
  for (let i = 0; i < st.lives; i++) {
    DSP2.pixel.rect(200 + i * 9, y + 3, 2, 6, '#21e6ff');
    DSP2.pixel.rect(199 + i * 9, y + 5, 4, 2, '#21e6ff');
  }
  // fuel bar
  const fw = 60, f = Math.max(0, st.fuel / STAGES[st.stageIdx].fuel);
  DSP2.pixel.text('FUEL', 224, 14, '#8a94b8');
  DSP2.pixel.rect(252, 15, fw, 5, '#1b2440');
  DSP2.pixel.rect(253, 16, Math.floor((fw - 2) * f), 3, f > 0.35 ? '#39ff88' : '#ff3355');
  // vel readout
  const vv = Math.round(Math.abs(st.ship.vy) * 10);
  DSP2.pixel.text('VEL ' + String(vv).padStart(3, '0'), 3, 14, Math.abs(st.ship.vy) > 18 ? '#ff3355' : '#21e6ff');
  // low fuel blink
  if (st.fuel < 20 && ((performance.now() / 250) | 0) % 2) {
    DSP2.pixel.textC('LOW FUEL', 160, 30, '#ff3355', 2);
  }
  // message
  if (st.msgT > 0 && st.msg) {
    DSP2.pixel.textC(st.msg, 160, 52, '#ffe600', 2);
  }
}

/* ---------------- screens ---------------- */
function drawBoot(c, S) {
  c.fillStyle = '#02010a';
  c.fillRect(0, 0, 320, 180);
  const lines = S.spec.bootLines;
  for (let i = 0; i < Math.min(S.bootLine, lines.length); i++) {
    DSP2.pixel.text(lines[i], 8, 14 + i * 12, i < 2 ? '#39ff88' : '#21e6ff');
  }
  if (S.bootLine >= lines.length) {
    const p = Math.min(1, S.loadT / S.spec.loadTime);
    DSP2.pixel.text('LOADING CABINET 01', 8, 14 + lines.length * 12 + 10, '#ff2bd6');
    DSP2.pixel.rect(8, 150, 300, 8, '#1b2440');
    DSP2.pixel.rect(9, 151, Math.floor(298 * p), 6, '#ff2bd6');
    DSP2.pixel.textC('PRESS ENTER TO SKIP', 160, 166, '#8a94b8');
  } else {
    if (((performance.now() / 300) | 0) % 2) DSP2.pixel.text('_', 8 + (S.bootLine ? (lines[Math.min(S.bootLine, lines.length) - 1].length + 1) * 6 : 0), 14 + S.bootLine * 12 - 2, '#39ff88');
  }
}

function drawAttract(c, S) {
  // demo: ship auto-flies in a gentle hover pattern
  c.fillStyle = '#05010f';
  c.fillRect(0, 0, 320, 180);
  DSP2.fx.drawStars(c, 0);
  const t = S.attractT;
  const demo = S.demo || { x: 160, y: 60 };
  demo.x = 160 + Math.sin(t * 0.6) * 90;
  demo.y = 58 + Math.sin(t * 1.7) * 10;
  // fake ground
  c.fillStyle = '#232c4e';
  c.fillRect(0, 140, 320, 40);
  c.fillStyle = '#8a94b8';
  c.fillRect(0, 139, 320, 1);
  // draw ship sprite at demo pos
  const sx = (demo.x - 4) | 0, sy = (demo.y - 3) | 0;
  DSP2.pixel.drawSprite(SPR.flame, PAL, sx + 2, sy + 8 + (((t * 8) | 0) % 2), 1);
  DSP2.pixel.drawSprite(SPR.ship, PAL, sx, sy, 1);

  // title card
  c.fillStyle = 'rgba(5,1,15,0.82)';
  c.fillRect(40, 40, 240, 74);
  DSP2.pixel.rectOutline(40, 40, 240, 74, '#ff2bd6', 1);
  DSP2.pixel.textC('LUNAR LIFTER', 160, 50, '#ff2bd6', 3);
  DSP2.pixel.textC('CABINET 01 · MOON DESCENT', 160, 76, '#21e6ff', 1);
  DSP2.pixel.textC('GENTLE ON THE PADS', 160, 92, '#8a94b8');
  DSP2.pixel.textC('RUTHLESS ON CRATERS', 160, 102, '#8a94b8');

  if (((performance.now() / 450) | 0) % 2) {
    DSP2.pixel.textC('INSERT COIN', 160, 152, '#ffe600', 2);
  }
  DSP2.pixel.textC('PRESS START', 160, 122, '#39ff88');
  // top score ribbon
  const hs = S.scores.get();
  if (hs.length) {
    DSP2.pixel.textC('TOP ' + String(hs[0].score).padStart(6, '0'), 160, 12, '#ffe600');
  }
}

function drawGame(c, S) {
  const st = S.state;
  drawWorld(c, st);
  drawShip(c, st);
  DSP2.fx.drawParts(c);
  drawHUD(c, st);
}

function drawPause(c, S) {
  drawGame(c, S);
  c.fillStyle = 'rgba(2,1,10,0.72)';
  c.fillRect(0, 0, 320, 180);
  DSP2.pixel.textC('PAUSED', 160, 74, '#ffe600', 3);
  DSP2.pixel.textC('P TO RESUME', 160, 100, '#21e6ff');
}

function drawGameOver(c, S) {
  drawWorld(c, S.state);
  DSP2.fx.drawParts(c);
  c.fillStyle = 'rgba(5,1,15,0.86)';
  c.fillRect(0, 0, 320, 180);
  DSP2.pixel.rectOutline(46, 26, 228, 128, '#ff2bd6');
  c.fillStyle = 'rgba(11,4,38,0.9)';
  c.fillRect(47, 27, 226, 126);

  if (S.over.reason === 'ALL MOONS CLEARED') {
    DSP2.pixel.textC('PILOT, THE SPACEPORT', 160, 36, '#39ff88', 2);
    DSP2.pixel.textC('OWES YOU A DRINK', 160, 50, '#39ff88', 2);
  } else {
    DSP2.pixel.textC('GAME OVER', 160, 38, '#ff3355', 3);
    DSP2.pixel.textC(S.over.reason, 160, 58, '#8a94b8');
  }
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
  id: 'lander',
  title: 'LUNAR LIFTER',
  stars: 80,
  bootLines: [
    'DSP BIOS v5.0 · CABINET 01',
    'MOON DESCENT SYSTEMS OK',
    'GRAVITY COMP OK · FUEL MANIFEST OK',
    'THROTTLE LINK ESTABLISHED',
  ],
  loadTime: 0.9,
  bootLineTime: 0.3,
  music: MUSIC,
  buttons: [
    { action: 'left', label: '◄' },
    { action: 'up', label: '▲' },
    { action: 'down', label: '▼', cls: 'fire' },
    { action: 'right', label: '►' },
  ],
  newGame: newGame,
  newAttract: () => ({ x: 160, y: 60 }),
  updateAttract() {},
  update: update,
  render: function (S, c) {
    const ctx = c;
    if (S.st === 'BOOT') { drawBoot(ctx, S); return; }
    if (S.st === 'ATTRACT') { drawAttract(ctx, S); return; }
    if (S.st === 'GAMEOVER') { drawGameOver(ctx, S); return; }
    if (S.st === 'PAUSE') { drawPause(ctx, S); return; }
    drawGame(ctx, S);
  },
});

})();
