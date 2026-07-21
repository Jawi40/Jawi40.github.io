// player.js – Polished Final Version (Professional Radio Mode + Backup Failover + Show Details Fix)

import { startListening, stopListening, onListenerCount } from "./listener-counter.js";

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
let uiLocked = false;

// ===============================
// UI LOCKING
// ===============================
function lockUI()   { uiLocked = true; }
function unlockUI() { uiLocked = false; }

// type:
//  - "ok" / "warn" → internal player status (blocked when uiLocked)
//  - "user"        → user-facing info (Show Details), always allowed
function setStatus(label, detail, type = null) {
    if (uiLocked && type !== "user") return;

    statusLabel.textContent = label;
    statusDetail.textContent = detail;

    liveIndicator.className = "live-indicator";
    if (type === "ok")   liveIndicator.classList.add("live-ok");
    if (type === "warn") liveIndicator.classList.add("live-warn");
}

// ===============================
// UPTIME
// ===============================
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
function eqStart() { equalizer.classList.remove("eq-paused"); }
function eqStop()  { equalizer.classList.add("eq-paused"); }

function initEqualizer() {
    if (!equalizer) return;
    const bars = equalizer.querySelectorAll(".eq-bar");
    bars.forEach((bar, i) => {
        bar.style.animationDelay = `${i * 0.1}s`;
        bar.style.animationDuration = `${0.8 + Math.random() * 0.7}s`;
    });
}

// ===============================
// STREAM HEALTH CHECK
// ===============================
function streamHealthy() {
    return audio.readyState >= 2 && audio.buffered.length > 0;
}

// ===============================
// BACKUP STREAM TEST
// ===============================
async function testBackup() {
    const test = new Audio(BACKUP_STREAM);
    try {
        await test.play();
        test.pause();
        return true;
    } catch {
        return false;
    }
}

// ===============================
// STREAM ENGINE
// ===============================
export async function startStream() {
    manualStop = false;
    mediaOverride = false;
    unlockUI();
    clearTimeout(reconnectTimer);

    audio.src = usingBackup ? BACKUP_STREAM : PRIMARY_STREAM;
    audio.muted = false;

    setStatus("Connecting", usingBackup ? "Backup stream…" : "Initializing…", "user");
    connectionStateEl.textContent = "Connecting";

    try {
        await audio.play();
        isPlaying = true;

        startListening();
        playBtn.textContent = "⏸";
        playBtn.classList.add("pulse");

        setStatus("LIVE", usingBackup ? "Backup active" : "Stream active", "user");
        connectionStateEl.textContent = usingBackup ? "Backup" : "Playing";

        startUptime();
        eqStart();

    } catch (err) {
        handleError();
    }
}

function stopStreamInternal(setManual = true) {
    if (setManual) {
        manualStop = true;
        mediaOverride = true;
        lockUI();
    }

    clearTimeout(reconnectTimer);
    stopListening();

    audio.pause();
    audio.muted = true;

    isPlaying = false;
    playBtn.textContent = "▶";
    playBtn.classList.remove("pulse");

    setStatus("Stopped", setManual ? "Stopped by user" : "Reconnecting…", "user");
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
    if (manualStop || mediaOverride) return;

    errorCount++;
    errorCountEl.textContent = errorCount;

    setStatus("Error", usingBackup ? "Backup failed" : "Stream failed", "user");
    connectionStateEl.textContent = "Error";

    eqStop();

    scheduleReconnect();
}

async function scheduleReconnect() {
    if (manualStop || mediaOverride) return;

    setStatus("Reconnecting", usingBackup ? "Trying backup…" : "Retrying…", "user");
    connectionStateEl.textContent = "Reconnecting";

    reconnectTimer = setTimeout(async () => {
        lastReconnectEl.textContent = new Date().toLocaleTimeString();

        if (!usingBackup && !streamHealthy()) {
            if (await testBackup()) usingBackup = true;
        }

        startStream();
    }, 2000); // Immediate reconnect (Option A)
}

// ===============================
// MEDIA INTERRUPTION
// ===============================
audio.addEventListener("pause", () => {
    if (!manualStop && !mediaOverride) {
        mediaOverride = true;
        stopStreamInternal(true);
    }
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
// INIT
// ===============================
const savedVol = localStorage.getItem("consoleVolume");
const initVol = savedVol ? parseFloat(savedVol) : 0.8;
volumeSlider.value = initVol;
volumeValue.textContent = isIOS ? "Use device volume" : Math.round(initVol * 100) + "%";

if (!isIOS) audio.volume = initVol;

initEqualizer();
setStatus("Idle", "Ready", "user"); // ensures Show Details works on load
audio.preload = "auto";
audio.src = PRIMARY_STREAM;
audio.load();
