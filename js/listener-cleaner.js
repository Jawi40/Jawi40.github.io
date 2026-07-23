import { db } from "./firebase-init.js";
import {
    ref,
    onValue,
    remove
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

export function cleanGhostListeners(maxAgeMinutes = 30) {
    const listenersRef = ref(db, "listeners");

    onValue(listenersRef, (snapshot) => {
        const data = snapshot.val() || {};
        const now = Date.now();

        Object.entries(data).forEach(([id, info]) => {
            if (!info || !info.timestamp) return;

            const ageMinutes = (now - info.timestamp) / 60000;

            // Remove PASSIVE listeners older than maxAgeMinutes
            if (info.mode === "passive" && ageMinutes > maxAgeMinutes) {
                remove(ref(db, "listeners/" + id));
            }
        });
    });
}

// Run cleanup every minute
setInterval(() => cleanGhostListeners(30), 60000);
