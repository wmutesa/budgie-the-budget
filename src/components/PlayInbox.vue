<script setup>
import { ref, computed, watch } from 'vue';
import { DESTS, routeAll, preview, canSend, sendAll } from '../lib/router';
import { go } from '../lib/nav';
import { useDictation, canDictate } from '../lib/dictation';
import MicButton from './MicButton.vue';
import Icon from './Icon.vue';

// Write or say anything, one thing per line. Budgie sends each line where it
// belongs: the Planner, Transactions, your money plan, or more than one.
const text = ref('');
const rows = ref([]);
const done = ref(null);
let timer = null;
watch(text, v => { clearTimeout(timer); timer = setTimeout(() => { rows.value = routeAll(v); }, 250); });
const toggle = (r, d) => { r.dest = r.dest.includes(d) ? r.dest.filter(x => x !== d) : [...r.dest, d]; };
const ready = computed(() => rows.value.filter(r => r.dest.some(d => canSend(r, d))));
async function send() {
  const n = await sendAll(ready.value);
  done.value = n;
  text.value = ''; rows.value = [];
  setTimeout(() => { done.value = null; }, 6000);
}
let base = '';
const dict = useDictation({
  continuous: true,
  onCancel: () => { text.value = base; },
  onText: t => { text.value = `${base}${t}`; },
  onFinal: () => { text.value = `${text.value.trim()}\n`; },
});
const talk = () => { if (!dict.listening.value) base = text.value && !text.value.endsWith('\n') ? `${text.value}\n` : text.value; dict.toggle(); };
const EXAMPLE = 'Essay due Fri 5pm #English\nspent 12.50 on lunch at Chipotle yesterday\ngym MWF 6pm\npay phone bill $45 on the 15th\nsalary 4000 a month\nbought textbooks $80 today, then start reading chapter 1 tomorrow';
</script>

<template>
  <section class="card cell span-12 inbox" id="inbox" data-test="inbox">
    <div class="inbox-head">
      <div>
        <p class="label">Add anything</p>
        <h2 class="inbox-title">Write or say it. Budgie sends it where it belongs.</h2>
      </div>
      <div class="inbox-legend" aria-hidden="true">
        <span v-for="(d, id) in DESTS" :key="id" :class="`to-${id}`"><Icon :name="d.icon" :size="13" />{{ d.label }}</span>
      </div>
    </div>
    <div class="inbox-pad" :class="{ live: dict.listening.value }">
      <textarea v-model="text" rows="3" placeholder="One thing per line: “Essay due Fri 5pm”, “spent 12 on lunch”, “salary 4000 a month”, “pay rent on the 1st $1450”" aria-label="Add anything" data-test="inbox-text" />
      <div class="inbox-tools">
        <button v-if="!text" type="button" class="ibtn ghost" title="Try an example" @click="text = EXAMPLE"><Icon name="sparkle" :size="14" />Example</button>
        <MicButton v-if="canDictate" :listening="dict.listening.value" label="Say it" @toggle="talk" />
      </div>
    </div>
    <ul v-if="rows.length" class="inbox-rows" data-test="inbox-rows">
      <li v-for="r in rows" :key="r.id" class="inbox-row">
        <div class="inbox-line"><b>{{ r.text }}</b><span class="muted small">{{ r.why }}</span></div>
        <div class="inbox-dests" role="group" :aria-label="`Where to send: ${r.text}`">
          <button v-for="(d, id) in DESTS" :key="id" type="button" class="inbox-dest" :class="[`to-${id}`, { on: r.dest.includes(id), off: !canSend(r, id) }]" :aria-pressed="r.dest.includes(id)" :disabled="!canSend(r, id)" :title="canSend(r, id) ? preview(r, id) : `${d.label}: no amount in this line`" :data-test="`dest-${id}`" @click="toggle(r, id)">
            <Icon :name="d.icon" :size="13" /><span>{{ d.label }}</span>
          </button>
        </div>
        <p class="inbox-preview small">
          <template v-for="d in r.dest" :key="d"><span :class="`to-${d}`"><Icon :name="DESTS[d].icon" :size="12" />{{ preview(r, d) }}</span></template>
        </p>
      </li>
    </ul>
    <div class="inbox-foot">
      <p v-if="done" class="pln-ok small" role="status" data-test="inbox-done">
        Sent: {{ done.planner }} to the Planner, {{ done.money }} to Transactions, {{ done.plan }} to your money plan.
        <button v-if="done.planner" type="button" class="link-btn" @click="go('Planner')">Open Planner</button>
        <button v-if="done.money" type="button" class="link-btn" @click="go('Transactions', { anchor: '#review' })">Check entries</button>
      </p>
      <p v-else class="muted small">Things to do go to the Planner, money already spent goes to Transactions, amounts that repeat go to your plan below. Tap a destination to change it.</p>
      <button type="button" class="ibtn primary" :disabled="!ready.length" data-test="inbox-send" @click="send"><Icon name="right" :size="15" />Send {{ ready.length || '' }}</button>
    </div>
  </section>
</template>
