importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Need to dynamically inject the firebase config since the worker runs on its own
// Alternatively, since the config is public, we can fetch it or hardcode.
// We will try to fetch firebase-applet-config.json
fetch('/firebase-applet-config.json')
  .then(response => response.json())
  .then(config => {
    firebase.initializeApp(config);
    const messaging = firebase.messaging();
    
    messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const title = payload.notification?.title 
    ?? payload.data?.title 
    ?? 'Work Space';
    
  const body = payload.notification?.body 
    ?? payload.data?.body 
    ?? payload.data?.message
    ?? '';

  const notificationOptions = {
    body: body,
    icon: '/icon.png',
    badge: '/icon.png',
    data: payload.data || {},
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle standard Web Push (fallback when FCM Admin is not available)
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      // Only process if it looks like our custom fallback push (FCM payload structure is different)
      if (data.title && data.body) {
         console.log('Received standard Web Push', data);
         const options = {
           body: data.body,
           icon: '/icon.png',
           data: data.data || {}
         };
         event.waitUntil(self.registration.showNotification(data.title, options));
      }
    } catch (e) {
      console.error('Push event parsing failed or not a standard JSON payload', e);
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  } else {
    event.waitUntil(clients.openWindow('/'));
  }
});
