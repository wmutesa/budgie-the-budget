<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import BrandPicker from './BrandPicker.vue';
import { store, newId } from '../lib/store';

const props = defineProps({ seed: { type: String, default: '' } });
const emit = defineEmits(['close']);

const picked = ref(null);
const inMonth = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const form = reactive({ amount: '', currency: store.base, cycle: 'monthly', next: inMonth });
const currencies = ['USD', 'RWF', 'EUR', 'GBP', 'THB', 'KES'];
const cycles = [['monthly', 'Monthly'], ['yearly', 'Yearly'], ['weekly', 'Weekly']];

function save() {
  const amount = Number(form.amount);
  if (!picked.value || !(amount > 0)) return;
  store.subscriptions.push({
    id: newId(),
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
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-label="Add a subscription">
      <div class="cell-head"><p class="label">Add a subscription</p><button class="icon-x" aria-label="Close" @click="emit('close')">×</button></div>

      <BrandPicker v-if="!picked" :seed="props.seed" @pick="p => (picked = p)" />

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
