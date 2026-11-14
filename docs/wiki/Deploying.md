# Deploying

1. Merge to `main` through a pull request.
2. GitHub Actions runs the build, the browser smoke test and CodeQL.
3. Cloudflare's GitHub integration runs `npx wrangler deploy`. `wrangler.jsonc` runs `npm run build` first and publishes `dist/` with single-page routing.
4. `public/_headers` sets the security headers.

A manual fallback deploy exists in `.github/workflows/deploy-cloudflare.yml`. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Keeping passkeys when the address changes

A passkey belongs to the domain it was made on. A new address has no passkeys, so
everyone would need a recovery code or an "Add a device" link once.

To avoid that, give Taskie a domain you own and keep it:

1. Buy the domain (for example `taskie.app`) and point it at the Worker
   (Workers & Pages, budgie, Settings, Domains & Routes, Add custom domain).
2. Set the variable `RP_ID` to that domain (Settings, Variables and secrets, or
   a `"vars": { "RP_ID": "taskie.app" }` entry in `wrangler.jsonc`).
3. Passkeys then work on `taskie.app` and every subdomain of it. Renaming the app
   or moving it to another subdomain keeps everyone's passkeys.

The old `workers.dev` address keeps working with its own passkeys during the move.
Anyone who signs in on a new address without a passkey there sees how to add one
from a device they are already signed in on, or with a recovery code.
