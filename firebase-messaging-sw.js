importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Paste the same config you used in main.js
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAuYOZGWbEIHCDxWBEJbVpfIGpF_Utg_l8",
  authDomain: "notify-1756b.firebaseapp.com",
  projectId: "notify-1756b",
  storageBucket: "notify-1756b.firebasestorage.app",
  messagingSenderId: "577322896029",
  appId: "1:577322896029:web:8ee3a39134c64bfb23a274",
  measurementId: "G-1NKT759VPV"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notification = payload.notification || {};
    const title = notification.title || 'Background Message';
    const options = {
        body: notification.body || '',
        icon: notification.icon || '/icon.png',
        data: payload.data || {}
    };
    self.registration.showNotification(title, options);
});