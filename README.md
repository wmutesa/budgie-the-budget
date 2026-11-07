<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="Budgie logo" /></p>

# Budgie

Budgie is a personal planner: your days, your goals and a twice-weekly digest of opportunities, with an AI helper that runs on your own device. It is invite-only. Each person signs in with a passkey, and their data syncs to their own private account.

## About

**The code is public. Your data is not.**

| | Where it lives | Who can see it |
| --- | --- | --- |
| The source code in this repository | GitHub | Anyone |
| Your tasks, routines, goals, calendar links, details about you, your Gemini key (optional) and settings | Your account in Cloudflare D1, plus a copy in your browser | Only you |
| Your digests | Your account in Cloudflare D1 | Only you |
| Passkeys | Your device or your Apple, Google or Microsoft password manager | Only you; Budgie keeps the public half |
| AI | Runs on your device (in the browser, or Ollama on your computer) | Nobody: no cloud AI service, no API keys |

Nothing personal is ever committed here: no profiles, links, tokens, addresses of private deployments or sample data about real people.

### Security highlights

- **Invite-only accounts with passkeys.** No passwords to steal or reuse. Invite and device links work once and expire. Optional single-use recovery codes.
- **Hashes only.** The database stores hashes of session cookies, invite links and recovery codes, never the values.
- **Locked-down sessions.** `__Host-` cookies that are HttpOnly, Secure and SameSite. Requests that change data must come from the site itself. Sign out of one device or every device.
- **Your data is yours.** Each person can reach only their own data and digests. Members can delete their account and all of its data; anyone can download a full copy.
- **Rate limits.** Sign-in, invite, recovery, calendar and digest requests are limited.
- **Safe fetching.** Calendar links and digest sources must be public https addresses; private and local addresses are refused, and sizes are capped. AI models come only from an allow-list of exact files.
- **Strict browser policy.** A Content Security Policy that allows only the services Budgie uses, down to the exact package version loaded from jsDelivr; no framing; HSTS; a minimal Permissions Policy.
- **Checked on every change.** CodeQL scanning, Dependabot for packages and GitHub Actions (all pinned to exact commits), unit tests, a browser smoke test run with the production security headers, and an end-to-end test against the real Worker and a local database.

See [SECURITY.md](SECURITY.md) for details and how to report a problem privately.

## What you can do

| Page | What it is for |
| --- | --- |
| **Today** | Your day in a sentence, what is on today, deadlines this week, goal progress and the latest digest |
| **Planner** | Tasks, deadlines, classes, events and routines in four views (Tasks, Agenda, Calendar with day, week and month, and Focus). Imports Canvas, Google, Apple and Outlook calendars, suggests what to prepare for, breaks tasks into steps, keeps streaks |
| **Digests** | Short newspapers to read, kept up to date on their own (Mondays and Thursdays, and catching up when you open them): opportunities that fit, deadlines, outreach drafts to copy, a watch box and one thing to do this week. "My brief" follows your goals, projects and studies; add more digests with just a name. With your free Gemini key (in your profile), each edition is researched with Google Search as it is written. Deadlines go to your Planner |
| **Playground** | One inbox for everything: write or say anything, one thing per line, and Budgie sorts tasks, routines and goals. Life goals get milestones on your calendar; build a daily routine; name and colour projects |

Anywhere in the app: the microphone in the top bar takes several things at once and adds each where it belongs, with Undo; the search finds anything and turns what you type into an action (press `/`).

Budgie starts empty: everything comes from what you add. It costs nothing to run: digests use free sources and rules (plus Gemini's free tier if you add your own key), and the AI runs on your device.

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
npm run test:unit      # planner rules, goals, the inbox, calendar and digest readers; no browser
npm run build
npm test               # browser smoke test; the account server is faked
npm run test:accounts  # the real Worker and a local database, with virtual passkeys
```

## How it ships

1. Work goes to `main`, where GitHub Actions runs the build, the tests and CodeQL.
2. Cloudflare's GitHub integration deploys `main`: `npx wrangler deploy` builds the site (see `wrangler.jsonc`) and publishes `dist/` with the Worker.
3. `public/_headers` sets the security headers for every page; `worker/index.js` handles `/api/*` (sign-in, invites, sync, calendars, digests, model files) and the Monday and Thursday digest schedule.
4. Database changes live in `migrations/` and are applied with `npx wrangler d1 migrations apply budgie --remote`.

## Project layout

```
worker/index.js           account server: passkeys, invites, sessions, sync, digests, schedule
worker/digest.js          digests from free sources: news, careers boards, feeds
worker/gemini.js          optional research with the person's own Gemini key
worker/ical.js            calendar link checks and the iCal reader
worker/models.js          AI model files through Budgie's own address
migrations/               database tables
src/
  App.vue                 navigation and the pages
  components/             cards and pages
  lib/                    tasks, goals, the inbox router, calendars, digests, AI, sync
public/                   icons and security headers
tests/                    unit, smoke and accounts tests
docs/wiki/                pages for the GitHub wiki
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## License

[MIT](LICENSE)
