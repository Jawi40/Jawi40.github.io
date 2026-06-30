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

function fadeIn() {
    let v = 0;
    const target = parseFloat(volumeSlider.value);
    audio.volume = 0;
    const interval = setInterval(() => {
        v += 0.05;
        audio.volume = Math.min(v, target);
        if (v >= target) clearInterval(interval);
    }, 40);
}

function fadeOut(callback) {
    let v = audio.volume;
    const interval = setInterval(() => {
        v -= 0.05;
        audio.volume = Math.max(v, 0);
        if (v <= 0) {
            clearInterval(interval);
            if (callback) callback();
        }
    }, 40);
}

function eqStart() {
    equalizer.classList.remove("eq-paused");
}

function eqStop() {
    equalizer.classList.add("eq-paused");
}

// =========================
// STREAM ENGINE (CLEAN, WORKING)
// =========================
export async function startStream() {
    manualStop = false;
    clearTimeout(reconnectTimer);

    audio.src = STREAM_URL;
    audio.muted = false;
    audio.autoplay = false;
    audio.playsInline = true;

    setStatus("Connecting", "Initializing…", "warn");
    connectionStateEl.textContent = "Connecting";

    try {
        await audio.play();
        isPlaying = true;

        // Firebase listener tracking
        startListening();

        playBtn.textContent = "⏸";
        playBtn.classList.add("pulse");

        setStatus("LIVE", "Stream active", "ok");
        connectionStateEl.textContent = "Playing";

        startUptime();
        fadeIn();
        eqStart();
    } catch (err) {
        handleError();
    }
}

export function stopStream() {
    manualStop = true;

    stopListening();

    fadeOut(() => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();

        isPlaying = false;
        playBtn.textContent = "▶";
        playBtn.classList.remove("pulse");

        setStatus("Stopped", "Stopped by user");
        connectionStateEl.textContent = "Stopped";

        stopUptime();
        eqStop();
    });
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
// REAL-TIME LISTENER COUNT (FIREBASE)
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
