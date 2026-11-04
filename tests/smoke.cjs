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

// Send the same security headers Cloudflare will send (from public/_headers),
// so the test fails if the Content Security Policy blocks something the app needs.
const headers = {};
const headerFile = path.join(dist, '_headers');
if (fs.existsSync(headerFile)) {
  fs.readFileSync(headerFile, 'utf8').split('\n').filter(l => /^\s+\S/.test(l)).forEach(l => {
    const i = l.indexOf(':');
    headers[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/;\s*upgrade-insecure-requests/, '');
  });
  delete headers['Strict-Transport-Security'];
}

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(dist, urlPath);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// A stand-in for the browser's speech recognition, so dictation can be tested.
const FAKE_SPEECH = `// Fake speech recognition: streams words as interim results, then a final result on stop().
window.__speechPhrase = window.__speechPhrase || 'twelve fifty for lunch at Chipotle yesterday';
class FakeRec {
  start() {
    this.words = window.__speechPhrase.split(' ');
    this.i = 0;
    this.t = setInterval(() => {
      this.i = Math.min(this.words.length, this.i + 1);
      const text = this.words.slice(0, this.i).join(' ');
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: false })] });
    }, 120);
  }
  stop() {
    clearInterval(this.t);
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: window.__speechPhrase }], { isFinal: true })] });
    this.onend?.();
  }
  abort() { clearInterval(this.t); this.onend?.(); }
}
window.SpeechRecognition = FakeRec;
window.webkitSpeechRecognition = FakeRec;
`;

// A stand-in for the account server (worker/index.js): signed in as the owner,
// with data kept in memory so reloads and other pages see the same account.
// tests/accounts.cjs tests the real server.
// Test entries, dated relative to today, loaded through the fake account.
// (The app itself starts empty; this only gives the test something to check.)
function testEntries() {
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  return [
    [0, 'Trader Joe’s', -86.4, 'Food & dining'], [1, 'Metro top-up', -64, 'Transport'], [2, 'Rent share', -1450, 'Housing'],
    [2, 'Uniqlo', -118, 'Shopping'], [3, 'Payroll · Employer', 2350, 'Income'], [4, 'Chipotle', -42.1, 'Food & dining'],
    [5, 'Pharmacy', -57.3, 'Health'], [6, 'Cinema', -28, 'Entertainment'], [8, 'Amazon', -168, 'Shopping'], [9, 'Groceries', -64.9, 'Food & dining'],
  ].map(([n, merchant, amount, category], i) => ({ id: `t${i}`, date: day(n), merchant, amount, currency: 'USD', category, source: 'csv', domain: '', logo: null }));
}
const fakeAccount = { data: { guide: { done: true }, transactions: testEntries(),
  balances: [{ id: 'b1', name: 'Chase checking', kind: 'checking', balance: 2500, currency: 'USD', updatedAt: new Date().toISOString() }, { id: 'b2', name: 'Bank of Kigali', kind: 'savings', balance: 350000, currency: 'RWF', updatedAt: new Date().toISOString() }],
  goals: [{ id: 'g1', name: 'Emergency fund', saved: 1200, target: 5000, color: '#db2777' }] }, version: 1 };
async function fakeApi(page, account = fakeAccount) {
  await page.route('**/api/**', async route => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/me') return route.fulfill({ json: { user: { id: 'u1', name: 'Willy', role: 'owner' } } });
    if (p === '/api/data' && req.method() === 'GET') return route.fulfill({ json: { data: account.data, version: account.version } });
    if (p === '/api/data' && req.method() === 'PUT') {
      const body = JSON.parse(req.postData());
      account.data = body.data;
      account.version += 1;
      return route.fulfill({ json: { version: account.version } });
    }
    if (p === '/api/recovery-codes') return route.fulfill({ json: { left: 8 } });
    if (p === '/api/passkeys') return route.fulfill({ json: { passkeys: [{ id: 'k1', label: 'Mac', created_at: Date.now(), last_used_at: Date.now() }] } });
    if (p === '/api/people') return route.fulfill({ json: { people: [{ id: 'u1', name: 'Willy', role: 'owner', last_seen: Date.now() }], invites: [] } });
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
}

async function fakeNetwork(page, account) {
  await fakeApi(page, account);
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
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) errors.push(`CSP: ${m.text()}`); });
  await fakeNetwork(page);
  await page.goto(url, { waitUntil: 'load' });

  assert.match(await page.textContent('.nav-bar .brand-word'), /BUDGIE/, 'navigation renders inside the grid');
  assert.ok(Object.keys(headers).length >= 5, 'security headers are configured');
  assert.match(await page.textContent('.lede'), /You hold[\s\S]*spent/, 'the brief renders from your entries');
  for (const label of ['Savings goals', 'Net worth', 'Plan', 'Cash flow', 'Exchange rates', 'Subscriptions', 'Expense breakdown', 'Signals', 'Wallets']) {
    assert.match(await page.textContent('body'), new RegExp(label, 'i'), `panel "${label}" renders`);
  }

  await page.waitForSelector('.fx li');
  assert.match(await page.textContent('.fx'), /0\.92/, 'live rates appear');
  assert.match(await page.textContent('.wallets'), /≈/, 'wallets show converted values');

  // Months start when you started (here: the earliest test entry, 9 days ago) and run to this month.
  const nineDaysAgo = new Date(); nineDaysAgo.setDate(nineDaysAgo.getDate() - 9);
  const expectedMonths = nineDaysAgo.getMonth() === new Date().getMonth() ? 1 : 2;
  assert.equal(await page.locator('.cap-col').count(), expectedMonths, 'cash flow shows only the months since you started');
  await page.locator('.cap-col').last().hover();
  assert.match(await page.textContent('.cap-tip'), new RegExp(new Date().toLocaleDateString('en-US', { month: 'short' })), 'hovering a month shows its totals');

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
  await page.waitForFunction(() => /Drafted from your spending|Made by AI/.test(document.querySelector('[data-test="budgets-by"]')?.textContent || ''));
  const budgetText = await page.textContent('#budgets');
  assert.match(budgetText, /Food & dining[\s\S]*Housing|Housing[\s\S]*Food & dining/, 'budgets are drafted from the categories you spend in');
  assert.doesNotMatch(budgetText, /Software/, 'categories you never use are left out');
  assert.equal(await page.locator('#budgets .swatch').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(124, 58, 237)', 'Housing keeps its set colour');
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
  await page.locator('#activity .dc-col').nth(12).hover();
  await page.waitForTimeout(250);
  assert.ok(await page.locator('#activity .dc-col').nth(12).locator('.dc-tip').isVisible(), 'activity bars show a tooltip on hover');
  assert.ok((await page.locator('#reports .m-net.loss').count()) > 0 && (await page.locator('#reports .m-net.gain').count()) > 0, 'month by month marks gains and losses');
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
  assert.match(await page.textContent('.lane[data-group="Goals"]'), /Laptop/i, 'the laptop goal lands in goals');
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

  // Dictation: words stream into the bar, then become a draft.
  const talk = await context.newPage();
  await fakeNetwork(talk);
  await talk.addInitScript(FAKE_SPEECH + ";window.__speechPhrase = '12.50 for lunch at Chipotle yesterday';");
  await talk.goto(url, { waitUntil: 'load' });
  await talk.click('.nb-pages button:nth-child(2)');
  await talk.click('.say-bar .mic-btn');
  await talk.waitForSelector('.say-bar.live');
  await talk.waitForFunction(() => document.querySelector('[data-test="quick-note"]').value.includes('Chipotle'));
  await talk.click('[data-test="say-add"]');
  await talk.waitForSelector('#review');
  assert.match(await talk.textContent('.draft-card >> nth=0'), /Chipotle/, 'dictated words become a draft');
  assert.equal(await talk.$('.say-bar.live'), null, 'the bar leaves recording mode when done');
  await talk.close();

  // Rwandan francs in the live rates.
  await page.click('.nb-pages button:nth-child(1)');
  assert.match(await page.textContent('.fx'), /RWF/, 'Rwandan franc rate appears');

  // A long subscription list stays compact.
  const many = await context.newPage();
  const names = ['Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Hulu', 'Max', 'Apple Music', 'iCloud+', 'Google One', 'Dropbox', 'Notion', 'Figma', 'GitHub', 'Vercel', 'Cursor', 'Claude', 'ChatGPT', 'Canva', 'Adobe Creative Cloud', 'Duolingo', 'Headspace', 'Calm', 'Strava', 'Audible', 'Crunchyroll', 'Peacock', 'Paramount+', 'Tidal', 'NordVPN', '1Password'];
  const subs = names.map((n, i) => ({ id: 's' + i, name: n, domain: '', logo: null, amount: 5 + i, currency: i % 5 === 0 ? 'RWF' : 'USD', cycle: 'monthly', next: '2026-12-0' + ((i % 9) + 1) }));
  await fakeNetwork(many, { data: { base: 'USD', subscriptions: subs, guide: { done: true } }, version: 1 });
  await many.goto(url, { waitUntil: 'load' });
  await many.waitForSelector('.acct-dot.saved');
  assert.equal(await many.locator('[data-test="subs-list"] .sub-row').count(), 6, '30 subscriptions show 6 at first');
  assert.match(await many.textContent('[data-test="subs-more"]'), /Show 24 more/, 'the rest sit behind a toggle');
  await many.click('[data-test="subs-more"]');
  assert.equal(await many.locator('[data-test="subs-list"] .sub-row').count(), 30, 'all 30 appear when expanded');
  await many.close();

  // First-time guide: a welcome note, then one step per part of the app, once per person.
  const fresh = { data: null, version: 0 };
  const guideCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const guide = await guideCtx.newPage();
  guide.on('pageerror', e => errors.push(`guide page error: ${e.message}`));
  await fakeNetwork(guide, fresh);
  await guide.goto(url, { waitUntil: 'load' });
  await guide.waitForSelector('[data-test="guide"]');
  assert.match(await guide.textContent('[data-test="guide"]'), /Welcome to Budgie, Willy/, 'new people get a welcome note');
  let steps = 0;
  let seen = '';
  while (await guide.$('[data-test="guide"]')) {
    const label = await guide.textContent('[data-test="guide-next"]');
    seen += await guide.textContent('[data-test="guide"]');
    await guide.click('[data-test="guide-next"]');
    steps++;
    if (/Start using/.test(label)) break;
    await guide.waitForTimeout(400);
  }
  assert.ok(steps >= 8, `the guide walks through the app (${steps} steps)`);
  // A new account starts empty: no sample entries, and each card says what to add.
  await guide.waitForSelector('[data-test="guide"]', { state: 'detached' });
  await guide.click('.nb-pages button:nth-child(1)');
  const body = await guide.textContent('body');
  assert.doesNotMatch(body, /Trader Joe|sample data|Sample balances|Investment portfolio/i, 'a new account has no sample data');
  assert.ok((await guide.locator('.empty-note').count()) >= 4, 'empty cards explain what to add');
  await guide.click('[data-test="add-account"]');
  await guide.fill('.acc-form input[aria-label="Account name"]', 'Bank of Kigali');
  await guide.fill('.acc-form input[aria-label="Balance today"]', '250000');
  await guide.click('.acc-form .pick-btn >> nth=1');
  await guide.click('.pick-pop .pick-opt:has-text("RWF")');
  await guide.click('.acc-form button[type="submit"]');
  assert.match(await guide.textContent('[data-test="accounts"]'), /Bank of Kigali[\s\S]*RWF/, 'you can add your own account');
  await guide.click('[data-test="add-goal"]');
  await guide.fill('.goal-form input[aria-label="Goal name"]', 'Emergency fund');
  await guide.fill('.goal-form input[aria-label="Target"]', '5000');
  await guide.fill('.goal-form input[aria-label="Saved so far"]', '1000');
  await guide.click('.goal-form button[type="submit"]');
  assert.match(await guide.textContent('[data-test="goals"]'), /Emergency fund[\s\S]*20%/, 'you can add your own goal');
  assert.match(seen, /private key stays on your device/, 'the guide explains how passkeys work');
  assert.match(seen, /Losing your device/, 'the guide explains the risks');
  await guide.waitForSelector('[data-test="guide"]', { state: 'detached' });
  await guide.waitForFunction(() => document.querySelector('.acct-dot.saved'));
  await guide.waitForTimeout(1500);
  assert.equal(fresh.data?.guide?.done, true, 'finishing the guide is saved to the account');
  await guide.reload({ waitUntil: 'load' });
  await guide.waitForSelector('.nb-pages');
  await guide.waitForTimeout(800);
  assert.equal(await guide.$('[data-test="guide"]'), null, 'the guide does not come back');
  await guide.click('[data-test="account"]');
  // The AI helper: turning on the in-browser model either starts it or explains why it cannot.
  await guide.waitForSelector('[data-test="ai-panel"]');
  const aiText = await guide.textContent('[data-test="ai-panel"]');
  assert.match(aiText, /On/, 'AI is on by default');
  assert.match(aiText, /Qwen 2\.5[\s\S]*Llama 3\.2/, 'both browser models are listed');
  assert.match(aiText, /best for receipts[\s\S]*best for writing/, 'each model has its job');
  // Here the models cannot download, so Budgie must fall back without breaking.
  await guide.waitForFunction(() => /Not available|Downloading|Waiting|cannot run/.test(document.querySelector('[data-test="ai-panel"]').textContent), null, { timeout: 30000 });
  guide.once('dialog', d => d.accept());
  await guide.click('[data-test="ai-toggle"]');
  await guide.waitForFunction(() => /AI is off on this device/.test(document.querySelector('[data-test="ai-panel"]').textContent));
  assert.equal(await guide.evaluate(() => localStorage.getItem('budgie.ai')), 'off', 'turning AI off is remembered on this device');
  await guide.click('[data-test="ai-toggle"]');
  await guide.click('[data-test="replay-guide"]');
  await guide.waitForSelector('[data-test="guide"]');
  await guide.click('[data-test="guide-skip"]');
  await guideCtx.close();

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
