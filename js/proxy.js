/**
 * proxy.js — Ultraviolet Web Proxy Integration for GameUI
 *
 * HOW IT WORKS:
 *  1. Registers the UV service worker on page load.
 *  2. Adds 'proxy' as a valid render mode alongside the existing ones
 *     (about-blank, blob, data-url, direct, iframe).
 *  3. Patches launchCurrentGame() so that when gameRenderMode === 'proxy'
 *     the URL is encoded and opened through Ultraviolet.
 *  4. Adds openInProxy(url, title) as a standalone global for anywhere
 *     else in the codebase that wants to proxy a URL.
 *
 * SETUP REQUIRED (in your FastAPI backend):
 *   app.mount("/uv", StaticFiles(directory="Ultraviolet/dist"), name="uv")
 *
 * Then add these two lines to GameUI.html <head> BEFORE any other scripts:
 *   <script src="/uv/uv.bundle.js"></script>
 *   <script src="/uv/uv.config.js"></script>
 * Then load this file after your other JS:
 *   <script src="/js/proxy.js"></script>
 */

// ─── 1. Service Worker Registration ──────────────────────────────────────────

const UVProxy = (() => {
    // These must match what Ultraviolet/dist serves.
    // If you mounted at /uv/ in FastAPI, keep these as-is.
    const SW_PATH   = '/uv/uv.sw.js';
    const SW_SCOPE  = '/service/';        // default UV prefix

    let _swRegistered = false;
    let _uvReady = false;

    /**
     * Try to register the UV service worker.
     * Safe to call multiple times — only registers once.
     */
    async function registerServiceWorker() {
        if (_swRegistered) return true;

        if (!('serviceWorker' in navigator)) {
            console.warn('[UVProxy] Service workers not supported in this browser.');
            return false;
        }

        try {
            const reg = await navigator.serviceWorker.register(SW_PATH, {
                scope: SW_SCOPE
            });
            _swRegistered = true;
            console.info('[UVProxy] Service worker registered:', reg.scope);
            return true;
        } catch (err) {
            console.error('[UVProxy] Service worker registration failed:', err);
            // Don't crash the launcher — proxy just won't be available
            return false;
        }
    }

    /**
     * Check that uv.bundle.js and uv.config.js actually loaded.
     * Waits up to 5 seconds for Ultraviolet to be available.
     */
    async function checkUVAvailable() {
        // Try immediately
        if (typeof window.__uv$config !== 'undefined' && typeof window.Ultraviolet !== 'undefined') {
            _uvReady = true;
            return true;
        }
        
        // Wait up to 5 seconds for async loading
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            if (typeof window.__uv$config !== 'undefined' && typeof window.Ultraviolet !== 'undefined') {
                _uvReady = true;
                console.info('[UVProxy] Ultraviolet loaded after wait');
                return true;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        
        // Debug output
        const debugInfo = `[UVProxy Debug]\n  window.__uv$config: ${typeof window.__uv$config}\n  window.Ultraviolet: ${typeof window.Ultraviolet}\n  self.__uv$config: ${typeof self.__uv$config}`;
        console.warn(debugInfo);
        console.warn('[UVProxy] Ultraviolet not available after 5 seconds. Check that uv.bundle.js and uv.config.js loaded successfully.');
        return false;
    }

    /**
     * Encode a URL through Ultraviolet's configured codec.
     * @param {string} rawUrl
     * @returns {string} full proxied path, e.g. /service/encoded…
     */
    function encodeProxyUrl(rawUrl) {
        if (!_uvReady) {
            throw new Error('Ultraviolet is not loaded. Call UVProxy.init() and wait for it to complete.');
        }

        // Ensure the URL has a scheme
        let url = rawUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        const config = window.__uv$config || self.__uv$config;
        if (!config) {
            throw new Error('__uv$config not found — uv.config.js may not have loaded');
        }

        const prefix  = config.prefix  || '/service/';
        const encoder = config.encodeUrl;

        if (typeof encoder !== 'function') {
            throw new Error('__uv$config.encodeUrl is not a function — uv.config.js may be malformed');
        }

        return prefix + encoder(url);
    }

    /**
     * Open a URL through the UV proxy in a new tab.
     * This is the main entry point called by the launcher.
     *
     * @param {string} url    - The target URL to proxy
     * @param {string} title  - Window title (used as page title in the wrapper)
     * @returns {{ opened: boolean, proxiedUrl: string|null }}
     */
    function openInProxy(url, title = 'Game') {
        let proxiedUrl;
        try {
            proxiedUrl = encodeProxyUrl(url);
        } catch (err) {
            console.error('[UVProxy] Failed to encode URL:', err);
            if (typeof showToast === 'function') {
                showToast('Proxy unavailable: ' + err.message);
            }
            return { opened: false, proxiedUrl: null };
        }

        // Open a blank window first (must be synchronous to avoid popup blockers),
        // then navigate it to the proxied URL.
        const win = window.open('about:blank', '_blank', 'noopener');
        if (!win) {
            if (typeof showToast === 'function') {
                showToast('Popup blocked — allow popups for this site to use proxy mode.');
            }
            // Last resort: navigate current tab
            window.location.href = proxiedUrl;
            return { opened: false, proxiedUrl };
        }

        // Set a sensible title while the page loads
        try {
            win.document.title = `${title} — Proxy`;
        } catch (_) { /* cross-origin, fine */ }

        win.location.href = proxiedUrl;
        return { opened: true, proxiedUrl };
    }

    /**
     * Open a URL through the proxy inside the existing game iframe modal
     * instead of a new tab (useful for iframe render mode + proxy).
     *
     * @param {string} url
     * @param {string} title
     */
    function openInProxyIframe(url, title = 'Game') {
        let proxiedUrl;
        try {
            proxiedUrl = encodeProxyUrl(url);
        } catch (err) {
            console.error('[UVProxy] Failed to encode URL for iframe:', err);
            if (typeof showToast === 'function') {
                showToast('Proxy unavailable: ' + err.message);
            }
            return;
        }

        // Reuse the existing game-iframe-modal infrastructure
        const frame = document.getElementById('game-iframe');
        const titleEl = document.getElementById('iframe-title');
        if (!frame) {
            console.error('[UVProxy] #game-iframe not found — cannot open proxy in iframe.');
            return;
        }
        if (titleEl) titleEl.textContent = title;
        frame.srcdoc = '';
        frame.src = proxiedUrl;
        document.getElementById('game-iframe-modal')?.classList.add('active');
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    /**
     * Boot sequence: check UV availability then register SW.
     * Called automatically when the script loads.
     */
    async function init() {
        const uvAvailable = await checkUVAvailable();
        if (!uvAvailable) {
            console.error('[UVProxy] Failed to initialize - Ultraviolet not available');
            return;
        }
        
        const swRegistered = await registerServiceWorker();
        if (!swRegistered) {
            console.warn('[UVProxy] Service worker registration failed, but continuing anyway');
        }

        // Patch renderModes array so the Settings dropdown includes 'proxy'
        if (typeof renderModes !== 'undefined' && Array.isArray(renderModes)) {
            if (!renderModes.includes('proxy')) {
                renderModes.push('proxy');
                renderModes.push('proxy-iframe');
            }
        } else {
            // renderModes hasn't been defined yet — patch it once the DOM is ready
            document.addEventListener('DOMContentLoaded', () => {
                if (typeof renderModes !== 'undefined' && !renderModes.includes('proxy')) {
                    renderModes.push('proxy');
                    renderModes.push('proxy-iframe');
                }
                // Also add the option to the settings <select> if it exists
                _patchSettingsDropdown();
            });
        }

        _patchSettingsDropdown();
        _patchLaunchCurrentGame();

        console.info('[UVProxy] Proxy module ready. UV available:', _uvReady, '| SW registered:', _swRegistered);
    }

    // ── Internal DOM patches ─────────────────────────────────────────────────

    /**
     * Add proxy options to the render-mode <select> in Settings if present.
     */
    function _patchSettingsDropdown() {
        const select = document.getElementById('game-render-mode');
        if (!select) return;
        if (select.querySelector('option[value="proxy"]')) return; // already patched

        const opt1 = document.createElement('option');
        opt1.value = 'proxy';
        opt1.textContent = 'Proxy (new tab via UV)';

        const opt2 = document.createElement('option');
        opt2.value = 'proxy-iframe';
        opt2.textContent = 'Proxy Iframe (inline via UV)';

        select.appendChild(opt1);
        select.appendChild(opt2);
    }

    /**
     * Wrap launchCurrentGame to intercept proxy render modes.
     *
     * The original function lives in ide.js and is a plain async function
     * on the global scope. We replace it with a wrapper that delegates to
     * UVProxy when the active render mode is 'proxy' or 'proxy-iframe',
     * and calls the original for every other mode.
     */
    function _patchLaunchCurrentGame() {
        // launchCurrentGame is declared in ide.js. If it hasn't loaded yet,
        // wait for DOMContentLoaded and try again.
        const _tryPatch = () => {
            if (typeof launchCurrentGame !== 'function') return false;

            const _original = launchCurrentGame;

            // Replace the global with our wrapper
            window.launchCurrentGame = async function launchCurrentGame_proxied() {
                // If not in proxy mode, delegate to original
                if (typeof gameRenderMode === 'undefined'
                    || (gameRenderMode !== 'proxy' && gameRenderMode !== 'proxy-iframe')) {
                    return _original.apply(this, arguments);
                }

                // ── Proxy mode ────────────────────────────────────────────
                if (typeof filteredGames === 'undefined' || !filteredGames.length) return;
                const idx  = Math.max(0, Math.min(
                    typeof currentIndex !== 'undefined' ? currentIndex : 0,
                    filteredGames.length - 1
                ));
                const game   = filteredGames[idx];
                const launch = typeof getGameLaunchMeta === 'function'
                    ? getGameLaunchMeta(game)
                    : { source: game?.url, isHtml: false, url: game?.url };

                // HTML-source games can't be proxied — fall back to original
                if (launch.isHtml) {
                    if (typeof showToast === 'function') {
                        showToast('Proxy mode does not support inline HTML games — using about:blank instead.');
                    }
                    const _savedMode = gameRenderMode;
                    gameRenderMode = 'about-blank';
                    await _original.apply(this, arguments);
                    gameRenderMode = _savedMode;
                    return;
                }

                if (!launch.url) {
                    if (typeof showToast === 'function') showToast('No URL to proxy for this game.');
                    return;
                }

                // Show launch screen
                const launchScreen = document.getElementById('launch-screen');
                const launchTitle  = document.getElementById('launch-title');
                if (launchTitle) launchTitle.textContent = `Opening ${game.title} via Proxy...`;
                if (launchScreen) launchScreen.classList.add('active');

                let result;
                if (gameRenderMode === 'proxy-iframe') {
                    openInProxyIframe(launch.url, game.title);
                    result = { opened: true };
                } else {
                    result = openInProxy(launch.url, game.title);
                }

                if (result.opened && typeof recordGamePlay === 'function') {
                    recordGamePlay(game.id);
                }

                // Dismiss launch screen
                setTimeout(() => launchScreen?.classList.remove('active'), 1800);
            };

            console.info('[UVProxy] launchCurrentGame patched successfully.');
            return true;
        };

        if (!_tryPatch()) {
            document.addEventListener('DOMContentLoaded', _tryPatch);
        }
    }

    // ── Public API ───────────────────────────────────────────────────────────
    return {
        init,
        openInProxy,
        openInProxyIframe,
        encodeProxyUrl,
        isReady: () => _uvReady && _swRegistered
    };
})();

// ─── 2. Auto-initialise ───────────────────────────────────────────────────────

// Run as soon as the script executes (scripts are deferred by placement).
UVProxy.init().catch(err => {
    console.error('[UVProxy] Initialization error:', err);
});

// Also expose as a global so any other script can call UVProxy.openInProxy(url)
window.UVProxy = UVProxy;
