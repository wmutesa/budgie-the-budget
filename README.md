# Budgie

Budgeting, payment and subscription tracking, and savings goals, with live exchange rates. Built with Vue 3 and Vite and served as a static site on Cloudflare Workers.

## What it does

- **Overview:** a written brief of your month, net worth, plan, cash flow, savings goal, expense breakdown, accounts, signals, wallets and a year-in-numbers report.
- **Live exchange rates:** fetched from ExchangeRate-API's open endpoint, with Frankfurter (European Central Bank) as a fallback. Wallets and subscriptions convert to your chosen base currency. The last good rates are cached for offline use.
- **Subscriptions from the web:** search a service by name, for example Netflix. Budgie looks it up on Wikidata to get its official website and description, uses the site's own icon as the logo, and tracks what you pay in any currency.
- **Transactions:** monthly budgets and the activity ledger, with chip filters and search.

Personal balances and transactions are sample data until accounts are connected. Rates and service details are always live. Your subscriptions and settings are saved in your browser only.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

## Test

```bash
npm run build
npm test           # browser smoke test; live services are faked so it runs offline
```

## Deploy flow

1. Push or merge to `main`.
2. Cloudflare's GitHub integration runs `npx wrangler deploy`. `wrangler.jsonc` tells it to run `npm run build` first and publish `dist/`.
3. GitHub Actions runs the build and the browser test on every pull request and push (`.github/workflows/ci.yml`).
4. `.github/workflows/deploy-cloudflare.yml` is a manual fallback deploy. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Project layout

- `src/App.vue`: masthead and the two pages
- `src/components/`: dashboard cells and the add-a-subscription sheet
- `src/lib/rates.js`: live exchange rates and conversion
- `src/lib/brands.js`: web lookup for services and their logos
- `src/lib/store.js`: base currency and tracked subscriptions, saved in the browser
- `src/data/demo.js`: sample balances and transactions
- `legacy/`: the earlier single-file version, kept for reference
