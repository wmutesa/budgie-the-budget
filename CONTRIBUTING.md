# Contributing to Budgie

Thanks for helping. This guide covers how to propose a change and what a change needs before it can merge.

## Before you start

- For anything larger than a small fix, open an issue first and describe the problem and your idea. Use the bug report or feature request template.
- Be kind and specific. The [Code of Conduct](CODE_OF_CONDUCT.md) applies everywhere in this project.

## Set up

```bash
git clone https://github.com/wmutesa/budgie-the-budget
cd budgie-the-budget
npm install
npm run dev
```

## Make a change

1. Create a branch from `main`: `git checkout -b short-description`.
2. Keep the change focused on one thing.
3. Run the checks:

   ```bash
   npm run build
   npm test
   ```

4. If you changed how something looks, check it at phone width (about 390px) and desktop width.
5. Open a pull request against `main` and fill in the template.

## What a pull request needs

- The `ci` check passes (build plus browser smoke test).
- The change is covered by the smoke test when it adds or changes a user flow. Extend `tests/smoke.cjs`.
- No new network destinations without a reason in the pull request. If one is needed, update `public/_headers` (Content Security Policy) and the privacy list in the README.
- No secrets, tokens or personal data in code, commits or test fixtures.
- Merges are squash or rebase, so history stays linear.

## Code style

- Vue 3 single-file components with `<script setup>`.
- Plain CSS in `src/styles.css`; reuse the existing tokens and patterns.
- Write user-facing text in plain language. Prefer short sentences, active voice and specific wording.
- Keep personal data in the person's account. The Worker fetches only what the person asked for (calendars, digest sources) and never logs links or profiles.

## Adding digest sources or goal templates

- **Digest sources:** add free, public sources in `worker/digest.js` (`collect`). Every address must pass `checkFeedUrl`; keep sizes capped and do not add sources that need an API key.
- **Goal milestones:** add a rule to `ruleMilestones` in `src/lib/goals.js`, with a unit test in `tests/unit/run.mjs`.

## Reporting security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Wiki

The wiki's source lives in `docs/wiki/`. Update those files in the same pull request as the change they describe.
