<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { store } from '../lib/store';
import {
  DIGESTS_LIVE, digests, streams, loadDigests, openStream, openEdition, generate, addStream, removeStream, hasTopics, isRead, markRead,
  isSaved, toggleSave, isHidden, toggleHide, isPlanned, planStory, actedOn, draftBody, isSent, markSent, readingMinutes,
} from '../lib/digest';
import { occurrences, today, addDays, KINDS, dayDiff, fromIso } from '../lib/tasks';
import Icon from './Icon.vue';
import { toast } from '../lib/toast';

// Your digests, to read and act on: a lead story, a 14-day deadline strip,
// finds you can filter, sort, save, plan or hide, an outbox of drafts, and
// what you saved. "My brief" follows your goals and projects; add others with a name.
onMounted(() => { if (!DIGESTS_LIVE) return; if (!digests.loaded) loadDigests(); else openStream(digests.active); });
const st = computed(() => streams.value.find(x => x.id === digests.active) || streams.value[0]);
const ed = computed(() => digests.viewing[digests.active] || null);
const list = computed(() => digests.editions[digests.active] || []);
const busy = computed(() => Boolean(digests.busy[digests.active]));
watch(ed, e => { markRead(e); day.value = ''; }, { immediate: true });
const lead = computed(() => (ed.value?.lead ? { ...ed.value.lead, ...(digests.polished[`${ed.value.stream}:${ed.value.id}`] || {}), tag: ed.value.lead.kicker?.split(' ·')[0]?.toUpperCase() } : null));

// ---------- helpers ----------
const TAGS = { INTERNSHIP: '#7c3aed', PROGRAM: '#2563eb', EVENT: '#d97706', RESEARCH: '#0891b2', PERK: '#16a34a', AMBASSADOR: '#db2777' };
const tagName = t => (t ? t.charAt(0) + t.slice(1).toLowerCase() : '');
const left = iso => (iso ? dayDiff(today(), iso) : null);
const countdown = iso => { const n = left(iso); return n === null ? '' : n < 0 ? 'Closed' : n === 0 ? 'Due today' : n === 1 ? '1 day left' : `${n} days left`; };
const urgency = iso => { const n = left(iso); return n === null ? '' : n < 0 ? 'past' : n <= 3 ? 'hot' : n <= 7 ? 'warm' : 'calm'; };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const copied = ref('');
async function copy(text, key) { try { await navigator.clipboard.writeText(text); copied.value = key; setTimeout(() => { copied.value = ''; }, 1600); } catch { /* clipboard blocked */ } }

// ---------- the 14-day strip ----------
const day = ref('');
const strip = computed(() => {
  const mine = occurrences(today(), addDays(today(), 13)).filter(x => ['assignment', 'exam', 'event'].includes(x.task.kind) && !x.done && x.task.source !== 'digest')
    .map(x => ({ date: x.date, name: x.task.title, desc: `${KINDS[x.task.kind].label}${x.task.project ? ` · ${x.task.project}` : ''}`, mine: true }));
  const all = [...(ed.value?.deadlines || []).map(x => ({ ...x, mine: false })), ...mine];
  return Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today(), i);
    const x = fromIso(d);
    return { d, wd: x.toLocaleDateString('en-US', { weekday: 'narrow' }), n: x.getDate(), items: all.filter(a => a.date === d) };
  });
});
const dayItems = computed(() => strip.value.find(x => x.d === day.value)?.items || []);

// ---------- finds: filter, sort, search ----------
const tag = ref('');
const sort = ref('fit');
const q = ref('');
const showHidden = ref(false);
const stories = computed(() => ed.value?.stories || []);
const counts = computed(() => stories.value.reduce((m, s) => ({ ...m, [s.tag]: (m[s.tag] || 0) + 1 }), {}));
const finds = computed(() => {
  const term = q.value.trim().toLowerCase();
  let out = stories.value.filter(s => (!tag.value || s.tag === tag.value) && (showHidden.value || !isHidden(s)) && (!term || `${s.headline} ${s.desc} ${s.fit}`.toLowerCase().includes(term)));
  if (day.value) out = out.filter(s => s.dueIso === day.value);
  const by = { fit: (a, b) => (b.score || 0) - (a.score || 0), deadline: (a, b) => dueKey(a).localeCompare(dueKey(b)), new: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) }[sort.value];
  return [...out].sort(by);
});
// Upcoming deadlines first, then rolling ones, then the ones that have closed.
const dueKey = s => (!s.dueIso ? '2' : s.dueIso < today() ? `3${s.dueIso}` : `1${s.dueIso}`);
const hiddenCount = computed(() => stories.value.filter(isHidden).length);

// ---------- your briefing ----------
const all = computed(() => [ed.value?.lead, ...stories.value].filter(Boolean));
const acted = computed(() => all.value.filter(actedOn).length);
const pct = computed(() => (all.value.length ? Math.round((acted.value / all.value.length) * 100) : 0));
const soon = computed(() => strip.value.filter(x => x.items.length && x.d <= addDays(today(), 6)).reduce((n, x) => n + x.items.length, 0));

// ---------- outbox ----------
// Email it: opens your email app with the draft, and counts it as sent (a
// follow-up goes into your Planner), with Undo.
function emailed(d) {
  if (isSent(ed.value, d)) return;
  markSent(ed.value, d);
  toast(`A follow-up with ${d.to} is in your Planner for next week.`, { kind: 'success', title: 'Opened in your email', action: { label: 'Undo', run: () => { markSent(ed.value, d); store.tasks = store.tasks.filter(t => t.title !== `Follow up with ${d.to}`.slice(0, 120) || t.done); } } });
}
const mailto = d => `mailto:?subject=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(draftBody(ed.value, d))}`;

// ---------- digests ----------
const adding = ref(false);
const name = ref('');
const focus = ref('');
async function add() { if (!name.value.trim()) return; adding.value = false; await addStream(name.value, focus.value); name.value = ''; focus.value = ''; }
const remove = () => { if (confirm(`Stop the “${st.value.name}” digest? Its past editions are removed.`)) removeStream(st.value.id); };
const unread = id => { const l = digests.editions[id]; return Boolean(l?.length && !isRead({ stream: id, id: l[0].id })); };
const shortDate = s => (s ? fromIso(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');
</script>

<template>
  <div v-if="!DIGESTS_LIVE" class="dz-soon span-12" data-test="digests">
    <p class="dz-label">Coming soon</p>
    <h1>Digests</h1>
    <p class="dz-soon-lead">A short newspaper written for you twice a week: opportunities that fit your goals, deadlines worth knowing, and draft emails you can send in one click.</p>
    <ul class="dz-soon-list">
      <li><Icon name="target" :size="16" /><span><b>Follows your life.</b> Topics come from your goals, projects and classes. Nothing to set up.</span></li>
      <li><Icon name="calendar" :size="16" /><span><b>Deadlines in your Planner.</b> What is due in the next two weeks lands on your calendar.</span></li>
      <li><Icon name="external" :size="16" /><span><b>One-click emails.</b> Outreach drafts open in your email app, ready to send.</span></li>
      <li><Icon name="sparkle" :size="16" /><span><b>Free.</b> Built on free sources, with optional research by your own Gemini key.</span></li>
    </ul>
    <p class="muted small">Until then, your Planner, goals and routine work as usual.</p>
  </div>
  <div v-else class="dz span-12" data-test="digests">
    <!-- Digests and editions -->
    <header class="dz-top">
      <div class="dz-tabs" role="tablist" aria-label="Your digests">
        <button v-for="s in streams" :key="s.id" type="button" role="tab" class="dz-tab" :class="{ on: s.id === digests.active }" :aria-selected="s.id === digests.active" :data-test="`digest-tab-${s.id}`" @click="openStream(s.id)">
          <Icon :name="s.id === 'main' ? 'home' : 'list'" :size="14" />{{ s.name }}<i v-if="unread(s.id) && s.id !== digests.active" class="dz-dot" aria-label="new" />
        </button>
        <button type="button" class="dz-tab dz-add" title="Add a digest" aria-label="Add a digest" data-test="digest-add" @click="adding = !adding"><Icon name="plus" :size="14" /></button>
      </div>
      <div class="dz-tools">
        <button type="button" class="ibtn" :class="{ spin: busy }" :disabled="busy" title="Write a fresh edition now" aria-label="Write a fresh edition now" data-test="generate" @click="generate()"><Icon name="refresh" /></button>
        <button v-if="st.id !== 'main'" type="button" class="ibtn ghost danger" title="Stop this digest" aria-label="Stop this digest" @click="remove"><Icon name="trash" /></button>
      </div>
    </header>
    <form v-if="adding" class="dz-addform" data-test="digest-new" @submit.prevent="add">
      <input v-model="name" placeholder="Name, e.g. “Robotics internships” or “AI policy news”" aria-label="Digest name" maxlength="60" data-test="digest-name" />
      <input v-model="focus" placeholder="What it should follow (optional)" aria-label="What it should follow" maxlength="120" />
      <button class="btn primary small" :disabled="!name.trim()" data-test="digest-create"><Icon name="check" :size="14" />Start</button>
    </form>
    <nav v-if="list.length > 1" class="dz-editions" aria-label="Editions" data-test="digest-archive">
      <button v-for="x in list" :key="x.id" type="button" :class="{ on: ed?.id === x.id }" :aria-current="ed?.id === x.id" @click="openEdition(digests.active, x.id)"><b>{{ x.edition.replace(' Edition', '') }}</b><span>{{ shortDate(x.id) }}</span></button>
    </nav>
    <p v-if="busy" class="dg-status small" role="status" data-test="digest-busy"><Icon name="refresh" :size="13" />Writing a fresh edition{{ store.digest.geminiKey ? ' with Gemini and free sources' : ' from free sources' }}… this can take up to a minute.</p>
    <p v-if="digests.error" class="pln-err small dz-pad" role="alert">{{ digests.error }}</p>

    <div v-if="!ed" class="dg-empty" :aria-busy="busy">
      <template v-if="busy">
        <h2>Writing {{ st.name }}…</h2>
        <p>{{ st.id === 'main' && !hasTopics() ? 'Your first brief covers opportunities for students. Goals and projects in the Playground, and details in your profile, sharpen it.' : 'Gathering stories, deadlines and drafts for you.' }}</p>
      </template>
      <template v-else>
        <h2>No edition yet</h2>
        <p>New editions arrive every Monday and Thursday.</p>
        <button type="button" class="btn primary" data-test="generate-first" @click="generate()"><Icon name="refresh" :size="14" />Write it now</button>
      </template>
    </div>

    <article v-else class="dz-paper" data-test="digest">
      <!-- Hero: the lead story beside your briefing -->
      <section class="dz-hero">
        <div class="dz-lead" data-test="digest-lead">
          <p class="dz-meta"><span class="dz-kicker">{{ ed.edition }} · {{ ed.dateLong }}</span><span>{{ readingMinutes(ed) }} min read</span></p>
          <h1 class="dz-title">{{ ed.name || st.name }}</h1>
          <template v-if="lead">
            <p class="dz-red">{{ lead.kicker }}</p>
            <h2>{{ lead.headline }}</h2>
            <p class="dz-dek">{{ lead.dek }}</p>
            <p class="dz-body">{{ lead.body }}</p>
            <div class="dz-acts">
              <a class="btn primary" :href="lead.ctaLink" target="_blank" rel="noopener noreferrer"><Icon name="external" :size="14" />{{ lead.ctaLabel }}</a>
              <button type="button" class="btn" :class="{ on: isSaved(ed.lead) }" :aria-pressed="isSaved(ed.lead)" data-test="lead-save" @click="toggleSave(ed.lead, ed)"><Icon :name="isSaved(ed.lead) ? 'check' : 'plus'" :size="14" />{{ isSaved(ed.lead) ? 'Saved' : 'Save' }}</button>
              <button type="button" class="btn" :disabled="isPlanned(ed.lead)" @click="planStory(ed.lead)"><Icon :name="isPlanned(ed.lead) ? 'check' : 'planner'" :size="14" />{{ isPlanned(ed.lead) ? 'In Planner' : 'Add to Planner' }}</button>
              <a v-if="lead.link2" class="dg-link" :href="lead.link2" target="_blank" rel="noopener noreferrer">{{ lead.link2Label }}</a>
            </div>
          </template>
          <p v-else class="dg-none">No new finds this time. Goals and projects in the Playground widen what your brief looks for.</p>
        </div>

        <aside class="dz-brief" data-test="digest-briefing">
          <p class="dz-label">Your briefing</p>
          <div class="dz-stats">
            <div><b>{{ all.length }}</b><span>finds</span></div>
            <div><b>{{ soon }}</b><span>due this week</span></div>
            <div><b>{{ ed.drafts.length }}</b><span>drafts</span></div>
          </div>
          <div class="dz-progress" :title="`${acted} of ${all.length} saved, planned or hidden`">
            <span class="small"><b>{{ acted }} of {{ all.length }}</b> acted on</span>
            <span class="dz-bar"><i :style="{ width: `${pct}%` }" /></span>
          </div>
          <div v-if="ed.action" class="dz-week">
            <p class="dz-label">Do this week</p>
            <p>{{ ed.action.text }}</p>
            <a v-if="ed.action.link" class="btn small" :href="ed.action.link" target="_blank" rel="noopener noreferrer"><Icon name="external" :size="13" />{{ ed.action.label }}</a>
          </div>
          <div v-if="ed.watch" class="dz-watch">
            <p class="dz-label">Watching: {{ ed.watch.topic }}</p>
            <h4>{{ ed.watch.headline }}</h4>
            <p class="small">{{ ed.watch.body }}</p>
            <a class="dg-link small" :href="ed.watch.link" target="_blank" rel="noopener noreferrer">{{ ed.watch.linkLabel || 'Read it' }}</a>
            <p v-if="ed.watch.note" class="muted small">{{ ed.watch.note }}</p>
          </div>
        </aside>
      </section>

      <!-- The next 14 days -->
      <section class="dz-sec">
        <div class="dz-sec-head"><h3>Next 14 days</h3><button v-if="day" type="button" class="link-btn small" @click="day = ''">Show all days</button></div>
        <div class="dz-strip" role="group" aria-label="Deadlines by day" data-test="digest-strip">
          <button v-for="x in strip" :key="x.d" type="button" class="dz-day" :class="{ on: day === x.d, today: x.d === today(), has: x.items.length }" :aria-pressed="day === x.d" :aria-label="`${shortDate(x.d)}: ${x.items.length} due`" @click="day = day === x.d ? '' : x.d">
            <span>{{ x.wd }}</span><b>{{ x.n }}</b>
            <i class="dz-dots"><em v-for="(it, k) in x.items.slice(0, 4)" :key="k" :class="{ mine: it.mine }" /></i>
          </button>
        </div>
        <ul v-if="day" class="dz-dayitems">
          <li v-for="(it, k) in dayItems" :key="k" :class="{ mine: it.mine }"><b>{{ it.name }}</b><span class="muted small">{{ it.desc }}{{ it.mine ? ' · in your Planner' : '' }}</span><a v-if="it.ctaLink" class="dg-link small" :href="it.ctaLink" target="_blank" rel="noopener noreferrer">{{ it.ctaLabel }}</a></li>
          <li v-if="!dayItems.length" class="muted small">Nothing due {{ shortDate(day) }}.</li>
        </ul>
        <p class="dz-legend small"><i /> From this digest <i class="mine" /> From your Planner</p>
      </section>

      <!-- Finds -->
      <section class="dz-sec">
        <div class="dz-sec-head"><h3>New this scan <span class="muted">{{ stories.length }}</span></h3></div>
        <div class="dz-filters">
          <div class="dz-chips" role="group" aria-label="Filter by kind">
            <button type="button" class="chip-btn" :class="{ on: !tag }" @click="tag = ''">All {{ stories.length }}</button>
            <button v-for="(n, t) in counts" :key="t" type="button" class="chip-btn" :class="{ on: tag === t }" :style="{ '--t': TAGS[t] }" :data-test="`filter-${t.toLowerCase()}`" @click="tag = tag === t ? '' : t"><i class="dz-tagdot" />{{ tagName(t) }} {{ n }}</button>
          </div>
          <div class="dz-find">
            <label class="dz-search"><Icon name="search" :size="14" /><input v-model="q" type="search" placeholder="Search this edition" aria-label="Search this edition" data-test="digest-search" /></label>
            <select v-model="sort" aria-label="Sort" data-test="digest-sort"><option value="fit">Best fit</option><option value="deadline">Deadline soonest</option><option value="new">Newest</option></select>
          </div>
        </div>
        <div v-if="finds.length" class="dz-cards">
          <article v-for="s in finds" :key="s.ctaLink" class="dz-card" :class="{ hidden: isHidden(s) }" :style="{ '--t': TAGS[s.tag] || '#52525b' }" data-test="digest-story">
            <p class="dz-card-top"><span class="dz-tag">{{ tagName(s.tag) }}</span><span v-if="s.fromAI" class="dg-ai" title="Found by Gemini with Google Search">Researched</span><span v-if="s.dueIso" class="dz-count" :class="urgency(s.dueIso)">{{ countdown(s.dueIso) }}</span></p>
            <h4>{{ s.headline }}</h4>
            <p class="dz-desc">{{ s.desc }}</p>
            <div class="dz-fit" :title="s.fit"><span class="dz-meter"><i :style="{ width: `${s.score || 50}%` }" /></span><span class="small"><b>{{ s.score || 50 }}% fit</b> · {{ s.fit }}</span></div>
            <p class="dz-card-foot small"><span>{{ s.deadline }}</span><span class="muted">{{ s.source || host(s.ctaLink) }}</span></p>
            <div class="dz-card-acts">
              <a class="btn small" :href="s.ctaLink" target="_blank" rel="noopener noreferrer"><Icon name="external" :size="13" />{{ s.ctaLabel }}</a>
              <span class="dz-icons">
                <button type="button" class="ibtn ghost" :class="{ on: isSaved(s) }" :aria-pressed="isSaved(s)" :title="isSaved(s) ? 'Saved' : 'Save for later'" :aria-label="`Save ${s.headline}`" data-test="story-save" @click="toggleSave(s, ed)"><Icon :name="isSaved(s) ? 'check' : 'plus'" /></button>
                <button type="button" class="ibtn ghost" :class="{ on: isPlanned(s) }" :disabled="isPlanned(s)" :title="isPlanned(s) ? 'In your Planner' : s.dueIso ? 'Add to Planner with its deadline' : 'Add to Planner'" :aria-label="`Add ${s.headline} to Planner`" data-test="story-plan" @click="planStory(s)"><Icon :name="isPlanned(s) ? 'check' : 'planner'" /></button>
                <button type="button" class="ibtn ghost" :title="copied === s.ctaLink ? 'Copied' : 'Copy link'" :aria-label="`Copy link to ${s.headline}`" @click="copy(s.ctaLink, s.ctaLink)"><Icon :name="copied === s.ctaLink ? 'check' : 'copy'" /></button>
                <button type="button" class="ibtn ghost" :title="isHidden(s) ? 'Show again' : 'Not for me'" :aria-label="isHidden(s) ? `Show ${s.headline}` : `Hide ${s.headline}`" data-test="story-hide" @click="toggleHide(s)"><Icon :name="isHidden(s) ? 'refresh' : 'x'" /></button>
              </span>
            </div>
          </article>
        </div>
        <p v-else class="dg-none">{{ stories.length ? 'Nothing matches. Clear the filter or search.' : 'Nothing else new since the last edition.' }}</p>
        <button v-if="hiddenCount" type="button" class="link-btn small" data-test="show-hidden" @click="showHidden = !showHidden">{{ showHidden ? 'Hide' : 'Show' }} {{ hiddenCount }} you marked “not for me”</button>
      </section>

      <!-- Outbox: one click opens the draft in your email app -->
      <section class="dz-sec">
        <div class="dz-sec-head"><h3>Your outbox <span class="muted">{{ ed.drafts.length }}</span></h3><span class="muted small">One click opens it in your email, ready to send</span></div>
        <ul v-if="ed.drafts.length" class="dz-out">
          <li v-for="d in ed.drafts" :key="d.no" :class="{ sent: isSent(ed, d) }" data-test="draft">
            <div class="dz-out-row">
              <b class="dz-no">#{{ d.no }}</b>
              <span><b>{{ d.to }}</b><span class="muted small">{{ d.subject || d.purpose }}</span></span>
              <span class="muted small">{{ isSent(ed, d) ? 'Sent' : d.sendBy }}</span>
              <a class="btn small" :class="{ primary: !isSent(ed, d) }" :href="mailto(d)" data-test="draft-email" @click="emailed(d)"><Icon :name="isSent(ed, d) ? 'check' : 'external'" :size="14" />{{ isSent(ed, d) ? 'Email again' : 'Email it' }}</a>
            </div>
          </li>
        </ul>
        <p v-else class="dg-none">No new drafts this time.</p>
      </section>

      <!-- Saved across editions -->
      <section v-if="store.digest.saved?.length" class="dz-sec" data-test="digest-saved">
        <div class="dz-sec-head"><h3>Saved <span class="muted">{{ store.digest.saved.length }}</span></h3><span class="muted small">From every edition</span></div>
        <ul class="dz-saved">
          <li v-for="s in [...store.digest.saved].reverse()" :key="s.ctaLink" :style="{ '--t': TAGS[s.tag] || '#52525b' }">
            <span class="dz-tag">{{ tagName(s.tag) || 'Lead' }}</span>
            <a :href="s.ctaLink" target="_blank" rel="noopener noreferrer"><b>{{ s.headline }}</b></a>
            <span v-if="s.dueIso" class="dz-count" :class="urgency(s.dueIso)">{{ countdown(s.dueIso) }}</span>
            <button type="button" class="ibtn ghost" title="Remove from saved" :aria-label="`Remove ${s.headline} from saved`" @click="toggleSave(s)"><Icon name="x" /></button>
          </li>
        </ul>
      </section>

      <footer class="dg-foot">
        <p v-if="ed.sources?.length" class="small"><b>Sources:</b> <template v-for="(s, i) in ed.sources" :key="s.url + i"><a :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.title }}</a><template v-if="i < ed.sources.length - 1">, </template></template></p>
        <p class="muted small" data-test="digest-made">Written from {{ ed.provider || 'free sources' }}<template v-if="ed.topics?.length"> · following {{ ed.topics.join(', ') }}</template>. Check details on the official page before you apply. Budgie never sends email for you.</p>
        <p v-if="ed.researchError" class="muted small">Deeper research was skipped this time: {{ ed.researchError }}.</p>
      </footer>
    </article>
  </div>
</template>
