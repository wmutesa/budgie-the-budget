<script setup>
import { computed } from 'vue';

// Shown while dictating: time, a live waveform, the words so far, and stop or cancel.
const props = defineProps({
  elapsed: { type: Number, default: 0 },
  transcript: { type: String, default: '' },
  hint: { type: String, default: 'Speak naturally. Stop when you are done.' },
  stopLabel: { type: String, default: 'Done' },
});
defineEmits(['stop', 'cancel']);
const time = computed(() => `${Math.floor(props.elapsed / 60)}:${String(props.elapsed % 60).padStart(2, '0')}`);
</script>

<template>
  <div class="rec-strip" role="status" aria-live="polite">
    <span class="rec-dot" aria-hidden="true" />
    <span class="rec-time">{{ time }}</span>
    <span class="rec-wave" aria-hidden="true"><i v-for="n in 14" :key="n" :style="{ animationDelay: `${(n * 73) % 900}ms` }" /></span>
    <p class="rec-text" :class="{ empty: !transcript }">{{ transcript || hint }}</p>
    <button type="button" class="rec-cancel" @click="$emit('cancel')">Cancel</button>
    <button type="button" class="rec-done" @click="$emit('stop')">{{ stopLabel }}</button>
  </div>
</template>
