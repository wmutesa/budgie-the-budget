# Repository rules

These rules protect `main`. You can import them from `.github/rulesets/protect-main.json`, or create them by hand as below.

## Create the ruleset by hand

1. Go to the repository on GitHub and open **Settings**.
2. In the sidebar, under **Code and automation**, open **Rules → Rulesets**.
3. Click **New ruleset → New branch ruleset**.
4. **Ruleset name:** `Protect main`.
5. **Enforcement status:** Active.
6. **Bypass list** (optional): click **Add bypass**, choose **Repository admin**, and set it to **Always** for emergencies, or **For pull requests only** if every change should go through a pull request.
7. **Target branches:** click **Add target → Include default branch**.
8. Under **Branch rules**, tick:
   - **Restrict deletions**
   - **Require linear history**
   - **Require a pull request before merging**, then expand it:
     - Required approvals: `0` (raise it when there are more maintainers)
     - Tick **Dismiss stale pull request approvals when new commits are pushed**
     - Tick **Require conversation resolution before merging**
     - Allowed merge methods: **Squash** and **Rebase**
   - **Require status checks to pass**, then expand it:
     - Tick **Require branches to be up to date before merging**
     - Click **Add checks**, type `ci`, and choose it (it appears after CI has run at least once)
   - **Block force pushes**
9. Click **Create**.

## Related settings

- **Settings → General → Pull Requests:** tick **Automatically delete head branches** so merged branches clean themselves up.
- **Settings → Advanced Security:** turn on **Dependabot alerts**, **Dependabot security updates** and **Private vulnerability reporting**.
