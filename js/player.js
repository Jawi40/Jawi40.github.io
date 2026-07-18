// Import listener tracking from Firebase module
import { startListening, stopListening, onListenerCount } from "./listener-counter.js";

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

// =========================
/* STATUS + UI HELPERS */
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
// INSTANT-START WARM STREAM
// =========================
function warmStream() {
    audio.src = STREAM_URL;
    audio.muted = true;
    audio.playsInline = true;

    eqStop();
    audio.load();

    audio.play().catch(() => {
        // Autoplay may be blocked; buffering can still begin
    });
}

// =========================
// AUTO-RECOVERY ENGINE
// =========================
function startStallWatchdog() {
    clearInterval(stallCheckTimer);
    stallCheckTimer = setInterval(() => {
        if (!isPlaying) return;

        const now = audio.currentTime;

        // If time hasn't advanced in 5s → stalled
        if (Math.abs(now - lastTimeUpdate) < 0.01) {
            console.warn("Stream stalled — auto-recovering");
            autoRecover();
        }

        lastTimeUpdate = now;
    }, 5000);
}

// =========================
// HEARTBEAT — CONFIRMS STREAM IS ALIVE
// =========================
function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
        if (!isPlaying) return;

        // If audio is paused but user didn't stop it
        if (audio.paused && !manualStop) {
            console.warn("Heartbeat: audio paused unexpectedly — recovering");
            autoRecover();
        }

        // If audio volume is zero but user didn't mute
        if (audio.volume === 0 && !manualStop) {
            console.warn("Heartbeat: silent stream — recovering");
            autoRecover();
        }
    }, 4000);
}
let heartbeatTimer = null;

function autoRecover() {
    const now = Date.now();
    if (now - lastRecover < 2000) return; // 2s cooldown
    lastRecover = now;

    if (manualStop) return;

    setStatus("Reconnecting", "Restoring stream…", "warn");
    connectionStateEl.textContent = "Reconnecting";

    stopStreamInternal(false);
    setTimeout(() => startStream(), 1500);
}

// Network offline/online
window.addEventListener("offline", () => {
    setStatus("Offline", "Waiting for network…", "warn");
});

window.addEventListener("online", () => {
    autoRecover();
});

// Playback errors
audio.addEventListener("error", () => {
    console.warn("Audio error — auto-recovering");
    autoRecover();
});

// Silence / no data
audio.addEventListener("stalled", () => {
    console.warn("Stream stalled event — auto-recovering");
    autoRecover();
});

// App/tab switching
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isPlaying && audio.paused) {
        console.warn("Returned to app — stream paused — auto-recovering");
        autoRecover();
    }
});

// Audio focus + device change
audio.addEventListener("pause", () => {
    if (manualStop) return;
    if (!isPlaying) return;

    console.warn("Audio paused externally — auto-recovering");
    autoRecover();
});

// Stop stream if user starts other audio
document.addEventListener("play", (e) => {
    if (e.target !== audio) {
        stopStreamInternal(true);
    }
}, true);

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
        if (isPlaying) {
            console.warn("Audio device changed — auto-recovering");
            autoRecover();
        }
    });
}

// =========================
// STREAM ENGINE
// =========================
export async function startStream() {
    manualStop = false;
    clearTimeout(reconnectTimer);

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
    warmStream();
}

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

// Volume (simple, compatible)
volumeSlider.addEventListener("input", () => {
    const v = parseFloat(volumeSlider.value);
    audio.volume = v;
    volumeValue.textContent = Math.round(v * 100) + "%";
    localStorage.setItem("consoleVolume", v);
});

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
volumeValue.textContent = Math.round(initVol * 100) + "%";
audio.volume = initVol;

setStatus("Idle", "Ready");

// =========================
// MOBILE PLAYBACK UNLOCK
// =========================
document.addEventListener("touchstart", () => {
    if (isPlaying && audio.paused) {
        audio.play().catch(() => {});
    }
}, { passive: true });

document.addEventListener("click", () => {
    if (isPlaying && audio.paused) {
        audio.play().catch(() => {});
    }
});

// Warm the stream immediately for instant playback
warmStream();
