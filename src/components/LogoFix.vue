<script setup>
import { ref } from 'vue';
import BrandPicker from './BrandPicker.vue';
import { logoUrl } from '../lib/brands';

// Click a logo to correct it: search the company, or type its website.
const props = defineProps({ name: { type: String, required: true }, logo: { type: String, default: '' }, size: { type: Number, default: 26 } });
const emit = defineEmits(['pick']);
const open = ref(false);
const site = ref('');
const broken = ref(false);
// The app-wide handler tries a second source after Google; only give up when that fails too.
const onError = e => { if (!String(e.target.src).includes('google.com/s2/favicons')) broken.value = true; };

function useSite() {
  const d = site.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return;
  emit('pick', { domain: d, logo: logoUrl(d), name: null });
  open.value = false;
  site.value = '';
  broken.value = false;
}
function pick(b) {
  emit('pick', { domain: b.domain, logo: b.logo, name: b.name });
  open.value = false;
  broken.value = false;
}
</script>

<template>
  <span class="logo-fix">
    <button type="button" class="logo-btn" :style="{ width: size + 'px', height: size + 'px' }" :title="`Fix the logo for ${name}`" :aria-label="`Fix the logo for ${name}`" @click="open = true">
      <img v-if="logo && !broken" :src="logo" :alt="`${name} logo`" :width="size" :height="size" @error="onError" />
      <span v-else class="logo-fallback">{{ name[0] }}</span>
      <span class="logo-edit" aria-hidden="true">✎</span>
    </button>
    <div v-if="open" class="overlay" @click.self="open = false">
      <div class="sheet" role="dialog" :aria-label="`Fix the logo for ${name}`">
        <div class="cell-head"><p class="label">Fix the logo for {{ name }}</p><button class="icon-x" aria-label="Close" @click="open = false">×</button></div>
        <BrandPicker :seed="name" :allow-manual="false" @pick="pick" />
        <form class="site-row" @submit.prevent="useSite">
          <input v-model="site" class="field" placeholder="Or type its website, for example netflix.com" aria-label="Company website" />
          <button class="btn primary small" type="submit">Use this site</button>
        </form>
      </div>
    </div>
  </span>
</template>
