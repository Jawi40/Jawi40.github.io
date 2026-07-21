// Auto-load posters from js/posters/ folder

async function loadPosters() {
    const container = document.getElementById("posterGallery");
    if (!container) return;

    try {
        // Get file list from GitHub
        const res = await fetch("https://api.github.com/repos/Jawi40/Jawi40.github.io/contents/js/posters");
        const files = await res.json();

        // Filter image files
        const images = files.filter(file =>
            file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
        );

        // Add each image to the page
        images.forEach(img => {
            const el = document.createElement("img");
            el.src = "/js/posters/" + img.name;
            el.alt = img.name;
            el.className = "poster-item";
            container.appendChild(el);
        });

    } catch (err) {
        console.error("Poster loading failed:", err);
    }
}

document.addEventListener("DOMContentLoaded", loadPosters);
