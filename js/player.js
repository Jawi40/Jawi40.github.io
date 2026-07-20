// player.js
// Infin8Radio persistent player + chat with PJAX navigation

import { startListening, stopListening, onListenerCount } from "./listener-counter.js";

const PRIMARY_STREAM = "https://stream.zeno.fm/axipqkdhsiitv.mp3";
const BACKUP_STREAM = "https://stream.zeno.fm/axipqkdhsiitv.aac"; // fallback example
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

// DOM
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

const playerBox = document.querySelector(".player-box");
const chatBox = document.querySelector(".chat-box");

streamUrlText.textContent = PRIMARY_STREAM;

// STATE
let isPlaying = false;
let manualStop = false;
let reconnectTimer = null;
let stallCheckTimer = null;
let heartbeatTimer = null;
let lastTimeUpdate = 0;
let lastRecover = 0;
let errorCount = 0;
let uptimeTimer = null;
let startTime = null;
let lastListenerCount = null;
let usingBackup = false;

// ===============================
// STATUS + UI
// ===============================
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
        uptimeEl.textContent = Math.floor((Date.now() - startTime) / 1000) + "s";
    }, 1000);
}

function stopUptime() {
    clearInterval(uptimeTimer);
    uptimeEl.textContent = "0s";
}

// ===============================
// EQUALIZER
// ===============================
function eqStart() {
    equalizer.classList.remove("eq-paused");
}

function eqStop() {
    equalizer.classList.add("eq-paused");
}

function initEqualizer() {
    if (!equalizer) return;
    const bars = equalizer.querySelectorAll(".eq-bar");
    bars.forEach((bar, i) => {
        bar.style.animationDelay = `${i * 0.1}s`;
        bar.style.animationDuration = `${0.8 + Math.random() * 0.7}s`;
    });
}

// ===============================
// WARM STREAM
// ===============================
function warmStream() {
    audio.src = PRIMARY_STREAM;
    audio.muted = true;
    audio.playsInline = true;
    eqStop();
    audio.load();
}

// ===============================
// AUTO-RECOVERY ENGINE + FAILOVER
// ===============================
function startStallWatchdog() {
    clearInterval(stallCheckTimer);
    stallCheckTimer = setInterval(() => {
        if (!isPlaying) return;

        const now = audio.currentTime;
        if (Math.abs(now - lastTimeUpdate) < 0.01) autoRecover();
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

    setStatus("Reconnecting", usingBackup ? "Backup stream…" : "Restoring stream…", "warn");
    connectionStateEl.textContent = "Reconnecting";

    stopStreamInternal(false);
    setTimeout(() => startStream(), 1500);
}

// ===============================
// DISABLE RECOVERY
// ===============================
function disableRecovery() {
    clearInterval(stallCheckTimer);
    clearInterval(heartbeatTimer);
    clearTimeout(reconnectTimer);
}

// ===============================
// STREAM ENGINE + FAILOVER
// ===============================
export async function startStream() {
    manualStop = false;
    clearTimeout(reconnectTimer);

    audio.src = usingBackup ? BACKUP_STREAM : PRIMARY_STREAM;
    audio.muted = false;

    setStatus("Connecting", usingBackup ? "Backup stream…" : "Initializing…", "warn");
    connectionStateEl.textContent = "Connecting";

    try {
        await audio.play();
        isPlaying = true;

        startListening();
        playBtn.textContent = "⏸";
        playBtn.classList.add("pulse");

        setStatus("LIVE", usingBackup ? "Backup active" : "Stream active", "ok");
        connectionStateEl.textContent = usingBackup ? "Backup" : "Playing";

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

    disableRecovery();
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

// ===============================
// ERROR HANDLING + FAILOVER
// ===============================
function handleError() {
    if (manualStop) return;

    errorCount++;
    errorCountEl.textContent = errorCount;

    setStatus("Error", usingBackup ? "Backup failed" : "Stream failed");
    connectionStateEl.textContent = "Error";

    eqStop();

    if (!usingBackup) {
        usingBackup = true;
        scheduleReconnect();
    } else {
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (manualStop) return;

    setStatus("Reconnecting", usingBackup ? "Trying backup…" : "Retrying…", "warn");
    connectionStateEl.textContent = "Reconnecting";

    reconnectTimer = setTimeout(() => {
        lastReconnectEl.textContent = new Date().toLocaleTimeString();
        startStream();
    }, 3000);
}

// ===============================
// LISTENER COUNT
// ===============================
onListenerCount((count) => {
    listenerCountEl.textContent = count;

    if (lastListenerCount !== null && count !== lastListenerCount) {
        listenerCountEl.classList.add("pop");
        setTimeout(() => listenerCountEl.classList.remove("pop"), 350);
    }

    lastListenerCount = count;
});

// ===============================
// BUTTONS
// ===============================
playBtn.addEventListener("click", () => {
    if (!isPlaying) startStream();
    else stopStream();
});

retryBtn.addEventListener("click", () => {
    stopStream();
    usingBackup = false;
    startStream();
});

// ===============================
// VOLUME
// ===============================
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

// ===============================
// MEDIA INTERRUPTION
// ===============================
document.addEventListener("play", (e) => {
    if (e.target !== audio) {
        manualStop = true;
        disableRecovery();
        stopStreamInternal(true);
    }
}, true);

// ===============================
// FOCUS LOSS FIX
// ===============================
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        if (isPlaying && audio.paused && !manualStop) {
            audio.play().catch(() => {});
        }
    }
});

// ===============================
// INIT
// ===============================
const savedVol = localStorage.getItem("consoleVolume");
const initVol = savedVol ? parseFloat(savedVol) : 0.8;
volumeSlider.value = initVol;
volumeValue.textContent = isIOS ? "Use device volume" : Math.round(initVol * 100) + "%";

if (!isIOS) audio.volume = initVol;

initEqualizer();
setStatus("Idle", "Ready");
warmStream();

// ===============================
// MOBILE PLAYBACK UNLOCK
// ===============================
document.addEventListener("touchstart", () => {
    if (isPlaying && audio.paused) audio.play().catch(() => {});
}, { passive: true });

document.addEventListener("click", () => {
    if (isPlaying && audio.paused) audio.play().catch(() => {});
});

// ===============================
// PJAX NAVIGATION
// ===============================
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

    const mobileNav = document.getElementById("mobile-nav");
    if (mobileNav) mobileNav.style.display = "none";

    const hamburger = document.querySelector(".hamburger");
    if (hamburger) hamburger.classList.remove("open");

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
    const mobileNav = document.getElementById("mobile-nav");
    if (mobileNav) mobileNav.style.display = "none";

    const hamburger = document.querySelector(".hamburger");
    if (hamburger) hamburger.classList.remove("open");

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
