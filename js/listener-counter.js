// listener-counter.js

// Generate a unique ID for this listener
let listenerId = "listener_" + Math.random().toString(36).substr(2, 9);

// Firebase reference
const listenersRef = firebase.database().ref("listeners");

// Track if user is currently counted
let isListening = false;

// Called when Play is pressed
function startListening() {
    if (!isListening) {
        listenersRef.child(listenerId).set(true);
        isListening = true;
    }
}

// Called when Pause is pressed
function stopListening() {
    if (isListening) {
        listenersRef.child(listenerId).remove();
        isListening = false;
    }
}

// Remove listener on tab close
window.addEventListener("beforeunload", () => {
    if (isListening) {
        listenersRef.child(listenerId).remove();
    }
});

// Update footer count in real time
listenersRef.on("value", snapshot => {
    const count = snapshot.numChildren();
    const footer = document.getElementById("listenerCount");

    if (footer) {
        footer.textContent = `Listeners: ${count}`;
    }
});
