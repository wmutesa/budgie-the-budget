<script setup>
import { ref, computed, onMounted } from 'vue';
import { store } from '../lib/store';
import { digests, loadDigests, openEdition, generateNow, profileReady, researchDeeper } from '../lib/digest';
import { occurrences, today, addDays, makeTask, KINDS } from '../lib/tasks';
import { ai } from '../lib/ai';
import DigestProfile from './DigestProfile.vue';
import Icon from './Icon.vue';

// The digest: a short newspaper of opportunities and news, written for you on
// Mondays and Thursdays (and whenever you press Generate now).
onMounted(loadDigests);
const ed = computed(() => digests.current);
const lead = computed(() => (ed.value?.lead ? { ...ed.value.lead, ...(digests.polished[ed.value.id] || {}) } : null));
const ready = computed(() => profileReady(store.digest.profile));
const editing = ref(false);
const opened = ref(null);
const copied = ref('');
const chip = iso => { const d = new Date(`${iso}T12:00:00`); return { mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), day: d.getDate(), wd: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() }; };
// The calendar box: the digest's deadlines plus your own Planner deadlines.
const calendar = computed(() => {
  const mine = occurrences(today(), addDays(today(), 13)).filter(x => ['assignment', 'exam', 'event'].includes(x.task.kind) && !x.done && x.task.source !== 'digest')
    .map(x => ({ date: x.date, name: x.task.title, desc: `${KINDS[x.task.kind].label}${x.task.project ? ` · ${x.task.project}` : ''} · in your Planner`, mine: true }));
  return [...(ed.value?.deadlines || []), ...mine].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
});
async function copy(text, key) { try { await navigator.clipboard.writeText(text); copied.value = key; setTimeout(() => { copied.value = ''; }, 1600); } catch { /* clipboard blocked */ } }
const toPlanner = s => { store.tasks.unshift(makeTask({ title: s.headline.slice(0, 120), notes: `${s.desc} ${s.fit || ''}`.trim().slice(0, 400), link: s.ctaLink, date: today(), kind: s.tag === 'EVENT' ? 'event' : 'task', project: 'Digest', source: 'digest' })); s.added = true; };
const glance = computed(() => ({ deadlines: calendar.value.length, finds: (ed.value?.stories?.length || 0) + (ed.value?.lead ? 1 : 0), drafts: ed.value?.drafts?.length || 0 }));
const tagName = t => t.charAt(0) + t.slice(1).toLowerCase();
</script>

<template>
  <div class="dg span-12" data-test="digests">
    <!-- Not set up yet -->
    <section v-if="!ready || editing" class="dg-setup">
      <DigestProfile @saved="editing = false" @cancel="editing = false" />
    </section>

    <template v-else>
      <div class="dg-bar">
        <label class="dg-archive"><span class="sr-only">Edition</span>
          <select :value="ed?.id" aria-label="Choose an edition" data-test="digest-archive" @change="openEdition($event.target.value)">
            <option v-for="x in digests.list" :key="x.id" :value="x.id">{{ x.edition }} · {{ x.dateLong }}</option>
          </select>
        </label>
        <span class="dg-bar-acts">
          <button type="button" class="btn small" title="Edit what your digest looks for" data-test="digest-edit" @click="editing = true"><Icon name="edit" :size="14" />Profile</button>
          <button v-if="store.digest.geminiKey" type="button" class="btn small" :disabled="digests.researching" title="Search the web with your own Gemini key (free tier)" data-test="research" @click="researchDeeper"><Icon name="sparkle" :size="14" />{{ digests.researching ? 'Researching…' : 'Research deeper' }}</button>
          <button type="button" class="btn primary small" :disabled="digests.busy" data-test="generate" @click="generateNow"><Icon :name="digests.busy ? 'refresh' : 'plus'" :size="14" />{{ digests.busy ? 'Writing…' : 'Generate now' }}</button>
        </span>
      </div>
      <p v-if="digests.error" class="pln-err small dg-pad" role="alert">{{ digests.error }}</p>

      <div v-if="!ed && !digests.loading" class="dg-empty">
        <h2>Your first digest is one tap away</h2>
        <p>Budgie reads the sources in your profile and writes a short brief: what to apply for, what is due, and a draft email to send. New editions arrive every Monday and Thursday.</p>
        <button type="button" class="btn primary" :disabled="digests.busy" data-test="generate-first" @click="generateNow"><Icon name="plus" :size="14" />{{ digests.busy ? 'Writing…' : 'Write my first digest' }}</button>
      </div>

      <article v-if="ed" class="dg-paper" data-test="digest">
        <header class="dg-mast">
          <p class="dg-kick">{{ ed.edition }}</p>
          <h1>The Brief</h1>
          <p class="dg-dateline"><span>{{ ed.dateLong }}</span><span>For {{ store.digest.profile?.name || 'you' }}<template v-if="store.digest.profile?.location"> · {{ store.digest.profile.location }}</template></span></p>
        </header>

        <div class="dg-glance">
          <div><b>{{ glance.deadlines }}</b><span>Deadlines</span></div>
          <div><b>{{ glance.finds }}</b><span>New finds</span></div>
          <div><b>{{ glance.drafts }}</b><span>Drafts</span></div>
        </div>

        <section v-if="lead" class="dg-lead" data-test="digest-lead">
          <p class="dg-red">{{ lead.kicker }}</p>
          <h2>{{ lead.headline }}</h2>
          <p class="dg-dek">{{ lead.dek }}</p>
          <p class="dg-body">{{ lead.body }}</p>
          <p v-if="digests.polished[ed.id]" class="muted small">Written up by {{ digests.polished[ed.id].by }} from the source.</p>
          <div class="dg-ctas">
            <a class="btn primary" :href="lead.ctaLink" target="_blank" rel="noopener noreferrer">{{ lead.ctaLabel }}</a>
            <a class="dg-link" :href="lead.link2" target="_blank" rel="noopener noreferrer">{{ lead.link2Label }}</a>
            <button type="button" class="ibtn" :title="ed.lead.added ? 'Added to Planner' : 'Add to Planner'" aria-label="Add to Planner" @click="toPlanner(ed.lead)"><Icon :name="ed.lead.added ? 'check' : 'planner'" /></button>
          </div>
        </section>
        <p v-else class="dg-none">No new finds this time. Add interests, companies or feeds to your profile to widen the search.</p>

        <section class="dg-sec">
          <h3 class="dg-h">On the calendar <span>Next 14 days</span></h3>
          <ul v-if="calendar.length" class="dg-cal">
            <li v-for="c in calendar" :key="c.date + c.name" :class="{ mine: c.mine }">
              <span class="dg-chip"><small>{{ chip(c.date).mon }}</small><b>{{ chip(c.date).day }}</b><small>{{ chip(c.date).wd }}</small></span>
              <span><b>{{ c.name }}</b><span class="muted small">{{ c.desc }}</span></span>
              <a v-if="c.ctaLink" :href="c.ctaLink" target="_blank" rel="noopener noreferrer" class="dg-link">{{ c.ctaLabel }}</a>
            </li>
          </ul>
          <p v-else class="dg-none">Nothing due in the next two weeks.</p>
        </section>

        <section class="dg-sec">
          <h3 class="dg-h">New this scan <span>{{ ed.stories.length }}</span></h3>
          <div v-if="ed.stories.length" class="dg-stories">
            <article v-for="s in ed.stories" :key="s.ctaLink" class="dg-story" data-test="digest-story">
              <p class="dg-tag" :data-tag="s.tag">{{ tagName(s.tag) }}</p>
              <h4>{{ s.headline }}</h4>
              <p class="dg-desc">{{ s.desc }}</p>
              <p class="small"><b>Fit:</b> {{ s.fit }} · <b>{{ s.deadline }}</b></p>
              <div class="dg-ctas">
                <a class="btn small" :href="s.ctaLink" target="_blank" rel="noopener noreferrer"><Icon name="external" :size="13" />{{ s.ctaLabel }}</a>
                <button type="button" class="ibtn ghost" :title="s.added ? 'Added to Planner' : 'Add to Planner'" :aria-label="`Add ${s.headline} to Planner`" data-test="story-plan" @click="toPlanner(s)"><Icon :name="s.added ? 'check' : 'planner'" /></button>
              </div>
            </article>
          </div>
          <p v-else class="dg-none">Nothing else new since the last edition.</p>
        </section>

        <section v-if="digests.research" class="dg-sec" data-test="research-results">
          <h3 class="dg-h">From deeper research <span>Gemini with Google Search</span></h3>
          <div class="dg-stories">
            <article v-for="s in digests.research" :key="s.ctaLink" class="dg-story">
              <p class="dg-tag" :data-tag="s.tag">{{ tagName(s.tag) }}</p>
              <h4>{{ s.headline }}</h4>
              <p class="dg-desc">{{ s.desc }}</p>
              <p class="small"><b>Fit:</b> {{ s.fit }} · <b>{{ s.deadline }}</b></p>
              <div class="dg-ctas"><a class="btn small" :href="s.ctaLink" target="_blank" rel="noopener noreferrer"><Icon name="external" :size="13" />Open</a><button type="button" class="ibtn ghost" title="Add to Planner" aria-label="Add to Planner" @click="toPlanner(s)"><Icon :name="s.added ? 'check' : 'planner'" /></button></div>
            </article>
          </div>
        </section>

        <section class="dg-sec">
          <h3 class="dg-h">Your outbox <span>Drafts to send yourself</span></h3>
          <ul v-if="ed.drafts.length" class="dg-out">
            <li v-for="d in ed.drafts" :key="d.no" :class="{ open: opened === d.no }">
              <button type="button" class="dg-out-row" :aria-expanded="opened === d.no" data-test="draft" @click="opened = opened === d.no ? null : d.no">
                <b>#{{ d.no }}</b><span><b>{{ d.to }}</b><span class="muted small">{{ d.purpose }}</span></span><span class="dg-status">{{ d.status }}</span><span class="muted small">{{ d.sendBy }}</span>
              </button>
              <div v-if="opened === d.no" class="dg-draft">
                <p><b>Subject:</b> {{ d.subject }}</p>
                <pre>{{ d.body }}</pre>
                <div class="dg-ctas">
                  <button type="button" class="btn small" @click="copy(d.subject, `s${d.no}`)"><Icon :name="copied === `s${d.no}` ? 'check' : 'copy'" :size="14" />{{ copied === `s${d.no}` ? 'Copied' : 'Copy subject' }}</button>
                  <button type="button" class="btn small" data-test="copy-email" @click="copy(d.body, `b${d.no}`)"><Icon :name="copied === `b${d.no}` ? 'check' : 'copy'" :size="14" />{{ copied === `b${d.no}` ? 'Copied' : 'Copy email' }}</button>
                </div>
              </div>
            </li>
          </ul>
          <p v-else class="dg-none">No new drafts this time.</p>
        </section>

        <section v-if="ed.watch" class="dg-watch">
          <p class="dg-kick">Watching: {{ ed.watch.topic }}</p>
          <h4>{{ ed.watch.headline }}</h4>
          <p>{{ ed.watch.body }}</p>
          <a class="dg-link" :href="ed.watch.link" target="_blank" rel="noopener noreferrer">{{ ed.watch.linkLabel }}</a>
          <p v-if="ed.watch.note" class="muted small">{{ ed.watch.note }}</p>
        </section>

        <section v-if="ed.action" class="dg-week">
          <p class="dg-kick">Do this week</p>
          <p>{{ ed.action.text }}</p>
          <a v-if="ed.action.link" class="btn small" :href="ed.action.link" target="_blank" rel="noopener noreferrer">{{ ed.action.label }}</a>
        </section>

        <footer class="dg-foot">
          <p v-if="ed.sources?.length" class="small"><b>Sources:</b> <template v-for="(s, i) in ed.sources" :key="s.url"><a :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.title }}</a><template v-if="i < ed.sources.length - 1">, </template></template></p>
          <p class="muted small">Written by Budgie from free sources{{ ai.ready ? ' and polished on your device' : '' }}. Check details on the official page before you apply. Budgie never sends email for you.</p>
        </footer>
      </article>
    </template>
  </div>
</template>
