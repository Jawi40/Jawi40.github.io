// listener-counter.js

// Generate a unique ID for this listener
let listenerId = "listener_" + Math.random().toString(36).substr(2, 9);

// Reference to the listeners node
const listenersRef = firebase.database().ref("listeners");

// Track if the user is currently counted
let isListening = false;

// Add listener when Play is pressed
function startListening() {
    if (!isListening) {
        listenersRef.child(listenerId).set(true);
        isListening = true;
    }
}

// Remove listener when Pause is pressed
function stopListening() {
    if (isListening) {
        listenersRef.child(listenerId).remove();
        isListening = false;
    }
}

// Auto-remove listener when tab closes
window.addEventListener("beforeunload", () => {
    if (isListening) {
        listenersRef.child(listenerId).remove();
    }
});

// Real-time listener count display
listenersRef.on("value", snapshot => {
    const count = snapshot.numChildren();
    const footerElement = document.getElementById("listenerCount");

    if (footerElement) {
        footerElement.textContent = `Listeners: ${count}`;
    }
});
