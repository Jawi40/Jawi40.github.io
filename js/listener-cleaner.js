const admin = require("firebase-admin");

// --- Firebase Initialization ---
console.log("Initializing Firebase…");

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });

  console.log("Firebase initialized successfully.");
  console.log("DB URL:", admin.app().options.databaseURL);

} catch (err) {
  console.error("Firebase initialization error:", err);
  process.exit(1);
}

const db = admin.database();

// --- Cleanup Function ---
async function cleanup() {
  console.log("Script started");

  const ref = db.ref("users");

  console.log("Fetching users…");
  const snapshot = await ref.once("value");

  const users = snapshot.val() || {};
  console.log("Snapshot raw:", users);

  const now = Date.now();
  const STALE_THRESHOLD = 30000; // 30s without heartbeat = stale

  for (const uid in users) {
    const user = users[uid] || {};
    console.log(`Checking user: ${uid}`, user);

    const listening = user.listening;
    const timestamp = user.timestamp || 0;

    const isInactive   = listening === false;
    const isStale      = now - timestamp > STALE_THRESHOLD;
    const isCorrupted  = listening === undefined || timestamp === 0;

    if (isInactive || isStale || isCorrupted) {
      console.log(`Removing user: ${uid}`);
      await ref.child(uid).remove();
    }
  }

  console.log("Cleanup complete.");
}

// --- Run Cleanup ---
cleanup().then(() => process.exit(0));
