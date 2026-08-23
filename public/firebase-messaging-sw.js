/* D4EXAM Firebase Messaging service worker */
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

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const data = (payload && payload.data) || {};
  const title =
    (payload && payload.notification && payload.notification.title) ||
    data.title ||
    "D4EXAM";
  const body =
    (payload && payload.notification && payload.notification.body) ||
    data.body ||
    data.message ||
    "";
  const link = data.link || data.url || "/";
  self.registration.showNotification(title, {
    body: body,
    icon: "/icon-192.png",
    badge: "/favicon.png",
    data: { link: link },
    tag: data.tag || "d4exam-notification",
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
          client.navigate(link);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
