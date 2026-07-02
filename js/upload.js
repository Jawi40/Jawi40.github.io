// Connect to Firebase Storage
const storage = firebase.storage();
const storageRef = storage.ref();

// UI elements
const uploadBtn = document.getElementById("uploadBtn");
const posterUpload = document.getElementById("posterUpload");
const gallery = document.getElementById("gallery");

// Upload handler
uploadBtn.addEventListener("click", async () => {
    const file = posterUpload.files[0];
    if (!file) {
        alert("Choose an image first");
        return;
    }

    // Create unique filename
    const fileRef = storageRef.child("posters/" + Date.now() + "_" + file.name);

    try {
        // Upload file
        await fileRef.put(file);

        // Get public URL
        const url = await fileRef.getDownloadURL();

        // Display image in gallery
        const img = document.createElement("img");
        img.src = url;
        img.className = "poster";
        gallery.appendChild(img);

        alert("Upload successful!");
    } catch (err) {
        console.error("Upload error:", err);
        alert("Upload failed");
    }
});
