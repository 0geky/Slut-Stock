errorelem = false;
window.addEventListener("error", (event) => {
    if (errorelem) {
        return true; // If an error is already being displayed, ignore further errors
    }
    //black screen (but kinda transparent) before error
    errorelem = document.createElement('div');
    errorelem.className = 'black';
    document.body.appendChild(errorelem);

    //error handler
    console.log(event);
    errorelem = document.createElement('div');
    errorelem.className = 'error';
    errorelem.innerHTML = `
        <h1>Whoops!</h1>
        Looks like an error occurred. Sorry about that!<br>
        <span style="color: #AAAAAA; font-size: 12px;">
            ${event.message}<br>
            &nbsp;&nbsp;&nbsp;&nbsp;at ${event.filename.replace(window.origin + "/", "")}:${event.lineno}:${event.colno}
        </span><br>
        <button onclick="window.location.reload()">Reload</button>
        <button onclick="history.back()">Leave</button>`;
    document.body.appendChild(errorelem);
    errorelem.style.top = (window.innerHeight / 2 - errorelem.offsetHeight / 2) + 'px';
    errorelem.style.left = (window.innerWidth / 2 - errorelem.offsetWidth / 2) + 'px';
    return true;
});
//throw new TypeError('This is a test error'); // This will trigger the error handler


/*
api.joshlei.com/v2/growagarden/stock
api.joshlei.com/v2/growagarden/weather
*/
const rarityColors = {
    'Common': '#a9a9a9',
    'Uncommon': '#52a961',
    'Rare': '#0776fd',
    'Legendary': '#fdfd00',
    'Mythical': '#a955fe',
    'Divine': '#fd5400',
    'Prismatic': 'red; animation: rainbow 10s infinite linear; -webkit-animation: rainbow 3s infinite linear;'
}

let mode = 'seed'; // 'seed', 'gear', 'egg'
let hovered = '';
let latestItems = [];               // current items shown in UI
let notificationPrefs = loadNotificationPrefs(); // { itemId: true, ... }

// load / save helpers
function loadNotificationPrefs() {
    try { return JSON.parse(localStorage.getItem('notificationPrefs') || '{}'); }
    catch (e) { return {}; }
}
function saveNotificationPrefs() {
    localStorage.setItem('notificationPrefs', JSON.stringify(notificationPrefs));
}
function isNotificationEnabled(itemId) {
    if (!itemId) return false;
    return !!notificationPrefs[itemId] || !!notificationPrefs[String(itemId)];
}

// UI: open / close settings
async function openSettings() {
    // ensure master DB is loaded and UI is rendered before showing panel
    try {
        await renderSettings();
    } catch (e) {
        console.warn('openSettings render failed', e);
    }
    document.getElementById('settings').style.display = 'block';
}
function closeSettings() {
    document.getElementById('settings').style.display = 'none';
}

// render settings from the master items DB (not just the last-rendered stock)
async function renderSettings() {
    const container = document.getElementById('settings_content');
    if (!container) return;

    // show a quick loading state
    container.innerHTML = '<p>Loading items…</p>';

    // Try to load the full master DB (fetchMasterItems is implemented elsewhere)
    let items = [];
    try {
        if (typeof fetchMasterItems === 'function') {
            items = await fetchMasterItems();
        }
    } catch (e) {
        console.warn('fetchMasterItems failed', e);
    }

    if (!items || items.length === 0) {
        container.innerHTML = '<p>No master item list available. Ensure the API is reachable or provide an /items.json fallback.</p>';
        return;
    }

    // optional: sort by display name for easier scanning
    items.sort((a, b) => {
        const na = (a.display_name || a.name || a.item_id || a.id || '').toString().toLowerCase();
        const nb = (b.display_name || b.name || b.item_id || b.id || '').toString().toLowerCase();
        return na.localeCompare(nb);
    });

    let html = `<div class="settings_list">`;
    items.forEach(item => {
        const id = item.item_id || item.id || item.itemId || item.name;
        const name = item.display_name || item.displayName || item.name || id;
        const qty = (item.quantity != null) ? ` <span class="muted">(${item.quantity}x)</span>` : '';
        const checked = isNotificationEnabled(id) ? 'checked' : '';
        html += `<label class="settings_item"><input type="checkbox" data-itemid="${id}" ${checked}> ${name}${qty}</label>`;
    });
    html += `</div>
        <div class="settings_actions">
            <button onclick="saveSettings()">Save</button>
            <button onclick="closeSettings()">Cancel</button>
        </div>`;
    container.innerHTML = html;
}

// Save the checkbox state into notificationPrefs and persist
function saveSettings() {
    const inputs = document.querySelectorAll('#settings_content input[type="checkbox"]');
    inputs.forEach(cb => {
        const id = cb.getAttribute('data-itemid');
        if (cb.checked) notificationPrefs[id] = true;
        else delete notificationPrefs[id];
    });
    saveNotificationPrefs();
    // small feedback
    try { alert('Notification settings saved.'); } catch (e) {}
    closeSettings();
}

// Ensure global access for the button in index.html
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;

// small helper that uses your existing fetchApi if present, otherwise calls the public API directly.
// Set window.GG_API_KEY = 'your_key_here' (if required) before calling these functions.
const GG_API_BASE = 'https://api.joshlei.com/v2/growagarden';
async function apiFetch(path) {
    // allow passing a full URL
    const url = path && (path.startsWith('http://') || path.startsWith('https://')) ? path : `${GG_API_BASE}/${path.replace(/^\/+/, '')}`;
    // prefer existing project helper if available
    if (typeof fetchApi === 'function') {
        try { return await fetchApi(path); } catch (e) { /* fallback to fetch below */ }
    }
    const headers = {};
    if (window.GG_API_KEY) headers['x-api-key'] = window.GG_API_KEY;
    const res = await fetch(url, { headers });
    if (!res.ok) {
        console.warn('apiFetch failed', url, res.status);
        return null;
    }
    return res.json();
}

// Render items: ensure image comes from /image/ endpoint when info doesn't include an icon
async function renderItems(items, infos) {
    // keep latest items for settings panel (normalize minimal fields)
    latestItems = items.map((it, i) => ({
        item_id: it.item_id || it.id || it.itemId || it.name,
        display_name: (infos && infos[i] && (infos[i].display_name || infos[i].displayName)) || it.display_name || it.name || (it.item_id || it.id),
        quantity: it.quantity || (infos && infos[i] && infos[i].quantity) || 0,
        icon: (infos && infos[i] && (infos[i].icon || infos[i].image)) || it.icon || ''
    }));

    let html = '';
    items.forEach((item, i) => {
        const info = (infos && infos[i]) || {};
        const id = item.item_id || item.id || item.itemId || info.item_id || info.id || info.name;
        // image fallback to the public image endpoint (doesn't require key)
        const imgSrc = info.icon || info.image || item.icon || `${GG_API_BASE}/image/${encodeURIComponent(id)}`;
        html += `
            <div class="item">
                <img src="${imgSrc}" alt="${(info.display_name || item.display_name || id)}">
                <div class="item_name">
                    <div class="item_section">
                        <div class="left">
                            <div class="name">${(info.display_name || item.display_name || id)}</div>
                            <div class="qty">${item.quantity || ''}x</div>
                        </div>
                        <div class="right">
                            <div class="price">${Number(info.price || 0).toLocaleString()}¢</div>
                            <div class="rarity" style="background-color: ${rarityColors[info.rarity] || 'transparent'}">
                                ${info.rarity || ''}
                            </div>
                        </div>
                    </div>
                    <div class="item_section">
                        <div class="item_desc">
                            ${info.description || ''}
                        </div>
                    </div>
                </div>
            </div>`;
    });
    document.getElementById("stock").innerHTML = html;
}

// Fetch master items by pulling the full stock from the API (seeds, gear, eggs, merchant)
// Uses the documented /stock and /info endpoints
async function fetchMasterItems() {
    if (masterItems && masterItems.length) return masterItems;
    try {
        const data = await apiFetch('stock');
        if (!data) return [];

        const lists = [
            ...(data.seed_stock || []),
            ...(data.gear_stock || []),
            ...(data.egg_stock || []),
            ...(data.cosmetic_stock || []),
            ...((data.travelingmerchant_stock && data.travelingmerchant_stock.stock) || [])
        ];

        // dedupe by item_id (fallback to id/name)
        const map = new Map();
        lists.forEach(it => {
            const id = it.item_id || it.id || it.itemId || it.name;
            if (!id) return;
            if (!map.has(String(id))) map.set(String(id), Object.assign({}, it));
        });
        masterItems = Array.from(map.values());

        // fetch info for each item via /info/<id> (rate-limit friendly chunking)
        const concurrency = 8;
        const infos = [];
        for (let i = 0; i < masterItems.length; i += concurrency) {
            const chunk = masterItems.slice(i, i + concurrency);
            const promises = chunk.map(it => {
                const id = it.item_id || it.id || it.itemId || it.name;
                return apiFetch(`info/${encodeURIComponent(id)}`).catch(() => ({}));
            });
            const resolved = await Promise.all(promises);
            infos.push(...resolved);
        }

        // merge info into masterItems
        masterItems = masterItems.map((it, idx) => Object.assign({}, it, infos[idx] || {}));
        return masterItems;
    } catch (e) {
        console.warn('fetchMasterItems failed', e);
        return masterItems || [];
    }
}

// helper: next upcoming half-hour (unix seconds)
function nextHalfHourUnix(from = new Date()){
    const d = new Date(from.getTime());
    const mins = d.getMinutes();
    const add = (mins < 30) ? (30 - mins) : (60 - mins);
    d.setMinutes(d.getMinutes() + add);
    d.setSeconds(0,0);
    return Math.floor(d.getTime()/1000);
}

async function getStock() {
    const data = await apiFetch('stock');
    if (!data) {
        document.getElementById('stock').innerHTML = '<div class="error">Failed to load stock</div>';
        return;
    }

    // compute restock times: prefer API timestamps, otherwise fall back to next half-hour
    const apiSeedTs = data.seed_stock && data.seed_stock[0] && (data.seed_stock[0].end_date_unix || data.seed_stock[0].end_date);
    const apiGearTs = data.gear_stock && data.gear_stock[0] && (data.gear_stock[0].end_date_unix || data.gear_stock[0].end_date);
    const apiEggTs = data.egg_stock && data.egg_stock[0] && (data.egg_stock[0].end_date_unix || data.egg_stock[0].end_date);

    const newSeedRestock = apiSeedTs ? Number(apiSeedTs) : nextHalfHourUnix();
    const newGearRestock = apiGearTs ? Number(apiGearTs) : nextHalfHourUnix();
    const newEggRestock = apiEggTs ? Number(apiEggTs) : nextHalfHourUnix();

    // detect restock changes (don't fire on first load)
    const seedChanged = prevSeedRestock && (newSeedRestock !== prevSeedRestock);
    const gearChanged = prevGearRestock && (newGearRestock !== prevGearRestock);
    const eggChanged  = prevEggRestock  && (newEggRestock  !== prevEggRestock);

    // prefer combined seed+gear message if both changed together
    if (seedChanged && gearChanged) {
        sendShopNotification('Seed and gear shop has restocked', 'Seed and gear shop has restocked — check the site for new items', 'seed-gear-restock');
    } else {
        if (seedChanged) sendShopNotification('Seed shop has restocked', 'Seed shop has restocked — check the site for new seeds', 'seed-restock');
        if (gearChanged) sendShopNotification('Gear shop has restocked', 'Gear shop has restocked — check the site for new gear', 'gear-restock');
    }
    if (eggChanged) sendShopNotification('Egg shop has restocked', 'Egg shop has restocked — check the site for new eggs', 'egg-restock');

    // update prev values for next detection
    prevSeedRestock = newSeedRestock;
    prevGearRestock = newGearRestock;
    prevEggRestock  = newEggRestock;

    // assign the canonical restock variables used elsewhere
    seedRestock = newSeedRestock;
    gearRestock = newGearRestock;
    eggRestock = newEggRestock;

    switch (mode) {
        case 'seed':
            seedInfos = await Promise.all((data.seed_stock || []).map(s => apiFetch(`info/${encodeURIComponent(s.item_id)}`).catch(()=>({}))));
            renderItems(data.seed_stock || [], seedInfos);
            break;
        case 'gear':
            gearInfos = await Promise.all((data.gear_stock || []).map(g => apiFetch(`info/${encodeURIComponent(g.item_id)}`).catch(()=>({}))));
            renderItems(data.gear_stock || [], gearInfos);
            break;
        case 'egg':
            eggInfos = await Promise.all((data.egg_stock || []).map(e => apiFetch(`info/${encodeURIComponent(e.item_id)}`).catch(()=>({}))));
            renderItems(data.egg_stock || [], eggInfos);
            break;
        case 'merchant':
            const merchantStock = (data.travelingmerchant_stock && data.travelingmerchant_stock.stock) || [];
            merchantInfos = await Promise.all(merchantStock.map(m => apiFetch(`info/${encodeURIComponent(m.item_id)}`).catch(()=>({}))));
            if (merchantStock[0] && merchantStock[0].end_date_unix && merchantStock[0].end_date_unix < Math.floor(Date.now()/1000)) {
                renderItems(merchantStock, merchantInfos);
            } else if (merchantStock.length) {
                renderItems(merchantStock, merchantInfos);
            } else {
                document.getElementById('stock').innerHTML = `No merchant yet`;
            }
            break;
        default:
            document.getElementById('stock').innerHTML = `...okay.`;
            break;
    }

    seed_html = '';
    gear_html = '';
    egg_html = '';
    merchant_html = '';
}

getStock();
hovered = '';

function switchMode(tab) {
    mode = tab;
    // keep UI consistent: fetch stock for the selected mode
    getStock();
}

async function getWeather() {
    weatherdata = await fetchApi('weather')

    console.log(weatherdata)

    weather_html = `<div class="weather">`
    for (i = 0; i < weatherdata.weather.length; i++) {
        weather = weatherdata.weather[i]
        if (weather.active) {
            weatherdata1 = await fetchApi('info/' + weather.weather_id)
            console.log(weatherdata1);
            weather_html += `
                <div class="weather_item">
                    <img src="${weather.icon}" id="${weather.weather_id}" name="${weatherdata1.display_name}" desc="${weatherdata1.description}" end="${weather.end_duration_unix}" onmouseleave="unhover()" onmouseover="hover('${weather.weather_id}')" ><br>
                </div>`
        }
        if (weather.weather_id == hovered && !weather.active) {
            hovered = "";
        }
    }
    weather_html += `</div>`

    document.getElementById('weather').innerHTML = weather_html;
}
function hover(id) {
    hovered = id;
    document.getElementById('weatherinfo').style.display = 'block';
}
function unhover() {
    hovered = '';
    document.getElementById('weatherinfo').style.display = 'none';
}
addEventListener("mousemove", (event) => {
    document.getElementById('weatherinfo').style.left = (event.pageX - document.getElementById('weatherinfo').offsetWidth) + 'px';
    document.getElementById('weatherinfo').style.top = (event.pageY - document.getElementById('weatherinfo').offsetHeight) + 'px';
})

setInterval(getWeather, 10000)
getWeather();
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

// Replace with your Web Push certificate key from Firebase console (public VAPID key)
const VAPID_KEY = "BN-kgdowx7p7xpBH_b9FEGy2guFDQLK24MyT6dqySP3T2o2wTgL9SpfNwgftAQ2Wme8JOB7DsI-K5Tro74y3LIM";

if (typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(firebaseConfig);
        const messaging = firebase.messaging();

        // register service worker and wire up messaging
        if ('serviceWorker' in navigator) {
            const canRegisterSW = (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
            const swPath = './firebase-messaging-sw.js'; // relative path on the published site
            if (canRegisterSW) {
                // Check the SW file exists first to avoid a noisy 404/TypeError in the console
                fetch(swPath, { method: 'HEAD' })
                    .then(resp => {
                        if (!resp.ok) {
                            console.warn(`Service worker file not found (${resp.status}). Skipping registration: ${swPath}`);
                            return null;
                        }
                        return navigator.serviceWorker.register(swPath);
                    })
                    .then(registration => {
                        if (!registration) return;
                        // for compat: tell messaging to use this SW
                        try { messaging.useServiceWorker(registration); } catch (e) {}
                        console.log('Service worker registered for FCM');
                    })
                    .catch(err => console.warn('SW registration failed', err));
            } else {
                console.warn('Service worker not registered: insecure origin or file://. Push notifications require a secure origin (https) or localhost.');
            }
        }

        // request permission, get token and send to your backend
        async function requestNotificationPermission() {
            if (!('Notification' in window)) {
                alert('Notifications not supported in this browser.');
                return;
            }
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                alert('Notification permission denied');
                return;
            }
            try {
                const currentToken = await messaging.getToken({ vapidKey: VAPID_KEY });
                if (currentToken) {
                    console.log('FCM token', currentToken);
                    // send token to your server so you can push messages to it later
                    try {
                        // adjust endpoint as needed; this assumes you have an API endpoint that accepts the token
                        await fetch('/register_push_token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: currentToken })
                        });
                    } catch (e) {
                        console.warn('Failed to send token to server', e);
                    }
                    alert('Notifications enabled');
                } else {
                    console.warn('No registration token available. Request permission to generate one.');
                }
            } catch (err) {
                console.warn('An error occurred while retrieving token. ', err);
            }
        }

        // foreground messages (when app is open)
        messaging.onMessage((payload) => {
            console.log('Message received. ', payload);
            const title = (payload.notification && payload.notification.title) || 'Notification';
            const body = (payload.notification && payload.notification.body) || JSON.stringify(payload);
            // show a notification using the Notifications API
            if (Notification.permission === 'granted') {
                new Notification(title, {
                    body,
                    data: payload.data || {},
                    // optionally set icon: payload.notification.icon
                });
            }
        });

        // export function to global so the button in index.html can call it
        window.requestNotificationPermission = requestNotificationPermission;
    } catch (e) {
        console.warn('Firebase init failed', e);
    }
} else {
    console.warn('Firebase scripts not loaded (firebase variable is undefined).');
}

// If you added Firebase messaging earlier, filter incoming foreground messages by prefs
if (typeof firebase !== 'undefined') {
    try {
        const messaging = firebase.messaging && firebase.messaging();
        if (messaging && messaging.onMessage) {
            const origOnMessage = messaging.onMessage.bind(messaging);
            messaging.onMessage((payload) => {
                // try to extract item identifier from payload (customize depending on how you send pushes)
                const data = payload.data || {};
                const itemId = data.itemId || data.item_id || payload.notification && payload.notification.tag || null;

                // if itemId exists and notifications for it are disabled, ignore
                if (itemId && !isNotificationEnabled(itemId)) {
                    console.log('Push ignored (user disabled notifications for item):', itemId);
                    return;
                }

                // otherwise show notification (as before)
                const title = (payload.notification && payload.notification.title) || 'Notification';
                const body = (payload.notification && payload.notification.body) || JSON.stringify(payload);
                if (Notification.permission === 'granted') {
                    new Notification(title, {
                        body,
                        data: payload.data || {},
                    });
                }
            });
        }
    } catch (e) {
        console.warn('FCM messaging hook failed', e);
    }
}

// ---- SETTINGS: temporarily disabled (kept stubs to avoid undefined handler errors) ----
function openSettings() {
    // settings temporarily removed
    console.warn('Settings panel is disabled.');
}
function closeSettings() {
    // no-op while settings are removed
}

// ensure restock timer variables exist before any timers run (prevents ReferenceError)
let seedRestock = 0;
let eggRestock = 0;
// added: track gear restock + previous values to detect changes
let gearRestock = 0;
let prevSeedRestock = 0;
let prevGearRestock = 0;
let prevEggRestock = 0;

// helper to show a small in-app toast (so users without Notification permission still get feedback)
function showInAppToast(text, timeout = 6000) {
    try {
        const id = 'gg_toast_holder';
        let holder = document.getElementById(id);
        if (!holder) {
            holder = document.createElement('div');
            holder.id = id;
            Object.assign(holder.style, {
                position: 'fixed',
                right: '14px',
                bottom: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                zIndex: 100000
            });
            document.body.appendChild(holder);
        }
        const t = document.createElement('div');
        t.textContent = text;
        Object.assign(t.style, {
            background: 'linear-gradient(90deg,#0b2511,#123a1f)',
            color: '#d7fbe6',
            padding: '10px 12px',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: '13px',
            maxWidth: '320px'
        });
        holder.appendChild(t);
        setTimeout(() => { try { t.remove(); } catch (e) {} }, timeout);
    } catch (e) { console.warn('showInAppToast failed', e); }
}

// helper to send a shop notification (uses Notification API when allowed)
function sendShopNotification(title, body, tag) {
    try {
        if (window.Notification && Notification.permission === 'granted') {
            new Notification(title, { body: body, tag: tag || 'gg-restock' });
        } else {
            console.log('Shop notification:', title, body);
        }
        // always show an in-app toast as well
        showInAppToast(`${title} — ${body}`);
    } catch (e) {
        console.warn('sendShopNotification failed', e);
    }
}

// ---- TIMER / RESTOCK UI ----
function pad2(n) { return String(n).padStart(2, '0'); }

async function updateTimer() {
    const nowSec = Math.floor(Date.now() / 1000);
    let distance = 0;

    if (mode === 'merchant') {
        // next merchant UTC hour divisible by 4 (0,4,8,12,16,20)
        const now = new Date();
        const h = now.getUTCHours();
        let nextHour = h - (h % 4) + 4;
        let nextDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), nextHour % 24, 0, 0));
        if (nextHour >= 24) {
            nextDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, nextHour % 24, 0, 0));
        }
        distance = Math.floor(nextDate.getTime() / 1000) - nowSec;
    } else if (mode === 'egg') {
        distance = Math.floor((eggRestock || 0) - nowSec);
    } else {
        distance = Math.floor((seedRestock || 0) - nowSec);
    }

    if (distance <= 0) {
        try { await getStock(); } catch (e) { /* ignore */ }
        const nowSec2 = Math.floor(Date.now() / 1000);
        if (mode === 'merchant') {
            const now = new Date();
            const h = now.getUTCHours();
            let nextHour = h - (h % 4) + 4;
            let nextDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), nextHour % 24, 0, 0));
            if (nextHour >= 24) nextDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, nextHour % 24, 0, 0));
            distance = Math.max(0, Math.floor(nextDate.getTime() / 1000) - nowSec2);
        } else if (mode === 'egg') {
            distance = Math.max(0, Math.floor((eggRestock || 0) - nowSec2));
        } else {
            distance = Math.max(0, Math.floor((seedRestock || 0) - nowSec2));
        }
    }

    const timerEl = document.getElementById('timer');
    if (!timerEl) return;

    if (mode === 'merchant') {
        const hrs = Math.floor(distance / 3600);
        const mins = Math.floor((distance % 3600) / 60);
        timerEl.innerHTML = `Restocks in ${hrs}:${pad2(mins)}`;
    } else {
        const mins = Math.floor(distance / 60);
        const secs = distance % 60;
        timerEl.innerHTML = `Restocks in ${mins}:${pad2(secs)}`;
    }
}

// start timer updates (1s) and kick an immediate update
setInterval(updateTimer, 1000);
updateTimer();

// --- notification prompt on first visit (black + green theme) ---
function showNotificationPrompt() {
    try {
        if (localStorage.getItem('notif_prompt_dont_ask')) return;
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted' || Notification.permission === 'denied') return;

        // overlay
        const overlay = document.createElement('div');
        overlay.id = 'notif_overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            backdropFilter: 'blur(4px)'
        });

        // card (dark)
        const card = document.createElement('div');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        Object.assign(card.style, {
            width: '420px',
            maxWidth: '94%',
            borderRadius: '12px',
            background: '#07100a', // deep black-green background
            color: '#d7fbe6',       // pale green text
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            padding: '18px',
            display: 'flex',
            gap: '14px',
            alignItems: 'flex-start',
            fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial'
        });

        // accent icon
        const iconWrap = document.createElement('div');
        Object.assign(iconWrap.style, {
            width: '56px',
            height: '56px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg,#093210,#16a34a)', // dark -> green
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: '0'
        });
        iconWrap.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 4v4" stroke="#d7fbe6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M18 8c0 3.866-1.343 5.5-3 6.5v1.5H9v-1.5c-1.657-1-3-2.634-3-6.5 0-3.866 2.686-6.5 6-6.5s6 2.634 6 6.5Z" stroke="#d7fbe6" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9 19a3 3 0 0 0 6 0" stroke="#d7fbe6" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

        // content
        const content = document.createElement('div');
        Object.assign(content.style, { flex: '1 1 auto' });

        const title = document.createElement('div');
        title.textContent = 'Enable restock notifications';
        Object.assign(title.style, { fontSize: '16px', fontWeight: '700', marginBottom: '6px', color: '#eafff0' });

        const desc = document.createElement('div');
        desc.innerHTML = 'Get notified when seeds, eggs or merchant items restock. You can disable these any time in settings.';
        Object.assign(desc.style, { fontSize: '13px', color: '#bfeecd', marginBottom: '14px', lineHeight: '1.35' });

        // actions
        const actions = document.createElement('div');
        Object.assign(actions.style, { display: 'flex', gap: '10px', alignItems: 'center' });

        const btnPrimary = document.createElement('button');
        btnPrimary.textContent = 'Enable';
        Object.assign(btnPrimary.style, {
            background: 'linear-gradient(90deg,#16a34a,#38d39f)',
            color: '#06110a',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: '700',
            boxShadow: '0 8px 24px rgba(22,163,74,0.14)'
        });

        const btnSecondary = document.createElement('button');
        btnSecondary.textContent = 'No thanks';
        Object.assign(btnSecondary.style, {
            background: 'transparent',
            color: '#bfeecd',
            border: '1px solid rgba(190,238,205,0.08)',
            padding: '10px 12px',
            borderRadius: '10px',
            cursor: 'pointer'
        });

        const dontAskLabel = document.createElement('label');
        dontAskLabel.style.display = 'flex';
        dontAskLabel.style.alignItems = 'center';
        dontAskLabel.style.gap = '8px';
        dontAskLabel.style.marginLeft = 'auto';
        dontAskLabel.style.fontSize = '12px';
        dontAskLabel.style.color = '#9ddfb3';
        dontAskLabel.innerHTML = `<input type="checkbox" id="dont_ask_chk" style="width:14px;height:14px"> Don't ask again`;

        actions.appendChild(btnPrimary);
        actions.appendChild(btnSecondary);
        actions.appendChild(dontAskLabel);

        content.appendChild(title);
        content.appendChild(desc);
        content.appendChild(actions);

        // close X
        const closeBtn = document.createElement('button');
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.innerHTML = '✕';
        Object.assign(closeBtn.style, {
            background: 'transparent',
            border: 'none',
            color: '#94d8a6',
            cursor: 'pointer',
            fontSize: '16px',
            marginLeft: '8px'
        });

        card.appendChild(iconWrap);
        card.appendChild(content);
        card.appendChild(closeBtn);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // cleanup helper
        function cleanup(saveDontAsk = false) {
            try { window.removeEventListener('keydown', onKey); overlay.remove(); } catch (e) {}
            if (saveDontAsk) localStorage.setItem('notif_prompt_dont_ask', '1');
        }

        // enable flow
        async function enableFlow() {
            try {
                if (typeof window.requestNotificationPermission === 'function') {
                    await window.requestNotificationPermission();
                } else {
                    const p = await Notification.requestPermission();
                    if (p === 'granted') {
                        try {
                            if (typeof firebase !== 'undefined' && firebase.messaging) {
                                const messaging = firebase.messaging();
                                if (messaging && messaging.getToken) {
                                    await messaging.getToken({ vapidKey: VAPID_KEY }).catch(()=>{});
                                }
                            }
                        } catch (e) { console.warn('FCM token attempt failed', e); }
                    }
                }
            } catch (e) {
                console.warn('Permission request failed', e);
            } finally {
                const checked = document.getElementById('dont_ask_chk') && document.getElementById('dont_ask_chk').checked;
                cleanup(checked);
            }
        }

        // event handlers: close immediately and persist don't-ask if checked
        btnPrimary.addEventListener('click', enableFlow);
        btnSecondary.addEventListener('click', () => {
            const checked = document.getElementById('dont_ask_chk') && document.getElementById('dont_ask_chk').checked;
            cleanup(checked || true);
        });
        closeBtn.addEventListener('click', () => {
            const checked = document.getElementById('dont_ask_chk') && document.getElementById('dont_ask_chk').checked;
            cleanup(checked);
        });

        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) {
                const checked = document.getElementById('dont_ask_chk') && document.getElementById('dont_ask_chk').checked;
                cleanup(checked);
            }
        });

        // keyboard handler
        function onKey(e) { if (e.key === 'Escape') { const checked = document.getElementById('dont_ask_chk') && document.getElementById('dont_ask_chk').checked; cleanup(checked); } }
        window.addEventListener('keydown', onKey);
    } catch (e) {
        console.warn('showNotificationPrompt failed', e);
    }
}

// show shortly after load so UI has time to render
window.addEventListener('load', () => setTimeout(showNotificationPrompt, 900));



