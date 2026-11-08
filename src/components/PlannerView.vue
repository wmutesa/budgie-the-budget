<script setup>
import PlanSchedule from './PlanSchedule.vue';
import Icon from './Icon.vue';
import { focus, finishFocus, toggleFocus, mmss } from '../lib/focus';

// The Schedule page: your day, week and month, with the activity list beside
// them. A running focus session shows as a slim bar above.
</script>

<template>
  <div class="pln span-12" data-test="planner">
    <div v-if="focus.task" class="pln-focusbar" role="status" data-test="focusbar">
      <button type="button" class="lk-open" title="Open Lock In" aria-label="Open Lock In" @click="focus.min = false"><Icon name="timer" /></button><b>{{ focus.task.title }}</b><span class="pln-clock small">{{ focus.ended ? 'Time is up' : mmss(focus.left) }}</span>
      <button type="button" class="ibtn ghost" :title="focus.running ? 'Pause' : 'Resume'" :aria-label="focus.running ? 'Pause' : 'Resume'" @click="toggleFocus"><Icon :name="focus.running ? 'pause' : 'play'" /></button>
      <button type="button" class="ibtn ghost" title="Mark done" aria-label="Mark done" @click="finishFocus"><Icon name="check" /></button>
    </div>
    <PlanSchedule />
  </div>
</template>
