// Which page is open, so any part of the app can send you somewhere: a page,
// a part of a page (#calendars), or one item to open on its day.
import { reactive } from 'vue';
import { store } from './store';

export const PAGES = ['Overview', 'Schedule', 'Focus', 'Reports'];
export const nav = reactive({ page: 'Overview', anchor: '', task: '', day: '' });
// "Planner" was the Schedule's old name; links that still use it land there.
export const go = (page, { anchor = '', task = '' } = {}) => {
  if (page === 'Planner') page = 'Schedule';
  if (!PAGES.includes(page)) return;
  // Opening one item: show its day, on the day view, and open it there.
  if (task) {
    const t = store.tasks.find(x => x.id === task);
    if (t) { store.planner.cal = 'day'; nav.day = t.repeat || !t.date ? '' : t.date; }
  }
  Object.assign(nav, { page, anchor, task });
};
