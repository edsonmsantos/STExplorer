// Sticky nav: switch to glass-blur after scrolling past the hero.
(function () {
    const nav = document.getElementById('topnav');
    if (!nav) return;
    const onScroll = () => {
        if (window.scrollY > 40) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();

// Reveal-on-scroll animations via IntersectionObserver.
(function () {
    const els = document.querySelectorAll('.reveal');
    if (!els.length || !('IntersectionObserver' in window)) {
        els.forEach((el) => el.classList.add('in-view'));
        return;
    }
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    els.forEach((el) => observer.observe(el));
})();

// Subtle parallax on the hero ambient blobs.
(function () {
    const ambients = document.querySelectorAll('.hero .ambient');
    if (!ambients.length) return;
    let ticking = false;
    window.addEventListener(
        'scroll',
        () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const y = window.scrollY;
                ambients.forEach((el, i) => {
                    const factor = i % 2 === 0 ? 0.15 : -0.12;
                    el.style.transform = `translate3d(0, ${y * factor}px, 0)`;
                });
                ticking = false;
            });
        },
        { passive: true }
    );
})();
