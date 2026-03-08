/**
 * nav.js – 페이지 전환 트랜지션 + hover 시 prefetch
 * 모든 페이지에 공통으로 포함되는 스크립트
 */
(function () {
    // ── 전환 오버레이 CSS 주입 ──────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        @keyframes _navFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        body { animation: _navFadeIn 0.2s ease-out both; }

        #_nav-overlay {
            position: fixed;
            inset: 0;
            background: #000;
            opacity: 0;
            pointer-events: none;
            z-index: 2147483647;
            transition: opacity 0.15s ease;
            will-change: opacity;
        }
        #_nav-overlay.active {
            opacity: 1;
            pointer-events: all;
        }
    `;
    document.head.appendChild(style);

    // ── 오버레이 엘리먼트 생성 ─────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = '_nav-overlay';

    function ensureOverlay() {
        if (!document.body.contains(overlay)) {
            document.body.appendChild(overlay);
        }
    }

    if (document.body) {
        ensureOverlay();
    } else {
        document.addEventListener('DOMContentLoaded', ensureOverlay);
    }

    // ── navigateTo: 페이드아웃 후 이동 ────────────────────────
    window.navigateTo = function (url) {
        ensureOverlay();
        overlay.classList.add('active');
        setTimeout(function () {
            window.location.href = url;
        }, 160);
    };

    // ── hover 시 prefetch ──────────────────────────────────────
    const prefetched = new Set();

    function prefetch(pathname) {
        if (prefetched.has(pathname)) return;
        prefetched.add(pathname);
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = pathname;
        link.as = 'document';
        document.head.appendChild(link);
    }

    // ── 페이지 로드 시 인접 라우트 사전 prefetch ──────────────
    const routePrefetchMap = {
        '/mainHub/':   ['/timer/', '/community/'],
        '/timer/':     ['/mainHub/'],
        '/community/': ['/mainHub/'],
        '/login/':     ['/mainHub/'],
    };
    const adjacents = routePrefetchMap[location.pathname] || [];
    // 초기 로드 영향 최소화를 위해 1.5초 후 prefetch
    setTimeout(function () { adjacents.forEach(prefetch); }, 1500);

    document.addEventListener('mouseover', function (e) {
        const target = e.target.closest('[data-nav-href]');
        if (!target) return;
        prefetch(target.dataset.navHref);
    }, { passive: true });

    // <a> 태그 hover도 처리
    document.addEventListener('mouseover', function (e) {
        const a = e.target.closest('a[href]');
        if (!a) return;
        try {
            const url = new URL(a.href, location.origin);
            if (url.origin === location.origin) prefetch(url.pathname);
        } catch (_) {}
    }, { passive: true });
})();
