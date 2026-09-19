#!/usr/bin/env node
/*
 * gen_index.mjs — regenerate the root index.html from the repo layout.
 *
 * Zero dependencies (Node >= 18). For each top-level subfolder it links to
 * the MAIN intro page only (<subfolder>/index.html), and embeds the shared
 * generation prompt (prompt.txt at the repo root) in a block with a
 * copy-to-clipboard button.
 *
 * Usage:  node scripts/gen_index.mjs   (run from the repo root, or anywhere —
 * it resolves the repo root itself)
 *
 * After adding/renaming subfolders, run this and commit the result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'validation']);

function titleOf(file) {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return path.basename(file, '.html');
  let t = m[1].replace(/\s+/g, ' ').trim();
  // Drop a trailing shared-site suffix ("GAME — Digital Spaceport Arcade")
  // so link labels stay short; keep the full title if nothing is left.
  t = t.replace(/\s+—\s+[^—]+$/, '').trim() || t;
  return t || path.basename(file, '.html');
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const promptFile = path.join(ROOT, 'prompt.txt');
const prompt = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf8').trim() : '';
if (!prompt) console.warn('WARNING: prompt.txt not found — the prompt block will be empty.');

const folders = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
  .map((e) => e.name)
  .sort((a, b) => a.localeCompare(b));

let sections = '';
let linked = 0;
for (const folder of folders) {
  const main = path.join(ROOT, folder, 'index.html');
  if (!fs.existsSync(main)) continue; // only subfolders with a main intro page
  linked++;
  sections += `
  <section>
    <h2>${esc(folder)}</h2>
    <ul>
      <li><a href="./${esc(folder)}/index.html">${esc(titleOf(main))}</a></li>
    </ul>
  </section>`;
}

const promptSection = prompt
  ? `
  <section>
    <h2>THE PROMPT <button id="copy-btn" type="button">COPY PROMPT</button></h2>
    <p class="sub">The same prompt went to every agent — one subfolder per implementation.</p>
    <pre id="prompt-text"></pre>
  </section>`
  : '';

const today = new Date().toISOString().slice(0, 10);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Digital Spaceport Arcade — LLM Shootout</title>
<meta name="description" content="The same arcade-suite prompt, implemented by different LLMs. One subfolder per implementation.">
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; padding: 3rem 1.25rem 4rem;
    background: #05010f; color: #cfe8ff;
    font-family: ui-monospace, "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, monospace;
    display: flex; justify-content: center;
  }
  main { max-width: 46rem; width: 100%; }
  h1 {
    margin: 0 0 .25rem; font-size: 1.6rem; letter-spacing: .12em; color: #21e6ff;
    text-shadow: 0 0 12px rgba(33, 230, 255, .55);
  }
  .pink { color: #ff2bd6; text-shadow: 0 0 12px rgba(255, 43, 214, .55); }
  .sub { margin: 0 0 2rem; color: #7f96b8; font-size: .85rem; }
  section { margin: 0 0 1.75rem; }
  h2 {
    display: flex; align-items: center; gap: .75rem;
    margin: 0 0 .5rem; font-size: 1.05rem; letter-spacing: .14em; text-transform: uppercase;
    color: #ffe600; border-bottom: 1px solid #1d2b4a; padding-bottom: .35rem;
  }
  ul { margin: 0; padding: 0; list-style: none; }
  li { margin: .3rem 0; }
  a { color: #21e6ff; text-decoration: none; }
  a:hover { color: #ff2bd6; text-shadow: 0 0 10px rgba(255, 43, 214, .6); }
  #copy-btn {
    margin-left: auto;
    font: inherit; font-size: .7rem; letter-spacing: .12em;
    color: #21e6ff; background: transparent;
    border: 1px solid #21e6ff; border-radius: 3px;
    padding: .3rem .7rem; cursor: pointer;
  }
  #copy-btn:hover { color: #ff2bd6; border-color: #ff2bd6; box-shadow: 0 0 12px rgba(255, 43, 214, .4); }
  #copy-btn.copied { color: #3cff88; border-color: #3cff88; box-shadow: 0 0 12px rgba(60, 255, 136, .4); }
  pre {
    margin: 0; padding: 1rem;
    background: #0a0518; border: 1px solid #1d2b4a; border-radius: 4px;
    font: inherit; font-size: .8rem; line-height: 1.55; color: #9fb8d8;
    white-space: pre-wrap; word-wrap: break-word;
    max-height: 40vh; overflow-y: auto;
  }
  footer { margin-top: 3rem; font-size: .75rem; color: #55688a; }
  code { color: #9fb8d8; }
</style>
</head>
<body>
<main>
  <h1>DIGITAL SPACEPORT <span class="pink">ARCADE</span> — LLM SHOOTOUT</h1>
  <p class="sub">Same prompt, different LLMs. One subfolder per implementation — each link opens that implementation's spaceport landing page.</p>
${sections}
${promptSection}
  <footer>Auto-generated by <code>scripts/gen_index.mjs</code> on ${today} — re-run it after adding a subfolder (or editing <code>prompt.txt</code>) and commit the result.</footer>
</main>
<script>
const PROMPT = ${JSON.stringify(prompt)};
const pre = document.getElementById('prompt-text');
const btn = document.getElementById('copy-btn');
if (pre) pre.textContent = PROMPT;
if (btn) btn.addEventListener('click', async () => {
  let ok = false;
  try { ok = await navigator.clipboard.writeText(PROMPT); }
  catch (e) {
    try { // fallback for contexts where the async clipboard API is unavailable
      const ta = document.createElement('textarea');
      ta.value = PROMPT;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch (e2) { ok = false; }
  }
  const orig = 'COPY PROMPT';
  btn.textContent = ok ? 'COPIED ✓' : 'COPY FAILED';
  btn.classList.toggle('copied', ok);
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
});
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log(`Wrote ${path.join(ROOT, 'index.html')} — ${linked}/${folders.length} subfolder(s) linked (main intro page only), prompt ${prompt ? `embedded (${prompt.length} chars)` : 'MISSING (no prompt.txt)'}.`);
