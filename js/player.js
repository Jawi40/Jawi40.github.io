import { startListening, stopListening } from "./listener-counter.js";

document.getElementById("playButton").addEventListener("click", () => {
    startListening();
});

document.getElementById("pauseButton").addEventListener("click", () => {
    stopListening();
});
