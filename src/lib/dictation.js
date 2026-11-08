// Live dictation with the browser's own speech recognition (Chrome, Edge, Safari).
// Audio is handled by the browser; Budgie only receives the text.
import { ref, onUnmounted } from 'vue';

const Speech = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canDictate = !!Speech;

// Recognition is tuned per accent: picking yours makes a real difference.
export const ACCENTS = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-CA', 'English (Canada)'], ['en-AU', 'English (Australia)'],
  ['en-NZ', 'English (New Zealand)'], ['en-IE', 'English (Ireland)'], ['en-IN', 'English (India)'], ['en-PK', 'English (Pakistan)'],
  ['en-NG', 'English (Nigeria)'], ['en-KE', 'English (Kenya)'], ['en-GH', 'English (Ghana)'], ['en-TZ', 'English (Tanzania)'],
  ['en-ZA', 'English (South Africa)'], ['en-PH', 'English (Philippines)'], ['en-SG', 'English (Singapore)'], ['en-HK', 'English (Hong Kong)'],
  ['fr-FR', 'Français'], ['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['pt-BR', 'Português (Brasil)'],
  ['de-DE', 'Deutsch'], ['sw-KE', 'Kiswahili'], ['rw-RW', 'Kinyarwanda'], ['ar-SA', 'العربية'], ['hi-IN', 'हिन्दी'], ['zh-CN', '中文'],
];
// The browser's language when it is in the list, else the closest English.
export function defaultAccent() {
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  if (ACCENTS.some(([c]) => c === nav)) return nav;
  const lang = nav.split('-')[0];
  return ACCENTS.find(([c]) => c.startsWith(`${lang}-`))?.[0] || 'en-US';
}

// onText(liveText) fires as words arrive; onFinal(text) once you stop speaking.
// `lang` is a function returning the accent to listen for.
// commit() keeps going but forgets what was heard so far: call it when the
// person edits the text, so new words land after their edit instead of over it.
export function useDictation({ onText, onFinal, onError, onCancel, continuous = false, lang = defaultAccent } = {}) {
  const listening = ref(false);
  const interim = ref('');
  const transcript = ref('');
  const elapsed = ref(0);
  let rec = null;
  let timer = null;
  let cancelled = false;
  let wanted = false;     // the person wants to keep listening (browsers stop after a pause)
  let finalText = '';
  let from = 0;           // results before this index were committed by an edit
  let cut = 0;            // characters of result `from` already committed (a phrase still being spoken)
  let seen = 0;
  let lastLive = '';      // the phrase still being spoken, as last heard

  // The most likely words: the browser's first guess, unless a later guess is clearly surer.
  const best = r => { let b = r[0]; for (let i = 1; i < r.length; i++) if ((r[i].confidence || 0) > (b.confidence || 0) + 0.15) b = r[i]; return b.transcript; };

  function open() {
    rec = new Speech();
    rec.lang = lang() || 'en-US';
    rec.interimResults = true;
    rec.continuous = continuous;
    rec.maxAlternatives = 3;
    from = 0; cut = 0; seen = 0; lastLive = '';
    rec.onresult = e => {
      seen = e.results.length;
      let live = '';
      let fin = '';
      for (let i = from; i < e.results.length; i++) {
        const r = e.results[i];
        let words = best(r);
        if (i === from && cut) words = words.slice(cut);
        if (r.isFinal) { if (words.trim()) fin += `${words.trim()} `; } else live += words;
      }
      const last = e.results[e.results.length - 1];
      lastLive = last && !last.isFinal ? best(last) : '';
      interim.value = live;
      transcript.value = (finalText + fin + live).trim();
      if (!cancelled) onText?.(transcript.value);
      // Keep finals from this session in finalText only when the session ends.
      rec._fin = fin;
    };
    rec.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wanted = false;
      onError?.(e.error === 'not-allowed' ? 'Allow the microphone to see your words as you talk.' : e.error === 'service-not-allowed' ? 'Live text needs Dictation turned on (on a Mac: System Settings, Keyboard, Dictation).' : e.error === 'language-not-supported' ? 'This browser cannot listen in that language yet.' : e.error === 'audio-capture' ? 'The microphone is busy or missing.' : 'Live text stopped.', e.error);
    };
    rec.onend = () => {
      finalText += rec?._fin || '';
      // Browsers end a session after a pause: carry on while the person still wants to talk.
      if (wanted && !cancelled) { try { open(); rec.start(); return; } catch { /* fall through and stop */ } }
      clearInterval(timer);
      listening.value = false;
      interim.value = '';
      if (!cancelled && finalText.trim()) onFinal?.(finalText.trim());
    };
  }
  function start() {
    if (!Speech || listening.value) return;
    cancelled = false; wanted = true; finalText = '';
    transcript.value = '';
    elapsed.value = 0;
    clearInterval(timer);
    timer = setInterval(() => { elapsed.value += 1; }, 1000);
    open();
    listening.value = true;
    rec.start();
  }
  const stop = () => { wanted = false; rec?.stop(); };
  // Forget what was heard so far (it is now part of the edited text) and keep listening.
  // A phrase still being spoken keeps going: only words after what was already used count.
  const commit = () => {
    finalText = ''; if (rec) rec._fin = '';
    if (lastLive) { from = Math.max(0, seen - 1); cut = lastLive.length; } else { from = seen; cut = 0; }
    transcript.value = ''; interim.value = '';
  };
  // Cancel throws away what was heard.
  const cancel = () => { cancelled = true; wanted = false; onCancel?.(); rec?.abort(); };
  const toggle = () => (listening.value ? stop() : start());
  onUnmounted(() => { wanted = false; clearInterval(timer); rec?.abort(); });
  return { listening, interim, transcript, elapsed, start, stop, cancel, toggle, commit };
}
