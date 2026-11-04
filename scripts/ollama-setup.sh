#!/usr/bin/env bash
# One-time setup so Budgie can use Ollama on this computer.
#   ./scripts/ollama-setup.sh [model] [site-origin]
#   ./scripts/ollama-setup.sh llama3.2 https://budgie.<your-subdomain>.workers.dev
set -euo pipefail

MODEL="${1:-llama3.2}"
ORIGIN="${2:-}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

echo "Downloading model: ${MODEL}"
ollama pull "${MODEL}"

echo
echo "Ollama is ready. Start it with:  ollama serve"
if [ -n "${ORIGIN}" ]; then
  echo "To let the hosted Budgie page talk to it, start Ollama with:"
  echo "  OLLAMA_ORIGINS=\"${ORIGIN}\" ollama serve"
fi
