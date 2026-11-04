<script setup>
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue';
import { searchBrands } from '../lib/brands';
import { store } from '../lib/store';

const props = defineProps({ seed: { type: String, default: '' } });
const emit = defineEmits(['close']);

const q = ref(props.seed);
const results = ref([]);
const loading = ref(false);
const error = ref('');
const picked = ref(null);
const input = ref(null);
const inMonth = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const form = reactive({ amount: '', currency: store.base, cycle: 'monthly', next: inMonth });
const currencies = ['USD', 'EUR', 'GBP', 'KES', 'NGN'];
const cycles = [['monthly', 'Monthly'], ['yearly', 'Yearly'], ['weekly', 'Weekly']];

let timer = null;
let ctl = null;
async function run() {
  if (ctl) ctl.abort();
  ctl = new AbortController();
  if (q.value.trim().length < 2) { results.value = []; return; }
  loading.value = true;
  error.value = '';
  try {
    results.value = await searchBrands(q.value, { signal: ctl.signal });
  } catch (e) {
    if (e.name !== 'AbortError') error.value = 'Could not reach the web search. You can still add it by name.';
  } finally {
    loading.value = false;
  }
}
watch(q, () => { clearTimeout(timer); timer = setTimeout(run, 350); });

function pickManual() {
  picked.value = { name: q.value.trim(), domain: '', logo: null, description: 'Added manually', website: null };
}
function save() {
  const amount = Number(form.amount);
  if (!picked.value || !(amount > 0)) return;
  store.subscriptions.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: picked.value.name,
    domain: picked.value.domain,
    logo: picked.value.logo,
    website: picked.value.website,
    description: picked.value.description,
    amount,
    currency: form.currency,
    cycle: form.cycle,
    next: form.next,
  });
  emit('close');
}
const onKey = e => { if (e.key === 'Escape') emit('close'); };
onMounted(() => { document.addEventListener('keydown', onKey); input.value?.focus(); if (q.value) run(); });
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-label="Add a subscription">
      <div class="cell-head"><p class="label">Add a subscription</p><button class="icon-x" aria-label="Close" @click="emit('close')">×</button></div>

      <template v-if="!picked">
        <input ref="input" v-model="q" class="field big-field" data-test="brand-search" placeholder="Search a service, e.g. Netflix" />
        <p v-if="loading" class="muted small">Searching the web…</p>
        <p v-else-if="error" class="muted small">{{ error }}</p>
        <ul class="results">
          <li v-for="r in results" :key="r.id">
            <button class="result" data-test="brand-result" @click="picked = r">
              <img :src="r.logo" :alt="`${r.name} logo`" width="28" height="28" />
              <span class="grow"><b>{{ r.name }}</b><span class="muted small">{{ r.description || r.domain }}</span></span>
              <span class="muted small">{{ r.domain }}</span>
            </button>
          </li>
        </ul>
        <button v-if="q.trim().length > 1 && !loading" class="btn small" @click="pickManual">Add “{{ q.trim() }}” without web details</button>
        <p class="meta small">Results come from Wikidata. Logos come from each service’s own website.</p>
      </template>

      <template v-else>
        <div class="picked">
          <img v-if="picked.logo" :src="picked.logo" :alt="`${picked.name} logo`" width="36" height="36" />
          <div><b>{{ picked.name }}</b><p class="muted small">{{ picked.description }}<template v-if="picked.domain"> · {{ picked.domain }}</template></p></div>
        </div>
        <label class="form-row"><span>What you pay</span><input v-model="form.amount" class="field" data-test="sub-amount" type="number" min="0" step="0.01" placeholder="15.49" /></label>
        <div class="form-row"><span>Currency</span><div class="chips"><button v-for="c in currencies" :key="c" class="chip-btn" :class="{ on: form.currency === c }" @click="form.currency = c">{{ c }}</button></div></div>
        <div class="form-row"><span>Billing</span><div class="chips"><button v-for="[v, l] in cycles" :key="v" class="chip-btn" :class="{ on: form.cycle === v }" @click="form.cycle = v">{{ l }}</button></div></div>
        <label class="form-row"><span>Next payment</span><input v-model="form.next" class="field" type="date" /></label>
        <div class="sheet-foot">
          <button class="btn" @click="picked = null">Back</button>
          <button class="btn primary" data-test="save-sub" :disabled="!(Number(form.amount) > 0)" @click="save">Track {{ picked.name }}</button>
        </div>
      </template>
    </div>
  </div>
</template>
