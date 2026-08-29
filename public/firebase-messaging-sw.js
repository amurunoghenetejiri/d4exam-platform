/* D4EXAM Firebase Messaging + offline shell (network-first navigations) */
/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAuezyy29nHrBdwMaVV8q__xLwWB9K2ieQ",
  authDomain: "d4exam-6506a.firebaseapp.com",
  projectId: "d4exam-6506a",
  storageBucket: "d4exam-6506a.firebasestorage.app",
  messagingSenderId: "719974201137",
  appId: "1:719974201137:web:c172a34706249f0046e210",
  measurementId: "G-0GNB3TGQBG",
});

var messaging = firebase.messaging();

/* Bump versions whenever offline/SW behaviour changes so clients drop stale caches */
var SHELL_CACHE = "d4exam-shell-v7";
var RUNTIME_CACHE = "d4exam-runtime-v7";
var SHELL_URLS = [
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.png",
  "/favicon.png",
  "/apple-touch-icon.png",
  "/site.webmanifest",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL_URLS).catch(function () {});
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== SHELL_CACHE && k !== RUNTIME_CACHE) {
            return caches.delete(k);
          }
        }),
      );
    }).then(function () {
      return self.clients.claim();
    }),
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.indexOf("/assets/") === 0 ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".webp")
  );
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api") === 0) return;

  /* Navigations: always try network first. Only fall back to cache/offline when offline. */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            try {
              var copy = res.clone();
              caches.open(RUNTIME_CACHE).then(function (c) {
                c.put(req, copy);
              });
            } catch (e) {}
          }
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            if (cached) return cached;
            return caches.match("/").then(function (root) {
              if (root) return root;
              return caches.match("/index.html").then(function (idx) {
                if (idx) return idx;
                return caches.match("/offline.html");
              });
            });
          });
        }),
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            try {
              var copy = res.clone();
              caches.open(RUNTIME_CACHE).then(function (c) {
                c.put(req, copy);
              });
            } catch (e) {}
          }
          return res;
        })
        .catch(function () {
          return caches.match(req);
        }),
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(function () {
      return caches.match(req);
    }),
  );
});

function absUrl(path) {
  try {
    return new URL(path, self.location.origin).href;
  } catch (e) {
    return path;
  }
}

function showD4Notification(payload) {
  var data = (payload && payload.data) || {};
  var title =
    (payload && payload.notification && payload.notification.title) ||
    data.title ||
    "D4EXAM";
  var body =
    (payload && payload.notification && payload.notification.body) ||
    data.body ||
    data.message ||
    "Secure online examinations for schools.";
  var link = data.link || data.url || "/";
  var icon = data.icon || absUrl("/icon-192.png");
  var badge = data.badge || absUrl("/icon-192.png");

  return self.registration.showNotification(title, {
    body: body,
    icon: icon,
    badge: badge,
    data: { link: link, title: title },
    tag: data.tag || "d4exam-notification",
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [120, 40, 120],
  });
}

messaging.onBackgroundMessage(function (payload) {
  return showD4Notification(payload);
});

self.addEventListener("push", function (event) {
  try {
    var raw = event.data ? event.data.json() : {};
    event.waitUntil(showD4Notification(raw));
  } catch (e) {
    event.waitUntil(
      showD4Notification({
        data: { title: "D4EXAM", body: "You have a new update." },
      }),
    );
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var link = "/";
  try {
    if (event.notification && event.notification.data && event.notification.data.link) {
      link = event.notification.data.link;
    }
  } catch (e) {}
  if (link.indexOf("http") !== 0) {
    link = self.location.origin + (link.charAt(0) === "/" ? link : "/" + link);
  }
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ("focus" in client) {
          if (client.navigate) client.navigate(link);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
    }),
  );
});
