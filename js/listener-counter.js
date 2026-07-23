import { db } from "./firebase-init.js";
import {
    ref,
    set,
    remove,
    onDisconnect,
    onValue
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

export let listenerId = null;
let lastHeartbeat = Date.now();
let heartbeatInterval = null;

// =========================
// START LISTENING
// =========================
export function startListening() {
    listenerId = "listener_" + Math.random().toString(36).substring(2, 10);

    const listenerRef = ref(db, "listeners/" + listenerId);

    // Initial state
    set(listenerRef, {
        mode: "active",
        timestamp: Date.now()
    });

    // Auto-remove on clean disconnect
    onDisconnect(listenerRef).remove();

    // HEARTBEAT — detects passive mode
    heartbeatInterval = setInterval(() => {
        if (!listenerId) return;

        const now = Date.now();
        const diff = now - lastHeartbeat;

        // If JS was suspended, diff will be large
        const mode = diff > 60000 ? "passive" : "active";

        lastHeartbeat = now;

        set(listenerRef, {
            mode,
            timestamp: now
        });
    }, 30000);
}

// =========================
// STOP LISTENING
// =========================
export function stopListening() {
    if (!listenerId) return;

    const listenerRef = ref(db, "listeners/" + listenerId);

    remove(listenerRef);

    listenerId = null;

    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
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
