<script setup>
// Microphone toggle. While listening it turns into a red stop square.
defineProps({ listening: { type: Boolean, default: false }, label: { type: String, default: 'Dictate' } });
defineEmits(['toggle']);
</script>

<template>
  <button type="button" class="mic-btn" :class="{ on: listening }" :aria-pressed="listening" :aria-label="listening ? 'Stop dictation' : label" :title="listening ? 'Stop' : label" @click="$emit('toggle')">
    <span v-if="listening" class="mic-stop" aria-hidden="true"><i /></span>
    <svg v-else viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" fill="currentColor" /></svg>
  </button>
</template>
