# Deploying

1. Merge to `main` through a pull request.
2. GitHub Actions runs the build, the browser smoke test and CodeQL.
3. Cloudflare's GitHub integration runs `npx wrangler deploy`. `wrangler.jsonc` runs `npm run build` first and publishes `dist/` with single-page routing.
4. `public/_headers` sets the security headers.

A manual fallback deploy exists in `.github/workflows/deploy-cloudflare.yml`. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.
