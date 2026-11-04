// Turn messy planning notes into organised plan items.
// "rent 1450, groceries maybe 400, netflix 15.49, save 3000 for japan by june, salary 4700"
import { guessCategory } from './categorize';
import { matchMerchant } from '../data/directory';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const GROUPS = ['Income', 'Needs', 'Wants', 'Savings', 'Goals'];
const NEEDS = /rent|mortgage|grocer|supermarket|utilit|electric|water|power|internet|phone|insurance|loan|debt|tuition|school|childcare|medic|pharmacy|transport|fuel|gas|commute|bus|train|car payment/i;
// Savings: money set aside on a schedule. Goals: a target, usually by a date.
const SAVING = /\bsave\b|saving|emergency|fund|invest|retire|pension|rainy day|cushion/i;
const GOAL = /\bgoal\b|trip|vacation|holiday|travel|laptop|phone|car\b|wedding|house|home|deposit for|down payment|tuition|course|gift|new\b|buy\b/i;
const INCOME = /salary|income|paycheck|pay\b|wage|freelance|side hustle|bonus|allowance|stipend/i;
const FILLER = /\b(maybe|about|around|roughly|approx(imately)?|per|a|an|the|each|every|for|on|of|to|in|by|my|usd|dollars?|monthly|month|weekly|week|daily|day|yearly|year|annual(ly)?|once|one-off|budget)\b/gi;

const newId = () => Math.random().toString(36).slice(2, 9);

function monthsUntil(name) {
  const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  if (i < 0) return null;
  const now = new Date();
  let m = i - now.getMonth();
  if (m <= 0) m += 12;
  return m;
}

export function parseChunk(raw) {
  const text = raw.trim();
  if (!text) return null;
  const num = text.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i);
  const amount = num ? Number(num[1].replace(/,/g, '')) * (num[2] ? 1000 : 1) : null;
  let cadence = 'monthly';
  if (/year|annual|\/yr|p\.a\./i.test(text)) cadence = 'yearly';
  else if (/week/i.test(text)) cadence = 'weekly';
  else if (/\bday\b|daily/i.test(text)) cadence = 'daily';
  else if (/once|one-off|one time/i.test(text)) cadence = 'once';

  const by = text.match(/\bby\s+([A-Za-z]{3,9})/);
  const months = by ? monthsUntil(by[1]) : null;
  const kind = INCOME.test(text) ? 'income' : (GOAL.test(text) && (SAVING.test(text) || by)) || (SAVING.test(text) && by) ? 'goal' : SAVING.test(text) ? 'saving' : 'expense';

  let label = text.replace(num ? num[0] : '', ' ').replace(by ? by[0] : '', ' ').replace(FILLER, ' ').replace(/[^\w&'’+ .-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (kind === 'goal' || kind === 'saving') label = label.replace(/^(save|saving|savings)\s+/i, '');
  if (!label) label = kind === 'income' ? 'Income' : 'Item';
  label = label.charAt(0).toUpperCase() + label.slice(1);
  const known = matchMerchant(label);
  if (known) label = known.name;

  let monthly = amount;
  if (amount !== null) {
    if (cadence === 'yearly') monthly = amount / 12;
    if (cadence === 'weekly') monthly = (amount * 52) / 12;
    if (cadence === 'daily') monthly = amount * 30.4;
    if (kind === 'goal' && months) monthly = amount / months;
    if (cadence === 'once' && kind !== 'goal') monthly = amount / 12;
  }
  const category = kind === 'income' ? 'Income' : kind === 'goal' ? 'Goal' : kind === 'saving' ? 'Savings' : known ? known.category : guessCategory(label, -1);
  const group = kind === 'income' ? 'Income' : kind === 'goal' ? 'Goals' : kind === 'saving' ? 'Savings' : NEEDS.test(text) || ['Housing', 'Health'].includes(category) ? 'Needs' : 'Wants';
  return {
    id: newId(), label, amount, cadence, monthly: monthly === null ? null : Math.round(monthly * 100) / 100,
    group, category, target: kind === 'goal' ? amount : null, months: kind === 'goal' ? months : null,
    domain: known?.domain || '', source: text,
  };
}

export function organize(text) {
  return String(text)
    .split(/\n|;|,(?!\d{3}\b)|\s+\band\b\s+|•|•/)
    .map(parseChunk)
    .filter(Boolean);
}

export const EXAMPLE = `salary 4700
rent 1450, internet 60, phone 45
groceries maybe 400 a month
uber about 25 a week
netflix 15.49, spotify 10.99, github 4
coffee 5 a day
car insurance 1200 a year
gym 40
save 3000 for japan trip by june
emergency fund 200 monthly`;
