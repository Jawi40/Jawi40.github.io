import { startListening, stopListening } from "./listener-counter.js";

const playBtn = document.getElementById("playBtn");
const radioAudio = document.getElementById("radioAudio");

playBtn.addEventListener("click", () => {
    if (radioAudio.paused) {
        radioAudio.play();
        startListening();
        playBtn.textContent = "⏸";
    } else {
        radioAudio.pause();
        stopListening();
        playBtn.textContent = "▶";
    }
});
