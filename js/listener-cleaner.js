import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

initializeApp();

export const cleanGhostListeners = onSchedule("every 1 minutes", async () => {
  const db = getDatabase();
  const ref = db.ref("listeners");
  const snapshot = await ref.get();
  const data = snapshot.val() || {};
  const now = Date.now();

  Object.entries(data).forEach(([id, info]) => {
    if (!info?.timestamp) return;

    const ageMinutes = (now - info.timestamp) / 60000;

    if (info.mode === "passive" && ageMinutes > 30) {
      ref.child(id).remove();
    }
  });
});
