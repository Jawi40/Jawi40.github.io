// player.js
// Infin8Radio persistent player + chat with PJAX navigation (homepage: index.html)

// Import listener tracking from Firebase module
import { startListening, stopListening, onListenerCount } from "./listener-counter.js";

// =========================
// iPad/iPhone detection
// =========================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

// =========================
// DOM ELEMENTS
// =========================
const STREAM_URL = "https://stream.zeno.fm/axipqkdhsiitv/listen";

const audio = document.getElementById("radioAudio");
const playBtn = document.getElementById("playBtn");
const retryBtn = document.getElementById("retryBtn");
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const liveIndicator = document.getElementById("liveIndicator");
const statusLabel = document.getElementById("statusLabel");
const statusDetail = document.getElementById("statusDetail");
const errorCountEl = document.getElementById("errorCount");
const lastReconnectEl = document.getElementById("lastReconnect");
const connectionStateEl = document.getElementById("connectionState");
const uptimeEl = document.getElementById("uptime");
const streamUrlText = document.getElementById("streamUrlText");
const listenerCountEl = document.getElementById("listenerCount");
const equalizer = document.getElementById("equalizer");
const diagToggle = document.getElementById("diagToggle");
const diagnosticsPanel = document.getElementById("diagnosticsPanel");

// Player + chat containers (for hide/show on non‑homepage)
const playerBox = document.querySelector(".player-box");
const chatBox = document.querySelector(".chat-box");

streamUrlText.textContent = STREAM_URL;

// =========================
// PLAYER STATE
// =========================
let isPlaying = false;
let reconnectTimer = null;
let errorCount = 0;
let manualStop = false;
let uptimeTimer = null;
let startTime = null;
let lastListenerCount = null;

let stallCheckTimer = null;
let lastTimeUpdate = 0;
let lastRecover = 0;
let heartbeatTimer = null;

// =========================
// STATUS + UI HELPERS
// =========================
function setStatus(label, detail, type = null) {
    statusLabel.textContent = label;
    statusDetail.textContent = detail;

    liveIndicator.className = "live-indicator";
    if (type === "ok") liveIndicator.classList.add("live-ok");
    if (type === "warn") liveIndicator.classList.add("live-warn");
}

function startUptime() {
    startTime = Date.now();
    clearInterval(uptimeTimer);
    uptimeTimer = setInterval(() => {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        uptimeEl.textContent = diff + "s";
    }, 1000);
}

function stopUptime() {
    clearInterval(uptimeTimer);
    uptimeEl.textContent = "0s";
}

// =========================
// EQUALIZER CONTROL
// =========================
function eqStart() {
    equalizer.classList.remove("eq-paused");
}

function eqStop() {
    equalizer.classList.add("eq-paused");
}

// =========================
// WARM STREAM (NO AUTOPLAY)
// =========================
function warmStream() {
    audio.src = STREAM_URL;
    audio.muted = true;
    audio.playsInline = true;
    eqStop();
    audio.load();
}

// =========================
// AUTO-RECOVERY ENGINE
// =========================
function startStallWatchdog() {
    clearInterval(stallCheckTimer);
    stallCheckTimer = setInterval(() => {
        if (!isPlaying) return;

        const now = audio.currentTime;

        if (Math.abs(now - lastTimeUpdate) < 0.01) {
            autoRecover();
        }

        lastTimeUpdate = now;
    }, 5000);
}

function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
        if (!isPlaying) return;

        if (audio.paused && !manualStop) autoRecover();
        if (audio.volume === 0 && !manualStop) autoRecover();
    }, 4000);
}

function autoRecover() {
    const now = Date.now();
    if (now - lastRecover < 2000) return;
    lastRecover = now;

    if (manualStop) return;

    setStatus("Reconnecting", "Restoring stream…", "warn");
    connectionStateEl.textContent = "Reconnecting";

    stopStreamInternal(false);
    setTimeout(() => startStream(), 1500);
}

// =========================
// STREAM ENGINE (iPad-safe)
// =========================
export async function startStream() {
    manualStop = false;
    clearTimeout(reconnectTimer);

    audio.src = STREAM_URL;
    audio.muted = false;

    setStatus("Connecting", "Initializing…", "warn");
    connectionStateEl.textContent = "Connecting";

    try {
        await audio.play();
        isPlaying = true;

        startListening();

        playBtn.textContent = "⏸";
        playBtn.classList.add("pulse");

        setStatus("LIVE", "Stream active", "ok");
        connectionStateEl.textContent = "Playing";

        startUptime();
        eqStart();
        startStallWatchdog();
        startHeartbeat();

    } catch (err) {
        handleError();
    }
}

function stopStreamInternal(setManual = true) {
    if (setManual) manualStop = true;

    stopListening();

    audio.pause();
    audio.muted = true;

    isPlaying = false;
    playBtn.textContent = "▶";
    playBtn.classList.remove("pulse");

    setStatus("Stopped", setManual ? "Stopped by user" : "Reconnecting…");
    connectionStateEl.textContent = setManual ? "Stopped" : "Reconnecting";

    stopUptime();
    eqStop();
}

export function stopStream() {
    stopStreamInternal(true);
}

// =========================
// ERROR HANDLING
// =========================
function handleError() {
    if (manualStop) return;

    errorCount++;
    errorCountEl.textContent = errorCount;

    setStatus("Error", "Stream failed");
    connectionStateEl.textContent = "Error";

    eqStop();
    scheduleReconnect();
}

function scheduleReconnect() {
    if (manualStop) return;

    setStatus("Reconnecting", "Retrying…", "warn");
    connectionStateEl.textContent = "Reconnecting";

    reconnectTimer = setTimeout(() => {
        lastReconnectEl.textContent = new Date().toLocaleTimeString();
        startStream();
    }, 3000);
}

// =========================
// REAL-TIME LISTENER COUNT
// =========================
onListenerCount((count) => {
    listenerCountEl.textContent = count;

    if (lastListenerCount !== null && count !== lastListenerCount) {
        listenerCountEl.classList.add("pop");
        setTimeout(() => listenerCountEl.classList.remove("pop"), 350);
    }

    lastListenerCount = count;
});

// =========================
// EVENT LISTENERS
// =========================
playBtn.addEventListener("click", () => {
    if (!isPlaying) startStream();
    else stopStream();
});

retryBtn.addEventListener("click", () => {
    stopStream();
    startStream();
});

// =========================
// VOLUME — iPad-safe fix
// =========================
volumeSlider.addEventListener("input", () => {
    const v = parseFloat(volumeSlider.value);

    if (isIOS) {
        volumeValue.textContent = "Use device volume";
        return;
    }

    audio.volume = v;
    volumeValue.textContent = Math.round(v * 100) + "%";
    localStorage.setItem("consoleVolume", v);
});

// =========================
// DIAGNOSTICS TOGGLE
// =========================
diagToggle.addEventListener("click", () => {
    diagnosticsPanel.classList.toggle("open");
    diagToggle.textContent = diagnosticsPanel.classList.contains("open")
        ? "Hide Details ▲"
        : "Show Details ▼";
});

// =========================
// INITIALIZATION
// =========================
const savedVol = localStorage.getItem("consoleVolume");
const initVol = savedVol ? parseFloat(savedVol) : 0.8;
volumeSlider.value = initVol;
volumeValue.textContent = isIOS ? "Use device volume" : Math.round(initVol * 100) + "%";

if (!isIOS) audio.volume = initVol;

setStatus("Idle", "Ready");

// Warm stream (buffer only)
warmStream();

// =========================
// MOBILE PLAYBACK UNLOCK
// =========================
document.addEventListener("touchstart", () => {
    if (isPlaying && audio.paused) audio.play().catch(() => {});
}, { passive: true });

document.addEventListener("click", () => {
    if (isPlaying && audio.paused) audio.play().catch(() => {});
});

// =========================
// PJAX NAVIGATION (player + chat persistent)
// =========================
function isHomepage(url) {
    const u = new URL(url, window.location.origin);
    const path = u.pathname.replace(/\/+$/, "");
    return path === "" || path === "/index.html";
}

function updatePlayerVisibilityForURL(url) {
    const onHome = isHomepage(url);
    if (playerBox) playerBox.style.display = onHome ? "block" : "none";
    if (chatBox) chatBox.style.display = onHome ? "block" : "none";
}

updatePlayerVisibilityForURL(window.location.href);

document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    const isExternal =
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:");

    if (isExternal) return;
    if (href.startsWith("#")) return;

    e.preventDefault();

    const targetURL = new URL(href, window.location.origin).toString();

    fetch(targetURL)
        .then(res => res.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const newWrapper = doc.querySelector(".page-wrapper");
            const currentWrapper = document.querySelector(".page-wrapper");

            if (newWrapper && currentWrapper) {
                currentWrapper.innerHTML = newWrapper.innerHTML;
                history.pushState({}, "", targetURL);
                updatePlayerVisibilityForURL(targetURL);
            }
        })
        .catch(() => window.location.href = href);
});

window.addEventListener("popstate", () => {
    const url = window.location.href;

    fetch(url)
        .then(res => res.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const newWrapper = doc.querySelector(".page-wrapper");
            const currentWrapper = document.querySelector(".page-wrapper");

            if (newWrapper && currentWrapper) {
                currentWrapper.innerHTML = newWrapper.innerHTML;
                updatePlayerVisibilityForURL(url);
            }
        });
});
