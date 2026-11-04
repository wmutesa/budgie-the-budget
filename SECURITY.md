# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue.

- Use GitHub's **Report a vulnerability** button on the repository's **Security** tab (private vulnerability reporting).
- Include what you found, steps to reproduce it, and the impact you expect.

You can expect an acknowledgement within a few days. Once a fix ships, the advisory can credit you if you would like.

## Supported versions

Only the current `main` branch, which is what the live site runs, receives fixes.

## How Budgie is protected

- **Accounts:** invite-only sign-in with passkeys. Sessions are HttpOnly, Secure cookies; only hashes of session cookies, invite links and recovery codes are stored, in Cloudflare D1. Requests that change data must come from the site itself, and each person can reach only their own data.
- **Security headers** (`public/_headers`, sent by Cloudflare with every page):
  - A Content Security Policy that only allows the services Budgie uses: exchange rates, Wikidata, Google favicons and fonts, jsDelivr for receipt reading, Hugging Face and GitHub for the optional in-browser model, and Ollama on `localhost` if you run it.
  - No framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `nosniff`, a strict referrer policy, HSTS, and a Permissions Policy that allows only the camera and microphone, for receipt scanning and dictation.
- **Safe rendering:** all text from files, the web and dictation is shown as text. The app never inserts raw HTML.
- **External links** open with `noopener` and `noreferrer`.
- **AI** is optional and runs on your own device: an open-source model inside the browser, or Ollama on your computer. No cloud AI service receives your data, and no API keys exist.
- **Automated checks:** Dependabot keeps dependencies current, CodeQL scans the code, and the browser smoke test runs with the production security headers, so a policy that blocks the app fails CI.

## Things to know

- Budgie keeps a copy of your data in this browser so it opens quickly and works offline. Anyone who can use your browser profile can read it. Use your device's lock, and sign out on shared computers, which removes the copy.
