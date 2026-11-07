<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { buildRoutine, saveRoutine, timeLabel, DAY_SHORT } from '../lib/tasks';
import { ai, aiRefineRoutine, labelFor } from '../lib/ai';
import Icon from './Icon.vue';
import DateField from './DateField.vue';
import TimeField from './TimeField.vue';

// A daily routine built for you: wake and sleep times plus a few words about
// your week. Rules draft it instantly; the on-device AI then adjusts it.
const r = store.routine;
const draft = ref(null);
const busy = ref(false);
const by = ref('');
const has = computed(() => store.tasks.filter(t => t.source === 'routine').length);
const days = rep => (!rep || rep.every === 'day' ? 'Daily' : rep.every === 'weekdays' ? 'Weekdays' : rep.every === 'month' ? 'Monthly' : rep.days.map(d => DAY_SHORT[d]).join(' '));

async function build() {
  busy.value = true;
  const rules = buildRoutine(r);
  draft.value = rules.map(i => ({ ...i, keep: true }));
  by.value = 'Built-in rules';
  if (ai.enabled && ai.ready) {
    const better = await aiRefineRoutine(rules, r).catch(() => null);
    if (better) { draft.value = better.map(i => ({ ...i, keep: true })); by.value = ai.used.plan; }
  }
  busy.value = false;
}
function save() {
  saveRoutine(draft.value.filter(i => i.keep).map(({ keep, ...i }) => i));
  r.builtAt = new Date().toISOString();
  draft.value = null;
}
</script>

<template>
  <section class="pln-card card cell" id="routine" data-test="routine">
    <div class="pln-card-head"><h3>Routine</h3><span class="muted small">{{ has ? `${has} daily habits` : labelFor('plan') }}</span></div>
    <div class="pln-routine-in">
      <div class="tk-f"><span>Wake up</span><TimeField v-model="r.wake" label="Wake up" :clearable="false" /></div>
      <div class="tk-f"><span>Sleep</span><TimeField v-model="r.sleep" label="Sleep" :clearable="false" /></div>
      <label class="tk-f wide"><span>About your week</span>
        <textarea v-model="r.text" rows="2" maxlength="600" placeholder="Classes MWF 10-12, gym 3x a week at 6pm, call friends Sundays, work Sat 9-5" data-test="routine-text" />
      </label>
    </div>
    <button type="button" class="ibtn ai wide-btn" :disabled="busy" data-test="routine-build" @click="build"><Icon name="sparkle" :size="14" />{{ busy ? 'Building…' : has ? 'Rebuild my routine' : 'Build my routine' }}</button>
    <div v-if="draft" class="pln-draft" data-test="routine-draft">
      <p class="muted small">Drafted by {{ by }}. Untick anything you do not want, then save.</p>
      <ul>
        <li v-for="(i, n) in draft" :key="n"><label><input v-model="i.keep" type="checkbox" /><b>{{ i.time ? timeLabel(i.time) : 'Any time' }}</b> {{ i.title }} <span class="muted small">{{ days(i.repeat) }}</span></label></li>
      </ul>
      <div class="tk-acts"><button type="button" class="ibtn ghost" title="Cancel" aria-label="Cancel" @click="draft = null"><Icon name="x" /></button><button type="button" class="ibtn primary" data-test="routine-save" @click="save"><Icon name="check" />Save to planner</button></div>
    </div>
  </section>
</template>
