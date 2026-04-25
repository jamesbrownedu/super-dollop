let selectedSupportType = 'bug';
        let selectedSupportTags = new Set();

        function selectSupportType(type) {
            selectedSupportType = type;
            document.querySelectorAll('.support-type-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === type);
            });
        }

        function toggleSupportTag(tag) {
            const btn = document.querySelector(`.support-tag-btn[data-tag="${tag}"]`);
            if (selectedSupportTags.has(tag)) {
                selectedSupportTags.delete(tag);
                if (btn) btn.classList.remove('active');
            } else {
                selectedSupportTags.add(tag);
                if (btn) btn.classList.add('active');
            }
        }

        function resetSupportForm() {
            selectedSupportType = 'bug';
            selectedSupportTags = new Set();
            document.querySelectorAll('.support-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'bug'));
            document.querySelectorAll('.support-tag-btn').forEach(b => b.classList.remove('active'));
            const desc = document.getElementById('support-description');
            if (desc) desc.value = '';
            const btn = document.getElementById('support-submit-btn');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i><span>Submit Report</span>'; }
        }

        function getSupportCooldownRemainingMs() {
            const lastSubmittedAt = Number(getAccountScopedStorageItem('supportLastSubmittedAt') || 0);
            if (!lastSubmittedAt) return 0;
            return Math.max(0, SUPPORT_TICKET_COOLDOWN_MS - (Date.now() - lastSubmittedAt));
        }

        function formatSupportDate(timestamp) {
            try {
                if (!timestamp) return 'Unknown';
                if (typeof timestamp.toDate === 'function') {
                    return timestamp.toDate().toLocaleString();
                }
                return new Date(timestamp).toLocaleString();
            } catch {
                return 'Unknown';
            }
        }

        function renderMySupportTickets(tickets = []) {
            const container = document.getElementById('support-my-reports');
            if (!container) return;
            if (!tickets.length) {
                container.innerHTML = '<div class="support-empty-state">No reports yet. Submit one above and it will appear here.</div>';
                return;
            }

            container.innerHTML = tickets.map(ticket => {
                const typeClass = normalizeSupportType(ticket.type);
                const statusClass = ticket.status === 'resolved' ? 'text-emerald-300' : 'text-amber-300';
                const statusLabel = ticket.status === 'resolved' ? 'Resolved' : 'Open';
                const tags = (ticket.tags || []).map(tag => `<span class="support-ticket-tag">#${escapeHtml(tag)}</span>`).join(' ');
                const replies = (ticket.replies || []).map(reply => `
                    <div class="support-report-reply">
                        <div class="text-[10px] uppercase tracking-[0.12em] text-sky-200/80 mb-1">${escapeHtml(reply.authorName || 'Admin')} • ${escapeHtml(formatSupportDate(reply.timestamp))}</div>
                        <div class="text-sm text-gray-100 whitespace-pre-wrap break-words">${escapeHtml(reply.body || '')}</div>
                    </div>
                `).join('');

                return `
                    <div class="support-report-card">
                        <div class="support-report-meta">
                            <span class="support-ticket-type ${typeClass}">${escapeHtml(typeClass.replace('-', ' '))}</span>
                            ${tags}
                            <span class="${statusClass}">${escapeHtml(statusLabel)}</span>
                            <span>${escapeHtml(formatSupportDate(ticket.timestamp))}</span>
                        </div>
                        <div class="text-sm text-white whitespace-pre-wrap break-words">${escapeHtml(ticket.description || '')}</div>
                        <div class="support-report-replies">
                            ${replies || '<div class="text-xs text-gray-500">No admin replies yet.</div>'}
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function loadMySupportTickets() {
            const container = document.getElementById('support-my-reports');
            if (!container) return;
            if (!db || !currentUser?.uid) {
                container.innerHTML = '<div class="support-empty-state">Sign in to see your previous reports.</div>';
                return;
            }

            container.innerHTML = '<div class="support-empty-state"><i class="fas fa-spinner fa-spin mr-2"></i>Loading your reports...</div>';
            try {
                const snapshot = await db.collection('support_tickets')
                    .where('userId', '==', currentUser.uid)
                    .get();

                const tickets = await Promise.all(snapshot.docs.map(async (doc) => {
                    let replies = [];
                    try {
                        const repliesSnap = await doc.ref.collection('replies').orderBy('timestamp', 'asc').limit(10).get();
                        replies = repliesSnap.docs.map(replyDoc => ({ id: replyDoc.id, ...replyDoc.data() }));
                    } catch (error) {
                        console.warn('Support replies load failed', doc.id, error);
                    }
                    return { id: doc.id, ...doc.data(), replies };
                }));

                tickets.sort((a, b) => {
                    const aTime = a.timestamp?.toMillis?.() || 0;
                    const bTime = b.timestamp?.toMillis?.() || 0;
                    return bTime - aTime;
                });
                renderMySupportTickets(tickets);
            } catch (error) {
                console.error('Support history error:', error);
                container.innerHTML = `<div class="support-empty-state">Could not load your reports.<div class="mt-2 text-[11px] text-gray-500">${escapeHtml(error.message || 'Unknown error')}</div></div>`;
            }
        }

        async function submitSupportTicket() {
            if (!db || !auth?.currentUser) {
                showToast('Sign in to submit support tickets and track replies.');
                return;
            }
            if (selectedSupportTags.size === 0) {
                showToast('Please select at least one tag.');
                return;
            }
            const description = document.getElementById('support-description')?.value?.trim();
            if (!description) {
                showToast('Please describe the issue.');
                return;
            }
            const cooldownRemainingMs = getSupportCooldownRemainingMs();
            if (cooldownRemainingMs > 0) {
                showToast(`Please wait ${Math.ceil(cooldownRemainingMs / 1000)}s before sending another report.`);
                return;
            }

            const btn = document.getElementById('support-submit-btn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Sending...</span>'; }

            try {
                const user = auth.currentUser;
                const displayedName = document.getElementById('username-display')?.textContent?.split('\n')[0]?.trim() || user?.displayName || 'Unknown';
                const timestamp = firebase.firestore.FieldValue.serverTimestamp();
                const ticketRef = db.collection('support_tickets').doc();
                const rateLimitRef = db.collection('supportRateLimits').doc(user.uid);
                const batch = db.batch();
                batch.set(ticketRef, {
                    type: normalizeSupportType(selectedSupportType),
                    tags: Array.from(selectedSupportTags),
                    description,
                    userId: user.uid,
                    username: displayedName,
                    email: user.email || '',
                    status: 'open',
                    timestamp
                });
                batch.set(rateLimitRef, {
                    userId: user.uid,
                    lastSubmittedAt: timestamp
                }, { merge: true });
                await batch.commit();
                setAccountScopedStorageItem('supportLastSubmittedAt', String(Date.now()));
                showToast('Report submitted! Admins will review it soon.');
                resetSupportForm();
                loadMySupportTickets();
            } catch (e) {
                console.error('Support ticket error:', e);
                showToast('Failed to submit. Please try again.');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i><span>Submit Report</span>'; }
            }
        }

        window.addEventListener('load', init);
