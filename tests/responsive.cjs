// Responsive check: every page, view and sheet at phone, tablet and desktop
// widths, with sample data loaded. Fails when anything spills past the screen.
//
//   npm run build && CHROMIUM_PATH=/path/to/chrome node tests/responsive.cjs
//   SHOTS=/some/dir to save a screenshot of each screen.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const dist = path.resolve(__dirname, '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, req.url === '/' ? '/index.html' : req.url.split('?')[0]);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const account = { data: { guide: { done: true }, me: { name: 'Sam Rivera' } }, version: 1 };
async function fakeApi(page) {
  await page.route('**/api/**', route => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/me') return route.fulfill({ json: { user: { id: 'u1', name: 'Sam Rivera', role: 'owner' } } });
    if (p === '/api/data' && req.method() === 'GET') return route.fulfill({ json: { data: account.data, version: account.version } });
    if (p === '/api/data' && req.method() === 'PUT') { account.data = JSON.parse(req.postData()).data; account.version++; return route.fulfill({ json: { version: account.version } }); }
    if (p === '/api/recovery-codes') return route.fulfill({ json: { left: 8 } });
    if (p === '/api/passkeys') return route.fulfill({ json: { passkeys: [{ id: 'k1', label: 'MacBook Air', created_at: Date.now(), last_used_at: Date.now() }, { id: 'k2', label: 'iPhone', created_at: Date.now(), last_used_at: Date.now() }] } });
    if (p === '/api/people') return route.fulfill({ json: { people: [{ id: 'u1', name: 'Sam Rivera', role: 'owner', last_seen: Date.now() }, { id: 'u2', name: 'Alex Chen', role: 'member', last_seen: Date.now() }], invites: [] } });
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
}
const tab = name => `.nb-pages button:has-text("${name}")`;

// Elements that reach past the right edge and are not inside something that scrolls sideways.
const spill = () => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const scrolls = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 1) continue;
    const st = getComputedStyle(el);
    if (st.position === 'fixed' || st.visibility === 'hidden' || scrolls(el)) continue;
    out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(r.right)} vw=${vw}`);
  }
  return { page: document.documentElement.scrollWidth - vw, items: out.slice(0, 6) };
};

const SCREENS = [
  ['today', async p => { await p.click(tab('Overview')); }],
  ['schedule', async p => { await p.click(tab('Planner')); await p.click('[data-test="view-schedule"]'); await p.click('[data-test="cal-day"]'); }],
  ['week', async p => { await p.click('[data-test="cal-week"]'); }],
  ['month', async p => { await p.click('[data-test="cal-month"]'); }],
  ['schedule-edit', async p => { await p.click('[data-test="cal-day"]'); await p.locator('[data-test="sch-box"]').first().click(); }],
  ['tasks', async p => { await p.keyboard.press('Escape'); await p.click('.sch-sheet [aria-label="Close"]').catch(() => {}); await p.click('[data-test="view-tasks"]'); }],
  ['task-edit', async p => { await p.locator('[data-test="task"] .tk-title').first().click(); }],
  ['agenda', async p => { await p.click('[data-test="view-agenda"]'); }],
  ['focus', async p => { await p.click('[data-test="nav-focus"]'); }],
  ['reports', async p => { await p.click('[data-test="nav-reports"]'); await p.waitForSelector('[data-test="rep-stat"]'); }],
  ['calendars', async p => { await p.click('[data-test="nav-planner"]'); await p.click('[data-test="view-schedule"]'); await p.click('[data-test="calendars-open"]'); }],
  ['add', async p => { await p.click('[data-test="calendars-open"]'); await p.click('[data-test="capture"]'); await p.fill('[data-test="capture-text"]', 'Essay due Fri 5pm #English\ngym MWF 6pm\nI want to run a 10K by March'); }],
  ['review', async p => { await p.click('[data-test="capture-sort"]'); await p.waitForSelector('.cr-hole'); }],
  ['review-goal', async p => { await p.click('[data-test="review-keep"]'); await p.click('[data-test="review-keep"]'); await p.waitForTimeout(400); }],
  ['search', async p => { await p.click('[data-test="review-keep"]'); await p.fill('[data-test="search"]', 'lab'); }],
  ['bell', async p => { await p.fill('[data-test="search"]', ''); await p.keyboard.press('Escape'); await p.click('[data-test="bell"]'); }],
  ['settings-profile', async p => { await p.click('[data-test="bell"]'); await p.click('[data-test="account"]'); await p.click('[data-test="acct-tab-profile"]'); }],
  ['settings-ai', async p => { await p.click('[data-test="acct-tab-digests"]'); }],
  ['settings-security', async p => { await p.click('[data-test="acct-tab-security"]'); }],
  ['settings-people', async p => { await p.click('[data-test="acct-tab-people"]'); }],
  ['settings-data', async p => { await p.click('[data-test="acct-tab-data"]'); }],
];
const WIDTHS = (process.env.WIDTHS || '360,390,600,768,1024,1280,1600').split(',').map(Number);

async function run(url) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const problems = [];
  const errors = [];
  // Fill with sample data once.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await fakeApi(page);
    await page.goto(url, { waitUntil: 'load' });
    await page.click('[data-test="account"]');
    await page.click('[data-test="acct-tab-data"]');
    await page.click('[data-test="sample-add"]');
    await page.waitForTimeout(1500);
    await page.close();
  }
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: w < 700 ? 844 : 900 } });
    page.on('pageerror', e => errors.push(`${w}px: ${e.message}`));
    await fakeApi(page);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('[data-test="today"]');
    for (const [name, go] of SCREENS) {
      try { await go(page); } catch (e) { problems.push(`${w}px ${name}: could not open (${e.message.split('\n')[0]})`); continue; }
      await page.waitForTimeout(250);
      const s = await page.evaluate(spill);
      if (s.page > 0 || s.items.length) problems.push(`${w}px ${name}: page overflow ${s.page}px; ${s.items.join(' | ')}`);
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/r-${w}-${name}.png`, fullPage: !/settings|edit|bell|search|add|review|calendars/.test(name) });
    }
    await page.close();
  }
  await browser.close();
  if (problems.length) console.log(problems.join('\n'));
  assert.deepEqual(errors, [], 'no page errors');
  assert.equal(problems.length, 0, `${problems.length} responsive problems`);
}

server.listen(0, '127.0.0.1', async () => {
  let code = 1;
  try { await run(`http://127.0.0.1:${server.address().port}/`); console.log('responsive test passed'); code = 0; } catch (e) { console.error('responsive test failed:', e.message); }
  server.close(); server.closeAllConnections(); process.exit(code);
});
