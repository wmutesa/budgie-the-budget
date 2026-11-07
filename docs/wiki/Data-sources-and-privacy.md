# Data sources and privacy

Budgie reaches these services. Nothing else is allowed by the site's security policy.

| Service | What it is for |
| --- | --- |
| Budgie's own server (Cloudflare) | Your account, sync, calendar imports, digests and AI model files |
| Google News (RSS), Greenhouse and Lever job boards, feeds you add | Digest sources, fetched by Budgie's server with your interests as search words |
| Calendar links you add (Canvas, Google, Apple, Outlook) | Planner imports, fetched by Budgie's server |
| Hugging Face and GitHub (through Budgie's server) | The in-browser AI models, downloaded once |
| jsDelivr (one exact package version) | The processor engine for the in-browser AI |
| Google Gemini (only if you add your own key) | "Research deeper" in Digests |
| Ollama on your computer (localhost) | Optional AI |

Your digest profile and calendar links are saved in your private account. Search words built from your interests are sent to Google News when a digest is written; nothing else about you is sent to the digest sources.
