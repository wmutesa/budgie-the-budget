# Data sources and privacy

## Where your data lives
In your account, in Budgie's Cloudflare D1 database, with a copy in your browser so the app opens instantly and works offline. Budgie is invite-only and each person sees only their own data. Sign-in uses passkeys; only hashes of session cookies and invite links are stored. Signing out removes this device's copy.

## What Budgie connects to

| Service | Why |
| --- | --- |
| Budgie's own server (Cloudflare Worker and D1) | Sign-in, invites and syncing your data |
| ExchangeRate-API (open.er-api.com) | Live exchange rates |
| Frankfurter (ECB rates) | Backup exchange rates |
| Wikidata | Looking up companies and their websites |
| Google favicon service | Company logos |
| Google Fonts | Fonts |
| jsDelivr | Files for reading receipt photos |
| Ollama on localhost | Optional local AI |

The site's Content Security Policy blocks every other destination.

## Sample data
Account balances and the year's history are sample data until real accounts are connected. Rates and company details are always live.
