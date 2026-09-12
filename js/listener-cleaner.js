// player.js – OPTIMIZED + SELF-HEALING + LIVE STABILIZER + LISTENER INTEGRITY GUARD

import { startListening, stopListening, onListenerCount, listenerId } from "./listener-counter.js";
import { db } from "./firebase-init.js";
import { set, ref } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

const PRIMARY_STREAM = "https://stream.zeno.fm/axipqkdhsiitv.mp3";
const BACKUP_STREAM  = "https://stream.zeno.fm/axipqkdhsiitv.aac";
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

const diagStatusLabel = document.getElementById("diagStatusLabel");
const diagStatusDetail = document.getElementById("diagStatusDetail");

const errorCountEl = document.getElementById("errorCount");
const lastReconnectEl = document.getElementById("lastReconnect");
const connectionStateEl = document.getElementById("connectionState");
const uptimeEl = document.getElementById("uptime");
const streamUrlText = document.getElementById("streamUrlText");
const listenerCountEl = document.getElementById("listenerCount");
const equalizer = document.getElementById("equalizer");

streamUrlText.textContent = PRIMARY_STREAM;

// STATE
let isPlaying = false;
let manualStop = false;
let mediaOverride = false;
let usingBackup = false;
let reconnectTimer = null;
let errorCount = 0;
let uptimeTimer = null;
let startTime = null;
let visTimer = null;
let backupTester = null;

// self-healing / stabilizer
let healthTimer = null;
let lastTime = 0;
let standbyMode = false;
let lastStableTime = 0;
let stallScore = 0;
let silentScore = 0;

// listener integrity guard
let heartbeatTimer = null;

// ===============================
// STATUS SYSTEM
// ===============================
function setStatus(label, detail, type = "user") {
    statusLabel.textContent = label;
    statusDetail.textContent = detail;

    diagStatusLabel.textContent = label;
    diagStatusDetail.textContent = detail;

    liveIndicator.className = "live-indicator";
    if (type === "ok")   liveIndicator.classList.add("live-ok");
    if (type === "warn") liveIndicator.classList.add("live-warn");
}

// ===============================
// LISTENER INTEGRITY GUARD
// ===============================
function markListenerInactive() {
    if (listenerId) {
        const listenerRef = ref(db, "users/" + listenerId);
        set(listenerRef, {
            listening: false,
            timestamp: Date.now()
        });
    }
}

function startHeartbeat() {
    clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
        if (listenerId && isPlaying) {
            const listenerRef = ref(db, "users/" + listenerId);
            set(listenerRef, {
                listening: true,
                timestamp: Date.now()
            });
        }
    }, 15000);
}

function stopHeartbeat() {
    clearInterval(heartbeatTimer);
}

// ===============================
// UPTIME
// ===============================
function startUptime() {
    startTime = Date.now();
    clearInterval(uptimeTimer);
    uptimeTimer = setInterval(() => {
        const seconds = ((Date.now() - startTime) / 1000) | 0;
        uptimeEl.textContent = seconds + "s";
    }, 1000);
}

function stopUptime() {
    clearInterval(uptimeTimer);
    uptimeEl.textContent = "0s";
}

// ===============================
// EQUALIZER
// ===============================
function eqStart() { equalizer.classList.remove("eq-paused"); }
function eqStop()  { equalizer.classList.add("eq-paused"); }

function initEqualizer() {
    const bars = equalizer.querySelectorAll(".eq-bar");
    bars.forEach((bar, i) => {
        if (!bar.dataset.duration) {
            bar.dataset.duration = `${0.8 + Math.random() * 0.7}s`;
        }
        bar.style.animationDelay = `${i * 0.1}s`;
        bar.style.animationDuration = bar.dataset.duration;
    });
}

// ===============================
// STREAM HEALTH CHECK
// ===============================
function streamHealthy() {
    return audio.networkState !== 3 && audio.currentTime > 0;
}

// ===============================
// BACKUP STREAM TEST
// ===============================
async function testBackup() {
    if (!backupTester) backupTester = new Audio();
    backupTester.src = BACKUP_STREAM;

    try {
        await backupTester.play();
        backupTester.pause();
        return true;
    } catch {
        return false;
    }
}

// ===============================
// LIVE STREAM STABILIZER HELPERS
// ===============================
function softPipelineRefresh() {
    audio.pause();
    audio.play().catch(() => {});
}

function microSeekForward() {
    try {
        audio.currentTime += 0.5;
    } catch {}
}

function applyLocalFallbackIfNeeded() {
    softPipelineRefresh();
}

// ===============================
// SELF-HEALING WATCHDOG
// ===============================
function startHealthWatchdog() {
    clearInterval(healthTimer);
    if (!isPlaying) return;

    lastStableTime = Date.now();
    stallScore = 0;
    silentScore = 0;

    healthTimer = setInterval(() => {
        if (!isPlaying || manualStop || standbyMode) return;

        const now = Date.now();

        if (audio.currentTime === lastTime && audio.networkState !== 3) {
            stallScore++;
            softPipelineRefresh();
        } else {
            stallScore = Math.max(0, stallScore - 1);
            lastStableTime = now;
        }

        lastTime = audio.currentTime;

        if (audio.networkState === 3) {
            silentScore++;
            applyLocalFallbackIfNeeded();
        } else {
            silentScore = Math.max(0, silentScore - 1);
        }

        if (stallScore >= 3 || silentScore >= 3) {
            scheduleReconnect();
            stallScore = 0;
            silentScore = 0;
        }

    }, 2000);
}

function stopHealthWatchdog() {
    clearInterval(healthTimer);
}

// ===============================
// STREAM ENGINE
// ===============================
export async function startStream() {
    manualStop = false;
    mediaOverride = false;
    standbyMode = false;
    clearTimeout(reconnectTimer);

    audio.src = usingBackup ? BACKUP_STREAM : PRIMARY_STREAM;
    audio.muted = false;

    setStatus(
        "Connecting",
        usingBackup
            ? "Initializing backup stream — checking stability"
            : "Initializing primary stream — preparing audio pipeline",
        "user"
    );
    connectionStateEl.textContent = "Connecting";

    try {
        await audio.play();
        isPlaying = true;

        if (!listenerId) startListening();
        startHeartbeat();

        playBtn.textContent = "⏸";
        playBtn.classList.add("pulse");

        setStatus(
            "LIVE",
            usingBackup
                ? "Backup stream active — monitoring stability"
                : "Primary stream active — monitoring stability",
            "user"
        );
        connectionStateEl.textContent = usingBackup ? "Backup" : "Playing";

        startUptime();
        eqStart();
        startHealthWatchdog();

    } catch {
        handleError();
    }
}

function stopStreamInternal(setManual = true) {
    if (setManual) {
        manualStop = true;
        mediaOverride = true;
        standbyMode = false;
    }

    markListenerInactive();
    stopHeartbeat();

    clearTimeout(reconnectTimer);
    stopListening();
    stopHealthWatchdog();

    audio.pause();
    audio.muted = true;

    isPlaying = false;
    playBtn.textContent = "▶";
    playBtn.classList.remove("pulse");

    setStatus(
        "Stopped",
        setManual
            ? "Stopped by user — audio pipeline closed"
            : "Reconnecting — attempting recovery",
        "user"
    );
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
    if (manualStop || mediaOverride || standbyMode) return;

    markListenerInactive();
    stopHeartbeat();

    errorCount++;
    errorCountEl.textContent = errorCount;

    setStatus(
        "Error",
        usingBackup
            ? "Backup stream failure — retry scheduled"
            : "Primary stream failure — retry scheduled",
        "user"
    );
    connectionStateEl.textContent = "Error";

    eqStop();
    scheduleReconnect();
}

async function scheduleReconnect() {
    if (manualStop || mediaOverride || standbyMode) return;

    markListenerInactive();
    stopHeartbeat();

    clearTimeout(reconnectTimer);

    setStatus(
        "Reconnecting",
        usingBackup
            ? "Attempting backup recovery — checking stream health"
            : "Attempting primary recovery — checking stream health",
        "user"
    );
    connectionStateEl.textContent = "Reconnecting";

    reconnectTimer = setTimeout(async () => {
        lastReconnectEl.textContent = new Date().toLocaleTimeString();

        if (!usingBackup && !streamHealthy()) {
            if (await testBackup()) usingBackup = true;
        }

        startStream();
    }, 2000);
}

// ===============================
// MEDIA INTERRUPTION + STANDBY
// ===============================
audio.addEventListener("pause", () => {
    if (manualStop) return;

    if (document.hidden || audio.readyState === 0) {
        standbyMode = true;
        isPlaying = false;

        markListenerInactive();
        stopHeartbeat();
        stopHealthWatchdog();
        eqStop();

        setStatus(
            "Standby",
            "Another media source is active — waiting to resume",
            "warn"
        );
        connectionStateEl.textContent = "Standby";
        playBtn.textContent = "▶";
        playBtn.classList.remove("pulse");
        stopUptime();
        return;
    }

    if (!mediaOverride) {
        handleError();
    }
});

// ===============================
// VISIBILITY CHANGE
// ===============================
document.addEventListener("visibilitychange", () => {
    clearTimeout(visTimer);
    visTimer = setTimeout(() => {
        if (!document.hidden && standbyMode && !manualStop) {
            standbyMode = false;
            startStream();
        }

        if (document.hidden && listenerId) {
            const listenerRef = ref(db, "users/" + listenerId);
            set(listenerRef, {
                listening: false,
                timestamp: Date.now()
            });
        }
    }, 150);
});

// ===============================
// LISTENER COUNT
// ===============================
onListenerCount((count) => {
    listenerCountEl.textContent = count;
    listenerCountEl.classList.add("pop");
    setTimeout(() => listenerCountEl.classList.remove("pop"), 350);
});

// ===============================
// BUTTONS
// ===============================
playBtn.addEventListener("click", () => {
    if (!isPlaying && !standbyMode) startStream();
    else stopStream();
});

retryBtn.addEventListener("click", () => {
    stopStream();
    usingBackup = false;
    standbyMode = false;
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
// INIT
// ===============================
const savedVol = localStorage.getItem("consoleVolume");
const initVol = savedVol ? parseFloat(savedVol) : 0.8;
volumeSlider.value = initVol;
volumeValue.textContent = isIOS ? "Use device volume" : Math.round(initVol * 100) + "%";

if (!isIOS) audio.volume = initVol;

initEqualizer();

setStatus(
    "Idle",
    "Ready — waiting for stream initialization",
    "user"
);

audio.preload = "auto";
audio.src = PRIMARY_STREAM;
