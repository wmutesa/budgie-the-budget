// Dummy data for development. It mirrors the shape the real data will have,
// so the screens can be checked under realistic numbers before live data exists.

export const accounts = [
  { id: 'checking', name: 'My balance', sub: 'Wallet overview & spending', balance: 20520.32, change: 1.5 },
  { id: 'savings', name: 'Savings account', sub: 'Steady growth savings', balance: 15800.45, change: 3.2 },
  { id: 'invest', name: 'Investment portfolio', sub: 'Track your wealth growth', balance: 50120.78, change: 4.7 },
];

export const wallets = [
  { code: 'USD', name: 'US Dollar', balance: 22678.0, limit: '$10k a month', status: 'Active' },
  { code: 'EUR', name: 'Euro', balance: 18345.0, limit: '€8k a month', status: 'Active' },
  { code: 'GBP', name: 'British Pound', balance: 15000.0, limit: '£7.5k a month', status: 'Inactive' },
  { code: 'BDT', name: 'Bangladeshi Taka', balance: 122678.0, limit: '৳10k a month', status: 'Active' },
];

// Twelve months of cash flow.
export const cashFlow = [
  { m: 'Jan', income: 21400, expense: 14200 },
  { m: 'Feb', income: 19800, expense: 15100 },
  { m: 'Mar', income: 26300, expense: 16900 },
  { m: 'Apr', income: 24100, expense: 13800 },
  { m: 'May', income: 22900, expense: 15600 },
  { m: 'Jun', income: 25700, expense: 14400 },
  { m: 'Jul', income: 27200, expense: 17300 },
  { m: 'Aug', income: 23600, expense: 16100 },
  { m: 'Sep', income: 25100, expense: 15800 },
  { m: 'Oct', income: 28400, expense: 18200 },
  { m: 'Nov', income: 26900, expense: 16700 },
  { m: 'Dec', income: 30100, expense: 19400 },
];

export const spending = [
  { name: 'House rent', amount: 2000, color: '#7c3aed' },
  { name: 'Food & dining', amount: 1500, color: '#16a34a' },
  { name: 'Transport', amount: 640, color: '#2563eb' },
  { name: 'Others', amount: 800, color: '#db2777' },
];

export const goals = [
  { name: 'Emergency fund', saved: 7200, target: 10000, color: '#db2777' },
  { name: 'Europe vacation', saved: 1400, target: 5000, color: '#16a34a' },
  { name: 'Tesla Model 3', saved: 13500, target: 30000, color: '#2563eb' },
];

export const budgets = [
  { name: 'Housing', budget: 2000, color: '#7c3aed' },
  { name: 'Food & dining', budget: 600, color: '#16a34a' },
  { name: 'Transport', budget: 300, color: '#2563eb' },
  { name: 'Shopping', budget: 250, color: '#db2777' },
  { name: 'Entertainment', budget: 150, color: '#d97706' },
  { name: 'Health', budget: 120, color: '#0891b2' },
];

// Top merchants over the last three months.
export const merchants = [
  { name: 'Rent share', total: 4350, count: 3 },
  { name: 'Mechanical keyboard', total: 498, count: 2 },
  { name: 'Textbook', total: 424, count: 2 },
  { name: 'Trader Joe’s', total: 259.2, count: 3 },
  { name: 'Uniqlo', total: 236, count: 2 },
];

// Sample transactions dated relative to today, so the current month always has data.
export function sampleTransactions() {
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const rows = [
    [0, 'Trader Joe’s', -86.4, 'Food & dining'],
    [1, 'Metro top-up', -64, 'Transport'],
    [2, 'Rent share', -1450, 'Housing'],
    [2, 'Uniqlo', -118, 'Shopping'],
    [3, 'Payroll · Employer', 2350, 'Income'],
    [4, 'Chipotle', -42.1, 'Food & dining'],
    [5, 'Pharmacy', -57.3, 'Health'],
    [6, 'Cinema', -28, 'Entertainment'],
    [8, 'Amazon', -168, 'Shopping'],
    [9, 'Groceries', -64.9, 'Food & dining'],
  ];
  return rows.map(([n, merchant, amount, category], i) => ({
    id: `s${i}`, date: day(n), merchant, amount, currency: 'USD', category, source: 'sample', domain: '', logo: null,
  }));
}
