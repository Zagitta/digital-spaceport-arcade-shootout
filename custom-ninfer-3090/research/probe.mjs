// Probe: connect directly to a page target's CDP websocket. Zero deps.
import { CDP } from './cdpclient.mjs';
import { execSync } from 'child_process';

const browser = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json/version').toString());
const all = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
const pages = all.filter(t => t.type === 'page');
console.log('browser', browser.Browser, '| page targets:', pages.length);
// pick a page (prefer about:blank)
let page = pages.find(p => p.url === 'about:blank') || pages[pages.length-1];
if (!page) { console.log('no page target; creating one'); process.exit(2); }
console.log('using page', page.id, page.url);

const c = new CDP(page.webSocketDebuggerUrl);
await c.connect();
await c.send('Page.enable');
await c.send('Runtime.enable');
await c.send('Log.enable');
console.log('CDP attached OK');

// navigate
const nav = await c.send('Page.navigate', { url: 'http://127.0.0.1:8888/' });
await new Promise(r => setTimeout(r, 2500));
const title = await c.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
console.log('title =>', title.result.value);
const bodyLen = await c.send('Runtime.evaluate', { expression: 'document.body.innerText.length', returnByValue: true });
console.log('body text length =>', bodyLen.result.value);

// screenshot to /tmp
const shot = await c.send('Page.captureScreenshot', { format: 'png' });
import('fs').then(fs => {
  fs.writeFileSync('/tmp/probe_shot.png', Buffer.from(shot.data, 'base64'));
  console.log('screenshot saved /tmp/probe_shot.png', Math.round(shot.data.length/1024) + 'KB');
  console.log('PROBE OK');
  c.close();
  process.exit(0);
});
