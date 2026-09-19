/* ============================================================
   DIGITAL SPACEPORT ARCADE — landing page
   - animated starfield on #bgfx (behind the CSS grid/sun)
   - live TOP SCORE readouts from localStorage (same keys games use)
   - coin SFX on card hover (after first user gesture)
   - startup chime on first click
   Vanilla JS only.
   ============================================================ */
(function () {
'use strict';

var GAMES = [
  { id: 'lander',   hsKey: 'dsp_hs_lander',   label: 'INSERT COIN' },
  { id: 'invaders', hsKey: 'dsp_hs_invaders', label: 'INSERT COIN' },
  { id: 'runner',   hsKey: 'dsp_hs_runner',   label: 'INSERT COIN' },
];

/* ---------- tiny WebAudio blips (no dspcore dependency) ---------- */
var actx = null, master = null, unlocked = false;
function audioReady() {
  if (actx) return actx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = 0.4;
  master.connect(actx.destination);
  return actx;
}
function note(type, freq, when, dur, vol, slideTo) {
  var c = audioReady(); if (!c) return;
  var o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, when);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(master);
  o.start(when); o.stop(when + dur + 0.02);
}
function sfxCoin() {
  if (!actx) return;
  var t = actx.currentTime;
  note('square', 988, t, 0.07, 0.25);
  note('square', 1319, t + 0.08, 0.22, 0.25);
}
function sfxStartup() {
  if (!actx) return;
  var t = actx.currentTime;
  [392, 523, 659, 784, 1046].forEach(function (f, i) { note('square', f, t + i * 0.06, 0.09, 0.24); });
}
window.addEventListener('pointerdown', function () {
  if (unlocked) return;
  unlocked = true;
  try { audioReady(); if (actx && actx.state === 'suspended') actx.resume(); sfxStartup(); } catch (e) {}
}, { once: false });

/* ---------- starfield ---------- */
var cv = document.getElementById('bgfx');
if (cv && cv.getContext) {
  var ctx = cv.getContext('2d');
  var stars = [];
  var STARN = 90;
  function resize() {
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    stars = [];
    for (var i = 0; i < STARN; i++) {
      stars.push({
        x: Math.random() * cv.width,
        y: Math.random() * cv.height,
        z: Math.random(),
        s: Math.random() < 0.15 ? 2 : 1,
      });
    }
  }
  window.addEventListener('resize', resize);
  resize();

  var parX = 0, parY = 0, tx = 0, ty = 0;
  window.addEventListener('mousemove', function (e) {
    tx = (e.clientX / window.innerWidth - 0.5) * 14;
    ty = (e.clientY / window.innerHeight - 0.5) * 8;
  });

  function drawStarfield() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parX += (tx - parX) * 0.04;
    parY += (ty - parY) * 0.04;
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      st.y += 0.05 + st.z * 0.35;
      if (st.y > cv.height) { st.y = -2; st.x = Math.random() * cv.width; }
      var tw = 0.5 + 0.5 * Math.sin(performance.now() / 400 + st.x);
      ctx.fillStyle = st.z > 0.8 ? 'rgba(255,215,245,' + (0.4 + 0.5 * tw) + ')'
                                  : 'rgba(190,230,255,' + (0.25 + 0.45 * tw) + ')';
      var px = st.x - parX * st.z;
      var py = st.y - parY * st.z;
      ctx.fillRect(px | 0, py | 0, st.s, st.s);
    }
    requestAnimationFrame(drawStarfield);
  }
  requestAnimationFrame(drawStarfield);
}

/* ---------- live top-score readouts ---------- */
function pad(n) { var s = String(Math.max(0, n | 0)); while (s.length < 5) s = '0' + s; return s; }
function refreshScores() {
  for (var i = 0; i < GAMES.length; i++) {
    var el = document.getElementById('top-' + GAMES[i].id);
    if (!el) continue;
    var top = 0;
    try {
      var raw = localStorage.getItem(GAMES[i].hsKey);
      if (raw) {
        var list = JSON.parse(raw);
        if (list && list.length) top = list[0].score | 0;
      }
    } catch (e) { top = 0; }
    el.textContent = top > 0 ? pad(top) : 'NO DATA';
    if (top > 0) {
      var coin = document.getElementById('coin-' + GAMES[i].id);
      if (coin) coin.textContent = 'CABINET HOT';
    }
  }
}
refreshScores();
window.addEventListener('storage', refreshScores);
setInterval(refreshScores, 3000);
if (document.addEventListener) {
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshScores();
  });
}

/* ---------- hover coin blips (after first gesture) ---------- */
var cards = document.querySelectorAll('.card');
for (var c = 0; c < cards.length; c++) {
  (function (card) {
    var armed = false;
    card.addEventListener('pointerenter', function () {
      if (!unlocked) return;
      if (armed) return; armed = true;
      setTimeout(function () { armed = false; }, 400);
      sfxCoin();
    });
  })(cards[c]);
}
})();
