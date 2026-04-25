let currentUser = null;

let auth = null, db = null;
        
        let userRole = 'user'; // user, mod, owner

        function getAccountStorageScopeId() {
            return currentUser?.uid ? `account:${currentUser.uid}` : 'guest';
        }

        function getAccountScopedStorageKey(baseKey) {
            return `${baseKey}::${getAccountStorageScopeId()}`;
        }

        function getAccountScopedStorageItem(baseKey) {
            const scopedKey = getAccountScopedStorageKey(baseKey);
            const scopedValue = localStorage.getItem(scopedKey);
            if (scopedValue !== null) return scopedValue;

            const legacyValue = localStorage.getItem(baseKey);
            if (legacyValue !== null) {
                localStorage.setItem(scopedKey, legacyValue);
                return legacyValue;
            }

            return null;
        }

        function setAccountScopedStorageItem(baseKey, value) {
            localStorage.setItem(getAccountScopedStorageKey(baseKey), value);
        }
  
         try {
             if (typeof firebase !== 'undefined') {
                 const firebaseApp = (firebase.apps && firebase.apps.length)
                     ? firebase.app()
                     : firebase.initializeApp(firebaseConfig);
                 auth = firebase.auth(firebaseApp);
                 db = firebase.firestore(firebaseApp);
                 db.enablePersistence({ synchronizeTabs: true }).catch((error) => {
                     if (!['failed-precondition', 'unimplemented'].includes(error?.code)) {
                         console.warn('Firestore persistence unavailable', error);
                     }
                 });
             }
         } catch(e) { console.error('Firebase Blocked', e); }
  
          let userSub = null;
        let roleSub = null;

        try {
            if(auth) auth.onAuthStateChanged(async (user) => {
                currentUser = user;
                if (userSub) { userSub(); userSub = null; }
                if (roleSub) { roleSub(); roleSub = null; }

                if (user) {
                    if (db) {
                        try {
                            const modSnap = await db.collection('users').doc(user.uid).get();
                            const modData = modSnap.exists ? (modSnap.data() || {}) : {};
                            if (modData.platformKicked === true) {
                                showToast('This account has been kicked from the platform. You must register a new account or ask the owner to reverse the kick.');
                                await auth.signOut();
                                return;
                            }
                            if (modData.platformBanned === true) {
                                showToast('This account is banned from the platform.');
                                await auth.signOut();
                                return;
                            }
                        } catch (modErr) {
                            console.warn(modErr);
                        }
                    }

                    document.getElementById('auth-modal')?.classList.remove('active');
                    if(document.getElementById('profile-login-btn')) document.getElementById('profile-login-btn').style.display = 'none';
                    if(document.getElementById('profile-logout-btn')) document.getElementById('profile-logout-btn').style.display = 'block';
                    
                    // Initial fallback UI from Auth Profile
                    const fallbackName = user.displayName || user.email.split('@')[0];
                    document.getElementById('username-display').innerHTML = `${escapeHtml(fallbackName)} <span id="role-badge" class="text-[9px] bg-gray-700 px-1.5 py-0.5 rounded tracking-widest hidden ml-2"></span>`;
                    const profilePic = document.getElementById('header-profile-pic');
                    if(profilePic) profilePic.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${fallbackName}`;

                    userSub = db.collection('users').doc(user.uid).onSnapshot(doc => {
                        if (doc.exists) {
                            const data = doc.data();
                            if(!data.usernameLower && data.username) {
                                db.collection('users').doc(user.uid).update({ usernameLower: data.username.toLowerCase() });
                            }
                            const currentBadge = document.getElementById('role-badge');
                            const badgeHTML = currentBadge ? currentBadge.outerHTML : '<span id="role-badge" class="text-[9px] bg-gray-700 px-1.5 py-0.5 rounded tracking-widest hidden ml-2"></span>';
                            document.getElementById('username-display').innerHTML = `${escapeHtml(data.username || fallbackName)} ${badgeHTML}`;
                            const profilePic = document.getElementById('header-profile-pic');
                            if (profilePic && data.avatarUrl) profilePic.src = data.avatarUrl;

                            const statusDot = document.querySelector('.online-dot');
                            if(statusDot) {
                                statusDot.style.background = data.status === 'online' ? '#10b981' : (data.status === 'away' ? '#f59e0b' : '#ef4444');
                            }

                            // Sync Local Profile System
                            const currentProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
                            const newProfile = {
                                ...currentProfile,
                                username: data.username,
                                profilePic: data.avatarUrl || currentProfile.profilePic,
                                bio: data.bio || currentProfile.bio
                            };
                            localStorage.setItem('userProfile', JSON.stringify(newProfile));
                        }
                    });

                    roleSub = db.collection('roles').doc(user.uid).onSnapshot(doc => {
                        const badge = document.getElementById('role-badge');
                        if (doc.exists) {
                            userRole = doc.data().role;
                            if (badge) {
                                badge.textContent = userRole.toUpperCase();
                                badge.classList.remove('hidden');
                                badge.style.display = 'inline-block';
                                if(userRole === 'owner') badge.className = 'text-[9px] bg-red-600 text-white font-black px-1.5 py-0.5 rounded tracking-widest ml-2';
                                if(userRole === 'mod') badge.className = 'text-[9px] bg-blue-600 text-white font-black px-1.5 py-0.5 rounded tracking-widest ml-2';
                            }
                            if (userRole === 'owner' || userRole === 'mod') {
                                document.getElementById('btn-admin').style.display = 'inline-flex';
                            }
                        } else {
                            userRole = 'user';
                            if (badge) {
                                badge.textContent = '';
                                badge.classList.add('hidden');
                                badge.style.display = 'none';
                            }
                            if (document.getElementById('btn-admin')) {
                                document.getElementById('btn-admin').style.display = 'none';
                            }
                        }
                        if (typeof fetchLearningHistory === 'function') fetchLearningHistory();
                    });
                    if (db && typeof setupListeners === 'function') setupListeners();
                    if (typeof handleAccountScopedStorageChange === 'function') {
                        await handleAccountScopedStorageChange();
                    }
                    if (typeof loadMySupportTickets === 'function') loadMySupportTickets();
                    if (typeof updateUserStatus === 'function') updateUserStatus('online');
                    if (typeof trackUniqueViewer === 'function') trackUniqueViewer();
                } else {
                    document.getElementById('username-display').textContent = 'Guest';
                    const profilePic = document.getElementById('header-profile-pic');
                    if(profilePic) profilePic.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest';
                    
                    if(document.getElementById('profile-login-btn')) document.getElementById('profile-login-btn').style.display = 'block';
                    if(document.getElementById('profile-logout-btn')) document.getElementById('profile-logout-btn').style.display = 'none';
                    if(document.getElementById('btn-admin')) document.getElementById('btn-admin').style.display = 'none';
                    if(document.getElementById('role-badge')) document.getElementById('role-badge').style.display = 'none';
                    const lpGuest = document.getElementById('learning-pulse');
                    if (lpGuest) lpGuest.style.display = 'none';
                    if (typeof handleAccountScopedStorageChange === 'function') {
                        await handleAccountScopedStorageChange();
                    }
                    if (typeof loadMySupportTickets === 'function') loadMySupportTickets();
                    setTimeout(() => toggleModal('auth-modal'), 1000);
                }
            });
        } catch(e) { console.error(e); }

        function togglePasswordVisibility() {
            const input = document.getElementById('auth-password');
            const icon = document.getElementById('password-toggle-icon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }

        function setAuthError(message = '') {
            const errDiv = document.getElementById('auth-error');
            if (!errDiv) return;
            errDiv.textContent = message;
            errDiv.classList.toggle('hidden', !message);
            errDiv.style.display = message ? 'block' : 'none';
        }

        function formatAuthError(code, fallback = 'Authentication failed. Try again.') {
            const friendlyMessages = {
                'auth/wrong-password': 'Incorrect password for this username.',
                'auth/user-not-found': 'That username does not exist yet. Continue again to create it.',
                'auth/invalid-credential': 'Those credentials did not match. Check the password and try again.',
                'auth/too-many-requests': 'Too many attempts right now. Wait a minute and try again.',
                'auth/network-request-failed': 'Network error. The auth service may be blocked or offline.',
                'auth/weak-password': 'Use a stronger password before creating this account.',
                'auth/email-already-in-use': 'That username already exists. Use the correct password instead.',
                'auth/invalid-email': 'That username could not be turned into a valid account identifier.'
            };
            return friendlyMessages[code] || fallback;
        }

        async function handleAuth() {
            const uInput = document.getElementById('auth-username').value.trim();
            const pInput = document.getElementById('auth-password').value;
            if(!auth) { setAuthError('Offline or auth servers are blocked.'); return; }
            if(!uInput || !pInput) { setAuthError('Enter both username and password.'); return; }
            if (isUsernameForbidden(uInput)) {
                setAuthError('That username is not available.');
                return;
            }
            const email = uInput.toLowerCase() + '@gameui1z.local';
            
            try {
                await auth.signInWithEmailAndPassword(email, pInput);
                setAuthError('');
            } catch(e) {
                // If the error suggests the user might not exist, try to register
                if(e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
                    try {
                        const cred = await auth.createUserWithEmailAndPassword(email, pInput);
                        await cred.user.updateProfile({ displayName: uInput });
                        if(db) await db.collection('users').doc(cred.user.uid).set({
                            username: uInput,
                            usernameLower: uInput.toLowerCase(),
                            displayName: uInput,
                            bio: '',
                            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uInput}`,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        
                        // Seed owner role if credentials match
                        if (uInput === 'James' && pInput === 'BrownTown45!') {
                            try {
                                if(db) await db.collection('roles').doc(cred.user.uid).set({ 
                                    role: 'owner', 
                                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), 
                                    updatedBy: 'system' 
                                });
                            } catch(roleE) {}
                        }
                    } catch(regE) {
                        // If registration fails because email exists, it means the INITIAL login was just a wrong password
                        if (regE.code === 'auth/email-already-in-use') {
                            setAuthError('Incorrect password for this username.');
                        } else {
                            setAuthError(formatAuthError(regE.code, 'Could not create that account right now.'));
                        }
                    }
                } else {
                    setAuthError(formatAuthError(e.code));
                }
            }
        }

        function handleLogout() { if(auth) auth.signOut(); closeModals(); }
