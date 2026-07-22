function toggleMenu() {
    const menu = document.getElementById("mobile-nav");
    menu.classList.toggle("open");
}

function closeMenu(event) {
    event.preventDefault();
    const menu = document.getElementById("mobile-nav");
    menu.classList.remove("open");

    const url = event.target.getAttribute("href");

    // Delay navigation so collapse is visible
    setTimeout(() => {
        window.location.href = url;
    }, 150);
}

// Hamburger click
document.getElementById("hamburger").addEventListener("click", toggleMenu);

// Mobile nav link clicks
document.querySelectorAll(".mobile-link").forEach(link => {
    link.addEventListener("click", closeMenu);
});
