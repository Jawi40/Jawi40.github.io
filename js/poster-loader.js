// Auto-load posters from js/posters/ folder

async function loadPosters() {
    const container = document.getElementById("posterGallery");
    if (!container) return;

    try {
        const res = await fetch("/js/posters.json");
        const images = await res.json();

        images.forEach(name => {
            const el = document.createElement("img");
            el.src = "/js/posters/" + name;
            el.alt = name;
            el.className = "poster-item";
            container.appendChild(el);
        });

    } catch (err) {
        console.error("Poster loading failed:", err);
    }
}


document.addEventListener("DOMContentLoaded", loadPosters);
