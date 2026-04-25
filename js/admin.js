        async function loadAdminCatalog() {
            if(userRole !== 'owner' && userRole !== 'mod') return;
            const content = document.getElementById('admin-content');
            content.innerHTML = `
                <div id="admin-catalog-editor" class="mb-8 p-4 bg-white/5 rounded border border-white/10">
                    <h3 class="text-xl font-bold mb-4 text-gray-300">Add / Edit Content</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <input type="hidden" id="admin-add-id">
                        <input type="text" id="admin-add-title" placeholder="Display Title" class="modal-input w-full">
                        <select id="admin-add-type" class="modal-input w-full"><option value="games">Games</option><option value="media">Media</option><option value="browsers">Browsers</option></select>
                        <textarea id="admin-add-source" placeholder="Game URL/HTML Code" class="modal-input w-full col-span-2 min-h-[180px] resize-y"></textarea>
                        <div class="col-span-2 text-xs text-gray-500 -mt-2">Paste a normal game link or a single-file HTML document. Raw HTML launches directly.</div>
                        <input type="text" id="admin-add-img" placeholder="Background Link (Hero Image)" class="modal-input w-full">
                        <input type="text" id="admin-add-icon" placeholder="Icon Link (Logo Image)" class="modal-input w-full">
                        <input type="text" id="admin-add-desc" placeholder="Description" class="modal-input w-full">
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button id="admin-submit-btn" class="btn-primary" onclick="adminSubmitCatalog()">Add to Catalog</button>
                        <button id="admin-cancel-edit" class="btn-secondary hidden" onclick="cancelAdminEdit()">Cancel Edit</button>
                    </div>
                    <div class="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-xs text-gray-500">
                        <span>Built-in games can be "copied" to cloud for editing.</span>
                    </div>
                </div>
                <h3 class="text-xl font-bold mb-4 text-gray-300">Manage Catalog</h3>
                <div class="mb-4">
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-[0.14em] mb-2">Search catalog</label>
                    <input type="search" id="admin-catalog-search" class="modal-input w-full" placeholder="Find by title, id, type, or description..." oninput="filterAdminCatalogRows()">
                </div>
                <div id="admin-catalog-list" class="space-y-3">
                    <i class="fas fa-spinner fa-spin mr-2"></i>Loading Catalog...
                </div>
            `;

            try {
                const list = document.getElementById('admin-catalog-list');
                const [g, m, b] = await Promise.allSettled([
                    db.collection('games').get(),
                    db.collection('media').get(),
                    db.collection('browsers').get()
                ]);
                
                const cloudItems = [
                    ...(g.status === 'fulfilled' ? g.value.docs.map(d => ({...d.data(), type:'games', isCloud: true})) : []),
                    ...(m.status === 'fulfilled' ? m.value.docs.map(d => ({...d.data(), type:'media', isCloud: true})) : []),
                    ...(b.status === 'fulfilled' ? b.value.docs.map(d => ({...d.data(), type:'browsers', isCloud: true})) : [])
                ];

                const merged = {};
                // First add all hardcoded data as base
                rawGameData.forEach(item => {
                    merged[item.id] = { ...item, isCloud: false };
                });
                // Overwrite with cloud data if exists
                cloudItems.forEach(item => {
                    merged[item.id] = { ...item, isCloud: true };
                });

                const displayItems = Object.values(merged).sort((x,y) => x.title.localeCompare(y.title));
                
                let html = '';
                displayItems.forEach(item => {
                    const tag = item.isCloud ? '<span class="text-[8px] bg-blue-600/30 text-blue-400 px-1.5 py-0.5 rounded ml-2">CLOUD</span>' : '<span class="text-[8px] bg-gray-600/30 text-gray-400 px-1.5 py-0.5 rounded ml-2">LOCAL</span>';
                    const previewUrl = escapeHtml(item.img || item.bg || '');
                    const safeTitle = escapeHtml(item.title || 'Untitled');
                    const safeType = escapeHtml(item.type || 'games');
                    const safeDesc = escapeHtml(item.desc || '');
                    const searchHay = encodeURIComponent(`${String(item.title || '')} ${String(item.id || '')} ${String(item.type || '')} ${String(item.desc || '')}`.toLowerCase());
                    
                    const actionBtns = `
                        <button class="bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 px-3 py-1 rounded text-xs font-bold" onclick='prepareAdminEdit(${JSON.stringify(String(item.type || 'games'))}, ${JSON.stringify(String(item.id || ''))})'><i class="fas fa-edit mr-1"></i>Edit</button>
                        ${item.isCloud ? `<button class="bg-red-600/20 hover:bg-red-600/40 text-red-300 px-3 py-1 rounded text-xs font-bold ml-1" onclick='adminDeleteGame(${JSON.stringify(String(item.type || 'games'))}, ${JSON.stringify(String(item.id || ''))}, ${JSON.stringify(String(item.title || 'Untitled'))})'><i class="fas fa-trash"></i></button>` : ''}
                    `;

                    html += `
                        <div class="admin-catalog-row bg-white/5 p-3 rounded flex justify-between items-center border border-white/10 hover:bg-white/10 transition" data-search="${searchHay}">
                            <div class="flex items-center gap-4 overflow-hidden">
                                <div class="w-12 h-12 rounded flex-shrink-0 bg-gray-900 flex items-center justify-center overflow-hidden">
                                    ${previewUrl ? `<img src="${previewUrl}" alt="${safeTitle}" class="w-full h-full object-cover">` : ((!item.img && !item.bg) ? item.icon : '')}
                                </div>
                                <div class="overflow-hidden">
                                    <div class="font-bold truncate text-white items-center flex">${safeTitle} ${tag}</div>
                                    <div class="text-[10px] text-gray-500 uppercase font-black">${safeType}</div>
                                    ${safeDesc ? `<div class="text-[11px] text-gray-400 truncate mt-1 max-w-[32rem]">${safeDesc}</div>` : ''}
                                </div>
                            </div>
                            <div class="flex gap-2 flex-shrink-0">${actionBtns}</div>
                        </div>
                    `;
                });
                const failedCollections = [
                    g.status === 'rejected' ? 'games' : null,
                    m.status === 'rejected' ? 'media' : null,
                    b.status === 'rejected' ? 'browsers' : null
                ].filter(Boolean);
                if (failedCollections.length) {
                    html = `<div class="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">Cloud sections unavailable: ${escapeHtml(failedCollections.join(', '))}</div>${html}`;
                }
                list.innerHTML = html;
                filterAdminCatalogRows();
            } catch(e) { console.error(e); }
        }

        function filterAdminCatalogRows() {
            const q = (document.getElementById('admin-catalog-search')?.value || '').trim().toLowerCase();
            document.querySelectorAll('.admin-catalog-row').forEach(row => {
                let hay = '';
                try {
                    hay = decodeURIComponent(row.getAttribute('data-search') || '');
                } catch {
                    hay = row.getAttribute('data-search') || '';
                }
                hay = hay.toLowerCase();
                row.style.display = !q || hay.includes(q) ? '' : 'none';
            });
        }

        function scrollAdminCatalogEditorIntoView() {
            const adminScroller = document.getElementById('admin-content');
            const editor = document.getElementById('admin-catalog-editor');
            if (adminScroller) {
                adminScroller.scrollTo({ top: 0, behavior: 'smooth' });
            }
            if (editor) {
                editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            setTimeout(() => {
                document.getElementById('admin-add-title')?.focus();
            }, 180);
        }

        async function loadAdminSupportTickets() {
            if(userRole !== 'owner' && userRole !== 'mod') return;

            const content = document.getElementById('admin-content');
            content.innerHTML = `
                <div class="flex items-center justify-between mb-5">
                    <h3 class="text-xl font-bold text-white"><i class="fas fa-life-ring text-blue-400 mr-2"></i>Support Tickets</h3>
                    <button onclick="loadAdminSupportTickets()" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 bg-white/5 rounded border border-white/10 hover:bg-white/10 transition"><i class="fas fa-sync-alt mr-1"></i>Refresh</button>
                </div>
                <div class="flex gap-2 mb-4 flex-wrap" id="admin-support-filter-row">
                    <button class="support-filter-btn active text-xs px-3 py-1.5 rounded-full border border-white/20 bg-white/10 text-white" data-filter="all" onclick="filterAdminTickets('all')">All</button>
                    <button class="support-filter-btn text-xs px-3 py-1.5 rounded-full border border-white/10 text-gray-400 hover:text-white" data-filter="open" onclick="filterAdminTickets('open')">Open</button>
                    <button class="support-filter-btn text-xs px-3 py-1.5 rounded-full border border-white/10 text-gray-400 hover:text-white" data-filter="resolved" onclick="filterAdminTickets('resolved')">Resolved</button>
                    <button class="support-filter-btn text-xs px-3 py-1.5 rounded-full border border-white/10 text-gray-400 hover:text-white" data-filter="bug" onclick="filterAdminTickets('bug')">Bugs</button>
                    <button class="support-filter-btn text-xs px-3 py-1.5 rounded-full border border-white/10 text-gray-400 hover:text-white" data-filter="suggestion" onclick="filterAdminTickets('suggestion')">Suggestions</button>
                </div>
                <div id="admin-support-tickets-list" class="space-y-3">
                    <div class="text-center py-8 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Loading tickets...</div>
                </div>
            `;

            try {
                const snapshot = await db.collection('support_tickets').orderBy('timestamp', 'desc').get();
                window._adminSupportTickets = [];
                snapshot.forEach(doc => window._adminSupportTickets.push({ id: doc.id, ...doc.data() }));
                renderAdminTickets(window._adminSupportTickets);
            } catch(e) {
                console.error('Error loading support tickets:', e);
                document.getElementById('admin-support-tickets-list').innerHTML = '<p class="text-red-400 text-sm">Failed to load tickets.</p>';
            }
        }

        function filterAdminTickets(filter) {
            document.querySelectorAll('.support-filter-btn').forEach(b => {
                const isActive = b.dataset.filter === filter;
                b.className = isActive
                    ? 'support-filter-btn text-xs px-3 py-1.5 rounded-full border border-white/20 bg-white/10 text-white'
                    : 'support-filter-btn text-xs px-3 py-1.5 rounded-full border border-white/10 text-gray-400 hover:text-white';
            });
            const all = window._adminSupportTickets || [];
            const filtered = filter === 'all' ? all : all.filter(t => t.status === filter || t.type === filter);
            renderAdminTickets(filtered);
        }

        function renderAdminTickets(tickets) {
            const list = document.getElementById('admin-support-tickets-list');
            if (!list) return;
            if (!tickets.length) {
                list.innerHTML = '<p class="text-gray-500 text-sm text-center py-6">No tickets found.</p>';
                return;
            }
            list.innerHTML = tickets.map(ticket => {
                const tags = (ticket.tags || []).map(t => `<span class="support-ticket-tag">#${escapeHtml(t)}</span>`).join(' ');
                const ts = ticket.timestamp ? new Date(ticket.timestamp.toDate()).toLocaleString() : 'Unknown';
                const typeClass = normalizeSupportType(ticket.type);
                const isOpen = ticket.status === 'open';
                return `
                <div class="support-ticket-card" id="ticket-card-${ticket.id}">
                    <div class="flex justify-between items-start mb-2 gap-3">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-bold text-white text-sm">${escapeHtml(ticket.username || 'Unknown')}</span>
                            <span class="text-gray-500 text-xs">${escapeHtml(ticket.email || ticket.userId || '')}</span>
                        </div>
                        <span class="text-gray-500 text-xs whitespace-nowrap">${ts}</span>
                    </div>
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                        <span class="support-ticket-type ${typeClass}">${typeClass.replace('-', ' ')}</span>
                        ${tags}
                        <span class="text-xs ml-auto ${isOpen ? 'text-yellow-400' : 'text-green-400'}">${isOpen ? '● Open' : '✓ Resolved'}</span>
                    </div>
                    <p class="text-gray-300 text-sm leading-relaxed mb-3">${escapeHtml(ticket.description || '')}</p>
                    <div class="flex gap-2">
                        ${isOpen
                            ? `<button onclick="resolveAdminTicket('${ticket.id}')" class="text-xs px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded hover:bg-green-500/20 transition"><i class="fas fa-check mr-1"></i>Mark Resolved</button>`
                            : `<button onclick="reopenAdminTicket('${ticket.id}')" class="text-xs px-3 py-1.5 bg-white/5 border border-white/10 text-gray-400 rounded hover:bg-white/10 transition"><i class="fas fa-undo mr-1"></i>Reopen</button>`
                        }
                        <button onclick='replyToSupportTicket(${JSON.stringify(String(ticket.id))}, ${JSON.stringify(String(ticket.username || 'user'))})' class="text-xs px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded hover:bg-blue-500/20 transition"><i class="fas fa-reply mr-1"></i>Reply</button>
                        <button onclick="deleteAdminTicket('${ticket.id}')" class="text-xs px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded hover:bg-red-500/20 transition"><i class="fas fa-trash mr-1"></i>Delete</button>
                    </div>
                </div>`;
            }).join('');
        }

        async function resolveAdminTicket(id) {
            try {
                await db.collection('support_tickets').doc(id).update({ status: 'resolved' });
                const t = window._adminSupportTickets?.find(t => t.id === id);
                if (t) t.status = 'resolved';
                renderAdminTickets(window._adminSupportTickets || []);
            } catch(e) { console.error(e); }
        }

        async function reopenAdminTicket(id) {
            try {
                await db.collection('support_tickets').doc(id).update({ status: 'open' });
                const t = window._adminSupportTickets?.find(t => t.id === id);
                if (t) t.status = 'open';
                renderAdminTickets(window._adminSupportTickets || []);
            } catch(e) { console.error(e); }
        }

        async function replyToSupportTicket(id, username) {
            if (userRole !== 'owner' && userRole !== 'mod') {
                showToast(`Permission denied. Your role is: ${userRole}. Only owner or mod can reply.`);
                return;
            }
            const body = (await requestWxterPrompt('Admin Reply', `Reply to ${username}:`, ''))?.trim();
            if (!body) return;
            try {
                await db.collection('support_tickets').doc(id).collection('replies').add({
                    body,
                    authorId: currentUser?.uid || null,
                    authorName: currentUser?.displayName || 'Admin',
                    isAdmin: true,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                await db.collection('support_tickets').doc(id).set({
                    lastReplyAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastReplyPreview: body.slice(0, 180)
                }, { merge: true });
                showToast('Reply sent.');
                loadAdminSupportTickets();
                loadMySupportTickets();
            } catch (e) {
                console.error(e);
                showToast(e.message || 'Reply failed');
            }
        }

        async function deleteAdminTicket(id) {
            const confirmed = await requestWxterConfirm('Delete Ticket', 'Delete this ticket permanently?');
            if (!confirmed) return;
            try {
                await db.collection('support_tickets').doc(id).delete();
                window._adminSupportTickets = (window._adminSupportTickets || []).filter(t => t.id !== id);
                renderAdminTickets(window._adminSupportTickets);
            } catch(e) { console.error(e); }
        }

        async function prepareAdminEdit(type, id) {
            try {
                let data = null;
                // Try Firestore first
                const doc = await db.collection(type).doc(id).get();
                if(doc.exists) {
                    data = doc.data();
                } else {
                    // Fallback to local raw data
                    data = rawGameData.find(g => g.id === id);
                }

                if(!data) return;
                
                document.getElementById('admin-add-id').value = data.id;
                document.getElementById('admin-add-id').disabled = true;
                document.getElementById('admin-add-title').value = data.title;
                document.getElementById('admin-add-type').value = data.type || type;
                document.getElementById('admin-add-type').disabled = true;
                document.getElementById('admin-add-source').value = getGameSourceValue(data);
                document.getElementById('admin-add-img').value = data.img || data.bg || '';
                document.getElementById('admin-add-icon').value = data.icon || '';
                document.getElementById('admin-add-desc').value = data.desc || '';
                
                document.getElementById('admin-submit-btn').textContent = "Save Changes";
                document.getElementById('admin-cancel-edit').classList.remove('hidden');
                scrollAdminCatalogEditorIntoView();
            } catch(e) { showToast(e.message); }
        }

        function cancelAdminEdit() {
            document.getElementById('admin-add-id').value = '';
            document.getElementById('admin-add-id').disabled = false;
            document.getElementById('admin-add-title').value = '';
            document.getElementById('admin-add-type').disabled = false;
            document.getElementById('admin-add-source').value = '';
            document.getElementById('admin-add-img').value = '';
            document.getElementById('admin-add-icon').value = '';
            document.getElementById('admin-add-desc').value = '';
            document.getElementById('admin-submit-btn').textContent = "Add to Catalog";
            document.getElementById('admin-cancel-edit').classList.add('hidden');
        }

        async function adminDeleteGame(type, id, title) {
            const confirmed = await requestWxterConfirm('Delete Catalog Item', `Are you sure you want to delete "${title}" permanently?`);
            if(!confirmed) return;
            try {
                await db.collection(type).doc(id).delete();
                showToast(`Deleted ${title}`);
                refreshDynamicCatalog();
                loadAdminCatalog();
            } catch(e) { showToast(e.message); }
        }

        async function adminKickUser(uid, displayName) {
            if (userRole !== 'owner' || !db || uid === currentUser?.uid) {
                showToast('Only the owner can kick users.');
                return;
            }
            const ok = await requestWxterConfirm('Kick user', `Kick ${displayName}? They cannot use this account until you unkick them.`);
            if (!ok) return;
            try {
                await db.collection('users').doc(uid).set({
                    platformKicked: true,
                    platformKickedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    platformKickedBy: currentUser.uid
                }, { merge: true });
                showToast('User kicked from the platform.');
                loadAdminUsers();
            } catch (e) {
                showToast(e.message || 'Kick failed');
            }
        }

        async function adminUnkickUser(uid) {
            if (userRole !== 'owner' || !db) return;
            try {
                await db.collection('users').doc(uid).update({
                    platformKicked: firebase.firestore.FieldValue.delete(),
                    platformKickedAt: firebase.firestore.FieldValue.delete(),
                    platformKickedBy: firebase.firestore.FieldValue.delete()
                });
                showToast('Kick removed. That account can sign in again.');
                loadAdminUsers();
                loadAdminBanlist();
            } catch (e) {
                showToast(e.message || 'Unkick failed');
            }
        }

        async function adminBanUser(uid, displayName) {
            if (userRole !== 'owner' || !db || uid === currentUser?.uid) {
                showToast('Only the owner can ban users.');
                return;
            }
            const ok = await requestWxterConfirm('Ban user', `Ban ${displayName}? Their last known device will be blocked from this site.`);
            if (!ok) return;
            try {
                const uref = db.collection('users').doc(uid);
                const udoc = await uref.get();
                const udata = udoc.exists ? (udoc.data() || {}) : {};
                const lastDevice = udata.lastDeviceId;
                if (!lastDevice) {
                    showToast('No device fingerprint on file for this user yet. They need to sign in once so a device key can be recorded.');
                    return;
                }
                await db.collection('deviceBans').doc(lastDevice).set({
                    userId: uid,
                    username: displayName,
                    bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    bannedBy: currentUser.uid
                });
                await uref.set({
                    platformBanned: true,
                    platformBannedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    platformBannedBy: currentUser.uid
                }, { merge: true });
                showToast('User banned and device blocked.');
                loadAdminUsers();
                loadAdminBanlist();
            } catch (e) {
                showToast(e.message || 'Ban failed');
            }
        }

        async function adminUnbanDevice(deviceId, userId) {
            if (userRole !== 'owner' || !db || !deviceId) return;
            const ok = await requestWxterConfirm('Remove device ban', 'Remove this device ban and restore access for that device?');
            if (!ok) return;
            try {
                await db.collection('deviceBans').doc(deviceId).delete();
                if (userId) {
                    await db.collection('users').doc(userId).update({
                        platformBanned: firebase.firestore.FieldValue.delete(),
                        platformBannedAt: firebase.firestore.FieldValue.delete(),
                        platformBannedBy: firebase.firestore.FieldValue.delete()
                    });
                }
                if (localStorage.getItem('launcher_device_banned') === deviceId) {
                    localStorage.removeItem('launcher_device_banned');
                }
                showToast('Device unbanned.');
                loadAdminUsers();
                loadAdminBanlist();
            } catch (e) {
                showToast(e.message || 'Unban failed');
            }
        }

        function filterAdminUserRows() {
            const q = (document.getElementById('admin-user-search')?.value || '').trim().toLowerCase();
            document.querySelectorAll('.admin-user-row').forEach(row => {
                let hay = '';
                try {
                    hay = decodeURIComponent(row.getAttribute('data-search') || '');
                } catch {
                    hay = row.getAttribute('data-search') || '';
                }
                hay = hay.toLowerCase();
                row.style.display = !q || hay.includes(q) ? '' : 'none';
            });
        }

        async function loadKickedUsersClientFilter() {
            if (!db) return [];
            try {
                const snap = await db.collection('users').limit(200).get();
                return snap.docs.filter(d => d.data()?.platformKicked === true);
            } catch (e) {
                console.warn('[Admin] kicked users fallback failed:', e?.code || e?.message);
                return [];
            }
        }

        async function loadAdminBanlist() {
            if (userRole !== 'owner' && userRole !== 'mod') return;
            const content = document.getElementById('admin-content');
            const owner = userRole === 'owner';
            content.innerHTML = '<div class="text-gray-400 p-6"><i class="fas fa-spinner fa-spin mr-2"></i>Loading banlist…</div>';
            try {
                let devicesSnap = emptyFirestoreQuerySnapshot();
                try {
                    devicesSnap = await db.collection('deviceBans').limit(200).get();
                } catch (banErr) {
                    console.warn('[Admin] deviceBans collection:', banErr?.code || banErr?.message || banErr);
                }

                let kickedDocs = [];
                try {
                    const kickedSnap = await db.collection('users').where('platformKicked', '==', true).limit(80).get();
                    kickedDocs = kickedSnap.docs || [];
                } catch (idxErr) {
                    console.warn('[Admin] platformKicked query failed, using client filter:', idxErr?.code || idxErr?.message);
                    kickedDocs = await loadKickedUsersClientFilter();
                }

                let html = '<h3 class="text-xl font-bold mb-2 text-gray-200">Banlist &amp; moderation</h3>';
                html += '<p class="text-xs text-gray-500 mb-6">Device bans block the site on that browser fingerprint. Kicks block the account until reversed. Only the owner may unkick or unban. If this list is empty but bans should exist, add Firestore rules allowing admins to read <code class="text-gray-400">deviceBans</code> and <code class="text-gray-400">users</code>.</p>';

                html += '<div class="text-sm font-bold text-gray-300 mb-2">Banned devices</div>';
                if (devicesSnap.empty) {
                    html += '<div class="text-xs text-gray-500 mb-8">No active device bans.</div>';
                } else {
                    html += '<div class="space-y-2 mb-8">';
                    devicesSnap.forEach(doc => {
                        const d = doc.data() || {};
                        const when = d.bannedAt?.toDate ? d.bannedAt.toDate().toLocaleString() : '';
                        html += `
                            <div class="bg-white/5 border border-white/10 rounded p-3 flex flex-wrap justify-between gap-2 items-center">
                                <div class="text-xs font-mono text-gray-300 break-all">${escapeHtml(doc.id)}</div>
                                <div class="text-[11px] text-gray-400">${escapeHtml(d.username || d.userId || '')} · ${escapeHtml(when)}</div>
                                ${owner ? `<button type="button" class="bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded" onclick='adminUnbanDevice(${JSON.stringify(doc.id)}, ${JSON.stringify(d.userId || '')})'>Unban device</button>` : ''}
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                html += '<div class="text-sm font-bold text-gray-300 mb-2">Kicked accounts</div>';
                if (!kickedDocs.length) {
                    html += '<div class="text-xs text-gray-500">No kicked accounts in index (or query unavailable).</div>';
                } else {
                    html += '<div class="space-y-2">';
                    kickedDocs.forEach(doc => {
                        const u = doc.data() || {};
                        const uname = escapeHtml(u.username || u.displayName || doc.id);
                        html += `
                            <div class="bg-white/5 border border-white/10 rounded p-3 flex flex-wrap justify-between gap-2 items-center">
                                <div class="text-sm font-bold">${uname}</div>
                                ${owner ? `<button type="button" class="bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded" onclick="adminUnkickUser('${doc.id}')">Unkick</button>` : '<span class="text-[10px] text-gray-500">Owner only</span>'}
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                content.innerHTML = html;
            } catch (e) {
                console.error('[Admin] banlist render error:', e);
                content.innerHTML = `<div class="text-red-300 p-6 space-y-2">
                    <div>Could not render banlist.</div>
                    <div class="text-xs text-gray-500 font-mono break-all">${escapeHtml(String(e?.message || e))}</div>
                </div>`;
            }
        }

        async function loadAdminUsers() {
            if(userRole !== 'owner' && userRole !== 'mod') return;
            const content = document.getElementById('admin-content');
            content.innerHTML = '<h3 class="text-xl font-bold mb-4 text-gray-300"><i class="fas fa-spinner fa-spin mr-2"></i>Loading Users...</h3>';
            try {
                const snap = await db.collection('users').limit(200).get();
                const roleMap = new Map();
                for (const ids of chunkArray(snap.docs.map(doc => doc.id), 10)) {
                    try {
                        const roleSnap = await db.collection('roles')
                            .where(firebase.firestore.FieldPath.documentId(), 'in', ids)
                            .get();
                        roleSnap.forEach(doc => {
                            roleMap.set(doc.id, doc.data()?.role || 'user');
                        });
                    } catch (error) {
                        console.warn('Role batch load failed', ids, error);
                    }
                }
                const users = snap.docs.map(doc => ({
                    id: doc.id,
                    user: doc.data(),
                    role: roleMap.get(doc.id) || 'user'
                }));
                users.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || '', undefined, { sensitivity: 'base' }));

                let html = `
                    <div class="mb-4">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-[0.14em] mb-2">Search directory</label>
                        <input type="search" id="admin-user-search" class="modal-input w-full" placeholder="Filter by username…" oninput="filterAdminUserRows()">
                    </div>
                    <div id="admin-user-list" class="grid grid-cols-1 gap-3">
                `;

                users.forEach(u => {
                    const uname = u.user?.username || u.user?.displayName || u.id;
                    const searchHay = encodeURIComponent(`${String(uname)} ${u.id} ${u.role}`.toLowerCase());
                    const modBtns = userRole === 'owner' && u.id !== currentUser?.uid ? `
                        <button type="button" class="bg-amber-700 hover:bg-amber-600 px-2 py-1 rounded text-[10px] text-white font-bold" onclick='adminKickUser(${JSON.stringify(String(u.id))}, ${JSON.stringify(String(uname))})'>Kick</button>
                        <button type="button" class="bg-red-800 hover:bg-red-700 px-2 py-1 rounded text-[10px] text-white font-bold" onclick='adminBanUser(${JSON.stringify(String(u.id))}, ${JSON.stringify(String(uname))})'>Ban</button>
                        ${u.user?.platformKicked ? `<button type="button" class="bg-emerald-800 hover:bg-emerald-700 px-2 py-1 rounded text-[10px] text-white font-bold" onclick='adminUnkickUser(${JSON.stringify(String(u.id))})'>Unkick</button>` : ''}
                    ` : '';

                    const actionBtns = userRole === 'owner' ? `
                        <button type="button" class="bg-blue-600 px-3 py-1 rounded text-xs text-white" onclick='adminSetRole(${JSON.stringify(String(u.id))}, "mod")'>Mod</button>
                        <button type="button" class="bg-gray-600 px-3 py-1 rounded text-xs text-white" onclick='adminSetRole(${JSON.stringify(String(u.id))}, "user")'>Demote</button>
                        ${modBtns}
                    ` : ``;

                    html += `
                        <div class="admin-user-row bg-white/5 p-3 rounded flex justify-between items-center border border-white/10 hover:bg-white/10" data-search="${searchHay}">
                            <div class="flex items-center gap-3 min-w-0">
                                <img src="${escapeHtml(u.user?.avatarUrl || buildAvatarFallbackDataUri(uname))}" class="w-8 h-8 rounded-full bg-black flex-shrink-0" onerror="handleAvatarFallback(this)">
                                <div class="min-w-0">
                                    <div class="font-bold flex items-center gap-2 flex-wrap">
                                        <div class="w-2 h-2 rounded-full flex-shrink-0" style="background: ${u.user?.status === 'online' ? '#10b981' : (u.user?.status === 'away' ? '#f59e0b' : '#ef4444')}"></div>
                                        <span class="truncate">${escapeHtml(uname)}</span>
                                        <span class="bg-gray-700 text-[9px] px-1.5 py-0.5 rounded flex-shrink-0">${escapeHtml(u.role)}</span>
                                        ${u.user?.platformKicked ? '<span class="text-[9px] bg-amber-900/60 text-amber-200 px-1.5 py-0.5 rounded">KICKED</span>' : ''}
                                        ${u.user?.platformBanned ? '<span class="text-[9px] bg-red-900/60 text-red-200 px-1.5 py-0.5 rounded">BANNED</span>' : ''}
                                    </div>
                                    <div class="text-xs text-gray-400 max-w-xs truncate">${escapeHtml(u.user?.bio || 'No bio')}</div>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2 justify-end">${actionBtns}</div>
                        </div>
                    `;
                });
                html += '</div>';
                content.innerHTML = html;
            } catch(e) { content.innerHTML = '<div class="text-red-400">Error loading users</div>'; }
        }

        async function adminSetRole(uid, role) {
            if (userRole !== 'owner' || !db || !uid) {
                showToast('Only the owner can change roles.');
                return;
            }
            try {
                await db.collection('roles').doc(uid).set({
                    role: role, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
                });
                showToast(`Role updated to ${role}`);
                loadAdminUsers();
            } catch(e) { showToast(e.message); }
        }

        function switchAdminTab(tab) {
            document.querySelectorAll('#admin-modal [data-admin-tab]').forEach(btn => {
                const active = btn.getAttribute('data-admin-tab') === tab;
                btn.className = active
                    ? 'text-white font-bold bg-white/10 px-4 py-2 rounded shadow-inner'
                    : 'text-gray-400 font-bold hover:text-white px-4 py-2 rounded';
            });
            if (tab === 'catalog') loadAdminCatalog();
            else if (tab === 'users') loadAdminUsers();
            else if (tab === 'banlist') loadAdminBanlist();
            else if (tab === 'stats') loadAdminStats();
            else if (tab === 'tutorial') loadAdminTutorial();
            else if (tab === 'support-tickets') loadAdminSupportTickets();
        }

        async function adminSubmitCatalog() {
            if(userRole !== 'owner' && userRole !== 'mod') return;
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = 'Saving...';
            const type = document.getElementById('admin-add-type').value;
            let docId = document.getElementById('admin-add-id').value.trim();
            const isNewCatalogItem = !docId;
            const title = document.getElementById('admin-add-title').value.trim();
            const source = document.getElementById('admin-add-source').value.trim();
            const img = document.getElementById('admin-add-img').value.trim();
            const icon = document.getElementById('admin-add-icon').value.trim();
            const desc = document.getElementById('admin-add-desc').value.trim();
            const sourceType = isLikelyHtmlSource(source) ? 'html' : 'url';
            
            if(!title || !source) { showToast('Title and Game URL/HTML Code are required'); btn.textContent = originalText; return; }
            
            if(!docId) {
                // Auto-generate ID from title
                docId = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            }
            try {
                const payload = {
                    id: docId,
                    title,
                    source,
                    sourceType,
                    url: sourceType === 'url' ? source : '',
                    htmlSource: sourceType === 'html' ? source : '',
                    img,
                    icon,
                    desc: desc || '',
                    addedBy: currentUser.uid,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (isNewCatalogItem) {
                    payload.isLogo = false;
                }
                await db.collection(type).doc(docId).set(payload, { merge: true });
                showToast(`${title} saved!`);
                cancelAdminEdit();
                refreshDynamicCatalog();
                loadAdminCatalog();
            } catch(e) { showToast(`Error: ${e.message}`); }
            btn.textContent = originalText;
        }

        function drainToastQueue() {
            const container = document.getElementById('toast-container');
            if (!container) return;
            while (LauncherState.toastQueue.length && LauncherState.toastActiveCount < LauncherState.toastMaxVisible) {
                const { msg, duration } = LauncherState.toastQueue.shift();
                const toast = document.createElement('div');
                LauncherState.toastActiveCount += 1;
                toast.className = 'bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-3 rounded shadow-2xl flex items-center gap-3 transform translate-y-full opacity-0 transition-all duration-300 pointer-events-auto';
                if (msg.includes('New message')) { toast.classList.add('cursor-pointer'); toast.onclick = () => toggleSocial(); }
                toast.innerHTML = `<i class="fas fa-bell text-blue-400"></i> <span class="font-medium text-sm flex-1">${escapeHtml(msg)}</span>`;
                container.appendChild(toast);
                requestAnimationFrame(() => toast.classList.remove('translate-y-full', 'opacity-0'));
                setTimeout(() => {
                    toast.classList.add('translate-y-full', 'opacity-0');
                    setTimeout(() => {
                        toast.remove();
                        LauncherState.toastActiveCount = Math.max(0, LauncherState.toastActiveCount - 1);
                        drainToastQueue();
                    }, 300);
                }, duration);
            }
        }

        function showToast(msg, duration = 4000) {
            LauncherState.toastQueue.push({ msg, duration });
            drainToastQueue();
        }

        function loadAdminTutorial() {
            if(userRole !== 'owner' && userRole !== 'mod') return;
            const content = document.getElementById('admin-content');
            content.innerHTML = `
                <div class="space-y-6">
                    <div class="mb-8">
                        <h3 class="text-2xl font-bold mb-2 text-white"><i class="fas fa-lightbulb text-yellow-400 mr-2"></i>Adding Games to Your Catalog</h3>
                        <p class="text-gray-400 text-sm">This guide walks you through adding games to your platform step-by-step.</p>
                    </div>

                    <div class="bg-white/5 p-6 rounded border border-white/10 hover:bg-white/10 transition">
                        <h4 class="text-lg font-bold text-white mb-3">Step 1: Choose a Source</h4>
                        <div class="space-y-3 text-gray-300 text-sm">
                            <p><strong>You can use either a link or raw HTML.</strong> A game URL points to where the game lives online, while HTML code lets you paste a full single-file game directly into the launcher.</p>
                            <p><strong>Where do you find games?</strong> Look for indie game websites that host HTML5 or browser-based games, or use your own exported HTML file. Good examples include:</p>
                            <ul class="ml-6 space-y-2 mt-2">
                                <li>• <strong>Itch.io</strong> - A huge collection of indie games</li>
                                <li>• <strong>Game Jolt</strong> - Another indie game hub</li>
                                <li>• <strong>Armor Games</strong> - Classic browser games</li>
                                <li>• <strong>Kongregate</strong> - Community gaming platform</li>
                                <li>• <strong>Y8</strong> - Free browser games</li>
                            </ul>
                            <p class="pt-3 border-t border-white/10 mt-4"><strong>Why not Snapchat, TikTok, or Crazygames?</strong> Those huge platforms have strict rules and require special approval that's hard to get. They're also designed for short videos or in-app games, not independent game hosting. Niche platforms like Itch.io are specifically built for indie developers and are much easier to work with.</p>
                        </div>
                    </div>

                    <div class="bg-white/5 p-6 rounded border border-white/10 hover:bg-white/10 transition">
                        <h4 class="text-lg font-bold text-white mb-3">Step 2: Add the Game Source (Game URL/HTML Code)</h4>
                        <div class="space-y-3 text-gray-300 text-sm">
                            <p>Go back to the <strong>Catalog</strong> tab and paste either the game link or the raw HTML into the "Game URL/HTML Code" field.</p>
                            <div class="bg-gray-900 p-3 rounded mt-2 border-l-4 border-blue-400 text-xs font-mono">
                                Example URL: https://itch.io/games/somegame<br>
                                Example HTML: &lt;!DOCTYPE html&gt;&lt;html&gt;&lt;body&gt;&lt;canvas id="game"&gt;&lt;/canvas&gt;&lt;script&gt;/* game code */&lt;/script&gt;&lt;/body&gt;&lt;/html&gt;
                            </div>
                            <p class="pt-3"><strong>Quick tip:</strong> Raw HTML is best for single-file games. If you use a link, make sure it actually works before saving.</p>
                        </div>
                    </div>

                    <div class="bg-white/5 p-6 rounded border border-white/10 hover:bg-white/10 transition">
                        <h4 class="text-lg font-bold text-white mb-3">Step 3: Add a Game Icon (Logo Image)</h4>
                        <div class="space-y-3 text-gray-300 text-sm">
                            <p><strong>What's a game icon?</strong> A small square image (usually 100x100 or 200x200 pixels) that represents your game. It's like the game's logo.</p>
                            <p><strong>Where do you get one?</strong> You can:</p>
                            <ul class="ml-6 space-y-2 mt-2">
                                <li>• Find one on the game's official page (usually in the header)</li>
                                <li>• Use the game's logo if it has one</li>
                                <li>• Create a simple one yourself using Canva.com (it's free and easy)</li>
                                <li>• Screenshot the game's title screen and crop it</li>
                            </ul>
                            <p class="pt-3">In the "Icon Link (Logo Image)" field, paste the URL to the image:</p>
                            <div class="bg-gray-900 p-3 rounded mt-2 border-l-4 border-blue-400 text-xs font-mono">
                                Example: https://example.com/game-icon.png
                            </div>
                            <p class="pt-3"><strong>Pro tip:</strong> The image should be square-shaped and at least 100 pixels wide. Anything too tiny will look blurry.</p>
                        </div>
                    </div>

                    <div class="bg-white/5 p-6 rounded border border-white/10 hover:bg-white/10 transition">
                        <h4 class="text-lg font-bold text-white mb-3">Step 4: Add a Game Background (Hero Image)</h4>
                        <div class="space-y-3 text-gray-300 text-sm">
                            <p><strong>What's a background image?</strong> A larger, eye-catching image that shows up behind the game title when someone clicks on it. It's like the "cover" of the game.</p>
                            <p><strong>What makes a good background?</strong></p>
                            <ul class="ml-6 space-y-2 mt-2">
                                <li>• Wide (at least 800 pixels wide, ideally 1200+)</li>
                                <li>• Shows the game in action or something exciting about it</li>
                                <li>• Visually interesting so people want to play</li>
                                <li>• Not blurry or too small</li>
                            </ul>
                            <p className="pt-3"><strong>Where to find one:</strong></p>
                            <ul class="ml-6 space-y-2 mt-2">
                                <li>• Screenshot from the game itself (gameplay or main menu)</li>
                                <li>• The game's official website or banner</li>
                                <li>• Steam store page if the game is on Steam</li>
                                <li>• Itch.io game page (usually has nice cover images)</li>
                            </ul>
                            <p class="pt-3">Paste the image URL in the "Background Link (Hero Image)" field:</p>
                            <div class="bg-gray-900 p-3 rounded mt-2 border-l-4 border-blue-400 text-xs font-mono">
                                Example: https://example.com/game-hero.jpg
                            </div>
                        </div>
                    </div>

                    <div class="bg-white/5 p-6 rounded border border-white/10 hover:bg-white/10 transition">
                        <h4 class="text-lg font-bold text-white mb-3">Step 5: Add Game Details & Save</h4>
                        <div class="space-y-3 text-gray-300 text-sm">
                            <p><strong>Fill in the remaining fields:</strong></p>
                            <ul class="ml-6 space-y-2 mt-2">
                                <li>• <strong>Display Title:</strong> The name of the game (what people see)</li>
                                <li>• <strong>Type:</strong> Is it a Game, Media, or Browser tool?</li>
                                <li>• <strong>Description:</strong> A short summary (1-2 sentences explaining what the game is about)</li>
                            </ul>
                            <p class="pt-3"><strong>When you're done:</strong> Click the "Add to Catalog" button. The game will appear on your platform!</p>
                            <p class="pt-3 border-t border-white/10 mt-4"><strong>Editing existing games:</strong> Go to the "Manage Catalog" section below, click Edit on any game, make your changes, then click "Save Changes".</p>
                        </div>
                    </div>

                    <div class="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded">
                        <p class="text-yellow-300 text-sm"><i class="fas fa-star mr-2"></i><strong>Quick Reminder:</strong> Always test that game links work before adding them. No broken games on your platform!</p>
                    </div>
                </div>
            `;
        }

function emptyFirestoreQuerySnapshot() {
            return { get empty() { return true; }, size: 0, docs: [], forEach(fn) {} };
        }

        function emptyFirestoreDocSnapshot() {
            return { exists: false, data: () => ({}) };
        }

        async function firestoreSafeQuery(getPromise, label = 'query') {
            try {
                return await getPromise;
            } catch (e) {
                console.warn(`[Admin] Firestore ${label} unavailable:`, e?.code || e?.message || e);
                return emptyFirestoreQuerySnapshot();
            }
        }

        async function firestoreSafeDoc(getPromise, label = 'doc') {
            try {
                return await getPromise;
            } catch (e) {
                console.warn(`[Admin] Firestore ${label} unavailable:`, e?.code || e?.message || e);
                return emptyFirestoreDocSnapshot();
            }
        }

        // --- Statistics Dashboard ---
        async function loadAdminStats() {
            if (userRole !== 'owner' && userRole !== 'mod') return;
            const content = document.getElementById('admin-content');
            content.innerHTML = '<div class="text-center p-8"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i><div class="text-gray-500 mt-3">Crunching numbers...</div></div>';

            try {
                const [gSnap, mSnap, bSnap, viewerSnap, clickSnap] = await Promise.all([
                    firestoreSafeQuery(db.collection('games').get(), 'games'),
                    firestoreSafeQuery(db.collection('media').get(), 'media'),
                    firestoreSafeQuery(db.collection('browsers').get(), 'browsers'),
                    firestoreSafeDoc(db.collection('stats').doc('viewers').get(), 'stats/viewers'),
                    firestoreSafeDoc(db.collection('stats').doc('gameClicks').get(), 'stats/gameClicks')
                ]);

                const localG = rawGameData.filter(g => g.type === 'games').length;
                const localM = rawGameData.filter(g => g.type === 'media').length;
                const localB = rawGameData.filter(g => g.type === 'browsers').length;

                const totalGames = gSnap.size + localG;
                const totalMedia = mSnap.size + localM;
                const totalBrowsers = bSnap.size + localB;
                const totalApps = totalGames + totalMedia + totalBrowsers;

                const viewerData = viewerSnap.exists ? viewerSnap.data() : {};
                const clickData = clickSnap.exists ? clickSnap.data() : {};

                const deviceKeys = Object.keys(viewerData).filter(k => k.startsWith('dev_'));
                const uniqueViewers = deviceKeys.length;
                const totalPageViews = viewerData._totalViews || 0;
                const totalClicks = clickData._totalClicks || 0;

                let mostClickedTitle = 'None';
                let mostClickedCount = 0;
                const topGames = Object.entries(clickData)
                    .filter(([k]) => !k.startsWith('_'))
                    .map(([id, clicks]) => {
                        const title = getMergedCatalog().find(g => g.id === id)?.title || id;
                        if (clicks > mostClickedCount) {
                            mostClickedCount = clicks;
                            mostClickedTitle = title;
                        }
                        return { title, clicks };
                    })
                    .sort((a, b) => b.clicks - a.clicks)
                    .slice(0, 5);

                const maxClicks = topGames.length ? topGames[0].clicks : 1;

                let topGamesHtml = '';
                if (topGames.length) {
                    topGamesHtml = `
                        <div class="mb-6">
                            <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <i class="fas fa-fire text-orange-500"></i> Most Launched Experience
                            </div>
                            <div class="space-y-2">
                                ${topGames.map((g, i) => {
                                    const pct = Math.round((g.clicks / maxClicks) * 100);
                                    return `
                                        <div class="flex items-center gap-4 bg-white/5 border border-white/5 rounded-2xl px-5 py-3 hover:bg-white/10 transition-all group">
                                            <div class="text-xl font-black text-white/20 group-hover:text-blue-400/40 transition">${i+1}</div>
                                            <div class="flex-1 min-w-0">
                                                <div class="flex justify-between items-baseline mb-1">
                                                    <div class="text-sm font-bold truncate text-gray-200">${escapeHtml(g.title)}</div>
                                                    <div class="text-xs font-black text-blue-400/60">${g.clicks} <span class="text-[9px] opacity-40">runs</span></div>
                                                </div>
                                                <div class="h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 shadow-[0_0_10px_rgba(52,211,255,0.3)]" style="width:${pct}%"></div>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }

                let devicesHtml = deviceKeys.slice(0, 8).map(k => {
                    const d = viewerData[k] || {};
                    const time = d.lastSeen ? (d.lastSeen.toDate ? d.lastSeen.toDate() : new Date(d.lastSeen)) : new Date();
                    const timeStr = time.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
                    return `
                        <div class="flex items-center justify-between bg-white/5 px-4 py-3 rounded-xl border border-white/5 hover:border-white/10 transition">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-desktop text-xs opacity-30"></i>
                                <span class="text-[11px] font-medium text-gray-300 truncate max-w-[140px]">${escapeHtml(d.screen || 'Desktop')}</span>
                            </div>
                            <span class="text-[9px] font-black text-gray-500 uppercase tracking-tighter">${timeStr}</span>
                        </div>
                    `;
                }).join('');

                content.innerHTML = `
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <div class="bg-gradient-to-br from-blue-600/20 to-blue-900/5 border border-blue-500/20 rounded-3xl p-6 relative overflow-hidden group">
                            <i class="fas fa-layer-group absolute -right-4 -bottom-4 text-7xl opacity-5 group-hover:scale-110 transition-transform duration-700"></i>
                            <div class="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Inventory Depth</div>
                            <div class="text-5xl font-black text-white mb-2 leading-none">${totalApps}</div>
                            <div class="text-[10px] text-gray-500 font-bold">${totalGames} Games · ${totalMedia} Media · ${totalBrowsers} Browsers</div>
                        </div>
                        <div class="bg-gradient-to-br from-emerald-600/20 to-emerald-900/5 border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden group">
                            <i class="fas fa-fingerprint absolute -right-4 -bottom-4 text-7xl opacity-5 group-hover:scale-110 transition-transform duration-700"></i>
                            <div class="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Global Impact</div>
                            <div class="text-5xl font-black text-white mb-2 leading-none">${uniqueViewers}</div>
                            <div class="text-[10px] text-gray-500 font-bold">${totalClicks} Interactions · ${totalPageViews} Views</div>
                        </div>
                    </div>
                    ${topGamesHtml}
                    <div class="mt-8 pt-6 border-t border-white/5">
                        <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <i class="fas fa-terminal text-blue-500"></i> Real-time Telemetry
                        </div>
                        <div class="grid grid-cols-2 gap-2">${devicesHtml || '<div class="text-xs text-gray-500 col-span-2">No viewer telemetry (check Firestore rules for <code class="text-gray-400">stats/viewers</code>).</div>'}</div>
                    </div>
                    <p class="text-[10px] text-gray-600 mt-4 leading-relaxed">If counts look low, your rules may block some reads; catalog totals still include embedded titles. Open the browser console for <code class="text-gray-500">[Admin] Firestore</code> warnings.</p>
                `;
            } catch (e) {
                console.error('Stats load error:', e);
                content.innerHTML = `<div class="text-red-300 text-center p-8 space-y-2">
                    <div><i class="fas fa-exclamation-triangle mr-2"></i>Statistics UI failed to render.</div>
                    <div class="text-xs text-gray-500 font-mono break-all">${escapeHtml(String(e?.message || e))}</div>
                </div>`;
            }
        }
