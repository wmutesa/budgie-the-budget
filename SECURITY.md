# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue.

- Use GitHub's **Report a vulnerability** button on the repository's **Security** tab (private vulnerability reporting).
- Include what you found, steps to reproduce it, and the impact you expect.

You can expect an acknowledgement within a few days. Once a fix ships, the advisory can credit you if you would like.

## Supported versions

Only the current `main` branch receives fixes.

## How Taskie is protected

- **Accounts:** invite-only sign-in with passkeys. Sessions are `__Host-` cookies (HttpOnly, Secure, SameSite=Lax); expired sessions are removed. Only hashes of session cookies, invite links and recovery codes are stored, in Cloudflare D1. Requests that change data must come from the site itself, and each person can reach only their own data.
- **AI model downloads:** the in-browser models download through Taskie's own address, so blockers of other sites do not stop them. The Worker serves only the exact model files Taskie uses, to signed-in people; it is not an open proxy.
- **Rate limits:** sign-in and invite requests are limited to 120 an hour per network address; wrong recovery codes to 10 an hour; calendar imports to 60 and "Generate now" digests to 6 an hour per person.
- **Safe fetching:** calendar links and digest sources must be public https addresses (no local or private addresses, no passwords in links, redirects checked) and are size-capped. The schedule writes digests only for people whose profile is on automatic.
- **Your control:** sign out of every device at once; members can delete their account and all of its data; anyone can download a full copy of their data.
- **Security headers** (`public/_headers`, sent by Cloudflare with every page):
  - A Content Security Policy that only allows the services Taskie uses: Google Fonts, jsDelivr limited to the exact version of the processor AI engine, Hugging Face and GitHub for the in-browser models, and Ollama on `localhost` if you run it.
  - No framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `nosniff`, a strict referrer policy, HSTS, and a Permissions Policy that allows only the microphone, for dictation.
- **Safe rendering:** all text from files, the web and dictation is shown as text. The app never inserts raw HTML.
- **External links** open with `noopener` and `noreferrer`.
- **AI:** recordings are heard once by Deepgram Nova-3 on Cloudflare Workers AI (zero data retention) and corrected by Google Gemini; the audio is never stored. Typed notes, What's next ideas and task steps go to Gemini (or Llama 3.3 on Workers AI). A short planner summary is sent for ideas, never notes. Help Taskie hear better keeps text only and can be turned off. The in-browser model remains as an offline backup.
- **Automated checks:** Dependabot keeps npm packages and GitHub Actions current (actions are pinned to exact commits), CodeQL scans the code, the browser smoke test runs with the production security headers, and an end-to-end test covers sign-in, invites, recovery, sessions, account deletion and rate limits against the real Worker.

## Things to know

- Taskie keeps a copy of your data in this browser so it opens quickly and works offline. Anyone who can use your browser profile can read it. Use your device's lock, and sign out on shared computers, which removes the copy.
