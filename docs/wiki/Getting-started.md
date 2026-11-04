# Getting started

## Use the live site

Open https://budgie.engineering-willy-mutesa.workers.dev. Your data stays in this browser. Use the same browser on the same device to keep it.

## Run it on your computer

```bash
git clone https://github.com/wmutesa/budgie-the-budget
cd budgie-the-budget
npm install
npm run dev
```

Open http://localhost:5173.

## Turn on the local AI (optional)

Budgie works without AI. With [Ollama](https://ollama.com) running on your computer, it reads receipts and writes suggestions with a local model.

```bash
./scripts/ollama-setup.sh
ollama serve
```

To let the live site reach Ollama on your computer, start Ollama with the site allowed:

```bash
OLLAMA_ORIGINS="https://budgie.engineering-willy-mutesa.workers.dev" ollama serve
```
