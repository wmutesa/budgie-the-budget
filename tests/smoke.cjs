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
function sampleEdition() {
  return {
    id: inDays(0), edition: 'Saturday Edition', dateLong: 'Saturday, November 7, 2026', createdAt: new Date().toISOString(), provider: 'free sources',
    preheader: '3 new finds, 2 deadlines in the next two weeks.',
    lead: { kicker: 'Internship · Apply by Dec 1', headline: 'Robotics lab opens first-year research roles', dek: 'Undergraduates can join a robotics lab this spring.', body: 'The lab builds low-cost robots. Matches robotics.', ctaLabel: 'Apply', ctaLink: 'https://example.org/lab', link2Label: 'More like this', link2: 'https://news.google.com/search?q=robotics' },
    stories: [
      { tag: 'EVENT', headline: 'Student hackathon this month', desc: 'A free weekend hackathon, online and in Boston.', fit: 'Matches robotics', deadline: `Register by ${inDays(4)}`, ctaLabel: 'Register', ctaLink: 'https://example.org/hack', dueIso: inDays(4) },
      { tag: 'PERK', headline: 'Free cloud credits for students', desc: 'Credits for student projects.', fit: 'Check eligibility on the page', deadline: 'See the page', ctaLabel: 'Claim it', ctaLink: 'https://example.org/perk' },
    ],
    deadlines: [{ date: inDays(4), name: 'Student hackathon this month', desc: 'Event · example.org', ctaLabel: 'Register', ctaLink: 'https://example.org/hack' }],
    drafts: [{ no: '1', to: 'Robotics Lab', purpose: 'Ask about first-year research roles', status: 'Needs a contact', sendBy: 'by Nov 20', subject: 'Student interested in your research', body: 'Hello,\n\nI am a student interested in robotics.\n\nThank you for your time,\nSam' }],
    watch: { topic: 'student visa', headline: 'New guidance on student work rules', body: 'A short summary.', linkLabel: 'Read it', link: 'https://example.org/visa', note: 'Not legal advice.' },
    action: { text: 'Register: Student hackathon this month.', label: 'Register', link: 'https://example.org/hack' },
    sources: [{ title: 'example.org', url: 'https://example.org/lab' }],
  };
}
async function fakeApi(page, account = fakeAccount) {
  account.digests = account.digests || [];
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
    if (p === '/api/digests' && req.method() === 'GET') return route.fulfill({ json: { list: account.digests.map(d => ({ id: d.id, edition: d.edition, dateLong: d.dateLong, preheader: d.preheader })), latest: account.digests[0] || null } });
    if (p === '/api/digests' && req.method() === 'POST') {
      const { profile } = JSON.parse(req.postData());
      if (!profile?.interests?.length) return route.fulfill({ status: 400, json: { error: 'Add a few interests, companies or feeds to your digest profile first.' } });
      account.lastProfile = profile;
      const ed = sampleEdition();
      account.digests = [ed, ...account.digests.filter(d => d.id !== ed.id)];
      return route.fulfill({ json: ed });
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
  assert.match(await page.textContent('[data-test="today"] .lede'), /Budgie starts empty[\s\S]*Playground/, 'an empty Today says how to start');
  assert.doesNotMatch(await page.textContent('body'), /Net worth|Transactions|Subscriptions|Exchange rates|Emergency fund|Old shop/i, 'no money anywhere');
  await page.waitForFunction(() => document.querySelector('.acct-dot.saved'));
  await page.waitForTimeout(1200);
  assert.equal(fakeAccount.data.transactions, undefined, 'old money data is removed from the account on the next save');
  assert.equal(fakeAccount.data.subscriptions, undefined, 'old subscriptions are removed');
  assert.deepEqual(fakeAccount.data.goals, [], 'old savings goals are removed');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/today-empty.png` });

  // Playground: write anything; Budgie sorts tasks, routines and goals.
  await page.click('[data-test="new"]');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.test), 'inbox-text', 'Add opens the inbox ready to type');
  await page.fill('[data-test="inbox-text"]', 'Essay 2 due tomorrow 5pm #English\nGym MWF 6pm\nI want to land a summer internship by March\nhaircut today');
  await page.waitForFunction(() => document.querySelectorAll('[data-test="inbox-rows"] li').length === 4);
  const dests = await page.$$eval('[data-test="inbox-rows"] li', rows => rows.map(r => r.querySelector('.inbox-dest.on').textContent.trim()));
  assert.deepEqual(dests, ['Task', 'Routine', 'Goal', 'Task'], 'each line is sorted');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/playground.png` });
  await page.click('[data-test="inbox-send"]');
  assert.match(await page.textContent('[data-test="inbox-done"]'), /Added 2 tasks, 1 routine and 1 goal/, 'the inbox says what it added');
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

  // Digests: set up the profile, then the first edition is written.
  await page.click(tab('Digests'));
  await page.waitForSelector('[data-test="digest-profile"]');
  assert.equal(await page.isDisabled('[data-test="dgp-save"]'), true, 'the profile needs interests, companies or feeds');
  await page.fill('[data-test="digest-profile"] input[autocomplete="name"]', 'Sam');
  await page.fill('[data-test="dgp-interests"]', 'robotics, embedded systems');
  await page.click('[data-test="dgp-save"]');
  await page.waitForSelector('[data-test="digest"]');
  assert.deepEqual(fakeAccount.lastProfile.interests, ['robotics', 'embedded systems'], 'the profile is sent to write the digest');
  for (let i = 0; i < 40 && !fakeAccount.data.digest?.profile; i++) await page.waitForTimeout(100);
  assert.deepEqual(fakeAccount.data.digest.profile.interests, ['robotics', 'embedded systems'], 'the profile is saved in the account');
  const paper = await page.textContent('[data-test="digest"]');
  assert.match(paper, /Saturday Edition[\s\S]*The Brief[\s\S]*Robotics lab opens first-year research roles/, 'the edition has a masthead and a lead');
  const cal = await page.textContent('.dg-cal');
  assert.ok(/Student hackathon/.test(cal) && /Essay 2[\s\S]*in your Planner/.test(cal), 'the calendar mixes digest deadlines and your own');
  assert.match(paper, /Watching: student visa[\s\S]*Not legal advice/, 'the watch box shows its note');
  await page.click('[data-test="draft"]');
  assert.match(await page.textContent('.dg-draft'), /Subject:[\s\S]*Thank you for your time/, 'a draft opens with its email');
  await page.click('.nb-pages button:has-text("Planner")');
  assert.match(await page.textContent('[data-test="planner"]'), /Student hackathon this month/, 'digest deadlines become Planner tasks');
  if (process.env.SHOTS) { await page.click(tab('Digests')); await page.screenshot({ path: `${process.env.SHOTS}/digest.png`, fullPage: true }); }

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

  // Voice from anywhere: several things at once, each where it belongs, with Undo.
  const voice = await context.newPage();
  await fakeNetwork(voice);
  await voice.addInitScript(FAKE_SPEECH + ";window.__speechPhrase = 'essay due friday at 5pm then gym every monday at 6 and I want to read 12 books this year';");
  await voice.goto(url, { waitUntil: 'load' });
  await voice.click('[data-test="voice"]');
  await voice.waitForSelector('[data-test="voice-live"]');
  await voice.waitForFunction(() => /books/.test(document.querySelector('[data-test="voice-live"]').textContent));
  await voice.click('[data-test="voice-stop"]');
  await voice.waitForSelector('[data-test="voice-done"]');
  const said = await voice.textContent('[data-test="voice-done"]');
  assert.match(said, /Added 3 things/, 'three things are heard');
  assert.match(said, /Essay[\s\S]*Task[\s\S]*Gym[\s\S]*Routine[\s\S]*Read 12 books[\s\S]*Goal/i, 'each is sorted');
  await voice.click('[data-test="voice-undo"]');
  await voice.click(tab('Playground'));
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
  assert.ok((await guide.locator('.empty-note').count()) >= 3, 'empty cards explain what to add');
  await guide.waitForFunction(() => document.querySelector('.acct-dot.saved'));
  await guide.waitForTimeout(1500);
  assert.equal(fresh.data?.guide?.done, true, 'finishing the guide is saved to the account');
  await guide.click('[data-test="account"]');
  const sheet = await guide.locator('.acct-sheet').boundingBox();
  const vp = guide.viewportSize();
  assert.ok(Math.abs(sheet.x - 75) < 2 && Math.abs(sheet.y - 75) < 2 && Math.abs(vp.width - sheet.x - sheet.width - 75) < 2 && Math.abs(vp.height - sheet.y - sheet.height - 75) < 2, `the settings card leaves 75px on every side (${JSON.stringify(sheet)})`);
  const [dl] = await Promise.all([guide.waitForEvent('download'), guide.click('[data-test="download-data"]')]);
  assert.match(dl.suggestedFilename(), /^budgie-data-.*\.json$/, 'you can download a copy of your data');
  // Avatar colour: picked at random, changed with the picker.
  await guide.click('[data-test="avatar"]');
  await guide.click('[data-test="avatar-swatch"] >> nth=3');
  await guide.waitForTimeout(400);
  assert.equal(await guide.evaluate(() => getComputedStyle(document.querySelector('[data-test="avatar"]')).backgroundColor), 'rgb(5, 150, 105)', 'the colour picker changes your avatar');
  // The AI helper falls back without breaking when models cannot download.
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
