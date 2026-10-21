// =========================================================
// Infin8Radio – Stable HTML5 Audio Player
// =========================================================

import { startListening, stopListening, onListenerCount, listenerId } from "./listener-counter.js";
import { db } from "./firebase-init.js";
import { set, ref } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// STREAMS
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
let usingBackup = false;
let reconnectTimer = null;
let errorCount = 0;
let uptimeTimer = null;
let startTime = null;
let stallTimer = null;

// =========================================================
// STATUS
// =========================================================
function setStatus(label, detail, type = "user") {
    statusLabel.textContent = label;
    statusDetail.textContent = detail;

    diagStatusLabel.textContent = label;
    diagStatusDetail.textContent = detail;

    liveIndicator.className = "live-indicator";
    if (type === "ok") liveIndicator.classList.add("live-ok");
    if (type === "warn") liveIndicator.classList.add("live-warn");
}

// =========================================================
// UPTIME
// =========================================================
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

// =========================================================
// EQUALIZER
// =========================================================
function eqStart() { equalizer.classList.remove("eq-paused"); }
function eqStop()  { equalizer.classList.add("eq-paused"); }

function initEqualizer() {
    const bars = equalizer.querySelectorAll(".eq-bar");
    bars.forEach((bar, i) => {
        bar.style.animationDelay = `${i * 0.1}s`;
        bar.style.animationDuration = `${0.8 + Math.random() * 0.7}s`;
    });
}

// =========================================================
// STALL DETECTION
// =========================================================
function startStallWatchdog() {
    clearInterval(stallTimer);
    stallTimer = setInterval(() => {
        if (!isPlaying || manualStop) return;

        if (audio.networkState === 3 || audio.readyState < 2) {
            scheduleReconnect();
        }
    }, 3000);
}

function stopStallWatchdog() {
    clearInterval(stallTimer);
}

// =========================================================
// STREAM ENGINE
// =========================================================
export async function startStream() {
    manualStop = false;
    clearTimeout(reconnectTimer);

    audio.src = usingBackup ? BACKUP_STREAM : PRIMARY_STREAM;
    audio.muted = false;

    setStatus("Connecting", "Preparing audio pipeline", "user");
    connectionStateEl.textContent = "Connecting";

    try {
        await audio.play();
        isPlaying = true;

        startListening();
        playBtn.textContent = "⏸";
        playBtn.classList.add("pulse");

        setStatus("LIVE", usingBackup ? "Backup stream active" : "Primary stream active", "ok");
        connectionStateEl.textContent = usingBackup ? "Backup" : "Playing";

        startUptime();
        eqStart();
        startStallWatchdog();

    } catch {
        handleError();
    }
}

function stopStreamInternal(setManual = true) {
    if (setManual) manualStop = true;

    clearTimeout(reconnectTimer);
    stopListening();
    stopStallWatchdog();

    audio.pause();
    audio.muted = true;

    isPlaying = false;
    playBtn.textContent = "▶";
    playBtn.classList.remove("pulse");

    setStatus("Stopped", setManual ? "Stopped by user" : "Reconnecting", "warn");
    connectionStateEl.textContent = setManual ? "Stopped" : "Reconnecting";

    stopUptime();
    eqStop();
}

export function stopStream() {
    stopStreamInternal(true);
}

// =========================================================
// ERROR + FAILOVER
// =========================================================
function handleError() {
    if (manualStop) return;

    errorCount++;
    errorCountEl.textContent = errorCount;

    setStatus("Error", "Stream failure — retry scheduled", "warn");
    connectionStateEl.textContent = "Error";

    eqStop();
    scheduleReconnect();
}

async function scheduleReconnect() {
    if (manualStop) return;

    clearTimeout(reconnectTimer);

    setStatus("Reconnecting", "Attempting recovery", "warn");
    connectionStateEl.textContent = "Reconnecting";

    reconnectTimer = setTimeout(async () => {
        lastReconnectEl.textContent = new Date().toLocaleTimeString();

        if (!usingBackup) {
            const test = new Audio();
            test.src = BACKUP_STREAM;
            try {
                await test.play();
                usingBackup = true;
            } catch {}
        }

        startStream();
    }, 2000);
}

// =========================================================
// MEDIA INTERRUPTION
// =========================================================
audio.addEventListener("pause", () => {
    if (!manualStop && audio.readyState > 0) {
        stopStreamInternal(false);
    }
});

// =========================================================
// LISTENER COUNT
// =========================================================
onListenerCount((count) => {
    listenerCountEl.textContent = count;
    listenerCountEl.classList.add("pop");
    setTimeout(() => listenerCountEl.classList.remove("pop"), 350);
});

// =========================================================
// BUTTONS
// =========================================================
playBtn.addEventListener("click", () => {
    if (!isPlaying) startStream();
    else stopStream();
});

retryBtn.addEventListener("click", () => {
    stopStream();
    usingBackup = false;
    startStream();
});

// =========================================================
// VOLUME
// =========================================================
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

// =========================================================
// INIT
// =========================================================
const savedVol = localStorage.getItem("consoleVolume");
const initVol = savedVol ? parseFloat(savedVol) : 0.8;
volumeSlider.value = initVol;
volumeValue.textContent = isIOS ? "Use device volume" : Math.round(initVol * 100) + "%";

if (!isIOS) audio.volume = initVol;

initEqualizer();

setStatus("Idle", "Ready — waiting for stream", "user");

audio.preload = "auto";
audio.src = PRIMARY_STREAM;
