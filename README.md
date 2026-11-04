# Budgie

A local, private budgeting app. Plain HTML, CSS, and JavaScript: no build step, no accounts, no cloud. Your data stays in your browser, and the optional AI assistant runs on your own computer through Ollama, so it costs nothing per question.

## Run it

Serve the folder with any static server, then open the address it prints:

```bash
cd budgie-the-budget
python3 -m http.server 8080
```

Then open http://localhost:8080.

Opening `index.html` directly (`file://`) also works for everything except the local AI, because browsers block some requests from file pages.

## Set up the local AI (free)

1. Install Ollama from https://ollama.com.
2. Download a model: `ollama pull llama3.2`
3. Make sure the server is running: `ollama serve` (the desktop app starts it for you).
4. In Budgie, open **Settings → Local AI** and press **Test connection**.

If the Assistant can't reach Ollama, it falls back to built-in rules. Those answer balances, spending, budgets, subscriptions, goals, and "Can I afford $X?" without any model.

## What it does

| Section | Purpose |
| --- | --- |
| Overview | Net worth, this month's flow, accounts with balances, signals, renewals, spending breakdown |
| Ledger | Every spend, income, transfer, and balance update. Filter, search, edit, export CSV |
| Budgets & plan | Monthly budgets per category with 80% and over-budget warnings, plus a plan that splits your income |
| Goals | College Fund, Emergency Fund, or any target. Shows the monthly amount needed and your recent pace |
| Subscriptions | Recurring costs with monthly and yearly totals, renewal countdowns, and one-tap "Mark paid" |
| Assistant | Questions about your numbers, answered by the local model or the built-in rules |
| Settings | Currency, low-balance floor, income, AI endpoint and model, backups, demo data |

## Your data

- Saved in this browser's local storage. Nothing is uploaded.
- Use **Settings → Export backup** regularly. Clearing site data erases everything.
- **Restore backup** loads a `.json` file exported from the app.

## How the numbers work

- **Account balance** = starting balance + income − spending ± transfers. Use the ✎ on an account to set today's balance. Budgie logs the difference as a balance update, so the history stays honest.
- **Transfer or save** moves money from an account to another account or to a goal. Money in a goal counts toward that goal and leaves the source account.
- **Net worth** = accounts + goals. Moving money between your own holdings does not change it.
- **Plan** = income − category budgets − subscriptions (monthly equivalent) − the monthly amount each goal needs. Subscriptions are their own line, so lower a category budget that duplicates one.

## Files

- `index.html`: page shell
- `styles.css`: design system (dark, serif numerals, bento grid, responsive)
- `app.js`: data model, calculations, views, forms, alerts, demo data
- `ai.js`: connection to the local model server

## Cloudflare test deployment

Budgie is static files, so it deploys as Cloudflare Workers static assets. `wrangler.jsonc` serves this folder, and `.assetsignore` keeps the repository files private.

One-time setup, on your machine:

```bash
npm install
npx wrangler login
```

Test locally in a Cloudflare-like environment:

```bash
npm run dev        # http://127.0.0.1:8787
```

Publish a test deployment:

```bash
npm run deploy     # prints a https://budgie.<your-subdomain>.workers.dev URL
```

Notes for testing:

- Data stays in each visitor's browser. The deployed site stores nothing on Cloudflare.
- The deployed site cannot reach a local AI, because Ollama runs on your computer. The Assistant falls back to built-in rules there. To test the local AI, use `python3 -m http.server 8080` (see above) or `npm run dev`.
- For a custom domain, add it in the Cloudflare dashboard under Workers & Pages, then Budgie, then Settings, then Domains & Routes.

## Ollama: the default AI engine

Budgie uses Ollama for suggestions, the overview brief, and summaries. It runs on your computer, so your data never leaves it.

One-time setup:

```bash
./scripts/ollama-setup.sh                                    # installs Ollama and downloads llama3.2
./scripts/ollama-setup.sh llama3.2 https://budgie.<your-subdomain>.workers.dev   # also allows the hosted page
```

Then start Ollama with the origin of the page you use:

```bash
OLLAMA_ORIGINS="https://budgie.<your-subdomain>.workers.dev" ollama serve   # hosted page
ollama serve                                                                 # local page
```

Budgie connects by itself on load. If Ollama has a different model installed, it uses that one automatically. Without Ollama, the app still works with its built-in rules.

## Demo data

The first visit loads demo data so you can explore every section. The purple "Demo data · clear" button in the top bar removes it.
