// Diagnose a game page: load, sample __DSP_STATE over time, capture all console/runtime errors.
import { CDP } from './cdpclient.mjs';
import { execSync } from 'child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const page = process.argv[2] || '/games/invaders.html';
const browser = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json/version').toString());
const bb = new CDP(browser.webSocketDebuggerUrl);
await bb.connect();
await bb.send('Target.createTarget', { url: 'about:blank' });
await sleep(400);
const all = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
const pages = all.filter(t => t.type === 'page' && t.url === 'about:blank');
const c = new CDP(pages[pages.length-1].webSocketDebuggerUrl);
await c.connect();
await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Console.enable');
const issues = [];
c.on('Runtime.exceptionThrown', p => issues.push('EXC: ' + ((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text)));
c.on('Runtime.consoleAPICalled', p => { const t = (p.args||[]).map(a=>a.value ?? a.description ?? '').join(' '); if(p.type==='error'||p.type==='warning') issues.push(p.type+': '+t); });
c.on('Console.messageAdded', p => issues.push('console.'+p.message.level+': '+p.message.text));
c.on('Log.entryAdded', p => { if(p.entry.level==='error') issues.push('log.error: '+p.entry.text); });

await c.send('Page.navigate', { url: 'http://127.0.0.1:8888' + page });
console.log('loaded', page);
async function st(){ const r = await c.send('Runtime.evaluate',{expression:`(()=>{const S=window.__DSP_STATE;return S?{st:S.st,bootLine:S.bootLine,loadT:+(S.loadT||0).toFixed(2),bootT:+(S.bootT||0).toFixed(2),demo:!!S.demo,specLines:(S.spec&&S.spec.bootLines?S.spec.bootLines.length:-1),loadTime:S.spec&&S.spec.loadTime}:{none:true}})()`,returnByValue:true}); return r.result.value; }
for (let i=0;i<14;i++){ await sleep(500); const s=await st(); console.log(`t=${(i+0.5).toFixed(1)}s`, JSON.stringify(s)); if(s && s.st==='ATTRACT'){ console.log('reached ATTRACT'); break; } }
// now press Enter to try to start, sample more
const KEY={Enter:{key:'Enter',code:'Enter',vk:13}};
async function press(k){const d=KEY[k];await c.send('Input.dispatchKeyEvent',{type:'keyDown',...d});await sleep(90);await c.send('Input.dispatchKeyEvent',{type:'keyUp',...d});}
await press('Enter');
for (let i=0;i<8;i++){ await sleep(400); const s=await st(); console.log(`postEnter t=${(i+0.4).toFixed(1)}s`, JSON.stringify(s)); if(s&&s.st==='PLAY'){console.log('reached PLAY');break;} }
console.log('\n== issues captured: ' + issues.length + ' ==');
for (const i of issues) console.log('  '+i.slice(0,300));
await c.close(); await bb.close(); process.exit(0);
