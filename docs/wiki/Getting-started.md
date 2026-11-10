# Getting started

## Use Taskie

Taskie is a web app. There is nothing to download or install: open the Taskie address in your invite in an up-to-date browser on your phone, tablet or computer.

1. Open the invite link you were sent and create a passkey. Your device asks for your fingerprint, face or PIN.
2. Save your recovery codes, or skip them if your passkey syncs with iCloud Keychain or Google Password Manager.
3. Follow the short tour. Your data syncs to your account, so you can open Taskie on any of your devices.
4. Open the account menu (your avatar, top right): fill in **Profile**, and add a free Gemini key under **Digests & AI** for deeper research. **My brief** on the Digests page is written for you straight away.

To use another device, open the account menu (your initial in the top bar), choose **Add a device**, and scan the QR code with that device.

**On a phone:** use the browser's share or menu button and choose **Add to Home Screen**. Taskie then opens full screen like an app. It is still the same website, and updates arrive automatically.

## AI

Taskie's AI runs on its server: Deepgram Nova-3 hears recordings, Gemini corrects them and splits notes, writes What's next ideas and task steps, and Llama 3.3 steps in when Gemini is unavailable. Nothing to set up. Optionally add your own free Gemini key in **Settings, AI**.

### Offline backup on your device (optional)

When the server cannot be reached, Taskie can use a free open-source model on your own device.

**In the browser, on by default:** after you sign in, Taskie downloads Qwen 2.5 (about 300 MB) and, on capable devices, Llama 3.2 (about 900 MB) from Hugging Face, once. It picks the best ready model for each job: Qwen for quick structured answers, Llama for writing. The models download through Taskie's own address, so content blockers and strict networks do not stop them. On slow or data-saving connections the download waits until you choose **Download now** in the account menu. You can turn AI off on a device from the same place, which deletes the downloads. It needs an up-to-date Chrome, Edge or Safari on a recent device; otherwise Taskie uses its built-in rules.

**With Ollama:** if you run [Ollama](https://ollama.com) on your computer, Taskie uses it first for every job.

```bash
./scripts/ollama-setup.sh
OLLAMA_ORIGINS="<your Taskie address>" ollama serve
```

Your browser may ask whether Taskie can reach devices on your local network; allow it to use Ollama.

## For developers: run it locally

```bash
git clone https://github.com/wmutesa/taskie-the-task
cd taskie-the-task
npm install
npm run build
npx wrangler d1 migrations apply budgie --local
npm run dev:api
```

Open http://localhost:8787.
