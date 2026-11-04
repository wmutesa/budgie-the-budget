<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="Budgie logo" /></p>

# Budgie

Budgie is a budgeting app for tracking spending, subscriptions, savings goals and plans, with live exchange rates and a local AI helper. It is invite-only: each person signs in with a passkey, and their data syncs to their own account.

**Live:** https://budgie.engineering-willy-mutesa.workers.dev

## What you can do

| Page | What it is for |
| --- | --- |
| **Overview** | A written brief of your month, net worth, plan, cash flow, savings goals, live exchange rates, subscriptions, expense breakdown, accounts and wallets |
| **Transactions** | Add spending by typing, speaking, scanning a receipt, uploading a PDF, or importing a CSV or Excel statement; review what was found; monthly budgets and recent activity |
| **Reports** | What Budgie thinks about your month, action cards, savings and investing ideas for Chase and Bank of America, year in numbers, and the full ledger |
| **Playground** | Write or say messy notes and Budgie sorts them into a plan, with split comparisons, a what-if slider, a goal calculator and one-click budgets |

Highlights:

- **Plain-language entry:** "spent 12.50 on lunch at Chipotle last friday" becomes a dated, categorised entry. Understands "a week ago", "in a month", "on the 3rd" and similar.
- **Dictation:** speak an entry or a whole plan; text appears as you talk.
- **Find any company:** a built-in directory of more than 300 brands across the US, Rwanda, Thailand and beyond, plus a live search of Wikidata for everything else. Logos come from each company's own site.
- **Live exchange rates:** 160+ currencies, including the Rwandan franc and Thai baht, refreshed through the day and cached for offline use.
- **Local AI, optional:** when [Ollama](https://ollama.com) runs on your computer, Budgie uses it to read receipts and write suggestions. Nothing goes to a cloud AI service.

## Accounts

- **Invite-only.** The owner invites people from the account menu (the initial in the top bar). Each invite link works once and expires after 7 days.
- **Passkeys, no passwords.** People sign in with their fingerprint, face or device PIN. To use another device, open the account menu, choose **Add a device**, and open the link on that device within 24 hours.
- **Recovery codes.** Everyone gets 8 single-use codes when they join, shown once. If they lose every device, "Lost your device?" on the sign-in page trades a code for a 15-minute link to make a new passkey. New codes can be made from the account menu, which cancels the old ones. Only hashes are stored, and wrong guesses are limited to 10 an hour per network address.
- **QR codes.** Device and invite links come with a QR code to scan with the other device.
- **First-time guide.** New people get a welcome note and a short tour of each page, including how passkeys work and their risks. It shows once per person and can be replayed from the account menu, which also keeps the passkey note.
- **Each person's data is their own.** Nobody, including the owner, sees anyone else's data in the app. The owner can remove a person, which deletes their account and data.

## Your data and privacy

- Your data is stored in your account in Cloudflare D1, in a database only this app's Worker can reach, and a copy is kept in your browser so Budgie opens instantly and works offline. Changes made offline sync when you reconnect.
- Signing out removes this device's copy, unless it holds changes that have not synced yet.
- Sessions use a secure, HttpOnly cookie. Only hashes of session cookies and invite links are stored.
- Other network requests go only to: exchange-rate services (ExchangeRate-API, Frankfurter), Wikidata for company lookups, Google's favicon service for logos, Google Fonts, the jsDelivr CDN for receipt-reading files, and Ollama on `localhost` if you run it.
- Balances and the year's history are sample data until real accounts are connected.
- Export features are on the roadmap.

See [SECURITY.md](SECURITY.md) for how the site is protected and how to report a problem.

## Run it locally

Requires Node.js 22.

```bash
npm install
npm run build
npx wrangler d1 migrations apply budgie --local
npm run dev:api      # the site and the account server at http://localhost:8787
```

To create the first (owner) invite on your local database, see "First owner" below.

Optional local AI:

```bash
./scripts/ollama-setup.sh
ollama serve
```

## Test

```bash
npm run build
npm test             # browser smoke test; live services and the account server are faked
npm run test:accounts  # runs the real Worker and a local database with virtual passkeys
```

The smoke test opens every page, adds spending several ways, checks the review queue, budgets and layout, and fails on any page error or blocked request.

## How it ships

1. Work happens on a branch and goes to `main` through a pull request.
2. GitHub Actions runs the build and the browser test (`.github/workflows/ci.yml`) and CodeQL scanning.
3. Cloudflare's GitHub integration deploys `main`: `npx wrangler deploy` runs `npm run build` first (see `wrangler.jsonc`) and publishes `dist/`.
4. `public/_headers` sets the security headers Cloudflare sends with every page.
5. `worker/index.js` handles `/api/*` (sign-in, invites, sync); everything else is served from `dist/`. Database changes live in `migrations/` and are applied with `npx wrangler d1 migrations apply budgie --remote`.

### First owner

The first account comes from an owner invite written straight into the database:

```bash
TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
HASH=$(node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('base64url'))" "$TOKEN")
npx wrangler d1 execute budgie --remote --command "INSERT INTO invites (id, token_hash, name, role, created_at, expires_at) VALUES ('owner', '$HASH', 'Your name', 'owner', $(date +%s000), $(( $(date +%s) + 604800 ))000)"
echo "https://budgie.engineering-willy-mutesa.workers.dev/invite#$TOKEN"
```

## Project layout

```
worker/index.js           account server: passkeys, invites, sessions, sync
migrations/               database tables
src/
  App.vue                 navigation and the four pages
  components/             dashboard cells, capture, review, reports, playground
  lib/
    capture.js            receipts, PDFs, statements and notes to drafts
    parse.js              money, dates and plain-language parsing
    plan.js               playground note parsing
    advice.js             suggestion rules
    rates.js              live exchange rates
    brands.js             company lookup on Wikidata
    dictation.js          speech-to-text
    account.js            sign-in, invites and syncing
    store.js, ledger.js   saved state and derived numbers
  data/                   sample data, company directory, banks
public/                   favicon and security headers
tests/smoke.cjs           browser smoke test
docs/wiki/                pages for the GitHub wiki
```

## Repository rules

`main` is protected by the ruleset in `.github/rulesets/protect-main.json`. To set it up by hand instead of importing it, follow [docs/wiki/Repository-rules.md](docs/wiki/Repository-rules.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## License

[MIT](LICENSE)
