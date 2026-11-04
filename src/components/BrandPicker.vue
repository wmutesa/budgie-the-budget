<script setup>
import { ref, watch, onMounted } from 'vue';
import { searchBrands, logoUrl } from '../lib/brands';
import { searchDirectory } from '../data/directory';

// Search a company or service on the web and pick it. Shared by subscriptions and transactions.
const props = defineProps({ seed: { type: String, default: '' }, allowManual: { type: Boolean, default: true } });
const emit = defineEmits(['pick']);

const q = ref(props.seed);
const results = ref([]);
const loading = ref(false);
const error = ref('');
const input = ref(null);
let timer = null;
let ctl = null;

async function run() {
  if (ctl) ctl.abort();
  ctl = new AbortController();
  if (q.value.trim().length < 2) { results.value = []; return; }
  const local = searchDirectory(q.value).map(e => ({ id: `dir:${e.domain}:${e.name}`, name: e.name, description: e.category, domain: e.domain, logo: e.domain ? logoUrl(e.domain) : null, website: e.domain ? `https://${e.domain}` : null, local: true }));
  results.value = local;
  loading.value = true;
  error.value = '';
  try {
    const web = await searchBrands(q.value, { signal: ctl.signal });
    const seen = new Set(local.map(r => r.domain).filter(Boolean));
    results.value = [...local, ...web.filter(r => !seen.has(r.domain))];
  }
  catch (e) { if (e.name !== 'AbortError') error.value = 'Could not reach the web search.'; }
  finally { loading.value = false; }
}
watch(q, () => { clearTimeout(timer); timer = setTimeout(run, 200); });
onMounted(() => { input.value?.focus(); if (q.value) run(); });
const manual = () => emit('pick', { name: q.value.trim(), domain: '', logo: null, description: 'Added manually', website: null });
</script>

<template>
  <div class="picker">
    <input ref="input" v-model="q" class="field big-field" data-test="brand-search" placeholder="Search a company or service" />
    <p v-if="loading" class="muted small">Searching the web…</p>
    <p v-else-if="error" class="muted small">{{ error }}</p>
    <ul class="results">
      <li v-for="r in results" :key="r.id">
        <button class="result" data-test="brand-result" @click="emit('pick', r)">
          <img v-if="r.logo" :src="r.logo" :alt="`${r.name} logo`" width="28" height="28" />
          <span v-else class="logo-fallback">{{ r.name[0] }}</span>
          <span class="grow"><b>{{ r.name }}</b><span class="muted small">{{ r.description || r.domain }}</span></span>
          <span class="muted small">{{ r.local ? `${r.domain || 'local place'} · known` : r.domain }}</span>
        </button>
      </li>
    </ul>
    <button v-if="allowManual && q.trim().length > 1 && !loading" class="btn small" @click="manual">Use “{{ q.trim() }}” without web details</button>
    <p class="meta small">Known companies appear instantly; more come from Wikidata. Logos come from each site’s own icon.</p>
  </div>
</template>
