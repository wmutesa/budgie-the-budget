# Getting started

## Use Budgie

Budgie is a web app. There is nothing to download or install: open https://budgie.engineering-willy-mutesa.workers.dev in an up-to-date browser on your phone, tablet or computer.

1. Open the invite link you were sent and create a passkey. Your device asks for your fingerprint, face or PIN.
2. Save your recovery codes, or skip them if your passkey syncs with iCloud Keychain or Google Password Manager.
3. Follow the short tour. Your data syncs to your account, so you can open Budgie on any of your devices.

To use another device, open the account menu (your initial in the top bar), choose **Add a device**, and scan the QR code with that device.

**On a phone:** use the browser's share or menu button and choose **Add to Home Screen**. Budgie then opens full screen like an app. It is still the same website, and updates arrive automatically.

## AI

Budgie reads receipts and writes suggestions with an open model (Meta's Llama 3.1) on Cloudflare Workers AI. Ollama itself is a program for your own computer and cannot run on Cloudflare, so Budgie uses Workers AI, which runs the same family of open models on Cloudflare's servers. There is nothing to set up. Without AI, Budgie uses its built-in rules.

## For developers: run it locally

```bash
git clone https://github.com/wmutesa/budgie-the-budget
cd budgie-the-budget
npm install
npm run build
npx wrangler d1 migrations apply budgie --local
npm run dev:api
```

Open http://localhost:8787. To create the first owner invite on the local database, see "First owner" in the README.
