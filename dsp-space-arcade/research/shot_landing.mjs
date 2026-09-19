// Capture the landing page full viewport + a game-card hover state.
import { CDP } from './cdpclient.mjs';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync('../validation', { recursive: true });
const browser = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json/version').toString());
{
  const b = new CDP(browser.webSocketDebuggerUrl);
  await b.connect();
  await b.send('Target.createTarget', { url: 'about:blank' });
  await sleep(400);
  const all = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
  const pages = all.filter(t => t.type === 'page' && t.url === 'about:blank');
  const c = new CDP(pages[pages.length-1].webSocketDebuggerUrl);
  await c.connect();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Page.navigate', { url: 'http://127.0.0.1:8888/' });
  await sleep(3000); // let starfield/grid animate in
  const dims = await c.send('Runtime.evaluate', { expression: 'JSON.stringify({w:innerWidth,h:innerHeight,cards:document.querySelectorAll(".card").length,thumbs:Array.from(document.images).map(i=>i.complete&&i.naturalWidth>0),top:Array.from(document.querySelectorAll("[id^=top-]")).map(e=>e.id+":"+e.textContent),title:document.title})', returnByValue: true });
  console.log('landing:', dims.result.value);
  const p = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('../validation/landing.png', Buffer.from(p.data, 'base64'));
  console.log('saved validation/landing.png', Math.round(p.data.length/1024)+'KB');
  await c.close();
  await b.close();
}
process.exit(0);
