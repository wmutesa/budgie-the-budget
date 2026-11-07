// Savings numbers and ideas from your own data, used on the Markets page.
// Rates are on each bank's page because they change daily.
import { computed } from 'vue';
import { BANKS } from '../data/banks';
import { store } from './store';
import { surplus, pace } from './advice';
import { accountTotal } from './ledger';

const usd = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const emergency = computed(() => store.goals.find(g => /emergency|cushion|rainy/i.test(g.name)) || store.goals[0] || null);
const monthlySpend = computed(() => Math.max(pace.value.projected, 1));
export const cushionMonths = computed(() => (emergency.value && pace.value.spent >= 1 ? emergency.value.saved / monthlySpend.value : null));

// "Your money today": three numbers, or null when there is nothing to base them on.
export const moneyToday = computed(() => ({
  netWorth: store.balances.length ? accountTotal.value : null,
  cushion: cushionMonths.value,
  toInvest: pace.value.income > 0 ? Math.max(0, Math.round(surplus.value)) : null,
}));

// One plain-language suggestion from your own numbers.
export const savingsAdvice = computed(() => {
  if (!emergency.value) return 'Start with a cushion: add an emergency fund goal on the Overview page. Three months of spending is a common target before investing.';
  if (cushionMonths.value === null) return `${emergency.value.name} holds ${usd(emergency.value.saved)}. Once you add some spending, Budgie can tell you how many months it would cover.`;
  const months = cushionMonths.value;
  const spare = Math.round(surplus.value / 10) * 10;
  if (months < 1) return `Your cushion covers ${months.toFixed(1)} months of spending. Build it first: ${spare > 0 ? `moving ${usd(spare / 2)} a month into savings` : 'even a small automatic transfer'} gets you to a full month fastest.`;
  if (months < 3) return `Your cushion covers ${months.toFixed(1)} months. Keep adding to savings until it reaches 3, then consider a CD for part of it.`;
  return `Your cushion covers ${months.toFixed(1)} months, so investing a fixed amount each month is a reasonable next step.`;
});

// Ideas for each bank you use.
export const savingsIdeas = computed(() => store.banks.filter(id => BANKS[id]).flatMap(id => {
  const bank = BANKS[id];
  const save = Math.round(surplus.value / 2 / 10) * 10;
  const months = cushionMonths.value ?? 0;
  return bank.products.map(p => {
    if (p.kind === 'savings') return { bank, p, kind: 'savings', title: save > 0 ? `Move ${usd(save)} a month to ${p.name}` : `Open ${p.name} for your cushion`, body: save > 0 ? 'Half of what income is ahead of spending this month.' : 'Start small; any amount builds the habit.' };
    if (p.kind === 'cds') return { bank, p, kind: 'cds', title: `Lock part of your cushion in ${p.name}`, body: emergency.value ? `${emergency.value.name} holds ${usd(emergency.value.saved)}. A CD suits money you will not touch for months.` : 'Good for money you will not need soon.' };
    return { bank, p, kind: 'invest', title: months >= 3 ? `Start investing with ${p.name}` : 'Build 3 months of cushion before investing', body: months >= 3 ? `Your cushion covers about ${months.toFixed(1)} months of spending.` : `Your cushion covers about ${months.toFixed(1)} months. Aim for 3 before ${p.name}.` };
  });
}));

// Whether US markets are open now (New York time, weekdays 9:30 to 4:00; holidays not counted).
export function marketStatus(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false })
    .formatToParts(now).map(p => [p.type, p.value]));
  const mins = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const weekday = !['Sat', 'Sun'].includes(parts.weekday);
  const open = 9 * 60 + 30, close = 16 * 60;
  const span = m => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  if (weekday && mins >= open && mins < close) return { open: true, text: `US markets open · close in ${span(close - mins)}` };
  if (weekday && mins < open) return { open: false, text: `US markets closed · open in ${span(open - mins)}` };
  return { open: false, text: 'US markets closed · open next weekday at 9:30 AM New York time' };
}
