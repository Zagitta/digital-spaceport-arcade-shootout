// Confirm rAF-throttle hypothesis: close ALL page targets, create+ACTIVATE one, watch bootT advance.
import { CDP } from './cdpclient.mjs';
import { execSync } from 'child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const page = process.argv[2] || '/games/invaders.html';

const browser = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json/version').toString());
const bb = new CDP(browser.webSocketDebuggerUrl);
await bb.connect();
// kill all existing page targets so our tab is the only/active one
{
  const all = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
  for (const t of all.filter(x => x.type === 'page')) {
    try { await bb.send('Target.closeTarget', { targetId: t.id }); } catch {}
  }
}
const { targetId } = await bb.send('Target.createTarget', { url: 'about:blank' });
await sleep(300);
await bb.send('Target.activateTarget', { targetId });
const all = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
const pg = all.find(t => t.id === targetId);
const c = new CDP(pg.webSocketDebuggerUrl);
await c.connect();
await c.send('Page.enable'); await c.send('Runtime.enable');
const issues = [];
c.on('Runtime.exceptionThrown', p => issues.push('EXC: ' + ((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text)));
c.on('Console.messageAdded', p => { if (p.message.level === 'error') issues.push('console.error: ' + p.message.text); });

await c.send('Page.navigate', { url: 'http://127.0.0.1:8888' + page });
console.log('loaded+activated', page);
async function st(){ const r = await c.send('Runtime.evaluate',{expression:`(()=>{const S=window.__DSP_STATE;return S?{st:S.st,bootT:+(S.bootT||0).toFixed(2),loadT:+(S.loadT||0).toFixed(2),attractT:+(S.attractT||0).toFixed(2),time:+(S.time||0).toFixed(1)}:{none:true}})()`,returnByValue:true}); return r.result.value; }
let rafOk = null;
for (let i=0;i<10;i++){ await sleep(400); const s=await st(); console.log(`t=${(i+0.4).toFixed(1)}s`, JSON.stringify(s));
  if (i===0) rafOk = await c.send('Runtime.evaluate',{expression:`new Promise(res=>{const t0=performance.now();requestAnimationFrame(()=>res(performance.now()-t0));})`,returnByValue:true,awaitPromise:true}).then(r=>r.result.value);
  if (s && s.st !== 'BOOT') { console.log('LEAVED BOOT'); break; } }
console.log('rAF frame delta ms =', rafOk == null ? 'NO FRAME FIRED' : rafOk.toFixed(0));
console.log('issues:', issues.length ? issues.slice(0,5) : 'none');
await c.close(); await bb.close(); process.exit(0);
