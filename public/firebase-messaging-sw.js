/* D4EXAM Firebase Messaging + light offline shell */
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

var SHELL_CACHE = "d4exam-shell-v1";
var SHELL_URLS = ["/", "/offline.html", "/icon-192.png", "/favicon.png", "/site.webmanifest"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL_URLS).catch(function () {
        /* partial cache ok */
      });
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== SHELL_CACHE && k.indexOf("d4exam-shell-") === 0) {
            return caches.delete(k);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API / auth traffic
  if (url.pathname.indexOf("/api") === 0 || url.pathname.indexOf("/auth") === 0) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          if (req.mode === "navigate") {
            return caches.match("/offline.html");
          }
          return caches.match("/offline.html");
        });
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

messaging.onBackgroundMessage(function (payload) {
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

  self.registration.showNotification(title, {
    body: body,
    icon: absUrl("/icon-192.png"),
    badge: absUrl("/icon-192.png"),
    data: { link: link, title: title },
    tag: data.tag || "d4exam-notification",
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [120, 40, 120],
  });
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
