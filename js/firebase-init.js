// Firebase v9 Modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// Your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyDq-7xJ0t9xj1xJYv8xYVYxYVYxYVYxYVY",
    authDomain: "infin8radio.firebaseapp.com",
    databaseURL: "https://console.firebase.google.com/project/infin8radio/database/infin8radio-default-rtdb/data/~2F",
    projectId: "infin8radio",
    storageBucket: "infin8radio.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
