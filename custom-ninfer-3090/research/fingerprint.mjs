// Clean pixel fingerprint: for each image, report non-dark fraction + presence of each neon color.
// Avoids bash comma-quoting pitfalls by doing it all in JS via canvas.
import { CDP } from './cdpclient.mjs';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const NEON = {
  pink:   [255, 43, 214],
  cyan:   [33, 230, 255],
  green:  [57, 255, 136],
  orange: [255, 138, 0],
  yellow: [255, 230, 0],
  purple: [155, 92, 255],
};
const TOL = 60; // per-channel tolerance

async function fingerprint(file) {
  // load PNG into canvas via a headless page (CDP) to read pixels
  const b64 = readFileSync(file).toString('base64');
  const expr = `
    (async () => {
      const img = new Image();
      img.src = "data:image/png;base64,${b64}";
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const neon = ${JSON.stringify(NEON)};
      const TOL = ${TOL};
      let nonDark = 0, total = d.length / 4;
      const counts = {};
      for (const k in neon) counts[k] = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        const lum = 0.2126*r + 0.7152*g + 0.0722*b;
        if (lum > 24) nonDark++;
        for (const k in neon) {
          const [nr, ng, nb] = neon[k];
          if (Math.abs(r-nr) < TOL && Math.abs(g-ng) < TOL && Math.abs(b-nb) < TOL) counts[k]++;
        }
      }
      return { w: c.width, h: c.height, nonDarkPct: Math.round(100*nonDark/total), counts };
    })()
  `;
  // reuse the probe's direct-attach approach
  const browser = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json/version').toString());
  const bb = new CDP(browser.webSocketDebuggerUrl);
  await bb.connect();
  await bb.send('Target.createTarget', { url: 'about:blank' });
  await new Promise(r => setTimeout(r, 300));
  const all = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json').toString());
  const pages = all.filter(t => t.type === 'page' && t.url === 'about:blank');
  const c = new CDP(pages[pages.length-1].webSocketDebuggerUrl);
  await c.connect();
  await c.send('Runtime.enable');
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  await c.close(); await bb.close();
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

const files = process.argv.slice(2);
for (const f of files) {
  if (!existsSync(f)) { console.log(f, 'MISSING'); continue; }
  try {
    const fp = await fingerprint(f);
    const neonStr = Object.entries(fp.counts).filter(([,v])=>v>0).map(([k,v])=>`${k}:${(100*v/(fp.w*fp.h)).toFixed(2)}%`).join(' ');
    console.log(`${f}  ${fp.w}x${fp.h}  nonDark=${fp.nonDarkPct}%  [${neonStr || 'no-neon'}]`);
  } catch (e) {
    console.log(f, 'ERROR', e.message);
  }
}
process.exit(0);
