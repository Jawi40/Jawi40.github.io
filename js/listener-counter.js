import { db } from "./firebase-init.js";
import {
    ref,
    set,
    remove,
    onDisconnect,
    onValue
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

let listenerId = null;

// =========================
// START LISTENING
// =========================
export function startListening() {
    listenerId = "listener_" + Math.random().toString(36).substring(2, 10);

    const listenerRef = ref(db, "listeners/" + listenerId);

    // Listener starts as active
    set(listenerRef, {
        mode: "active",
        timestamp: Date.now()
    });

    // Auto-remove on real disconnect
    onDisconnect(listenerRef).remove();

    // HEARTBEAT — only for active listeners
    setInterval(() => {
        if (!listenerId) return;

        // If JS is suspended, this never runs — listener becomes passive
        set(listenerRef, {
            mode: "active",
            timestamp: Date.now()
        });
    }, 30000);
}

// =========================
// STOP LISTENING
// =========================
export function stopListening() {
    if (!listenerId) return;

    const listenerRef = ref(db, "listeners/" + listenerId);

    // Remove listener entry
    remove(listenerRef);

    listenerId = null;
}

// =========================
// REAL-TIME LISTENER COUNT
// =========================
export function onListenerCount(callback) {
    const listenersRef = ref(db, "listeners");

    onValue(listenersRef, (snapshot) => {
        const data = snapshot.val() || {};
        const count = Object.keys(data).length;
        callback(count);
    });
}

// =========================
// GHOST CLEANUP (SAFE)
// =========================
export function cleanGhostListeners(maxAgeMinutes = 30) {
    const listenersRef = ref(db, "listeners");

    onValue(listenersRef, (snapshot) => {
        const data = snapshot.val() || {};

        const now = Date.now();

        Object.entries(data).forEach(([id, info]) => {
            // If listener has no timestamp, skip (older code)
            if (!info || !info.timestamp) return;

            const ageMinutes = (now - info.timestamp) / 60000;

            // Remove ONLY if older than maxAgeMinutes
            if (ageMinutes > maxAgeMinutes) {
                remove(ref(db, "listeners/" + id));
            }
        });
    });
}
