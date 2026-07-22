document.addEventListener("DOMContentLoaded", () => {

    function toggleMenu() {
        const menu = document.getElementById("mobile-nav");
        menu.classList.toggle("open");
    }

    function closeMenu(event) {
        event.preventDefault();
        const menu = document.getElementById("mobile-nav");
        menu.classList.remove("open");

        const url = event.target.getAttribute("href");

        setTimeout(() => {
            window.location.href = url;
        }, 150);
    }

    const hamburger = document.getElementById("hamburger");
    if (hamburger) {
        hamburger.addEventListener("click", toggleMenu);
    }

    document.querySelectorAll(".mobile-link").forEach(link => {
        link.addEventListener("click", closeMenu);
    });

});
