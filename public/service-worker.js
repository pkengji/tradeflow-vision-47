// Service Worker for Web Push Notifications
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let title = 'Neue Benachrichtigung';
  let options = {
    body: 'Sie haben eine neue Nachricht',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'notification',
    requireInteraction: false,
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('[SW] Push payload:', payload);
      
      title = payload.title || title;
      options.body = payload.body || payload.message || options.body;
      options.tag = payload.tag || options.tag;
      options.data = payload.data || {};
      
      if (payload.icon) {
        options.icon = payload.icon;
      }
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  // Optional: Navigate to a specific page when notification is clicked
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
