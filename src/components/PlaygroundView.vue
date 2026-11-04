<script setup>
import { colorFor } from '../lib/budgets';
import { ref, computed, watch, onMounted } from 'vue';
import { store } from '../lib/store';
import { organize, parseChunk, GROUPS, EXAMPLE } from '../lib/plan';
import { ai, aiAdvise, labelFor } from '../lib/ai';
import { monthTotals } from '../lib/ledger';
import { logoUrl } from '../lib/brands';
import { CATEGORIES } from '../lib/categorize';
import PickMenu from './PickMenu.vue';
import MicButton from './MicButton.vue';
import { useDictation, canDictate } from '../lib/dictation';

// Playground: write or say anything, Budgie organises it into a plan you can shape.
const plan = store.plan;
if (!plan.income) plan.income = Math.round(monthTotals.value.income) || 0;

const usd = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
let timer = null;

function runOrganize() {
  const kept = plan.items.filter(i => i.manual);
  const parsed = organize(plan.text);
  const income = parsed.filter(i => i.group === 'Income').reduce((s, i) => s + (i.monthly || 0), 0);
  if (income) plan.income = Math.round(income);
  plan.items = [...parsed.filter(i => i.group !== 'Income'), ...kept];
}
watch(() => plan.text, () => { if (!plan.auto) return; clearTimeout(timer); timer = setTimeout(runOrganize, 700); });
const useExample = () => { plan.text = EXAMPLE; runOrganize(); };

// Dictate into the scratchpad: words appear live and are kept on their own line.
let baseText = '';
const dict = useDictation({
  continuous: true,
  onCancel: () => { plan.text = baseText; },
  onText: t => { plan.text = `${baseText}${t}`; },
  onFinal: () => { plan.text = `${plan.text.trim()}\n`; runOrganize(); },
});
const toggleDictate = () => {
  if (!dict.listening.value) baseText = plan.text && !plan.text.endsWith('\n') ? `${plan.text}\n` : plan.text;
  dict.toggle();
};

const byGroup = computed(() => Object.fromEntries(GROUPS.filter(g => g !== 'Income').map(g => [g, plan.items.filter(i => i.group === g)])));
const totals = computed(() => {
  const t = { Needs: 0, Wants: 0, Savings: 0, Goals: 0 };
  plan.items.forEach(i => { if (t[i.group] !== undefined) t[i.group] += Number(i.monthly) || 0; });
  const spent = t.Needs + t.Wants + t.Savings + t.Goals;
  return { ...t, saving: t.Savings + t.Goals, all: spent, left: (Number(plan.income) || 0) - spent };
});
const pct = n => (plan.income ? Math.round((n / plan.income) * 100) : 0);

// Templates compare the plan against well-known splits.
const templates = [
  { id: '503020', name: '50 / 30 / 20', split: [50, 30, 20] },
  { id: '702010', name: '70 / 20 / 10', split: [70, 20, 10] },
  { id: '602020', name: '60 / 20 / 20', split: [60, 20, 20] },
];
const template = ref('503020');
const tpl = computed(() => templates.find(t => t.id === template.value));
// Lanes on the board, and the three buckets the splits compare (savings and goals count together).
const laneKeys = ['Needs', 'Wants', 'Savings', 'Goals'];
const groupKeys = ['Needs', 'Wants', 'Saving'];
const bucket = g => (g === 'Saving' ? totals.value.saving : totals.value[g]);

// What-if: trim wants and see what it frees.
const trim = ref(0);
const freed = computed(() => (totals.value.Wants * trim.value) / 100);
function applyTrim() {
  plan.items.filter(i => i.group === 'Wants' && i.monthly).forEach(i => { i.monthly = Math.round(i.monthly * (1 - trim.value / 100) * 100) / 100; });
  trim.value = 0;
}

// Goal calculator.
const goalName = ref('');
const goalTarget = ref('');
const goalMonths = ref(6);
const addGoal = () => {
  const target = Number(goalTarget.value);
  if (!goalName.value.trim() || !(target > 0)) return;
  plan.items.push({ id: Math.random().toString(36).slice(2, 9), label: goalName.value.trim(), amount: target, target, months: goalMonths.value, monthly: Math.round((target / goalMonths.value) * 100) / 100, cadence: 'monthly', group: 'Goals', category: 'Goal', manual: true, domain: '' });
  goalName.value = ''; goalTarget.value = '';
};

const addLine = ref('');
const quickAdd = () => { const i = parseChunk(addLine.value); if (i && i.group !== 'Income') { plan.items.push({ ...i, manual: true }); addLine.value = ''; } };
const remove = id => { plan.items = plan.items.filter(i => i.id !== id); };
const moveTo = (item, group) => { item.group = group; };
const catOptions = CATEGORIES.filter(c => c !== 'Income').concat('Savings', 'Goal').map(c => ({ value: c, label: c }));
const groupOptions = laneKeys.map(g => ({ value: g, label: g }));

// Suggestions as the plan changes.
const tips = computed(() => {
  const out = [];
  const t = totals.value;
  const inc = Number(plan.income) || 0;
  if (!plan.items.length) return [{ tone: 'info', text: 'Type or paste anything on the left: bills, ideas, goals. Budgie sorts it as you write.' }];
  if (!inc) out.push({ tone: 'warn', text: 'Add your monthly income so Budgie can check the split.' });
  if (inc && t.left < 0) out.push({ tone: 'warn', text: `The plan is ${usd(-t.left)} over income. Trim wants by ${Math.min(100, Math.ceil((-t.left / Math.max(1, t.Wants)) * 100))}% to balance it.` });
  if (inc && t.left > 0) out.push({ tone: 'good', text: `${usd(t.left)} is unassigned. Give it a job, such as extra savings.`, action: { label: 'Send to savings', run: () => plan.items.push({ id: Math.random().toString(36).slice(2, 9), label: 'Extra savings', monthly: Math.round(t.left), amount: Math.round(t.left), cadence: 'monthly', group: 'Savings', category: 'Savings', manual: true, domain: '' }) } });
  if (inc) groupKeys.forEach((g, i) => { const want = tpl.value.split[i]; const have = pct(bucket(g)); const name = g === 'Saving' ? 'Savings and goals' : g; if (Math.abs(have - want) >= 8) out.push({ tone: have > want && g !== 'Saving' ? 'warn' : 'info', text: `${name} take ${have}% of income; ${tpl.value.name} suggests about ${want}%.` }); });
  const biggestWant = [...byGroup.value.Wants].sort((a, b) => (b.monthly || 0) - (a.monthly || 0))[0];
  if (biggestWant && biggestWant.monthly > 0) out.push({ tone: 'info', text: `Biggest want: ${biggestWant.label} at ${usd(biggestWant.monthly)} a month.` });
  plan.items.filter(i => i.monthly === null).forEach(i => out.push({ tone: 'warn', text: `Add an amount for “${i.label}”.` }));
  plan.items.filter(i => i.target && i.months).forEach(i => out.push({ tone: 'info', text: `${i.label}: ${usd(i.monthly)} a month reaches ${usd(i.target)} in ${i.months} months.` }));
  return out;
});

const aiNote = ref('');
let aiKey = '';
watch(tips, async v => {
  const facts = v.map(t => t.text);
  const k = facts.join('|');
  if (k === aiKey || !ai.ready) return;
  aiKey = k;
  aiNote.value = (await aiAdvise([`Monthly income ${usd(plan.income)}.`, ...facts])) || '';
}, { immediate: true });

// Make the plan real: write category totals into the monthly budgets.
const applied = ref('');
function applyPlan() {
  const sums = {};
  plan.items.filter(i => !['Savings', 'Goals'].includes(i.group) && i.monthly).forEach(i => { sums[i.category] = (sums[i.category] || 0) + Number(i.monthly); });
  Object.entries(sums).forEach(([name, v], n) => {
    const amount = Math.ceil(v / 10) * 10;
    const b = store.budgets.find(x => x.name === name);
    if (b) Object.assign(b, { budget: amount, edited: true }); else store.budgets.push({ name, budget: amount, color: colorFor(name, n), edited: true });
  });
  store.budgetMeta = { source: 'plan', by: 'your plan', at: new Date().toISOString() };
  applied.value = `Budgets updated for ${Object.keys(sums).length} categories.`;
}
onMounted(() => { if (plan.text && !plan.items.length) runOrganize(); });
</script>

<template>
  <section class="card cell span-8 scratch">
    <div class="cell-head">
      <div><p class="label">Playground</p><p class="lede-sm">Write it messy. Budgie sorts it.</p></div>
      <div class="chips">
        <button class="chip-btn" :class="{ on: plan.auto }" @click="plan.auto = !plan.auto">Auto-sort {{ plan.auto ? 'on' : 'off' }}</button>
        <button class="btn small" @click="useExample">Try an example</button>
        <button class="btn primary small" data-test="organize" @click="runOrganize">Organize</button>
      </div>
    </div>
    <div class="scratch-wrap" :class="{ live: dict.listening.value }">
      <textarea v-model="plan.text" class="scratch-pad" data-test="scratch" spellcheck="false"
        placeholder="salary 4700&#10;rent 1450, groceries maybe 400&#10;netflix 15.49, github 4&#10;save 3000 for japan by june" />
      <div v-if="canDictate" class="scratch-mic" :class="{ live: dict.listening.value }">
        <template v-if="dict.listening.value">
          <i class="rec-dot" aria-hidden="true" />
          <b class="rec-time">{{ Math.floor(dict.elapsed.value / 60) }}:{{ String(dict.elapsed.value % 60).padStart(2, '0') }}</b>
          <span class="say-wave" aria-hidden="true"><i v-for="n in 8" :key="n" :style="{ animationDelay: `${(n * 97) % 900}ms` }" /></span>
          <span class="rec-hint">One item at a time, then pause</span>
          <button type="button" class="say-cancel" @click="dict.cancel()">Cancel</button>
        </template>
        <MicButton :listening="dict.listening.value" label="Dictate your plan" @toggle="toggleDictate" />
      </div>
    </div>

    <div class="board">
      <div v-for="(items, g) in byGroup" :key="g" class="lane" :data-group="g">
        <div class="lane-head"><b>{{ g }}</b><span>{{ usd(totals[g]) }}<template v-if="plan.income"> · {{ pct(totals[g]) }}%</template></span></div>
        <article v-for="i in items" :key="i.id" class="plan-item">
          <img v-if="i.domain" :src="logoUrl(i.domain)" :alt="`${i.label} logo`" width="20" height="20" />
          <span v-else class="pi-dot" />
          <div class="pi-main">
            <b>{{ i.label }}</b>
            <span class="muted small">{{ i.category }}<template v-if="i.cadence !== 'monthly'"> · {{ i.cadence }} {{ usd(i.amount) }}</template><template v-if="i.months"> · {{ i.months }} mo</template></span>
          </div>
          <input class="pi-amt" type="number" step="1" :value="i.monthly ?? ''" placeholder="—" :aria-label="`Monthly amount for ${i.label}`" @input="e => (i.monthly = e.target.value === '' ? null : Number(e.target.value))" />
          <div class="pi-tools">
            <PickMenu :model-value="i.group" :options="groupOptions" label="Move" @update:model-value="g2 => moveTo(i, g2)" />
            <PickMenu v-model="i.category" :options="catOptions" label="Category" searchable />
            <button class="icon-x" :aria-label="`Remove ${i.label}`" @click="remove(i.id)">×</button>
          </div>
        </article>
        <p v-if="!items.length" class="lane-empty">Nothing here yet</p>
      </div>
    </div>
    <form class="note" @submit.prevent="quickAdd">
      <input v-model="addLine" class="field note-field" placeholder="Add one more: gym 40 a month" />
      <button class="btn" type="submit">Add</button>
    </form>
  </section>

  <section class="card cell span-4 tools-cell">
    <div class="cell-head"><p class="label">Tools</p><span class="muted small">Saved as you go</span></div>

    <label class="tool-row"><span>Monthly income</span><input v-model.number="plan.income" class="field income-field" type="number" min="0" step="50" data-test="plan-income" /></label>
    <div class="plan-total">
      <div><span class="muted small">Planned</span><b>{{ usd(totals.all) }}</b></div>
      <div><span class="muted small">{{ totals.left >= 0 ? 'Unassigned' : 'Over by' }}</span><b :class="totals.left >= 0 ? 'in' : 'out'">{{ usd(Math.abs(totals.left)) }}</b></div>
    </div>

    <p class="kicker">Compare with a split</p>
    <div class="chips"><button v-for="t in templates" :key="t.id" class="chip-btn" :class="{ on: template === t.id }" @click="template = t.id">{{ t.name }}</button></div>
    <div class="split-bars">
      <div v-for="(g, i) in groupKeys" :key="g" class="split-row">
        <span class="small">{{ g === 'Saving' ? 'Savings + goals' : g }}</span>
        <div class="split-track"><i class="have" :style="{ width: Math.min(100, pct(bucket(g))) + '%' }" /><i class="want" :style="{ left: tpl.split[i] + '%' }" /></div>
        <span class="small">{{ pct(bucket(g)) }}% / {{ tpl.split[i] }}%</span>
      </div>
    </div>

    <p class="kicker">What if I trim wants?</p>
    <input v-model.number="trim" type="range" min="0" max="50" step="5" class="slider" aria-label="Trim wants by percent" />
    <div class="row-line"><span class="small">Trim {{ trim }}% → frees {{ usd(freed) }} a month</span><button class="btn small" :disabled="!trim" @click="applyTrim">Apply</button></div>

    <p class="kicker">Goal calculator</p>
    <div class="goal-calc">
      <input v-model="goalName" class="field" placeholder="Goal, e.g. New laptop" />
      <input v-model="goalTarget" class="field" type="number" min="0" placeholder="Target $" />
      <div class="chips"><button v-for="m in [3, 6, 12, 24]" :key="m" class="chip-btn" :class="{ on: goalMonths === m }" @click="goalMonths = m">{{ m }} mo</button></div>
      <div class="row-line"><span class="small">{{ goalTarget ? `${usd(goalTarget / goalMonths)} a month` : 'Pick a target' }}</span><button class="btn small" @click="addGoal">Add goal</button></div>
    </div>

    <button class="btn primary apply-btn" data-test="apply-plan" :disabled="!plan.items.length" @click="applyPlan">Use this plan for my budgets</button>
    <p v-if="applied" class="status-line done">{{ applied }}</p>
  </section>

  <section class="card cell span-12 tips-cell">
    <div class="cell-head"><p class="label">Suggestions while you plan</p><span class="muted small">{{ labelFor('advice') }}</span></div>
    <p v-if="aiNote" class="think">{{ aiNote }}</p>
    <div class="tip-row">
      <article v-for="(t, n) in tips" :key="n" class="insight" :class="t.tone">
        <p>{{ t.text }}</p>
        <div v-if="t.action" class="insight-acts"><button class="btn primary small" @click="t.action.run()">{{ t.action.label }}</button></div>
      </article>
    </div>
  </section>
</template>
