// Fabrics UI test: scene switching, fabric/pattern changes, thread view, gravity, let go, curtain sliding.
import {createRequire} from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const {chromium} = require('playwright-core');
const out = process.argv[2] || 'shots/p2';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
const logs = [];
page.on('console', m => { if (m.type() !== 'log') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://127.0.0.1:8731/?scene=curtain'); await page.waitForFunction(() => window.__fabrics); await page.waitForTimeout(2500);
const scr = (ci, i, j) => page.evaluate(([a, b, c]) => window.FABRICS_DEBUG.screen(a, b, c), [ci, i, j]);
const drag = async (from, to, steps = 20, hold = 0) => { await page.mouse.move(...from); await page.mouse.down(); for (let s = 1; s <= steps; s++) { await page.mouse.move(from[0] + (to[0] - from[0]) * s / steps, from[1] + (to[1] - from[1]) * s / steps); await page.waitForTimeout(16); } await page.waitForTimeout(hold); await page.mouse.up(); };
const c = await page.evaluate(() => { const c = window.FABRICS_DEBUG.world.cloths[0]; return [c.cols, c.rows]; });
const p0 = await scr(0, c[0] - 3, (c[1] * 0.6) | 0);
await drag(p0, [p0[0] + 330, p0[1]], 40, 400);
await page.waitForTimeout(1200);
logs.push('[rings after slide] ' + await page.evaluate(() => { const c = window.FABRICS_DEBUG.world.cloths[0]; return [c.pos[0], c.pos[(c.cols - 1) * 3]].map(v => v.toFixed(2)).join(' '); }));
await page.screenshot({path: `${out}-slide.png`});
await page.click('#bFabric'); await page.waitForTimeout(400);
for (const f of ['silk', 'velvet', 'denim', 'wool', 'linen', 'chiffon']) { await page.click(`.mat[data-f="${f}"]`); await page.waitForTimeout(150); }
for (const p of ['stripes', 'gingham', 'tartan', 'houndstooth', 'dots', 'damask', 'persian', 'shibori', 'solid']) { await page.click(`.pat[data-p="${p}"]`); await page.waitForTimeout(120); }
await page.click('.mat[data-f="velvet"]'); await page.click('.pat[data-p="damask"]'); await page.click('.col[data-c="#2D4838"]');
await page.waitForTimeout(400); await page.screenshot({path: `${out}-sheet.png`});
await page.click('#sheetFabric [data-close]'); await page.waitForTimeout(1500);
await page.screenshot({path: `${out}-velvet.png`});
for (const s of ['flag', 'robe', 'rug', 'table', 'hammock', 'curtain', 'flag']) { await page.click(`.chip[data-id="${s}"]`); await page.waitForTimeout(500); }
await page.waitForTimeout(800);
await page.click('#bSet'); await page.waitForTimeout(300);
await page.click('#tThreads'); await page.waitForTimeout(200);
await page.click('#bSet'); await page.waitForTimeout(1500);
await page.screenshot({path: `${out}-threads.png`});
await page.click('#bSet'); await page.click('#tThreads'); await page.click('#gravity [data-g="0"]'); await page.click('#bSet');
await page.click('.chip[data-id="table"]'); await page.waitForTimeout(3000);
await page.screenshot({path: `${out}-zerog.png`});
await page.click('#bSet'); await page.click('#gravity [data-g="24.8"]'); await page.click('#bSet');
await page.click('.chip[data-id="curtain"]'); await page.waitForTimeout(1500);
await page.click('.tool[data-tool="pin"]'); await page.waitForTimeout(200);
await page.click('#ctx [data-a="letgo"]'); await page.waitForTimeout(1800);
await page.screenshot({path: `${out}-letgo.png`});
logs.push('[mem] ' + JSON.stringify(await page.evaluate(() => window.FABRICS_DEBUG.renderer.info.memory)));
console.log(logs.join('\n'));
await browser.close();
