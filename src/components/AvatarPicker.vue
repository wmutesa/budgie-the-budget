<script setup>
import { ref } from 'vue';
import { store } from '../lib/store';
import { SWATCHES, avatar, inkFor, randomColor } from '../lib/profile';
import Icon from './Icon.vue';

// Your avatar with a colour picker: curated swatches, shuffle, or any colour.
defineProps({ initial: { type: String, default: '?' }, name: { type: String, default: '' } });
const open = ref(false);
const set = c => { store.profile = { ...(store.profile || {}), color: c.toLowerCase() }; };
</script>

<template>
  <div class="avp">
    <button type="button" class="avp-face" :style="{ background: avatar.bg, color: avatar.ink }" :aria-expanded="open" title="Change your colour" aria-label="Change your avatar colour" data-test="avatar" @click="open = !open">
      {{ initial }}<span class="avp-badge"><Icon name="palette" :size="11" /></span>
    </button>
    <div v-if="open" class="avp-pop" role="dialog" aria-label="Avatar colour" data-test="avatar-pop">
      <div class="avp-preview">
        <span class="avp-big" :style="{ background: avatar.bg, color: avatar.ink }">{{ initial }}</span>
        <div><b>{{ name || 'You' }}</b><span class="muted small">{{ avatar.bg.toUpperCase() }}</span></div>
      </div>
      <div class="avp-grid" role="radiogroup" aria-label="Colours">
        <button v-for="c in SWATCHES" :key="c" type="button" role="radio" class="avp-sw" :class="{ on: avatar.bg === c }" :aria-checked="avatar.bg === c" :aria-label="c" :style="{ background: c, color: inkFor(c) }" data-test="avatar-swatch" @click="set(c)">
          <Icon v-if="avatar.bg === c" name="check" :size="14" />
        </button>
      </div>
      <div class="avp-row">
        <label class="avp-custom" title="Pick any colour">
          <input type="color" :value="avatar.bg" aria-label="Any colour" @input="set($event.target.value)" />
          <span class="avp-custom-dot" :style="{ background: avatar.bg }" /><span>Custom</span>
        </label>
        <button type="button" class="ibtn ghost" title="Surprise me" aria-label="Random colour" @click="set(randomColor())"><Icon name="refresh" /></button>
        <button type="button" class="ibtn primary" title="Done" aria-label="Done" @click="open = false"><Icon name="check" /></button>
      </div>
    </div>
  </div>
</template>
