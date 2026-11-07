# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue.

- Use GitHub's **Report a vulnerability** button on the repository's **Security** tab (private vulnerability reporting).
- Include what you found, steps to reproduce it, and the impact you expect.

You can expect an acknowledgement within a few days. Once a fix ships, the advisory can credit you if you would like.

## Supported versions

Only the current `main` branch receives fixes.

## How Budgie is protected

- **Accounts:** invite-only sign-in with passkeys. Sessions are `__Host-` cookies (HttpOnly, Secure, SameSite=Lax); expired sessions are removed. Only hashes of session cookies, invite links and recovery codes are stored, in Cloudflare D1. Requests that change data must come from the site itself, and each person can reach only their own data.
- **AI model downloads:** the in-browser models download through Budgie's own address, so blockers of other sites do not stop them. The Worker serves only the exact model files Budgie uses, to signed-in people; it is not an open proxy.
- **Rate limits:** sign-in and invite requests are limited to 120 an hour per network address; wrong recovery codes to 10 an hour.
- **Your control:** sign out of every device at once; members can delete their account and all of its data; anyone can download a full copy of their data.
- **Security headers** (`public/_headers`, sent by Cloudflare with every page):
  - A Content Security Policy that only allows the services Budgie uses: exchange rates, Wikidata, Google favicons and fonts, jsDelivr limited to the exact package versions for receipt reading and the processor AI engine, Hugging Face and GitHub for the in-browser models, and Ollama on `localhost` if you run it.
  - No framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `nosniff`, a strict referrer policy, HSTS, and a Permissions Policy that allows only the camera and microphone, for receipt scanning and dictation.
- **Safe rendering:** all text from files, the web and dictation is shown as text. The app never inserts raw HTML.
- **External links** open with `noopener` and `noreferrer`.
- **AI** is optional and runs on your own device: an open-source model inside the browser, or Ollama on your computer. No cloud AI service receives your data, and no API keys exist.
- **Automated checks:** Dependabot keeps npm packages and GitHub Actions current (actions are pinned to exact commits), CodeQL scans the code, the browser smoke test runs with the production security headers, and an end-to-end test covers sign-in, invites, recovery, sessions, account deletion and rate limits against the real Worker.

## Things to know

- Budgie keeps a copy of your data in this browser so it opens quickly and works offline. Anyone who can use your browser profile can read it. Use your device's lock, and sign out on shared computers, which removes the copy.
