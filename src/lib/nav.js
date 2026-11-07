// Which page is open, so any part of the app can send you somewhere.
import { reactive } from 'vue';

export const PAGES = ['Overview', 'Planner', 'Transactions', 'Markets', 'Playground'];
export const nav = reactive({ page: 'Overview' });
export const go = page => { if (PAGES.includes(page)) nav.page = page; };
