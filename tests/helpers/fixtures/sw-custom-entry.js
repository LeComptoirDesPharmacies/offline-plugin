// Custom service worker entry
self.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request));
});
