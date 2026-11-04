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
    await owner.page.waitForSelector('.nb-pages');
    assert.equal(new URL(owner.page.url()).hash, '', 'the invite token is removed from the address bar');

    // Spending added on one device is saved to the account.
    await owner.page.click('.nb-pages button:nth-child(2)');
    await owner.page.fill('[data-test="quick-note"]', 'coffee 4.50 at Blue Bottle today');
    await owner.page.press('[data-test="quick-note"]', 'Enter');
    await owner.page.waitForSelector('[data-test="accept-all"]');
    await owner.page.click('[data-test="accept-all"]');
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
    await owner.page.click('.nb-pages button:nth-child(2)');
    await owner.page.waitForFunction(() => document.querySelector('#ledger')?.textContent.includes('Blue Bottle'));

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
    await alex.page.goto(inviteLink.replace(/^https?:\/\/[^/]+/, base));
    await alex.page.waitForSelector('text=Welcome, Alex');
    await alex.page.click('[data-test="create-passkey"]');
    await alex.page.waitForSelector('.nb-pages');
    await alex.page.waitForSelector('.acct-dot.saved');
    const alexData = await getJSON(alex.page, '/api/data');
    assert.ok(!JSON.stringify(alexData.body).includes('Blue Bottle'), 'people do not see each other\'s data');
    assert.equal((await getJSON(alex.page, '/api/people')).status, 403, 'members cannot manage people');

    // An invite works only once.
    const late = await personPage(browser);
    await late.page.goto(inviteLink.replace(/^https?:\/\/[^/]+/, base));
    await late.page.waitForSelector('text=not valid');
    await late.context.close();

    // The owner adds a second device to their own account.
    await owner.page.click('.acct-sec-head button:has-text("Add a device")');
    await owner.page.waitForFunction(old => { const v = document.querySelector('.acct-link .field')?.value; return v && v !== old; }, inviteLink);
    const deviceLink = await owner.page.inputValue('.acct-link .field');
    const laptop = await personPage(browser);
    await laptop.page.goto(deviceLink.replace(/^https?:\/\/[^/]+/, base));
    await laptop.page.waitForSelector('text=Add this device, Willy');
    await laptop.page.click('[data-test="create-passkey"]');
    await laptop.page.waitForSelector('.nb-pages');
    await laptop.page.click('.nb-pages button:nth-child(2)');
    await laptop.page.waitForFunction(() => document.querySelector('#ledger')?.textContent.includes('Blue Bottle'));
    await laptop.context.close();

    // The owner removes Alex, whose session stops working.
    await owner.page.click('.icon-x');
    await owner.page.click('[data-test="account"]');
    await owner.page.waitForSelector('.acct-list li:has-text("Alex") button');
    await owner.page.click('.acct-list li:has-text("Alex") button');
    await owner.page.waitForFunction(() => !document.querySelector('.acct-sheet').textContent.includes('Alex'));
    assert.equal((await getJSON(alex.page, '/api/data')).status, 401, 'a removed person is signed out');

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

main().then(() => process.exit(0), e => { console.error(`accounts test failed: ${e.message}`); process.exit(1); });
