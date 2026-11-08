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
const voiceCalls = [];
// Live words: each piece of audio the page sends gets the next scripted phrase ('' once they run out; 503 means unavailable).
const liveScript = [];
// Budgie's server AI: answers only while a test sets these items (otherwise it is busy and the rules take over).
let budgieItems = null;
const budgieCalls = [];
let liveCalls = 0;
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
    // Gemini hears a recording: what was said, and the items in it.
    if (p === '/api/voice/breakdown') { budgieCalls.push(JSON.parse(req.postData() || '{}')); return budgieItems ? route.fulfill({ json: { items: budgieItems } }) : route.fulfill({ status: 503, json: { error: 'busy' } }); }
    if (p === '/api/voice/live') { liveCalls++; const body = JSON.parse(req.postData() || '{}'); if (!/^UklGR/.test(body.audio || '')) return route.fulfill({ status: 400, json: { error: 'not wav' } }); const t = liveScript.length ? liveScript.shift() : ''; return t === 503 ? route.fulfill({ status: 503, json: { error: 'Live words are not available right now.' } }) : route.fulfill({ json: { text: t } }); }
    if (p === '/api/gemini/voice') { voiceCalls.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ json: { transcript: 'Lab Report 3 due Friday at 5 pm for chemistry, the history quiz on the 18th, and gym every Monday at 7', items: [
      { title: 'Lab Report 3', kind: 'assignment', date: inDays(3), time: '17:00', minutes: 0, repeat: '', days: [], course: 'Chemistry' },
      { title: 'History quiz', kind: 'exam', date: inDays(10), time: '', minutes: 0, repeat: '', days: [], course: 'History' },
      { title: 'Gym', kind: 'routine', date: '', time: '07:00', minutes: 0, repeat: 'weekly', days: ['mon'], course: '' },
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
  // A fake microphone (a repeating beep) so Budgie's own listening runs for real.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`page error: ${e.message}`));
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) errors.push(`CSP: ${m.text()}`); });
  await fakeNetwork(page);
  await page.goto(url, { waitUntil: 'load' });

  // Two pages, starting with Today. No money side, digests or playground.
  assert.deepEqual(await page.$$eval('.nav-bar .nb-pages button', b => b.map(x => x.textContent.replace('Soon', '').trim())), ['Overview', 'Schedule', 'Progress'], 'the three pages');
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
  await page.locator('body').press('n'); // opens Add for typing
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
  await page.locator('body').press('n'); // opens Add for typing
  await page.fill('[data-test="capture-text"]', 'I want to run a 10K by March\nnothing important');
  await page.click('[data-test="capture-sort"]');
  await page.click('[data-test="review-keep"]');
  await page.click('[data-test="review-drop"]');
  assert.equal(await page.$('[data-test="capture-review"]'), null, 'the review is done');
  // Commands about what is already planned change it; the rest is added. One Undo puts the changes back.
  await page.locator('body').press('n'); // opens Add for typing
  await page.fill('[data-test="capture-text"]', 'haircut is done\nmake essay 2 low priority\nbuy stamps today');
  await page.click('[data-test="capture-sort"]');
  await page.waitForSelector('[data-test="toast"]:has-text("2 changes from what you said")');
  assert.match(await page.textContent('[data-test="toasts"]'), /Done: Haircut[\s\S]*Low priority: Essay 2/, 'the toast says what changed');
  await page.waitForSelector('[data-test="capture-review"]');
  assert.match(await page.textContent('.cr-count'), /of 1/, 'only the new thing is reviewed');
  await page.click('[data-test="review-keep"]');
  await page.click('[data-test="toast"]:has-text("2 changes") .toast-act');

  // Two things at the same time, to check overlapping items on the calendar.
  await page.locator('body').press('n'); // opens Add for typing
  await page.fill('[data-test="capture-text"]', 'Overlap big today at 2pm 120 min\nOverlap small today at 2:30pm 30 min');
  await page.click('[data-test="capture-sort"]');
  await page.click('[data-test="review-keep"]');
  await page.click('[data-test="review-keep"]');

  // Schedule: what Add sent is here. No Tasks or Agenda views any more.
  await page.click(tab('Schedule'));
  await page.click('[data-test="cal-day"]');
  await page.waitForSelector('[data-test="schedule"]');
  assert.equal(await page.$('[data-test="view-tasks"], [data-test="view-agenda"]'), null, 'the Schedule has no Tasks or Agenda views');
  assert.equal(await page.$('[data-test="planner"] [data-test="remind"]'), null, 'task reminders live on the Profile page');
  assert.match(await page.textContent('.sch-list'), /activity[\s\S]*Haircut/, 'the Schedule shows today\'s activity by category');
  // A row in the activity list, found by what it says, and its editor.
  const row = text => page.locator('[data-test="sch-row"]', { hasText: text }).first();
  // The edit icon on a row opens its editor as a card over the thing on the calendar.
  const edit = async text => { await row(text).locator('[data-test="row-edit"]').click(); await page.waitForSelector('[data-test="sch-over"] [data-test="task-edit"]'); return page.locator('[data-test="sch-over"] [data-test="task-edit"]'); };
  // Deleting is one click in the editor, with Undo in a notification.
  const before = await page.locator('[data-test="sch-row"]').count();
  await (await edit('Haircut')).locator('[aria-label="Delete"]').click();
  assert.equal(await page.locator('[data-test="sch-row"]').count(), before - 1, 'a task is deleted at once');
  await page.click('[data-test="toast"]:has-text("Haircut") .toast-act');
  assert.equal(await page.locator('[data-test="sch-row"]').count(), before, 'Undo brings it back');
  assert.equal(await row('Haircut').evaluate(e => e.classList.contains('done')), false, 'Undo after a spoken command un-ticks Haircut');
  assert.ok(await row('stamps').count(), 'and keeps what was added in the same breath');
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
  await editor.locator('[data-test="task-goal"]').selectOption({ label: 'Run A 10K' });
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
  // A click outside the card closes it.
  await page.click('.sch-title');
  assert.equal(await page.$('[data-test="sch-over"]'), null, 'clicking outside closes the edit card');
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
  await page.waitForSelector('.sch-row.flash');
  assert.equal(await page.$('[data-test="cal-pop"], [data-test="sch-over"]'), null, 'a week item is shown in the list; no card opens by itself');
  await page.click('[data-test="cal-month"]');
  assert.equal(await page.locator('.cal-mcell').count(), 42, 'the month shows six weeks');
  // Lock In: every activity has a timer icon; the timer takes over the page until it is minimised.
  await page.click('[data-test="cal-day"]');
  while (await page.locator('[data-test="toast"] .toast-x').count()) await page.locator('[data-test="toast"] .toast-x').first().click();
  const lockRow = page.locator('[data-test="sch-row"]').filter({ has: page.locator('[data-test="row-lockin"]') }).first();
  const lockName = (await lockRow.locator('.sch-row-t').textContent()).trim();
  await lockRow.hover();
  await lockRow.locator('[data-test="row-lockin"]').click();
  assert.ok(await page.$('.lk[data-test="timer"]'), 'Lock In opens over the whole page');
  assert.equal(await page.$('[data-test="nav-focus"]'), null, 'there is no Focus page any more');
  assert.ok((await page.textContent('[data-test="timer"]')).includes(lockName) && /2[45]:\d\d/.test(await page.textContent('[data-test="timer"]')), 'a Lock In timer starts for that activity');
  // The tab shows the countdown, its icon becomes a ring, and pause and +5 work.
  assert.match(await page.title(), /^⏱ 2[45]:\d\d · /, `the tab title counts down (${await page.title()})`);
  assert.match(await page.textContent('[data-test="nb-focus"]'), /2[45]:\d\d/, 'the top bar shows the countdown');
  assert.equal(await page.$('[data-test="bell-count"]'), null, 'the bell count stays quiet while locked in');
  assert.match(await page.getAttribute('link[rel="icon"]', 'href'), /^data:image\/png/, 'the tab icon shows the time left');
  await page.click('[data-test="timer-toggle"]');
  assert.match(await page.title(), /^⏸ /, 'a paused session shows in the title');
  await page.click('[data-test="timer-more"]');
  assert.match(await page.textContent('[data-test="timer"] .lk-lcd-text'), /^(29|30):\d\d$/, 'five more minutes are added');
  await page.click('[data-test="lock-len-15"]');
  assert.match(await page.textContent('[data-test="timer"] .lk-lcd-text'), /^1[45]:\d\d$/, 'a 15-minute session starts over');
  // Minimised, it lives in the top bar; the pill brings it back.
  await page.click('[data-test="timer-min"]');
  assert.equal(await page.$('.lk[data-test="timer"]'), null, 'minimising hides the overlay');
  await page.click('[data-test="nb-focus"]');
  assert.ok(await page.$('.lk[data-test="timer"]'), 'the pill reopens Lock In');
  await page.keyboard.press('Escape');
  assert.equal(await page.$('.lk[data-test="timer"]'), null, 'Escape minimises Lock In');
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
  // The calendar shows no steps; clicking a box shows its row in the activity list, highlighted.
  assert.equal(await page.$('.sch-box-subs, .sch-box-note'), null, 'calendar boxes do not list steps or notes');
  // Overlapping items: the one owning the spot under the cursor comes forward, and a lifted big one never hides the small one.
  {
    const big = page.locator('[data-test="sch-box"]', { hasText: 'Overlap big' });
    const small = page.locator('[data-test="sch-box"]', { hasText: 'Overlap small' });
    await big.scrollIntoViewIfNeeded();
    const B = await big.boundingBox(), S = await small.boundingBox();
    assert.ok(S.x > B.x && S.y > B.y, 'the later one sits on top, shifted right');
    await page.mouse.move(B.x + 4, B.y + 6);
    assert.ok(await big.evaluate(e => e.classList.contains('lifted')), 'hovering the big one\'s own strip brings it forward');
    await page.mouse.move(S.x + S.width / 2, S.y + S.height / 2);
    assert.ok(await small.evaluate(e => e.classList.contains('lifted')), 'moving onto the small one brings it forward, even under the lifted big one');
    assert.equal(await big.evaluate(e => e.classList.contains('lifted')), false, 'only one is forward at a time');
    await page.mouse.move(0, 0);
  }
  // Click an empty spot on the day calendar to add something at that time.
  {
    const col = page.locator('[data-test="sch-col"]').first();
    const c = await col.boundingBox();
    const spot = await col.evaluate(el => { const r = el.getBoundingClientRect(); const boxes = [...el.querySelectorAll('[data-lane]')].map(b => b.getBoundingClientRect()); for (let y = r.top + 8; y < r.bottom - 8; y += 12) if (!boxes.some(b => y >= b.top - 4 && y <= b.bottom + 4)) return y; return null; });
    if (spot != null) {
      await page.mouse.click(c.x + c.width / 2, spot);
      await page.waitForSelector('[data-test="sch-new"]');
      await page.fill('[data-test="sch-new-input"]', 'Spot study session');
      await page.press('[data-test="sch-new-input"]', 'Enter');
      await page.waitForSelector('[data-test="sch-box"]:has-text("Spot study session")');
      assert.equal(await page.$('[data-test="sch-new"]'), null, 'the little card closes once added');
    }
    // Two things can happen at once: a double-click on an item adds another at that time.
    const onItem = page.locator('[data-test="sch-box"]', { hasText: 'Overlap big' });
    const ob = await onItem.boundingBox();
    await page.mouse.dblclick(ob.x + 8, ob.y + ob.height - 8);
    await page.waitForSelector('[data-test="sch-new"]');
    await page.fill('[data-test="sch-new-input"]', 'Same time call');
    await page.press('[data-test="sch-new-input"]', 'Enter');
    await page.waitForSelector('[data-test="sch-box"]:has-text("Same time call")');
  }
  const box = page.locator('[data-test="sch-box"]').first();
  const boxTitle = (await box.locator('.sch-box-title').textContent()).trim();
  await box.click({ position: { x: 12, y: 10 } });
  await page.waitForSelector('.sch-row.flash');
  assert.equal((await page.textContent('.sch-row.flash .sch-row-t')).trim(), boxTitle, 'the clicked item is highlighted in the list');
  assert.equal(await page.$('[data-test="sch-over"], .sch-row [data-test="task-edit"]'), null, 'no editor opens until you ask for it');
  // Its edit icon opens the editor as a card laid over the item on the calendar, with its steps.
  await page.locator('.sch-row.flash [data-test="row-edit"]').click();
  await page.waitForSelector('[data-test="sch-over"] [data-test="task-edit"]');
  { const b = await box.boundingBox(); const o = await page.locator('[data-test="sch-over"]').boundingBox();
    assert.ok(Math.abs(o.y - b.y) < 8 && o.x <= b.x + 2 && o.x + o.width >= b.x + Math.min(b.width, o.width) - 2, `the card sits over the calendar item (${JSON.stringify({ b, o })})`); }
  assert.ok(await page.$('[data-test="sch-over"] .tk-subs'), 'with its steps');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/schedule.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.$('[data-test="sch-over"]'), null, 'Esc closes the card');
  assert.equal(await page.$('[data-test="sch-quick"]'), null, 'nothing sits between the Schedule header and the calendar');
  // Week and month are part of the Schedule; a day opens the day time line.
  await page.click('[data-test="cal-week"]');
  assert.equal(await page.locator('.cal-dh').count(), 7, 'the week is inside the Schedule');
  await page.click('.cal-dh.today');
  await page.waitForSelector('.sch-body');
  await page.click('[data-test="sch-next"]');
  await page.click('[data-test="sch-today"]');
  await page.click('.sch-pick-today');

  // Your details live in Settings (from the avatar menu); the AI page has no digest settings while digests are on hold.
  await page.click('[data-test="account"]');
  assert.deepEqual(await page.$$eval('[data-test="account-menu"] [role="menuitem"]', b => b.map(x => x.textContent.trim())), ['Settings', 'Privacy', 'Take the tour', 'Sign out'], 'the avatar opens Settings, Privacy, the tour and Sign out');
  await page.click('[data-test="menu-settings"]');
  assert.ok(await page.$('[data-test="settings-page"]'), 'Settings is a page of its own');
  await page.waitForSelector('[data-test="profile-you"]');
  if (process.env.SHOTS) {
    await page.screenshot({ path: `${process.env.SHOTS}/settings-profile.png` });
    for (const id of ['security', 'calendars']) { await page.click(`[data-test="acct-tab-${id}"]`); await page.waitForTimeout(150); await page.screenshot({ path: `${process.env.SHOTS}/settings-${id}.png` }); }
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
  // Calendars added earlier are listed in Settings; the Schedule's Calendars button only adds.
  await page.click('[data-test="acct-tab-calendars"]');
  assert.ok(await page.locator('[data-test="feed-list"] li').count() >= 1, 'Settings lists the calendars you added');
  await page.click(tab('Schedule'));
  await page.click('[data-test="calendars-open"]');
  assert.equal(await page.$('[data-test="calendars"] [data-test="feed-list"]'), null, 'the Calendars button is only for adding');
  assert.match(await page.textContent('[data-test="calendars"]'), /already in[\s\S]*Settings/, 'it points to Settings for the ones already added');
  await page.click('[data-test="calendars-open"]');
  await page.locator('body').press('n'); // opens Add for typing
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
  has(/^Stats Problem Set \| Schedule · Assignment · .* · 5 PM · #Statistics/, 'the assignment keeps its day, time and course');
  has(/^Biology Midterm \| Schedule · Exam · .*#Biology/, 'the exam is an exam');
  has(/^Swim \| Schedule · Routine/, 'the weekly swim is a routine');
  has(/^Call Grandma \| Schedule · Task · Tomorrow/, 'the call is tomorrow');
  has(/^Learn To Play Guitar \| Overview · Goals/, 'the goal is a goal');
  // Back to the built-in rules for the rest of the test.
  await page.click('[data-test="account"]');
  await page.click('[data-test="menu-settings"]');
  await page.click('[data-test="acct-tab-digests"]');
  await page.fill('[data-test="you-key"]', '');


  // Today: the day, goals and the latest digest together.
  await page.click(tab('Overview'));
  assert.match(await page.textContent('[data-test="brief"]'), /Today you have[\s\S]*deadline/, 'the brief describes the day');
  assert.equal(await page.$('[data-test="ai-brief"]'), null, 'no separate AI note; the next step is part of the summary');
  const tg = await page.textContent('[data-test="today-goals"]');
  assert.ok(/Land A Summer Internship[\s\S]*0\/6/.test(tg) && /Run A 10K/.test(tg), 'goals show progress');
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
  // It opens on its day, in the list with its editor open.
  await page.waitForFunction(() => document.querySelector('[data-test="sch-over"] [data-test="over-title"]')?.value === 'Dentist', null, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.click('.sch-title');
  const unreadCount = async () => Number((await page.textContent('[data-test="bell-count"]').catch(() => '0')).replace('+', '')) || 0;
  const unread0 = await unreadCount();
  await page.click('[data-test="bell"]');
  assert.match(await page.textContent('[data-test="bell-pop"]'), /on today|due tomorrow/, 'the bell mentions what is due');
  assert.equal(await page.$eval('[data-test="bell-pop"]', e => getComputedStyle(e).borderTopLeftRadius), '0px', 'the notifications card is square');
  if (process.env.SHOTS) await page.locator('[data-test="bell-pop"]').screenshot({ path: `${process.env.SHOTS}/bell.png` });
  assert.equal(await unreadCount(), unread0, 'opening the bell does not mark anything read');
  if (unread0 && unread0 <= 9) {
    await page.locator('[data-test="bell-item"].unread .bell-main').first().focus();
    assert.equal(await unreadCount(), unread0 - 1, 'reading one notification lowers the count by one');
  }
  assert.equal(await page.$('[data-test="bell-pop"] .btn'), null, 'no Open Schedule buttons on the cards');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bell.png` });
  // Clicking a notification takes you to the Schedule and closes the list.
  await page.click(tab('Overview'));
  await page.click('[data-test="bell"]');
  await page.locator('[data-test="bell-item"] .bell-main').first().click();
  await page.waitForSelector('[data-test="schedule"]');
  assert.equal(await page.$('[data-test="bell-pop"]'), null, 'the list closes');

  // Voice: tap Add and Budgie listens to the microphone itself; words appear in the card as they are written down.
  const voice = await context.newPage();
  await fakeNetwork(voice);
  await voice.goto(url, { waitUntil: 'load' });
  assert.equal(await voice.$('[data-test="voice"]'), null, 'there is no microphone in the top bar');
  liveScript.length = 0; liveScript.push('essay due friday at 5pm', 'then gym every monday at 6', 'and I want to read 12 books this year');
  const live0 = liveCalls;
  await voice.click('[data-test="capture"]');
  await voice.waitForFunction(() => /essay due friday/.test(document.querySelector('[data-test="capture-text"]').value), null, { timeout: 20000 });
  assert.equal(await voice.getAttribute('[data-test="capture-mic"]', 'aria-pressed'), 'true', 'it listens as soon as Add opens');
  assert.match(await voice.textContent('[data-test="capture"]'), /Recording/, 'the Add button shows it is recording');
  assert.ok(await voice.$('[data-test="capture"] .cap-rec'), 'with a recording dot');
  // The top button only opens the card; Esc, the backdrop and the X do not end it: only Stop does.
  await voice.evaluate(() => document.querySelector('[data-test="capture"]').click());
  await voice.keyboard.press('Escape');
  await voice.mouse.click(5, 300);
  assert.ok(await voice.$('[data-test="capture-sheet"]'), 'the card stays open while recording');
  assert.equal(await voice.getAttribute('[data-test="capture-mic"]', 'aria-pressed'), 'true', 'and it keeps listening');
  assert.equal(await voice.$('[data-test="capture-sheet"] [aria-label="Close"]'), null, 'no X while recording');
  // Edit while listening: what you type stays, and later words follow it.
  await voice.focus('[data-test="capture-text"]');
  await voice.keyboard.press('End');
  await voice.keyboard.type(' soon');
  await voice.waitForFunction(() => /books/.test(document.querySelector('[data-test="capture-text"]').value), null, { timeout: 25000 });
  { const v = await voice.inputValue('[data-test="capture-text"]'); assert.match(v, /soon[\s\S]*books this year$/, `what you type while listening is kept, and later words follow it (${JSON.stringify(v)})`); }
  assert.ok(liveCalls - live0 >= 3, 'each phrase went to the server as audio');
  assert.equal(await voice.$('[data-test="capture-sort"]'), null, 'no Sort button while listening: Stop sorts it');
  if (process.env.SHOTS) { await voice.screenshot({ path: `${process.env.SHOTS}/recording.png` }); await voice.locator('header').first().screenshot({ path: `${process.env.SHOTS}/recording-bar.png` }); }
  // Stop: Budgie's server AI breaks what was said into separate things, and each is placed.
  budgieItems = [
    { title: 'Essay', kind: 'assignment', date: '', time: '17:00', minutes: 0, repeat: 'none', days: ['fri'].slice(0, 0), course: '', priority: '', action: 'add', target: '' },
    { title: 'Gym', kind: 'routine', date: '', time: '18:00', minutes: 0, repeat: 'weekly', days: ['mon'], course: '', priority: '', action: 'add', target: '' },
    { title: 'Read 12 books this year', kind: 'goal', date: '', time: '', minutes: 0, repeat: 'none', days: [], course: '', priority: '', action: 'add', target: '' },
  ];
  const bc0 = budgieCalls.length;
  await voice.click('[data-test="capture-mic"]');
  await voice.waitForSelector('[data-test="capture-review"]');
  budgieItems = null;
  assert.equal(budgieCalls.length, bc0 + 1, 'what was said went to Budgie\'s AI once');
  assert.match(budgieCalls[bc0].text, /essay due friday[\s\S]*books this year/, 'with the edited live words');
  assert.match(await voice.textContent('.cr-count'), /of 3/, 'three separate things come back and are sorted');
  { const titles = []; for (let i = 0; i < 3; i++) { titles.push(await voice.inputValue('.cr-title')); if (i < 2) { await voice.click('[data-test="review-keep"]'); await voice.waitForTimeout(150); } } assert.deepEqual(titles.map(t => t.toLowerCase()), ['essay', 'gym', 'read 12 books'], `each is its own item (${titles})`); }
  await voice.click('[data-test="review-keep"]');
  assert.equal(await voice.$('[data-test="capture-review"]'), null, 'the review ends after the last one');
  await voice.close();

  // With a Gemini key, the recording itself goes to Gemini on Stop; what it hears is what gets added.
  const hearAcct = { data: { ...JSON.parse(JSON.stringify(fakeAccount.data)), digest: { ...(fakeAccount.data.digest || {}), geminiKey: 'AIzaSyFakeKeyForTheTest_1234567890' } }, version: fakeAccount.version };
  const hear = await context.newPage();
  await fakeNetwork(hear, hearAcct);
  liveScript.length = 0; liveScript.push('lab report three due friday at five for chemistry');
  await hear.goto(url, { waitUntil: 'load' });
  await hear.click('[data-test="capture"]');
  await hear.waitForFunction(() => /chemistry/.test(document.querySelector('[data-test="capture-text"]').value), null, { timeout: 20000 });
  await hear.click('[data-test="capture-mic"]');
  await hear.waitForSelector('[data-test="capture-review"]');
  assert.equal(voiceCalls.length, 1, 'the recording is sent to Gemini once');
  assert.ok(voiceCalls[0].audio && voiceCalls[0].mime === 'audio/wav', 'the whole recording goes, as WAV');
  assert.match(voiceCalls[0].typed || '', /lab report three/, 'the live text goes too, for spellings');
  const heardItems = [];
  for (let i = 0; i < 8 && await hear.$('[data-test="capture-review"]'); i++) { heardItems.push(`${await hear.inputValue('.cr-title')} | ${await hear.textContent('.cr-where')}`); await hear.click('[data-test="review-keep"]'); await hear.waitForTimeout(150); }
  assert.ok(heardItems.some(x => /^Lab Report 3 \| Schedule · Assignment · .*5 PM · #Chemistry/.test(x)), `Gemini's spelling and details are used (${heardItems.join(' ;; ')})`);
  assert.ok(heardItems.some(x => /^History Quiz \| Schedule · Exam/.test(x)), 'what only Gemini heard is added too');
  assert.ok(heardItems.some(x => /^Gym \| Schedule · Routine/.test(x)), 'the weekly gym is a routine');
  await hear.close();

  // Live text fails (Safari with Dictation off): it keeps recording, Stop writes it down for checking, then Add sorts it once.
  const deaf = await context.newPage();
  await fakeNetwork(deaf, hearAcct);
  liveScript.length = 0; for (let i = 0; i < 40; i++) liveScript.push(503);
  await deaf.goto(url, { waitUntil: 'load' });
  const calls0 = voiceCalls.length;
  await deaf.click('[data-test="capture"]');
  await deaf.waitForSelector('[data-test="capture-note"]:has-text("still recording")', { timeout: 20000 });
  assert.match(await deaf.textContent('[data-test="capture-note"]'), /not available[\s\S]*Gemini writes it all down/, 'it says live words are down and the recording is kept');
  await deaf.click('[data-test="capture-mic"]');
  await deaf.waitForFunction(() => /Lab Report 3 due Friday/.test(document.querySelector('[data-test="capture-text"]').value), null, { timeout: 8000 });
  assert.match(await deaf.textContent('[data-test="capture-note"]'), /what Gemini heard/, 'Stop shows what was heard, to check and edit');
  assert.equal(await deaf.$('[data-test="capture-review"]'), null, 'nothing is added before you check it');
  await deaf.click('[data-test="capture-sort"]');
  await deaf.waitForSelector('[data-test="capture-review"]');
  assert.equal(voiceCalls.length, calls0 + 1, 'the recording went to Gemini once, not again on Add');
  liveScript.length = 0;
  await deaf.close();

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
  assert.match(seen, /Three pages, zero clutter[\s\S]*Add anything[\s\S]*Plan your days[\s\S]*Check before it counts/, 'the guide covers the pages and the Add button');
  assert.match(seen, /private key stays on your device/, 'the guide explains how passkeys work');
  await guide.waitForSelector('[data-test="guide"]', { state: 'detached' });
  await guide.click(tab('Overview'));
  assert.ok((await guide.locator('.empty-note').count()) >= 1, 'empty cards explain what to add');
  await guide.waitForFunction(() => document.querySelector('.acct-dot.saved'));
  await guide.waitForTimeout(1500);
  assert.equal(fresh.data?.guide?.done, true, 'finishing the guide is saved to the account');
  // Privacy: download a copy of your data.
  await guide.click('[data-test="account"]');
  await guide.click('[data-test="menu-privacy"]');
  assert.deepEqual(await guide.$$eval('[data-test="privacy-page"] .set-nav button', b => b.map(x => x.textContent.trim())), ['Your data', 'Sessions', 'Delete account'], 'Privacy has your data, sessions and deleting the account');
  const [dl] = await Promise.all([guide.waitForEvent('download'), guide.click('[data-test="download-data"]')]);
  assert.match(dl.suggestedFilename(), /^budgie-data-.*\.json$/, 'you can download a copy of your data');
  // Settings: square, with only the avatar round.
  await guide.click('[data-test="account"]');
  await guide.click('[data-test="menu-settings"]');
  assert.equal(await guide.$eval('[data-test="settings-page"] .set-nav button.on', e => getComputedStyle(e).borderRadius), '0px', 'Settings is square');
  assert.equal(await guide.$eval('[data-test="account"]', e => getComputedStyle(e).borderRadius), '50%', 'the avatar stays round');
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
  for (const p of ['Overview', 'Schedule', 'Progress', 'Settings', 'Privacy']) {
    if (p === 'Settings' || p === 'Privacy') { await mobile.click('[data-test="account"]'); await mobile.click(`[data-test="menu-${p.toLowerCase()}"]`); } else
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
  await full.click('[data-test="menu-privacy"]');
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
  await full.click('[data-test="menu-privacy"]');
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
