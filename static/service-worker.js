const CACHE_NAME = 'yoresel-lezzet-cache-v1'; // Change version to force update
const urlsToCache = [
    '/', // Cache the root page
    '/static/css/style.css',
    '/static/js/script.js',
    '/static/icons/icon-192x192.png', // Make sure paths match your setup
    '/static/icons/icon-512x512.png'
    // Add other static assets like fonts if you have them
];

// Install event: Cache core assets
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                 console.log('Service Worker: Install complete');
                 return self.skipWaiting(); // Activate worker immediately
            })
            .catch(error => {
                console.error('Service Worker: Cache addAll failed:', error);
            })
    );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker: Activation complete');
            return self.clients.claim(); // Take control of pages immediately
        })
    );
});


// Fetch event: Serve cached assets, fetch others
self.addEventListener('fetch', event => {
    // We only want to cache GET requests for static assets
    if (event.request.method !== 'GET') {
        // Don't cache POST requests (like our API call) or others
        return;
    }

    // Strategy: Cache First for static assets defined in urlsToCache
    // For everything else (including API calls not listed), go Network First
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // If it's in the cache, serve it
                if (cachedResponse) {
                    // console.log('Service Worker: Serving from cache:', event.request.url);
                    return cachedResponse;
                }

                // If not in cache, fetch from network
                // console.log('Service Worker: Fetching from network:', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // Optional: Cache dynamically fetched resources if needed
                        // Be careful not to cache API responses you always want fresh
                        // Example: Only cache successful responses for static assets
                        /*
                        if (networkResponse && networkResponse.status === 200 && urlsToCache.includes(new URL(event.request.url).pathname)) {
                             const responseToCache = networkResponse.clone();
                             caches.open(CACHE_NAME)
                                 .then(cache => {
                                     cache.put(event.request, responseToCache);
                                 });
                        }
                        */
                        return networkResponse;
                    }
                ).catch(error => {
                    console.error('Service Worker: Fetch failed:', error);
                    // Optional: Return a basic offline fallback page/message here
                    // if (event.request.mode === 'navigate') { // Only for page navigations
                    //     return caches.match('/offline.html'); // You'd need to create and cache offline.html
                    // }
                });
            })
    );
});