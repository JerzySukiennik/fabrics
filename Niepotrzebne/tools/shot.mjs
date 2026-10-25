// Fabrics harness: headless Chrome with real GPU (ANGLE/Metal), screenshot + console + fps.
// node shot.mjs <out.png> [scene] [setupJS] [waitMs] [width] [height] [mobile]
import {createRequire} from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const {chromium} = require('playwright-core');
const [out = 'shot.png', scn = 'curtain', setup = '', wait = '3000', w = '1280', h = '800', mob = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({viewport: {width: +w, height: +h}, deviceScaleFactor: +(process.env.DPR || 1), hasTouch: !!mob, isMobile: !!mob});
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(`http://127.0.0.1:${process.env.PORT || 8731}/?scene=${scn}`, {waitUntil: 'load'});
try { await page.waitForFunction(() => window.__fabrics, null, {timeout: 30000}); } catch { logs.push('[harness] boot timeout'); }
if (setup) { try { const r = await page.evaluate(setup); if (r !== undefined) logs.push('[setup] ' + JSON.stringify(r)); } catch (e) { logs.push('[setup error] ' + e.message); } }
await page.waitForTimeout(+wait);
const info = await page.evaluate(async () => {
  const D = window.FABRICS_DEBUG; if (!D) return null;
  let f = 0; const t0 = performance.now();
  await new Promise(r => { const k = () => { f++; performance.now() - t0 < 1500 ? requestAnimationFrame(k) : r(); }; requestAnimationFrame(k); });
  const g = D.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info');
  return {fps: +(f / 1.5).toFixed(1), dpr: D.dpr, n: D.world.cloths.map(c => c.n), tris: D.renderer.info.render.triangles, gl: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'};
});
logs.push('[info] ' + JSON.stringify(info));
await page.screenshot({path: out});
console.log(logs.slice(-40).join('\n'));
await browser.close();
