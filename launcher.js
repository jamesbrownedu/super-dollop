function loadSettings() {
            scrollSensitivity = parseInt(localStorage.getItem('scrollSensitivity')) || 1;
            const savedMode = localStorage.getItem('gameRenderMode');
            gameRenderMode = renderModes.includes(savedMode) ? savedMode : 'about-blank';
            loadWxterEndpointForCurrentAccount();
            document.getElementById('scroll-sensitivity').value = scrollSensitivity;
            document.getElementById('game-render-mode').value = gameRenderMode;
            document.getElementById('wxter-api-endpoint').value = WxterState.endpoint;
            updateSensitivityDisplay();
        }

        function saveSettings() {
            scrollSensitivity = parseInt(document.getElementById('scroll-sensitivity').value);
            gameRenderMode = document.getElementById('game-render-mode').value;
            WxterState.endpoint = (document.getElementById('wxter-api-endpoint').value.trim() || WxterConfig.defaultEndpoint).replace(/\/$/, '');

            localStorage.setItem('scrollSensitivity', scrollSensitivity);
            localStorage.setItem('gameRenderMode', gameRenderMode);
            setAccountScopedStorageItem(WxterConfig.endpointStorageKey, WxterState.endpoint);

            probeWxterHealth(true);
            closeModals();
        }

        function updateSensitivityDisplay() {
            document.getElementById('sensitivity-value').textContent = document.getElementById('scroll-sensitivity').value;
        }

        function toggleFavorite() {
            if (isWxterCategory()) return;
            if (!filteredGames[currentIndex]) return;
            const gameId = filteredGames[currentIndex].id;
            const profile = loadProfile();
            profile.favoriteItems = profile.favoriteItems || [];
            
            const index = profile.favoriteItems.indexOf(gameId);
            if (index > -1) {
                profile.favoriteItems.splice(index, 1);
            } else {
                profile.favoriteItems.push(gameId);
            }
            profile.favorites = profile.favoriteItems.length;
            localStorage.setItem('userProfile', JSON.stringify(profile));
            
            checkFavoritesTab();
            if (currentCategory === 'favorites') {
                if (profile.favoriteItems.length === 0) {
                    switchCategory('games');
                } else {
                    switchCategory('favorites');
                }
            } else {
                updateDisplay();
            }
            updateProfileDisplay();
            syncGameActionsState();
        }

        function syncGameActionsState() {
            if (isWxterCategory()) return;
            const game = filteredGames[currentIndex];
            const favoriteButton = document.getElementById('game-actions-favorite');
            const title = document.getElementById('game-actions-title');
            const description = document.getElementById('game-actions-desc');
            if (!game) return;

            if (title) title.textContent = game.title;
            if (description) description.textContent = game.desc || 'Quick actions for the selected game.';
            if (!favoriteButton) return;

            const favoriteIds = loadProfile().favoriteItems || [];
            const isFavorite = favoriteIds.includes(game.id);
            favoriteButton.innerHTML = isFavorite
                ? '<i class="fas fa-heart"></i><span>Unfavorite</span>'
                : '<i class="fas fa-heart"></i><span>Favorite</span>';
            favoriteButton.classList.toggle('active', isFavorite);
        }

        function openGameActions() {
            if (isWxterCategory()) return;
            if (!filteredGames.length) return;
            syncGameActionsState();
            document.getElementById('game-actions-modal').classList.add('active');
        }

        async function openCurrentGameDirect() {
            const game = filteredGames[currentIndex];
            const launch = getGameLaunchMeta(game);
            if (!launch.source) return;
            closeModals();
            if (launch.isHtml) {
                if (!openHtmlSourceWindow(launch.source, game?.title || 'Game')) {
                    openGameIframeWithHtml(game?.title || 'Game', launch.source);
                    showToast('Popup blocked, opening HTML in the launcher.');
                }
            } else {
                const launchCheck = await preflightLaunchUrl(launch.url);
                if (launchCheck.checked && !launchCheck.ok) {
                    console.warn(`Direct launch failed for ${game?.title || 'Game'}`, launchCheck);
                    showToast(`${game?.title || 'Game'} could not open. ${describeLaunchFailure(launchCheck)}`);
                    return;
                }
                openExternalUrl(launch.url, {
                    blockedMessage: `${game?.title || 'Game'} was blocked as a popup, so it is opening in this tab instead.`
                });
            }
        }

        async function copyCurrentGameLink() {
            const game = filteredGames[currentIndex];
            const launch = getGameLaunchMeta(game);
            if (!launch.source) return;
            try {
                await navigator.clipboard.writeText(launch.isHtml ? launch.source : launch.url);
                showToast(launch.isHtml ? 'HTML source copied.' : 'Link copied.');
            } catch {
                showToast(launch.isHtml ? 'Could not copy HTML source.' : 'Could not copy link.');
            }
        }

        function closeGameIframe() {
            if(typeof originalTitle !== 'undefined') document.title = originalTitle;
            if(typeof originalFavicon !== 'undefined') document.querySelector('link[rel="icon"]').href = originalFavicon;
            document.getElementById('game-iframe-modal').classList.remove('active');
            setTimeout(() => {
                const frame = document.getElementById('game-iframe');
                frame.srcdoc = '';
                frame.src = '';
            }, 250);
        }

        async function fetchLearningHistory() {
            const lpHide = document.getElementById('learning-pulse');
            if (userRole !== 'owner') {
                if (lpHide) lpHide.style.display = 'none';
                syncLauncherCompactMode();
                return;
            }
            if (isWorkspaceCategory()) {
                const lp = document.getElementById('learning-pulse');
                if (lp) lp.style.display = 'none';
                syncLauncherCompactMode();
                return;
            }
            
            try {
                const response = await fetch(`${WxterState.endpoint}/api/learning-history`);
                if (!response.ok) throw new Error('Network error');
                const data = await response.json();
                
                const list = document.getElementById('learning-pulse-list');
                const container = document.getElementById('learning-pulse');
                if (!list || !container) return;

                if (!data.history || data.history.length === 0) {
                    container.style.display = 'none';
                    syncLauncherCompactMode();
                    return;
                }
                
                container.style.display = 'block';
                list.innerHTML = data.history.map(item => {
                    let dStr = 'Recently';
                    try { dStr = new Date(item.learned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch(e){}
                    const safeName = escapeHtml(item.name || 'Untitled');
                    const safeSummary = escapeHtml(item.summary || 'AI has analyzed this entity and updated the local knowledge nodes.');
                    return `
                        <div class="learning-pulse-item" onclick="switchCategory('wxter')">
                            <div class="learning-pulse-name">${safeName}</div>
                            <div class="learning-pulse-summary">${safeSummary}</div>
                            <div class="learning-pulse-date">${escapeHtml(dStr)}</div>
                        </div>
                    `;
                }).join('');
                syncLauncherCompactMode();
            } catch (error) {
                const lp = document.getElementById('learning-pulse');
                if (lp) lp.style.display = 'none';
                syncLauncherCompactMode();
            }
        }

        function startClockInterval() {
            if (LauncherState.clockInterval) return;
            LauncherState.clockInterval = setInterval(updateClock, 1000);
        }

        function stopClockInterval() {
            if (!LauncherState.clockInterval) return;
            clearInterval(LauncherState.clockInterval);
            LauncherState.clockInterval = null;
        }

        function updateNetworkBanner(isOnline = navigator.onLine, { announce = true } = {}) {
            const banner = document.getElementById('network-banner');
            if (!banner) return;
            clearTimeout(LauncherState.networkBannerTimer);

            if (isOnline) {
                banner.innerHTML = '<i class="fas fa-wifi text-emerald-300"></i><span>Connection restored. Cloud features are back.</span>';
                banner.className = 'network-banner active';
                if (announce) {
                    LauncherState.networkBannerTimer = setTimeout(() => banner.classList.remove('active'), 2600);
                } else {
                    banner.classList.remove('active');
                }
                return;
            }

            banner.innerHTML = '<i class="fas fa-triangle-exclamation text-red-300"></i><span>You are offline. Cloud sync and support updates will pause.</span>';
            banner.className = 'network-banner offline active';
        }

        function init() {
            enforceDeviceBanWall();
            loadSettings();
            syncLauncherCompactMode();
            initWxter();
            updateProfileDisplay();
            fetchLearningHistory();
            syncCloudLibrary(); // New Cloud Sync
            updateClock(); 
            startClockInterval();
            gameList.addEventListener('mouseleave', clearScheduledFocus);
            window.addEventListener('resize', updateDisplay);
            window.visualViewport?.addEventListener('resize', syncLauncherCompactMode);
            checkFavoritesTab();
            updateNetworkBanner(navigator.onLine, { announce: false });

            document.addEventListener('click', () => {
                ideCloseFileMenu();
            });

            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    stopClockInterval();
                } else {
                    updateClock();
                    startClockInterval();
                }
            });

            window.addEventListener('online', () => updateNetworkBanner(true));
            window.addEventListener('offline', () => updateNetworkBanner(false));
        }


        function checkFavoritesTab() {
            const profile = loadProfile();
            const favs = profile.favoriteItems || [];
            const favBtn = document.getElementById('btn-favorites');
            if (favBtn) {
                favBtn.classList.toggle('collapsed', favs.length === 0);
                favBtn.classList.toggle('revealed', favs.length > 0);
            }
            return favs.length > 0;
        }

        async function syncCloudLibrary() {
            if(!db) {
                switchCategory(currentCategory);
                return;
            }
            try {
                const [g, m, b] = await Promise.all([
                    db.collection('games').get(),
                    db.collection('media').get(),
                    db.collection('browsers').get()
                ]);
                
                const cloudItems = [
                    ...g.docs.map(d => ({...d.data(), id: d.id, type:'games', isCloud: true})),
                    ...m.docs.map(d => ({...d.data(), id: d.id, type:'media', isCloud: true})),
                    ...b.docs.map(d => ({...d.data(), id: d.id, type:'browsers', isCloud: true}))
                ];
                
                cloudData = cloudItems.map(enrichGameData);
                switchCategory(currentCategory);
            } catch(e) { 
                console.error("Cloud Sync Error:", e);
                switchCategory(currentCategory);
            }
        }

        function isSupportCategory() { return currentCategory === 'support'; }

        function switchCategory(cat) {
            currentCategory = cat;
            document.body.classList.toggle('workspace-mode', isWorkspaceCategory(cat) && cat !== 'support');
            document.querySelectorAll('.media-btn').forEach(btn => btn.classList.remove('active'));
            const activeBtn = document.getElementById('btn-' + cat) || document.getElementById('btn-' + (cat === 'ide' ? 'vscode' : cat));
            if (activeBtn) activeBtn.classList.add('active');

            // Handle support mode
            const supportWorkspace = document.getElementById('support-workspace');
            const isSupportActive = cat === 'support';
            document.body.classList.toggle('support-mode', isSupportActive);
            if (supportWorkspace) supportWorkspace.classList.toggle('hidden', !isSupportActive);
            syncWxterVisibility();
            updateWxterSettingsIconVisibility(); // Show/hide blue settings icon based on Wxter tab
            if (isSupportActive) {
                resetSupportForm();
                loadMySupportTickets();
                syncLauncherCompactMode();
                return;
            }

            const learningPulseEl = document.getElementById('learning-pulse');
            if (isWorkspaceCategory()) {
                if (learningPulseEl) learningPulseEl.style.display = 'none';
            } else {
                fetchLearningHistory();
            }

            if (isWorkspaceCategory()) {
                filteredGames = [];
                currentIndex = 0;
                renderTiles();
                return;
            }

            const combined = getMergedCatalog();
            if (cat === 'favorites') {
                const profile = loadProfile();
                const favs = profile.favoriteItems || [];
                filteredGames = combined.filter(g => favs.includes(g.id));
            } else {
                filteredGames = combined.filter(g => g.type === cat);
            }
            currentIndex = 0;
            renderTiles();
        }

const defaultProfile = {
            username: 'Guest',
            bio: 'Welcome!',
            profilePic: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest',
            gamesPlayed: 0,
            favorites: 0,
            totalTime: 0
        };

        function loadProfile() {
            try {
                return JSON.parse(localStorage.getItem('userProfile') ?? 'null') ?? { ...defaultProfile };
            } catch {
                return { ...defaultProfile };
            }
        }

                async function saveProfile() {
            const existing = loadProfile();
            const rawName = document.getElementById('profile-name').value || 'Guest';
            if (isUsernameForbidden(rawName)) {
                showToast('That username is not available.');
                return;
            }
            const profile = {
                username: rawName.trim() || 'Guest',
                bio: document.getElementById('profile-bio').value,
                profilePic: document.getElementById('profile-pic-preview').src,
                gamesPlayed: existing.gamesPlayed, favorites: existing.favorites, totalTime: existing.totalTime
            };
            localStorage.setItem('userProfile', JSON.stringify(profile));
            updateProfileDisplay();
            if(currentUser && db) {
                try {
                    await db.collection('users').doc(currentUser.uid).update({
                        username: profile.username,
                        usernameLower: profile.username.toLowerCase(),
                        displayName: profile.username,
                        bio: profile.bio,
                        avatarUrl: profile.profilePic,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    showToast("Profile synced to cloud!");
                } catch(e) { console.warn("Cloud sync error"); }
            }
            closeModals();
        }

        function updateProfileDisplay() {
            const profile = loadProfile();
            const modal = document.getElementById('profile-modal');
            const content = modal.querySelector('.space-y-6');
            
            // Restore original "Edit Profile" layout if it was changed by viewOtherProfile
            content.innerHTML = `
                <div class="flex items-center gap-6">
                    <div class="relative profile-avatar">
                        <img id="profile-pic-preview" src="${profile.profilePic}" alt="Profile" onerror="handleAvatarFallback(this, '${profile.username.replace(/'/g, "\\'")}')">
                        <input type="file" id="profile-pic-input" accept="image/*" class="hidden">
                        <label for="profile-pic-input" class="upload-button">
                            <i class="fas fa-camera text-white text-sm"></i>
                        </label>
                    </div>
                    <div class="flex-1">
                        <div class="mb-4">
                            <label class="block text-sm font-semibold mb-2">Username</label>
                            <input type="text" id="profile-name" value="${profile.username}" placeholder="Enter username" class="modal-input w-full">
                        </div>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-2">Bio</label>
                    <textarea id="profile-bio" placeholder="Tell us about yourself..." class="modal-input h-20 resize-none w-full">${profile.bio || ''}</textarea>
                </div>
                <div class="grid grid-cols-3 gap-4">
                    <div class="stat-box">
                        <div class="stat-value" id="stats-played">${profile.gamesPlayed}</div>
                        <div class="stat-label">Games Played</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" id="stats-favorites">${profile.favorites}</div>
                        <div class="stat-label">Favorites</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" id="stats-time">${Math.floor(profile.totalTime / 60)}h</div>
                        <div class="stat-label">Total Time</div>
                    </div>
                </div>
                <div class="flex gap-4">
                    <button onclick="saveProfile()" class="btn-primary flex-1">
                        <i class="fas fa-save"></i><span>Save Profile</span>
                    </button>
                    <button onclick="closeModals()" class="btn-secondary flex-1">
                        Cancel
                    </button>
                </div>
                <div class="mt-6 pt-4 border-t border-white/10 flex gap-4">
                    <button id="profile-login-btn" class="flex-1 bg-white hover:bg-gray-200 text-black font-bold py-3 px-4 rounded transition" onclick="closeModals(); toggleModal('auth-modal'); event.stopPropagation();" style="${currentUser ? 'display:none' : 'display:block'}">
                        <i class="fas fa-sign-in-alt mr-2"></i>Login / Switch
                    </button>
                    <button id="profile-logout-btn" class="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded transition" onclick="handleLogout(); event.stopPropagation();" style="${currentUser ? 'display:block' : 'display:none'}">
                        <i class="fas fa-sign-out-alt mr-2"></i>Sign Out
                    </button>
                </div>
            `;
            
            document.getElementById('header-profile-pic').src = profile.profilePic;
            document.getElementById('username-display').textContent = profile.username;

            // Re-attach the file input listener since we just replaced the DOM element
            const pInput = document.getElementById('profile-pic-input');
            if(pInput) {
                pInput.addEventListener('change', handleProfilePicChange);
            }
        }

        function handleProfilePicChange(e) {
            const file = e.target.files[0];
            if (!file) return;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const max = 128;
                const ratio = Math.min(max / img.width, max / img.height);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const compressed = canvas.toDataURL('image/jpeg', 0.7);
                document.getElementById('profile-pic-preview').src = compressed;
                URL.revokeObjectURL(url);
            };
            img.src = url;
        }

        function recordGamePlay(gameId) {
            const profile = loadProfile();
            profile.gamesPlayed += 1;
            profile.totalTime += 1;
            localStorage.setItem('userProfile', JSON.stringify(profile));
            updateProfileDisplay();

            // Track click count in Firestore
            if (db && gameId) {
                const ref = db.collection('stats').doc('gameClicks');
                ref.set({
                    [gameId]: firebase.firestore.FieldValue.increment(1),
                    _totalClicks: firebase.firestore.FieldValue.increment(1),
                    _lastClickedGame: gameId,
                    _lastClickedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(() => {});
            }
        }

        // --- Unique Viewer Tracking (per device fingerprint) ---
        function getDeviceFingerprint() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('fp', 2, 2);
            const canvasData = canvas.toDataURL();
            const raw = [
                navigator.userAgent,
                screen.width + 'x' + screen.height,
                screen.colorDepth,
                Intl.DateTimeFormat().resolvedOptions().timeZone,
                navigator.language,
                navigator.hardwareConcurrency || 0,
                canvasData.slice(-50)
            ].join('|');
            let hash = 0;
            for (let i = 0; i < raw.length; i++) {
                hash = ((hash << 5) - hash) + raw.charCodeAt(i);
                hash |= 0;
            }
            return 'dev_' + Math.abs(hash).toString(36);
        }

        function trackUniqueViewer() {
            if (!db) return;
            const deviceId = getDeviceFingerprint();
            db.collection('stats').doc('viewers').set({
                [deviceId]: {
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                    ua: navigator.userAgent.slice(0, 80),
                    screen: screen.width + 'x' + screen.height
                },
                _totalViews: firebase.firestore.FieldValue.increment(1)
            }, { merge: true }).catch(() => {});

            if (currentUser) {
                db.collection('users').doc(currentUser.uid).set({
                    lastDeviceId: deviceId,
                    lastDeviceSeenAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(() => {});
            }
        }

function updateUserStatus(status) {
            if(!currentUser || !db) return;
            db.collection('users').doc(currentUser.uid).update({
                status: status,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                updateUserStatus('online');
            } else {
                updateUserStatus('away');
            }
        });

        window.addEventListener('beforeunload', () => updateUserStatus('offline'));

        function toggleModal(id) {
            document.getElementById(id).classList.toggle('active');
            if (id === 'search-modal') {
                if (LauncherState.searchDebounceTimer) clearTimeout(LauncherState.searchDebounceTimer);
                document.getElementById('search-input').value = '';
                document.getElementById('search-results').innerHTML = '';
                document.getElementById('search-results-count').textContent = LauncherConfig.searchPromptText;
                setTimeout(() => document.getElementById('search-input').focus(), 100);
            }
            if (id === 'profile-modal') {
                updateProfileDisplay();
            }
            if (id === 'admin-modal' && document.getElementById(id).classList.contains('active')) {
                switchAdminTab('catalog');
            }
        }
        function closeModals() {
            if (LauncherState.searchDebounceTimer) clearTimeout(LauncherState.searchDebounceTimer);
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        }

        /* --- IDE (WebCode) Logic --- */

let wheelTimeout;
        document.getElementById('game-list').addEventListener('wheel', e => {
            e.preventDefault();
            if (wheelTimeout) return;
            // Delay in ms: higher sensitivity means less cooldown between wheel focus moves.
            const delay = Math.max(
                LauncherConfig.wheelCooldownMin,
                LauncherConfig.wheelCooldownBase - (scrollSensitivity * LauncherConfig.wheelSensitivityStep)
            );
            wheelTimeout = setTimeout(() => { wheelTimeout = null; }, delay);
            const delta = Math.sign(e.deltaY);
            setFocus(currentIndex + delta);
        }, { passive: false });

        // ===== SUPPORT SYSTEM =====
