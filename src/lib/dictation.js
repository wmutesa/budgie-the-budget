// Live dictation with the browser's own speech recognition (Chrome, Edge, Safari).
// Audio is handled by the browser; Budgie only receives the text.
import { ref, onUnmounted } from 'vue';

const Speech = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canDictate = !!Speech;

// onText(liveText) fires as words arrive; onFinal(text) once you stop speaking.
export function useDictation({ onText, onFinal, onError, onCancel, continuous = false } = {}) {
  const listening = ref(false);
  const interim = ref('');
  const transcript = ref('');
  const elapsed = ref(0);
  let rec = null;
  let timer = null;
  let cancelled = false;

  function start() {
    if (!Speech || listening.value) return;
    rec = new Speech();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = continuous;
    let finalText = '';
    cancelled = false;
    transcript.value = '';
    elapsed.value = 0;
    clearInterval(timer);
    timer = setInterval(() => { elapsed.value += 1; }, 1000);
    rec.onresult = e => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `; else live += r[0].transcript;
      }
      interim.value = live;
      transcript.value = (finalText + live).trim();
      if (!cancelled) onText?.(transcript.value);
    };
    rec.onerror = e => onError?.(e.error === 'not-allowed' ? 'Allow the microphone to dictate.' : 'Dictation stopped. Try again.');
    rec.onend = () => {
      clearInterval(timer);
      listening.value = false;
      interim.value = '';
      if (!cancelled && finalText.trim()) onFinal?.(finalText.trim());
    };
    listening.value = true;
    rec.start();
  }
  const stop = () => rec?.stop();
  // Cancel throws away what was heard.
  const cancel = () => { cancelled = true; onCancel?.(); rec?.abort(); };
  const toggle = () => (listening.value ? stop() : start());
  onUnmounted(() => { clearInterval(timer); rec?.abort(); });
  return { listening, interim, transcript, elapsed, start, stop, cancel, toggle };
}
