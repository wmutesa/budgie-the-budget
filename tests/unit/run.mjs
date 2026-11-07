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
const check = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
// Saturday 7 November 2026, 9 AM.
const NOW = new Date(2026, 10, 7, 9, 0);
const p = s => parseTask(s, NOW);

check('a deadline with a day, time, project and priority', () => {
  const t = p('Essay 2 due fri 5pm #english !');
  assert.equal(t.title, 'Essay 2');
  assert.equal(t.date, '2026-11-13');
  assert.equal(t.time, '17:00');
  assert.equal(t.project, 'English');
  assert.equal(t.priority, 'high');
  assert.equal(t.kind, 'assignment');
});
check('tomorrow, tonight and in N days', () => {
  assert.equal(p('call mom tomorrow').date, '2026-11-08');
  const tn = p('finish slides tonight');
  assert.equal(tn.date, '2026-11-07'); assert.equal(tn.time, '20:00');
  assert.equal(p('dentist in 3 days at 2:30pm').date, '2026-11-10');
  assert.equal(p('dentist in 3 days at 2:30pm').time, '14:30');
});
check('month names and numeric dates', () => {
  assert.equal(p('Midterm nov 20 10am').date, '2026-11-20');
  assert.equal(p('Midterm nov 20 10am').kind, 'exam');
  assert.equal(p('flight 12/18').date, '2026-12-18');
  assert.equal(p('renew passport 3 jan').date, '2027-01-03', 'a past month means next year');
});
check('repeats: daily, MWF, weekdays, 3x a week, sundays', () => {
  const g = p('gym 3x a week 6pm');
  assert.deepEqual(g.repeat, { every: 'week', days: [1, 3, 5] }); assert.equal(g.time, '18:00'); assert.equal(g.title, 'Gym'); assert.equal(g.kind, 'routine');
  const c = p('Chem lecture MWF 10-12');
  assert.deepEqual(c.repeat.days, [1, 3, 5]); assert.equal(c.time, '10:00'); assert.equal(c.mins, 120); assert.equal(c.kind, 'class');
  assert.equal(p('shower every day 7:15am').repeat.every, 'day');
  assert.equal(p('standup weekdays 9am').repeat.every, 'weekdays');
  assert.deepEqual(p('call friends sundays').repeat, { every: 'week', days: [0] });
  assert.deepEqual(p('piano every tue and thu at 4').repeat.days, [2, 4]);
});
check('costs and durations', () => {
  const t = p('haircut sat $25 for 45 min');
  assert.equal(t.cost, 25); assert.equal(t.mins, 45); assert.equal(t.title, 'Haircut');
  assert.equal(t.date, '2026-11-07');
});
check('plain words are not mistaken for dates', () => {
  const t = p('Read chapter 3 of the sun also rises');
  assert.equal(t.date, ''); assert.equal(t.time, '');
});
check('repeats, streaks and money from ticking', () => {
  const today = isoDay();
  const t = makeTask({ title: 'Gym', repeat: { every: 'day' }, date: addDays(today, -5) });
  assert.ok(occursOn(t, today));
  toggleDone(t, addDays(today, -2)); toggleDone(t, addDays(today, -1)); toggleDone(t, today);
  assert.equal(streak(t), 3);
  const w = makeTask({ title: 'Class', repeat: { every: 'week', days: [1, 3] }, date: '2026-11-02' });
  assert.ok(occursOn(w, '2026-11-04')); assert.ok(!occursOn(w, '2026-11-05'));
  const paid = makeTask({ title: 'Haircut', cost: 25 });
  store.tasks.push(paid);
  toggleDone(paid);
  assert.equal(store.drafts[0].amount, -25, 'a task with a cost becomes an entry to review');
  toggleDone(paid); toggleDone(paid);
  assert.equal(store.drafts.filter(d => d.merchant === 'Haircut').length, 1, 'only once');
});
check('overdue and due-today work comes first', () => {
  const today = isoDay();
  assert.ok(score(makeTask({ date: addDays(today, -1) })) > score(makeTask({ date: addDays(today, 5), priority: 'high' })));
});
check('a routine from wake, sleep and a few words', () => {
  const r = buildRoutine({ wake: '06:30', sleep: '22:30', text: 'gym 3x a week at 6pm, call friends sundays' });
  assert.equal(r[0].title, 'Wake up'); assert.equal(r[0].time, '06:30');
  assert.ok(r.find(i => i.title === 'Gym' && i.time === '18:00'));
  assert.ok(r.find(i => i.title === 'Sleep' && i.time === '22:30'));
});

const ICS = `BEGIN:VCALENDAR\r\nX-WR-CALNAME:Fall courses\r\nBEGIN:VEVENT\r\nUID:event-assignment-1\r\nDTSTART;VALUE=DATE:20261113\r\nSUMMARY:Essay 2 [ENGL 101 Fall 2026]\r\nURL:https://school.instructure.com/courses/1/assignments/2\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:lec-1\r\nDTSTART;TZID=America/New_York:20261102T100000\r\nDTEND;TZID=America/New_York:20261102T111500\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261215T000000Z\r\nSUMMARY:Chemistry lecture\r\nLOCATION:Hall\\, Room 2\r\nDESCRIPTION:Bring a long\r\n  note\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:old\r\nDTSTART:20200101T100000Z\r\nSUMMARY:Long gone\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:20261120T150000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Cancelled\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
check('iCal: events, time zones, repeats, folded lines; old and cancelled ones skipped', () => {
  const { name, events } = parseIcs(ICS, NOW.getTime());
  assert.equal(name, 'Fall courses');
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].start, { date: '2026-11-13' });
  assert.equal(events[1].start.at, '2026-11-02T15:00:00.000Z', '10:00 in New York is 15:00 UTC in November');
  assert.deepEqual(events[1].repeat, { every: 'week', days: [1, 3, 5], until: '2026-12-15', count: null });
  assert.equal(events[1].location, 'Hall, Room 2');
  assert.equal(events[1].notes, 'Bring a long note');
});
check('iCal: Canvas items become assignments with the course as project', () => {
  const { events } = parseIcs(ICS, NOW.getTime());
  const t = eventToTask(events[0], { kind: 'canvas' });
  assert.equal(t.title, 'Essay 2'); assert.equal(t.project, 'ENGL 101'); assert.equal(t.kind, 'assignment'); assert.equal(t.date, '2026-11-13');
  const c = eventToTask(events[1], { kind: 'google' });
  assert.equal(c.kind, 'class'); assert.equal(c.mins, 75); assert.deepEqual(c.repeat.days, [1, 3, 5]);
});
check('iCal: syncing again updates, keeps your ticks and removes what left', () => {
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
check('calendar links: only public https addresses', () => {
  assert.equal(checkFeedUrl('webcal://p01-caldav.icloud.com/published/2/abc').protocol, 'https:');
  for (const bad of ['http://example.com/a.ics', 'https://localhost/a.ics', 'https://127.0.0.1/a.ics', 'https://[::1]/a.ics', 'https://user:pw@example.com/a.ics', 'https://example.com:8080/a.ics', 'https://printer.local/a.ics', 'file:///etc/passwd', 'javascript:alert(1)']) {
    assert.throws(() => checkFeedUrl(bad), undefined, bad);
  }
  assert.equal(feedKind('https://school.instructure.com/feeds/calendars/user_x.ics'), 'canvas');
  assert.equal(feedKind('https://calendar.google.com/calendar/ical/x/private-y/basic.ics'), 'google');
  assert.equal(feedKind('https://outlook.office365.com/owa/calendar/x/reachcalendar.ics'), 'outlook');
});
const { route, splitSpoken, routeSpoken } = await import('../../src/lib/router.js');
check('the Playground inbox sends each line where it belongs', () => {
  const to = t => route(t).dest.sort().join('+');
  assert.equal(to('Essay due Fri 5pm #English'), 'planner');
  assert.equal(to('spent 12.50 on lunch at Chipotle yesterday'), 'money');
  assert.equal(to('salary 4000 a month'), 'plan');
  assert.equal(to('gym MWF 6pm'), 'planner');
  const bill = route('pay phone bill $45 on the 15th');
  assert.equal(bill.dest.join(), 'planner'); assert.equal(bill.task.cost, 45, 'a bill to pay keeps its cost');
  assert.equal(to('call mom'), 'planner');
  assert.equal(to('netflix 15.49'), 'plan');
  assert.equal(to('groceries maybe 400'), 'plan');
  assert.equal(to('save 1200 for laptop by june'), 'plan');
  assert.equal(to('rent 1500'), 'plan');
});
check('speech is split into separate things', () => {
  assert.deepEqual(splitSpoken('essay due friday at 5pm then spent 9 on coffee yesterday and remind me to call mom and dad tomorrow'),
    ['essay due friday at 5pm', 'spent 9 on coffee yesterday', 'call mom and dad tomorrow']);
  assert.deepEqual(splitSpoken('Gym on Monday. Salary 4000 a month'), ['Gym on Monday', 'Salary 4000 a month']);
  assert.deepEqual(routeSpoken('rent 1500 and spent 20 on lunch today').map(r => r.dest.join()), ['plan', 'money']);
});
const { modelSource } = await import('../../worker/models.js');
check('model downloads: only the exact files Budgie uses', () => {
  assert.equal(modelSource('/api/model/hf/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/params_shard_0.bin'), 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/params_shard_0.bin');
  assert.equal(modelSource('/api/model/hf/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf'), 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf');
  assert.match(modelSource('/api/model/gh/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm'), /^https:\/\/raw\.githubusercontent\.com\//);
  for (const bad of ['/api/model/hf/evil/repo/resolve/main/x.bin', '/api/model/hf/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/../../x', '/api/model/hf/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/other.gguf', '/api/model/gh/evil/x.wasm', '/api/model/gh/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/x.js', '/api/model/xx/a']) {
    assert.equal(modelSource(bad), null, bad);
  }
});
console.log(`\n${n} checks passed`);
