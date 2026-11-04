<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="Budgie logo" /></p>

# Budgie

Budgie is a budgeting app for tracking spending, subscriptions, savings goals and plans, with live exchange rates and a local AI helper. It runs in your browser and keeps your data on your device.

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

## Your data and privacy

- Everything you enter is stored in your browser's local storage on this device. Budgie has no server and no accounts.
- Network requests go only to: exchange-rate services (ExchangeRate-API, Frankfurter), Wikidata for company lookups, Google's favicon service for logos, Google Fonts, the jsDelivr CDN for receipt-reading files, and Ollama on `localhost` if you run it.
- Balances and the year's history are sample data until real accounts are connected.
- Clearing site data in your browser deletes everything. Export features are on the roadmap.

See [SECURITY.md](SECURITY.md) for how the site is protected and how to report a problem.

## Run it locally

Requires Node.js 22.

```bash
npm install
npm run dev          # http://localhost:5173
```

Optional local AI:

```bash
./scripts/ollama-setup.sh
ollama serve
```

## Test

```bash
npm run build
npm test             # browser smoke test; live services are faked so it runs offline
```

The smoke test opens every page, adds spending several ways, checks the review queue, budgets and layout, and fails on any page error or blocked request.

## How it ships

1. Work happens on a branch and goes to `main` through a pull request.
2. GitHub Actions runs the build and the browser test (`.github/workflows/ci.yml`) and CodeQL scanning.
3. Cloudflare's GitHub integration deploys `main`: `npx wrangler deploy` runs `npm run build` first (see `wrangler.jsonc`) and publishes `dist/`.
4. `public/_headers` sets the security headers Cloudflare sends with every page.

## Project layout

```
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
