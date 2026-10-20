// player-wasm-webaudio.js – Stable MP3 WebAudio engine using mpg123-decoder (WASM)

import { startListening, stopListening, onListenerCount, listenerId } from "./listener-counter.js";
import { db } from "./firebase-init.js";
import { set, ref } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// IMPORTANT: install decoder via:
//   npm i mpg123-decoder
// and bundle it, or load via <script src="mpg123-decoder.min.js" charset="UTF-8"></script>
// Here we assume ES module import:
import { MPEGDecoder } from "mpg123-decoder";

const PRIMARY_STREAM = "https://stream.zeno.fm/axipqkdhsiitv.mp3";
const BACKUP_STREAM  = "https://stream.zeno.fm/axipqkdhsiitv.mp3"; // backup must also be MPEG
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

// DOM
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

// STATE – engine
let audioCtx = null;
let gainNode = null;
let sourceNode = null;
let isPlaying = false;
let manualStop = false;
let usingBackup = false;
let reconnectTimer = null;
let errorCount = 0;
let uptimeTimer = null;
let startTime = null;
let interruptionActive = false;
let lastChunkTime = 0;
let currentStreamUrl = PRIMARY_STREAM;
let readerAbortController = null;

// WASM decoder
let decoder = null;
let decoderReady = false;

// audio focus
let hasAudioFocus = true;

// ===============================
// STATUS
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
// AUDIO ENGINE INIT
// ===============================
async function initAudioEngine() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);

        const v = parseFloat(volumeSlider.value || "0.8");
        if (!isIOS) gainNode.gain.value = v;
    }

    if (!decoder) {
        decoder = new MPEGDecoder();
        await decoder.ready; // wait for WASM compile
        decoderReady = true;
    }
}

// ===============================
// STREAM FETCH + DECODE (WASM)
// ===============================
async function fetchStream(url) {
    if (readerAbortController && typeof readerAbortController.abort === "function") {
        readerAbortController.abort();
    }
    readerAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;

    const response = await fetch(url, readerAbortController ? { signal: readerAbortController.signal } : {});
    const reader = response.body.getReader();

    // reset decoder state for new stream
    if (decoderReady) {
        await decoder.reset();
    }

    while (true) {
        const { value, done } = await reader.read();
        if (done || !isPlaying || interruptionActive || manualStop) break;
        lastChunkTime = Date.now();

        // value is Uint8Array of MPEG data
        try {
            const { channelData, samplesDecoded, sampleRate } = decoder.decode(value);
            if (samplesDecoded > 0) {
                playPcm(channelData, sampleRate);
            }
        } catch (e) {
            handleError();
            break;
        }
    }
}

// push PCM into WebAudio
function playPcm(channelData, sampleRate) {
    if (!audioCtx || !gainNode || !decoderReady) return;
    if (!isPlaying || interruptionActive || manualStop) return;

    const channels = channelData.length;
    const length = channelData[0].length;

    const buffer = audioCtx.createBuffer(channels, length, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
        buffer.getChannelData(ch).set(channelData[ch]);
    }

    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(gainNode);
    sourceNode.start();
}

// ===============================
// STALL DETECTION
// ===============================
setInterval(() => {
    if (!isPlaying || interruptionActive || manualStop) return;
    if (Date.now() - lastChunkTime > 3000) {
        scheduleReconnect();
    }
}, 1000);

// ===============================
// STREAM ENGINE – START/STOP
// ===============================
export async function startStream() {
    if (interruptionActive || !hasAudioFocus) return;

    await initAudioEngine();
    manualStop = false;
    clearTimeout(reconnectTimer);

    currentStreamUrl = usingBackup ? BACKUP_STREAM : PRIMARY_STREAM;
    streamUrlText.textContent = currentStreamUrl;

    setStatus(
        "Connecting",
        usingBackup ? "Initializing backup stream" : "Initializing primary stream",
        "user"
    );
    connectionStateEl.textContent = "Connecting";

    try {
        isPlaying = true;
        startListening();
        playBtn.textContent = "⏸";
        playBtn.classList.add("pulse");
        startUptime();
        eqStart();

        await fetchStream(currentStreamUrl);

        if (!isPlaying || manualStop || interruptionActive) return;

        setStatus(
            "LIVE",
            usingBackup ? "Backup stream active" : "Primary stream active",
            "ok"
        );
        connectionStateEl.textContent = usingBackup ? "Backup" : "Playing";

    } catch (e) {
        handleError();
    }
}

function stopStreamInternal(setManual = true) {
    if (setManual) manualStop = true;

    isPlaying = false;
    clearTimeout(reconnectTimer);

    if (readerAbortController && typeof readerAbortController.abort === "function") {
        readerAbortController.abort();
        readerAbortController = null;
    }

    if (sourceNode) {
        try { sourceNode.stop(); } catch {}
        sourceNode = null;
    }

    stopListening();
    stopUptime();
    eqStop();

    playBtn.textContent = "▶";
    playBtn.classList.remove("pulse");

    setStatus(
        "Stopped",
        setManual ? "Stopped by user" : "Stopped by system / interruption",
        "user"
    );
    connectionStateEl.textContent = "Stopped";
}

export function stopStream() {
    stopStreamInternal(true);
}

// ===============================
// ERROR + RECONNECT
// ===============================
function handleError() {
    if (manualStop || interruptionActive) return;

    errorCount++;
    errorCountEl.textContent = errorCount;

    setStatus(
        "Error",
        usingBackup ? "Backup stream failure" : "Primary stream failure",
        "warn"
    );
    connectionStateEl.textContent = "Error";

    eqStop();
    scheduleReconnect();
}

async function scheduleReconnect() {
    if (manualStop || interruptionActive) return;

    clearTimeout(reconnectTimer);

    setStatus(
        "Reconnecting",
        usingBackup ? "Attempting backup recovery" : "Attempting primary recovery",
        "user"
    );
    connectionStateEl.textContent = "Reconnecting";

    reconnectTimer = setTimeout(async () => {
        lastReconnectEl.textContent = new Date().toLocaleTimeString();

        if (!usingBackup) {
            try {
                const testResp = await fetch(BACKUP_STREAM, { method: "HEAD" });
                if (testResp.ok) usingBackup = true;
            } catch {
                // ignore backup test errors
            }
        }

        startStream();
    }, 2000);
}

// ===============================
// INTERRUPTION + AUDIO FOCUS
// ===============================
function onInterruptionStart(reason = "system") {
    interruptionActive = true;
    hasAudioFocus = false;
    if (isPlaying) stopStreamInternal(false);
    setStatus("Standby", `Audio interrupted by ${reason}`, "warn");
    connectionStateEl.textContent = "Standby";
}

function onInterruptionEnd() {
    interruptionActive = false;
    hasAudioFocus = true;
    if (!manualStop) startStream();
}

// iOS AudioSession
if (navigator.audioSession) {
    navigator.audioSession.type = "playback";

    navigator.audioSession.addEventListener("statechange", () => {
        const state = navigator.audioSession.state;
        if (state === "interrupted") {
            onInterruptionStart("system");
        }
        if (state === "active") {
            onInterruptionEnd();
        }
    });
}

// Android MediaSession
if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "none";

    navigator.mediaSession.setActionHandler("play", () => {
        hasAudioFocus = true;
        navigator.mediaSession.playbackState = "playing";
        if (!manualStop) startStream();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
        hasAudioFocus = false;
        navigator.mediaSession.playbackState = "paused";
        if (isPlaying) stopStreamInternal(false);
        setStatus("Standby", "Audio paused by system or other media", "warn");
        connectionStateEl.textContent = "Standby";
    });

    navigator.mediaSession.setActionHandler("stop", () => {
        hasAudioFocus = false;
        navigator.mediaSession.playbackState = "none";
        stopStream();
    });
}

// ===============================
// VISIBILITY (analytics only)
// ===============================
document.addEventListener("visibilitychange", () => {
    if (document.hidden && listenerId) {
        const listenerRef = ref(db, "3@R5/" + listenerId);
        set(listenerRef, {
            mode: "passive",
            timestamp: Date.now()
        });
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
// VOLUME (WebAudio gain)
// ===============================
volumeSlider.addEventListener("input", () => {
    const v = parseFloat(volumeSlider.value);

    if (isIOS) {
        volumeValue.textContent = "Use device volume";
        return;
    }

    if (gainNode) gainNode.gain.value = v;
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

initEqualizer();

setStatus(
    "Idle",
    "Ready — WASM MP3 engine initialized",
    "user"
);
