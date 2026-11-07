<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="Budgie logo" /></p>

# Budgie

Budgie is a personal assistant for your money and your time: spending, subscriptions, budgets, savings goals and the markets, plus a planner for school, work, projects and daily routines, with an AI helper that runs on your own device. It is invite-only. Each person signs in with a passkey, and their data syncs to their own private account.

## About

**The code is public. Your data is not.**

| | Where it lives | Who can see it |
| --- | --- | --- |
| The source code in this repository | GitHub | Anyone |
| Your entries, budgets, accounts, goals, plans, tasks, calendar links and settings | Your account in Cloudflare D1, plus a copy in your browser | Only you |
| Passkeys | Your device or your Apple, Google or Microsoft password manager | Only you; Budgie keeps the public half |
| AI | Runs on your device (in the browser, or Ollama on your computer) | Nobody: no cloud AI service, no API keys |

Nothing personal is ever committed here: no profiles, links, tokens, addresses of private deployments or sample data about real people.

### Security highlights

- **Invite-only accounts with passkeys.** No passwords to steal or reuse. Invite and device links work once and expire. Optional single-use recovery codes.
- **Hashes only.** The database stores hashes of session cookies, invite links and recovery codes, never the values.
- **Locked-down sessions.** `__Host-` cookies that are HttpOnly, Secure and SameSite. Requests that change data must come from the site itself. Sign out of one device or every device.
- **Your data is yours.** Each person can reach only their own data. Members can delete their account and all of its data; anyone can download a full copy.
- **Rate limits.** Sign-in, invite and recovery requests are limited per network address.
- **Strict browser policy.** A Content Security Policy that allows only the services Budgie uses, down to the exact package versions loaded from jsDelivr; no framing; HSTS; a minimal Permissions Policy.
- **Checked on every change.** CodeQL scanning, Dependabot for packages and GitHub Actions (all actions pinned to exact commits), a browser smoke test run with the production security headers, and an end-to-end test of sign-in, invites, recovery, sessions and rate limits against the real Worker and a local database.

See [SECURITY.md](SECURITY.md) for details and how to report a problem privately.

## What you can do

| Page | What it is for |
| --- | --- |
| **Overview** | Your month in a sentence, net worth, plan, cash flow, savings goals, live exchange rates, subscriptions, upcoming payments and wallets |
| **Planner** | Tasks, deadlines, classes, events and routines in four views (Tasks, Agenda, Week, Focus). Type or say anything and Budgie reads the date, time, repeat, project, priority and cost. Imports Canvas, Google, Apple and Outlook calendars, builds a daily routine, suggests what to prepare for, keeps streaks, and sends ticked costs to Transactions |
| **Transactions** | Add spending by typing, speaking, scanning a receipt, or importing a PDF, CSV or Excel statement; review it; AI-drafted budgets; recent activity; your accounts |
| **Markets** | A daily brief: the day's headline, what it means for you, indexes, top stories, markets to watch, a growth calculator and savings ideas for your banks |
| **Playground** | One inbox for everything: write or say anything, one thing per line, and Budgie sends each line to the Planner, Transactions, your money plan or more than one. Below it, messy money notes become a plan with scenarios to compare |

Budgie starts empty: every number comes from what you add. Pages sit in a rail on the left (a bar at the bottom on phones), and one search in the top bar finds anything (tasks, spending, subscriptions, goals, pages) and turns what you type into an action. Press `/` to jump to it.

## Run it locally

Requires Node.js 22.

```bash
npm install
npm run build
npx wrangler d1 migrations apply budgie --local
npm run dev:api      # the site and the account server at http://localhost:8787
```

Optional AI with Ollama on your computer:

```bash
./scripts/ollama-setup.sh
OLLAMA_ORIGINS="http://localhost:8787,<your Budgie address>" ollama serve
```

## Test

```bash
npm run build
npm run test:unit      # Planner rules and the calendar reader, no browser
npm test               # browser smoke test; live services and the account server are faked
npm run test:accounts  # the real Worker and a local database, with virtual passkeys
```

## How it ships

1. Work goes to `main`, where GitHub Actions runs the build, both tests and CodeQL.
2. Cloudflare's GitHub integration deploys `main`: `npx wrangler deploy` builds the site (see `wrangler.jsonc`) and publishes `dist/` with the Worker.
3. `public/_headers` sets the security headers for every page; `worker/index.js` handles `/api/*` (sign-in, invites, sync, markets).
4. Database changes live in `migrations/` and are applied with `npx wrangler d1 migrations apply budgie --remote`.

## Project layout

```
worker/index.js           account server: passkeys, invites, sessions, sync, markets, calendar import
worker/ical.js            calendar link checks and the iCal reader
migrations/               database tables
src/
  App.vue                 navigation and the pages
  components/             cards and pages
  lib/                    parsing, capture, AI, sync, budgets, savings and more
  data/                   company directory, banks, defaults
public/                   icons and security headers
tests/                    smoke test and accounts test
docs/wiki/                pages for the GitHub wiki
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## License

[MIT](LICENSE)
