<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { makeGoal, planGoal, progress, removeGoal, addMilestones, parseGoal } from '../lib/goals';
import { toggleDone, isDone, dayLabel } from '../lib/tasks';
import { labelFor } from '../lib/ai';
import Icon from './Icon.vue';
import { toast, loading, finish } from '../lib/toast';
import DateField from './DateField.vue';
import MicButton from './MicButton.vue';
import { useDictation, canDictate } from '../lib/dictation';
import TimeField from './TimeField.vue';

// Life goals with milestones. Each milestone is a Planner task, so ticking it
// there (or here) moves the goal forward.
const title = ref('');
const by = ref('');
const why = ref('');
const busy = ref('');
const note = ref('');
const open = ref(null);
const step = ref('');
const list = computed(() => store.goals.map(g => ({ g, p: progress(g), tasks: store.tasks.filter(t => t.goalId === g.id && !t.repeat).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')) })));
// Say a goal: words appear as you speak; stopping plans it. Anything after
// "because" or "so that" becomes why it matters.
const dict = useDictation({
  continuous: true,
  onText: t => { title.value = t; },
  onCancel: () => { title.value = ''; },
  onFinal: t => {
    const m = t.match(/^(.*?)\s+(?:because|so that|since)\s+(.+)$/i);
    title.value = (m ? m[1] : t).trim();
    if (m) why.value = m[2].trim().replace(/^./, c => c.toUpperCase());
    add();
  },
  onError: m => toast(m, { kind: 'error', title: 'Microphone' }),
});

async function add() {
  const parsed = parseGoal(title.value);
  if (!parsed.title || parsed.title === 'New goal') return;
  busy.value = 'new';
  const tid = loading('Planning milestones…');
  const g = makeGoal({ title: parsed.title, by: by.value || parsed.by, why: why.value.trim() });
  const who = await planGoal(g);
  finish(tid, `${g.milestones.length} milestones for “${g.title}”, planned by ${who}, are in your Planner.`, { title: 'Goal planned' });
  title.value = ''; by.value = ''; why.value = ''; busy.value = ''; open.value = g.id;
}
async function replan(g) { busy.value = g.id; const n = g.milestones.length; await planGoal(g); busy.value = ''; toast(`${g.milestones.length - n} more milestones added.`, { kind: 'success' }); }
function addStep(g) { const v = step.value.trim(); if (!v) return; addMilestones(g, [v]); step.value = ''; }
const remove = g => { if (confirm(`Delete the goal “${g.title}”? Its milestone tasks that are not done are removed too.`)) removeGoal(g); };
</script>

<template>
  <section class="card cell span-8" id="goals" data-test="goals">
    <div class="cell-head"><div><p class="label">Goals</p><p class="lede-sm">What you are working towards</p></div><span class="muted small">{{ labelFor('plan') }}</span></div>
    <form class="gl-add" @submit.prevent="add">
      <span class="dict-wrap" :class="{ live: dict.listening.value }"><input v-model="title" placeholder="A goal, e.g. “Land a summer internship” or “Run a 10K by March”" aria-label="New goal" data-test="goal-title" maxlength="160" /><MicButton v-if="canDictate" :listening="dict.listening.value" label="Say a goal" @toggle="dict.toggle()" /></span>
      <DateField v-model="by" label="By when" placeholder="By when?" :min="new Date().toISOString().slice(0, 10)" />
      <button class="btn primary small" :disabled="!title.trim() || busy === 'new'" data-test="goal-add"><Icon :name="busy === 'new' ? 'refresh' : 'sparkle'" :size="14" />{{ busy === 'new' ? 'Planning…' : 'Plan it' }}</button>
    </form>
    <input v-if="title" v-model="why" class="gl-why" placeholder="Why it matters to you (optional, helps the AI)" aria-label="Why it matters" maxlength="200" />

    <ul v-if="list.length" class="gl-list">
      <li v-for="x in list" :key="x.g.id" class="gl-goal" :style="{ '--g': x.g.color }" data-test="goal">
        <button type="button" class="gl-top" :aria-expanded="open === x.g.id" @click="open = open === x.g.id ? null : x.g.id">
          <span class="gl-dot" />
          <span class="gl-name"><b>{{ x.g.title }}</b><span class="muted small">{{ x.p.done }} of {{ x.p.all }} steps{{ x.g.by ? ` · by ${dayLabel(x.g.by)}` : '' }}{{ x.p.daysLeft !== null && x.p.daysLeft >= 0 ? ` · ${x.p.daysLeft} days left` : '' }}</span></span>
          <span class="gl-pct">{{ x.p.pct }}%</span>
        </button>
        <span class="td-bar"><i :style="{ width: `${x.p.pct}%`, background: x.g.color }" /></span>
        <div v-if="open === x.g.id" class="gl-body">
          <p v-if="x.g.why" class="muted small">{{ x.g.why }}</p>
          <ul class="gl-steps">
            <li v-for="t in x.tasks" :key="t.id" :class="{ done: isDone(t) }">
              <label><input type="checkbox" :checked="isDone(t)" @change="toggleDone(t)" /> {{ t.title }}</label>
              <span class="muted small">{{ t.date ? dayLabel(t.date) : '' }}</span>
            </li>
          </ul>
          <form class="gl-step" @submit.prevent="addStep(x.g)"><input v-model="step" placeholder="Add a milestone, then press Enter" aria-label="Add a milestone" maxlength="120" /></form>
          <div class="tk-acts">
            <button type="button" class="btn small" :disabled="busy === x.g.id" title="Add more milestones with AI" @click="replan(x.g)"><Icon name="sparkle" :size="14" />{{ busy === x.g.id ? 'Planning…' : 'More milestones' }}</button>
            <button type="button" class="ibtn danger" title="Delete goal" :aria-label="`Delete ${x.g.title}`" @click="remove(x.g)"><Icon name="trash" /></button>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="empty-note">No goals yet. Write one above, or in the inbox: “I want to learn Spanish this year”. Budgie breaks it into milestones and puts them in your Planner.</p>
  </section>
</template>
