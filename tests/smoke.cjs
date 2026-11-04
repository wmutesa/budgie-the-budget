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
    json: { result: 'success', time_last_update_utc: 'Wed, 04 Nov 2026 00:02:31 +0000', rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151.3, CAD: 1.37, INR: 84.1, KES: 129.5, NGN: 1550, BDT: 122.2, RWF: 1450, THB: 33.8 } },
  }));
  await page.route('**/www.wikidata.org/**', route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    if (action === 'wbsearchentities') {
      const q = (new URL(route.request().url()).searchParams.get('search') || '').toLowerCase();
      return route.fulfill({ json: { search: q.includes('netflix') ? [{ id: 'Q907311', label: 'Netflix', description: 'American streaming service' }] : [] } });
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

  assert.match(await page.textContent('.nav-bar .brand-word'), /BUDGIE/, 'navigation renders inside the grid');
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

  // Known companies appear instantly from the built-in directory.
  await page.click('[data-test="add-sub"]');
  await page.fill('[data-test="brand-search"]', 'Shopee');
  await page.waitForSelector('[data-test="brand-result"]');
  assert.match(await page.textContent('.results'), /shopee\.com/, 'Shopee is found in the directory');
  await page.keyboard.press('Escape');

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

  await page.click('.nb-pages button:nth-child(2)');
  assert.match(await page.textContent('body'), /Monthly budgets/, 'transactions page shows budgets');
  assert.match(await page.textContent('body'), /Recent activity/, 'transactions page lists activity');
  assert.equal(await page.locator('.kpi').count(), 4, 'four summary tiles');

  // Import a bank statement: three rows go to review, then into the ledger.
  const csv = 'Date,Description,Amount\n2026-11-02,Trader Joe\'s,-54.20\n2026-11-03,Uber,-18.75\n2026-11-03,Payroll,2350.00\n';
  await page.setInputFiles('[data-test="file-input"]', { name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForSelector('#review');
  assert.equal(await page.locator('.draft-card').count(), 3, 'three statement rows wait for review');
  assert.match(await page.textContent('#review'), /Transport/, 'Uber is categorised as transport');

  // A one-line note, matched to the company on the web.
  await page.fill('[data-test="quick-note"]', 'Netflix 15.49 today');
  await page.press('[data-test="quick-note"]', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.draft-card').length === 4);
  assert.match(await page.textContent('#review'), /netflix\.com/, 'the note is matched to netflix.com');

  // The custom category picker changes a draft without a native dropdown.
  await page.click('.draft-card >> nth=0 >> .draft-cat .pick-btn');
  await page.click('.pick-pop .pick-opt:has-text("Shopping")');
  assert.match(await page.textContent('.draft-card >> nth=0'), /Shopping/, 'category picker sets the category');

  await page.click('[data-test="accept-all"]');
  assert.equal(await page.$('#review'), null, 'review queue clears after accepting');
  assert.match(await page.textContent('#ledger'), /Uber|Netflix/, 'accepted items reach recent activity');
  assert.match(await page.textContent('#budgets'), /Transport/, 'budgets update');
  const [hb, hl] = await Promise.all([page.locator('#budgets').boundingBox(), page.locator('#ledger').boundingBox()]);
  assert.ok(Math.abs(hb.height - hl.height) < 2 && Math.abs((hb.y + hb.height) - (hl.y + hl.height)) < 2, 'budgets and recent activity share a bottom line');

  // Reports: advice, bank opportunities and the full ledger.
  await page.click('.nb-pages button:nth-child(3)');
  assert.ok((await page.locator('.insight').count()) > 0, 'reports show suggestion cards');
  assert.match(await page.textContent('#opportunities'), /Chase/, 'Chase opportunities appear');
  assert.match(await page.textContent('#opportunities'), /Bank of America/, 'Bank of America opportunities appear');
  assert.match(await page.textContent('#reports'), /Year in numbers/i, 'year in numbers moved to reports');
  const [rb, ab] = await Promise.all([page.locator('#reports').boundingBox(), page.locator('#activity').boundingBox()]);
  assert.ok(Math.abs(rb.y - ab.y) < 2, 'year in numbers and all activity sit side by side');
  assert.ok(Math.abs((rb.y + rb.height) - (ab.y + ab.height)) < 2, 'year in numbers and all activity share a bottom line');
  await page.click('#activity .chip-btn:has-text("Imported")');
  assert.match(await page.textContent('#activity'), /Payroll/, 'imported filter shows statement rows');

  // Playground: messy notes become an organised plan, then budgets.
  await page.click('.nb-pages button:nth-child(4)');
  await page.fill('[data-test="scratch"]', 'salary 4000\nrent 1500, groceries maybe 450\nnetflix 15.49, github 4\nsave 1200 for laptop by june');
  await page.click('[data-test="organize"]');
  assert.match(await page.textContent('.lane[data-group="Needs"]'), /Rent/, 'rent lands in needs');
  assert.match(await page.textContent('.lane[data-group="Wants"]'), /Netflix/, 'Netflix lands in wants');
  assert.match(await page.textContent('.lane[data-group="Savings & goals"]'), /Laptop/i, 'the laptop goal lands in savings');
  assert.equal(await page.inputValue('[data-test="plan-income"]'), '4000', 'income is picked up from the notes');
  await page.click('[data-test="apply-plan"]');
  await page.click('.nb-pages button:nth-child(2)');
  assert.match(await page.textContent('#budgets'), /\$1,500/, 'the plan sets the housing budget');
  await page.click('.nb-pages button:nth-child(1)');

  // Sentences with relative dates become clean drafts.
  await page.click('.nb-pages button:nth-child(2)');
  await page.fill('[data-test="quick-note"]', 'spent 12.50 on lunch at chipotle last friday');
  await page.press('[data-test="quick-note"]', 'Enter');
  await page.waitForSelector('#review');
  const draftText = await page.textContent('.draft-card >> nth=0');
  assert.match(draftText, /Chipotle/, 'merchant comes from "at Chipotle"');
  assert.doesNotMatch(draftText, /friday/i, 'the date phrase is removed from the merchant');
  await page.click('[data-test="accept-all"]');

  // Rwandan francs in the live rates.
  await page.click('.nb-pages button:nth-child(1)');
  assert.match(await page.textContent('.fx'), /RWF/, 'Rwandan franc rate appears');

  // A long subscription list stays compact.
  const many = await context.newPage();
  await fakeNetwork(many);
  await many.addInitScript(() => {
    const names = ['Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Hulu', 'Max', 'Apple Music', 'iCloud+', 'Google One', 'Dropbox', 'Notion', 'Figma', 'GitHub', 'Vercel', 'Cursor', 'Claude', 'ChatGPT', 'Canva', 'Adobe Creative Cloud', 'Duolingo', 'Headspace', 'Calm', 'Strava', 'Audible', 'Crunchyroll', 'Peacock', 'Paramount+', 'Tidal', 'NordVPN', '1Password'];
    const subs = names.map((n, i) => ({ id: 's' + i, name: n, domain: '', logo: null, amount: 5 + i, currency: i % 5 === 0 ? 'RWF' : 'USD', cycle: 'monthly', next: '2026-12-0' + ((i % 9) + 1) }));
    localStorage.setItem('budgie.v2', JSON.stringify({ base: 'USD', subscriptions: subs }));
  });
  await many.goto(url, { waitUntil: 'load' });
  assert.equal(await many.locator('[data-test="subs-list"] .sub-row').count(), 6, '30 subscriptions show 6 at first');
  assert.match(await many.textContent('[data-test="subs-more"]'), /Show 24 more/, 'the rest sit behind a toggle');
  await many.click('[data-test="subs-more"]');
  assert.equal(await many.locator('[data-test="subs-list"] .sub-row').count(), 30, 'all 30 appear when expanded');
  await many.close();

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
