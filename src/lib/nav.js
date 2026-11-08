// Which page is open, so any part of the app can send you somewhere: a page,
// a part of a page (#calendars), or one item to open on its day.
import { reactive } from 'vue';
import { store } from './store';

// The pages in the top bar; Settings and Privacy open from the avatar menu.
export const PAGES = ['Overview', 'Schedule'];
export const ALL_PAGES = [...PAGES, 'Settings', 'Privacy'];
export const nav = reactive({ page: 'Overview', anchor: '', task: '', day: '' });
// "Planner" was the Schedule's old name; links that still use it land there.
export const go = (page, { anchor = '', task = '' } = {}) => {
  if (page === 'Planner') page = 'Schedule';
  // Progress lives at the bottom of the Overview now.
  if (page === 'Reports' || page === 'Progress') { page = 'Overview'; anchor = anchor || '#progress'; }
  if (page === 'Focus') page = 'Schedule'; // Focus is now Lock In, on every activity
  if (page === 'Account' || page === 'Profile') page = 'Settings';
  if (!ALL_PAGES.includes(page)) return;
  // Opening one item: show its day, on the day view, and open it there.
  if (task) {
    const t = store.tasks.find(x => x.id === task);
    if (t) { store.planner.cal = 'day'; nav.day = t.repeat || !t.date ? '' : t.date; }
  }
  Object.assign(nav, { page, anchor, task });
};
