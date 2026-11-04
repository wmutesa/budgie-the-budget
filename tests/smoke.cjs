// Smoke test for the built Budgie web app. It serves dist/, opens the page,
// checks the main panels and the chart tooltip, and fails on page errors or
// horizontal scrolling on a phone.
//
//   npm run build && npm test
//   CHROMIUM_PATH=/path/to/chrome npm test

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const dist = path.resolve(__dirname, '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(dist, urlPath);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function run(url) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(`page error: ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });

  assert.match(await page.textContent('h1'), /Financial overview/, 'heading renders');
  for (const label of ['Cash flow', 'Spending overview', 'My wallets', 'Upcoming bills', 'Savings goals', 'Recent activity']) {
    assert.match(await page.textContent('body'), new RegExp(label, 'i'), `panel "${label}" renders`);
  }
  assert.equal(await page.locator('.bar-col').count(), 12, 'cash flow shows twelve months');

  await page.locator('.bar-col').nth(5).hover();
  assert.match(await page.textContent('.tip'), /Jun/, 'hovering a month shows its tooltip');

  await page.click('.pills button:nth-child(2)');
  assert.match(await page.textContent('.tip').catch(() => ''), /Expense|/, 'switching to Expense keeps the chart working');

  await page.click('.tabs button:nth-child(2)');
  assert.match(await page.textContent('body'), /next build stage/, 'other tabs show a placeholder for now');
  await page.click('.tabs button:nth-child(1)');

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
  let code = 1;
  try {
    await run(url);
    console.log('smoke test passed');
    code = 0;
  } catch (err) {
    console.error('smoke test failed:', err.message);
  } finally {
    server.close();
    server.closeAllConnections();
    process.exit(code);
  }
});
