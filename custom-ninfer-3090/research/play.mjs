/*
 * CDP playtest harness — drives the local headless Chromium over CDP (zero deps).
 * Usage: node play.mjs <page-path> <game-id>
 *   e.g.  node play.mjs /games/lander.html lander
 *
 * Phases:
 *   1. navigate + capture console errors/exceptions
 *   2. BOOT -> ATTRACT (auto, or Enter to skip)
 *   3. press Enter -> PLAY; real key input (movement, fire, pause, mute)
 *   4. gameplay ~8-12s with screenshots + canvas pixel extraction
 *   5. force game-over via the core's over-flag (exposed state) or natural end
 *   6. name entry -> accept -> ATTRACT
 *   7. reload -> verify high scores persist (localStorage + in-page table)
 *   8. report: console errors (must be 0), state transitions, canvas stats
 */
import { CDP } from './cdpclient.mjs';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';

const [pagePath, gameId] = process.argv.slice(2);
if (!pagePath || !gameId) { console.error('usage: node play.mjs <page-path> <game-id>'); process.exit(2); }
const OUT = `validation/${gameId}`;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8888';

const KEY = {
  Enter:    { key: 'Enter',     code: 'Enter',     vk: 13 },
  Space:    { key: ' ',         code: 'Space',     vk: 32 },
  ArrowLeft:{ key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowUp:  { key: 'ArrowUp',   code: 'ArrowUp',   vk: 38 },
  ArrowRight:{ key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  ArrowDown:{ key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  KeyP:     { key: 'p',         code: 'KeyP',      vk: 80 },
  KeyM:     { key: 'm',         code: 'KeyM',      vk: 77 },
};

let c = null;      // page-level CDP
const consoleIssues = [];   // {kind, text}
const report = { transitions: [], shots: [], errors: 0, asserts: [] };

function note(msg) { console.log('  ' + msg); }
function assert(name, ok, extra) {
  report.asserts.push({ name, ok, extra });
  console.log((ok ? '  ok  ' : '  FAIL ') + name + (extra !== undefined ? '  [' + extra + ']' : ''));
}

async function ev(expression) {
  const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  return r.result.value;
}
async function state() {
  return ev(`(() => {
    const S = window.__DSP_STATE;
    if (!S) return null;
    return {
      st: S.st, score: S.state ? (S.state.score|0) : null,
      lives: S.state && S.state.lives != null ? S.state.lives : null,
      stage: S.state && S.state.stageIdx != null ? S.state.stageIdx + 1 : null,
      fuel: S.state && S.state.fuel != null ? Math.round(S.state.fuel) : null,
      speed: S.state && S.state.speed != null ? Math.round(S.state.speed) : null,
      over: S.over ? S.over.reason : null,
      rank: S.rank, nameEnter: !!S.nameEnter,
      scores: S.scores ? S.scores.get().slice(0,3) : [],
    };
  })()`);
}
async function shot(name) {
  const p = await c.send('Page.captureScreenshot', { format: 'png' });
  const file = `${OUT}/${name}.png`;
  writeFileSync(file, Buffer.from(p.data, 'base64'));
  report.shots.push(file);
  note('screenshot ' + name + '.png');
  // raw canvas pixels for analysis
  const dataUrl = await ev(`document.getElementById('game').toDataURL('image/png')`);
  const b64 = dataUrl.split(',')[1];
  writeFileSync(`${OUT}/${name}_canvas.png`, Buffer.from(b64, 'base64'));
  return dataUrl;
}
function keyDown(k) { const d = KEY[k]; return c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...d }); }
function keyUp(k)   { const d = KEY[k]; return c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...d }); }
async function press(k) { await keyDown(k); await sleep(90); await keyUp(k); }
async function hold(k, ms) { await keyDown(k); await sleep(ms); await keyUp(k); }

async function waitState(pred, timeoutMs, label) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    const s = await state().catch(() => null);
    if (s && pred(s)) { if (label) note(label + ' reached'); return s; }
    last = s;
    await sleep(120);
  }
  assert('timeout: ' + label, false, 'last=' + JSON.stringify(last));
  return last;
}

/* ---- attach ---- */
const browser = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json/version').toString());
{
  const b = new CDP(browser.webSocketDebuggerUrl);
  await b.connect();
  // Close all sibling page targets so our fresh tab is the ONLY, foreground/active tab.
  // (Background tabs get requestAnimationFrame throttled by Chromium, which stalls
  //  the fixed-timestep game loop -> false "stuck in BOOT" failures.)
  const all0 = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
  for (const t of all0.filter(x => x.type === 'page')) { try { await b.send('Target.closeTarget', { targetId: t.id }); } catch {} }
  await sleep(250);
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  await b.send('Target.activateTarget', { targetId });
  await sleep(400);
  const all = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
  const pg = all.find(t => t.id === targetId) || all.filter(t => t.type === 'page')[0];
  c = new CDP(pg.webSocketDebuggerUrl);
  await c.connect();
  await b.close();
}
await c.send('Page.enable');
await c.send('Runtime.enable');
await c.send('Log.enable');
await c.send('Console.enable');

c.on('Runtime.exceptionThrown', p => consoleIssues.push({ kind: 'exception', text: (p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text }));
c.on('Console.messageAdded', p => { if (p.message.level === 'error' || p.message.level === 'warning') consoleIssues.push({ kind: 'console:' + p.message.level, text: p.message.text }); });
c.on('Log.entryAdded', p => { if (p.entry.level === 'error') consoleIssues.push({ kind: 'log:error', text: p.entry.text }); });

/* ---- run ---- */
console.log(`== playtest ${gameId} (${pagePath}) ==`);
await c.send('Page.navigate', { url: BASE + pagePath });
await sleep(800);

// Phase 2: boot -> attract (Enter skips boot early)
const s0 = await state().catch(() => null);
note('initial state: ' + (s0 ? s0.st : 'n/a'));
if (s0 && s0.st === 'BOOT') {
  await press('Enter');           // skip boot
}
await waitState(s => s && s.st === 'ATTRACT', 8000, 'ATTRACT');
await sleep(700);
await shot('02_attract');

// Phase 3: start
await press('Enter');
await waitState(s => s && s.st === 'PLAY', 4000, 'PLAY');
await shot('03_play_start');

// Phase 4: gameplay — movement + fire pattern
if (gameId === 'lander') {
  await hold('ArrowLeft', 350);
  await sleep(200);
  await hold('ArrowUp', 300);     // boost
  await hold('ArrowRight', 400);
  await hold('ArrowUp', 250);
  await sleep(500);
  await shot('04_play_flying');
  // pause + resume + mute
  await press('KeyP');
  await sleep(400);
  const sp = await state();
  assert('pause works', sp && sp.st === 'PAUSE', sp && sp.st);
  await shot('05_paused');
  await press('KeyP');
  await waitState(s => s && s.st === 'PLAY', 3000, 'resume');
  await press('KeyM');
  await sleep(200);
  const muted = await ev(`window.DSP.audio.muted`);
  assert('mute toggles', muted === true, muted);
  await press('KeyM');
  await shot('06_play_late');
  // let it fall to a natural crash (no thrust) then ride to full game over
  const sOver = await waitState(s => s && s.st === 'GAMEOVER', 40000, 'GAMEOVER (natural)');
} else {
  // invaders / runner: move + fire for several seconds
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    const s = await state().catch(() => null);
    if (!s || s.st !== 'PLAY') break;
    if (Math.random() < 0.5) await hold(gameId === 'runner' ? 'ArrowLeft' : 'ArrowLeft', 160);
    else await hold(gameId === 'runner' ? 'ArrowRight' : 'ArrowRight', 160);
    if (Math.random() < 0.6) await press('Space');
    await sleep(120);
  }
  await shot('04_play_action');
  const mid = await state();
  assert('scored during play', mid && mid.score > 0, 'score=' + (mid && mid.score));
  // pause test
  await press('KeyP');
  await sleep(300);
  const sp = await state();
  assert('pause works', sp && sp.st === 'PAUSE', sp && sp.st);
  await press('KeyP');
  await waitState(s => s && s.st === 'PLAY', 3000, 'resume');
  // force game over through the core's over-flag (harness-controlled)
  await ev(`window.__DSP_STATE.state.over = 'VALIDATION TEST END'`);
  const sOver = await waitState(s => s && s.st === 'GAMEOVER', 5000, 'GAMEOVER');
}

await sleep(800);
await shot('07_gameover_table');
const sGo = await state();
assert('game over screen active', sGo && sGo.st === 'GAMEOVER');
assert('rank assigned (high score table)', sGo && sGo.rank >= 0, 'rank=' + (sGo && sGo.rank));
assert('top score recorded', sGo && sGo.scores && sGo.scores.length > 0, JSON.stringify(sGo && sGo.scores));

// Phase 6: name entry -> accept
if (sGo && sGo.nameEnter) {
  note('name entry active — pressing Enter to accept');
  await shot('08_name_entry');
  await press('Enter');
  await waitState(s => s && s.st === 'ATTRACT', 4000, 'back to ATTRACT after name');
} else {
  await press('Enter');
  await waitState(s => s && s.st === 'ATTRACT', 5000, 'back to ATTRACT');
}
await shot('09_attract_after');

// Phase 7: reload — persistence
const before = await ev(`JSON.parse(localStorage.getItem('dsp_hs_${gameId}')||'[]').map(x=>[x.name,x.score])`);
await c.send('Page.reload');
await sleep(1500);
await waitState(s => s && (s.st === 'ATTRACT' || s.st === 'BOOT'), 8000, 'reload attract');
const after = await ev(`JSON.parse(localStorage.getItem('dsp_hs_${gameId}')||'[]').map(x=>[x.name,x.score])`);
assert('high scores persist across reload', JSON.stringify(before) === JSON.stringify(after) && before.length > 0, JSON.stringify(after));
const tableAfter = await state();
assert('table visible after reload', tableAfter && tableAfter.scores && tableAfter.scores.length > 0, JSON.stringify(tableAfter && tableAfter.scores));

// DOM checks
const touchBtns = await ev(`document.querySelectorAll('#touch .tbtn').length`);
note('touch buttons: ' + touchBtns);
assert('touch controls present', touchBtns >= 3, touchBtns);
const canvasOk = await ev(`document.getElementById('game') && document.getElementById('game').width === 320`);
assert('game canvas 320px logical', !!canvasOk);

// summary
report.errors = consoleIssues.length;
console.log('== console issues: ' + consoleIssues.length + ' ==');
for (const i of consoleIssues) console.log('  [' + i.kind + '] ' + i.text.slice(0, 200));
console.log('== summary: shots=' + report.shots.length + ' asserts=' + report.asserts.length +
  ' failed=' + report.asserts.filter(a => !a.ok).length + ' ==');
consoleIssues.length === 0 && report.asserts.every(a => a.ok)
  ? console.log('RESULT: PASS') : console.log('RESULT: FAIL');
await c.close();
process.exit(0);
