import { db } from "./firebase-init.js";
import { ref, set, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

let listenerId = null;

export function startListening() {
    listenerId = "listener_" + Math.random().toString(36).substring(2, 10);

    const listenerRef = ref(db, "listeners/" + listenerId);

    set(listenerRef, true);
    onDisconnect(listenerRef).remove();
}

export function stopListening() {
    if (!listenerId) return;

    const listenerRef = ref(db, "listeners/" + listenerId);
    remove(listenerRef);

    listenerId = null;
}
