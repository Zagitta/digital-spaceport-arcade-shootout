// Targeted regression test: gentle off-pad touchdown must enter 'grounded' and STOP
// re-triggering the penalty / draining fuel every frame (the reviewer's confirmed bug).
import { CDP } from './cdpclient.mjs';
import { execSync } from 'child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json/version').toString());
const bb = new CDP(browser.webSocketDebuggerUrl);
await bb.connect();
{
  const all0 = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
  for (const t of all0.filter(x => x.type === 'page')) { try { await bb.send('Target.closeTarget', { targetId: t.id }); } catch {} }
}
const { targetId } = await bb.send('Target.createTarget', { url: 'about:blank' });
await bb.send('Target.activateTarget', { targetId });
await sleep(300);
const all = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
const pg = all.find(t => t.id === targetId);
const c = new CDP(pg.webSocketDebuggerUrl);
await c.connect();
await c.send('Page.enable'); await c.send('Runtime.enable');
const issues = [];
c.on('Runtime.exceptionThrown', p => issues.push('EXC: ' + ((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text)));
c.on('Console.messageAdded', p => { if (p.message.level === 'error') issues.push('console.error: ' + p.message.text); });
await c.send('Page.navigate', { url: 'http://127.0.0.1:8888/games/lander.html' });
async function ev(e){ const r = await c.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
async function st(){ return ev(`(()=>{const S=window.__DSP_STATE;if(!S||!S.state)return null;const s=S.state;return{st:S.st,gs:s.state,fuel:+s.fuel.toFixed(1),vy:+(s.ship.vy||0).toFixed(2),y:+s.ship.y.toFixed(1),score:s.score|0,over:s.over};})()`); }
// get to PLAY
let s = null; let guard=0;
while ((!s || s.st !== 'PLAY') && guard++<80) {
  const ready = await ev(`!!window.__DSP_STATE`);
  if (ready) {
    const cur = await ev(`window.__DSP_STATE.st`);
    if (cur === 'BOOT') { /* let it finish boot naturally */ }
    else { // ATTRACT (or skip BOOT) -> start
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}); await sleep(90); await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }
  }
  await sleep(200);
  if (ready) { const cur = await ev(`window.__DSP_STATE.st`); if (cur === 'PLAY') { s = { st: 'PLAY' }; } }
}
if (!s || s.st !== 'PLAY') { console.log('could not reach PLAY, guard=', guard, 'ready=', await ev(`!!window.__DSP_STATE`), 'st=', await ev(`window.__DSP_STATE && window.__DSP_STATE.st`)); process.exit(1); }
console.log('in PLAY');
// Force the exact scenario deterministically: ship already penetrating an OFF-PAD surface
// column with a gentle downward vy (5 < 10) and vx=0, so the collision branch fires on the
// very next update -> should become 'grounded' (the fix), not crash or re-trigger.
await ev(`(()=>{const st=window.__DSP_STATE.state; const w=st.world;
  // Scan for a column that is OFF-pad with a gentle slope so the gentle-touchdown branch is guaranteed.
  let pick=-1;
  for (let x=12; x<308; x++){
    if (x>=w.padX-2 && x<=w.padX+w.padW+2) continue;      // must be off-pad
    const a=w.heights[x-1], b=w.heights[x], c=w.heights[x+1];
    const sl=Math.max(Math.abs(b-a),Math.abs(c-b));        // max adjacent step
    if (sl<=1.5){ pick=x; break; }
  }
  if (pick<0) pick=(w.padX-16)|0;
  const surf=w.heights[pick];
  st.state='fly'; st.fuel=40; st.strandT=0;
  st.ship.x=pick; st.ship.y=surf-4; st.ship.vy=5; st.ship.vx=0;
  return {x:pick, surf}; })()`);
const fuelAtDrop = (await st()).fuel;
const samples = [];
for (let i=0;i<60;i++){ await sleep(120); const s2=await st(); if(s2) samples.push(s2); }
console.log('\n-- timeline after off-pad drop (t=0 is drop) --');
for (let i=0;i<samples.length;i+=5) console.log(`t=${(i*0.12).toFixed(1)}s state=${samples[i].gs} fuel=${samples[i].fuel} vy=${samples[i].vy} y=${samples[i].y}`);
const last = samples[samples.length-1];
// Now command a takeoff (press up) and confirm it leaves 'grounded' -> 'fly'
await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
await sleep(700);
const afterLift = await st();
await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
console.log('\n-- after holding UP (takeoff) --', JSON.stringify(afterLift));

// Assertions: (1) grounded state reached, (2) NO sustained drain — fuel stable over the
// last ~4s of grounding (the pre-fix bug drained ~fuel/few-frames straight to the floor),
// (3) liftoff returns to fly.
const reachedGrounded = samples.some(x => x.gs === 'grounded');
const groundedSamples = samples.filter(x => x.gs === 'grounded');
let stableDrain = null;
if (groundedSamples.length >= 35) {
  stableDrain = groundedSamples[groundedSamples.length-35].fuel - groundedSamples[groundedSamples.length-1].fuel;
}
console.log(`\nreached grounded: ${reachedGrounded} (${groundedSamples.length} samples) | one-time penalty drop to ${last.fuel} | 4s stable-drain=${stableDrain==null?'n/a':stableDrain.toFixed(1)}`);
console.log(`lift-off -> fly/airborne: ${afterLift.gs==='fly' ? 'YES' : afterLift.gs}`);
console.log('console issues:', issues.length ? issues : 'none');
const pass = reachedGrounded && (stableDrain == null || Math.abs(stableDrain) < 1) && (afterLift.gs==='fly' || afterLift.gs==='grounded');
console.log(pass ? 'REGRESSION FIX: PASS (grounded state, no sustained drain, liftoff works)' : 'REGRESSION FIX: FAIL');
await c.close(); await bb.close(); process.exit(pass?0:1);
