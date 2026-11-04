# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue.

- Use GitHub's **Report a vulnerability** button on the repository's **Security** tab (private vulnerability reporting).
- Include what you found, steps to reproduce it, and the impact you expect.

You can expect an acknowledgement within a few days. Once a fix ships, the advisory can credit you if you would like.

## Supported versions

Only the current `main` branch, which is what the live site runs, receives fixes.

## How Budgie is protected

- **No server-side data:** there is no backend or database. Your entries stay in your browser's local storage on your device.
- **Security headers** (`public/_headers`, sent by Cloudflare with every page):
  - A Content Security Policy that only allows the services Budgie uses: exchange rates, Wikidata, Google favicons and fonts, jsDelivr for receipt reading, and Ollama on `localhost`.
  - No framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `nosniff`, a strict referrer policy, HSTS, and a Permissions Policy that allows only the camera and microphone, for receipt scanning and dictation.
- **Safe rendering:** all text from files, the web and dictation is shown as text. The app never inserts raw HTML.
- **External links** open with `noopener` and `noreferrer`.
- **Local AI** runs on your own computer through Ollama. No cloud AI service receives your data.
- **Automated checks:** Dependabot keeps dependencies current, CodeQL scans the code, and the browser smoke test runs with the production security headers, so a policy that blocks the app fails CI.

## Things to know

- Anyone with access to your browser profile can read Budgie's local data. Use your device's lock and your browser's profile protections.
- Clearing site data deletes your Budgie data.
