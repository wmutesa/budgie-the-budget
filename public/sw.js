// Taskie's service worker: shows notifications when Taskie is closed.
// A push from Taskie's server is only a wake-up (no data travels through the
// browser's push service); the worker then asks Taskie what to show.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let items = [];
    try {
      const res = await fetch('/api/notify/pending', { credentials: 'include', cache: 'no-store' });
      if (res.ok) items = (await res.json()).items || [];
    } catch { /* offline: fall through to a plain notice */ }
    // A push must always show something (Safari and Chrome require it).
    if (!items.length) items = [{ title: 'Taskie', body: 'Something in your planner needs a look.', url: '/', tag: 'taskie' }];
    await Promise.all(items.map(x => self.registration.showNotification(x.title, { body: x.body || '', tag: x.tag || undefined, icon: '/icon-192.png', badge: '/favicon-32.png', data: { url: x.url || '/' } })));
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => new URL(c.url).origin === self.location.origin);
    if (open) { await open.focus(); if ('navigate' in open && open.url !== url) open.navigate(url).catch(() => {}); return; }
    await self.clients.openWindow(url);
  })());
});
