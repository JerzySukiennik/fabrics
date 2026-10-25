// Fabrics interaction test: drives every tool with real pointer events in headless Chrome (GPU), saves a screenshot per step.
import {createRequire} from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const {chromium} = require('playwright-core');
const out = process.argv[2] || 'shots/play';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
const logs = [];
page.on('console', m => { if (m.type() !== 'log') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const go = async scn => { await page.goto(`http://127.0.0.1:8731/?scene=${scn}`); await page.waitForFunction(() => window.__fabrics); await page.waitForTimeout(2500); };
const scr = (ci, i, j) => page.evaluate(([a, b, c]) => window.FABRICS_DEBUG.screen(a, b, c), [ci, i, j]);
const tool = t => page.evaluate(t => window.FABRICS_DEBUG.setTool(t), t);
const drag = async (from, to, steps = 20, hold = 0) => { await page.mouse.move(...from); await page.mouse.down(); for (let s = 1; s <= steps; s++) { await page.mouse.move(from[0] + (to[0] - from[0]) * s / steps, from[1] + (to[1] - from[1]) * s / steps); await page.waitForTimeout(16); } await page.waitForTimeout(hold); await page.mouse.up(); };
const stat = () => page.evaluate(() => { const w = window.FABRICS_DEBUG.world; return w.cloths.map(c => { let nan = 0, alive = 0; for (let k = 0; k < c.n; k++) { if (!isFinite(c.pos[k * 3])) nan++; if (c.alive[k]) alive++; } return {n: c.n, alive, nan, tris: c.indexCount / 3, burning: c.burnCount || 0}; }); });
const shot = async name => { await page.screenshot({path: `${out}-${name}.png`}); logs.push(`[${name}] ` + JSON.stringify(await stat())); };

await go('curtain');
const c = await page.evaluate(() => { const c = window.FABRICS_DEBUG.world.cloths[0]; return [c.cols, c.rows]; });
await tool('grab');
await drag(await scr(1, 2, c[1] - 3), [1150, 500], 30, 600);
await page.waitForTimeout(800); await shot('curtain-grab');
await tool('wind');
await drag([640, 420], [700, 400], 40, 900);
await page.waitForTimeout(300); await shot('curtain-wind');

await go('flag');
await tool('cut');
const f = await page.evaluate(() => { const c = window.FABRICS_DEBUG.world.cloths[0]; return [c.cols, c.rows]; });
const a = await scr(0, (f[0] * 0.5) | 0, 0), b = await scr(0, (f[0] * 0.5) | 0, f[1] - 1);
await drag([a[0] - 10, a[1] - 40], [b[0] + 10, b[1] + 40], 25);
await page.waitForTimeout(1500); await shot('flag-cut');

await go('robe');
await tool('burn');
const r = await page.evaluate(() => { const c = window.FABRICS_DEBUG.world.cloths[0]; return [c.cols, c.rows]; });
const rb = await scr(0, (r[0] * 0.3) | 0, r[1] - 3);
await page.mouse.click(...rb);
await page.waitForTimeout(2500); await shot('robe-burn');
await page.waitForTimeout(3500); await shot('robe-burn2');

await go('table');
await tool('dye');
const t = await page.evaluate(() => { const c = window.FABRICS_DEBUG.world.cloths[0]; return [c.cols, c.rows]; });
for (const [i, j, col] of [[0.4, 0.5, 0], [0.55, 0.45, 2], [0.5, 0.6, 1]]) {
  if (col) await page.evaluate(k => document.querySelectorAll('#ctx .dot')[k].click(), col);
  await page.mouse.click(...await scr(0, (t[0] * i) | 0, (t[1] * j) | 0));
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1600); await shot('table-dye');
await tool('grab');
await drag(await scr(0, 0, (t[1] / 2) | 0), [100, 650], 6, 50);
await page.waitForTimeout(2000); await shot('table-yank');

await go('hammock');
await tool('yarn');
for (const x of [560, 640, 720]) { await page.mouse.click(x, 430); await page.waitForTimeout(250); }
await page.waitForTimeout(2500); await shot('hammock-yarn');

await go('rug');
await tool('pin');
const g = await page.evaluate(() => { const c = window.FABRICS_DEBUG.world.cloths[0]; return [c.cols, c.rows]; });
await page.mouse.click(...await scr(0, (g[0] / 2) | 0, (g[1] / 2) | 0));
await tool('grab');
await drag(await scr(0, 0, 0), [640, 250], 30, 1200);
await page.waitForTimeout(500); await shot('rug-pin-lift');

console.log(logs.join('\n'));
await browser.close();
