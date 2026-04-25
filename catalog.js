let dynamicGamesLoaded = false;
        async function fetchDynamicCatalog(force = false) {
            if (!currentUser || !db) return [];
            if (LauncherState.dynamicCatalogRequest) return LauncherState.dynamicCatalogRequest;
            if (dynamicGamesLoaded && !force) return [];

            const loadColl = async (collection) => {
                const snap = await db.collection(collection).get();
                snap.forEach(doc => {
                    const data = doc.data();
                    const existingIdx = gameData.findIndex(g => g.id === data.id);
                    if(existingIdx >= 0) {
                        gameData[existingIdx] = {...gameData[existingIdx], ...data, type: collection};
                    } else {
                        gameData.push({...data, type: collection, isCustom: true});
                    }
                });
                return collection;
            };

            LauncherState.dynamicCatalogRequest = (async () => {
                const collections = ['games', 'media', 'browsers'];
                const results = await Promise.allSettled(collections.map(loadColl));
                const failedCollections = results
                    .map((result, index) => result.status === 'rejected' ? collections[index] : null)
                    .filter(Boolean);

                dynamicGamesLoaded = failedCollections.length === 0;
                if (results.some(result => result.status === 'fulfilled')) {
                    switchCategory(currentCategory);
                }
                if (failedCollections.length) {
                    console.warn('Partial dynamic catalog load failure', failedCollections);
                    showToast(`Catalog retry needed for: ${failedCollections.join(', ')}`);
                }
                return results;
            })()
                .catch(error => {
                    dynamicGamesLoaded = false;
                    console.error('Dynamic catalog load failed', error);
                    throw error;
                })
                .finally(() => {
                    LauncherState.dynamicCatalogRequest = null;
                });

            return LauncherState.dynamicCatalogRequest;
        }

        function refreshDynamicCatalog() {
            dynamicGamesLoaded = false;
            return fetchDynamicCatalog(true).catch((error) => {
                console.error('Catalog refresh failed', error);
            });
        }

        function setupListeners() {
            fetchDynamicCatalog().catch(() => {});
            db.collection('friendRequests')
                .where('recipientId', '==', currentUser.uid)
                .where('status', '==', 'pending')
                .onSnapshot(snap => {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            const data = change.doc.data();
                            pendingRequests.push({id: change.doc.id, ...data});
                            showToast(`New Friend Request from ${data.senderName}`);
                        }
                        if (change.type === 'removed') {
                            pendingRequests = pendingRequests.filter(r => r.id !== change.doc.id);
                        }
                    });
                    renderNotifs();
                });

            db.collection('conversations').where('memberIds', 'array-contains', currentUser.uid)
                .onSnapshot(snap => {
                    snap.docChanges().forEach(change => {
                        const data = change.doc.data();
                        const messageKey = getConversationMessageKey(data);
                        const previousMessageKey = LauncherState.lastConversationMessageKey.get(change.doc.id);

                        if (messageKey) {
                            LauncherState.lastConversationMessageKey.set(change.doc.id, messageKey);
                        }

                        if (change.type === 'modified') {
                            const isNewMessage = Boolean(messageKey) && messageKey !== previousMessageKey;
                            if (
                                isNewMessage &&
                                data.lastMessageSenderId &&
                                data.lastMessageSenderId !== currentUser.uid &&
                                !isSocialPanelOpen()
                            ) {
                                showToast(`New message in ${getConversationDisplayName(data)}: ${data.lastMessagePreview}`);
                            }
                        }
                    });
                });
        }

        function isSocialPanelOpen() {
            const overlay = document.getElementById('social-overlay');
            return Boolean(overlay && !overlay.classList.contains('translate-x-full'));
        }

        function getConversationMessageKey(data) {
            if (!data?.lastMessageAt) return '';
            if (typeof data.lastMessageAt.toMillis === 'function') return String(data.lastMessageAt.toMillis());
            const seconds = data.lastMessageAt.seconds ?? '';
            const nanoseconds = data.lastMessageAt.nanoseconds ?? '';
            return `${seconds}:${nanoseconds}`;
        }

function buildSiteIconUrl(url) {
            try { return `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(new URL(url).origin)}`; }
            catch { return ''; }
        }

        function buildDefaultBrowserIconDataUri() {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#04111f"/><stop offset="58%" stop-color="#123a7a"/><stop offset="100%" stop-color="#2dd4ff"/></linearGradient><linearGradient id="orb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f8fbff"/><stop offset="100%" stop-color="#93c5fd"/></linearGradient></defs><rect width="256" height="256" rx="64" fill="url(#bg)"/><rect x="34" y="46" width="188" height="144" rx="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" stroke-width="6"/><circle cx="128" cy="118" r="54" fill="url(#orb)"/><path d="M74 118h108M128 64c-15 15-24 34-24 54s9 39 24 54M128 64c15 15 24 34 24 54s-9 39-24 54M86 88c12 8 27 12 42 12s30-4 42-12M86 148c12-8 27-12 42-12s30 4 42 12" fill="none" stroke="#0b3b78" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M82 46l14-12 11 16" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/><circle cx="94" cy="46" r="8" fill="#ffffff" opacity="0.92"/></svg>`;
            return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
        }

        function getDefaultBrowserTileIcon() {
            if (!getDefaultBrowserTileIcon.cache) {
                getDefaultBrowserTileIcon.cache = buildDefaultBrowserIconDataUri();
            }
            return getDefaultBrowserTileIcon.cache;
        }

        function syncLauncherCompactMode() {
            const isStandardLauncher = !isWorkspaceCategory();
            const viewport = window.visualViewport;
            const viewportWidth = Math.round(viewport?.width || window.innerWidth || 0);
            const viewportHeight = Math.round(viewport?.height || window.innerHeight || 0);
            const viewportScale = viewport?.scale || 1;
            const shouldCompact = isStandardLauncher && (
                viewportScale > 1.02 ||
                viewportHeight < 760 ||
                viewportWidth < 1380 ||
                (viewportHeight < 920 && viewportWidth < 1700)
            );
            document.body.classList.toggle('launcher-compact', shouldCompact);
        }

        function getMergedCatalog() {
            const merged = [...gameData];
            cloudData.forEach(item => {
                const index = merged.findIndex(entry => entry.id === item.id);
                if (index > -1) merged[index] = item;
                else merged.push(item);
            });
            return merged.sort((a, b) => {
                if (a.type === 'games' && b.type === 'games') {
                    const aPinnedIndex = LauncherConfig.pinnedGameOrder.indexOf(a.id);
                    const bPinnedIndex = LauncherConfig.pinnedGameOrder.indexOf(b.id);
                    const aIsPinned = aPinnedIndex !== -1;
                    const bIsPinned = bPinnedIndex !== -1;

                    if (aIsPinned && bIsPinned) return aPinnedIndex - bPinnedIndex;
                    if (a.id === 'psplus') return 1;
                    if (b.id === 'psplus') return -1;
                    if (aIsPinned) return -1;
                    if (bIsPinned) return 1;
                }

                return (a.title || '').localeCompare(b.title || '');
            });
        }

        function debounceSearch() {
            if (LauncherState.searchDebounceTimer) clearTimeout(LauncherState.searchDebounceTimer);
            LauncherState.searchDebounceTimer = setTimeout(filterGames, LauncherConfig.searchDebounceMs);
        }

        function openSearchResult(gameId) {
            const game = getMergedCatalog().find(entry => entry.id === gameId);
            if (!game) return;
            switchCategory(game.type);
            const targetIndex = filteredGames.findIndex(entry => entry.id === gameId);
            closeModals();
            setFocus(targetIndex > -1 ? targetIndex : 0);
        }

        function resolveGameAsset(baseUrl, assetUrl) {
            if (!assetUrl) return '';
            const normalized = assetUrl.replace(/^hhttps:\/\//i, 'https://').replace(/^http:\/\//i, 'https://');
            try { return new URL(normalized, baseUrl).href; }
            catch { return normalized; }
        }

        function getGameSourceValue(game) {
            const directSource = typeof game?.source === 'string' ? game.source.trim() : '';
            if (directSource) return directSource;
            const htmlSource = typeof game?.htmlSource === 'string' ? game.htmlSource.trim() : '';
            if (htmlSource) return htmlSource;
            return typeof game?.url === 'string' ? game.url.trim() : '';
        }

        function isLikelyHtmlSource(value = '') {
            const source = String(value || '').trim();
            if (!source) return false;
            if (/^(https?:\/\/|\/\/|about:blank|blob:|data:|\/|\.{1,2}\/)/i.test(source)) return false;
            if (!source.includes('<') || !source.includes('>')) return false;
            if (/<(?:!doctype|html|head|body|canvas|script|style|div|main|section|article|svg|iframe|meta|link|title|p|span|h[1-6]|img|audio|video)\b/i.test(source)) {
                return true;
            }
            return /<\/?[a-z][^>]*>/i.test(source) && source.includes('\n');
        }

        function getGameLaunchMeta(game) {
            const source = getGameSourceValue(game);
            const sourceType = game?.sourceType === 'html'
                ? 'html'
                : game?.sourceType === 'url'
                    ? 'url'
                    : (isLikelyHtmlSource(source) ? 'html' : 'url');
            return {
                source,
                sourceType,
                isHtml: sourceType === 'html',
                url: source && sourceType === 'url' ? normalizeLaunchUrl(source) : ''
            };
        }

        function gameHasLaunchSource(game) {
            return !!getGameSourceValue(game);
        }

        function getGameBaseUrl(game) {
            return getGameLaunchMeta(game).url || '';
        }

        function buildStandaloneHtmlDocument(html, title) {
            const source = String(html || '').trim();
            if (!source) return '';
            if (/<!doctype|<html[\s>]/i.test(source)) return source;
            return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title || 'Game')}</title></head><body>${source}</body></html>`;
        }

        function openHtmlSourceWindow(html, title) {
            const win = window.open('about:blank', '_blank');
            if (!win) return false;
            const doc = win.document;
            doc.open();
            doc.write(buildStandaloneHtmlDocument(html, title));
            doc.close();
            try { doc.title = title || 'Game'; } catch {}
            return true;
        }

        function openGameIframeWithUrl(title, url) {
            const frame = document.getElementById('game-iframe');
            document.getElementById('iframe-title').textContent = title;
            frame.srcdoc = '';
            frame.src = url;
            document.getElementById('game-iframe-modal').classList.add('active');
        }

        function openGameIframeWithHtml(title, html) {
            const frame = document.getElementById('game-iframe');
            document.getElementById('iframe-title').textContent = title;
            frame.removeAttribute('src');
            frame.srcdoc = buildStandaloneHtmlDocument(html, title);
            document.getElementById('game-iframe-modal').classList.add('active');
        }

        function normalizeLaunchUrl(url) {
            try {
                const parsed = new URL(url);
                if (parsed.hostname !== 'cdn.jsdelivr.net') return parsed.href;
                const path = parsed.pathname;
                const lastSegment = path.split('/').pop() || '';
                if (path.endsWith('/')) {
                    parsed.pathname += 'index.html';
                    return parsed.href;
                }
                if (!lastSegment.includes('.')) {
                    parsed.pathname += '/index.html';
                    return parsed.href;
                }
                return parsed.href;
            } catch {
                return url;
            }
        }

        function resolveGameBackground(game) {
            if (game.type !== 'games') return game.bg;
            const banner = gameBackgroundOverrides[game.id];
            const baseUrl = getGameBaseUrl(game);
            if (banner) return resolveGameAsset(baseUrl, banner);
            const artFallback = gameIconOverrides[game.id]?.img;
            if (artFallback) return resolveGameAsset(baseUrl, artFallback);
            return game.bg;
        }

        function shouldInlineLaunch(url) {
            try {
                const parsed = new URL(url);
                if (parsed.hostname !== 'cdn.jsdelivr.net') return false;
                const pathname = parsed.pathname.toLowerCase();
                const ext = pathname.split('.').pop();
                return pathname.endsWith('/') || !pathname.includes('.') || ['html', 'htm', 'xhtml'].includes(ext);
            } catch {
                return false;
            }
        }

        function injectBaseHref(html, baseHref) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            if (!doc.querySelector('base')) {
                const base = doc.createElement('base');
                base.href = baseHref;
                doc.head.prepend(base);
            }
            return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
        }

        async function fetchLaunchHtmlSource(sourceUrl) {
            const response = await fetch(sourceUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return injectBaseHref(await response.text(), sourceUrl);
        }

        function shouldPreflightLaunchUrl(url) {
            try {
                return new URL(url, window.location.href).origin === window.location.origin;
            } catch {
                return false;
            }
        }

        // Fail fast on broken local routes so the launcher can explain the issue
        // instead of opening a blank iframe or about:blank shell.
        async function preflightLaunchUrl(url) {
            if (!shouldPreflightLaunchUrl(url)) {
                return { checked: false, ok: true, url };
            }

            const resolved = new URL(url, window.location.href);
            try {
                const response = await fetch(resolved.href, {
                    method: 'HEAD',
                    cache: 'no-store'
                });
                return {
                    checked: true,
                    ok: response.ok,
                    status: response.status,
                    url: resolved.href,
                    pathname: resolved.pathname
                };
            } catch (error) {
                return {
                    checked: true,
                    ok: false,
                    status: 0,
                    url: resolved.href,
                    pathname: resolved.pathname,
                    error
                };
            }
        }

        function describeLaunchFailure(result) {
            const path = result?.pathname || result?.url || 'resource';
            if (result?.status) {
                return `${path} returned HTTP ${result.status} on this server.`;
            }
            return `${path} could not be reached from this browser.`;
        }

        function openExternalUrl(url, options = {}) {
            const {
                blockedMessage = 'Popup blocked. Opening in this tab instead.',
                fallbackToCurrentTab = true
            } = options;
            const win = window.open(url, '_blank', 'noopener,noreferrer');
            if (win) return { opened: true, fallback: false };
            if (blockedMessage) showToast(blockedMessage);
            if (fallbackToCurrentTab) {
                window.location.href = url;
                return { opened: false, fallback: true };
            }
            return { opened: false, fallback: false };
        }

        function htmlToDataUrl(html) {
            const bytes = new TextEncoder().encode(html);
            if (bytes.length > 750000) {
                throw new Error('HTML too large for Base64 Data URL mode');
            }

            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }

            return `data:text/html;charset=utf-8;base64,${btoa(binary)}`;
        }

        function renderLaunchError(doc, title, message, fallbackUrl) {
            doc.open();
            doc.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title><style>
                body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#fff;font-family:Inter,sans-serif}
                .card{max-width:680px;padding:28px 32px;border:1px solid #2f2f2f;border-radius:18px;background:rgba(18,18,18,.96);box-shadow:0 24px 80px rgba(0,0,0,.45)}
                h1{margin:0 0 12px;font-size:28px} p{margin:0 0 16px;color:#bbb;line-height:1.5}
                a{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:999px;background:#fff;color:#000;text-decoration:none;font-weight:700}
            </style></head><body><div class="card"><h1>${title}</h1><p>${message}</p><a href="${fallbackUrl}">Open Source URL</a></div></body></html>`);
            doc.close();
        }

        async function launchInlinePage(win, title, url) {
            const sourceUrl = normalizeLaunchUrl(url);
            const response = await fetch(sourceUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = injectBaseHref(await response.text(), sourceUrl);
            const doc = win.document;
            doc.open();
            doc.write(html);
            doc.close();
            try { doc.title = `${title} - Launcher`; } catch {}
        }

        function enrichGameData(game) {
            const baseGame = game.type === 'games'
                ? { ...game, bg: resolveGameBackground(game) }
                : { ...game };
            const baseUrl = getGameBaseUrl(baseGame);

            if (baseGame.type === 'browsers') {
                const hasHttpImage = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());
                const iconIsHtml = (v) => typeof v === 'string' && v.trim().startsWith('<');
                const fallbackImg = getDefaultBrowserTileIcon();

                const explicitImg = hasHttpImage(baseGame.img) ? baseGame.img.trim() : '';
                const explicitIconUrl = hasHttpImage(baseGame.icon) ? baseGame.icon.trim() : '';

                if (explicitImg || explicitIconUrl) {
                    const img = explicitImg || explicitIconUrl;
                    const next = { ...baseGame, img, fallbackImg };
                    if (next.placeholder) delete next.placeholder;
                    if (iconIsHtml(next.icon) && !explicitIconUrl) delete next.icon;
                    if (next.isLogo === undefined) next.isLogo = true;
                    return next;
                }

                const next = {
                    ...baseGame,
                    img: fallbackImg,
                    fallbackImg,
                    isLogo: true,
                };
                delete next.icon;
                delete next.placeholder;
                return next;
            }

            // Default isLogo to false ONLY for new custom cloud games
            if (baseGame.isLogo === undefined && baseGame.isCloud) {
                baseGame.isLogo = false;
            }

            if (baseGame.type !== 'games' || baseGame.icon) {
                const manualVisual = baseGame.icon || baseGame.img;
                const isMarkupVisual = typeof manualVisual === 'string' && manualVisual.trim().startsWith('<');
                if (isMarkupVisual) {
                    return { ...baseGame };
                }
                return { ...baseGame, img: manualVisual };
            }
            
            const fallbackImg = buildSiteIconUrl(baseUrl);
            const override = gameIconOverrides[baseGame.id];
            if (override?.img) {
                return {
                    ...baseGame,
                    img: resolveGameAsset(baseUrl, override.img),
                    fallbackImg,
                    isLogo: false
                };
            }
            if (baseGame.placeholder) return { ...baseGame, img: fallbackImg, fallbackImg, isLogo: false };
            return baseGame;
        }

        function buildFallbackGameIcon() {
            const icon = document.createElement('i');
            icon.className = 'fas fa-gamepad text-4xl text-gray-500';
            return icon;
        }

        function handleImgError(img) {
            const fallback = img.dataset.fallback || '';
            if (!img.dataset.fallbackApplied && fallback && img.src !== fallback) {
                img.dataset.fallbackApplied = '1';
                img.src = fallback;
                return;
            }
            img.replaceWith(buildFallbackGameIcon());
        }

        function renderTiles() {
            if (isWorkspaceCategory()) {
                gameList.innerHTML = '';
                return;
            }
            currentIndex = 0;
            gameList.innerHTML = '';
            filteredGames.forEach((game, index) => {
                const tile = document.createElement('div');
                tile.className = `game-tile ${index === 0 ? 'focused' : ''}`;
                tile.dataset.index = index;
                tile.style.animationDelay = `${index * 0.04}s`;
                let innerContent = '';
                const isHtmlIcon = (game.img && game.img.trim().startsWith('<')) || (game.icon && game.icon.trim().startsWith('<'));

                if (isHtmlIcon) {
                    const iconHtml = (game.img && game.img.includes('<')) ? game.img : game.icon;
                    innerContent = `<div class="flex items-center justify-center w-full h-full text-4xl accent-text">${iconHtml}</div>`;
                } else if (game.icon && game.icon.startsWith('http')) {
                    const imgClass = game.isLogo ? 'game-logo' : '';
                    innerContent = `<img src="${game.icon}" alt="${game.title}" class="${imgClass}" data-fallback="${game.fallbackImg || ''}" onerror="handleImgError(this)">`;
                } else if (game.img) {
                    const imgClass = game.isLogo ? 'game-logo' : '';
                    innerContent = `<img src="${game.img}" alt="${game.title}" class="${imgClass}" data-fallback="${game.fallbackImg || ''}" onerror="handleImgError(this)">`;
                } else if (game.placeholder) {
                    innerContent = `<div class="placeholder">${game.placeholder}</div>`;
                } else {
                    innerContent = `<i class="fas fa-gamepad text-4xl text-gray-500"></i>`;
                }
                tile.innerHTML = `${innerContent}<div class="selection-glow"></div><div class="game-title-popup">${game.title}</div>`;
                tile.addEventListener('mouseenter', () => scheduleSetFocus(index));
                tile.addEventListener('mouseleave', (e) => {
                    e.stopPropagation();
                    clearScheduledFocus();
                });
                tile.addEventListener('click', () => launchCurrentGame());
                gameList.appendChild(tile);
            });
            updateDisplay();
        }

        // --- Sound Engine ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        function playUISound(type) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            const now = audioCtx.currentTime;
            
            if (type === 'hover') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start();
                osc.stop(now + 0.1);
            } else if (type === 'click') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
                gain.gain.setValueAtTime(0.03, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start();
                osc.stop(now + 0.05);
            }
        }

        function setFocus(index) {
            if (isWorkspaceCategory()) return;
            if (!filteredGames.length) return;
            if (index < 0) index = 0;
            if (index >= filteredGames.length) index = filteredGames.length - 1;
            const tiles = document.querySelectorAll('.game-tile');
            const activeTile = tiles[index];
            if (index === currentIndex) {
                if (!activeTile?.classList.contains('focused')) {
                    document.querySelectorAll('.game-tile.focused').forEach(t => t.classList.remove('focused'));
                    activeTile?.classList.add('focused');
                    updateDisplay();
                }
                return;
            }
            document.querySelectorAll('.game-tile.focused').forEach(t => t.classList.remove('focused'));
            currentIndex = index;
            activeTile?.classList.add('focused');
            updateDisplay();
        }

        function scheduleSetFocus(index) {
            if (isWorkspaceCategory()) return;
            clearScheduledFocus();
            hoverFocusTimer = setTimeout(() => { setFocus(index); hoverFocusTimer = null; }, 60);
        }

        function clearScheduledFocus() { if (hoverFocusTimer) { clearTimeout(hoverFocusTimer); hoverFocusTimer = null; } }

        function updateDisplay() {
            syncLauncherCompactMode();
            if (isWxterCategory()) {
                applyWxterBackground();
                return;
            }
            const game = filteredGames[currentIndex];
            if (!game) return;
            gameInfo.style.opacity = '0';
            const FADE_MS = 150;
            gameInfo.style.transition = `opacity ${FADE_MS}ms ease`;
            setTimeout(() => {
                activeTitle.textContent = game.title;
                activeDesc.textContent = game.desc;
                document.getElementById('btn-action-text').textContent = gameHasLaunchSource(game) ? 'Open' : 'Start';
                
                const profile = loadProfile();
                const favItems = profile.favoriteItems || [];
                const isFav = favItems.includes(game.id);
                const favBtn = document.getElementById('btn-favorite');
                if (favBtn) {
                    if (isFav) favBtn.classList.add('active');
                    else favBtn.classList.remove('active');
                }
                syncGameActionsState();
                
                gameInfo.style.opacity = '1';
            }, FADE_MS);

            const bgImg = game.bg || game.img || 'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?q=80&w=1920';
            const newBg = `url(${bgImg})`;
            bgOverlay.style.setProperty('--new-bg', newBg);
            
            // Sync Ken Burns and Transition
            bgOverlay.classList.add('transitioning');
            bgOverlay.style.animation = 'none';
            void bgOverlay.offsetWidth;
            bgOverlay.style.animation = 'kenBurns 30s infinite alternate ease-in-out';

            setTimeout(() => {
                bgOverlay.style.setProperty('--current-bg', newBg);
                bgOverlay.classList.remove('transitioning');
            }, 800);

            bgOverlay.style.transform = 'scale(1.05)';
            bgOverlay.animate(
                [{ transform: 'scale(1.05)' }, { transform: 'scale(1.1)' }],
                { duration: 1500, easing: 'ease-out', fill: 'forwards' }
            );

            const viewportCenter = window.innerWidth / 2;
            const tileWidth = 154;
            const tileGap = 20;
            const tileStep = tileWidth + tileGap;
            const tileCenter = tileWidth / 2;
            const offset = viewportCenter - tileCenter - (currentIndex * tileStep);
            gameList.style.transform = `translateX(${offset}px)`;

            // Dynamically change UI accent colors based on game
            const colorMap = {
                'lamb': '#ef4444', 
                'eternal': '#ec4899', 
                'cod': '#f43f5e', 
                'nefarius': '#a855f7',
                'store': '#3b82f6',
                'admin': '#10b981'
            };
            const accent = colorMap[game.id] || '#3b82f6';
            document.documentElement.style.setProperty('--accent-neon', accent);
            document.documentElement.style.setProperty('--accent-glow', accent + '60');
            
            if (typeof playUISound === 'function') playUISound('hover');
        }

        function filterGames() {
            const search = document.querySelector('#search-input').value.toLowerCase();
            const searchResults = document.getElementById('search-results');
            const catalog = getMergedCatalog();
            
            if (!search.trim()) {
                searchResults.innerHTML = '';
                document.getElementById('search-results-count').textContent = LauncherConfig.searchPromptText;
                return;
            }
            
            const results = catalog.filter(g => 
                g.title.toLowerCase().includes(search) || 
                g.desc.toLowerCase().includes(search)
            );
            
            document.getElementById('search-results-count').textContent = `Found ${results.length} result${results.length !== 1 ? 's' : ''}`;

            const resultsHtml = results.slice(0, LauncherConfig.searchResultsLimit).map(game => {
                let icon = '';
                if (game.img) {
                    icon = `<img src="${game.img}" alt="${game.title}" class="w-12 h-12 mx-auto mb-2 rounded object-cover">`;
                } else if (game.icon) {
                    icon = `<div class="mb-2">${game.icon}</div>`;
                } else {
                    icon = `<i class="fas fa-gamepad text-2xl text-gray-500 mb-2 block"></i>`;
                }

                return `<button type="button" class="bg-gray-800 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-700 transition transform hover:scale-105" data-search-game="${game.id}">${icon}<div class="text-sm font-semibold truncate">${game.title}</div></button>`;
            }).join('');

            searchResults.innerHTML = resultsHtml || '<div class="col-span-3 text-sm text-gray-400 text-center py-6">No matches found.</div>';
            searchResults.querySelectorAll('[data-search-game]').forEach(tile => {
                tile.addEventListener('click', () => openSearchResult(tile.dataset.searchGame));
            });
        }

        // Profile System

gameData = rawGameData.map(enrichGameData);
