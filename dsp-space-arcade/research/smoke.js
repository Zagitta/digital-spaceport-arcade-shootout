/* Node smoke-test harness for dspcore.js — stubs the minimal DOM, pumps frames. */
'use strict';
const fs = require('fs');
const path = require('path');

// ---- minimal DOM / browser stubs ----
function makeCtx2d() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, p) {
      if (p === 'imageSmoothingEnabled') return false;
      if (p === 'fillStyle' || p === 'strokeStyle' || p === 'globalAlpha') return t[p];
      if (p === 'canvas') return null;
      return noop;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeCanvas() {
  return {
    width: 0, height: 0,
    getContext: () => makeCtx2d(),
    addEventListener: () => {},
    appendChild: () => {},
    innerHTML: '',
    style: { cssText: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 180 }),
  };
}
const elements = {};
global.window = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
global.document = {
  hidden: false,
  addEventListener: () => {},
  createElement: () => makeCanvas(),
  getElementById: (id) => { if (!elements[id]) elements[id] = makeCanvas(); return elements[id]; },
};
let __fakeNow = 0;
global.performance = { now: () => __fakeNow };
global.requestAnimationFrame = (cb) => { global.__raf = cb; return 1; };

// AudioContext stub
class FakeOsc {
  start() {} stop() {} connect() {}
  set frequency(_) {} get frequency() { return { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
}
class FakeGain {
  set gain(_) {} get gain() { return { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; }
  connect() {}
}
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
  createOscillator() { const o = new FakeOsc(); o.type = 'square'; o.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; return o; }
  createGain() { return new FakeGain(); }
  createBuffer() { return { getChannelData: () => new Float32Array(64) }; }
  createBufferSource() { return { buffer: null, start() {}, stop() {}, connect() {} }; }
  createBiquadFilter() { return { type: '', frequency: { value: 440 }, connect() {} }; }
  resume() { this.state = 'running'; }
  suspend() { this.state = 'suspended'; }
}
global.window.AudioContext = FakeCtx;
global.AudioContext = FakeCtx;

// ---- load the core ----
const core = fs.readFileSync(path.join(__dirname, '..', 'js', 'common', 'dspcore.js'), 'utf8');
eval(core);

// ---- exercise it ----
const A = global.DSP;
let fails = 0;
function check(name, cond) {
  if (cond) console.log('  ok  ' + name);
  else { console.log('  FAIL ' + name); fails++; }
}

console.log('== core loaded ==');
check('DSP namespace', !!A && !!A.pixel && !!A.audio && !!A.input && !!A.fx && typeof A.startGame === 'function');

// font glyphs
A.pixel.init(elements['game'] = makeCanvas());
check('glyphs built', !!A.pixel.text);
A.pixel.text('HELLO WORLD 123', 10, 10, '#fff');
A.pixel.textC('TITLE', 160, 40, '#ff00ff');
A.pixel.rect(0, 0, 10, 10, '#f00');
A.pixel.rectOutline(0, 0, 20, 10, '#0f0');

// audio
A.audio.setMuted(true);
A.audio.setMuted(false);
A.audio.sfx('coin'); A.audio.sfx('shoot'); A.audio.sfx('boom'); A.audio.sfx('land');
A.audio.sfx('powerup'); A.audio.sfx('start'); A.audio.sfx('extra'); A.audio.sfx('ufo'); A.audio.sfx('hurt');
check('sfx no-throw', true);
const music = {
  bpm: 120, spb: 4, total: 16,
  tracks: [
    { wave: 'square', gain: 0.2, pattern: A.P(16, [[67,2,0],[null,2,2],[72,2,4],[64,2,6],[67,2,8],[74,2,10],[72,2,12],[null,2,14]]) },
    { wave: 'triangle', gain: 0.3, pattern: A.P(16, [[55,2,0],[53,2,2],[50,2,4],[55,2,6],[52,2,8],[53,2,10],[55,2,12],[57,2,14]]) },
  ],
};
A.audio.startTune(music);
check('tune started', !!A.audio.seq);
A.audio.stopTune();
check('tune stopped', A.audio.seq === null);

// scores persistence
const sc = A.scores('testgame');
let r = sc.submit(1200); check('submit 1200 -> rank 0', r === 0);
r = sc.submit(500); check('submit 500 -> rank 1', r === 1);
r = sc.submit(2000); check('submit 2000 -> rank 0', r === 0);
r = sc.submit(10); check('submit 10 -> rank 3', r === 3);
sc.setName(0, 'bud'); check('name set', sc.get()[0].name === 'BUD');
const reloaded = A.scores('testgame');
check('persisted', reloaded.get().length === 4 && reloaded.get()[0].score === 2000 && reloaded.get()[0].name === 'BUD');
// fill to 8 and verify overflow
for (let i = 100; i < 100 + 20; i++) reloaded.submit(i);
check('capped at 8', reloaded.get().length === 8);

// input
A.input.init();
A.input.down['left'] = true;
check('pressed left', A.input.pressed('left'));
A.input.just['fire'] = true;
check('justPressed fire', A.input.justPressed('fire'));
A.input.endFrame();
check('just cleared', !A.input.justPressed('fire'));

// fx
A.fx.burst(50, 50, '#fff', 20);
check('particles spawned', A.fx.parts.length > 0);
A.fx.updateParts(0.5);
A.fx.shake(4, 0.3);
A.fx.flashScreen('#fff');
A.fx.updateParts(0.5);
check('shake decayed', A.fx.shakeT <= 0.3);

// ---- full game lifecycle with a toy game ----
const spec = {
  id: 'toy', stars: 20,
  bootLines: ['DSP BIOS v5', 'MEM OK', 'LOADING...'],
  loadTime: 0.05, bootLineTime: 0.02,
  music,
  buttons: [{ action: 'left', label: 'L' }, { action: 'fire', label: 'F' }],
  newGame: () => ({ score: 0, t: 0, over: null }),
  update(st, dt, inp, audio) {
    st.t += dt;
    if (inp.pressed('fire')) st.score += 10;
    if (st.t > 0.5) st.over = 'CRASH';
  },
  updateAttract(demo, dt) {},
  render(S, c) {
    A.pixel.clear('#000');
    if (S.state) A.pixel.text('SCORE ' + (S.state.score | 0), 4, 4);
  },
};
const S = A.startGame(spec);
check('starts in BOOT', S.st === 'BOOT');

function pump(frames, ms) {
  for (let i = 0; i < frames; i++) {
    __fakeNow += ms;
    const cb = global.__raf; global.__raf = null;
    cb(__fakeNow);
  }
}
pump(30, 40);
check('BOOT -> ATTRACT', S.st === 'ATTRACT', S.st);
// start via key
A.input.just['start'] = true;
pump(1, 34);
check('start -> PLAY', S.st === 'PLAY');
A.input.down['fire'] = true;
pump(10, 34);
check('scored', S.state.score >= 10);
pump(40, 34);
check('game over after 0.5s sim', S.st === 'GAMEOVER');
check('rank assigned', S.rank >= 0);
check('name entry triggered', S.nameEnter === true);
// enter name then accept
A.input.just['start'] = true;
pump(1, 34);
check('accepted name -> ATTRACT', S.st === 'ATTRACT');
const toyScores = A.scores('toy');
check('toy score persisted', toyScores.get().length >= 1);

console.log(fails === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
