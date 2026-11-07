// Smoke test for the built Budgie web app. Serves dist/, fakes the live
// account server so the test runs offline, then checks Today, the Planner,
// Digests, the Playground, voice, search and the first-run guide.
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
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Money data saved by an older version of Budgie: it must be dropped.
const fakeAccount = { data: { guide: { done: true }, transactions: [{ id: 't1', date: inDays(0), merchant: 'Old shop', amount: -10, currency: 'USD', category: 'Shopping' }], subscriptions: [{ id: 's1', name: 'Old sub', amount: 5, currency: 'USD', cycle: 'monthly', next: inDays(3) }], goals: [{ id: 'g0', name: 'Emergency fund', saved: 1200, target: 5000 }], base: 'USD' }, version: 1 };
// A sample edition, as the server would write it from free sources.
const { sampleEdition, olderEditions } = require('./fixtures/sample-edition.cjs');
async function fakeApi(page, account = fakeAccount) {
  account.digests = account.digests || olderEditions();
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
    if (p === '/api/digests' && req.method() === 'GET') {
      const editions = {};
      for (const d of account.digests) (editions[d.stream] ||= []).push({ id: d.id, edition: d.edition, dateLong: d.dateLong, preheader: d.preheader, createdAt: d.createdAt });
      return route.fulfill({ json: { editions } });
    }
    const one = p.match(/^\/api\/digests\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})$/);
    if (one) return route.fulfill({ json: account.digests.find(d => d.stream === one[1] && d.id === one[2]) || {} });
    if (p === '/api/digests' && req.method() === 'POST') {
      const { stream } = JSON.parse(req.postData());
      // Like the real server: written from what is saved in the account.
      account.lastWrite = { stream, me: account.data?.me, key: account.data?.digest?.geminiKey };
      const ed = { ...sampleEdition(), stream: stream.id, name: stream.name, provider: account.data?.digest?.geminiKey ? 'Gemini with Google Search and free sources' : 'free sources', topics: stream.focus ? [stream.focus] : ['robotics'] };
      if (stream.focus) ed.lead = { ...ed.lead, headline: `This week in ${stream.focus}` };
      account.digests = [ed, ...account.digests.filter(d => !(d.stream === ed.stream && d.id === ed.id))];
      return route.fulfill({ json: ed });
    }
    if (/^\/api\/digests\/[a-z0-9-]+$/.test(p) && req.method() === 'DELETE') {
      const id = p.split('/').pop();
      account.digests = account.digests.filter(d => d.stream !== id);
      return route.fulfill({ json: { ok: true } });
    }
    if (p === '/api/calendar') {
      const { url } = JSON.parse(req.postData());
      if (!/^https:\/\//.test(url)) return route.fulfill({ status: 400, json: { error: 'Use the https or webcal link of the calendar.' } });
      return route.fulfill({ json: { kind: 'canvas', name: 'Fall courses', events: [{ uid: 'a1', title: 'Lab report [CHEM 110 Fall 2026]', start: { date: inDays(3) }, end: null, location: '', url: 'https://school.instructure.com/courses/1', notes: '', repeat: null }] } });
    }
    if (p === '/api/recovery-codes') return route.fulfill({ json: { left: 8 } });
    if (p === '/api/passkeys') return route.fulfill({ json: { passkeys: [{ id: 'k1', label: 'Mac', created_at: Date.now(), last_used_at: Date.now() }] } });
    if (p === '/api/people') return route.fulfill({ json: { people: [{ id: 'u1', name: 'Willy', role: 'owner', last_seen: Date.now() }], invites: [] } });
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
}
const fakeNetwork = (page, account) => fakeApi(page, account);
const tab = name => `.nb-pages button:has-text("${name}")`;

async function run(url) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`page error: ${e.message}`));
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) errors.push(`CSP: ${m.text()}`); });
  await fakeNetwork(page);
  await page.goto(url, { waitUntil: 'load' });

  // Four pages, starting with Today. The money side is gone.
  assert.deepEqual(await page.$$eval('.nav-bar .nb-pages button', b => b.map(x => x.textContent.trim())), ['Today', 'Planner', 'Digests', 'Playground'], 'the four pages');
  assert.ok(Object.keys(headers).length >= 5, 'security headers are configured');
  await page.waitForSelector('[data-test="today"]');
  assert.match(await page.textContent('[data-test="today"] .lede'), /Budgie starts empty|Today you have|Nothing is planned/, 'Today opens with your day');
  assert.doesNotMatch(await page.textContent('body'), /Net worth|Transactions|Subscriptions|Exchange rates|Emergency fund|Old shop/i, 'no money anywhere');
  await page.waitForFunction(() => document.querySelector('.acct-dot.saved'));
  await page.waitForTimeout(1200);
  assert.equal(fakeAccount.data.transactions, undefined, 'old money data is removed from the account on the next save');
  assert.equal(fakeAccount.data.subscriptions, undefined, 'old subscriptions are removed');
  assert.deepEqual(fakeAccount.data.goals, [], 'old savings goals are removed');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/today-empty.png` });

  // Playground: write anything; Budgie sorts tasks, routines and goals.
  assert.equal(await page.$('[data-test="new"]'), null, 'there is no Add button in the top bar');
  assert.ok(fakeAccount.digests.some(d => d.stream === 'main'), 'My brief is written on its own, even for an empty account');
  await page.click(tab('Playground'));
  await page.fill('[data-test="inbox-text"]', 'Essay 2 due tomorrow 5pm #English\nGym MWF 6pm\nI want to land a summer internship by March\nhaircut today');
  await page.waitForFunction(() => document.querySelectorAll('[data-test="inbox-rows"] li').length === 4);
  const dests = await page.$$eval('[data-test="inbox-rows"] li', rows => rows.map(r => r.querySelector('.inbox-dest.on').textContent.trim()));
  assert.deepEqual(dests, ['Task', 'Routine', 'Goal', 'Task'], 'each line is sorted');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/playground.png` });
  await page.click('[data-test="inbox-send"]');
  assert.match(await page.textContent('[data-test="inbox-done"]'), /Added 4 things/, 'the inbox says what it added');
  // Switch something already added: the haircut becomes a routine, then back to a task.
  const haircut = page.locator('[data-test="inbox-made"]', { hasText: 'Haircut' });
  await haircut.locator('[data-test="made-routine"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-test="inbox-made"]')].some(li => /Haircut/.test(li.textContent) && li.classList.contains('to-routine')));
  await page.locator('[data-test="inbox-made"]', { hasText: 'Haircut' }).locator('[data-test="made-task"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-test="inbox-made"]')].some(li => /Haircut/.test(li.textContent) && li.classList.contains('to-task')));
  // Goals: milestones are planned (by rules here) and land in the Planner.
  await page.waitForSelector('[data-test="goal"]');
  assert.match(await page.textContent('[data-test="goals"]'), /Land a summer internship[\s\S]*0 of 6 steps[\s\S]*by/, 'the goal gets six milestones and its date');
  await page.click('[data-test="goal"] .gl-top');
  await page.click('[data-test="goal"] .gl-steps li >> nth=0 >> input');
  assert.match(await page.textContent('[data-test="goal"]'), /1 of 6 steps[\s\S]*17%/, 'ticking a milestone moves the goal');
  await page.fill('[data-test="goal-title"]', 'Run a 10K by March');
  await page.click('[data-test="goal-add"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-test="goal"]').length === 2);
  assert.match(await page.textContent('[data-test="projects"]'), /#English/, 'projects are listed from your tasks');
  // Routine, built here in the Playground.
  await page.fill('[data-test="routine-text"]', 'call friends sundays');
  await page.click('[data-test="routine-build"]');
  await page.waitForSelector('[data-test="routine-draft"]');
  assert.match(await page.textContent('[data-test="routine-draft"]'), /7 AM[\s\S]*Wake up[\s\S]*Call friends[\s\S]*Sun/, 'the routine starts at wake-up and includes what you wrote');
  await page.click('[data-test="routine-save"]');

  // Planner: what the inbox sent is here.
  await page.click(tab('Planner'));
  await page.click('[data-test="view-tasks"]');
  assert.match(await page.textContent('.pln-group[data-group="Tomorrow"]'), /Essay 2[\s\S]*5 PM[\s\S]*Assignment[\s\S]*#English[\s\S]*High/, 'a deadline tomorrow lands in Tomorrow, marked high priority');
  assert.match(await page.textContent('.pln-group[data-group="Routines and classes"]'), /Wake up[\s\S]*Gym[\s\S]*6 PM[\s\S]*Mon Wed Fri/, 'habits and the routine repeat on their days');
  assert.match(await page.textContent('[data-test="planner"]'), /Update your CV and LinkedIn[\s\S]*Land a summer internship/, 'goal milestones are tasks linked to the goal');
  await page.click('.pln-group[data-group="Today"] [data-test="task-check"]');
  assert.match(await page.textContent('.pln-main'), /Show 2 done/, 'a ticked task moves to the done list');
  const idea = page.locator('[data-test="suggestion"]', { hasText: 'Work on Essay 2 today' });
  await idea.locator('[data-test="suggestion-add"]').click();
  assert.match(await page.textContent('.pln-group[data-group="Today"]'), /Work on Essay 2/, 'an accepted suggestion becomes a task for today');
  // Calendars: a Canvas link brings assignments in, with the course as the project.
  await page.fill('[data-test="feed-url"]', 'webcal://school.instructure.com/feeds/calendars/user_abc.ics');
  await page.click('[data-test="feed-add"]');
  await page.waitForFunction(() => /Imported/.test(document.querySelector('[data-test="calendars"]').textContent));
  assert.match(await page.textContent('.pln-group[data-group="This week"]'), /Lab report[\s\S]*Assignment[\s\S]*#CHEM 110[\s\S]*Calendar/, 'Canvas items become assignments with the course');
  // AI breakdown (rules here, since no model runs in the test).
  await page.click('.pln-group[data-group="Tomorrow"] [data-test="row-breakdown"]');
  assert.match(await page.textContent('.pln-group[data-group="Tomorrow"]'), /0\/6/, 'the assignment is broken into six steps');
  // Editing a task: link it to a goal.
  await page.selectOption('.pln-group[data-group="Tomorrow"] [data-test="task-goal"]', { label: 'Run a 10K' });
  // The date and time pickers: one design everywhere.
  const editor = page.locator('.pln-group[data-group="Tomorrow"] [data-test="task-edit"]');
  await editor.locator('[data-test="time-field"]').click();
  await page.waitForSelector('[data-test="time-pop"]');
  if (process.env.SHOTS) { const b = await page.locator('[data-test="time-pop"]').boundingBox(); await page.screenshot({ path: `${process.env.SHOTS}/timepicker.png`, clip: { x: b.x - 60, y: b.y - 50, width: b.width + 120, height: b.height + 70 } }); }
  await page.fill('[data-test="time-pop"] .tp-type', '4:30pm');
  await page.press('[data-test="time-pop"] .tp-type', 'Enter');
  assert.match(await editor.locator('[data-test="time-field"]').textContent(), /4:30 PM/, 'a typed time is picked');
  await editor.locator('[data-test="date-field"]').click();
  await page.waitForSelector('[data-test="date-pop"] .dp-day.today');
  assert.equal(await page.locator('[data-test="date-pop"] .dp-day').count(), 42, 'the date picker shows a six-week month');
  if (process.env.SHOTS) { const b = await page.locator('[data-test="date-pop"]').boundingBox(); await page.screenshot({ path: `${process.env.SHOTS}/datepicker.png`, clip: { x: b.x - 120, y: b.y - 60, width: b.width + 240, height: b.height + 80 } }); }
  await page.keyboard.press('Escape');
  assert.equal(await page.$('[data-test="date-pop"]'), null, 'Escape closes the date picker');
  assert.match(await page.textContent('.pln-group[data-group="Tomorrow"]'), /Run a 10K/, 'a task shows the goal it moves forward');
  // Calendar view: click a slot, add, and the card's actions work.
  await page.click('[data-test="view-calendar"]');
  await page.click('[data-test="cal-week"]');
  assert.equal(await page.locator('.cal-dh').count(), 7, 'the week has seven days');
  const col = page.locator('.cal-col.today');
  await col.scrollIntoViewIfNeeded();
  await page.evaluate(() => { document.querySelector('[data-test="cal-grid"]').scrollTop = 48 * 13; });
  const box = await col.boundingBox();
  await page.mouse.click(box.x + box.width / 2, (await page.locator('[data-test="cal-grid"]').boundingBox()).y + 10);
  await page.waitForSelector('[data-test="cal-pop"]');
  const slot = (await page.textContent('[data-test="cal-pop"] .label')).match(/Today · (\d+(?::30)? [AP]M)/);
  assert.ok(slot, 'the time under the click is offered');
  await page.fill('[data-test="cal-new"]', 'Study group #Chem');
  await page.press('[data-test="cal-new"]', 'Enter');
  const made = page.locator('.cal-col.today [data-test="cal-item"]', { hasText: 'Study group' });
  assert.match(await made.textContent(), new RegExp(`${slot[1]} – `), 'the new item starts at the clicked slot');
  await made.click();
  await page.click('[data-test="cal-done"]');
  await page.keyboard.press('Escape');
  await page.click('[data-test="cal-month"]');
  assert.equal(await page.locator('.cal-mcell').count(), 42, 'the month shows six weeks');
  await page.click('[data-test="view-focus"]');
  assert.match(await page.textContent('.pln-top'), /Essay 2/, 'the top three include the deadline');
  await page.click('.pln-top li:has-text("Essay 2") [data-test="top-focus"]');
  assert.match(await page.textContent('[data-test="timer"]'), /Essay 2[\s\S]*2[45]:\d\d/, 'a focus timer starts');
  await page.click('[data-test="view-tasks"]');

  // Your details and Gemini key live in your profile.
  await page.click('[data-test="account"]');
  await page.waitForSelector('[data-test="profile-you"]');
  await page.fill('[data-test="you-name"]', 'Sam');
  await page.fill('[data-test="you-study"]', 'Electrical Engineering');
  await page.click('[data-test="acct-tab-digests"]');
  await page.fill('[data-test="you-key"]', ' "AIzaTestKey_000000000000000000000000000" ');
  assert.equal(await page.inputValue('[data-test="you-key"]'), 'AIzaTestKey_000000000000000000000000000', 'spaces and quotes are cleaned off a pasted key');
  assert.equal(await page.getAttribute('[data-test="you-key"]', 'type'), 'password', 'the key is hidden');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/settings.png` });
  await page.keyboard.press('Escape');
  await page.click('.overlay', { position: { x: 5, y: 5 } }).catch(() => {});

  // Digests: no form. My brief is always there; a fresh edition uses your profile and key.
  await page.click(tab('Digests'));
  await page.waitForSelector('[data-test="digest"]');
  await page.click('[data-test="generate"]');
  await page.waitForFunction(() => !document.querySelector('[data-test="digest-busy"]'));
  assert.equal(fakeAccount.lastWrite.stream.id, 'main', 'the main digest is written on its own');
  assert.equal(fakeAccount.lastWrite.me.study, 'Electrical Engineering', 'your profile is saved before the server writes');
  assert.match(fakeAccount.lastWrite.key, /^AIza/, 'the Gemini key is in your account for the server');
  const paper = await page.textContent('[data-test="digest"]');
  assert.match(paper, /Saturday Edition[\s\S]*My brief[\s\S]*Robotics lab opens first-year research roles/, 'the edition has a masthead and a lead');
  assert.equal(await page.locator('[data-test="digest-archive"] button').count(), 3, 'past editions show as a timeline');
  assert.match(await page.textContent('[data-test="digest-made"]'), /Gemini with Google Search[\s\S]*following robotics/, 'it says how it was researched and what it follows');
  // The 14-day strip: tap a day to see what is due, from the digest and your Planner.
  await page.click('[data-test="digest-strip"] button.has >> nth=0');
  assert.ok((await page.locator('.dz-dayitems li').count()) >= 1, 'a day shows what is due');
  await page.click('[data-test="digest-strip"] button.on');
  // Finds: filter, search, sort, save, plan, hide.
  assert.equal(await page.locator('[data-test="digest-story"]').count(), 10, 'all finds show');
  await page.click('[data-test="filter-event"]');
  assert.equal(await page.locator('[data-test="digest-story"]').count(), 2, 'filtering by kind');
  await page.click('[data-test="filter-event"]');
  await page.fill('[data-test="digest-search"]', 'solar');
  assert.match(await page.textContent('[data-test="digest-story"]'), /solar microgrids/, 'searching the edition');
  await page.fill('[data-test="digest-search"]', '');
  await page.selectOption('[data-test="digest-sort"]', 'deadline');
  assert.match(await page.textContent('[data-test="digest-story"] >> nth=0'), /Due today[\s\S]*Open source mentorship/, 'sorting by deadline, with a countdown');
  await page.selectOption('[data-test="digest-sort"]', 'fit');
  assert.match(await page.textContent('[data-test="digest-story"] >> nth=0'), /Embedded systems intern[\s\S]*92% fit/, 'best fit first');
  const first = page.locator('[data-test="digest-story"] >> nth=0');
  await first.locator('[data-test="story-save"]').click();
  assert.equal(await first.locator('[data-test="story-plan"]').isDisabled(), true, 'finds due in two weeks are already in the Planner');
  await page.locator('[data-test="digest-story"]', { hasText: 'Free cloud credits' }).locator('[data-test="story-plan"]').click();
  await page.locator('[data-test="digest-story"]', { hasText: 'Remote software internship' }).locator('[data-test="story-hide"]').click();
  assert.equal(await page.locator('[data-test="digest-story"]').count(), 9, '“not for me” hides a find');
  assert.match(await page.textContent('[data-test="digest-saved"]'), /Embedded systems intern/, 'saved finds are kept');
  assert.match(await page.textContent('[data-test="digest-briefing"]'), /3 of 11[\s\S]*acted on/, 'the briefing counts what you acted on');
  assert.match(paper, /Watching: student visa[\s\S]*Not legal advice/, 'the watch box shows its note');
  await page.click('[data-test="draft"]');
  assert.match(await page.inputValue('[data-test="draft-body"]'), /Thank you for your time/, 'a draft opens with its email');
  await page.fill('[data-test="draft-body"]', 'Hello,\n\nA shorter note.\n\nSam');
  await page.click('[data-test="draft-sent"]');
  assert.match(await page.textContent('.dz-out li >> nth=0'), /Sent/, 'a draft can be marked sent');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/digest.png`, fullPage: true });
  // A second digest, tracked as its own tab.
  await page.click('[data-test="digest-add"]');
  await page.fill('[data-test="digest-name"]', 'AI policy news');
  await page.click('[data-test="digest-create"]');
  await page.waitForFunction(() => /This week in AI policy news/.test(document.querySelector('[data-test="digest"]')?.textContent || ''));
  assert.equal(await page.getAttribute('[data-test="digest-tab-ai-policy-news"]', 'aria-selected'), 'true', 'the new digest has its own tab');
  await page.click('[data-test="digest-tab-main"]');
  await page.waitForFunction(() => /Robotics lab opens/.test(document.querySelector('[data-test="digest"]')?.textContent || ''));
  await page.click('.nb-pages button:has-text("Planner")');
  const plannerText = await page.textContent('[data-test="planner"]');
  assert.match(plannerText, /Student hackathon this month/, 'digest deadlines become Planner tasks');
  assert.match(plannerText, /Follow up with Robotics Lab/, 'marking a draft sent adds a follow-up');

  // Today: the day, goals and the latest digest together.
  await page.click(tab('Today'));
  assert.match(await page.textContent('[data-test="brief"]'), /Today you have[\s\S]*deadline/, 'the brief describes the day');
  const tg = await page.textContent('[data-test="today-goals"]');
  assert.ok(/Land a summer internship[\s\S]*1\/6/.test(tg) && /Run a 10K/.test(tg), 'goals show progress');
  assert.match(await page.textContent('[data-test="today-digest"]'), /Robotics lab opens/, 'the latest digest is on Today');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/today.png`, fullPage: true });

  // Search everything; typed text becomes an action.
  await page.fill('[data-test="search"]', 'essay');
  await page.waitForSelector('[data-test="search-pop"]');
  assert.match(await page.textContent('[data-test="search-pop"]'), /Planner[\s\S]*Essay 2/, 'tasks show up in search');
  await page.fill('[data-test="search"]', 'robotics lab');
  assert.match(await page.textContent('[data-test="search-pop"]'), /Digest[\s\S]*Robotics lab/, 'digest stories show up in search');
  await page.fill('[data-test="search"]', 'I want to learn Spanish this year');
  assert.equal(await page.getAttribute('[data-test="search-pop"] .gs-item >> nth=0', 'data-test'), 'act-goal', 'goal-like text offers a goal first');
  await page.fill('[data-test="search"]', 'dentist tomorrow 3pm');
  assert.match(await page.textContent('[data-test="act-task"]'), /Add “Dentist” to Planner[\s\S]*Tomorrow · 3 PM/, 'typed plans become an add-to-Planner action');
  await page.press('[data-test="search"]', 'Enter');
  await page.waitForFunction(() => /Dentist/.test(document.querySelector('.pln-group[data-group="Tomorrow"]')?.textContent || ''), null, { timeout: 5000 });
  await page.click('[data-test="bell"]');
  assert.match(await page.textContent('[data-test="bell-pop"]'), /on today|due tomorrow/, 'the bell mentions what is due');
  await page.click('[data-test="bell"]');

  // Voice in the Playground: several things at once, added and sorted when you stop, with Undo.
  const voice = await context.newPage();
  await fakeNetwork(voice);
  await voice.addInitScript(FAKE_SPEECH + ";window.__speechPhrase = 'essay due friday at 5pm then gym every monday at 6 and I want to read 12 books this year';");
  await voice.goto(url, { waitUntil: 'load' });
  assert.equal(await voice.$('[data-test="voice"]'), null, 'there is no microphone in the top bar');
  await voice.click(tab('Playground'));
  await voice.click('.inbox-pad .mic-btn');
  await voice.waitForFunction(() => /books/.test(document.querySelector('[data-test="inbox-text"]').value));
  assert.equal(await voice.getAttribute('.inbox-pad .mic-btn', 'aria-pressed'), 'true', 'the button shows it is recording');
  if (process.env.SHOTS) await voice.screenshot({ path: `${process.env.SHOTS}/recording.png` });
  await voice.click('.inbox-pad .mic-btn');
  await voice.waitForSelector('[data-test="inbox-done"]');
  const said = await voice.textContent('[data-test="inbox-done"]');
  assert.match(said, /Added 3 things/, 'three things are heard and added when you stop');
  assert.deepEqual(await voice.$$eval('[data-test="inbox-made"]', li => li.map(x => x.className.match(/to-(\w+)/)[1])), ['task', 'routine', 'goal'], 'each is sorted');
  await voice.click('[data-test="inbox-undo"]');
  assert.doesNotMatch(await voice.textContent('[data-test="goals"]'), /Read 12 books/, 'Undo takes it all back');
  await voice.close();

  // First-time guide, once per person, on an empty account.
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
  assert.match(seen, /Four pages[\s\S]*Goals with milestones[\s\S]*Your digest/, 'the guide covers the four pages');
  assert.match(seen, /private key stays on your device/, 'the guide explains how passkeys work');
  await guide.waitForSelector('[data-test="guide"]', { state: 'detached' });
  await guide.click(tab('Today'));
  assert.ok((await guide.locator('.empty-note').count()) >= 1, 'empty cards explain what to add');
  await guide.waitForFunction(() => document.querySelector('.acct-dot.saved'));
  await guide.waitForTimeout(1500);
  assert.equal(fresh.data?.guide?.done, true, 'finishing the guide is saved to the account');
  await guide.click('[data-test="account"]');
  const sheet = await guide.locator('.acct-sheet').boundingBox();
  const vp = guide.viewportSize();
  assert.ok(Math.abs(sheet.x - 75) < 2 && Math.abs(sheet.y - 75) < 2 && Math.abs(vp.width - sheet.x - sheet.width - 75) < 2 && Math.abs(vp.height - sheet.y - sheet.height - 75) < 2, `the settings card leaves 75px on every side (${JSON.stringify(sheet)})`);
  await guide.click('[data-test="acct-tab-data"]');
  const [dl] = await Promise.all([guide.waitForEvent('download'), guide.click('[data-test="download-data"]')]);
  await guide.click('[data-test="acct-tab-profile"]');
  assert.match(dl.suggestedFilename(), /^budgie-data-.*\.json$/, 'you can download a copy of your data');
  // Avatar colour: picked at random, changed with the picker.
  await guide.click('[data-test="avatar"]');
  await guide.click('[data-test="avatar-swatch"] >> nth=3');
  await guide.keyboard.press('Escape');
  assert.equal(await guide.$('[data-test="avatar-pop"]'), null, 'Escape closes the colour picker');
  await guide.waitForTimeout(400);
  assert.equal(await guide.evaluate(() => getComputedStyle(document.querySelector('[data-test="avatar"]')).backgroundColor), 'rgb(5, 150, 105)', 'the colour picker changes your avatar');
  // The AI helper falls back without breaking when models cannot download.
  await guide.click('[data-test="acct-tab-digests"]');
  await guide.waitForSelector('[data-test="ai-panel"]');
  assert.match(await guide.textContent('[data-test="ai-panel"]'), /Qwen 2\.5[\s\S]*Llama 3\.2/, 'both browser models are listed');
  await guide.waitForFunction(() => /Not available|Downloading|Waiting|cannot run|could not/.test(document.querySelector('[data-test="ai-panel"]').textContent), null, { timeout: 30000 });
  await guideCtx.close();

  // Phones: no sideways scrolling.
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on('pageerror', e => errors.push(`mobile page error: ${e.message}`));
  await fakeNetwork(mobile);
  await mobile.goto(url, { waitUntil: 'load' });
  for (const p of ['Today', 'Planner', 'Digests', 'Playground']) {
    await mobile.click(tab(p));
    await mobile.waitForTimeout(150);
    const over = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `${p} fits a phone (overflow ${over}px)`);
    if (process.env.SHOTS) await mobile.screenshot({ path: `${process.env.SHOTS}/phone-${p.toLowerCase()}.png`, fullPage: true });
  }

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
