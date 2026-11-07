<script setup>
import { reactive, computed } from 'vue';
import { store } from '../lib/store';
import { blankProfile, LOOKING, generateNow, digests } from '../lib/digest';
import Icon from './Icon.vue';

// What the digest looks for. Saved in your account only, never in Budgie's code.
const emit = defineEmits(['saved', 'cancel']);
const had = Boolean(store.digest.profile);
const src = store.digest.profile || blankProfile();
const join = v => (Array.isArray(v) ? v.join(', ') : v || '');
const f = reactive({ ...blankProfile(), ...src, interests: join(src.interests), companies: join(src.companies), feeds: (src.feeds || []).join('\n'), exclude: join(src.exclude), lookingFor: [...(src.lookingFor || [])] });
const opts = reactive({ autoTasks: store.digest.autoTasks !== false, geminiKey: store.digest.geminiKey || '' });
const split = s => String(s || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
const toggle = l => { f.lookingFor = f.lookingFor.includes(l) ? f.lookingFor.filter(x => x !== l) : [...f.lookingFor, l]; };
const ok = computed(() => split(f.interests).length || split(f.companies).length || split(f.feeds).length);
async function save() {
  store.digest.profile = { ...f, interests: split(f.interests).slice(0, 12), companies: split(f.companies).slice(0, 8), feeds: split(f.feeds).filter(x => /^(https|webcal):\/\//i.test(x)).slice(0, 6), exclude: split(f.exclude).slice(0, 10) };
  store.digest.autoTasks = opts.autoTasks;
  store.digest.geminiKey = opts.geminiKey.trim() || undefined;
  store.digest.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  emit('saved');
  if (!digests.list.length) await generateNow();
}
</script>

<template>
  <form class="dgp" id="digest-profile" data-test="digest-profile" @submit.prevent="save">
    <div class="dgp-head">
      <p class="label">Digest profile</p>
      <h2>{{ had ? 'What your digest looks for' : 'Set up your digest' }}</h2>
      <p class="muted">Every Monday and Thursday Budgie reads free sources (news, company careers pages and feeds you add) and writes you a short brief: opportunities that fit, deadlines, and draft emails. This stays in your account.</p>
    </div>
    <div class="dgp-grid">
      <label class="tk-f"><span>Your name</span><input v-model="f.name" maxlength="60" autocomplete="name" placeholder="Used to sign drafts" /></label>
      <label class="tk-f"><span>School or work</span><input v-model="f.school" maxlength="80" placeholder="e.g. State University" /></label>
      <label class="tk-f"><span>What you study or do</span><input v-model="f.study" maxlength="80" placeholder="e.g. Electrical Engineering" /></label>
      <label class="tk-f"><span>Year or stage</span><input v-model="f.year" maxlength="40" placeholder="e.g. first-year" /></label>
      <label class="tk-f"><span>Where</span><input v-model="f.location" maxlength="60" placeholder="e.g. Boston" /></label>
      <label class="tk-f wide"><span>Interests (comma separated)</span><input v-model="f.interests" maxlength="400" placeholder="robotics, embedded systems, renewable energy" data-test="dgp-interests" /></label>
      <div class="tk-f wide"><span>Looking for</span>
        <div class="dgp-chips"><button v-for="l in LOOKING" :key="l" type="button" class="chip-btn" :class="{ on: f.lookingFor.includes(l) }" :aria-pressed="f.lookingFor.includes(l)" @click="toggle(l)">{{ l }}</button></div>
      </div>
      <label class="tk-f wide"><span>Companies to watch for student roles (comma separated)</span><input v-model="f.companies" maxlength="400" placeholder="e.g. Figma, Notion, Stripe" /></label>
      <label class="tk-f wide"><span>About you, one or two sentences for drafts (optional)</span><textarea v-model="f.about" rows="2" maxlength="400" placeholder="I build low-cost robots with a student club." /></label>
      <label class="tk-f wide"><span>Extra feeds, one link per line (optional)</span><textarea v-model="f.feeds" rows="2" placeholder="https://www.example.edu/news/feed" /></label>
      <label class="tk-f"><span>A topic to watch closely (optional)</span><input v-model="f.watch" maxlength="80" placeholder="e.g. student visa rules" /></label>
      <label class="tk-f"><span>Note under it (optional)</span><input v-model="f.watchNote" maxlength="140" placeholder="e.g. Not legal advice." /></label>
      <label class="tk-f wide"><span>Leave out anything mentioning (optional)</span><input v-model="f.exclude" maxlength="300" placeholder="e.g. US citizens only, clearance" /></label>
      <label class="dgp-check wide"><input v-model="f.auto" type="checkbox" /> New edition every Monday and Thursday</label>
      <label class="dgp-check wide"><input v-model="opts.autoTasks" type="checkbox" /> Add deadlines in the next two weeks to my Planner</label>
      <details class="wide dgp-more">
        <summary>Research deeper with your own free Gemini key (optional)</summary>
        <p class="muted small">Get a free key at aistudio.google.com/apikey. It is saved in your Budgie account and sent only to Google when you press Research deeper. Google's free tier has daily limits.</p>
        <label class="tk-f"><span>Gemini API key</span><input v-model="opts.geminiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Optional" /></label>
      </details>
    </div>
    <div class="tk-acts">
      <button v-if="had" type="button" class="btn small" @click="emit('cancel')"><Icon name="x" :size="14" />Cancel</button>
      <button class="btn primary" :disabled="!ok" data-test="dgp-save"><Icon name="check" :size="14" />{{ had ? 'Save' : 'Save and write my first digest' }}</button>
    </div>
  </form>
</template>
