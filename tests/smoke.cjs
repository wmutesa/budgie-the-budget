// Smoke test for the built Budgie web app. Serves dist/, fakes the live
// account server so the test runs offline, then checks Today, the Schedule,
// the Add button and its review, voice, search and the first-run guide.
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
const geminiCalls = [];
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
    // Gemini with the person's own key: a canned answer, as Google would send it through the server.
    if (p === '/api/gemini/check') return route.fulfill({ json: { ok: true, message: 'Google accepted the key. What you say in Add will be broken down by Gemini.' } });
    if (p === '/api/gemini/breakdown') { geminiCalls.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ json: { items: [
      { title: 'Stats problem set', kind: 'assignment', date: inDays(2), time: '17:00', minutes: 60, repeat: '', days: [], course: 'Statistics' },
      { title: 'Biology midterm', kind: 'exam', date: inDays(5), time: '', minutes: 0, repeat: '', days: [], course: 'Biology' },
      { title: 'Swim', kind: 'routine', date: '', time: '07:00', minutes: 45, repeat: 'weekly', days: ['tue', 'thu'], course: '' },
      { title: 'Call grandma', kind: 'task', date: inDays(1), time: '', minutes: 0, repeat: '', days: [], course: '' },
      { title: 'Learn to play guitar', kind: 'goal', date: '', time: '', minutes: 0, repeat: '', days: [], course: '' },
    ] } }); }
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

  // Two pages, starting with Today. No money side, digests or playground.
  assert.deepEqual(await page.$$eval('.nav-bar .nb-pages button', b => b.map(x => x.textContent.replace('Soon', '').trim())), ['Overview', 'Schedule', 'Focus', 'Reports'], 'the four pages');
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

  // Add: one button. Say or type anything; Budgie sorts it, places it, and you review each one.
  await page.click('[data-test="capture"]');
  // One long run of words with many things in it is split into each one before anything is added.
  await page.fill('[data-test="capture-text"]', 'okay so for chemistry I have a lab report due Monday and a quiz on Wednesday and I need to finish the problem set by Friday then for history I have an essay due next Tuesday and a reading response tomorrow also call mom on Sunday and dad on Saturday gym every Monday and Wednesday at 6 pm number two pay rent on the 1st another thing buy groceries tomorrow and book a dentist appointment next week oh and I want to run a 10K by March plus meditate every morning at 7 and finally email professor Smith about the extension');
  assert.match(await page.textContent('[data-test="capture-sort"]'), /Add 14 things/, 'a long ramble shows as 14 separate things');
  assert.equal(await page.locator('.cap-rows li').count(), 14, 'each one is listed with where it will go');
  await page.fill('[data-test="capture-text"]', 'Essay 2 due tomorrow 5pm #English\nGym MWF 6pm\nI want to land a summer internship by March\nhaircut today');
  assert.match(await page.textContent('[data-test="capture-sheet"]'), /Task[\s\S]*Essay 2[\s\S]*Routine[\s\S]*Gym[\s\S]*Goal[\s\S]*Task[\s\S]*Haircut/, 'each line is sorted before anything is added');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/capture.png` });
  await page.click('[data-test="capture-sort"]');
  await page.waitForSelector('[data-test="capture-review"]');
  assert.match(await page.textContent('.cr-count'), /Review 1 of 4/, 'the review walks through each new thing');
  assert.match(await page.textContent('.cr-where'), /Schedule · Assignment · Tomorrow · 5 PM · #English/, 'it says where the item landed');
  await page.waitForSelector('.cr-hole');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/review.png` });
  assert.equal(await page.locator('[data-task-id].pending').count() > 0, true, 'new items are dashed until kept');
  await page.click('[data-test="review-keep"]');
  await page.click('[data-test="review-keep"]');
  assert.match(await page.textContent('.cr-where'), /Overview · Goals/, 'a goal is shown on Today');
  await page.click('[data-test="review-keep"]');
  // Switch the last one to a routine and back, then keep it.
  await page.click('[data-test="review-routine"]');
  assert.match(await page.textContent('.cr-where'), /Routine/, 'switching changes what it is');
  await page.click('[data-test="review-task"]');
  await page.click('[data-test="review-keep"]');
  assert.equal(await page.$('[data-test="capture-review"]'), null, 'the review ends when everything is decided');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.pending').length), 0, 'nothing is left pending');
  // A second goal; Remove drops a sorted item.
  await page.click('[data-test="capture"]');
  await page.fill('[data-test="capture-text"]', 'I want to run a 10K by March\nnothing important');
  await page.click('[data-test="capture-sort"]');
  await page.click('[data-test="review-keep"]');
  await page.click('[data-test="review-drop"]');
  assert.equal(await page.$('[data-test="capture-review"]'), null, 'the review is done');

  // Schedule: what Add sent is here. No Tasks or Agenda views any more.
  await page.click(tab('Schedule'));
  await page.click('[data-test="cal-day"]');
  await page.waitForSelector('[data-test="schedule"]');
  assert.equal(await page.$('[data-test="view-tasks"], [data-test="view-agenda"]'), null, 'the Schedule has no Tasks or Agenda views');
  assert.equal(await page.$('[data-test="planner"] [data-test="remind"]'), null, 'task reminders live on the Profile page');
  assert.match(await page.textContent('.sch-list'), /activity[\s\S]*Haircut/, 'the Schedule shows today\'s activity by category');
  // A row in the activity list, found by what it says, and its editor.
  const row = text => page.locator('[data-test="sch-row"]', { hasText: text }).first();
  const edit = async text => { await row(text).locator('button[aria-label^="Edit "]').click(); return row(text).locator('[data-test="task-edit"]'); };
  // Deleting is one click in the editor, with Undo in a notification.
  const before = await page.locator('[data-test="sch-row"]').count();
  await (await edit('Haircut')).locator('[aria-label="Delete"]').click();
  assert.equal(await page.locator('[data-test="sch-row"]').count(), before - 1, 'a task is deleted at once');
  await page.click('[data-test="toast"]:has-text("Haircut") .toast-act');
  assert.equal(await page.locator('[data-test="sch-row"]').count(), before, 'Undo brings it back');
  // Ticked things sink to the bottom of their category.
  await row('Haircut').locator('.sch-check').click();
  assert.equal(await page.$$eval('.sch-group', gs => gs.filter(g => { const r = [...g.querySelectorAll('[data-test="sch-row"]')]; const i = r.findIndex(x => x.classList.contains('done')); return i >= 0 && r.slice(i).some(x => !x.classList.contains('done')); }).length), 0, 'done things come last in each category');
  // Suggestions live on the Overview.
  await page.click(tab('Overview'));
  const idea = page.locator('[data-test="suggestion"]', { hasText: 'Work on Essay 2 today' });
  await idea.locator('[data-test="suggestion-add"]').click();
  await page.click(tab('Schedule'));
  assert.ok(await row('Work on Essay 2').count(), 'an accepted suggestion becomes a task for today');
  // Pick a day from the month calendar: tomorrow has the essay.
  await page.click('[data-test="sch-today"]');
  await page.waitForSelector('[data-test="sch-pick"]');
  assert.equal(await page.locator('[data-test="sch-pick"] .sch-pick-d').count(), 42, 'the day picker shows a six-week month');
  if (process.env.SHOTS) { const b = await page.locator('[data-test="sch-pick"]').boundingBox(); await page.screenshot({ path: `${process.env.SHOTS}/daypicker.png`, clip: { x: b.x - 20, y: b.y - 60, width: b.width + 40, height: b.height + 80 } }); }
  await page.click(`[data-test="pick-${inDays(1)}"]`);
  assert.equal(await page.$('[data-test="sch-pick"]'), null, 'picking a day closes the picker');
  assert.match(await row('Essay 2').textContent(), /Essay 2[\s\S]*Assignment[\s\S]*English[\s\S]*High/, 'a deadline shows its kind, #project and high priority');
  // The editor: AI breakdown (rules here, since no model runs in the test), a goal, and the pickers.
  const editor = await edit('Essay 2');
  await editor.locator('[data-test="breakdown"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-test="task-edit"] .tk-subs li').length === 6);
  await editor.locator('[data-test="task-goal"]').selectOption({ label: 'Run a 10K' });
  await editor.locator('[data-test="time-field"]').click();
  await page.waitForSelector('[data-test="time-pop"]');
  if (process.env.SHOTS) { const b = await page.locator('[data-test="time-pop"]').boundingBox(); await page.screenshot({ path: `${process.env.SHOTS}/timepicker.png`, clip: { x: b.x - 60, y: b.y - 50, width: b.width + 120, height: b.height + 70 } }); }
  await page.fill('[data-test="time-pop"] .tp-type', '4:30pm');
  await page.press('[data-test="time-pop"] .tp-type', 'Enter');
  assert.match(await editor.locator('[data-test="time-field"]').textContent(), /4:30 PM/, 'a typed time is picked');
  await editor.locator('[data-test="date-field"]').click();
  await page.waitForSelector('[data-test="date-pop"] .dp-day.today');
  assert.equal(await page.locator('[data-test="date-pop"] .dp-day').count(), 42, 'the date picker shows a six-week month');
  await page.keyboard.press('Escape');
  assert.equal(await page.$('[data-test="date-pop"]'), null, 'Escape closes the date picker');
  // A click outside the row closes its editor.
  await page.click('.sch-title');
  assert.equal(await page.$('[data-test="sch-row"] [data-test="task-edit"]'), null, 'clicking outside closes the row editor');
  await page.click('[data-test="sch-today"]');
  await page.click('.sch-pick-today');
  // Calendars: in the Schedule header. A Canvas link brings assignments in, with the course as the project.
  await page.click('[data-test="calendars-open"]');
  assert.deepEqual(await page.$$eval('.cal-ways button', b => b.map(x => x.textContent.trim())), ['Link', 'File', 'Holidays', 'Type it'], 'more than one way to add a calendar');
  await page.fill('[data-test="feed-url"]', 'webcal://school.instructure.com/feeds/calendars/user_abc.ics');
  await page.click('[data-test="feed-add"]');
  await page.waitForFunction(() => /Imported/.test(document.querySelector('[data-test="calendars"]').textContent));
  assert.match(await page.textContent('[data-test="toasts"]'), /Calendar imported/, 'a notification says the calendar was imported');
  // A Google embed link is turned into the calendar's feed and tried; if it is private, the advice says what to copy.
  await page.fill('[data-test="feed-url"]', 'https://calendar.google.com/calendar/u/0/r');
  await page.click('[data-test="feed-add"]');
  await page.waitForFunction(() => /Calendar not imported[\s\S]*Secret address in iCal format/.test(document.querySelector('[data-test="toasts"]').textContent));
  await page.click('[data-test="way-file"]');
  await page.setInputFiles('[data-test="cal-file"]', { name: 'class.ics', mimeType: 'text/calendar', buffer: Buffer.from(['BEGIN:VCALENDAR', 'X-WR-CALNAME:Uni', 'BEGIN:VEVENT', 'UID:x-1', `DTSTART:${inDays(0).replace(/-/g, '')}T150000`, `DTEND:${inDays(0).replace(/-/g, '')}T160000`, 'SUMMARY:Office hours', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')) });
  await page.waitForSelector('[data-test="sch-box"]:has-text("Office hours")');
  await page.click('[data-test="calendars-open"]');
  // The Canvas assignment is on its due day, with the course as the category.
  await page.click('[data-test="sch-today"]');
  await page.click(`[data-test="pick-${inDays(3)}"]`);
  assert.match(await row('Lab report').textContent(), /Lab report[\s\S]*Assignment[\s\S]*CHEM 110/, 'Canvas items become assignments with the course');
  await page.click('[data-test="sch-today"]');
  await page.click('.sch-pick-today');
  // Week and month live in the Schedule; the list follows them, by category.
  await page.click('[data-test="cal-week"]');
  assert.equal(await page.locator('.cal-dh').count(), 7, 'the week has seven days');
  const wk = page.locator('.cal-col.today [data-test="cal-item"]').first();
  await wk.click();
  await page.waitForSelector('[data-test="cal-pop"]');
  await page.keyboard.press('Escape');
  await page.click('[data-test="cal-month"]');
  assert.equal(await page.locator('.cal-mcell').count(), 42, 'the month shows six weeks');
  await page.click('[data-test="nav-focus"]');
  // Close earlier notifications so none covers the page.
  while (await page.locator('[data-test="toast"] .toast-x').count()) await page.locator('[data-test="toast"] .toast-x').first().click();
  assert.match(await page.textContent('.pln-top'), /Essay 2/, 'the top three include the deadline');
  await page.click('.pln-top li:has-text("Essay 2") [data-test="top-focus"]');
  assert.match(await page.textContent('[data-test="timer"]'), /Essay 2[\s\S]*2[45]:\d\d/, 'a focus timer starts');
  // The tab shows the countdown, its icon becomes a ring, and pause and +5 work.
  assert.match(await page.title(), /^⏱ 2[45]:\d\d · .*Essay 2/, `the tab title counts down (${await page.title()})`);
  // In focus: a pill in the top bar shows the time left; you choose what gets through, and the bell goes quiet.
  assert.match(await page.textContent('[data-test="nb-focus"]'), /2[45]:\d\d/, 'the top bar shows the focus countdown');
  assert.equal(await page.isChecked('[data-test="allow-starting"]'), true, 'by default only things starting now get through');
  await page.check('[data-test="allow-none"]');
  assert.equal(await page.isChecked('[data-test="allow-none"]'), true, 'you can hold everything while you focus');
  assert.equal(await page.$('[data-test="bell-count"]'), null, 'the bell count stays quiet during focus');
  assert.match(await page.getAttribute('link[rel="icon"]', 'href'), /^data:image\/png/, 'the tab icon shows the time left');
  await page.click('[data-test="timer-toggle"]');
  assert.match(await page.title(), /^⏸ /, 'a paused session shows in the title');
  await page.click('[data-test="timer-more"]');
  assert.match(await page.textContent('[data-test="timer"] .pln-clock'), /^(29|30):\d\d$/, 'five more minutes are added');
  // Suggested for you stays below the top bar while the page scrolls, and scrolls inside itself.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  { const nav = await page.locator('.nav-bar').boundingBox(); const card = await page.locator('.fcs-side .pln-card').boundingBox(); const vh = page.viewportSize().height;
    assert.ok(Math.abs(card.y - (nav.y + nav.height)) < 2 && card.y + card.height <= vh + 1, `the suggestions stay in view below the top bar (${JSON.stringify({ nav, card, vh })})`);
    assert.equal(await page.locator('.fcs-side .pln-card').evaluate(e => getComputedStyle(e).overflowY), 'auto', 'long suggestions scroll inside the panel'); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-test="nav-schedule"]');
  // Schedule: today's list by category and a time line with a column per category.
  await page.click('[data-test="cal-day"]');
  // The time line is full height (no scrolling inside), spans the planned hours, and shows
  // untimed things in an Any time row, so the list and the calendar hold the same things.
  { const g = await page.locator('.sch-grid').evaluate(el => ({ scrolls: el.scrollHeight > el.clientHeight + 2 }));
    assert.equal(g.scrolls, false, 'the time line does not scroll inside');
    const listed = await page.$$eval('[data-test="sch-row"]', rs => rs.map(r => r.querySelector('.sch-row-t')?.textContent.trim()));
    const shown = await page.$$eval('[data-test="sch-box"] .sch-box-title, [data-test="sch-chip"]', bs => bs.map(b => b.textContent.trim()));
    assert.deepEqual(listed.filter(t => !shown.includes(t)), [], 'everything in the activity list is also on the calendar'); }
  const boxes = await page.locator('[data-test="sch-box"]').count();
  assert.ok(boxes >= 1, 'timed items sit on the time line');
  await page.click('[data-test="plan-day"]');
  // Late in the day there may be no free time left; then Budgie says so instead.
  await page.waitForFunction(n => document.querySelectorAll('[data-test="sch-box"]').length > n || /no free time left/.test(document.querySelector('[data-test="toasts"]')?.textContent || ''), boxes);
  if (await page.locator('[data-test="sch-box"]').count() > boxes) assert.match(await page.textContent('[data-test="toasts"]'), /Day planned[\s\S]*Undo/, 'Plan my day gives untimed things a time, with Undo');
  await page.locator('[data-test="sch-box"]').first().click({ position: { x: 12, y: 10 } });
  await page.waitForSelector('.sch-sheet [data-test="task-edit"]');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/schedule.png` });
  // A click outside the card closes it.
  await page.click('.sch-title');
  assert.equal(await page.$('.sch-sheet'), null, 'clicking outside the edit card closes it');
  assert.equal(await page.$('[data-test="sch-quick"]'), null, 'nothing sits between the Schedule header and the calendar');
  // Week and month are part of the Schedule; a day opens the day time line.
  await page.click('[data-test="cal-week"]');
  assert.equal(await page.locator('.cal-dh').count(), 7, 'the week is inside the Schedule');
  await page.click('.cal-dh.today');
  await page.waitForSelector('.sch-body');
  await page.click('[data-test="sch-next"]');
  await page.click('[data-test="sch-today"]');
  await page.click('.sch-pick-today');

  // Your details live in your profile; the AI page has no digest settings while digests are on hold.
  await page.click('[data-test="account"]');
  await page.waitForSelector('[data-test="profile-you"]');
  if (process.env.SHOTS) {
    await page.screenshot({ path: `${process.env.SHOTS}/settings-profile.png` });
    for (const id of ['security', 'data']) { await page.click(`[data-test="acct-tab-${id}"]`); await page.waitForTimeout(150); await page.screenshot({ path: `${process.env.SHOTS}/settings-${id}.png` }); }
    await page.click('[data-test="acct-tab-profile"]');
  }
  await page.fill('[data-test="you-name"]', 'Sam');
  await page.fill('[data-test="you-study"]', 'Electrical Engineering');
  assert.match(await page.textContent('[data-test="profile-remind"]'), /Task reminders[\s\S]*10 minutes before/, 'task reminders are a switch on the Profile page');
  assert.equal(await page.textContent('[data-test="acct-tab-digests"]'), 'AI', 'the settings page is called AI for now');
  await page.click('[data-test="acct-tab-digests"]');
  // Your own free Gemini key breaks what you say into items.
  await page.fill('[data-test="you-key"]', 'AIzaSyFakeKeyForTheTest_1234567890');
  await page.click('[data-test="you-key-check"]');
  assert.match(await page.textContent('[data-test="you-key-result"]'), /broken down by Gemini/, 'the key is checked with Google');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/settings.png` });
  await page.keyboard.press('Escape');
  await page.click('.overlay', { position: { x: 5, y: 5 } }).catch(() => {});
  await page.click('[data-test="capture"]');
  await page.fill('[data-test="capture-text"]', 'stats problem set due tuesday at five for statistics and the bio midterm on friday swim tuesdays and thursdays at seven call grandma tomorrow and I want to learn guitar');
  await page.click('[data-test="capture-sort"]');
  await page.waitForSelector('[data-test="capture-review"]');
  assert.equal(geminiCalls.length, 1, 'Gemini is asked once, with the whole note');
  assert.match(geminiCalls[0].today || '', /^\d{4}-\d{2}-\d{2}$/, "today's date goes with it, so Gemini can work out \"tuesday\"");
  // Walk the review: each of Gemini's items is there, with its date, time, repeat and course.
  const reviewed = [];
  for (let i = 0; i < 12 && await page.$('[data-test="capture-review"]'); i++) {
    reviewed.push(`${await page.inputValue('.cr-title')} | ${await page.textContent('.cr-where')}`);
    await page.click('[data-test="review-keep"]');
    await page.waitForTimeout(150);
  }
  const has = (re, what) => assert.ok(reviewed.some(x => re.test(x)), `${what} (${reviewed.join(' ;; ')})`);
  has(/^Stats problem set \| Schedule · Assignment · .* · 5 PM · #Statistics/, 'the assignment keeps its day, time and course');
  has(/^Biology midterm \| Schedule · Exam · .*#Biology/, 'the exam is an exam');
  has(/^Swim \| Schedule · Routine/, 'the weekly swim is a routine');
  has(/^Call grandma \| Schedule · Task · Tomorrow/, 'the call is tomorrow');
  has(/^Learn to play guitar \| Overview · Goals/, 'the goal is a goal');
  // Back to the built-in rules for the rest of the test.
  await page.click('[data-test="account"]');
  await page.click('[data-test="acct-tab-digests"]');
  await page.fill('[data-test="you-key"]', '');
  await page.keyboard.press('Escape');
  await page.click('.overlay', { position: { x: 5, y: 5 } }).catch(() => {});


  // Today: the day, goals and the latest digest together.
  await page.click(tab('Overview'));
  assert.match(await page.textContent('[data-test="brief"]'), /Today you have[\s\S]*deadline/, 'the brief describes the day');
  assert.equal(await page.$('[data-test="ai-brief"]'), null, 'no separate AI note; the next step is part of the summary');
  const tg = await page.textContent('[data-test="today-goals"]');
  assert.ok(/Land a summer internship[\s\S]*0\/6/.test(tg) && /Run a 10K/.test(tg), 'goals show progress');
  assert.equal(await page.$('[data-test="today-digest"]'), null, 'no digest card on Today for now');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/today.png`, fullPage: true });

  // Search everything; typed text becomes an action.
  await page.fill('[data-test="search"]', 'essay');
  await page.waitForSelector('[data-test="search-pop"]');
  assert.match(await page.textContent('[data-test="search-pop"]'), /Schedule[\s\S]*Essay 2/, 'tasks show up in search');
  await page.fill('[data-test="search"]', 'I want to learn Spanish this year');
  assert.equal(await page.getAttribute('[data-test="search-pop"] .gs-item >> nth=0', 'data-test'), 'act-goal', 'goal-like text offers a goal first');
  await page.fill('[data-test="search"]', 'dentist tomorrow 3pm');
  assert.match(await page.textContent('[data-test="act-task"]'), /Add “Dentist” to your schedule[\s\S]*Tomorrow · 3 PM/, 'typed plans become an add-to-schedule action');
  await page.press('[data-test="search"]', 'Enter');
  // It opens on its day, with its card open.
  await page.waitForSelector('.sch-sheet:has-text("Dentist")', { timeout: 5000 });
  await page.click('.sch-title');
  const unreadCount = async () => Number((await page.textContent('[data-test="bell-count"]').catch(() => '0')).replace('+', '')) || 0;
  const unread0 = await unreadCount();
  await page.click('[data-test="bell"]');
  assert.match(await page.textContent('[data-test="bell-pop"]'), /on today|due tomorrow/, 'the bell mentions what is due');
  assert.equal(await unreadCount(), unread0, 'opening the bell does not mark anything read');
  if (unread0 && unread0 <= 9) {
    await page.locator('[data-test="bell-item"].unread').first().focus();
    assert.equal(await unreadCount(), unread0 - 1, 'reading one notification lowers the count by one');
  }
  await page.click('[data-test="bell"]');

  // Voice: tap Add and it listens at once; tap again and it sorts, then the review starts.
  const voice = await context.newPage();
  await fakeNetwork(voice);
  await voice.addInitScript(FAKE_SPEECH + ";window.__speechPhrase = 'essay due friday at 5pm then gym every monday at 6 and I want to read 12 books this year';");
  await voice.goto(url, { waitUntil: 'load' });
  assert.equal(await voice.$('[data-test="voice"]'), null, 'there is no microphone in the top bar');
  await voice.click('[data-test="capture"]');
  await voice.waitForFunction(() => /books/.test(document.querySelector('[data-test="capture-text"]').value));
  assert.equal(await voice.getAttribute('[data-test="capture-mic"]', 'aria-pressed'), 'true', 'it listens as soon as Add opens');
  assert.match(await voice.textContent('[data-test="capture"]'), /Listening/, 'the Add button shows it is listening');
  // Edit while listening: the typed words stay; speech no longer writes over them.
  await voice.focus('[data-test="capture-text"]');
  await voice.keyboard.press('End');
  await voice.keyboard.type(' soon');
  await voice.waitForTimeout(500);
  { const v = await voice.inputValue('[data-test="capture-text"]'); assert.match(v, /books soon this year$|books this year soon$/, `what you type while listening is kept, and later words follow it (${JSON.stringify(v)})`); }
  assert.equal(await voice.$('[data-test="capture-accent"]'), null, 'no accent to pick: listening uses the browser language');
  assert.equal(await voice.$('[data-test="capture-sort"]'), null, 'no Sort button while listening: Stop sorts it');
  if (process.env.SHOTS) await voice.screenshot({ path: `${process.env.SHOTS}/recording.png` });
  // Stop: Budgie breaks what was said into separate things and places each one.
  await voice.click('[data-test="capture-mic"]');
  await voice.waitForSelector('[data-test="capture-review"]');
  assert.match(await voice.textContent('.cr-count'), /of 3/, 'three things are heard and sorted');
  await voice.click('[data-test="review-keep-all"]');
  assert.equal(await voice.$('[data-test="capture-review"]'), null, 'Keep all ends the review');
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
  assert.ok(steps >= 7, `the guide walks through the app (${steps} steps)`);
  assert.match(seen, /Four pages[\s\S]*Add anything[\s\S]*Plan your days[\s\S]*Check before it counts/, 'the guide covers the pages and the Add button');
  assert.match(seen, /private key stays on your device/, 'the guide explains how passkeys work');
  await guide.waitForSelector('[data-test="guide"]', { state: 'detached' });
  await guide.click(tab('Overview'));
  assert.ok((await guide.locator('.empty-note').count()) >= 1, 'empty cards explain what to add');
  await guide.waitForFunction(() => document.querySelector('.acct-dot.saved'));
  await guide.waitForTimeout(1500);
  assert.equal(fresh.data?.guide?.done, true, 'finishing the guide is saved to the account');
  await guide.click('[data-test="account"]');
  const sheet = await guide.locator('.acct-sheet').boundingBox();
  const vp = guide.viewportSize();
  assert.ok(sheet.width <= 990 && Math.abs(sheet.x - (vp.width - sheet.width) / 2) < 2 && Math.abs(sheet.y - 75) < 2 && Math.abs(vp.height - sheet.y - sheet.height - 75) < 2, `the settings card fits its contents, centred, 75px from top and bottom (${JSON.stringify(sheet)})`);
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
  assert.match(await guide.textContent('[data-test="ai-panel"]'), /Qwen 2\.5[\s\S]*Qwen 2\.5 \(1\.5B\)/, 'both browser models are listed');
  await guide.waitForFunction(() => /Not available|Downloading|Waiting|cannot run|could not/.test(document.querySelector('[data-test="ai-panel"]').textContent), null, { timeout: 30000 });
  await guideCtx.close();

  // Phones: no sideways scrolling.
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on('pageerror', e => errors.push(`mobile page error: ${e.message}`));
  await fakeNetwork(mobile);
  await mobile.goto(url, { waitUntil: 'load' });
  for (const p of ['Overview', 'Schedule', 'Focus', 'Reports']) {
    await mobile.click(tab(p));
    await mobile.waitForTimeout(150);
    const over = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `${p} fits a phone (overflow ${over}px)`);
    if (process.env.SHOTS) await mobile.screenshot({ path: `${process.env.SHOTS}/phone-${p.toLowerCase()}.png`, fullPage: true });
  }

  // Full of sample data: how fast it stays.
  const full = await context.newPage();
  await full.setViewportSize({ width: 1440, height: 900 });
  full.on('pageerror', e => errors.push(`full page error: ${e.message}`));
  await fakeNetwork(full);
  await full.goto(url, { waitUntil: 'load' });
  await full.click('[data-test="account"]');
  await full.click('[data-test="acct-tab-data"]');
  await full.click('[data-test="sample-add"]');
  const filled = await full.textContent('[data-test="toast"]:has-text("Sample data")');
  await full.keyboard.press('Escape');
  await full.click('[data-test="account-close"], .acct-sheet [aria-label="Close"]').catch(() => {});
  const timings = { fill: Number(filled.match(/in (\d+) ms/)[1]) };
  const time = async (name, act, ready) => { const t0 = Date.now(); await act(); await full.waitForSelector(ready); timings[name] = Date.now() - t0; if (process.env.SHOTS) await full.screenshot({ path: `${process.env.SHOTS}/full-${name}.png` }); };
  await time('today', () => full.click(tab('Overview')), '[data-test="today-goals"]');
  await time('schedule', async () => { await full.click(tab('Schedule')); await full.click('[data-test="cal-day"]'); }, '[data-test="sch-box"]');
  await time('week', () => full.click('[data-test="cal-week"]'), '.cal-dh');
  await time('month', () => full.click('[data-test="cal-month"]'), '.cal-mcell');
  // With a full month, the list stays a summary: categories folded, done things last when opened.
  assert.ok(await full.locator('.sch-group [data-test="sch-fold"]').count() >= 5, 'the month list is one folded line per category');
  await full.locator('.sch-group [data-test="sch-fold"]').first().click();
  assert.equal(await full.$$eval('.sch-group', gs => gs.filter(g => { const r = [...g.querySelectorAll('[data-test="sch-row"]')]; const i = r.findIndex(x => x.classList.contains('done')); return i >= 0 && r.slice(i).some(x => !x.classList.contains('done')); }).length), 0, 'done things come last in each category');
  await full.click(tab('Overview'));
  assert.ok(await full.locator('[data-test="today-list"] [data-test="task"]').count() <= 5, 'Overview shows only what is next');
  assert.match(await full.textContent('[data-test="today-more"]'), /\d+ more today/, 'the rest is one tap away');
  await time('search', () => (async () => { await full.click(tab('Schedule')); await full.fill('[data-test="search"]', 'lab'); })(), '[data-test="search-pop"]');
  const n = await full.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('budgie.v3'))) || '{}').tasks?.length || 0);
  console.log('with sample data:', n, 'tasks;', Object.entries(timings).map(([k, v]) => `${k} ${v} ms`).join(', '));
  for (const [k, v] of Object.entries(timings)) assert.ok(v < 2500, `${k} stays quick with sample data (${v} ms)`);
  await full.click('[data-test="account"]');
  await full.click('[data-test="acct-tab-data"]');
  await full.click('[data-test="sample-remove"]');
  await full.waitForSelector('[data-test="sample-add"]');
  await full.close();

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
    console.error('smoke test failed:', err.message); if (process.env.STACK) console.error(err.stack);
  } finally {
    server.close();
    server.closeAllConnections();
    process.exit(code);
  }
});
