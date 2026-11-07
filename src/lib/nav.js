// Which page is open, so any part of the app can send you somewhere: a page,
// a part of a page (#goals), or one Planner item to open.
import { reactive } from 'vue';

export const PAGES = ['Today', 'Planner', 'Digests', 'Playground'];
export const nav = reactive({ page: 'Today', anchor: '', task: '' });
export const go = (page, { anchor = '', task = '' } = {}) => {
  if (!PAGES.includes(page)) return;
  Object.assign(nav, { page, anchor, task });
};
