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
// AUDIO ENGINE (iOS + Android SAFE)
// =========================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let gainNode = audioCtx.createGain();
let source = null;

// MUST be called AFTER resume()
function connectAudioGraph() {
    if (source) return; // prevent duplicate nodes
    source = audioCtx.createMediaElementSource(audio);
    source.connect(gainNode).connect(audioCtx.destination);
}

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
// FADE USING GAIN NODE
// =========================
function fadeIn() {
    let v = 0;
    const target = parseFloat(volumeSlider.value);
    gainNode.gain.value = 0;

    const interval = setInterval(() => {
        v += 0.05;
        gainNode.gain.value = Math.min(v, target);
        if (v >= target) clearInterval(interval);
    }, 40);
}

function fadeOut(callback) {
    let v = gainNode.gain.value;

    const interval = setInterval(() => {
        v -= 0.05;
        gainNode.gain.value = Math.max(v, 0);
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
// STREAM ENGINE
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
        gainNode.gain.value = parseFloat(volumeSlider.value);

        await audio.play();
        isPlaying = true;

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
playBtn.addEventListener("click", async () => {
    await audioCtx.resume();   // REQUIRED for iOS + Android
    connectAudioGraph();       // REQUIRED after resume

    if (!isPlaying) startStream();
    else stopStream();
});

retryBtn.addEventListener("click", async () => {
    await audioCtx.resume();
    connectAudioGraph();
    stopStream();
    startStream();
});

volumeSlider.addEventListener("input", () => {
    const v = parseFloat(volumeSlider.value);
    gainNode.gain.value = v;
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
gainNode.gain.value = initVol;

setStatus("Idle", "Ready");
