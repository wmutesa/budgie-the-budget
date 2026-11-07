<script setup>
import { toasts, dismiss } from '../lib/toast';
import Icon from './Icon.vue';

// The corner stack of notifications (see toast.js). Errors stay until closed.
const icon = { info: 'help', success: 'check', warn: 'bell', error: 'x', loading: 'refresh' };
const run = t => { t.action?.run(); dismiss(t.id); };
</script>

<template>
  <div class="toasts" aria-live="polite" aria-relevant="additions text" data-test="toasts">
    <div v-for="t in toasts.slice(-3)" :key="t.id" class="toast" :class="t.kind" :role="t.kind === 'error' ? 'alert' : 'status'" data-test="toast">
      <span class="toast-ico"><Icon :name="icon[t.kind]" :size="14" /></span>
      <div class="toast-text">
        <b v-if="t.title">{{ t.title }}</b>
        <span>{{ t.text }}</span>
        <button v-if="t.action" type="button" class="toast-act" @click="run(t)">{{ t.action.label }}</button>
      </div>
      <button v-if="t.kind !== 'loading'" type="button" class="toast-x" aria-label="Close" title="Close" @click="dismiss(t.id)"><Icon name="x" :size="13" /></button>
    </div>
  </div>
</template>
