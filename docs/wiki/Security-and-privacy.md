# Security and privacy

## Public code, private data

| | Where it lives | Who can see it |
| --- | --- | --- |
| Source code | This GitHub repository | Anyone |
| Your tasks, routines, goals, calendar links, digest profile, digests and settings | Your account in Cloudflare D1, plus a copy in your browser | Only you |
| Passkeys | Your device or password manager | Only you (Taskie keeps the public half) |
| Recordings | Heard once by Deepgram Nova-3 (Cloudflare) and Gemini; never stored | Nobody keeps them |
| Training text (Help Taskie hear better) | Your account's server, as text | Used only to train Taskie; you can turn it off |

Never commit personal details, private links, tokens, invite links or the address of a private deployment.

## How Taskie protects accounts

- Invite-only sign-in with passkeys; invite and device links work once and expire.
- Optional single-use recovery codes, rate-limited.
- Only hashes of sessions, invites and recovery codes are stored.
- `__Host-` session cookies: HttpOnly, Secure, SameSite=Lax; expired sessions are cleaned up.
- Requests that change data must come from the site itself.
- Sign-in, invite and recovery requests are limited per network address.
- Sign out of one device or every device; members can delete their account and data; anyone can download a copy.

## How the site is protected

- A Content Security Policy that allows only the services Taskie uses, with jsDelivr limited to the exact package versions it loads.
- No framing, `nosniff`, a strict referrer policy, HSTS and a minimal Permissions Policy.
- Text from files, the web and dictation is always shown as text, never as HTML.

## Checks on every change

- CodeQL code scanning.
- Dependabot for npm packages and GitHub Actions; every action is pinned to an exact commit.
- A browser smoke test run with the production security headers.
- An end-to-end accounts test against the real Worker and a local database: invites, passkeys, recovery codes, sessions, sign out everywhere, account deletion and rate limits.

## Repository settings checklist (for the owner)

See [Repository rules](Repository-rules) for protecting `main`. Also:

1. **Settings → Advanced Security:** turn on **Dependabot alerts**, **Dependabot security updates**, **Private vulnerability reporting**, and under secret scanning **Non-provider patterns** and **Validity checks** (secret scanning and push protection are already on).
2. **Settings → General → Features:** untick **Projects** and **Discussions** if you do not use them. Keep **Issues** for bug reports. If you keep **Wikis**, tick **Restrict editing to collaborators only** so strangers cannot change the pages.
3. **Forking:** GitHub does not let you turn off forking for a public repository. That is fine here because the code holds no secrets or personal data; keep it that way.
4. **Settings → General → Pull Requests:** tick **Automatically delete head branches**.
5. **Branches:** delete branches that are no longer used.
6. **Settings → Actions → General:** under **Workflow permissions**, choose **Read repository contents and packages permissions** (each workflow asks for more only where it needs it), and tick **Require approval for all outside collaborators**.
