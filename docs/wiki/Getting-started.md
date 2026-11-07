# Getting started

## Use Budgie

Budgie is a web app. There is nothing to download or install: open the Budgie address in your invite in an up-to-date browser on your phone, tablet or computer.

1. Open the invite link you were sent and create a passkey. Your device asks for your fingerprint, face or PIN.
2. Save your recovery codes, or skip them if your passkey syncs with iCloud Keychain or Google Password Manager.
3. Follow the short tour. Your data syncs to your account, so you can open Budgie on any of your devices.

To use another device, open the account menu (your initial in the top bar), choose **Add a device**, and scan the QR code with that device.

**On a phone:** use the browser's share or menu button and choose **Add to Home Screen**. Budgie then opens full screen like an app. It is still the same website, and updates arrive automatically.

## AI on your device (optional, no API key)

Budgie works without AI. For smarter receipt reading and suggestions, it can use a free open-source model that runs on your own device, so nothing goes to a cloud AI service.

**In the browser, on by default:** after you sign in, Budgie downloads Qwen 2.5 (about 300 MB) and, on capable devices, Llama 3.2 (about 900 MB) from Hugging Face, once. It picks the best ready model for each job: Qwen for reading receipts, Llama for writing suggestions. On slow or data-saving connections the download waits until you choose **Download now** in the account menu. You can turn AI off on a device from the same place, which deletes the downloads. It needs an up-to-date Chrome, Edge or Safari on a recent device; otherwise Budgie uses its built-in rules.

**With Ollama:** if you run [Ollama](https://ollama.com) on your computer, Budgie uses it first for every job.

```bash
./scripts/ollama-setup.sh
OLLAMA_ORIGINS="<your Budgie address>" ollama serve
```

Your browser may ask whether Budgie can reach devices on your local network; allow it to use Ollama.

## For developers: run it locally

```bash
git clone https://github.com/wmutesa/budgie-the-budget
cd budgie-the-budget
npm install
npm run build
npx wrangler d1 migrations apply budgie --local
npm run dev:api
```

Open http://localhost:8787.
