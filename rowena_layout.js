/**
 * 可拖曳調整寬度的 Sidebar / Main 佈局
 */
(function (global) {
    const WIDTH_KEY = 'rowena_sidebar_width';
    const DEFAULT_WIDTH = 320;
    const MIN_WIDTH = 220;
    const MAX_RATIO = 0.55;

    function init(options) {
        const {
            shellId = 'layout-shell',
            sidebarId = 'layout-sidebar',
            handleId = 'layout-resize-handle',
            mainId = 'layout-main',
        } = options || {};

        const shell = document.getElementById(shellId);
        const sidebar = document.getElementById(sidebarId);
        const handle = document.getElementById(handleId);
        const main = document.getElementById(mainId);
        if (!shell || !sidebar || !handle || !main) return;

        let width = DEFAULT_WIDTH;
        try {
            const saved = parseInt(localStorage.getItem(WIDTH_KEY), 10);
            if (!isNaN(saved) && saved >= MIN_WIDTH) width = saved;
        } catch { /* ignore */ }

        function applyWidth(px) {
            const maxW = Math.floor(shell.getBoundingClientRect().width * MAX_RATIO);
            width = Math.max(MIN_WIDTH, Math.min(px, maxW));
            shell.style.setProperty('--sidebar-width', `${width}px`);
            localStorage.setItem(WIDTH_KEY, String(width));
        }

        function isDesktop() {
            return window.matchMedia('(min-width: 1024px)').matches;
        }

        applyWidth(width);

        let dragging = false;

        function onMove(clientX) {
            if (!dragging || !isDesktop()) return;
            const rect = shell.getBoundingClientRect();
            applyWidth(clientX - rect.left);
        }

        handle.addEventListener('mousedown', (e) => {
            if (!isDesktop()) return;
            e.preventDefault();
            dragging = true;
            handle.classList.add('is-dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => onMove(e.clientX));
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('is-dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });

        handle.addEventListener('touchstart', (e) => {
            if (!isDesktop()) return;
            dragging = true;
            handle.classList.add('is-dragging');
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!dragging || !e.touches[0]) return;
            onMove(e.touches[0].clientX);
        }, { passive: true });

        document.addEventListener('touchend', () => {
            dragging = false;
            handle.classList.remove('is-dragging');
        });

        window.addEventListener('resize', () => {
            if (isDesktop()) applyWidth(width);
        });

        const mq = window.matchMedia('(min-width: 1024px)');
        mq.addEventListener('change', () => {
            if (mq.matches) applyWidth(width);
        });
    }

    global.RowenaLayout = { init };
})(window);
