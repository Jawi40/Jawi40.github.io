document.addEventListener("DOMContentLoaded", () => {
    const hamburger = document.getElementById("hamburger");
    const mobileNav = document.getElementById("mobile-nav");

    hamburger.addEventListener("click", () => {
        mobileNav.classList.toggle("open");
    });
});
