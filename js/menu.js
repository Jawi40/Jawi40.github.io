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
