// Smoke test for Budgie. Serves the app from this folder, loads demo data,
// visits every section, exercises search, the theme toggle, and adding an entry,
// then fails if the page throws or an assertion breaks.
//
//   npm run test                       (uses the Playwright-installed Chromium)
//   CHROMIUM_PATH=/path/to/chrome npm run test

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(root, urlPath);
  const inside = file.startsWith(root + path.sep);
  if (!inside || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function run(url) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(`page error: ${e.message}`));
  page.on('dialog', d => d.accept());
  await page.goto(url, { waitUntil: 'load' });

  // The local AI server is not running in CI, so "failed to load resource" is expected.
  await page.evaluate(() => { document.getElementById('set').open = true; });
  await page.click('[data-action="seed-demo"]');

  for (const id of ['overview', 'plan', 'accounts', 'goals', 'ledger', 'ask', 'set']) {
    assert.ok(await page.$(`#${id}`), `section #${id} renders`);
  }
  assert.match(await page.textContent('#overview'), /Net worth/, 'overview shows net worth');

  await page.click('[data-action="range"][data-id="365"]');
  assert.equal((await page.textContent('.seg .on')).trim(), '1Y', 'range toggle switches to 1Y');

  await page.fill('#global-search input', 'Trader');
  await page.press('#global-search input', 'Enter');
  assert.match(await page.textContent('#ledger-list'), /Trader Joe's/, 'global search finds a transaction');

  await page.click('#fab-toggle');
  assert.ok(await page.$('.fab.open'), 'bottom-right menu opens');
  await page.keyboard.press('Escape');
  assert.equal(await page.$('.fab.open'), null, 'Escape closes the menu');

  await page.click('[data-action="theme"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'theme toggles to light');
  await page.click('[data-action="theme"]');

  await page.fill('[data-input="q"]', ''); // clear the search left by the step above
  await page.click('[data-action="add-tx"]');
  await page.fill('#modal-form input[name="amount"]', '42.5');
  await page.fill('#modal-form input[name="merchant"]', 'Smoke test store');
  await page.click('#modal-form button[type="submit"]');
  assert.match(await page.textContent('#ledger-list'), /Smoke test store/, 'a new entry appears in the ledger');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on('pageerror', e => errors.push(`mobile page error: ${e.message}`));
  await mobile.goto(url, { waitUntil: 'load' });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `no horizontal scroll on a phone (overflow ${overflow}px)`);

  await browser.close();
  assert.deepEqual(errors, [], 'no page errors');
}

server.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    await run(url);
    console.log('smoke test passed');
    process.exitCode = 0;
  } catch (err) {
    console.error('smoke test failed:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
    server.closeAllConnections();
    process.exit(process.exitCode ?? 1);
  }
});
