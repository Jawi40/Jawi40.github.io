// ======================================================
// INFIN8 RADIO — CLEAN, STABLE PLAYER ENGINE (FULL FILE)
// ======================================================

// STREAMS
const PRIMARY_STREAM = "https://stream.zeno.fm/axipqkdhsiitv.mp3";
const BACKUP_STREAM  = "https://stream.zeno.fm/axipqkdhsiitv.aac";

// DOM ELEMENTS — MATCHING YOUR ORIGINAL UI
const audio = document.getElementById("radioAudio");
const playBtn = document.getElementById("playBtn");
const retryBtn = document.getElementById("retryBtn");

const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");

// STATUS DROPDOWN (YOUR ORIGINAL IDs)
const statusLabel  = document.getElementById("consoleStatusLabel");
const statusDetail = document.getElementById("consoleStatusDetail");
const liveIndicator = document.getElementById("consoleLiveIndicator");

// DIAGNOSTICS (YOUR ORIGINAL IDs)
const errorCountEl = document.getElementById("consoleErrorCount");
const lastReconnectEl = document.getElementById("consoleLastReconnect");
const connectionStateEl = document.getElementById("consoleConnectionState");
const uptimeEl = document.getElementById("consoleUptime");

// EQUALIZER (YOUR ORIGINAL ID)
const equalizer = document.getElementById("equalizer");

// STATE
let isPlaying = false;
let manualStop = false;
let usingBackup = false;
let reconnectTimer = null;
let errorCount = 0;
let uptimeTimer = null;
let startTime = null;

// ======================================================
// STATUS SYSTEM
// ======================================================
function setStatus(label, detail, type = "user") {
    statusLabel.textContent = label;
    statusDetail.textContent = detail;

    liveIndicator.className = "console-live-indicator";

    if (type === "ok")   liveIndicator.classList.add("live-ok");
    if (type === "warn") liveIndicator.classList.add("live-warn");
    if (type === "error") liveIndicator.classList.add("live-error");
}

// ======================================================
// UPTIME
// ======================================================
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

// ======================================================
// EQUALIZER
// ======================================================
function eqStart() { equalizer.classList.remove("eq-paused"); }
function eqStop()  { equalizer.classList.add("eq-paused"); }

// ======================================================
// WATCHDOG — SIMPLE, RELIABLE
// ======================================================
let watchdogTimer = null;
let lastTime = 0;

function startWatchdog() {
    clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
        if (!isPlaying || manualStop) return;

        if (audio.currentTime === lastTime) {
            audio.play().catch(() => {});
        }
        lastTime = audio.currentTime;

        if (audio.networkState === 3) {
            scheduleReconnect();
        }
    }, 3000);
}

function stopWatchdog() {
    clearInterval(watchdogTimer);
}

// ======================================================
// STREAM ENGINE
// ======================================================
async function startStream() {
    manualStop = false;
    clearTimeout(reconnectTimer);

    audio.src = usingBackup ? BACKUP_STREAM : PRIMARY_STREAM;

    setStatus("Connecting", "Preparing audio pipeline…");
    connectionStateEl.textContent = "Connecting";

    try {
        await audio.play();
        isPlaying = true;

        setStatus("LIVE", usingBackup ? "Backup stream active" : "Primary stream active", "ok");
        connectionStateEl.textContent = usingBackup ? "Backup" : "Playing";

        eqStart();
        startUptime();
        startWatchdog();

        playBtn.textContent = "⏸";
        playBtn.classList.add("pulse");

    } catch (err) {
        handleError();
    }
}

function stopStream() {
    manualStop = true;
    clearTimeout(reconnectTimer);
    stopWatchdog();

    audio.pause();
    isPlaying = false;

    eqStop();
    stopUptime();

    setStatus("Stopped", "Stopped by user");
    connectionStateEl.textContent = "Stopped";

    playBtn.textContent = "▶";
    playBtn.classList.remove("pulse");
}

// ======================================================
// ERROR + RECONNECT
// ======================================================
function handleError() {
    if (manualStop) return;

    errorCount++;
    errorCountEl.textContent = errorCount;

    setStatus("Error", "Stream failure — scheduling reconnect", "error");
    connectionStateEl.textContent = "Error";

    eqStop();
    scheduleReconnect();
}

function scheduleReconnect() {
    if (manualStop) return;

    clearTimeout(reconnectTimer);

    setStatus("Reconnecting", "Attempting recovery…", "warn");
    connectionStateEl.textContent = "Reconnecting";

    reconnectTimer = setTimeout(() => {
        lastReconnectEl.textContent = new Date().toLocaleTimeString();
        startStream();
    }, 2000);
}

// ======================================================
// MEDIA SESSION
// ======================================================
if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
        title: "INFIN8 Radio",
        artist: "Live Stream",
        album: "Broadcast"
    });

    navigator.mediaSession.setActionHandler("play", () => {
        if (!isPlaying) startStream();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
        stopStream();
    });
}

// ======================================================
// BUTTONS
// ======================================================
playBtn.addEventListener("click", () => {
    if (!isPlaying) startStream();
    else stopStream();
});

retryBtn.addEventListener("click", () => {
    usingBackup = false;
    stopStream();
    startStream();
});

// ======================================================
// VOLUME
// ======================================================
const savedVol = localStorage.getItem("consoleVolume");
const initVol = savedVol ? parseFloat(savedVol) : 0.8;

volumeSlider.value = initVol;
audio.volume = initVol;
volumeValue.textContent = Math.round(initVol * 100) + "%";

volumeSlider.addEventListener("input", () => {
    const v = parseFloat(volumeSlider.value);
    audio.volume = v;
    volumeValue.textContent = Math.round(v * 100) + "%";
    localStorage.setItem("consoleVolume", v);
});

// ======================================================
// INIT
// ======================================================
setStatus("Idle", "Ready");
audio.preload = "auto";
audio.src = PRIMARY_STREAM;
eqStop();
