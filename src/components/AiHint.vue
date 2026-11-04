<script setup>
import { computed } from 'vue';
import { hints } from '../lib/hints';

// One sentence from Budgie under a section heading. Hidden when there is nothing to say.
const props = defineProps({ for: { type: String, required: true } });
const text = computed(() => hints.value[props.for]);
</script>

<template>
  <p v-if="text" class="ai-hint" :data-test="`hint-${props.for}`"><span class="ai-spark" aria-hidden="true">✦</span>{{ text }}</p>
</template>
