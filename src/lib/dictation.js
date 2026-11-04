// Live dictation with the browser's own speech recognition (Chrome, Edge, Safari).
// Audio is handled by the browser; Budgie only receives the text.
import { ref, onUnmounted } from 'vue';

const Speech = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canDictate = !!Speech;

// onText(liveText) fires as words arrive; onFinal(text) once you stop speaking.
export function useDictation({ onText, onFinal, onError, continuous = false } = {}) {
  const listening = ref(false);
  const interim = ref('');
  let rec = null;

  function start() {
    if (!Speech || listening.value) return;
    rec = new Speech();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = continuous;
    let finalText = '';
    rec.onresult = e => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `; else live += r[0].transcript;
      }
      interim.value = live;
      onText?.((finalText + live).trim());
    };
    rec.onerror = e => onError?.(e.error === 'not-allowed' ? 'Allow the microphone to dictate.' : 'Dictation stopped. Try again.');
    rec.onend = () => { listening.value = false; interim.value = ''; if (finalText.trim()) onFinal?.(finalText.trim()); };
    listening.value = true;
    rec.start();
  }
  const stop = () => rec?.stop();
  const toggle = () => (listening.value ? stop() : start());
  onUnmounted(() => rec?.abort());
  return { listening, interim, start, stop, toggle };
}
