# Data sources and privacy

Taskie reaches these services. Nothing else is allowed by the site's security policy.

| Service | What it is for |
| --- | --- |
| Taskie's own server (Cloudflare Workers and D1) | Your account, sync, calendar imports, notifications |
| Deepgram Nova-3 on Cloudflare Workers AI | Hears each recording once (zero data retention); the audio is not kept |
| Llama 3.3 on Cloudflare Workers AI | Splits notes into items when Gemini is not available |
| Google Gemini (server key, the owner's shared key or your own) | Corrects what Nova-3 heard, splits notes, writes What's next ideas and task steps |
| Browser push services (Apple, Google, Mozilla, Microsoft) | An empty wake-up for notifications; the message itself comes from Taskie's server |
| Calendar links you add (Canvas, Google, Apple, Outlook, public calendars) | Schedule imports, fetched by Taskie's server |
| Hugging Face and GitHub (through Taskie's server), jsDelivr | The optional in-browser AI used when the server cannot be reached |

What is sent to Gemini: the recording (for correction), and for ideas a short summary of your planner (titles, kinds, dates and goals; never notes). Your details, Gemini key and calendar links are saved in your private account. With **Help Taskie hear better** on, the text of what was heard and what it became is kept for training; turn it off in Settings, AI.
