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
    [3, 'Planet Fitness', -25, 'Health'], [33, 'Planet Fitness', -25, 'Health'],
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
    if (p === '/api/markets') return route.fulfill({ json: {
      updatedAt: new Date().toISOString(), source: 'Yahoo Finance',
      indexes: [{ symbol: '^GSPC', name: 'S&P 500', about: 'x', price: 6120.5, currency: 'USD', day: 0.8, month: 2.1, year: null, spark: [1, 2, 3, 2, 4] }, { symbol: '^IXIC', name: 'Nasdaq', about: 'x', price: 19850, currency: 'USD', day: 1.1, month: 3.4, year: null, spark: [1, 3, 2, 4] }, { symbol: '^DJI', name: 'Dow Jones', about: 'x', price: 43210, currency: 'USD', day: 0.3, month: 0.9, year: null, spark: [2, 2, 3, 3] }, { symbol: '^TNX', name: '10-year Treasury yield', about: 'x', price: 4.12, currency: 'USD', day: -1.2, month: -0.5, year: null, spark: [3, 2, 1] }],
      watch: [{ symbol: 'VTI', name: 'US stock market', about: 'x', price: 310, currency: 'USD', day: 0.5, month: 1.9, year: 14.2, spark: [1, 2] }, { symbol: 'BND', name: 'Bonds', about: 'x', price: 72, currency: 'USD', day: 0.1, month: 0.4, year: 3.1, spark: [1, 2] }],
      news: [{ title: 'Stocks rise as the Fed holds rates', link: 'https://finance.yahoo.com/news/a.html', source: 'Reuters', date: new Date().toUTCString() }],
    } });
    if (p === '/api/calendar') {
      const { url } = JSON.parse(req.postData());
      if (!/^https:\/\//.test(url)) return route.fulfill({ status: 400, json: { error: 'Use the https or webcal link of the calendar.' } });
      const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      return route.fulfill({ json: { kind: 'canvas', name: 'Fall courses', events: [{ uid: 'a1', title: 'Lab report [CHEM 110 Fall 2026]', start: { date: inDays(3) }, end: null, location: '', url: 'https://school.instructure.com/courses/1', notes: '', repeat: null }] } });
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
  for (const label of ['Savings goals', 'Net worth', 'Plan', 'Cash flow', 'Exchange rates', 'Subscriptions', 'Expense breakdown', 'Upcoming payments', 'Wallets']) {
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

  await page.click('.nb-pages button:has-text("Transactions")');
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

  // Paying with an account: the note names the card, the entry links to it, and its balance drops.
  await page.fill('[data-test="quick-note"]', 'lunch 12 at Sweetgreen today with my chase card');
  await page.press('[data-test="quick-note"]', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.draft-card')].some(c => /Sweetgreen/.test(c.textContent)));
  const sg = page.locator('.draft-card', { hasText: 'Sweetgreen' });
  assert.match(await sg.locator('[data-test="draft-account"]').textContent(), /Chase checking/, 'the note links the entry to the Chase account');
  assert.doesNotMatch(await sg.locator('.draft-name').textContent(), /chase/i, 'the payment method is not taken for the shop');
  await sg.locator('.round-btn.ok').click();
  assert.match(await page.textContent('[data-test="accounts"]'), /\$2,488\.00/, 'the Chase balance drops by the amount spent');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-test="accounts"] .acc-icon >> nth=0')]);
  await chooser.setFiles({ name: 'chase.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => document.querySelector('[data-test="accounts"] .acc-icon img')?.src.startsWith('data:image/png'));

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

  // AI everywhere: short notes next to sections and suggestions in the corner.
  assert.match(await page.textContent('[data-test="hint-ledger"]'), /purchases? this week/, 'recent activity has an AI note');
  assert.match(await page.textContent('[data-test="hint-budgets"]'), /budget|on track|%/, 'budgets have an AI note');
  // Notifications live behind the bell in the top bar.
  assert.ok(Number(await page.textContent('[data-test="bell-count"]')) > 0, 'the bell shows how many notifications are new');
  await page.click('[data-test="bell"]');
  const items = page.locator('[data-test="bell-item"]');
  const before = await items.count();
  assert.ok(before > 0, 'the dropdown lists the notifications');
  await items.first().hover();
  await page.waitForTimeout(200);
  assert.equal(await page.textContent('[data-test="bell-tip"]'), await items.first().locator('.bell-body').textContent(), 'each notification has a tooltip with the full message');
  assert.equal(await page.$('[data-test="bell-count"]'), null, 'opening the bell marks them as seen');
  await items.first().locator('button:has-text("Dismiss")').click();
  assert.equal(await items.count(), before - 1, 'a dismissed notification goes away');
  await page.keyboard.press('Escape');
  assert.equal(await page.$('[data-test="bell-pop"]'), null, 'Escape closes the dropdown');
  assert.ok(await page.$('#accounts'), 'accounts live on the Transactions page');

  // Repeating payments: found in the activity and tracked as a subscription in one click.
  await page.waitForSelector('#recurring');
  assert.match(await page.textContent('#recurring'), /Planet Fitness[\s\S]*2 times over 2 months/, 'a monthly payment is spotted');
  await page.click('[data-test="track-recurring"]');
  assert.equal(await page.$('#recurring'), null, 'once tracked, it is no longer suggested');
  const [csvFile] = await Promise.all([page.waitForEvent('download'), page.click('[data-test="export-csv"]')]);
  assert.match(csvFile.suggestedFilename(), /^budgie-entries-\d{4}-\d{2}-\d{2}\.csv$/, 'entries export as a CSV file');
  assert.match(require('node:fs').readFileSync(await csvFile.path(), 'utf8'), /^Date,Merchant,Amount,Currency,Category,Account,Source\n[\s\S]*Planet Fitness/, 'the CSV has a header and the entries');

  // Markets: news and savings ideas use the whole page.
  await page.click('.nb-pages button:has-text("Markets")');
  assert.match(await page.textContent('.nb-pages button:has-text("Markets")'), /Markets/, 'the third page is called Markets');
  assert.equal(await page.$('#activity'), null, 'All activity is gone from this page');
  assert.equal(await page.$('#reports'), null, 'Year in numbers is gone from this page');
  assert.equal(await page.$('.insight'), null, 'the old "What Budgie thinks" card is gone');
  await page.waitForSelector('#markets .mk-tile');
  const mk = await page.textContent('#markets');
  assert.match(await page.textContent('[data-test="markets-headline"]'), /^Stocks rise, led by tech as bond yields ease$/, 'the brief opens with a headline written from the numbers');
  assert.match(await page.textContent('[data-test="market-status"]'), /^US markets (open|closed)/, 'it says whether US markets are open');
  assert.match(await page.textContent('[data-test="money-today"]'), /Net worth[\s\S]*\$[\d,]+[\s\S]*Emergency cushion[\s\S]*months/, '"Your money today" uses your accounts and goals');
  assert.match(mk, /S&P 500[\s\S]*\+0\.8%/, 'market indexes show today\'s change');
  assert.match(mk, /4\.12%/, 'the Treasury yield shows as a percentage');
  assert.match(mk, /US stock market[\s\S]*\+14\.2%[\s\S]*Bonds/, 'markets to watch are ranked by the past year');
  assert.match(mk, /not financial advice/i, 'markets are labelled as information, not advice');
  assert.equal(await page.getAttribute('#markets .mkt-lead', 'rel'), 'noopener noreferrer', 'the lead story opens safely');
  assert.match(await page.textContent('#markets .mkt-lead'), /Stocks rise as the Fed holds rates[\s\S]*Reuters/, 'the first headline is the lead story');
  assert.equal(await page.$('footer'), null, 'there is no footer');
  assert.equal(await page.textContent('[data-test="growth-total"]'), '$31,056', 'the growth calculator works out $200 a month for 10 years at 5%');
  await page.click('[data-test="growth"] .chip-btn:has-text("Bold")');
  assert.notEqual(await page.textContent('[data-test="growth-total"]'), '$31,056', 'a bolder return changes the estimate');
  assert.match(await page.textContent('#opportunities'), /Chase/, 'Chase opportunities appear');
  assert.match(await page.textContent('#opportunities'), /Bank of America/, 'Bank of America opportunities appear');

  // Playground: messy notes become an organised plan, then budgets.
  await page.click('.nb-pages button:has-text("Playground")');
  await page.fill('[data-test="scratch"]', 'salary 4000\nrent 1500, groceries maybe 450\nnetflix 15.49, github 4\nsave 1200 for laptop by june');
  await page.click('[data-test="organize"]');
  assert.match(await page.textContent('.lane[data-group="Needs"]'), /Rent/, 'rent lands in needs');
  assert.match(await page.textContent('.lane[data-group="Wants"]'), /Netflix/, 'Netflix lands in wants');
  assert.match(await page.textContent('.lane[data-group="Goals"]'), /Laptop/i, 'the laptop goal lands in goals');
  assert.equal(await page.inputValue('[data-test="plan-income"]'), '4000', 'income is picked up from the notes');
  // Scenarios: save this plan, change it, then open the saved one again.
  await page.fill('[data-test="scenario-name"]', 'Current job');
  await page.click('[data-test="save-scenario"]');
  await page.fill('[data-test="plan-income"]', '9000');
  await page.click('[data-test="load-scenario"]');
  assert.equal(await page.inputValue('[data-test="plan-income"]'), '4000', 'opening a saved scenario brings its plan back');
  await page.click('[data-test="apply-plan"]');
  await page.click('.nb-pages button:has-text("Transactions")');
  assert.match(await page.textContent('#budgets'), /\$1,500/, 'the plan sets the housing budget');
  await page.click('.nb-pages button:has-text("Overview")');

  // Planner: type anything, and Budgie works out when, how often and how important.
  await page.click('.nb-pages button:has-text("Planner")');
  await page.waitForSelector('[data-test="planner"]');
  assert.match(await page.textContent('[data-test="planner-summary"]'), /Nothing planned for today yet/, 'an empty planner says so');
  await page.fill('[data-test="plan-add"]', 'Essay 2 due tomorrow 5pm #English');
  assert.match(await page.textContent('[data-test="plan-preview"]'), /Assignment[\s\S]*Tomorrow[\s\S]*5 PM[\s\S]*#English[\s\S]*Essay 2/, 'the preview shows what Budgie understood');
  await page.press('[data-test="plan-add"]', 'Enter');
  assert.match(await page.textContent('.pln-group[data-group="Tomorrow"]'), /Essay 2[\s\S]*5 PM[\s\S]*Assignment[\s\S]*#English[\s\S]*High/, 'a deadline tomorrow lands in Tomorrow, marked high priority');
  await page.fill('[data-test="plan-add"]', 'Gym MWF 6pm');
  await page.click('[data-test="plan-add-btn"]');
  assert.match(await page.textContent('.pln-group[data-group="Routines and classes"]'), /Gym[\s\S]*6 PM[\s\S]*Mon Wed Fri/, 'a habit repeats on its days');
  await page.fill('[data-test="plan-add"]', 'haircut today $25');
  await page.press('[data-test="plan-add"]', 'Enter');
  await page.click('.pln-group[data-group="Today"] [data-test="task-check"]');
  assert.match(await page.textContent('.pln-main'), /Show 1 done/, 'a ticked task moves to the done list');
  // Suggestions: a deadline tomorrow with no plan gets a work session.
  const idea = page.locator('[data-test="suggestion"]', { hasText: 'Work on Essay 2 today' });
  await idea.locator('button:has-text("Add")').click();
  assert.match(await page.textContent('.pln-group[data-group="Today"]'), /Work on Essay 2/, 'an accepted suggestion becomes a task for today');
  // Routine built from wake and sleep times and a few words.
  await page.fill('[data-test="routine-text"]', 'gym 3x a week at 6pm, call friends sundays');
  await page.click('[data-test="routine-build"]');
  await page.waitForSelector('[data-test="routine-draft"]');
  assert.match(await page.textContent('[data-test="routine-draft"]'), /7 AM[\s\S]*Wake up[\s\S]*Shower[\s\S]*Call friends[\s\S]*Sun/, 'the routine starts at wake-up and includes what you wrote');
  await page.click('[data-test="routine-save"]');
  assert.match(await page.textContent('.pln-group[data-group="Routines and classes"]'), /Wake up[\s\S]*Sleep/, 'the routine is saved to the planner');
  // Calendars: a Canvas link brings assignments in, with the course as the project.
  await page.fill('[data-test="feed-url"]', 'webcal://school.instructure.com/feeds/calendars/user_abc.ics');
  await page.click('[data-test="feed-add"]');
  await page.waitForSelector('.pln-feeds li');
  assert.match(await page.textContent('[data-test="calendars"]'), /Canvas[\s\S]*Fall courses[\s\S]*1 event/, 'the calendar is listed with its name');
  assert.match(await page.textContent('.pln-group[data-group="This week"]'), /Lab report[\s\S]*Assignment[\s\S]*#CHEM 110[\s\S]*From calendar/, 'Canvas items become assignments with the course');
  await page.click('.pln-filter .chip-btn:has-text("#English")');
  assert.doesNotMatch(await page.textContent('.pln-main'), /Lab report/, 'filtering by project hides the rest');
  await page.click('.pln-filter .chip-btn:has-text("Everything")');
  // The other views.
  await page.click('[data-test="view-agenda"]');
  assert.match(await page.textContent('[data-test="agenda-day"] >> nth=0'), /Today[\s\S]*Haircut/, 'the agenda starts with today');
  await page.click('[data-test="view-week"]');
  assert.equal(await page.locator('[data-test="week"] .pln-wday').count(), 7, 'the week has seven days');
  await page.click('[data-test="view-focus"]');
  assert.match(await page.textContent('[data-test="focus"]'), /done today/, 'focus shows progress for today');
  assert.match(await page.textContent('.pln-top'), /Essay 2/, 'the top three include the deadline');
  await page.click('.pln-top li:has-text("Essay 2") button:has-text("Focus 25 min")');
  assert.match(await page.textContent('[data-test="timer"]'), /Essay 2[\s\S]*2[45]:\d\d/, 'a focus timer starts');
  await page.click('[data-test="view-tasks"]');
  // SHOTS=<folder> saves screenshots of the Planner for a visual check.
  if (process.env.SHOTS) {
    await page.click('.pln-group[data-group="Tomorrow"] .tk-main');
    for (const v of ['tasks', 'agenda', 'week', 'focus']) { await page.click(`[data-test="view-${v}"]`); await page.screenshot({ path: `${process.env.SHOTS}/planner-${v}.png`, fullPage: true }); }
    await page.click('[data-test="view-tasks"]');
  }
  // Money follows: the haircut with a cost waits in Transactions, and the bell knows about today.
  await page.click('.nb-pages button:has-text("Transactions")');
  await page.waitForSelector('#review');
  assert.match(await page.textContent('#review'), /Haircut[\s\S]*From Planner/, 'a ticked task with a cost becomes an entry to review');
  await page.click('[data-test="discard-all"], #review button:has-text("Discard all")');
  await page.click('[data-test="bell"]');
  assert.match(await page.textContent('[data-test="bell-pop"]'), /on today|due tomorrow/, 'the bell mentions what is due');
  await page.click('[data-test="bell"]');

  // Sentences with relative dates become clean drafts.
  await page.click('.nb-pages button:has-text("Transactions")');
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
  await talk.click('.nb-pages button:has-text("Transactions")');
  await talk.click('.say-bar .mic-btn');
  await talk.waitForSelector('.say-bar.live');
  await talk.waitForFunction(() => document.querySelector('[data-test="quick-note"]').value.includes('Chipotle'));
  await talk.click('[data-test="say-add"]');
  await talk.waitForSelector('#review');
  assert.match(await talk.textContent('.draft-card >> nth=0'), /Chipotle/, 'dictated words become a draft');
  assert.equal(await talk.$('.say-bar.live'), null, 'the bar leaves recording mode when done');
  await talk.close();

  // Rwandan francs in the live rates.
  await page.click('.nb-pages button:has-text("Overview")');
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
  await guide.click('.nb-pages button:has-text("Overview")');
  const body = await guide.textContent('body');
  assert.doesNotMatch(body, /Trader Joe|sample data|Sample balances|Investment portfolio/i, 'a new account has no sample data');
  assert.ok((await guide.locator('.empty-note').count()) >= 4, 'empty cards explain what to add');
  await guide.click('.nb-pages button:has-text("Transactions")');
  await guide.click('[data-test="add-account"]');
  await guide.fill('.acc-form input[aria-label="Account name"]', 'Bank of Kigali');
  await guide.fill('.acc-form input[aria-label="Balance today"]', '250000');
  await guide.click('.acc-form .pick-btn >> nth=1');
  await guide.click('.pick-pop .pick-opt:has-text("RWF")');
  await guide.click('.acc-form button[type="submit"]');
  assert.match(await guide.textContent('[data-test="accounts"]'), /Bank of Kigali[\s\S]*RWF/, 'you can add your own account');
  await guide.click('.nb-pages button:has-text("Overview")');
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
  const sheet = await guide.locator('.acct-sheet').boundingBox();
  const vp = guide.viewportSize();
  assert.ok(Math.abs(sheet.x - 75) < 2 && Math.abs(sheet.y - 75) < 2 && Math.abs(vp.width - sheet.x - sheet.width - 75) < 2 && Math.abs(vp.height - sheet.y - sheet.height - 75) < 2, `the settings card leaves 75px on every side (${JSON.stringify(sheet)})`);
  assert.equal(await guide.locator('[data-test="account"]').evaluate(e => getComputedStyle(e).borderRadius), '50%', 'the account button is round');
  const [dl] = await Promise.all([guide.waitForEvent('download'), guide.click('[data-test="download-data"]')]);
  assert.match(dl.suggestedFilename(), /^budgie-data-.*\.json$/, 'you can download a copy of your data');
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
  await mobile.click('.nb-pages button:has-text("Planner")');
  await mobile.click('[data-test="view-week"]');
  if (process.env.SHOTS) await mobile.screenshot({ path: `${process.env.SHOTS}/planner-phone.png`, fullPage: true });
  const planOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(planOverflow <= 0, `the Planner fits a phone (overflow ${planOverflow}px)`);

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
