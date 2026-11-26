// Emberline Air — screenshot + playtest driver (dev tool, not part of the game).
// Serves game/ over HTTP, opens it in headless Chromium (swiftshader WebGL),
// and either captures the 4 screenshot poses (?shot=1..4) or runs an
// autopilot playtest of one mission (?playtest=<mission>).
//
//   GAME_DIR=../game OUT_DIR=../screenshots node tools/shots.mjs shots
//   GAME_DIR=../game node tools/shots.mjs playtest rings
//
// Requires playwright-core (NODE_PATH) and a Chromium binary (CHROME).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const GAME_DIR = process.env.GAME_DIR || path.resolve('game');
const OUT_DIR = process.env.OUT_DIR || path.resolve('screenshots');
const CHROME = process.env.CHROME;
const MODE = process.argv[2] || 'shots';
const ARG = process.argv[3] || '';
const PORT = 8901;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(GAME_DIR, p === '/' ? 'index.html' : p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const [VP_W, VP_H] = (process.env.VIEWPORT || '1280x720').split('x').map(Number);
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-sandbox', `--window-size=${VP_W},${VP_H}`],
});
let failed = false;

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: VP_W, height: VP_H } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || t.includes('[emberline]')) console.log(`[page:${m.type()}] ${t}`);
  });
  let errLogged = false;
  page.on('pageerror', (e) => {
    if (!errLogged) { errLogged = true; console.log(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`); }
    failed = true;
  });
  return page;
}

async function dbgLoop(page, label) {
  return setInterval(async () => {
    try {
      const s = await page.evaluate(() => {
        const g = window.__game;
        if (!g) return 'no __game';
        const st = g.state;
        return `pos=(${st.pos.x.toFixed(0)},${st.pos.y.toFixed(0)},${st.pos.z.toFixed(0)}) spd=${st.speed.toFixed(1)} hdg=${st.heading.toFixed(0)} pitch=${st.pitch.toFixed(1)} bank=${st.bank.toFixed(1)} thr=${st.throttle.toFixed(2)} fuel=${st.fuel.toFixed(0)} hull=${st.hull.toFixed(0)} ground=${st.onGround} crash=${st.crashed} ap=${g.autopilot.active ? g.autopilot.phase + (g.autopilot.done ? '/done' : '') : 'off'} mission=${g.mission ? g.mission.id + ' ' + (g.mission.objectiveText || '') : 'none'}`;
      });
      console.log(`[${label} dbg] ${s}`);
    } catch { /* page closing */ }
  }, 5000);
}

if (MODE === 'shots') {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const names = { 1: '1-ring-run.jpg', 2: '2-runway-approach.jpg', 3: '3-rescue-beach.jpg', 4: '4-precision-landing.jpg' };
  const only = (process.env.ONLY || '').split(',').map((s) => parseInt(s, 10)).filter(Boolean);
  const list = only.length ? only : [1, 2, 3, 4];
  for (const n of list) {
    const page = await newPage();
    await page.goto(`${BASE}/index.html?shot=${n}`, { waitUntil: 'load', timeout: 60000 });
    const dbg = await dbgLoop(page, `shot ${n}`);
    try {
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 150000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT_DIR}/${names[n]}`, type: 'jpeg', quality: 82 });
      console.log(`shot ${n} saved: ${names[n]}`);
    } catch (e) {
      console.log(`SHOT ${n} FAILED: ${e.message.split('\n')[0]}`);
      try { await page.screenshot({ path: `${OUT_DIR}/timeout-${n}.jpg`, type: 'jpeg', quality: 80 }); console.log(`timeout frame saved: timeout-${n}.jpg`); } catch {}
      failed = true;
    }
    clearInterval(dbg);
    await page.close();
  }
} else if (MODE === 'playtest') {
  const mission = ARG;
  const page = await newPage();
  // ff=1: fast-forward sim (no render/HUD), fixed 0.05 s steps — a whole
  // mission verifies in seconds under swiftshader.
  await page.goto(`${BASE}/index.html?playtest=${mission}&ff=1`, { waitUntil: 'load', timeout: 60000 });
  const dbg = await dbgLoop(page, `playtest ${mission}`);
  try {
    await page.waitForFunction(() => window.__playtestDone === true, null, { timeout: 900000 });
    const r = await page.evaluate(() => window.__playtestResult);
    console.log(`PLAYTEST ${mission}: ${JSON.stringify(r)}`);
    if (!r.ok) failed = true;
  } catch (e) {
    console.log(`PLAYTEST ${mission} FAILED: ${e.message.split('\n')[0]}`);
    failed = true;
  }
  clearInterval(dbg);
  await page.close();
}

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
