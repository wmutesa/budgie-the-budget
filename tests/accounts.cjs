// End-to-end test for personal accounts. Runs the real Worker and a local D1
// database with `wrangler dev`, and uses Chromium's virtual passkey device.
//
//   npm run build && npm run test:accounts
//   CHROMIUM_PATH=/path/to/chrome npm run test:accounts

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 8799;
const base = `http://localhost:${port}`;
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'budgie-d1-'));
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
const b64url = buf => Buffer.from(buf).toString('base64url');

function d1(sql) {
  execFileSync(wrangler, ['d1', 'execute', 'budgie', '--local', '--persist-to', state, '--command', sql], { cwd: root, stdio: 'pipe' });
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${base}/api/me`); if (r.status === 401) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('wrangler dev did not start');
}

// A browser page with its own virtual passkey device.
async function personPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  page.on('dialog', d => d.accept());
  return { context, page };
}
const getJSON = (page, url) => page.evaluate(async u => { const r = await fetch(u); return { status: r.status, body: await r.json() }; }, url);

async function main() {
  execFileSync(wrangler, ['d1', 'migrations', 'apply', 'budgie', '--local', '--persist-to', state], { cwd: root, stdio: 'pipe' });
  const ownerToken = b64url(crypto.randomBytes(32));
  const hash = b64url(crypto.createHash('sha256').update(ownerToken).digest());
  d1(`INSERT INTO invites (id, token_hash, name, role, created_at, expires_at) VALUES ('owner-invite', '${hash}', 'Willy', 'owner', ${Date.now()}, ${Date.now() + 864e5})`);

  const dev = spawn(wrangler, ['dev', '--local', '--persist-to', state, '--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false'], { cwd: root, stdio: 'pipe', env: { ...process.env, CI: '1' } });
  // Stop the local server however the test ends, so its port is free next time.
  process.on('exit', () => { try { dev.kill(); } catch { /* already stopped */ } });
  process.on('uncaughtException', e => { console.error(`accounts test failed: ${e.stack}`); process.exit(1); });
  let log = '';
  dev.stdout.on('data', d => (log += d));
  dev.stderr.on('data', d => (log += d));

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    await waitForServer();

    // Without a session the app asks to sign in and the API refuses data.
    const anon = await fetch(`${base}/api/data`);
    assert.equal(anon.status, 401, 'data needs a session');
    const forged = await fetch(`${base}/api/login/options`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(forged.status, 403, 'requests from other sites are refused');

    // The owner accepts their invite and creates a passkey.
    const owner = await personPage(browser);
    await owner.page.goto(`${base}/invite#${ownerToken}`);
    await owner.page.waitForSelector('text=Welcome, Willy');
    await owner.page.click('[data-test="create-passkey"]');
    // New people see their recovery codes once, before the app.
    await owner.page.waitForSelector('[data-test="recovery-codes"]');
    const codes = await owner.page.$$eval('.rc-list code', els => els.map(e => e.textContent));
    assert.equal(codes.length, 8, 'eight recovery codes are shown');
    assert.ok(codes.every(c => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c)), 'codes are easy to read');
    assert.ok(await owner.page.isDisabled('[data-test="codes-done"]'), 'you must confirm you saved them');
    await owner.page.check('[data-test="codes-saved"]');
    await owner.page.click('[data-test="codes-done"]');
    await owner.page.waitForSelector('[data-test="guide-skip"]');
    await owner.page.click('[data-test="guide-skip"]');
    await owner.page.waitForSelector('.nb-pages');
    assert.equal(new URL(owner.page.url()).hash, '', 'the invite token is removed from the address bar');

    // A task added on one device is saved to the account.
    await owner.page.click('.nb-pages button:has-text("Playground")');
    await owner.page.fill('[data-test="inbox-text"]', 'Call Blue Bottle about the internship tomorrow');
    await owner.page.waitForSelector('[data-test="inbox-rows"] li');
    await owner.page.click('[data-test="inbox-send"]');
    await owner.page.waitForFunction(async () => {
      const r = await fetch('/api/data');
      return JSON.stringify((await r.json()).data || {}).includes('Blue Bottle');
    });

    // Signing out clears this device's copy; signing in brings the data back.
    await owner.page.click('[data-test="account"]');
    await owner.page.click('[data-test="sign-out"]');
    await owner.page.waitForSelector('[data-test="sign-in"]');
    assert.equal(await owner.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('budgie.v3')).length), 0, 'signing out removes the local copy');
    assert.equal((await getJSON(owner.page, '/api/data')).status, 401, 'the session ends on sign-out');
    await owner.page.click('[data-test="sign-in"]');
    await owner.page.waitForSelector('.nb-pages');
    await owner.page.click('.nb-pages button:has-text("Planner")');
    await owner.page.waitForFunction(() => document.querySelector('[data-test="planner"]')?.textContent.includes('Blue Bottle'));

    // The owner invites someone.
    await owner.page.click('[data-test="account"]');
    await owner.page.fill('.acct-invite .field', 'Alex');
    await owner.page.click('.acct-invite button');
    await owner.page.waitForSelector('.acct-link .field');
    const inviteLink = await owner.page.inputValue('.acct-link .field');
    assert.match(inviteLink, /\/invite#/, 'an invite link is created');
    await owner.page.waitForSelector('.acct-list li.pending:has-text("Alex")');

    // Alex joins with their own passkey and sees only their own data.
    const alex = await personPage(browser);
    // The link's code can be lost by apps that drop the part after #; pasting the link works.
    await alex.page.goto(base);
    await alex.page.click('[data-test="have-invite"]');
    await alex.page.fill('[data-test="invite-input"]', inviteLink.replace(/^https?:\/\/[^/]+/, base));
    await alex.page.click('[data-test="invite-use"]');
    await alex.page.waitForSelector('text=Welcome, Alex');
    await alex.page.click('[data-test="create-passkey"]');
    await alex.page.waitForSelector('[data-test="recovery-codes"]');
    await alex.page.click('[data-test="codes-skip"]');
    await alex.page.waitForSelector('[data-test="guide-skip"]');
    await alex.page.click('[data-test="guide-skip"]');
    await alex.page.waitForSelector('.nb-pages');
    await alex.page.waitForSelector('.acct-dot.saved');
    assert.equal((await getJSON(alex.page, '/api/recovery-codes')).body.left, 0, 'skipping cancels the recovery codes');
    const alexData = await getJSON(alex.page, '/api/data');
    assert.ok(!JSON.stringify(alexData.body).includes('Blue Bottle'), 'people do not see each other\'s data');
    assert.equal((await getJSON(alex.page, '/api/people')).status, 403, 'members cannot manage people');
    // Digests: each person has their own, in one or more digests; written from their account data.
    const none = await getJSON(alex.page, '/api/digests');
    assert.equal(none.status, 200, 'signed-in people can list their digests');
    assert.deepEqual(none.body, { editions: {} }, 'a new person has no digests');
    const send = body => alex.page.evaluate(async b => { const r = await fetch('/api/digests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; }, body);
    assert.equal((await send({ stream: { id: '../x' } })).status, 400, 'odd digest names are refused');
    const wrote = await send({ stream: { id: 'robotics', name: 'Robotics', focus: 'robotics internships' }, timeZone: 'America/New_York' });
    assert.equal(wrote.status, 200, 'a digest is written even when sources cannot be reached');
    assert.match(wrote.body.edition, /Edition$/, 'the edition is named after the day');
    assert.equal(wrote.body.stream, 'robotics');
    const listed = (await getJSON(alex.page, '/api/digests')).body.editions;
    assert.equal(listed.robotics.length, 1, 'the edition is stored under its digest');
    assert.equal((await getJSON(alex.page, `/api/digests/robotics/${wrote.body.id}`)).body.name, 'Robotics', 'one edition can be read back');
    assert.equal(await alex.page.evaluate(async () => (await fetch('/api/digests/robotics', { method: 'DELETE' })).status), 200);
    assert.deepEqual((await getJSON(alex.page, '/api/digests')).body.editions, {}, 'stopping a digest removes its editions');
    assert.equal((await fetch(`${base}/api/digests`)).status, 401, 'digests are only for signed-in people');

    // An invite works only once.
    const late = await personPage(browser);
    await late.page.goto(inviteLink.replace(/^https?:\/\/[^/]+/, base));
    await late.page.waitForSelector('text=not valid');
    await late.context.close();

    // The owner adds a second device to their own account.
    await owner.page.click('.acct-sec-head button:has-text("Add a device")');
    await owner.page.waitForFunction(old => { const v = document.querySelector('.acct-link .field')?.value; return v && v !== old; }, inviteLink);
    const deviceLink = await owner.page.inputValue('.acct-link .field');
    assert.ok(await owner.page.isVisible('.acct-qr svg path'), 'device links come with a QR code');
    const laptop = await personPage(browser);
    await laptop.page.goto(deviceLink.replace(/^https?:\/\/[^/]+/, base));
    await laptop.page.waitForSelector('text=Add this device, Willy');
    await laptop.page.click('[data-test="create-passkey"]');
    await laptop.page.waitForSelector('.nb-pages');
    await laptop.page.click('.nb-pages button:has-text("Planner")');
    await laptop.page.waitForFunction(() => document.querySelector('[data-test="planner"]')?.textContent.includes('Blue Bottle'));
    await laptop.context.close();

    // Lost every device: a recovery code leads to a new passkey.
    const lost = await personPage(browser);
    await lost.page.goto(base);
    await lost.page.click('[data-test="lost-device"]');
    await lost.page.fill('[data-test="recovery-input"]', 'AAAAA-BBBBB');
    await lost.page.click('[data-test="recovery-use"]');
    await lost.page.waitForSelector('text=not valid or has been used');
    await lost.page.fill('[data-test="recovery-input"]', codes[0].toLowerCase());
    await lost.page.click('[data-test="recovery-use"]');
    await lost.page.waitForSelector('text=Recovery code accepted. 7 codes left');
    await lost.page.click('[data-test="create-passkey"]');
    await lost.page.waitForSelector('.nb-pages');
    await lost.page.click('.nb-pages button:has-text("Planner")');
    await lost.page.waitForFunction(() => document.querySelector('[data-test="planner"]')?.textContent.includes('Blue Bottle'));
    const reuse = await fetch(`${base}/api/recover`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: codes[0] }) });
    assert.equal(reuse.status, 401, 'a recovery code works once');
    await lost.page.click('[data-test="account"]');
    await lost.page.waitForSelector('[data-test="codes-left"]:has-text("7 unused codes")');
    await lost.page.click('[data-test="new-codes"]');
    await lost.page.waitForSelector('.acct-sheet .rc-list code');
    const old = await fetch(`${base}/api/recover`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: codes[1] }) });
    assert.equal(old.status, 401, 'making new codes cancels the old ones');
    await lost.context.close();

    // The owner removes Alex, whose session stops working.
    await owner.page.click('.acct-sheet .icon-x');
    await owner.page.click('[data-test="account"]');
    const alexRow = owner.page.locator('.acct-sheet .acct-list li', { hasText: 'Alex' }).getByRole('button', { name: 'Remove' });
    await alexRow.waitFor();
    await owner.page.waitForFunction(() => document.querySelector('[data-test="codes-left"]')?.textContent.trim());
    // Click until the server sees the removal (a click during a re-render can miss).
    let removed = false;
    for (let attempt = 0; attempt < 3 && !removed; attempt++) {
      const seen = owner.page.waitForResponse(r => r.url().includes('/api/people/') && r.request().method() === 'DELETE', { timeout: 5000 }).then(() => true, () => false);
      await alexRow.click();
      removed = await seen;
    }
    assert.ok(removed, 'the owner can remove a person');
    await owner.page.waitForFunction(() => !document.querySelector('.acct-sheet').textContent.includes('Alex'));
    assert.equal((await getJSON(alex.page, '/api/data')).status, 401, 'a removed person is signed out');

    // The owner cannot delete their own account; a member can delete theirs.
    // Calendar imports: only public https links, and only when signed in.
    const cal = await owner.page.evaluate(async () => {
      const send = url => fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).then(async r => [r.status, (await r.json()).error]);
      return { http: await send('http://example.com/a.ics'), local: await send('https://localhost/a.ics'), ip: await send('https://169.254.169.254/latest'), empty: await send('') };
    });
    assert.deepEqual(cal.http, [400, 'Use the https or webcal link of the calendar.'], 'plain http calendar links are refused');
    assert.equal(cal.local[0], 400, 'local addresses are refused');
    assert.equal(cal.ip[0], 400, 'IP addresses are refused');
    assert.equal(cal.empty[0], 400, 'an empty link is refused');
    const calSignedOut = await fetch(`${base}/api/calendar`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/a.ics' }) });
    assert.equal(calSignedOut.status, 401, 'calendar import needs a sign-in');
    // Model downloads: signed in only, and only Budgie's own model files.
    assert.equal((await fetch(`${base}/api/model/hf/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/mlc-chat-config.json`)).status, 401, 'model files need a sign-in');
    assert.equal(await owner.page.evaluate(async () => (await fetch('/api/model/hf/someone/else/resolve/main/x.bin')).status), 404, 'other files are refused');

    const ownerDelete = await owner.page.evaluate(async () => (await fetch('/api/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) })).status);
    assert.equal(ownerDelete, 400, 'the owner account cannot be deleted from the app');
    await owner.page.click('[data-test="account"]').catch(() => {});
    await owner.page.waitForSelector('.acct-invite .field');
    await owner.page.fill('.acct-invite .field', 'Sam');
    await owner.page.click('.acct-invite button');
    await owner.page.waitForFunction(() => /Sam/.test(document.querySelector('.acct-link p')?.textContent || ''));
    const samLink = await owner.page.inputValue('.acct-link .field');
    const sam = await personPage(browser);
    await sam.page.goto(samLink.replace(/^https?:\/\/[^/]+/, base));
    await sam.page.click('[data-test="create-passkey"]');
    await sam.page.waitForSelector('[data-test="codes-skip"]');
    await sam.page.click('[data-test="codes-skip"]');
    await sam.page.waitForSelector('[data-test="guide-skip"]');
    await sam.page.click('[data-test="guide-skip"]');
    await sam.page.click('[data-test="account"]');
    sam.page.removeAllListeners('dialog');
    sam.page.once('dialog', d => d.accept('DELETE'));
    await sam.page.click('[data-test="delete-account"]');
    await sam.page.waitForSelector('[data-test="sign-in"]');
    assert.equal((await getJSON(sam.page, '/api/data')).status, 401, 'a deleted account is signed out');
    const people = await owner.page.evaluate(async () => (await (await fetch('/api/people')).json()).people.map(p => p.name));
    assert.ok(!people.includes('Sam'), 'a deleted account is gone from People');
    await sam.context.close();

    // Sign out everywhere ends every session for that person.
    const second = await personPage(browser);
    await second.page.goto(base);
    await second.page.click('[data-test="sign-in"]').catch(() => {});
    await owner.page.evaluate(async () => fetch('/api/sessions', { method: 'DELETE' }));
    assert.equal((await getJSON(owner.page, '/api/data')).status, 401, 'signing out everywhere ends this session too');
    await second.context.close();

    // Endpoints that work without signing in are limited per network address.
    let limited = false;
    for (let i = 0; i < 130 && !limited; i++) {
      const r = await fetch(`${base}/api/login/options`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
      limited = r.status === 429;
    }
    assert.ok(limited, 'too many sign-in requests from one address are refused');

    console.log('accounts test passed');
  } catch (e) {
    console.error(log.split('\n').slice(-30).join('\n'));
    throw e;
  } finally {
    await browser.close();
    dev.kill();
    fs.rmSync(state, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), e => { console.error(`accounts test failed: ${e.stack}`); process.exit(1); });
