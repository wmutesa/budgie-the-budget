<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="Taskie logo" /></p>

# Taskie

Taskie is a planner for students that you talk to. Tap **Add**, say everything on your mind (assignments, exams, errands, plans, goals) in any order, and Taskie turns it into a planned schedule: each thing with the right title, kind, date, time and course, ready for a quick check. It is invite-only. Each person signs in with a passkey, and their data syncs to their own private account.

## About

**The code is public. Your data is not.**

| | Where it lives | Who can see it |
| --- | --- | --- |
| The source code in this repository | GitHub | Anyone |
| Your tasks, routines, goals, calendar links, details about you, your Gemini key (optional) and settings | Your account in Cloudflare D1, plus a copy in your browser | Only you |
| Recordings | Sent once to be heard (Deepgram Nova-3 on Cloudflare, then Gemini), never stored | Nobody keeps them |
| Training text (Help Taskie hear better, on unless you turn it off) | Text of what was heard and what it became, in D1 | Used to train Taskie; never shown in the Admin view |
| Passkeys | Your device or your Apple, Google, Microsoft, or Apple password manager | Only you; Taskie keeps the public half |

Nothing personal is ever committed here: no profiles, links, tokens, addresses of private deployments or sample data about real people.

### Security highlights

- **Invite-only accounts with passkeys.** No passwords to steal or reuse. Invite and device links work once and expire. Optional single-use recovery codes.
- **Hashes only.** The database stores hashes of session cookies, invite links and recovery codes, never the values.
- **Locked-down sessions.** `__Host-` cookies that are HttpOnly, Secure and SameSite. Requests that change data must come from the site itself. Sign out of one device or every device.
- **Your data is yours.** Each person can reach only their own data. Members can delete their account and all of its data; anyone can download a full copy.
- **Rate limits.** Sign-in, invite, recovery, calendar, recording and AI requests are limited.
- **Safe fetching.** Calendar links must be public https addresses; push subscriptions must point at the browsers' own push services. Private and local addresses are refused, and sizes are capped.
- **Empty pushes.** Notifications travel as an empty wake-up; the device then asks Taskie what to show, so nothing private passes through browser push services.
- **Strict browser policy.** A Content Security Policy that allows only the services Taskie uses; no framing; HSTS; a minimal Permissions Policy.
- **Checked on every change.** CodeQL scanning, Dependabot, unit tests, a browser smoke test with the production security headers, and an end-to-end test against the real Worker and a local database.

See [SECURITY.md](SECURITY.md) for details and how to report a problem privately.

## What you can do

| Page | What it is for |
| --- | --- |
| **Overview** | Your day in a sentence and a ring, **What's next** (ideas written by AI from your planner, today's things and this week's deadlines), goals with milestones, and how the month is going |
| **Schedule** | Day, week and month. Each activity is edited in place: its title, one day-and-time picker, Lock In (a full-screen focus timer), and Break down into small steps as many times as you like. Imports Canvas, Google, Apple and Outlook calendars and about 80 public ones |
| **Add** | Talk or type. Deepgram Nova-3 writes down what you said, Gemini fixes names, courses and dates from your planner and splits it into items, and you keep or change each one |
| **Settings** | About you, AI and voice (your own Gemini key, Help Taskie hear better), notifications on each laptop and phone, calendars, devices and passkeys, people, your data |
| **Admin** (owner) | Dashboard, People, Voice, Models, Training, Errors, Sync and Calendars: counts and states only, never anyone's words |

Notifications reach laptops and phones even when Taskie is closed: a reminder 10 minutes before anything with a time, a short brief at 8 AM, and deadlines the evening before. On iPhone and iPad, add Taskie to the Home Screen first.

## How Taskie hears you

1. The app records the whole thought; nothing is written down while you talk.
2. On **Stop**, the recording goes to **Deepgram Nova-3** (on Cloudflare Workers AI), boosted with your own words (course codes, names, places, categories).
3. **Gemini 2.5 Flash** listens to the same recording with Nova-3's text, the words Nova-3 was unsure of and your planner, and fixes what was misheard from context (generative error correction), then lists every item. Without a Gemini key, Taskie's own Llama 3.3 splits Nova-3's text.
4. Each item is placed as pending and shown to you to keep, switch or drop.

Gemini is used for everyone when the Worker has a `GEMINI_API_KEY` secret (or when the owner shares their own key). People can also add their own free key in Settings.

## Run it locally

Requires Node.js 22.

```bash
npm install
npm run build
npx wrangler d1 migrations apply budgie --local
npm run dev:api      # the site and the account server at http://localhost:8787
```

The Cloudflare resources keep their original names (`budgie` Worker and database), so existing links and data stay where they are.

## Test

```bash
npm run test:unit      # planner rules, hearing, push planning, calendar readers; no browser
npm run build
npm test               # browser smoke test; the account server is faked
npm run test:accounts  # the real Worker and a local database, with virtual passkeys
npm run test:responsive
```

## How it ships

1. Work goes to `main`, where GitHub Actions runs the build, the tests and CodeQL.
2. Cloudflare's GitHub integration deploys `main`: `npx wrangler deploy` builds the site (see `wrangler.jsonc`) and publishes `dist/` with the Worker.
3. `public/_headers` sets the security headers; `public/sw.js` shows notifications; `worker/index.js` handles `/api/*` and a scheduled run every 5 minutes for notifications.
4. Database changes live in `migrations/` (some tables are created on first use) and are applied with `npx wrangler d1 migrations apply budgie --remote`.

## Project layout

```
worker/index.js           account server: passkeys, invites, sessions, sync, AI routes, admin, schedule
worker/hear.js            Nova-3 hearing and Gemini correction; small Gemini JSON calls
worker/push.js            Web Push: VAPID key, devices, reminders, morning brief, deadlines
worker/cloudai.js         Llama 3.3 on Workers AI for splitting notes
worker/gemini.js          Gemini splitting, key checks, research for digests
worker/ical.js            calendar link checks and the iCal reader
migrations/               database tables
src/
  App.vue                 navigation, the pages and the Admin sidebar
  components/             cards and pages
  lib/                    tasks, goals, capture, recorder, ideas, push, calendars, sync
public/                   icons, service worker and security headers
tests/                    unit, smoke, accounts and responsive tests
docs/wiki/                pages for the GitHub wiki
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## License

[MIT](LICENSE)
