<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { store } from '../lib/store';
import { digests, streams, loadDigests, openStream, openEdition, generate, addStream, removeStream, hasTopics, isRead, markRead } from '../lib/digest';
import { occurrences, today, addDays, makeTask, KINDS } from '../lib/tasks';
import Icon from './Icon.vue';

// Read your digests: a short newspaper per digest, kept up to date on its own.
// "My brief" follows your goals and projects; add others with a name and an
// optional one-line focus. Your details and Gemini key live in your profile.
onMounted(() => { if (!digests.loaded) loadDigests(); else openStream(digests.active); });
const st = computed(() => streams.value.find(x => x.id === digests.active) || streams.value[0]);
const ed = computed(() => digests.viewing[digests.active] || null);
const list = computed(() => digests.editions[digests.active] || []);
const busy = computed(() => Boolean(digests.busy[digests.active]));
watch(ed, e => markRead(e), { immediate: true });
const lead = computed(() => (ed.value?.lead ? { ...ed.value.lead, ...(digests.polished[`${ed.value.stream}:${ed.value.id}`] || {}) } : null));
const opened = ref(null);
const copied = ref('');
const adding = ref(false);
const name = ref('');
const focus = ref('');
const chip = iso => { const d = new Date(`${iso}T12:00:00`); return { mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), day: d.getDate(), wd: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() }; };
// The calendar box: the digest's deadlines plus your own Planner deadlines.
const calendar = computed(() => {
  const mine = occurrences(today(), addDays(today(), 13)).filter(x => ['assignment', 'exam', 'event'].includes(x.task.kind) && !x.done && x.task.source !== 'digest')
    .map(x => ({ date: x.date, name: x.task.title, desc: `${KINDS[x.task.kind].label}${x.task.project ? ` · ${x.task.project}` : ''} · in your Planner`, mine: true }));
  return [...(ed.value?.deadlines || []), ...mine].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
});
async function copy(text, key) { try { await navigator.clipboard.writeText(text); copied.value = key; setTimeout(() => { copied.value = ''; }, 1600); } catch { /* clipboard blocked */ } }
const toPlanner = s => { store.tasks.unshift(makeTask({ title: s.headline.slice(0, 120), notes: `${s.desc || s.dek || ''} ${s.fit || ''}`.trim().slice(0, 400), link: s.ctaLink, date: today(), kind: s.tag === 'EVENT' ? 'event' : 'task', project: 'Digest', source: 'digest' })); s.added = true; };
const glance = computed(() => ({ deadlines: calendar.value.length, finds: (ed.value?.stories?.length || 0) + (ed.value?.lead ? 1 : 0), drafts: ed.value?.drafts?.length || 0 }));
const tagName = t => t.charAt(0) + t.slice(1).toLowerCase();
async function add() { if (!name.value.trim()) return; adding.value = false; await addStream(name.value, focus.value); name.value = ''; focus.value = ''; }
const remove = () => { if (confirm(`Stop the “${st.value.name}” digest? Its past editions are removed.`)) removeStream(st.value.id); };
const openProfile = () => document.querySelector('[data-test="account"]')?.click();
const unread = id => { const l = digests.editions[id]; return Boolean(l?.length && !isRead({ stream: id, id: l[0].id })); };
</script>

<template>
  <div class="dg span-12" data-test="digests">
    <div class="dg-bar">
      <div class="dg-tabs" role="tablist" aria-label="Your digests">
        <button v-for="s in streams" :key="s.id" type="button" role="tab" class="dg-tab" :class="{ on: s.id === digests.active }" :aria-selected="s.id === digests.active" :data-test="`digest-tab-${s.id}`" @click="openStream(s.id)">
          {{ s.name }}<i v-if="unread(s.id) && s.id !== digests.active" class="dg-new" aria-label="new" />
        </button>
        <button type="button" class="ibtn ghost" title="Add a digest" aria-label="Add a digest" data-test="digest-add" @click="adding = !adding"><Icon name="plus" /></button>
      </div>
      <span class="dg-bar-acts">
        <select v-if="list.length > 1" :value="ed?.id" class="dg-archive" aria-label="Past editions" data-test="digest-archive" @change="openEdition(digests.active, $event.target.value)">
          <option v-for="x in list" :key="x.id" :value="x.id">{{ x.edition }} · {{ x.dateLong }}</option>
        </select>
        <button type="button" class="ibtn" :class="{ spin: busy }" :disabled="busy" title="Write a fresh edition now" aria-label="Write a fresh edition now" data-test="generate" @click="generate()"><Icon name="refresh" /></button>
        <button v-if="st.id !== 'main'" type="button" class="ibtn ghost danger" title="Stop this digest" aria-label="Stop this digest" @click="remove"><Icon name="trash" /></button>
      </span>
    </div>
    <form v-if="adding" class="dg-addform" data-test="digest-new" @submit.prevent="add">
      <input v-model="name" placeholder="Name, e.g. “Robotics internships” or “AI policy news”" aria-label="Digest name" maxlength="60" data-test="digest-name" />
      <input v-model="focus" placeholder="What it should follow (optional, the name is used if empty)" aria-label="What it should follow" maxlength="120" />
      <button class="btn primary small" :disabled="!name.trim()" data-test="digest-create"><Icon name="check" :size="14" />Start</button>
    </form>
    <p v-if="busy" class="dg-status small" role="status" data-test="digest-busy"><Icon name="refresh" :size="13" />Writing a fresh edition{{ store.digest.geminiKey ? ' with Gemini and free sources' : ' from free sources' }}… this can take up to a minute.</p>
    <p v-if="digests.error" class="pln-err small dg-pad" role="alert">{{ digests.error }}</p>

    <div v-if="!ed && !busy" class="dg-empty">
      <template v-if="st.id === 'main' && !hasTopics()">
        <h2>Your brief follows your life</h2>
        <p>Add a goal or a project in the Playground, or tell Budgie what you study in your profile, and your first edition is written straight away. Add a free Gemini key in your profile for deeper research.</p>
        <button type="button" class="btn primary" @click="openProfile"><Icon name="user" :size="14" />Open my profile</button>
      </template>
      <template v-else>
        <h2>No edition yet</h2>
        <p>New editions arrive every Monday and Thursday.</p>
        <button type="button" class="btn primary" data-test="generate-first" @click="generate()"><Icon name="refresh" :size="14" />Write it now</button>
      </template>
    </div>

    <article v-if="ed" class="dg-paper" data-test="digest">
      <header class="dg-mast">
        <p class="dg-kick">{{ ed.edition }}</p>
        <h1>{{ ed.name || st.name }}</h1>
        <p class="dg-dateline"><span>{{ ed.dateLong }}</span><span>For {{ store.me?.name || 'you' }}<template v-if="store.me?.location"> · {{ store.me.location }}</template></span></p>
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
        <div class="dg-ctas">
          <a class="btn primary" :href="lead.ctaLink" target="_blank" rel="noopener noreferrer">{{ lead.ctaLabel }}</a>
          <a v-if="lead.link2" class="dg-link" :href="lead.link2" target="_blank" rel="noopener noreferrer">{{ lead.link2Label }}</a>
          <button type="button" class="ibtn" :title="ed.lead.added ? 'Added to Planner' : 'Add to Planner'" aria-label="Add to Planner" @click="toPlanner(ed.lead)"><Icon :name="ed.lead.added ? 'check' : 'planner'" /></button>
        </div>
      </section>
      <p v-else class="dg-none">No new finds this time. Goals and projects in the Playground widen what your brief looks for.</p>

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
            <p class="dg-tag" :data-tag="s.tag">{{ tagName(s.tag) }}<span v-if="s.fromAI" class="dg-ai" title="Found by Gemini with Google Search">Researched</span></p>
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
        <a class="dg-link" :href="ed.watch.link" target="_blank" rel="noopener noreferrer">{{ ed.watch.linkLabel || 'Read it' }}</a>
        <p v-if="ed.watch.note" class="muted small">{{ ed.watch.note }}</p>
      </section>

      <section v-if="ed.action" class="dg-week">
        <p class="dg-kick">Do this week</p>
        <p>{{ ed.action.text }}</p>
        <a v-if="ed.action.link" class="btn small" :href="ed.action.link" target="_blank" rel="noopener noreferrer">{{ ed.action.label }}</a>
      </section>

      <footer class="dg-foot">
        <p v-if="ed.sources?.length" class="small"><b>Sources:</b> <template v-for="(s, i) in ed.sources" :key="s.url + i"><a :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.title }}</a><template v-if="i < ed.sources.length - 1">, </template></template></p>
        <p class="muted small" data-test="digest-made">Written from {{ ed.provider || 'free sources' }}<template v-if="ed.topics?.length"> · following {{ ed.topics.join(', ') }}</template>. Check details on the official page before you apply. Budgie never sends email for you.</p>
        <p v-if="ed.researchError" class="muted small">Deeper research was skipped this time: {{ ed.researchError }}.</p>
      </footer>
    </article>
  </div>
</template>
