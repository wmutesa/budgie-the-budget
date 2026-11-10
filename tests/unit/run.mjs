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
  assert.equal(g.title, 'Run A 10K'); assert.equal(g.by, '2027-03-31');
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
await check('model downloads: only the exact files Taskie uses', () => {
  assert.equal(modelSource('/api/model/hf/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/params_shard_0.bin'), 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/params_shard_0.bin');
  assert.equal(modelSource('/api/model/hf/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf'), 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf');
  assert.match(modelSource('/api/model/gh/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm'), /^https:\/\/raw\.githubusercontent\.com\//);
  for (const bad of ['/api/model/hf/evil/repo/resolve/main/x.bin', '/api/model/hf/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/../../x', '/api/model/hf/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/other.gguf', '/api/model/gh/evil/x.wasm', '/api/model/gh/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/x.js', '/api/model/xx/a']) {
    assert.equal(modelSource(bad), null, bad);
  }
});
const { tidyDictation } = await import('../../src/lib/tidy.js');
await check('tidying dictation: no filler, one thing per line, planner times', () => {
  const out = tidyDictation('um so essay due friday at 5 p.m. hashtag english and then uh gym monday at 6 pm. also you know call mom sunday');
  assert.deepEqual(out.split('\n'), ['Essay due friday at 5pm #english', 'Gym monday at 6pm', 'Call mom sunday']);
});
await check('tidying keeps lines that are already clean', () => {
  assert.equal(tidyDictation('Essay due Fri 5pm #English\nGym MWF 6pm'), 'Essay due Fri 5pm #English\nGym MWF 6pm');
});
const { routeAll } = await import('../../src/lib/router.js');
await check('stopping dictation breaks a run-on ramble into separate things', () => {
  const said = 'um i need to finish the lab report by friday and call mom on sunday then gym monday wednesday at 6 pm also i want to run a 10k by march';
  const rows = routeAll(tidyDictation(splitSpoken(said).join('\n')));
  assert.equal(rows.length, 4, rows.map(r => r.text).join(' | '));
  assert.deepEqual(rows.map(r => r.dest), ['task', 'task', 'routine', 'goal']);
});
const breakDownRules = said => routeAll(tidyDictation(splitSpoken(said).join('\n')));
await check('one long recording becomes every separate thing, with courses and verbs carried', () => {
  const rows = breakDownRules('okay so for chemistry I have a lab report due Monday and a quiz on Wednesday and I need to finish the problem set by Friday then for history I have an essay due next Tuesday and a reading response tomorrow also call mom on Sunday and dad on Saturday gym every Monday and Wednesday at 6 pm number two pay rent on the 1st another thing buy groceries tomorrow and book a dentist appointment next week oh and I want to run a 10K by March plus meditate every morning at 7 and finally email professor Smith about the extension');
  assert.equal(rows.length, 14, rows.map(r => r.text).join(' | '));
  assert.deepEqual(rows.filter(r => /#chemistry/i.test(r.text)).length, 3, 'the course said once carries to each chemistry item');
  assert.ok(rows.some(r => /^Call dad on Saturday/i.test(r.text)), 'the verb carries: call dad');
  assert.equal(rows.filter(r => r.dest === 'routine').length, 2);
  assert.equal(rows.filter(r => r.dest === 'goal').length, 1);
});
await check('fifty assignments said in one breath become fifty tasks', () => {
  const subj = ['calculus', 'history', 'chemistry', 'english', 'spanish'], days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const said = Array.from({ length: 50 }, (_, k) => { const i = k + 1; return `${i % 3 === 0 ? 'and ' : ''}${['finish', 'submit', 'review', 'write', 'read'][i % 5]} ${subj[i % 5]} assignment ${i} due ${days[i % 5]}${i % 4 === 0 ? ' at 5 pm' : ''}`; }).join(' ');
  const rows = breakDownRules(said);
  assert.equal(rows.length, 50);
  assert.ok(rows.every((r, k) => new RegExp(`assignment ${k + 1}\\b`).test(r.text)), 'each one is its own task, in order');
});
await check('a spoken list of things due splits into one item each', () => {
  const rows = breakDownRules('I have an essay due Friday, a lab report due Monday and a quiz on Wednesday');
  assert.deepEqual(rows.map(r => r.task.title), ['Essay', 'Lab Report', 'Quiz']);
  assert.deepEqual(rows.map(r => r.task.kind), ['assignment', 'assignment', 'exam'], 'assignments and exams are recognised');
});
await check('it does not split what belongs together', () => {
  const rows = breakDownRules('call mom and dad tomorrow, meet Sam between 2 and 4 pm on Thursday, gym Monday and Wednesday, finish the first draft by Friday, book a table for next Tuesday');
  assert.deepEqual(rows.map(r => r.text), ['Call mom and dad tomorrow', 'Meet Sam between 2 and 4pm on Thursday', 'Gym Monday and Wednesday', 'Finish the first draft by Friday', 'Book a table for next Tuesday']);
});
const { itemLine } = await import('../../src/lib/itemline.js');
await check("Gemini's items become planner items with their kind, date, time, repeat and course", () => {
  const items = [
    { title: 'Lab report', kind: 'assignment', date: '2026-11-12', time: '17:00', minutes: 90, repeat: '', days: [], course: 'Chemistry' },
    { title: 'Midterm', kind: 'exam', date: '2026-11-16', time: '', minutes: 0, repeat: '', days: [], course: 'History' },
    { title: 'Gym', kind: 'routine', date: '', time: '18:00', minutes: 60, repeat: 'weekly', days: ['mon', 'wed', 'fri'], course: '' },
    { title: 'Read before bed', kind: 'routine', date: '', time: '22:00', minutes: 0, repeat: 'daily', days: [], course: '' },
    { title: 'Run a 10K', kind: 'goal', date: '2027-03-01', time: '', minutes: 0, repeat: '', days: [], course: '' },
    { title: 'Call mom', kind: 'task', date: '2026-11-15', time: '', minutes: 0, repeat: '', days: [], course: '' },
    { title: 'Piano lesson', kind: 'class', date: '', time: '16:00', minutes: 45, repeat: 'weekly', days: ['thu'], course: 'Music' },
  ];
  const rows = routeAll(items.map(itemLine).join('\n'));
  assert.equal(rows.length, 7, rows.map(r => r.text).join(' | '));
  const [lab, mid, gym, read, run, call, piano] = rows;
  assert.deepEqual([lab.dest, lab.task.title, lab.task.date, lab.task.time, lab.task.mins, lab.task.project, lab.task.kind], ['task', 'Lab Report', '2026-11-12', '17:00', 90, 'Chemistry', 'assignment']);
  assert.deepEqual([mid.task.title, mid.task.date, mid.task.kind, mid.task.project], ['Midterm', '2026-11-16', 'exam', 'History']);
  assert.deepEqual([gym.dest, gym.task.repeat?.days, gym.task.time], ['routine', [1, 3, 5], '18:00']);
  assert.deepEqual([read.dest, read.task.repeat?.every], ['routine', 'day']);
  assert.equal(run.dest, 'goal');
  assert.deepEqual([call.task.title, call.task.date], ['Call Mom', '2026-11-15']);
  assert.deepEqual([piano.dest, piano.task.repeat?.days, piano.task.project], ['routine', [4], 'Music'], 'one weekly day repeats too');
});
const { geminiSplit } = await import('../../worker/gemini.js');
await check('the Gemini answer is checked before it is used', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [
    { title: '<b>Essay</b>', kind: 'assignment', date: '2026-11-13', time: '17:00', minutes: 30, repeat: 'none', days: [], course: 'English' },
    { title: 'Gym', kind: 'workout', date: 'friday', time: '6pm', minutes: -5, repeat: 'weekly', days: ['mon', 'xyz', 'mon'], course: '' },
    { title: '', kind: 'task' },
  ] }) }] } }] }) });
  try {
    const items = await geminiSplit('k'.repeat(30), { text: 'essay due friday at 5 and gym mondays', today: '2026-11-08', weekday: 'Sunday', timeZone: 'UTC' });
    assert.equal(items.length, 2, 'items without a title are dropped');
    assert.deepEqual(items[0], { title: 'Essay', kind: 'assignment', date: '2026-11-13', time: '17:00', minutes: 30, repeat: '', days: [], course: 'English', priority: '', action: 'add', target: '' });
    assert.deepEqual(items[1], { title: 'Gym', kind: 'task', date: '', time: '', minutes: 0, repeat: 'weekly', days: ['mon'], course: '', priority: '', action: 'add', target: '' }, 'bad kinds, dates, times and days are cleaned');
  } finally { globalThis.fetch = realFetch; }
});
await check('assignments keep their full names, their dates and the right category', () => {
  const rows = breakDownRules('for chemistry I have Lab Report 3 Titration Analysis due November 14th at 11:59 pm and Problem Set 7 due the 18th. For history the essay on the French Revolution is due Friday the 21st. Hashtag calculus homework 5.2 and 5.3 due next Monday. English 101 reading response on chapter 4 of The Great Gatsby due tomorrow at noon. Psych midterm on December 2nd. Biology quiz 4 on cell respiration this Thursday hashtag bio');
  const got = rows.map(r => [r.task.title, r.task.date.slice(5), r.task.time, r.task.project, r.task.kind]);
  assert.deepEqual(got.map(g => g[0]), ['Lab Report 3 Titration Analysis', 'Problem Set 7', 'Essay On The French Revolution', 'Homework 5.2 And 5.3', 'English 101 Reading Response On Chapter 4 Of The Great Gatsby', 'Psych Midterm', 'Biology Quiz 4 On Cell Respiration']);
  assert.deepEqual(got.map(g => g[3]), ['Chemistry', 'Chemistry', 'History', 'Calculus', 'English 101', 'Psychology', 'Biology']);
  assert.deepEqual(got.map(g => g[4]), ['assignment', 'assignment', 'assignment', 'assignment', 'assignment', 'exam', 'exam']);
  assert.equal(got[0][1], '11-14'); assert.equal(got[0][2], '23:59');
  assert.equal(got[1][1].slice(3), '18', '"the 18th" is the 18th');
  assert.equal(got[2][1].slice(3), '21', '"Friday the 21st" is the 21st');
  assert.equal(got[5][1], '12-02');
});
await check('course codes, numeric dates, two-word subjects and spoken hashtags', () => {
  const rows = breakDownRules('MATH 201 problem set 9 due 11/20 at 9 am and the MATH 201 midterm is on the 3rd. CS 61A Project 2: Linked Lists due in two weeks hashtag computer science. Spanish oral presentation due end of the month. I also have a stats lab writeup due Wednesday at 5 pm, a reading quiz in econ on Friday, and an art history paper due December 10th at midnight');
  assert.deepEqual(rows.map(r => r.task.title), ['MATH 201 Problem Set 9', 'MATH 201 Midterm', 'CS 61A Project 2: Linked Lists', 'Spanish Oral Presentation', 'Stats Lab Writeup', 'Reading Quiz In Econ', 'Art History Paper']);
  assert.deepEqual(rows.map(r => r.task.project), ['MATH 201', 'MATH 201', 'Computer Science', 'Spanish', 'Statistics', 'Economics', 'Art History']);
  assert.deepEqual(rows.map(r => r.task.kind), ['assignment', 'exam', 'assignment', 'assignment', 'assignment', 'exam', 'assignment']);
  assert.equal(rows[0].task.date.slice(5), '11-20'); assert.equal(rows[0].task.time, '09:00');
  assert.equal(rows[1].task.date.slice(8), '03');
  assert.equal(rows[6].task.date.slice(5), '12-10'); assert.equal(rows[6].task.time, '23:59');
});
await check('a category you already use is kept, whatever the case or short form', () => {
  const saved = store.projects;
  store.projects = { Biology: { color: '#16a34a' }, 'CHEM 110': { color: '#7c3aed' } };
  try {
    const rows = breakDownRules('quiz on Friday hashtag bio. lab report due Monday #chem110. reading for biology tomorrow');
    assert.deepEqual(rows.map(r => r.task.project), ['Biology', 'CHEM 110', 'Biology']);
  } finally { store.projects = saved; }
});
await check('Gemini is given your categories and a checklist of what was said', async () => {
  const realFetch = globalThis.fetch;
  let sent = '';
  globalThis.fetch = async (url, opts) => { sent = JSON.parse(opts.body).contents[0].parts[0].text; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }] }) }; };
  try {
    await geminiSplit('k'.repeat(30), { text: 'lab report friday', today: '2026-11-08', weekday: 'Sunday', categories: ['Chemistry', 'CHEM 110'], hints: ['Lab report friday'] });
    assert.match(sent, /already uses these categories[^\n]*Chemistry, CHEM 110/);
    assert.match(sent, /checklist[\s\S]*- Lab report friday/);
    assert.match(sent, /FULL name exactly as said/);
    assert.match(sent, /Friday the 21st/);
  } finally { globalThis.fetch = realFetch; }
});
const { localLine, withKind, saidIn } = await import('../../src/lib/itemline.js');
await check('the on-device model\'s items: clear titles, its kinds kept, exact dates worked out by Taskie', () => {
  const said = 'for chemistry I have lab report 3 due friday at 5 pm and a quiz on the 18th, also need to call mom tomorrow, gym every monday and wednesday and I want to run a 10K by March';
  const items = [
    { title: 'Lab Report 3', kind: 'assignment', when: 'Friday', time: '5 pm', course: 'Chemistry' },
    { title: 'Quiz', kind: 'exam', when: 'the 18th', time: '', course: 'Chemistry' },
    { title: 'Call mom', kind: 'task', when: 'tomorrow', time: '', course: '' },
    { title: 'Gym', kind: 'routine', when: 'every Monday and Wednesday', time: '', course: '' },
    { title: 'Run a 10K', kind: 'goal', when: 'by March', time: '', course: '' },
    { title: 'Buy a new laptop', kind: 'task', when: '', time: '', course: '' },
  ];
  const real = saidIn(said);
  const ok = items.filter(x => real(x.title));
  assert.equal(ok.length, 5, 'an item that was never said is dropped');
  const rows = ok.map(x => withKind(route(localLine(x)), x.kind));
  assert.deepEqual(rows.map(r => r.dest), ['task', 'task', 'task', 'routine', 'goal']);
  assert.deepEqual(rows.slice(0, 4).map(r => r.task.title), ['Lab Report 3', 'Quiz', 'Call Mom', 'Gym']);
  assert.deepEqual(rows.slice(0, 2).map(r => [r.task.kind, r.task.project]), [['assignment', 'Chemistry'], ['exam', 'Chemistry']]);
  assert.equal(new Date(`${rows[0].task.date}T12:00`).getDay(), 5, 'Friday is worked out by Taskie');
  assert.equal(rows[0].task.time, '17:00');
  assert.equal(rows[1].task.date.slice(8), '18', '"the 18th" is the 18th');
  assert.deepEqual(rows[3].task.repeat?.days, [1, 3]);
});
await check('a kind the model decided wins over a guess from the words', () => {
  const r = withKind(route('Chemistry lab practical on Friday'), 'exam');
  assert.equal(r.task.kind, 'exam');
  const g = withKind(route('Read 24 books this year'), 'goal');
  assert.equal(g.dest, 'goal');
});
const { audioTypeOk } = await import('../../worker/gemini.js');
const { geminiCorrect, novaHear } = await import('../../worker/hear.js');
await check('Nova-3 hears the recording with keyterms; Gemini corrects it with the sound and the context', async () => {
  let novaIn = null;
  const env = { AI: { run: async (model, input) => { novaIn = { model, input }; return { results: { channels: [{ alternatives: [{ transcript: 'lab report three due friday for kem', confidence: 0.82, words: [{ word: 'kem', punctuated_word: 'kem', confidence: 0.31 }, { word: 'friday', confidence: 0.98 }] }] }] } }; } } };
  const nova = await novaHear(env, new Uint8Array([82, 73, 70, 70]), 'audio/wav', ['CHEM 110', 'Chemistry']);
  assert.equal(novaIn.model, '@cf/deepgram/nova-3');
  assert.equal(novaIn.input.audio.contentType, 'audio/wav', 'the audio goes as a body with its type');
  assert.match(novaIn.input.keyterm, /CHEM 110/, 'the person\'s words boost recognition');
  assert.equal(nova.text, 'lab report three due friday for kem');
  assert.deepEqual(nova.unsure, ['kem'], 'low-confidence words are flagged for Gemini');
  const realFetch = globalThis.fetch;
  let req = null;
  globalThis.fetch = async (url, opts) => { req = JSON.parse(opts.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ transcript: 'Lab report 3 due Friday for <b>chem</b>', items: [
    { title: 'Lab Report 3', kind: 'assignment', date: '2026-11-13', time: '25:00', minutes: 0, repeat: '', days: [], course: 'Chemistry' },
  ] }) }] } }] }) }; };
  try {
    const out = await geminiCorrect('k'.repeat(30), { audio: 'UklGRg==', mime: 'audio/wav', heard: nova.text, unsure: nova.unsure, today: '2026-11-08', weekday: 'Sunday', categories: ['Chemistry'], vocab: ['CHEM 110'] });
    const parts = req.contents[0].parts;
    assert.deepEqual(parts[0].inline_data, { mime_type: 'audio/wav', data: 'UklGRg==' }, 'Gemini listens to the recording too');
    assert.match(parts[1].text, /Nova-3[\s\S]*for kem[\s\S]*unsure of these words: kem/, 'with Nova-3\'s text and its unsure words');
    assert.match(parts[1].text, /CHEM 110/, 'and the person\'s own words');
    assert.ok(!/[<>]/.test(out.transcript), 'no markup comes back');
    assert.equal(out.items[0].time, '', 'an impossible time is dropped');
  } finally { globalThis.fetch = realFetch; }
  assert.ok(audioTypeOk('audio/wav') && audioTypeOk('audio/webm;codecs=opus') && audioTypeOk('audio/mp4'));
  assert.ok(!audioTypeOk('video/mp4') && !audioTypeOk('text/html'));
});
const { planFor } = await import('../../worker/push.js');
await check('push: a reminder 10 minutes before, once; nothing for done or pending things', async () => {
  const rows = [];
  const env = { DB: { prepare: sql => ({ bind: (...a) => ({ run: async () => { if (/INSERT OR IGNORE INTO notify_queue/.test(sql)) { const dup = rows.some(r => r[0] === a[0] && r[1] === a[1]); if (!dup) rows.push(a); return { meta: { changes: dup ? 0 : 1 } }; } return { meta: { changes: 0 } }; }, first: async () => null, all: async () => ({ results: [] }) }), run: async () => ({}) }), batch: async () => [] } };
  const tz = 'UTC';
  const d = new Date(); const day = d.toISOString().slice(0, 10);
  const at = new Date(d.getTime() + 7 * 60e3); const hhmm = `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
  if (at.toISOString().slice(0, 10) !== day) return; // too close to midnight to test today
  const data = { tasks: [
    { id: 'a', title: 'Chem Lab', date: day, time: hhmm },
    { id: 'b', title: 'Done Thing', date: day, time: hhmm, done: true },
    { id: 'c', title: 'Pending Thing', date: day, time: hhmm, pending: true },
    { id: 'e', title: 'Gym', date: '2020-01-01', time: hhmm, repeat: { every: 'day' } },
  ] };
  assert.equal(await planFor(env, 'u1', data, tz), 2, 'the lab and the daily gym');
  assert.ok(rows.every(r => /in \d+ min|Starting now/.test(r[3])));
  assert.equal(await planFor(env, 'u1', data, tz), 0, 'never twice');
});
const { geminiModel } = await import('../../worker/gemini.js');
await check('Gemini: the newest stable Flash the key can use is picked by itself', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-4.0-flash-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.10-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ] }) });
  try { assert.equal(await geminiModel('k'.repeat(30) + 'pick1234', { fresh: true }), 'gemini-3.8-flash'); } finally { globalThis.fetch = realFetch; }
});
const { ACCENTS, defaultAccent } = await import('../../src/lib/dictation.js');
await check('accents cover many kinds of English', () => {
  for (const c of ['en-US', 'en-GB', 'en-IN', 'en-NG', 'en-KE', 'en-ZA', 'en-AU']) assert.ok(ACCENTS.some(([x]) => x === c), c);
  assert.ok(ACCENTS.some(([x]) => x === defaultAccent()));
});
await check('said priority reaches the task, and stays out of the title', () => {
  const hi = p(itemLine({ title: 'Lab Report 3', kind: 'assignment', date: '2026-11-13', time: '17:00', minutes: 0, course: 'Chemistry', priority: 'high' }));
  assert.equal(hi.priority, 'high'); assert.equal(hi.title, 'Lab Report 3'); assert.equal(hi.project, 'Chemistry');
  const lo = p(localLine({ title: 'Take shirts to the dry cleaner', kind: 'task', when: '', time: '', course: '', priority: 'low' }));
  assert.equal(lo.priority, 'low'); assert.equal(lo.title, 'Take Shirts To The Dry Cleaner');
  const quick = p(itemLine({ title: 'Call Aunt Beate back', kind: 'task', date: '2026-11-08', time: '', minutes: 15, course: '' }));
  assert.equal(quick.mins, 15); assert.equal(quick.title, 'Call Aunt Beate Back');
});
await check('voice commands change what is planned; everything else is added', async () => {
  const { readCommand, pullCommands, listToTag } = await import('../../src/lib/commands.js');
  const keep = store.tasks;
  store.tasks = [makeTask({ title: 'Lab Report 3', kind: 'assignment', date: '2026-11-13', project: 'Chemistry' }), makeTask({ title: 'Call the dentist', date: '2026-11-09' }), makeTask({ title: 'Problem Set 7', kind: 'assignment' }), makeTask({ title: 'Problem Set 8', kind: 'assignment' })];
  assert.equal(readCommand('mark the lab report as done')?.act, 'done');
  assert.equal(readCommand('I finished lab report 3')?.task.title, 'Lab Report 3');
  assert.equal(readCommand('delete the dentist task')?.task.title, 'Call the dentist');
  const mv = readCommand('move lab report 3 to Friday');
  assert.equal(mv?.act, 'move'); assert.match(mv.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(readCommand('make problem set 7 high priority')?.priority, 'high');
  assert.equal(readCommand('mark problem set as done'), null, 'two tasks fit: not a command');
  assert.equal(readCommand('delete my old photos'), null, 'nothing planned by that name: not a command');
  assert.equal(readCommand('complete the problem set 7 by Friday'), null, '"complete X by Friday" is a new task, not a tick');
  const { cmds, rest } = pullCommands(['mark the lab report as done', 'essay due Friday', 'call John tomorrow at 3pm to my Work list']);
  assert.equal(cmds.length, 1); assert.equal(rest[0], 'essay due Friday'); assert.equal(rest[1], 'call John tomorrow at 3pm #Work');
  assert.equal(p(listToTag('prepare onboarding checklist on the Marketing board')).project, 'Marketing');
  store.tasks = keep;
});
await check("Taskie's server AI: the same instructions, and its answer checked", async () => {
  const { cloudSplit } = await import('../../worker/cloudai.js');
  let sent = null;
  const env = { AI: { run: async (model, input) => { sent = { model, input }; return { response: { items: [{ title: 'Lab Report 3', kind: 'assignment', date: '2026-11-13', time: '17:00', course: 'Chemistry', priority: 'high' }, { title: '<b>x</b>', kind: 'spaceship', date: 'soon', time: '25:00' }] } }; } } };
  const items = await cloudSplit(env, { text: 'lab report 3 due friday at 5 for chem, super important', today: '2026-11-08', weekday: 'Sunday', timeZone: 'UTC' });
  assert.match(sent.model, /llama-3\.3-70b/);
  assert.match(sent.input.messages[1].content, /Today is Sunday, 2026-11-08[\s\S]*lab report 3 due friday/);
  assert.equal(sent.input.response_format.type, 'json_schema');
  assert.equal(items[0].title, 'Lab Report 3'); assert.equal(items[0].priority, 'high');
  assert.deepEqual([items[1].kind, items[1].date, items[1].time], ['task', '', ''], 'bad kinds, dates and times are cleaned');
  const str = await cloudSplit({ AI: { run: async () => ({ response: 'Sure! {"items": [{"title": "Gym", "kind": "routine"}]}' }) } }, { text: 'gym', today: '2026-11-08', weekday: 'Sunday' });
  assert.equal(str[0].title, 'Gym', 'JSON inside text is read too');
  await assert.rejects(cloudSplit({}, { text: 'x', today: '2026-11-08' }), /not set up/);
});

// ---------- titles: Title Case, emojis, spoken punctuation, what is not a task ----------
{
  const { titleCase, spokenMarks, isNotTask } = await import('../../src/lib/titles.js');
  await check('titles: a capital at the start of every word', () => {
    assert.equal(titleCase('call mom about the trip'), 'Call Mom About The Trip');
    assert.equal(titleCase('follow-up with dr. lee'), 'Follow-Up With Dr. Lee');
    assert.equal(titleCase("mom's birthday"), "Mom's Birthday");
    assert.equal(titleCase('buy iPhone case for CS61A'), 'Buy iPhone Case For CS61A');
    assert.equal(titleCase('read chapter 7 #biology'), 'Read Chapter 7 #biology');
    assert.equal(p('lab report 3 due fri 5pm').title, 'Lab Report 3');
    assert.equal(p('call mom tomorrow').title, 'Call Mom');
  });
  await check('titles: emojis are kept', () => {
    assert.equal(titleCase('📚 read chapter 3'), '📚 Read Chapter 3');
    assert.equal(p('🏋️ gym every monday 6pm').title, '🏋️ Gym');
    assert.equal(p('essay 🔥 due fri').title, 'Essay 🔥');
    assert.equal(spokenMarks('party for jo party emoji'), 'party for jo 🎉');
    assert.equal(spokenMarks('study for the quiz emoji of a book'), 'study for the quiz 📚');
  });
  await check('spoken punctuation becomes the mark', () => {
    assert.equal(spokenMarks('call mom comma dad and grandma period'), 'call mom, dad and grandma.');
    assert.equal(spokenMarks('buy milk full stop gym at six'), 'buy milk. gym at six');
    assert.equal(spokenMarks('is the quiz on friday question mark'), 'is the quiz on friday?');
    assert.equal(spokenMarks('groceries colon eggs comma bread'), 'groceries: eggs, bread');
    assert.equal(spokenMarks('essay new line quiz monday'), 'essay\nquiz monday');
  });
  await check('spoken punctuation: a class period stays a word', () => {
    assert.equal(spokenMarks('math in third period'), 'math in third period');
    assert.equal(spokenMarks('study in my free period'), 'study in my free period');
    assert.equal(spokenMarks('cancel before the trial period ends'), 'cancel before the trial period ends');
    assert.equal(spokenMarks('get a quote from the plumber'), 'get a quote from the plumber');
  });
  await check('what is not a task is left out', () => {
    for (const x of ['okay', 'Um, so.', 'Thank you!', 'testing testing', 'Can you hear me?', "That's it.", 'okay okay', '[Music]', '🎉', '...']) assert.ok(isNotTask(x), x);
    for (const x of ['Gym', 'Call mom', 'Essay due Friday', 'Test on Friday', 'Thank-you card for Jo', '📚 Read chapter 3']) assert.ok(!isNotTask(x), x);
  });
}

// ---------- hearing well: no repeats, learned words, run-on lists, syllabus titles ----------
{
  const { unloop, newWords, applyVocab, learnCorrections, tidyTitle, isNotTask } = await import('../../src/lib/titles.js');
  const { splitSpoken, routeAll } = await import('../../src/lib/router.js');
  await check('nothing is written twice', () => {
    assert.equal(unloop('I need to I need to finish the essay the essay today'), 'I need to finish the essay today');
    assert.equal(newWords('Essay due Friday at 5. Gym on Monday', 'Gym on Monday at 6. Call mom tomorrow.'), 'at 6. Call mom tomorrow.');
    assert.equal(newWords('Essay due Friday at 5. Gym on Monday at 6.', 'Essay due Friday at 5.'), '');
    assert.equal(newWords('', 'Call mom'), 'Call mom');
  });
  await check('your corrections become words Taskie knows', () => {
    assert.deepEqual(learnCorrections('call grace in kegali about the itd f project', 'Call Grace in Kigali about the ITDF project'), [{ heard: 'kegali', word: 'Kigali' }, { heard: 'itd f', word: 'ITDF' }]);
    assert.equal(applyVocab('meeting in kegali about itd f', [{ heard: 'kegali', word: 'Kigali' }, { heard: 'itd f', word: 'ITDF' }]), 'meeting in Kigali about ITDF');
  });
  await check('a run-on list of assignments splits at each due date', () => {
    const said = 'Work on A paper of English due Friday Consuming cultures paper due December 15 globalization and social change paper due December 15 Reading for history of Southeast Asia due Tuesday Project for ITD completion';
    const r = routeAll(splitSpoken(said).join('\n'));
    assert.deepEqual(r.map(x => x.task.title), ['English Paper', 'Consuming Cultures Paper', 'Globalization And Social Change Paper', 'Reading For History Of Southeast Asia', 'ITD Completion Project']);
    assert.deepEqual(splitSpoken('Lab report due Friday at 5pm for chemistry and a quiz on Monday'), ['Lab report due Friday at 5pm for chemistry', 'quiz on Monday']);
  });
  await check('titles read like a syllabus', () => {
    assert.equal(tidyTitle('a paper of English'), 'English paper');
    assert.equal(tidyTitle('work on the essay for history'), 'history essay');
    assert.equal(tidyTitle('Call mom'), 'Call mom');
  });
  await check('fragments that are not tasks are dropped', () => {
    for (const x of ['and then the', 'on Friday', 'so it was like', 'um so yeah']) assert.ok(isNotTask(x), x);
    for (const x of ['Gym', 'Essay due Friday', 'Call Grace in Kigali']) assert.ok(!isNotTask(x), x);
  });
}
console.log(`\n${n} checks passed`);
