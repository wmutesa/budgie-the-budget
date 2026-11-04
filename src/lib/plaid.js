// Plaid integration for real bank account connections
// https://plaid.com/docs

// IMPORTANT: Set your Plaid public key in .env or here
export const PLAID_PUBLIC_KEY = import.meta.env.VITE_PLAID_PUBLIC_KEY || '';

// Load Plaid Link script
let plaidLoaded = false;
export async function loadPlaidLink() {
  if (plaidLoaded || typeof window === 'undefined') return true;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v3/stable/link-initialize.js';
    script.onload = () => { plaidLoaded = true; resolve(true); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Create Plaid Link handler
export async function createPlaidHandler(onSuccess, onExit) {
  await loadPlaidLink();
  if (!window.Plaid) throw new Error('Plaid Link failed to load');

  const handler = window.Plaid.create({
    token: import.meta.env.VITE_PLAID_LINK_TOKEN || '', // Get from backend in production
    onSuccess: (public_token, metadata) => {
      // Exchange public_token for access_token server-side
      onSuccess({ public_token, metadata });
    },
    onExit: (err, metadata) => {
      if (onExit) onExit(err, metadata);
    },
    onEvent: (eventName, metadata) => {
      console.log('Plaid event:', eventName, metadata);
    },
  });
  return handler;
}

// Get transactions from Plaid (requires backend access token)
export async function getPlaidTransactions(accessToken, accountId, startDate, endDate) {
  // In production: POST /api/plaid/transactions with accessToken
  // This is a server-side call; never expose access_token to client
  const response = await fetch('/api/plaid/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, accountId, startDate, endDate }),
  });
  if (!response.ok) throw new Error('Failed to fetch Plaid transactions');
  return response.json();
}

// Get account balances from Plaid (requires backend access token)
export async function getPlaidBalances(accessToken) {
  const response = await fetch('/api/plaid/balances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  if (!response.ok) throw new Error('Failed to fetch Plaid balances');
  return response.json();
}

// Exchange public token for access token (backend call)
export async function exchangePlaidPublicToken(publicToken) {
  const response = await fetch('/api/plaid/exchange-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicToken }),
  });
  if (!response.ok) throw new Error('Failed to exchange Plaid token');
  return response.json(); // { accessToken, itemId }
}
