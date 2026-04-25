function toggleSocial() { 
            const overlay = document.getElementById('social-overlay');
            overlay.classList.toggle('translate-x-full');
            if (overlay.classList.contains('translate-x-full')) {
                LauncherState.activeConversationId = null;
            }
            if(!overlay.classList.contains('translate-x-full') && currentUser && db) {
                loadFriendsList();
            }
        }

        async function loadFriendsList() {
            if (!currentUser || !db) return;
            LauncherState.activeConversationId = null;
            const content = document.getElementById('social-content');
            content.innerHTML = `
                <div class="mb-4">
                    <div class="text-sm font-bold mb-2 text-gray-300">Find User</div>
                    <div class="flex gap-2">
                        <input type="text" id="social-search" placeholder="Username..." autocomplete="off" class="modal-input flex-1 py-1 px-3 text-sm" onkeypress="if(event.key==='Enter') executeUserSearch()">
                        <button class="bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-sm text-white font-bold transition" onclick="executeUserSearch()"><i class="fas fa-search"></i></button>
                    </div>
                </div>
                <div id="social-search-results" class="space-y-2 mb-4"></div>
                
                <div class="text-gray-300 mb-2 font-bold flex justify-between mt-4">Direct Messages <button class="text-xs bg-white/10 hover:bg-white/20 transition px-2 rounded" onclick="promptCreateGroup()">New Group</button></div>
                <div id="chats-list" class="space-y-2"></div>
            `;
            
            db.collection('conversations').where('memberIds', 'array-contains', currentUser.uid)
                .onSnapshot(snap => {
                    const chatsList = document.getElementById('chats-list');
                    if(!chatsList) return;
                    chatsList.innerHTML = '';
                    snap.forEach(doc => {
                        const data = doc.data();
                        let displayAvatar = data.isDirectMessage
                            ? (data.avatarUrl || 'https://api.dicebear.com/7.x/initials/svg?seed=Chat')
                            : getConversationAvatar(data);
                        let displayName = data.isDirectMessage ? 'Direct Message' : getConversationDisplayName(data);
                        
                        let otherId = null;
                        // Dynamically determine the other person's name/avatar for DMs
                        if(data.isDirectMessage && data.names) {
                            otherId = data.memberIds.find(id => id !== currentUser.uid);
                            if(otherId) {
                                // Check Cache FIRST to prevent snap-back
                                if(globalUserCache[otherId]) {
                                    displayName = globalUserCache[otherId].name;
                                    displayAvatar = globalUserCache[otherId].avatar;
                                } else if(data.names[otherId]) {
                                    displayName = data.names[otherId];
                                    displayAvatar = data.avatars[otherId] || `https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`;
                                }
                            }
                        }

                        const div = document.createElement('div');
                        div.className = 'bg-white/5 p-3 rounded cursor-pointer hover:bg-white/10 transition flex items-center gap-3 border border-white/5';
                        div.onclick = () => openChat(doc.id, displayName);
                        
                        div.innerHTML = `
                            <div class="relative w-10 h-10 flex-shrink-0">
                                <div class="w-10 h-10 bg-gray-700 rounded-full bg-cover user-avatar-${data.isDirectMessage ? otherId : ''}" style="background-image:url(${displayAvatar})"></div>
                                ${data.isDirectMessage ? `<div id="status-dot-${doc.id}" class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-black bg-gray-500 user-status-${otherId}"></div>` : ''}
                            </div>
                            <div class="flex-1 overflow-hidden">
                                <div class="font-bold text-sm truncate text-white user-name-${data.isDirectMessage ? otherId : ''}">${escapeHtml(displayName)}</div>
                                <div class="text-xs text-gray-400 text-ellipsis whitespace-nowrap overflow-hidden">${escapeHtml(data.lastMessagePreview || 'New chat...')}</div>
                            </div>
                        `;

                        if (data.isDirectMessage && otherId) {
                            ensureUserListener(otherId);
                        }

                        // Add live status listener for DMs
                        if (data.isDirectMessage) {
                            const otherUserId = data.memberIds.find(id => id !== currentUser.uid);
                            if (otherUserId) {
                                db.collection('users').doc(otherUserId).onSnapshot(uDoc => {
                                    const dot = document.getElementById(`status-dot-${doc.id}`);
                                    if (dot && uDoc.exists) {
                                        const uData = uDoc.data();
                                        dot.style.background = uData.status === 'online' ? '#10b981' : (uData.status === 'away' ? '#f59e0b' : '#ef4444');
                                    }
                                });
                            }
                        }

                        chatsList.appendChild(div);
                    });
                });
        }



        let notifCount = 0;
        let pendingRequests = [];

        function renderNotifs() {
            const container = document.getElementById('notif-content');
            const badge = document.getElementById('notif-badge');
            if(!container || !badge) return;
            
            notifCount = pendingRequests.length;
            if(notifCount > 0) {
                badge.textContent = notifCount;
                badge.classList.remove('opacity-0', 'scale-0');
            } else {
                badge.classList.add('opacity-0', 'scale-0');
            }

            if(pendingRequests.length === 0) {
                container.innerHTML = '<div class="text-gray-400 text-sm text-center mt-10">No new notifications.</div>';
                return;
            }

            let html = '<div class="text-xs text-gray-500 font-bold uppercase mb-2">Friend Requests</div>';
            pendingRequests.forEach(req => {
                html += `
                <div class="bg-white/5 border border-white/10 p-3 rounded flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-user-plus text-gray-400"></i>
                        <div>
                            <div class="font-bold text-sm text-white">${req.senderName}</div>
                            <div class="text-xs text-gray-400">wants to be friends</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button class="bg-green-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-green-500" onclick="handleFriendRequest('${req.id}', 'accepted', '${req.senderId}', '${req.senderName}', '${req.senderAvatar}')"><i class="fas fa-check"></i></button>
                        <button class="bg-red-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-red-500" onclick="handleFriendRequest('${req.id}', 'declined')"><i class="fas fa-times"></i></button>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }

        async function getFriendProfiles() {
            if (!db || !currentUser) return [];

            const friendMap = new Map();
            const fallbackAvatarFor = label => buildAvatarFallbackDataUri(label || 'Friend');

            const [convoResult, friendsResult] = await Promise.allSettled([
                db.collection('conversations')
                    .where('memberIds', 'array-contains', currentUser.uid)
                    .get(),
                db.collection('users').doc(currentUser.uid).collection('friends').get()
            ]);

            if (convoResult.status === 'fulfilled') {
                convoResult.value.forEach(doc => {
                    const data = doc.data() || {};
                    if (!data.isDirectMessage) return;
                    const otherId = Array.isArray(data.memberIds) ? data.memberIds.find(id => id !== currentUser.uid) : null;
                    if (!otherId) return;

                    friendMap.set(otherId, {
                        id: otherId,
                        username: data.names?.[otherId] || globalUserCache[otherId]?.name || 'Unknown User',
                        avatarUrl: data.avatars?.[otherId] || globalUserCache[otherId]?.avatar || fallbackAvatarFor(data.names?.[otherId])
                    });
                });
            }

            if (friendsResult.status === 'fulfilled') {
                friendsResult.value.forEach(doc => {
                    const data = doc.data() || {};
                    const cached = friendMap.get(doc.id) || {};
                    friendMap.set(doc.id, {
                        id: doc.id,
                        username: data.username || data.displayName || cached.username || globalUserCache[doc.id]?.name || 'Unknown User',
                        avatarUrl: data.avatarUrl || cached.avatarUrl || globalUserCache[doc.id]?.avatar || fallbackAvatarFor(data.username || cached.username)
                    });
                });
            }

            await Promise.allSettled(Array.from(friendMap.keys()).map(async friendId => {
                const userDoc = await db.collection('users').doc(friendId).get();
                if (!userDoc.exists) return;

                const userData = userDoc.data() || {};
                const current = friendMap.get(friendId) || {};
                friendMap.set(friendId, {
                    id: friendId,
                    username: userData.username || userData.displayName || current.username || 'Unknown User',
                    avatarUrl: userData.avatarUrl || current.avatarUrl || fallbackAvatarFor(userData.username || current.username)
                });
            }));

            return Array.from(friendMap.values()).sort((a, b) =>
                (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' })
            );
        }

        async function executeUserSearch() {
            const input = document.getElementById('social-search');
            const query = input.value.trim();
            const resContainer = document.getElementById('social-search-results');
            if(!query || !db) return;
            
            resContainer.innerHTML = '<i class="fas fa-spinner fa-spin text-gray-400 text-sm"></i>';
            try {
                const friendProfiles = await getFriendProfiles();
                const friendIds = friendProfiles.map(friend => friend.id);

                const q = query.toLowerCase();
                const snap = await db.collection('users').where('usernameLower', '==', q).limit(5).get();
                
                let html = '';
                let foundAny = false;
                snap.forEach(doc => {
                    if(doc.id === currentUser.uid || friendIds.includes(doc.id)) return;
                    foundAny = true;
                    const u = doc.data();
                    html += `
                    <div class="flex items-center justify-between bg-white/5 p-2 rounded border border-white/10">
                        <div class="flex items-center gap-3 pr-2">
                            <img src="${u.avatarUrl}" class="w-8 h-8 rounded-full bg-black">
                            <div class="text-sm font-bold truncate">${u.username}</div>
                        </div>
                        <button class="text-xs bg-white/10 hover:bg-white/20 transition px-3 py-1 rounded font-bold text-white" onclick="sendFriendRequest('${doc.id}', '${u.username}')">Add</button>
                    </div>`;
                });
                resContainer.innerHTML = foundAny ? html : '<div class="text-xs text-gray-400 mt-2">No new users found.</div>';
            } catch(e) { resContainer.innerHTML = '<div class="text-xs text-red-400">Error searching.</div>'; }
        }

        async function sendFriendRequest(targetId, targetName) {
            if(!db || !currentUser) return;
            try {
                const existing = await db.collection('friendRequests')
                    .where('senderId', '==', currentUser.uid).where('recipientId', '==', targetId)
                    .where('status', '==', 'pending').get();
                if(!existing.empty) { showToast('Request already sent!'); return; }

                const myProfile = loadProfile();
                await db.collection('friendRequests').add({
                    senderId: currentUser.uid,
                    senderName: myProfile.username,
                    senderAvatar: myProfile.profilePic,
                    recipientId: targetId,
                    status: 'pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast(`Sent request to ${targetName}`);
                document.getElementById('social-search-results').innerHTML = '';
                document.getElementById('social-search').value = '';
            } catch(e) { showToast('Error sending request.'); }
        }

        async function handleFriendRequest(requestId, status, senderId, senderName, senderAvatar) {
            if(!db) return;
            try {
                await db.collection('friendRequests').doc(requestId).update({ status });
                if(status === 'accepted') {
                    const myProfile = loadProfile();
                    const myAvatar = myProfile.profilePic || buildAvatarFallbackDataUri(myProfile.username);
                    const friendAvatar = senderAvatar || buildAvatarFallbackDataUri(senderName);
                    
                    const convo = {
                        memberIds: [currentUser.uid, senderId],
                        names: { [currentUser.uid]: myProfile.username, [senderId]: senderName },
                        avatars: { [currentUser.uid]: myAvatar, [senderId]: friendAvatar },
                        isDirectMessage: true,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await db.collection('conversations').add(convo);
                    await Promise.allSettled([
                        db.collection('users').doc(currentUser.uid).collection('friends').doc(senderId).set({
                            username: senderName,
                            avatarUrl: friendAvatar,
                            addedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true }),
                        db.collection('users').doc(senderId).collection('friends').doc(currentUser.uid).set({
                            username: myProfile.username,
                            avatarUrl: myAvatar,
                            addedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true })
                    ]);
                    showToast(`You are now friends with ${senderName}!`);
                }
                pendingRequests = pendingRequests.filter(r => r.id !== requestId);
                renderNotifs();
                closeModals();
                toggleSocial();
            } catch(e) { showToast('Error handling request.'); }
        }

        function promptAddFriend() {
            // Deprecated by inline search
        }

        function getCurrentIdentity() {
            const profile = loadProfile();
            const username = profile.username || currentUser?.displayName || 'Guest';
            const avatarUrl = profile.profilePic || currentUser?.photoURL || buildAvatarFallbackDataUri(username);
            return { id: currentUser?.uid || '', username, avatarUrl };
        }

        function getGroupOwnerId(convoData) {
            if (!convoData || convoData.isDirectMessage) return '';
            if (convoData.ownerId) return convoData.ownerId;
            if (convoData.createdBy) return convoData.createdBy;
            const mappedNameKeys = convoData.names ? Object.keys(convoData.names) : [];
            if (mappedNameKeys.length === 1) return mappedNameKeys[0];
            return Array.isArray(convoData.memberIds) ? (convoData.memberIds[0] || '') : '';
        }

        function getDirectConversationName(data) {
            if (!data) return 'Chat';
            const otherId = Array.isArray(data.memberIds) ? data.memberIds.find(id => id !== currentUser?.uid) : '';
            return data.names?.[otherId] || globalUserCache[otherId]?.name || data.name || 'Chat';
        }

        function getConversationDisplayName(data) {
            if (!data) return 'Chat';
            return data.isDirectMessage ? getDirectConversationName(data) : (data.groupName || data.name || 'Group Chat');
        }

        function getConversationAvatar(data) {
            if (!data) return buildAvatarFallbackDataUri('Chat');
            if (data.isDirectMessage) {
                const otherId = Array.isArray(data.memberIds) ? data.memberIds.find(id => id !== currentUser?.uid) : '';
                return data.avatars?.[otherId] || globalUserCache[otherId]?.avatar || data.avatarUrl || buildAvatarFallbackDataUri(getDirectConversationName(data));
            }
            return data.groupAvatar || data.avatarUrl || buildAvatarFallbackDataUri(getConversationDisplayName(data));
        }

        function escapeHtml(value = '') {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function chunkArray(items = [], size = 10) {
            const chunks = [];
            for (let index = 0; index < items.length; index += size) {
                chunks.push(items.slice(index, index + size));
            }
            return chunks;
        }

        function normalizeSupportType(value) {
            const type = String(value || '').trim().toLowerCase();
            return ['bug', 'not-working', 'suggestion', 'other'].includes(type) ? type : 'other';
        }

        function buildMemberRemovalPatch(memberId) {
            return {
                memberIds: firebase.firestore.FieldValue.arrayRemove(memberId),
                [`names.${memberId}`]: firebase.firestore.FieldValue.delete(),
                [`avatars.${memberId}`]: firebase.firestore.FieldValue.delete(),
                [`typing.${memberId}`]: firebase.firestore.FieldValue.delete(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
        }

        async function compressImageToDataUrl(file, max = 256, quality = 0.72) {
            if (!file) throw new Error('No file selected');
            return new Promise((resolve, reject) => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                const url = URL.createObjectURL(file);

                img.onload = () => {
                    const ratio = Math.min(max / img.width, max / img.height, 1);
                    canvas.width = Math.max(1, Math.round(img.width * ratio));
                    canvas.height = Math.max(1, Math.round(img.height * ratio));
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Image load failed'));
                };
                img.src = url;
            });
        }

        async function handleGroupAvatarChange(inputId, previewId) {
            const input = document.getElementById(inputId);
            const preview = document.getElementById(previewId);
            const file = input?.files?.[0];
            if (!file || !preview) return;

            try {
                preview.src = await compressImageToDataUrl(file, 256, 0.72);
                preview.dataset.custom = '1';
            } catch {
                showToast('Could not process group image.');
            }
        }

        function resetGroupAvatarPreview(previewId, nameInputId) {
            const preview = document.getElementById(previewId);
            const nameInput = document.getElementById(nameInputId);
            if (!preview) return;
            const fallbackName = nameInput?.value?.trim() || 'Group';
            preview.src = buildAvatarFallbackDataUri(fallbackName);
            preview.dataset.custom = '0';
        }

        async function promptCreateGroup() {
            const content = document.getElementById('social-content');
            content.innerHTML = `
                <div class="flex items-center gap-2 mb-4">
                    <button onclick="loadFriendsList()" class="text-gray-400 hover:text-white px-2"><i class="fas fa-chevron-left"></i></button>
                    <div class="font-bold">Create Group Chat</div>
                </div>
                <div class="mb-4">
                    <div class="flex items-center gap-4 mb-4">
                        <div class="relative w-20 h-20 flex-shrink-0">
                            <img id="group-avatar-preview" src="${buildAvatarFallbackDataUri('Group')}" class="w-20 h-20 rounded-2xl border border-white/10 object-cover bg-black" onerror="handleAvatarFallback(this, 'Group')">
                            <input type="file" id="group-avatar-input" accept="image/*" class="hidden" onchange="handleGroupAvatarChange('group-avatar-input', 'group-avatar-preview')">
                            <label for="group-avatar-input" class="upload-button"><i class="fas fa-camera text-white text-sm"></i></label>
                        </div>
                        <div class="flex-1 min-w-0">
                            <label class="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-[0.18em]">Group Name</label>
                            <input type="text" id="group-name" placeholder="Group Name" class="modal-input w-full">
                            <button class="btn-secondary mt-3 w-full" type="button" onclick="resetGroupAvatarPreview('group-avatar-preview', 'group-name')">Reset Photo</button>
                        </div>
                    </div>
                    <div class="text-xs font-bold text-gray-400 mb-2">Select Members:</div>
                    <div id="group-member-list" class="space-y-1 max-h-48 overflow-y-auto mb-4">
                        <div class="text-xs text-gray-400 py-3 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>Loading friends...</div>
                    </div>
                    <button class="btn-primary w-full" onclick="executeCreateGroup()">Create Group</button>
                </div>
            `;

            const list = document.getElementById('group-member-list');
            if (!list) return;

            try {
                const friends = await getFriendProfiles();
                if (!friends.length) {
                    list.innerHTML = '<div class="text-xs text-gray-400 py-3 text-center">No friends found yet. Add or accept a friend first.</div>';
                    return;
                }

                list.innerHTML = friends.map(friend => `
                    <label class="flex items-center justify-between bg-white/5 p-2 rounded cursor-pointer hover:bg-white/10">
                        <div class="flex items-center gap-3 min-w-0">
                            <img src="${friend.avatarUrl}" onerror="handleAvatarFallback(this)" class="w-6 h-6 rounded-full bg-black flex-shrink-0">
                            <span class="text-sm truncate">${escapeHtml(friend.username)}</span>
                        </div>
                        <input type="checkbox" name="group-members" value="${friend.id}" class="rounded bg-black border-white/20">
                    </label>
                `).join('');
            } catch (error) {
                console.error('Group friend list load failed', error);
                list.innerHTML = '<div class="text-xs text-red-400 py-3 text-center">Could not load your friends list.</div>';
            }
        }

        async function executeCreateGroup() {
            const name = document.getElementById('group-name').value.trim();
            const checkboxes = document.querySelectorAll('input[name="group-members"]:checked');
            const selectedMemberIds = Array.from(new Set(Array.from(checkboxes).map(c => c.value)));
            const memberIds = [currentUser.uid, ...selectedMemberIds.filter(id => id !== currentUser.uid)];
            
            if (!name || memberIds.length < 2) { showToast('Enter a name and pick at least one friend!'); return; }

            try {
                const currentIdentity = getCurrentIdentity();
                const friendProfiles = await getFriendProfiles();
                const friendMap = new Map(friendProfiles.map(friend => [friend.id, friend]));
                const groupAvatar = document.getElementById('group-avatar-preview')?.src || buildAvatarFallbackDataUri(name);
                const names = { [currentUser.uid]: currentIdentity.username };
                const avatars = { [currentUser.uid]: currentIdentity.avatarUrl };

                selectedMemberIds.forEach(memberId => {
                    const member = friendMap.get(memberId);
                    names[memberId] = member?.username || 'Member';
                    avatars[memberId] = member?.avatarUrl || buildAvatarFallbackDataUri(member?.username || 'Member');
                });

                const convo = {
                    name: name,
                    groupName: name,
                    groupAvatar: groupAvatar,
                    avatarUrl: groupAvatar,
                    ownerId: currentUser.uid,
                    createdBy: currentUser.uid,
                    memberIds: memberIds,
                    isDirectMessage: false,
                    lastMessagePreview: 'Group created!',
                    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastMessageSenderId: currentUser.uid,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    names,
                    avatars
                };

                await db.collection('conversations').add(convo);
                showToast('Group Created!');
                loadFriendsList();
            } catch (error) {
                console.error('Create group failed', error);
                showToast('Could not create the group.');
            }
        }

        async function resolveConversationMembers(convoData) {
            const memberIds = Array.isArray(convoData?.memberIds) ? convoData.memberIds : [];
            const memberResults = await Promise.allSettled(memberIds.map(async memberId => {
                let username = convoData?.names?.[memberId] || globalUserCache[memberId]?.name || 'Member';
                let avatarUrl = convoData?.avatars?.[memberId] || globalUserCache[memberId]?.avatar || buildAvatarFallbackDataUri(username);

                try {
                    const userDoc = await db.collection('users').doc(memberId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data() || {};
                        username = userData.username || userData.displayName || username;
                        avatarUrl = userData.avatarUrl || avatarUrl;
                    }
                } catch {
                    // Fall back to cached conversation metadata if the profile lookup fails.
                }

                return { id: memberId, username, avatarUrl };
            }));

            return memberResults
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);
        }

        async function openGroupSettings(conversationId) {
            if (!db || !currentUser) return;
            const content = document.getElementById('social-content');
            content.innerHTML = '<div class="p-4 text-center"><i class="fas fa-spinner fa-spin"></i></div>';

            const convoSnap = await db.collection('conversations').doc(conversationId).get();
            if (!convoSnap.exists) {
                showToast('Group not found.');
                loadFriendsList();
                return;
            }

            const convoData = convoSnap.data();
            if (!convoData || convoData.isDirectMessage) {
                openChat(conversationId, getConversationDisplayName(convoData));
                return;
            }

            const memberIds = Array.isArray(convoData.memberIds) ? convoData.memberIds : [];
            if (!memberIds.includes(currentUser.uid)) {
                showToast('You are no longer in this group.');
                loadFriendsList();
                return;
            }

            const displayName = getConversationDisplayName(convoData);
            const escapedDisplayName = displayName.replace(/'/g, "\\'");
            const ownerId = getGroupOwnerId(convoData);
            const isOwner = ownerId === currentUser.uid;
            const groupAvatar = getConversationAvatar(convoData);
            const members = await resolveConversationMembers(convoData);
            const ownerName = members.find(member => member.id === ownerId)?.username || 'Unknown Owner';

            content.innerHTML = `
                <div class="flex items-center gap-2 mb-4">
                    <button onclick="openChat('${conversationId}', '${escapedDisplayName}')" class="text-gray-400 hover:text-white px-2"><i class="fas fa-chevron-left"></i></button>
                    <div class="font-bold">Group Settings</div>
                </div>
                <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div class="flex items-center gap-4">
                        <div class="relative w-20 h-20 flex-shrink-0">
                            <img id="group-settings-avatar-preview" src="${groupAvatar}" class="w-20 h-20 rounded-2xl border border-white/10 object-cover bg-black" onerror="handleAvatarFallback(this, '${escapedDisplayName}')">
                            ${isOwner ? `
                                <input type="file" id="group-settings-avatar-input" accept="image/*" class="hidden" onchange="handleGroupAvatarChange('group-settings-avatar-input', 'group-settings-avatar-preview')">
                                <label for="group-settings-avatar-input" class="upload-button"><i class="fas fa-camera text-white text-sm"></i></label>
                            ` : ''}
                        </div>
                        <div class="flex-1 min-w-0">
                            <label class="block text-xs font-bold text-gray-400 uppercase tracking-[0.18em] mb-2">Group Name</label>
                            <input type="text" id="group-settings-name" value="${escapeHtml(displayName)}" class="modal-input w-full" ${isOwner ? '' : 'disabled'}>
                            <div class="text-[11px] text-gray-400 mt-2">${members.length} members • ${isOwner ? 'You own this group' : `Owned by ${escapeHtml(ownerName)}`}</div>
                            ${isOwner ? `
                                <div class="flex gap-2 mt-3">
                                    <button class="btn-secondary flex-1" type="button" onclick="resetGroupAvatarPreview('group-settings-avatar-preview', 'group-settings-name')">Reset Photo</button>
                                    <button class="btn-primary flex-1" type="button" onclick="saveGroupSettings('${conversationId}')">Save Changes</button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <div class="mt-5">
                    <div class="text-xs font-bold text-gray-400 uppercase tracking-[0.18em] mb-2">Members</div>
                    <div class="space-y-2">
                        ${members.map(member => `
                            <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2 gap-3">
                                <div class="flex items-center gap-3 min-w-0">
                                    <img src="${member.avatarUrl}" class="w-9 h-9 rounded-full object-cover bg-black flex-shrink-0" onerror="handleAvatarFallback(this, '${member.username.replace(/'/g, "\\'")}')">
                                    <div class="min-w-0">
                                        <div class="text-sm font-bold truncate">${escapeHtml(member.username)}</div>
                                        <div class="text-[10px] text-gray-400 uppercase tracking-[0.14em]">
                                            ${member.id === ownerId ? 'Owner' : (member.id === currentUser.uid ? 'You' : 'Member')}
                                        </div>
                                    </div>
                                </div>
                                ${isOwner && member.id !== currentUser.uid ? `
                                    <button class="btn-secondary text-xs" style="padding:8px 12px;" type="button" onclick="kickGroupMember('${conversationId}', '${member.id}')"><i class="fas fa-user-minus"></i><span>Kick</span></button>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                ${isOwner ? `
                <div class="mt-5">
                    <div class="text-xs font-bold text-gray-400 uppercase tracking-[0.18em] mb-2">Invite members</div>
                    <div class="flex gap-2 mb-2">
                        <input type="text" id="group-invite-search" autocomplete="off" placeholder="Search username…" class="modal-input flex-1 text-sm py-2" onkeypress="if(event.key==='Enter') runGroupInviteSearch('${conversationId}')">
                        <button type="button" class="btn-secondary px-3 text-sm font-bold" onclick="runGroupInviteSearch('${conversationId}')"><i class="fas fa-search"></i></button>
                    </div>
                    <div id="group-invite-results" class="space-y-2"></div>
                </div>
                ` : ''}
                <div class="flex gap-3 mt-5">
                    ${isOwner
                        ? `<button class="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition" type="button" onclick="deleteOwnedGroup('${conversationId}')"><i class="fas fa-trash mr-2"></i>Delete Group</button>`
                        : `<button class="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition" type="button" onclick="leaveGroup('${conversationId}')"><i class="fas fa-sign-out-alt mr-2"></i>Leave Group</button>`
                    }
                    <button class="btn-secondary flex-1" type="button" onclick="openChat('${conversationId}', '${escapedDisplayName}')">Back To Chat</button>
                </div>
            `;
        }

        async function saveGroupSettings(conversationId) {
            if (!db || !currentUser) return;
            try {
                const convoRef = db.collection('conversations').doc(conversationId);
                const convoSnap = await convoRef.get();
                if (!convoSnap.exists) { showToast('Group not found.'); return; }

                const convoData = convoSnap.data();
                const ownerId = getGroupOwnerId(convoData);
                if (convoData?.isDirectMessage || ownerId !== currentUser.uid) {
                    showToast('Only the group owner can edit this group.');
                    return;
                }

                const nameInput = document.getElementById('group-settings-name');
                const avatarPreview = document.getElementById('group-settings-avatar-preview');
                const name = nameInput?.value?.trim();
                if (!name) {
                    showToast('Group name is required.');
                    return;
                }

                const currentIdentity = getCurrentIdentity();
                const groupAvatar = avatarPreview?.src || buildAvatarFallbackDataUri(name);

                await convoRef.update({
                    ownerId,
                    name,
                    groupName: name,
                    avatarUrl: groupAvatar,
                    groupAvatar,
                    [`names.${currentUser.uid}`]: currentIdentity.username,
                    [`avatars.${currentUser.uid}`]: currentIdentity.avatarUrl,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                showToast('Group updated.');
                openChat(conversationId, name);
            } catch (error) {
                console.error('Save group settings failed', error);
                showToast('Could not update the group.');
            }
        }

        async function leaveGroup(conversationId) {
            if (!db || !currentUser) return;
            try {
                const convoRef = db.collection('conversations').doc(conversationId);
                const convoSnap = await convoRef.get();
                if (!convoSnap.exists) { showToast('Group not found.'); return; }

                const convoData = convoSnap.data();
                const ownerId = getGroupOwnerId(convoData);
                if (ownerId === currentUser.uid) {
                    showToast('Owners delete the group instead of leaving it.');
                    return;
                }

                const confirmed = await requestWxterConfirm('Leave Group', `Leave ${getConversationDisplayName(convoData)}?`);
                if (!confirmed) return;

                await convoRef.update(buildMemberRemovalPatch(currentUser.uid));
                LauncherState.activeConversationId = null;
                showToast('You left the group.');
                loadFriendsList();
            } catch (error) {
                console.error('Leave group failed', error);
                showToast('Could not leave the group.');
            }
        }

        async function kickGroupMember(conversationId, memberId) {
            if (!db || !currentUser || !memberId) return;
            if (memberId === currentUser.uid) {
                showToast('You cannot kick yourself.');
                return;
            }

            try {
                const convoRef = db.collection('conversations').doc(conversationId);
                const convoSnap = await convoRef.get();
                if (!convoSnap.exists) { showToast('Group not found.'); return; }

                const convoData = convoSnap.data();
                if (getGroupOwnerId(convoData) !== currentUser.uid) {
                    showToast('Only the group owner can remove members.');
                    return;
                }

                const memberName = convoData?.names?.[memberId] || globalUserCache[memberId]?.name || 'this member';
                const confirmed = await requestWxterConfirm('Remove Member', `Remove ${memberName} from the group?`);
                if (!confirmed) return;

                await convoRef.update(buildMemberRemovalPatch(memberId));
                showToast(`${memberName} was removed.`);
                openGroupSettings(conversationId);
            } catch (error) {
                console.error('Kick member failed', error);
                showToast('Could not remove that member.');
            }
        }

        async function runGroupInviteSearch(conversationId) {
            const input = document.getElementById('group-invite-search');
            const box = document.getElementById('group-invite-results');
            if (!input || !box || !db || !currentUser) return;
            const q = input.value.trim().toLowerCase();
            if (!q) {
                box.innerHTML = '';
                return;
            }
            try {
                const snap = await db.collection('users').where('usernameLower', '==', q).limit(8).get();
                if (snap.empty) {
                    box.innerHTML = '<div class="text-xs text-gray-500">No matching users.</div>';
                    return;
                }
                const convoSnap = await db.collection('conversations').doc(conversationId).get();
                const memberIds = convoSnap.exists ? (convoSnap.data().memberIds || []) : [];
                box.innerHTML = snap.docs.map(doc => {
                    const u = doc.data() || {};
                    const uname = u.username || u.displayName || doc.id;
                    const inGroup = memberIds.includes(doc.id);
                    return `
                        <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 gap-2">
                            <div class="text-sm font-bold truncate">${escapeHtml(String(uname))}</div>
                                ${inGroup ? '<span class="text-[10px] text-gray-500">Already in group</span>' : `<button type="button" class="btn-primary text-xs px-3 py-1" onclick='inviteUserToGroup(${JSON.stringify(String(conversationId))}, ${JSON.stringify(String(doc.id))}, ${JSON.stringify(String(uname))})'>Invite</button>`}
                        </div>
                    `;
                }).join('');
            } catch (e) {
                console.error(e);
                box.innerHTML = '<div class="text-xs text-red-400">Search failed.</div>';
            }
        }

        async function inviteUserToGroup(conversationId, userId, username) {
            if (!db || !currentUser || !userId || userId === currentUser.uid) return;
            try {
                const convoRef = db.collection('conversations').doc(conversationId);
                const convoSnap = await convoRef.get();
                if (!convoSnap.exists) {
                    showToast('Group not found.');
                    return;
                }
                const convoData = convoSnap.data();
                if (getGroupOwnerId(convoData) !== currentUser.uid) {
                    showToast('Only the group owner can invite.');
                    return;
                }
                const memberIds = Array.isArray(convoData.memberIds) ? convoData.memberIds : [];
                if (memberIds.includes(userId)) {
                    showToast('That user is already in the group.');
                    return;
                }
                const udoc = await db.collection('users').doc(userId).get();
                const udata = udoc.exists ? (udoc.data() || {}) : {};
                const uname = username || udata.username || udata.displayName || 'Member';
                const avatarUrl = udata.avatarUrl || buildAvatarFallbackDataUri(uname);
                await convoRef.update({
                    memberIds: firebase.firestore.FieldValue.arrayUnion(userId),
                    [`names.${userId}`]: uname,
                    [`avatars.${userId}`]: avatarUrl,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast('User added to the group.');
                openGroupSettings(conversationId);
            } catch (error) {
                console.error('Invite failed', error);
                showToast('Could not invite that user.');
            }
        }

        async function deleteConversationWithMessages(conversationId) {
            const messagesRef = db.collection(`conversations/${conversationId}/messages`);
            while (true) {
                const snapshot = await messagesRef.limit(100).get();
                if (snapshot.empty) break;

                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();

                if (snapshot.size < 100) break;
            }
            await db.collection('conversations').doc(conversationId).delete();
        }

        async function deleteOwnedGroup(conversationId) {
            if (!db || !currentUser) return;
            try {
                const convoRef = db.collection('conversations').doc(conversationId);
                const convoSnap = await convoRef.get();
                if (!convoSnap.exists) { showToast('Group not found.'); return; }

                const convoData = convoSnap.data();
                if (getGroupOwnerId(convoData) !== currentUser.uid) {
                    showToast('Only the group owner can delete this group.');
                    return;
                }

                const confirmed = await requestWxterConfirm('Delete Group', `Delete ${getConversationDisplayName(convoData)} for everyone?`);
                if (!confirmed) return;

                await deleteConversationWithMessages(conversationId);
                LauncherState.activeConversationId = null;
                LauncherState.lastConversationMessageKey.delete(conversationId);
                showToast('Group deleted.');
                loadFriendsList();
            } catch (error) {
                console.error('Delete group failed', error);
                showToast('Could not delete the group.');
            }
        }

        async function openChat(conversationId, name) {
            LauncherState.activeConversationId = conversationId;
            const content = document.getElementById('social-content');
            content.innerHTML = '<div class="p-4 text-center"><i class="fas fa-spinner fa-spin"></i></div>';
            
            const convoSnap = await db.collection('conversations').doc(conversationId).get();
            const convoData = convoSnap.data();
            let otherUser = null;
            let groupMeta = null;

            if (!convoData) {
                showToast('Conversation not found.');
                loadFriendsList();
                return;
            }

            if (Array.isArray(convoData.memberIds) && !convoData.memberIds.includes(currentUser.uid)) {
                showToast('You no longer have access to this chat.');
                loadFriendsList();
                return;
            }
            
            if (convoData && convoData.isDirectMessage) {
                const otherUid = convoData.memberIds.find(id => id !== currentUser.uid);
                if (otherUid) {
                    ensureUserListener(otherUid);
                    const uDoc = await db.collection('users').doc(otherUid).get();
                    if (uDoc.exists) {
                        const ud = uDoc.data();
                        otherUser = { 
                            id: otherUid, 
                            username: ud.username || ud.displayName || (globalUserCache[otherUid]?.name) || 'Unknown User',
                            avatarUrl: ud.avatarUrl || (globalUserCache[otherUid]?.avatar) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUid}`
                        };
                    }
                }
            } else {
                groupMeta = {
                    name: getConversationDisplayName(convoData),
                    avatarUrl: getConversationAvatar(convoData),
                    ownerId: getGroupOwnerId(convoData),
                    memberCount: Array.isArray(convoData.memberIds) ? convoData.memberIds.length : 0
                };
            }

            content.innerHTML = `
                <div class="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                    <div class="flex items-center gap-2 overflow-hidden">
                        <button onclick="loadFriendsList()" class="text-gray-400 hover:text-white px-1"><i class="fas fa-chevron-left"></i></button>
                        ${otherUser ? `
                            <div class="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded transition" onclick="viewOtherProfile('${otherUser.id}')">
                                <img src="${otherUser.avatarUrl}" id="chat-header-img" data-user-id="${otherUser.id}" class="w-8 h-8 rounded-full border border-white/10" onerror="handleAvatarFallback(this, '${otherUser.username.replace(/'/g, "\\'")}')">
                                <div class="font-bold truncate text-sm" id="chat-header-name" data-user-id="${otherUser.id}">${escapeHtml(otherUser.username)}</div>
                            </div>
                        ` : `
                            <div class="flex items-center gap-3 min-w-0 px-1">
                                <img src="${groupMeta?.avatarUrl || buildAvatarFallbackDataUri(name || 'Group')}" class="w-9 h-9 rounded-xl border border-white/10 object-cover bg-black flex-shrink-0" onerror="handleAvatarFallback(this, '${(groupMeta?.name || name || 'Group').replace(/'/g, "\\'")}')">
                                <div class="min-w-0">
                                    <div class="font-bold truncate text-sm">${escapeHtml(groupMeta?.name || name)}</div>
                                    <div class="text-[10px] text-gray-400 uppercase tracking-[0.14em]">${groupMeta?.memberCount || 0} members${groupMeta?.ownerId === currentUser.uid ? ' • You own this group' : ''}</div>
                                </div>
                            </div>
                        `}
                    </div>
                    ${otherUser
                        ? `<button onclick="viewOtherProfile('${otherUser.id}')" class="text-gray-400 hover:text-white text-xs"><i class="fas fa-info-circle"></i></button>`
                        : `<button onclick="openGroupSettings('${conversationId}')" class="text-gray-400 hover:text-white text-xs"><i class="fas fa-sliders"></i></button>`
                    }
                </div>
                <div id="chat-messages" class="flex-1 overflow-y-auto mb-2 space-y-3 pr-2" style="max-height: 55vh;"></div>
                <div id="typing-status" class="text-[10px] text-gray-500 italic mb-2 h-4 px-2"></div>
                <div id="blocked-status" class="hidden bg-red-900/40 border border-red-500/50 text-red-200 p-2 rounded mb-2 text-xs text-center font-bold">
                    <i class="fas fa-ban mr-2"></i>You cannot send messages to this user.
                </div>
                <div id="chat-input-container" class="flex gap-2 p-1 relative">
                    <input type="file" id="chat-image-input" accept="image/*" class="hidden" onchange="handleChatImageUpload('${conversationId}')">
                    <button class="bg-white/5 hover:bg-white/10 transition px-3 rounded text-gray-400" onclick="document.getElementById('chat-image-input').click()"><i class="fas fa-camera"></i></button>
                    <input type="text" id="chat-input" class="modal-input flex-1 py-2 px-3 text-sm" placeholder="Message..." onkeypress="if(event.key==='Enter') sendChatMessage('${conversationId}')" oninput="handleTyping('${conversationId}')">
                    <button class="bg-white/10 hover:bg-white/20 transition px-4 rounded text-gray-300 font-bold" onclick="sendChatMessage('${conversationId}')"><i class="fas fa-paper-plane"></i></button>
                </div>
            `;

            // Listen for Blocked Status
            db.collection('conversations').doc(conversationId).get().then(snap => {
                const data = snap.data();
                if (data && data.isDirectMessage) {
                    const otherUserId = data.memberIds.find(id => id !== currentUser.uid);
                    if (otherUserId) {
                        db.collection('users').doc(currentUser.uid).collection('blocked').doc(otherUserId).onSnapshot(s => { if (s.exists) showBlocked(true); });
                        db.collection('users').doc(otherUserId).collection('blocked').doc(currentUser.uid).onSnapshot(s => { if (s.exists) showBlocked(true); });
                    }
                }
            });

            // Presence & Typing logic
            db.collection('conversations').doc(conversationId).onSnapshot(snap => {
                const data = snap.data();
                if(!data) return;
                const typingObj = data.typing || {};
                const now = Date.now();
                const typingNames = [];
                for (const [uid, timestamp] of Object.entries(typingObj)) {
                    if (uid !== currentUser.uid && (now - timestamp) < 3000) {
                        const name = globalUserCache[uid]?.name || (data.names ? data.names[uid] : 'Someone');
                        typingNames.push(name);
                        ensureUserListener(uid); // Ensure we are listening to their name changes
                    }
                }
                const statusDiv = document.getElementById('typing-status');
                if(statusDiv) statusDiv.textContent = typingNames.length > 0 ? `${typingNames.join(', ')} is typing...` : '';
            });

            db.collection(`conversations/${conversationId}/messages`).orderBy('createdAt', 'asc').limit(50)
                .onSnapshot(snap => {
                    const msgs = document.getElementById('chat-messages');
                    if(!msgs) return;
                    let html = '';
                    msgs.innerHTML = '';
                    snap.forEach(doc => {
                        const data = doc.data();
                        if (data.deleted) return;
                        const isMine = data.senderId === currentUser.uid;
                        
                        let messageBody = '';
                        if (data.type === 'image') {
                            messageBody = `<img src="${data.imageUrl}" class="rounded-lg max-w-full cursor-pointer hover:brightness-110 transition" onclick="window.open('${data.imageUrl}')">`;
                        } else {
                            messageBody = parseMessageText(data.text);
                        }

                        if(data.isForwarded) {
                            messageBody = `
                                <div class="text-[9px] text-gray-400 italic mb-1 flex items-center gap-1"><i class="fas fa-share"></i> Forwarded from ${data.forwardedFrom || 'User'}</div>
                                ${messageBody}
                            `;
                        }

                        // Reactions
                        let reactionsHtml = '';
                        if (data.reactions) {
                            reactionsHtml = `<div class="flex gap-1 mt-1 flex-wrap">`;
                            for (const [emoji, count] of Object.entries(data.reactions)) {
                                if(count > 0) reactionsHtml += `<span class="bg-white/10 px-1.5 py-0.5 rounded-full text-[10px]">${emoji} ${count}</span>`;
                            }
                            reactionsHtml += `</div>`;
                        }

                        const msgDiv = document.createElement('div');
                        msgDiv.className = `flex ${isMine ? 'justify-end' : 'justify-start'}`;
                        
                        const senderId = data.senderId;
                        ensureUserListener(senderId);

                        // Determine initial name to prevent 'User' flicker
                        const initialName = globalUserCache[senderId]?.name || (convoData && convoData.names ? convoData.names[senderId] : (data.senderName || 'User'));

                        // Format time
                        let timeStr = '';
                        if (data.createdAt) {
                            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                            timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }

                        msgDiv.innerHTML = `
                            <div class="max-w-[90%] relative group ${isMine ? 'bg-blue-600 text-white rounded-l-lg rounded-tr-lg' : 'bg-white/10 text-gray-200 rounded-r-lg rounded-tl-lg'} p-2 text-xs" 
                                 oncontextmenu="handleMsgCtx(event, '${doc.id}', '${data.senderId}', '${conversationId}')">
                                ${!isMine ? `<div class="font-bold text-[9px] text-blue-400 mb-1 user-name-${senderId}">${initialName}</div>` : ''}
                                ${messageBody}
                                ${reactionsHtml}
                                <div class="flex items-center justify-between mt-1 gap-2">
                                    <div class="text-[8px] opacity-40">${timeStr} ${data.isEdited ? '<span class="italic">(edited)</span>' : ''}</div>
                                </div>
                            </div>
                        `;
                        msgs.appendChild(msgDiv);
                    });
                    msgs.scrollTop = msgs.scrollHeight;
                });
        }

        let contextTarget = null;
        function handleMsgCtx(e, msgId, senderId, convoId) {
            e.preventDefault();
            contextTarget = { msgId, senderId, convoId };
            const menu = document.getElementById('message-context-menu');
            const isMine = senderId === currentUser.uid;
            
            document.getElementById('menu-group-own').style.display = isMine ? 'block' : 'none';
            
            menu.classList.remove('hidden');
            menu.style.left = `${e.pageX}px`;
            menu.style.top = `${e.pageY}px`;
            
            const close = () => { menu.classList.add('hidden'); document.removeEventListener('click', close); };
            setTimeout(() => document.addEventListener('click', close), 10);
        }

        async function triggerDelete() {
            if(!contextTarget || !db) return;
            const confirmed = await requestWxterConfirm('Delete Message', 'Delete message for everyone?');
            if (!confirmed) return;

            const { msgId, convoId } = contextTarget;
            await db.collection(`conversations/${convoId}/messages`).doc(msgId).update({ deleted: true });
            
            // Update Conversation Preview if this was the latest message
            const convoRef = db.collection('conversations').doc(convoId);
            const convoSnap = await convoRef.get();
            const convoData = convoSnap.data();
            
            // We don't know for sure if it's the latest without checking, so let's just re-fetch the actual latest
            const latestSnap = await db.collection(`conversations/${convoId}/messages`)
                .where('deleted', '==', false)
                .orderBy('createdAt', 'desc')
                .limit(1).get();
            
            if (!latestSnap.empty) {
                const lastMsg = latestSnap.docs[0].data();
                await convoRef.update({
                    lastMessagePreview: lastMsg.type === 'image' ? '📷 Image' : lastMsg.text,
                    lastMessageAt: lastMsg.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
                    lastMessageSenderId: lastMsg.senderId
                });
            } else {
                // No messages left
                await convoRef.update({
                    lastMessagePreview: 'No messages',
                    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastMessageSenderId: ''
                });
            }
            showToast('Message deleted');
        }

        async function triggerEdit() {
            if(!contextTarget || !db) return;
            const doc = await db.collection(`conversations/${contextTarget.convoId}/messages`).doc(contextTarget.msgId).get();
            const data = doc.data();
            const newText = await requestWxterPrompt('Edit Message', 'Update the message text:', data.text || '');
            if(newText && newText.trim() !== data.text) {
                if(!isMessageSafe(newText)) { showToast('Blocked: Restricted language.'); return; }
                await db.collection(`conversations/${contextTarget.convoId}/messages`).doc(contextTarget.msgId).update({ 
                    text: newText.trim(), 
                    isEdited: true, 
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                });
            }
        }

        async function addReaction(emoji) {
            if(!contextTarget) return;
            const ref = db.collection(`conversations/${contextTarget.convoId}/messages`).doc(contextTarget.msgId);
            db.runTransaction(async (transaction) => {
                const sfDoc = await transaction.get(ref);
                const data = sfDoc.data();
                const reactions = data.reactions || {};
                reactions[emoji] = (reactions[emoji] || 0) + 1;
                transaction.update(ref, { reactions });
            });
        }

        async function openForwardModal() {
            if(!contextTarget) return;
            const modal = document.getElementById('forward-modal');
            const list = document.getElementById('forward-list');
            modal.classList.add('active');
            
            list.innerHTML = '<i class="fas fa-spinner fa-spin p-4"></i>';
            const snap = await db.collection('conversations').where('memberIds', 'array-contains', currentUser.uid).get();
            
            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                const displayName = getConversationDisplayName(data);
                
                html += `
                    <div class="forward-card" onclick="executeForward('${doc.id}')">
                        <div class="text-sm font-bold truncate">${escapeHtml(displayName)}</div>
                        <i class="fas fa-chevron-right text-gray-500 text-xs"></i>
                    </div>
                `;
            });
            list.innerHTML = html || '<div class="text-xs text-gray-400">No chats found.</div>';
        }

        async function executeForward(targetConvoId) {
            if(!contextTarget) return;
            try {
                const currentIdentity = getCurrentIdentity();
                const msgDoc = await db.collection(`conversations/${contextTarget.convoId}/messages`).doc(contextTarget.msgId).get();
                const msgData = msgDoc.data();
                
                await db.collection(`conversations/${targetConvoId}/messages`).add({
                    senderId: currentUser.uid,
                    senderName: currentIdentity.username,
                    text: msgData.text || '',
                    type: msgData.type || 'text',
                    imageUrl: msgData.imageUrl || '',
                    isForwarded: true,
                    forwardedFrom: msgData.senderName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                showToast('Forwarded!');
                closeModals();
            } catch(e) { showToast('Error forwarding.'); }
        }

        function showBlocked(blocked) {
            const input = document.getElementById('chat-input-container');
            const banner = document.getElementById('blocked-status');
            if (blocked && input && banner) {
                input.classList.add('hidden');
                banner.classList.remove('hidden');
            }
        }

        async function viewOtherProfile(userId) {
            const uDoc = await db.collection('users').doc(userId).get();
            if(!uDoc.exists) return;
            const u = uDoc.data();
            
            const modal = document.getElementById('profile-modal');
            modal.querySelector('h2').textContent = 'User Profile'; // Change Title
            modal.classList.add('active');
            const content = document.querySelector('#profile-modal .space-y-6');
            const uName = u.username || u.displayName || 'Player';
            const uAvatar = u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uName}`;

            content.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:16px; text-align:center; margin-bottom:24px; padding-top:8px;">
                    <div style="position:relative; width:96px; height:96px;">
                        <div style="position:absolute; inset:-4px; border-radius:50%; background:rgba(59,130,246,0.3); filter:blur(8px); animation:pulse 2s infinite;"></div>
                        <img src="${uAvatar}" class="user-avatar-${userId}" onerror="handleAvatarFallback(this, '${uName.replace(/'/g, "\\'")}')" style="width:96px; height:96px; border-radius:50%; border:3px solid white; position:relative; z-index:10; object-fit:cover; display:block;">
                    </div>
                    <div>
                        <div class="user-name-${userId}" style="font-size:24px; font-weight:900; color:white; line-height:1;">${uName}</div>
                        <div style="font-size:10px; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px; color:#93c5fd; font-weight:900; display:inline-block; margin-top:8px; text-transform:uppercase; letter-spacing:1px;">LVL 01 Gamer</div>
                    </div>
                </div>
                <div class="bg-white/5 p-4 rounded-xl border border-white/10 shadow-inner">
                    <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Bio</div>
                    <div class="text-sm leading-relaxed">${u.bio || 'This user prefers to stay mysterious.'}</div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-white/5 p-3 rounded-lg text-center border border-white/5">
                        <div class="text-xl font-bold">${u.gamesPlayed || 0}</div>
                        <div class="text-[10px] text-gray-500 uppercase">Games Played</div>
                    </div>
                    <div class="bg-white/5 p-3 rounded-lg text-center border border-white/5">
                        <div class="text-xl font-bold">${u.favorites || 0}</div>
                        <div class="text-[10px] text-gray-500 uppercase">Favorites</div>
                    </div>
                </div>
                <div class="flex gap-3">
                    <button onclick="blockUser('${userId}')" class="flex-1 py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-bold rounded-lg border border-red-500/20 transition">
                        <i class="fas fa-ban mr-2"></i>Block User
                    </button>
                    <button onclick="toggleModal('profile-modal')" class="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition">
                        Close
                    </button>
                </div>
            `;
            // Temporary hide the standard save buttons for viewing mode
            document.querySelector('#profile-modal .flex.gap-4').style.display = 'none';
        }

        const globalUserCache = {};
        const userListeners = {};
        function ensureUserListener(userId) {
            if(!db || userListeners[userId]) return;
            userListeners[userId] = db.collection('users').doc(userId).onSnapshot(doc => {
                if(doc.exists) {
                    const data = doc.data();
                    const name = data.username || data.displayName || 'User';
                    const avatar = data.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
                    
                    globalUserCache[userId] = { name, avatar, status: data.status };
                    
                    // Update all name labels in chat
                    document.querySelectorAll(`.user-name-${userId}`).forEach(el => {
                        el.textContent = name;
                    });
                    
                    // Update all avatar images in conversation list (if visible)
                    document.querySelectorAll(`.user-avatar-${userId}`).forEach(el => {
                        if (el.tagName === 'IMG') el.src = avatar;
                        else el.style.backgroundImage = `url(${avatar})`;
                    });

                    // Update status dots in sidebar
                    document.querySelectorAll(`.user-status-${userId}`).forEach(dot => {
                        dot.style.background = data.status === 'online' ? '#10b981' : (data.status === 'away' ? '#f59e0b' : '#ef4444');
                    });

                    // Update Chat Header if we are currently talking to this person
                    const chatHeaderName = document.getElementById('chat-header-name');
                    if(chatHeaderName && chatHeaderName.dataset.userId === userId) {
                        chatHeaderName.textContent = name;
                    }
                    const chatHeaderImg = document.getElementById('chat-header-img');
                    if(chatHeaderImg && chatHeaderImg.dataset.userId === userId) {
                        chatHeaderImg.src = avatar;
                    }
                }
            });
        }
        async function blockUser(userId) {
            const confirmed = await requestWxterConfirm('Block User', 'Are you sure you want to block this user?');
            if(!confirmed) return;
            try {
                await db.collection('users').doc(currentUser.uid).collection('blocked').doc(userId).set({
                    blockedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast('User Blocked');
                toggleModal('profile-modal');
                loadFriendsList();
            } catch(e) { showToast('Error blocking user.'); }
        }

        let typingTimeout = null;
        let typingWriteTimeout = null;
        function handleTyping(convoId) {
            if (typingTimeout) clearTimeout(typingTimeout);
            if (typingWriteTimeout) clearTimeout(typingWriteTimeout);
            typingWriteTimeout = setTimeout(() => {
                db.collection('conversations').doc(convoId).set({
                    typing: { [currentUser.uid]: Date.now() }
                }, { merge: true });
            }, 250);
            typingTimeout = setTimeout(() => {
                db.collection('conversations').doc(convoId).set({
                    typing: { [currentUser.uid]: 0 }
                }, { merge: true });
            }, 3000);
        }

        function sendChatMessage(conversationId) {
            const inp = document.getElementById('chat-input');
            const txt = inp.value.trim();
            if(!txt || !currentUser || !db) return;
            const currentIdentity = getCurrentIdentity();

            // Chat Moderation Filter
            if(!isMessageSafe(txt)) {
                showToast('Message blocked: Contains restricted language.');
                inp.value = '';
                return;
            }

            inp.value = '';
            
            db.collection(`conversations/${conversationId}/messages`).add({
                senderId: currentUser.uid,
                senderName: currentIdentity.username,
                text: txt, type: 'text', imageUrl: '', replyToMessageId: '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(), deleted: false
            });
            db.collection('conversations').doc(conversationId).update({
                lastMessagePreview: txt,
                lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessageSenderId: currentUser.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        async function handleChatImageUpload(conversationId) {
            const file = document.getElementById('chat-image-input').files[0];
            if (!file) return;
            const currentIdentity = getCurrentIdentity();

            showToast('Uploading image...');

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.src = URL.createObjectURL(file);

            img.onload = () => {
                const max = 400; // Limit chat images to 400px width for performance
                const ratio = Math.min(max / img.width, max / img.height);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const compressed = canvas.toDataURL('image/jpeg', 0.6);

                db.collection(`conversations/${conversationId}/messages`).add({
                    senderId: currentUser.uid,
                    senderName: currentIdentity.username,
                    text: '', type: 'image', imageUrl: compressed,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(), deleted: false
                });

                db.collection('conversations').doc(conversationId).update({
                    lastMessagePreview: '📷 Image',
                    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastMessageSenderId: currentUser.uid,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast('Image sent!');
            };
        }

        function parseMessageText(text) {
            if(!text) return '';
            
            // Regex to find URLs
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            let finalHtml = text.replace(urlRegex, '<a href="$1" target="_blank" class="text-blue-300 underline break-all">$1</a>');

            const urls = text.match(urlRegex);
            if (urls) {
                urls.forEach(url => {
                    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
                    if (ytMatch) {
                        const videoId = ytMatch[1];
                        // Adding origin and enablejsapi fixes common 'configuration' errors on different environments
                        const origin = window.location.origin !== 'null' ? `&origin=${window.location.origin}` : '';
                        finalHtml += `
                            <div class="mt-2 bg-black/40 rounded-lg p-1 border border-white/10 max-w-sm">
                                <iframe class="w-full aspect-video rounded" 
                                    src="https://www.youtube.com/embed/${videoId}?enablejsapi=1${origin}" 
                                    frameborder="0" 
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                    allowfullscreen
                                    referrerpolicy="strict-origin-when-cross-origin"></iframe>
                                <div class="p-2 text-[10px] text-gray-400 font-bold uppercase tracking-tighter"><i class="fab fa-youtube text-red-500 mr-1"></i> YouTube Video</div>
                            </div>
                        `;
                    }
                });
            }
            return finalHtml;
        }

        function isMessageSafe(text) {
            const normalized = text.toLowerCase()
                .replace(/[1!|]/g, 'i')
                .replace(/[3]/g, 'e')
                .replace(/[4@]/g, 'a')
                .replace(/[0]/g, 'o')
                .replace(/[5$]/g, 's')
                .replace(/[7]/g, 't')
                .replace(/[8]/g, 'b')
                .replace(/[(]/g, 'c')
                .replace(/[\W_]/g, ''); // Remove all symbols and spaces for deep check

            // Forbidden patterns (Racial & Homophobic slurs)
            const blacklist = [
                'nigger', 'nigga', 'faggot', 'fag', 'kike', 'tranny', 'retard'
            ];

            return !blacklist.some(slur => normalized.includes(slur));
        }
