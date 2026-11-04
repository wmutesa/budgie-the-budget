// Smoke test for the built Budgie web app. Serves dist/, fakes the live
// exchange-rate and Wikidata responses so the test runs offline, then checks
// the overview, the add-a-subscription flow, persistence and the second page.
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

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

async function fakeNetwork(page) {
  await page.route('**/open.er-api.com/**', route => route.fulfill({
    json: { result: 'success', time_last_update_utc: 'Wed, 04 Nov 2026 00:02:31 +0000', rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151.3, CAD: 1.37, INR: 84.1, KES: 129.5, NGN: 1550, BDT: 122.2 } },
  }));
  await page.route('**/www.wikidata.org/**', route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    if (action === 'wbsearchentities') {
      return route.fulfill({ json: { search: [{ id: 'Q907311', label: 'Netflix', description: 'American streaming service' }] } });
    }
    return route.fulfill({ json: { entities: { Q907311: { claims: { P856: [{ mainsnak: { datavalue: { value: 'https://www.netflix.com/' } } }] } } } } });
  });
  await page.route('**/www.google.com/s2/favicons**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

async function run(url) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`page error: ${e.message}`));
  await fakeNetwork(page);
  await page.goto(url, { waitUntil: 'load' });

  assert.match(await page.textContent('.brand-word'), /BUDGIE/, 'masthead renders');
  assert.match(await page.textContent('.lede'), /You hold/, 'the brief renders');
  for (const label of ['Savings goal', 'Net worth', 'Plan', 'Cash flow', 'Exchange rates', 'Subscriptions', 'Expense breakdown', 'Signals', 'Wallets']) {
    assert.match(await page.textContent('body'), new RegExp(label, 'i'), `panel "${label}" renders`);
  }

  await page.waitForSelector('.fx li');
  assert.match(await page.textContent('.fx'), /0\.92/, 'live rates appear');
  assert.match(await page.textContent('.wallets'), /≈/, 'wallets show converted values');

  assert.equal(await page.locator('.cap-col').count(), 12, 'cash flow shows twelve months');
  await page.locator('.cap-col').nth(5).hover();
  assert.match(await page.textContent('.cap-tip'), /Jun/, 'hovering a month shows its totals');

  await page.click('[data-test="add-sub"]');
  await page.fill('[data-test="brand-search"]', 'Netflix');
  await page.waitForSelector('[data-test="brand-result"]');
  assert.match(await page.textContent('[data-test="brand-result"]'), /netflix\.com/, 'web search finds the official site');
  await page.click('[data-test="brand-result"]');
  await page.fill('[data-test="sub-amount"]', '15.49');
  await page.click('[data-test="save-sub"]');
  assert.match(await page.textContent('#subscriptions'), /Netflix/, 'the subscription is tracked');
  assert.match(await page.textContent('#subscriptions'), /netflix\.com/, 'its website is shown');

  await page.reload({ waitUntil: 'load' });
  assert.match(await page.textContent('#subscriptions'), /Netflix/, 'subscriptions survive a reload');

  await page.click('.pages button:nth-child(2)');
  assert.match(await page.textContent('body'), /Monthly budgets/, 'transactions page shows budgets');
  assert.match(await page.textContent('body'), /Recent activity/, 'transactions page lists activity');
  await page.click('.chip-btn >> nth=1');
  assert.ok((await page.locator('.table tbody tr').count()) > 0, 'income filter keeps rows');
  await page.click('.pages button:nth-child(1)');

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on('pageerror', e => errors.push(`mobile page error: ${e.message}`));
  await fakeNetwork(mobile);
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
