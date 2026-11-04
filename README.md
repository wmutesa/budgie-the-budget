# Ledgerline

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
4. In Ledgerline, open **Settings → Local AI** and press **Test connection**.

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

- **Account balance** = starting balance + income − spending ± transfers. Use the ✎ on an account to set today's balance. Ledgerline logs the difference as a balance update, so the history stays honest.
- **Transfer or save** moves money from an account to another account or to a goal. Money in a goal counts toward that goal and leaves the source account.
- **Net worth** = accounts + goals. Moving money between your own holdings does not change it.
- **Plan** = income − category budgets − subscriptions (monthly equivalent) − the monthly amount each goal needs. Subscriptions are their own line, so lower a category budget that duplicates one.

## Files

- `index.html`: page shell
- `styles.css`: design system (dark, serif numerals, bento grid, responsive)
- `app.js`: data model, calculations, views, forms, alerts, demo data
- `ai.js`: connection to the local model server
