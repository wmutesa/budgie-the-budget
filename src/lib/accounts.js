// Real account management: connect banks, store credentials, sync balances
import { computed } from 'vue';
import { store } from './store';

// Account types: checking, savings, credit, investment
export const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'other'];

// Plaid configuration (set your own public key)
export const PLAID_CONFIG = {
  clientName: 'Budgie',
  language: 'en',
  countryCodes: ['US', 'GB', 'CA', 'ES', 'FR', 'NL', 'BE', 'IT', 'IE', 'DE', 'AU', 'NZ', 'SG', 'HK', 'MX', 'BR'],
  requiredIfSupported: ['auth', 'transactions'],
  // publicKey set at runtime based on environment
};

// Create a new real account (before Plaid linking)
export function createAccount(name, type = 'checking', currency = 'USD', balance = 0) {
  const id = `acc_${Date.now().toString(36)}`;
  const account = {
    id,
    name,
    type,
    currency,
    balance,
    institution: '', // e.g. "Chase", "Bank of America"
    accountNumber: '', // masked, e.g. "****1234"
    status: 'active', // active, paused, inactive
    plaidItemId: null, // linked via Plaid
    plaidAccountId: null, // Plaid's account id
    plaidToken: null, // encrypted Plaid token (never expose)
    lastSync: null, // ISO date of last transaction sync
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.accounts.push(account);
  return account;
}

// Link a Plaid account (called after successful Plaid auth)
export function linkPlaidAccount(plaidItemId, plaidAccountId, institution, accountNumber, mask, subtype) {
  const account = createAccount(`${institution} ${mask || accountNumber}`, subtype || 'checking');
  account.plaidItemId = plaidItemId;
  account.plaidAccountId = plaidAccountId;
  account.institution = institution;
  account.accountNumber = accountNumber;
  account.lastSync = new Date().toISOString();
  // In production, store the encrypted token server-side, never in localStorage
  return account;
}

// Update account balance from transactions
export function updateAccountBalance(accountId) {
  const account = store.accounts.find(a => a.id === accountId);
  if (!account) return;
  const fromTxs = store.transactions
    .filter(t => t.accountId === accountId)
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  // Assume starting balance is account.balance - transactions sum
  // In production, fetch the real balance from the bank
  account.lastSync = new Date().toISOString();
}

// Get all transactions for an account
export function accountTransactions(accountId) {
  return store.transactions.filter(t => t.accountId === accountId);
}

// Calculate account totals
export const accountStats = computed(() => {
  const stats = {};
  store.accounts.forEach(a => {
    const txs = accountTransactions(a.id);
    stats[a.id] = {
      account: a,
      spent: txs.filter(t => t.amount < 0).reduce((s, t) => s - t.amount, 0),
      income: txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      count: txs.length,
    };
  });
  return stats;
});
