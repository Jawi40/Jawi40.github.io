// player.js
// Infin8Radio persistent player + chat (PJAX-free, final fixes)

import { startListening, stopListening, onListenerCount } from "./listener-counter.js";

const PRIMARY_STREAM = "https://stream.zeno.fm/axipqkdhsiitv.mp3";
const BACKUP_STREAM = "https://stream.zeno.fm/axipqkdhsiitv.aac";
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
let mediaOverride = false; // user chose other media, do not auto-recover
let reconnectTimer = null;
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
// DISABLE RECOVERY
// ===============================
function disableRecovery() {
    clearTimeout(reconnectTimer);
}

// ===============================
// STREAM ENGINE + FAILOVER
// ===============================
export async function startStream() {
    manualStop = false;
    mediaOverride = false;
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
    if (manualStop || mediaOverride) return;

    errorCount++;
    errorCountEl.textContent = errorCount;

    setStatus("Error", usingBackup ? "Backup failed" : "Stream failed");
    connectionStateEl.textContent = "Error";

    eqStop();

    scheduleReconnect();
}

function scheduleReconnect() {
    if (manualStop || mediaOverride) return;

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
        mediaOverride = true;
        manualStop = true;
        isPlaying = false;
        disableRecovery();
        stopStreamInternal(true);
    }
}, true);

// ===============================
// FOCUS LOSS FIX
// ===============================
document.addEventListener("visibilitychange", () => {
    if (manualStop || mediaOverride) return;
    if (!isPlaying) return;
    if (document.visibilityState !== "visible") return;
    if (audio.paused) return;
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
    if (manualStop || mediaOverride) return;
    if (isPlaying && audio.paused) audio.play().catch(() => {});
}, { passive: true });

document.addEventListener("click", () => {
    if (manualStop || mediaOverride) return;
    if (isPlaying && audio.paused) audio.play().catch(() => {});
});
