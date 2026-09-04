const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

const db = admin.database();

async function cleanup() {
  const ref = db.ref("users");
  const snapshot = await ref.once("value");
  const users = snapshot.val() || {};

  for (const uid in users) {
    const user = users[uid];

    if (user.listening === false) {
      console.log(`Removing user: ${uid}`);
      await ref.child(uid).remove();
    }
  }

  console.log("Cleanup complete.");
}

cleanup().then(() => process.exit(0));
