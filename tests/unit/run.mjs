// Fast checks of the Planner's rules, with no browser: quick add, repeats,
// streaks, routines and the calendar reader. Run with `npm run test:unit`.
import { register } from 'node:module';
import assert from 'node:assert/strict';
register('./hooks.mjs', import.meta.url);

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { parseTask, occursOn, streak, toggleDone, makeTask, buildRoutine, isoDay, addDays, score } = await import('../../src/lib/tasks.js');
const { store } = await import('../../src/lib/store.js');
const { parseIcs, checkFeedUrl, feedKind } = await import('../../worker/ical.js');
const { eventToTask, mergeEvents } = await import('../../src/lib/calendar.js');

let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`); };
// Saturday 7 November 2026, 9 AM.
const NOW = new Date(2026, 10, 7, 9, 0);
const p = s => parseTask(s, NOW);

await check('a deadline with a day, time, project and priority', () => {
  const t = p('Essay 2 due fri 5pm #english !');
  assert.equal(t.title, 'Essay 2');
  assert.equal(t.date, '2026-11-13');
  assert.equal(t.time, '17:00');
  assert.equal(t.project, 'English');
  assert.equal(t.priority, 'high');
  assert.equal(t.kind, 'assignment');
});
await check('tomorrow, tonight and in N days', () => {
  assert.equal(p('call mom tomorrow').date, '2026-11-08');
  const tn = p('finish slides tonight');
  assert.equal(tn.date, '2026-11-07'); assert.equal(tn.time, '20:00');
  assert.equal(p('dentist in 3 days at 2:30pm').date, '2026-11-10');
  assert.equal(p('dentist in 3 days at 2:30pm').time, '14:30');
});
await check('month names and numeric dates', () => {
  assert.equal(p('Midterm nov 20 10am').date, '2026-11-20');
  assert.equal(p('Midterm nov 20 10am').kind, 'exam');
  assert.equal(p('flight 12/18').date, '2026-12-18');
  assert.equal(p('renew passport 3 jan').date, '2027-01-03', 'a past month means next year');
});
await check('repeats: daily, MWF, weekdays, 3x a week, sundays', () => {
  const g = p('gym 3x a week 6pm');
  assert.deepEqual(g.repeat, { every: 'week', days: [1, 3, 5] }); assert.equal(g.time, '18:00'); assert.equal(g.title, 'Gym'); assert.equal(g.kind, 'routine');
  const c = p('Chem lecture MWF 10-12');
  assert.deepEqual(c.repeat.days, [1, 3, 5]); assert.equal(c.time, '10:00'); assert.equal(c.mins, 120); assert.equal(c.kind, 'class');
  assert.equal(p('shower every day 7:15am').repeat.every, 'day');
  assert.equal(p('standup weekdays 9am').repeat.every, 'weekdays');
  assert.deepEqual(p('call friends sundays').repeat, { every: 'week', days: [0] });
  assert.deepEqual(p('piano every tue and thu at 4').repeat.days, [2, 4]);
});
await check('durations', () => {
  const t = p('haircut sat for 45 min');
  assert.equal(t.mins, 45); assert.equal(t.title, 'Haircut');
  assert.equal(t.date, '2026-11-07');
});
await check('plain words are not mistaken for dates', () => {
  const t = p('Read chapter 3 of the sun also rises');
  assert.equal(t.date, ''); assert.equal(t.time, '');
});
await check('repeats and streaks', () => {
  const today = isoDay();
  const t = makeTask({ title: 'Gym', repeat: { every: 'day' }, date: addDays(today, -5) });
  assert.ok(occursOn(t, today));
  toggleDone(t, addDays(today, -2)); toggleDone(t, addDays(today, -1)); toggleDone(t, today);
  assert.equal(streak(t), 3);
  const w = makeTask({ title: 'Class', repeat: { every: 'week', days: [1, 3] }, date: '2026-11-02' });
  assert.ok(occursOn(w, '2026-11-04')); assert.ok(!occursOn(w, '2026-11-05'));
});
await check('overdue and due-today work comes first', () => {
  const today = isoDay();
  assert.ok(score(makeTask({ date: addDays(today, -1) })) > score(makeTask({ date: addDays(today, 5), priority: 'high' })));
});
await check('a routine from wake, sleep and a few words', () => {
  const r = buildRoutine({ wake: '06:30', sleep: '22:30', text: 'gym 3x a week at 6pm, call friends sundays' });
  assert.equal(r[0].title, 'Wake up'); assert.equal(r[0].time, '06:30');
  assert.ok(r.find(i => i.title === 'Gym' && i.time === '18:00'));
  assert.ok(r.find(i => i.title === 'Sleep' && i.time === '22:30'));
});

const ICS = `BEGIN:VCALENDAR\r\nX-WR-CALNAME:Fall courses\r\nBEGIN:VEVENT\r\nUID:event-assignment-1\r\nDTSTART;VALUE=DATE:20261113\r\nSUMMARY:Essay 2 [ENGL 101 Fall 2026]\r\nURL:https://school.instructure.com/courses/1/assignments/2\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:lec-1\r\nDTSTART;TZID=America/New_York:20261102T100000\r\nDTEND;TZID=America/New_York:20261102T111500\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261215T000000Z\r\nSUMMARY:Chemistry lecture\r\nLOCATION:Hall\\, Room 2\r\nDESCRIPTION:Bring a long\r\n  note\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:old\r\nDTSTART:20200101T100000Z\r\nSUMMARY:Long gone\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:20261120T150000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Cancelled\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
await check('iCal: events, time zones, repeats, folded lines; old and cancelled ones skipped', () => {
  const { name, events } = parseIcs(ICS, NOW.getTime());
  assert.equal(name, 'Fall courses');
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].start, { date: '2026-11-13' });
  assert.equal(events[1].start.at, '2026-11-02T15:00:00.000Z', '10:00 in New York is 15:00 UTC in November');
  assert.deepEqual(events[1].repeat, { every: 'week', days: [1, 3, 5], until: '2026-12-15', count: null });
  assert.equal(events[1].location, 'Hall, Room 2');
  assert.equal(events[1].notes, 'Bring a long note');
});
await check('iCal: Canvas items become assignments with the course as project', () => {
  const { events } = parseIcs(ICS, NOW.getTime());
  const t = eventToTask(events[0], { kind: 'canvas' });
  assert.equal(t.title, 'Essay 2'); assert.equal(t.project, 'ENGL 101'); assert.equal(t.kind, 'assignment'); assert.equal(t.date, '2026-11-13');
  const c = eventToTask(events[1], { kind: 'google' });
  assert.equal(c.kind, 'class'); assert.equal(c.mins, 75); assert.deepEqual(c.repeat.days, [1, 3, 5]);
});
await check('iCal: syncing again updates, keeps your ticks and removes what left', () => {
  store.tasks = [];
  const feed = { id: 'f1', kind: 'canvas' };
  const { events } = parseIcs(ICS, NOW.getTime());
  const first = mergeEvents(feed, events.map(e => ({ ...e, start: e.uid === 'event-assignment-1' ? { date: addDays(isoDay(), 6) } : e.start })));
  assert.equal(first.added, 2);
  const essay = store.tasks.find(t => t.title === 'Essay 2');
  essay.notes = 'outline done';
  mergeEvents(feed, [{ ...events[0], start: { date: addDays(isoDay(), 7) } }]);
  assert.equal(store.tasks.length, 1, 'the lecture left the calendar, so it is removed');
  assert.equal(store.tasks[0].notes, 'outline done', 'your notes are kept');
  assert.equal(store.tasks[0].date, addDays(isoDay(), 7), 'the new date is used');
});
await check('calendar links: only public https addresses', () => {
  assert.equal(checkFeedUrl('webcal://p01-caldav.icloud.com/published/2/abc').protocol, 'https:');
  for (const bad of ['http://example.com/a.ics', 'https://localhost/a.ics', 'https://127.0.0.1/a.ics', 'https://[::1]/a.ics', 'https://user:pw@example.com/a.ics', 'https://example.com:8080/a.ics', 'https://printer.local/a.ics', 'file:///etc/passwd', 'javascript:alert(1)']) {
    assert.throws(() => checkFeedUrl(bad), undefined, bad);
  }
  assert.equal(feedKind('https://school.instructure.com/feeds/calendars/user_x.ics'), 'canvas');
  assert.equal(feedKind('https://calendar.google.com/calendar/ical/x/private-y/basic.ics'), 'google');
  assert.equal(feedKind('https://outlook.office365.com/owa/calendar/x/reachcalendar.ics'), 'outlook');
});
const { route, splitSpoken, routeSpoken } = await import('../../src/lib/router.js');
await check('the Playground inbox tells tasks, routines and goals apart', () => {
  const to = t => route(t).dest;
  assert.equal(to('Essay due Fri 5pm #English'), 'task');
  assert.equal(to('gym MWF 6pm'), 'routine');
  assert.equal(to('call mom every Sunday 5pm'), 'routine');
  assert.equal(to('I want to land a summer internship by March'), 'goal');
  assert.equal(to('learn Spanish this year'), 'goal');
  assert.equal(to('call mom'), 'task');
  assert.equal(to('dentist tomorrow at 3'), 'task');
});
await check('speech is split into separate things', () => {
  assert.deepEqual(splitSpoken('essay due friday at 5pm then gym every monday at 6 and remind me to call mom and dad tomorrow'),
    ['essay due friday at 5pm', 'gym every monday at 6', 'call mom and dad tomorrow']);
  assert.deepEqual(splitSpoken('Gym on Monday. I want to read 12 books this year'), ['Gym on Monday', 'I want to read 12 books this year']);
  assert.deepEqual(routeSpoken('study for the midterm tomorrow and gym every day at 7am').map(r => r.dest), ['task', 'routine']);
});
const { parseGoal, ruleMilestones } = await import('../../src/lib/goals.js');
await check('goals: titles, dates and milestones', () => {
  const g = parseGoal('I want to run a 10K by March', NOW);
  assert.equal(g.title, 'Run a 10K'); assert.equal(g.by, '2027-03-31');
  assert.equal(parseGoal('goal: land a summer internship by summer', NOW).by, '2027-06-01');
  assert.equal(parseGoal('read 12 books this year', NOW).by, '2026-12-31');
  assert.ok(ruleMilestones({ title: 'Land a summer internship' }).some(m => /CV/.test(m)), 'internship goals get CV steps');
});
const { parseFeed, findDeadline, tagFor, writeEdition, cleanProfile } = await import('../../worker/digest.js');
const RSS = `<rss><channel><item><title>NVIDIA opens first-year research internships - NVIDIA Blog</title><link>https://blogs.nvidia.com/a</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Robotics and embedded systems roles for undergraduates. Apply by December 1.</p>]]></description><source url="https://blogs.nvidia.com">NVIDIA Blog</source></item>
<item><title>Free hackathon for students in Boston &amp; online</title><link>https://example.org/hack</link><description>Register by Nov 15. Open to international students.</description></item>
<item><title>Defense program for US citizens only</title><link>https://example.org/x</link><description>Clearance required.</description></item>
<item><title>No link</title><link>javascript:alert(1)</link></item></channel></rss>`;
await check('digests: feeds are read safely, deadlines and tags found', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 3, 'items without an https link are dropped');
  assert.equal(items[0].title, 'NVIDIA opens first-year research internships', 'the source is taken off the title');
  assert.doesNotMatch(items[0].desc, /<p>/, 'HTML is removed');
  assert.equal(findDeadline(items[0].desc, NOW), '2026-12-01');
  assert.equal(findDeadline('Register by Nov 15', NOW), '2026-11-15');
  assert.equal(tagFor('Free hackathon for students'), 'EVENT');
  assert.equal(tagFor('Software engineering intern', 'job'), 'INTERNSHIP');
});
await check('digests: an edition with a lead, deadlines, drafts and no excluded items', () => {
  const profile = cleanProfile({ name: 'Sam Lee', school: 'State University', study: 'Electrical Engineering', interests: ['robotics', 'embedded systems'], exclude: ['US citizens only'], watch: 'student visa' });
  const ed = writeEdition({ items: parseFeed(RSS), watch: parseFeed(RSS).slice(1), profile }, null, NOW);
  assert.match(ed.lead.headline, /NVIDIA/, 'the best match leads');
  assert.ok(!JSON.stringify(ed).includes('Defense program'), 'excluded items are left out');
  assert.deepEqual(ed.deadlines.map(d => d.date), ['2026-11-15'], 'only deadlines in the next 14 days');
  assert.equal(ed.drafts[0].no, '1');
  assert.match(ed.drafts[0].body, /Sam Lee$/, 'drafts are signed with your name');
  assert.ok(ed.watch && ed.watch.topic === 'student visa');
  const again = writeEdition({ items: parseFeed(RSS), watch: [], profile }, ed, NOW);
  assert.ok(!again.lead || !/NVIDIA/.test(again.lead.headline), 'stories are not repeated in the next edition');
});
const { profileFromAccount, makeDigest } = await import('../../worker/digest.js');
const { geminiResearch } = await import('../../worker/gemini.js');
await check('digests: topics come from goals, projects and studies, not a form', () => {
  const p = profileFromAccount({ me: { name: 'Sam', study: 'Electrical Engineering' }, goals: [{ title: 'Land a robotics internship' }], tasks: [{ project: 'Embedded' }, { project: 'Digest' }] });
  assert.ok(p.interests.includes('robotics') && p.interests.includes('embedded') && p.interests.includes('electrical'), p.interests.join());
  assert.ok(!p.interests.includes('digest') && !p.interests.includes('land'), 'filler words and the Digest project are skipped');
  assert.equal(profileFromAccount({}, { focus: 'AI policy news' }).focus, 'AI policy news', 'other digests follow their focus line');
  assert.deepEqual(profileFromAccount({}).interests, ['students', 'scholarships'], 'My brief is filled in even before you add anything');
});
await check('digests: research from Gemini leads, free finds fill in', () => {
  const research = { lead: { kicker: 'Program · Rolling', headline: 'Open source mentorship for students', dek: 'Paid mentorship.', body: 'Details.', ctaLabel: 'Apply', ctaLink: 'https://example.org/mentor' },
    stories: [{ tag: 'EVENT', headline: 'Robotics fair', desc: 'A fair.', fit: 'Matches robotics', deadline: 'On Nov 12', dueIso: '2026-11-12', ctaLabel: 'Register', ctaLink: 'https://example.org/fair', fromAI: true }],
    watch: { topic: 'student work rules', headline: 'New guidance', body: 'Short.', linkLabel: 'Read it', link: 'https://example.org/rules' }, action: null, sources: [{ title: 'example.org', url: 'https://example.org' }] };
  const ed = writeEdition({ items: parseFeed(RSS), watch: [], profile: cleanProfile({ interests: ['robotics'] }), research }, null, NOW);
  assert.equal(ed.lead.headline, 'Open source mentorship for students');
  assert.equal(ed.stories[0].headline, 'Robotics fair', 'researched stories come first');
  assert.ok(ed.stories.some(x => /NVIDIA/.test(x.headline)), 'free finds are still there');
  assert.equal(ed.deadlines[0].date, '2026-11-12');
  assert.equal(ed.watch.topic, 'student work rules');
});
await check('digests: Gemini answers are checked before use', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Here you go <digest>{"lead":{"headline":"Lead","ctaLink":"javascript:alert(1)"},"stories":[{"tag":"weird","headline":"<b>Good</b> one","ctaLink":"https://ok.example/a"},{"headline":"No link","ctaLink":"http://plain.example"}],"watch":null,"action":{"text":"Do it","link":"ftp://x"},"sources":[{"title":"S","url":"https://ok.example"}]}</digest>' }] } }] }) });
  try {
    const r = await geminiResearch('k'.repeat(39), { who: 'a student', focus: '', topics: ['robotics'], today: 'today', previous: null });
    assert.equal(r.lead, null, 'a lead without an https link is dropped');
    assert.deepEqual(r.stories.map(x => [x.tag, x.headline]), [['PROGRAM', 'Good one']], 'only https stories, no HTML, known tags');
    assert.equal(r.action.link, '', 'odd links are removed');
  } finally { globalThis.fetch = real; }
});
const { linkAdvice, googleFeedFrom } = await import('../../worker/ical.js');
await check('calendar links: Google links that are not feeds get the right advice', () => {
  assert.match(linkAdvice('https://calendar.google.com/calendar/u/0/r'), /link for opening Google Calendar[\s\S]*Secret address in iCal format/);
  assert.equal(googleFeedFrom('https://calendar.google.com/calendar/embed?src=a%40gmail.com&ctz=America%2FNew_York'), 'https://calendar.google.com/calendar/ical/a%40gmail.com/public/basic.ics', 'embed links become the feed');
  assert.equal(googleFeedFrom('https://calendar.google.com/calendar/u/0?cid=YUBnbWFpbC5jb20'), 'https://calendar.google.com/calendar/ical/a%40gmail.com/public/basic.ics', 'share links become the feed');
  assert.equal(linkAdvice('https://calendar.google.com/calendar/embed?src=a%40gmail.com'), '', 'so they are tried');
  assert.match(linkAdvice('https://calendar.google.com/calendar/ical/a%40gmail.com/public/basic.ics', 404), /private[\s\S]*secret address/);
  assert.equal(linkAdvice('https://calendar.google.com/calendar/ical/a%40gmail.com/private-123/basic.ics'), '', 'the secret address is fine');
  assert.match(linkAdvice('https://calendar.google.com/calendar/ical/a%40gmail.com/private-123/basic.ics', 404), /reset[\s\S]*school or work/);
  assert.equal(linkAdvice('https://school.instructure.com/feeds/calendars/user_x.ics'), '', 'other services are tried first');
});
const { modelSource } = await import('../../worker/models.js');
await check('model downloads: only the exact files Budgie uses', () => {
  assert.equal(modelSource('/api/model/hf/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/params_shard_0.bin'), 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/params_shard_0.bin');
  assert.equal(modelSource('/api/model/hf/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf'), 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf');
  assert.match(modelSource('/api/model/gh/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm'), /^https:\/\/raw\.githubusercontent\.com\//);
  for (const bad of ['/api/model/hf/evil/repo/resolve/main/x.bin', '/api/model/hf/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/../../x', '/api/model/hf/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/other.gguf', '/api/model/gh/evil/x.wasm', '/api/model/gh/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/x.js', '/api/model/xx/a']) {
    assert.equal(modelSource(bad), null, bad);
  }
});
console.log(`\n${n} checks passed`);
