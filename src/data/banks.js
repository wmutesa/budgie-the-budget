// Banks Budgie can point you to. Add a bank by adding an entry here.
// Rates change often, so Budgie links to each bank's own page instead of
// quoting a rate it cannot verify.
export const BANKS = {
  chase: {
    name: 'Chase',
    domain: 'chase.com',
    products: [
      { kind: 'savings', name: 'Chase Savings', url: 'https://www.chase.com/personal/savings' },
      { kind: 'cds', name: 'Chase CDs', url: 'https://www.chase.com/personal/savings/cds' },
      { kind: 'investing', name: 'J.P. Morgan Self-Directed Investing', url: 'https://www.chase.com/personal/investments/online-investing' },
    ],
  },
  bofa: {
    name: 'Bank of America',
    domain: 'bankofamerica.com',
    products: [
      { kind: 'savings', name: 'Advantage Savings', url: 'https://www.bankofamerica.com/deposits/savings/savings-accounts/' },
      { kind: 'cds', name: 'Bank of America CDs', url: 'https://www.bankofamerica.com/deposits/bank-cds/cd-accounts/' },
      { kind: 'investing', name: 'Merrill Edge Self-Directed', url: 'https://www.merrilledge.com/investment-products/online-investing' },
    ],
  },
};
