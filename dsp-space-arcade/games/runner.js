/* ============================================================
   GRID RUNNER — Digital Spaceport Arcade, Cabinet 03
   Synthwave lane runner: 3-lane neon highway converging to a
   horizon sun. Weave lanes (lerp), brake, boost on a meter,
   dodge oncoming traffic, grab data chips, chain near-misses,
   climb speed tiers every 1000 m. 3 lives → WRECKED.
   Uses DSP core (../js/common/dspcore.js).
   ============================================================ */
(function () {
'use strict';

const DSP2 = window.DSP;

/* ---------------- palette + sprites ---------------- */
const PAL = {
  W: '#ffffff', C: '#21e6ff', P: '#ff2bd6', Y: '#ffe600',
  O: '#ff8a00', R: '#ff3355', G: '#39ff88', V: '#9b5cff',
  D: '#1b2440', L: '#c3cdf0', B: '#3c4670',
};
// player car, rear view (wheels bottom)
const SPR_CAR = [
  '..CCCC..',
  '.CWWWWC.',
  'CWLLLLWC',
  'CWLRRLLC',
  'CWWWWWWC',
  '.B....B.',
];
// oncoming traffic, front view (headlights)
const SPR_TRF = [
  '..PPPP..',
  '.PWWWWP.',
  'PWYYYYWP',
  'PWLLLLWP',
  'PWWWWWWP',
  '.B....B.',
];
// data chip (diamond)
const SPR_CHIP = [
  '..Y..',
  '.YYY.',
  'YWYYW',
  '.YYY.',
  '..Y..',
];

/* ---------------- music: driving synthwave, 126 bpm ---------------- */
const MUSIC = {
  bpm: 126, spb: 4, total: 32,
  tracks: [
    // lead (A minor, i-VI-III-VII)
    { wave: 'sawtooth', gain: 0.13,
      pattern: DSP2.P(32, [
        [69,2,0],[null,2,2],[72,2,4],[76,2,6],
        [74,2,8],[72,2,10],[71,2,12],[null,2,14],
        [67,2,16],[null,2,18],[71,2,20],[74,2,22],
        [76,2,24],[74,2,26],[72,2,28],[69,2,30],
      ]) },
    // bass
    { wave: 'triangle', gain: 0.30,
      pattern: DSP2.P(32, [
        [45,2,0],[45,2,2],[43,2,4],[43,2,6],
        [40,2,8],[40,2,10],[47,2,12],[47,2,14],
        [45,2,16],[45,2,18],[43,2,20],[43,2,22],
        [40,2,24],[40,2,26],[47,2,28],[45,2,30],
      ]) },
    // hat
    { wave: 'noise', gain: 0.05, len: 0.35,
      pattern: DSP2.P(32, [[60,1,0],[null,1,1],[60,1,2],[null,1,3],[60,1,4],[null,1,5],[60,1,6],[null,1,7],
        [60,1,8],[null,1,9],[60,1,10],[null,1,11],[60,1,12],[null,1,13],[60,1,14],[null,1,15],
        [60,1,16],[null,1,17],[60,1,18],[null,1,19],[60,1,20],[null,1,21],[60,1,22],[null,1,23],
        [60,1,24],[null,1,25],[60,1,26],[null,1,27],[60,1,28],[null,1,29],[60,1,30],[null,1,31]]) },
  ],
};

/* ---------------- highway geometry ---------------- */
const HORIZON_Y = 52;          // vanishing point y
const VP_X = 160;              // vanishing point x
const ROAD_HALF_W = 118;       // half road width at screen bottom
const PLAYER_Y = 150;          // player car anchor y
const LANES = [-1, 0, 1];      // lane indices left/center/right

// perspective t: 0 = horizon, 1 = screen bottom
function persp(t) { return HORIZON_Y + (180 - HORIZON_Y) * t; }
// screen y -> perspective t
function tOf(y) { return (y - HORIZON_Y) / (180 - HORIZON_Y); }
// world lateral position (-1..1 across the road) at perspective t -> screen x
function roadX(lateral, t) {
  const half = ROAD_HALF_W * t;
  return VP_X + lateral * half;
}
// lane center lateral for a lane index
function laneLateral(lane) { return lane / 2; } // -0.5, 0, +0.5

/* ---------------- state factory ---------------- */
function newGame() {
  return {
    score: 0,
    dist: 0,               // meters travelled
    tier: 1,
    speed: 120,            // km/h (display)
    baseSpeed: 120,        // auto-ramps with distance
    boost: 100,            // boost meter 0..100
    boosting: false,
    braking: false,
    lives: 3,
    lane: 0,               // target lane index
    carLat: 0,             // eased lateral position (matches laneLateral space)
    protect: 0,            // spawn-protection timer after crash
    traffic: [],           // {lane, t, passed, kind}
    chips: [],             // {lane, t, taken}
    pops: [],              // floating text {x,y,txt,t,color}
    nearStreak: 0,
    spawnT: 1.2,           // countdown to next traffic spawn
    chipT: 2.5,            // countdown to next chip cluster
    gridScroll: 0,         // horizontal grid line phase
    msg: '', msgT: 0,
    over: null,
  };
}

/* ---------------- update ---------------- */
function update(st, dt, inp, audio) {
  if (st.msgT > 0) st.msgT -= dt;
  if (st.protect > 0) st.protect -= dt;

  /* --- throttle: brake / boost --- */
  st.braking = inp.pressed('down');
  st.boosting = (inp.pressed('up') || inp.pressed('fire')) && st.boost > 0;
  if (st.boosting) {
    st.boost = Math.max(0, st.boost - 34 * dt);
  } else {
    st.boost = Math.min(100, st.boost + 16 * dt);
  }

  // speed ramps with distance; brake eases down, boost pushes up
  st.baseSpeed = 120 + st.dist * 0.012;          // gentle ramp
  let target = st.baseSpeed;
  if (st.braking) target *= 0.55;
  if (st.boosting) target += 70;
  st.speed += (target - st.speed) * Math.min(1, 5 * dt);
  st.speed = Math.max(60, st.speed);

  // distance accrual (speed in "m/s" ~ kmh/3.6, scaled for arcade feel)
  const mps = st.speed / 3.6 * 1.6;
  st.dist += mps * dt;
  st.score += mps * dt * 0.1;                     // +1 per 10 m

  // speed tier every 1000 m
  const newTier = 1 + Math.floor(st.dist / 1000);
  if (newTier !== st.tier) {
    st.tier = newTier;
    st.score += 100;
    st.msg = 'TIER ' + st.tier + ' · +100';
    st.msgT = 1.6;
    audio.sfx('tier');
    audio.sfx('tick');
    DSP2.fx.flashScreen('#21e6ff', 0.35);
    DSP2.audio.setBpm(Math.min(168, 126 + (st.tier - 1) * 6));
  }

  // grid scroll phase proportional to speed
  st.gridScroll = (st.gridScroll + st.speed * dt * 0.02) % 1;

  /* --- lane change (left/right edge-triggered) --- */
  if (inp.justPressed('left') && st.lane > -1) { st.lane--; audio.sfx('ui'); }
  if (inp.justPressed('right') && st.lane < 1) { st.lane++; audio.sfx('ui'); }
  // smooth lerp of car toward lane center
  const want = laneLateral(st.lane);
  st.carLat += (want - st.carLat) * Math.min(1, 10 * dt);

  /* --- spawn oncoming traffic --- */
  st.spawnT -= dt;
  if (st.spawnT <= 0) {
    const cadence = Math.max(0.45, 1.5 - st.tier * 0.12);
    st.spawnT = cadence * (0.7 + Math.random() * 0.6);
    const lane = (Math.random() * 3) | 0;
    st.traffic.push({ lane: lane, t: 0.02, passed: false, kind: Math.random() < 0.3 ? 'cone' : 'car' });
  }

  /* --- spawn data-chip clusters --- */
  st.chipT -= dt;
  if (st.chipT <= 0) {
    st.chipT = 2.2 + Math.random() * 2.5;
    const lane = (Math.random() * 3) | 0;
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      st.chips.push({ lane: lane, t: 0.02 + i * 0.06, taken: false });
    }
  }

  /* --- move traffic & chips toward player --- */
  const approach = 0.55 + st.speed / 900;   // faster than grid
  for (let i = st.traffic.length - 1; i >= 0; i--) {
    const tr = st.traffic[i];
    tr.t += approach * dt;
    // collision: same lane, overlapping the player's y band (t≈0.74-0.80)
    if (tr.lane === st.lane && tr.t > 0.73 && tr.t < 0.82 && st.protect <= 0) {
      // crash!
      st.traffic.splice(i, 1);
      st.lives--;
      st.nearStreak = 0;
      st.protect = 1.5;
      st.msg = st.lives > 0 ? 'CRASH!' : 'WRECKED';
      st.msgT = 1.4;
      audio.sfx('crash');
      audio.sfx('hurt');
      DSP2.fx.shake(6, 0.5);
      DSP2.fx.burst(roadX(st.carLat, tOf(PLAYER_Y)), PLAYER_Y, '#ff8a00', 30, 110);
      DSP2.fx.burst(roadX(st.carLat, tOf(PLAYER_Y)), PLAYER_Y, '#ffe600', 18, 90);
      DSP2.fx.flashScreen('#ff3355', 0.5);
      if (st.lives <= 0) { st.over = 'WRECKED'; return; }
      continue;
    }
    // near-miss: adjacent lane, passing through the player band without hitting
    if (!tr.passed && tr.t >= 0.78 && tr.lane !== st.lane) {
      const adj = Math.abs(tr.lane - st.lane) === 1;
      if (adj) {
        tr.passed = true;
        st.nearStreak++;
        const bonus = 25 * st.nearStreak;
        st.score += bonus;
        audio.sfx('coin');
        addPop(st, roadX(laneLateral(tr.lane), tOf(PLAYER_Y)), PLAYER_Y - 14,
          'NEAR MISS +' + bonus, '#21e6ff');
      } else {
        tr.passed = true;
      }
    }
    if (tr.t > 1.15) st.traffic.splice(i, 1);
  }

  for (let i = st.chips.length - 1; i >= 0; i--) {
    const ch = st.chips[i];
    ch.t += approach * dt;
    if (!ch.taken && ch.lane === st.lane && ch.t > 0.73 && ch.t < 0.82) {
      ch.taken = true;
      st.score += 50;
      audio.sfx('powerup');
      DSP2.fx.burst(roadX(laneLateral(ch.lane), tOf(PLAYER_Y)), PLAYER_Y, '#ffe600', 14, 70);
      addPop(st, roadX(laneLateral(ch.lane), tOf(PLAYER_Y)), PLAYER_Y - 14, '+50', '#ffe600');
      st.chips.splice(i, 1);
      continue;
    }
    if (ch.t > 1.15) st.chips.splice(i, 1);
  }

  /* --- floating text decay --- */
  for (let i = st.pops.length - 1; i >= 0; i--) {
    const p = st.pops[i];
    p.t -= dt;
    p.y -= 18 * dt;
    if (p.t <= 0) st.pops.splice(i, 1);
  }
}

function addPop(st, x, y, txt, color) {
  st.pops.push({ x: x, y: y, txt: txt, t: 1.0, color: color });
}

/* ---------------- rendering ---------------- */
function drawSky(c, S) {
  // banded sky above horizon
  DSP2.pixel.rect(0, 0, 320, HORIZON_Y, '#070313');
  DSP2.pixel.rect(0, 18, 320, 34, '#0a0520');
  // slatted synthwave sun centered on horizon
  const sunX = VP_X, sunY = HORIZON_Y, r = 26;
  c.fillStyle = '#ff2bd6';
  c.beginPath();
  c.arc(sunX, sunY, r, Math.PI, 0);
  c.closePath();
  c.fill();
  // horizontal slats cut into lower half of sun
  c.fillStyle = '#0a0520';
  for (let i = 0; i < 5; i++) {
    const sy = sunY + 2 + i * 4;
    c.fillRect(sunX - r, sy, r * 2, 2);
  }
  // sun glow ring
  c.strokeStyle = 'rgba(255,43,214,0.5)';
  c.lineWidth = 1;
  c.beginPath();
  c.arc(sunX, sunY, r + 3, Math.PI, 0);
  c.stroke();
  // stars
  DSP2.fx.drawStars(c, 0);
}

function drawGrid(c, st) {
  // ground fill below horizon
  c.fillStyle = '#0d0728';
  c.fillRect(0, HORIZON_Y, 320, 180 - HORIZON_Y);

  // vertical lane lines converging to vanishing point
  const dividers = [-1, -0.5, 0, 0.5, 1]; // road edges + lane dividers
  for (const d of dividers) {
    const isEdge = (d === -1 || d === 1);
    c.strokeStyle = isEdge ? '#ff2bd6' : 'rgba(33,230,255,0.55)';
    c.lineWidth = isEdge ? 2 : 1;
    c.beginPath();
    c.moveTo(VP_X, HORIZON_Y);
    c.lineTo(roadX(d, 1), 180);
    c.stroke();
  }

  // horizontal speed-lines scrolling toward viewer
  const rows = 14;
  for (let i = 0; i < rows; i++) {
    let tt = ((i + st.gridScroll) / rows) % 1;
    // ease so lines bunch near horizon (perspective)
    tt = tt * tt;
    const y = persp(tt);
    if (y < HORIZON_Y + 1) continue;
    const alpha = 0.15 + 0.5 * tt;
    c.strokeStyle = 'rgba(33,230,255,' + alpha.toFixed(2) + ')';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(roadX(-1, tt), y);
    c.lineTo(roadX(1, tt), y);
    c.stroke();
  }

  // side data-pylons
  for (let i = 0; i < 6; i++) {
    let tt = ((i + st.gridScroll * 0.5) / 6) % 1;
    tt = tt * tt;
    const y = persp(tt);
    if (y < HORIZON_Y + 4) continue;
    const s = 1 + (tt * 4) | 0;
    const lx = roadX(-1.18, tt), rx = roadX(1.18, tt);
    c.fillStyle = '#9b5cff';
    c.fillRect(lx - 1, y - s * 2, 2, s * 2);
    c.fillRect(rx - 1, y - s * 2, 2, s * 2);
    c.fillStyle = '#ffe600';
    c.fillRect(lx - 1, y - s * 2 - 1, 2, 1);
    c.fillRect(rx - 1, y - s * 2 - 1, 2, 1);
  }
}

function drawTraffic(c, st) {
  for (const tr of st.traffic) {
    const y = persp(tr.t);
    if (y < HORIZON_Y + 2) continue;
    const x = roadX(laneLateral(tr.lane), tr.t);
    const scale = Math.max(1, (tr.t * 3) | 0);
    if (tr.kind === 'cone') {
      // neon cone
      const w = 3 + scale * 2;
      c.fillStyle = '#ff8a00';
      c.fillRect(x - w / 2, y - w, w, w);
      c.fillStyle = '#ffe600';
      c.fillRect(x - w / 2, y - w / 2, w, 1);
    } else {
      const px = (x - 3 * scale) | 0, py = (y - 3 * scale) | 0;
      DSP2.pixel.drawSprite(SPR_TRF, PAL, px, py, scale);
    }
  }
}

function drawChips(c, st) {
  for (const ch of st.chips) {
    if (ch.taken) continue;
    const y = persp(ch.t);
    if (y < HORIZON_Y + 2) continue;
    const x = roadX(laneLateral(ch.lane), ch.t);
    const scale = Math.max(1, (ch.t * 2.5) | 0);
    const bob = ((performance.now() / 150) | 0) % 2;
    DSP2.pixel.drawSprite(SPR_CHIP, PAL, (x - 2 * scale) | 0, (y - 2 * scale + bob) | 0, scale);
  }
}

function drawPlayer(c, st) {
  // blink during spawn protection
  if (st.protect > 0 && ((performance.now() / 120) | 0) % 2) return;
  const x = roadX(st.carLat, tOf(PLAYER_Y));
  const px = (x - 3) | 0, py = (PLAYER_Y - 3) | 0;
  // boost flame
  if (st.boosting) {
    const f = ((performance.now() / 50) | 0) % 2;
    DSP2.pixel.rect(px + 1, py + 6 + f, 2, 3, '#ff8a00');
    DSP2.pixel.rect(px + 4, py + 6 + f, 2, 3, '#ffe600');
  }
  DSP2.pixel.drawSprite(SPR_CAR, PAL, px, py, 1);
}

function drawHUD(c, st) {
  // top bar
  c.fillStyle = 'rgba(5,1,15,0.7)';
  c.fillRect(0, 0, 320, 12);
  DSP2.pixel.text('SCORE ' + String(st.score | 0).padStart(6, '0'), 3, 3, '#ffe600');
  DSP2.pixel.text('TIER ' + st.tier, 118, 3, '#9b5cff');
  // life icons
  for (let i = 0; i < st.lives; i++) {
    DSP2.pixel.rect(150 + i * 8, 3, 2, 6, '#21e6ff');
    DSP2.pixel.rect(149 + i * 8, 5, 4, 2, '#21e6ff');
  }
  // second row: speed / dist / boost
  c.fillStyle = 'rgba(5,1,15,0.5)';
  c.fillRect(0, 12, 320, 10);
  const kmh = String(Math.round(st.speed)).padStart(3, '0');
  DSP2.pixel.text('SPD ' + kmh, 3, 14, st.boosting ? '#ff2bd6' : '#21e6ff');
  DSP2.pixel.text('DIST ' + String(st.dist | 0) + 'M', 60, 14, '#8a94b8');
  // boost meter
  DSP2.pixel.text('BST', 130, 14, '#8a94b8');
  DSP2.pixel.rect(152, 15, 50, 5, '#1b2440');
  DSP2.pixel.rect(153, 16, Math.floor(48 * (st.boost / 100)), 3, st.boost > 25 ? '#39ff88' : '#ff3355');
  // near-miss combo
  if (st.nearStreak > 1) {
    DSP2.pixel.text('COMBO x' + st.nearStreak, 214, 14, '#ff2bd6');
  }
  // message
  if (st.msgT > 0 && st.msg) {
    DSP2.pixel.textC(st.msg, 160, 60, '#ffe600', 2);
  }
  // floating pops
  for (const p of st.pops) {
    c.globalAlpha = Math.max(0, Math.min(1, p.t));
    DSP2.pixel.text(p.txt, (p.x - p.txt.length * 3) | 0, p.y | 0, p.color);
    c.globalAlpha = 1;
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
    DSP2.pixel.text('LOADING CABINET 03', 8, 14 + lines.length * 12 + 10, '#ff2bd6');
    DSP2.pixel.rect(8, 150, 300, 8, '#1b2440');
    DSP2.pixel.rect(9, 151, Math.floor(298 * p), 6, '#ff2bd6');
    DSP2.pixel.textC('PRESS ENTER TO SKIP', 160, 166, '#8a94b8');
  } else {
    if (((performance.now() / 300) | 0) % 2) {
      const last = lines[Math.min(S.bootLine, lines.length) - 1] || '';
      DSP2.pixel.text('_', 8 + (last.length + 1) * 6, 14 + S.bootLine * 12 - 2, '#39ff88');
    }
  }
}

function drawAttract(c, S) {
  c.fillStyle = '#05010f';
  c.fillRect(0, 0, 320, 180);
  drawSky(c, S);
  // demo: car weaves lanes automatically behind title card
  const demo = S.demo || { lane: 0, carLat: 0, gridScroll: 0 };
  const t = S.attractT;
  demo.lane = LANES[(((t * 0.7) | 0) % 3)];
  const want = laneLateral(demo.lane);
  demo.carLat += (want - demo.carLat) * 0.08;
  drawGrid(c, demo);
  // demo car
  const x = roadX(demo.carLat, tOf(PLAYER_Y));
  DSP2.pixel.drawSprite(SPR_CAR, PAL, (x - 3) | 0, (PLAYER_Y - 3) | 0, 1);

  // title card
  c.fillStyle = 'rgba(5,1,15,0.82)';
  c.fillRect(40, 40, 240, 74);
  DSP2.pixel.rectOutline(40, 40, 240, 74, '#ff2bd6', 1);
  DSP2.pixel.textC('GRID RUNNER', 160, 50, '#ff2bd6', 3);
  DSP2.pixel.textC('CABINET 03 · NEON HIGHWAY', 160, 76, '#21e6ff', 1);
  DSP2.pixel.textC('WEAVE THE GRID', 160, 92, '#8a94b8');
  DSP2.pixel.textC('OUTRUN THE TRAFFIC', 160, 102, '#8a94b8');

  if (((performance.now() / 450) | 0) % 2) {
    DSP2.pixel.textC('INSERT COIN', 160, 152, '#ffe600', 2);
  }
  DSP2.pixel.textC('PRESS START', 160, 122, '#39ff88');
  const hs = S.scores.get();
  if (hs.length) {
    DSP2.pixel.textC('TOP ' + String(hs[0].score).padStart(6, '0'), 160, 12, '#ffe600');
  }
}

function drawGame(c, S) {
  const st = S.state;
  drawSky(c, S);
  drawGrid(c, st);
  drawChips(c, st);
  drawTraffic(c, st);
  drawPlayer(c, st);
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
  const st = S.state;
  drawSky(c, S);
  drawGrid(c, st);
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

/* ---------------- attract demo ---------------- */
function newAttract() {
  return { lane: 0, carLat: 0, gridScroll: 0 };
}
function updateAttract(demo, dt, inp) {
  // weaving handled in drawAttract via time; keep grid phase fresh here too
  demo.gridScroll = (demo.gridScroll + 0.008) % 1;
}

/* ---------------- register ---------------- */
DSP2.startGame({
  id: 'runner',
  title: 'GRID RUNNER',
  stars: 90,
  bootLines: [
    'DSP BIOS v5.0 · CABINET 03',
    'HIGHWAY LINK ESTABLISHED',
    'GRID SCROLL OK · SUN SLATS OK',
    'TRAFFIC FEED ONLINE',
    'BOOST CELLS CHARGED',
  ],
  loadTime: 0.9,
  bootLineTime: 0.3,
  music: MUSIC,
  buttons: [
    { action: 'left', label: '◄' },
    { action: 'up', label: 'BOOST' },
    { action: 'down', label: 'BRAKE', cls: 'fire' },
    { action: 'right', label: '►' },
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
    drawGame(ctx, S);
  },
});

})();
