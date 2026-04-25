const WxterState = {
            activeConversationId: null,
            busy: false,
            conversations: [],
            endpoint: WxterConfig.defaultEndpoint,
            files: [],
            lastHealthCheckAt: 0
        };

        function loadWxterEndpointForCurrentAccount() {
            const savedWxterEndpoint = (getAccountScopedStorageItem(WxterConfig.endpointStorageKey) || '')
                .trim()
                .replace(/\/$/, '');
            const useDefaultWxterEndpoint = !savedWxterEndpoint || WxterConfig.legacyEndpoints.includes(savedWxterEndpoint);

            WxterState.endpoint = useDefaultWxterEndpoint ? WxterConfig.defaultEndpoint : savedWxterEndpoint;
            if (useDefaultWxterEndpoint) {
                setAccountScopedStorageItem(WxterConfig.endpointStorageKey, WxterState.endpoint);
            }
            return WxterState.endpoint;
        }

        const wxterWaterBackground = [
            'radial-gradient(ellipse 90% 55% at 50% -8%, rgba(94, 234, 212, 0.18), transparent 52%)',
            'radial-gradient(circle at 14% 22%, rgba(52, 211, 255, 0.22), transparent 26%)',
            'radial-gradient(circle at 88% 12%, rgba(45, 212, 191, 0.14), transparent 30%)',
            'radial-gradient(circle at 72% 88%, rgba(11, 103, 130, 0.35), transparent 42%)',
            'linear-gradient(168deg, #010a10 0%, #02131f 28%, #062a3d 52%, #0b6782 78%, #0a4d5c 100%)'
        ].join(', ');

        const renderModes = ['about-blank', 'blob', 'data-url', 'direct', 'iframe'];
        let scrollSensitivity = 1;
        let gameRenderMode = 'about-blank';

        function isWxterCategory() {
            return currentCategory === 'wxter';
        }

        function isIdeCategory() {
            return currentCategory === 'ide';
        }

        function isWorkspaceCategory(category = currentCategory) {
            return ['wxter', 'ide', 'support'].includes(category);
        }

        function formatFileSize(bytes = 0) {
            if (!bytes) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB'];
            let value = bytes;
            let unitIndex = 0;
            while (value >= 1024 && unitIndex < units.length - 1) {
                value /= 1024;
                unitIndex += 1;
            }
            return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
        }

        function computeWxterConversationTitle(messages = []) {
            const firstUserMessage = messages.find(message => message.role === 'user' && String(message.content || '').trim());
            if (!firstUserMessage) return 'New chat';

            const clean = String(firstUserMessage.content).replace(/\s+/g, ' ').trim();
            return clean.length > 34 ? `${clean.slice(0, 34).trim()}...` : clean;
        }

        function getWxterConversationPreview(conversation) {
            const lastMessage = [...(conversation.messages || [])].reverse().find(message => !message.pending && String(message.content || '').trim());
            if (!lastMessage) return 'Empty thread';

            const preview = String(lastMessage.content).replace(/\s+/g, ' ').trim();
            return preview.length > 38 ? `${preview.slice(0, 38).trim()}...` : preview;
        }

        function createWxterConversation(seedMessages = []) {
            return {
                id: `wxter-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                messages: seedMessages.map(({ role, content }) => ({ role, content })),
                title: computeWxterConversationTitle(seedMessages),
                updatedAt: Date.now()
            };
        }

        function getActiveWxterConversation() {
            let conversation = WxterState.conversations.find(entry => entry.id === WxterState.activeConversationId);
            if (!conversation) {
                conversation = createWxterConversation();
                WxterState.conversations = [conversation, ...WxterState.conversations];
                WxterState.activeConversationId = conversation.id;
            }
            return conversation;
        }

        function persistWxterConversations() {
            const serializable = WxterState.conversations.map(conversation => ({
                id: conversation.id,
                title: computeWxterConversationTitle(conversation.messages),
                updatedAt: conversation.updatedAt || Date.now(),
                messages: (conversation.messages || [])
                    .filter(message => !message.pending)
                    .map(({ role, content }) => ({ role, content }))
            }));

            setAccountScopedStorageItem(WxterConfig.threadsStorageKey, JSON.stringify(serializable));
            setAccountScopedStorageItem(WxterConfig.activeThreadStorageKey, WxterState.activeConversationId || '');
            setAccountScopedStorageItem(WxterConfig.endpointStorageKey, WxterState.endpoint);
        }

        function loadWxterConversations() {
            loadWxterEndpointForCurrentAccount();
            try {
                const storedThreads = JSON.parse(getAccountScopedStorageItem(WxterConfig.threadsStorageKey) || '[]');
                if (Array.isArray(storedThreads) && storedThreads.length) {
                    WxterState.conversations = storedThreads.map(thread => ({
                        id: String(thread.id || `wxter-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
                        messages: Array.isArray(thread.messages)
                            ? thread.messages
                                .filter(message => message && typeof message === 'object')
                                .map(message => ({
                                    role: message.role === 'user' ? 'user' : 'assistant',
                                    content: String(message.content || '')
                                }))
                            : [],
                        title: String(thread.title || 'New chat'),
                        updatedAt: Number(thread.updatedAt) || Date.now()
                    }));
                }
            } catch {}

            if (!WxterState.conversations.length) {
                WxterState.conversations = [createWxterConversation()];
            }

            const savedActiveThread = getAccountScopedStorageItem(WxterConfig.activeThreadStorageKey);
            const existingActive = WxterState.conversations.find(thread => thread.id === savedActiveThread);
            WxterState.activeConversationId = existingActive ? existingActive.id : WxterState.conversations[0].id;
            persistWxterConversations();
        }

        function updateWxterStatus(text) {
            if (wxterElements.statusText) {
                wxterElements.statusText.textContent = text;
            }
        }        function renderWxterHeader() {
            if (!wxterElements.header || !wxterElements.chatTitle || !wxterElements.newChatButton || !wxterElements.deleteChatButton) return;

            const conversation = getActiveWxterConversation();
            wxterElements.chatTitle.textContent = computeWxterConversationTitle(conversation.messages);

            wxterElements.newChatButton.onclick = createNewWxterChat;
            wxterElements.deleteChatButton.onclick = () => deleteWxterConversation(conversation.id);
        }
        function renameWxterConversation(conversationId) {
            const conversation = WxterState.conversations.find(c => c.id === conversationId);
            if (!conversation) return;

            showWxterPrompt('Rename Chat', 'Enter a new title for this conversation:', conversation.title || computeWxterConversationTitle(conversation.messages), (newTitle) => {
                if (newTitle && newTitle.trim()) {
                    conversation.title = newTitle.trim();
                    persistWxterConversations();
                renderWxterHeader();
                renderWxterMessages();
                    showToast('Chat renamed.');
                }
            });
        }

        function deleteWxterConversation(conversationId) {
            showWxterConfirm('Delete Chat', 'Are you sure you want to permanently delete this conversation?', () => {
                WxterState.conversations = WxterState.conversations.filter(c => c.id !== conversationId);
                if (WxterState.activeConversationId === conversationId) {
                    WxterState.activeConversationId = WxterState.conversations[0]?.id || null;
                }
                
                persistWxterConversations();
                renderWxterHeader();
                renderWxterMessages();
                showToast('Conversation deleted.');
            });
        }
        
        /* --- Custom Wxter Dialog System --- */
        let wxterDialogCallback = null;
        let wxterDialogCancelCallback = null;
        
        function showWxterConfirm(title, desc, onConfirm, onCancel = null) {
            document.getElementById('wxter-dialog-title').textContent = title;
            document.getElementById('wxter-dialog-desc').textContent = desc;
            document.getElementById('wxter-dialog-input-wrap').classList.add('hidden');
            document.getElementById('wxter-dialog').classList.add('active');
            wxterDialogCallback = onConfirm;
            wxterDialogCancelCallback = onCancel;
            document.getElementById('wxter-dialog-confirm-btn').onclick = () => {
                const confirmCallback = wxterDialogCallback;
                wxterDialogCallback = null;
                wxterDialogCancelCallback = null;
                closeWxterDialog(false);
                if (confirmCallback) confirmCallback();
            };
        }
        
        function showWxterPrompt(title, desc, defaultValue, onConfirm, onCancel = null) {
            document.getElementById('wxter-dialog-title').textContent = title;
            document.getElementById('wxter-dialog-desc').textContent = desc;
            document.getElementById('wxter-dialog-input-wrap').classList.remove('hidden');
            const input = document.getElementById('wxter-dialog-input');
            input.value = defaultValue;
            document.getElementById('wxter-dialog').classList.add('active');
            input.focus();
            input.select();
            
            wxterDialogCallback = onConfirm;
            wxterDialogCancelCallback = onCancel;
            document.getElementById('wxter-dialog-confirm-btn').onclick = () => {
                const confirmCallback = wxterDialogCallback;
                const value = input.value;
                wxterDialogCallback = null;
                wxterDialogCancelCallback = null;
                closeWxterDialog(false);
                if (confirmCallback) confirmCallback(value);
            };
            
            // Handle Enter key in prompt
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const confirmCallback = wxterDialogCallback;
                    const value = input.value;
                    wxterDialogCallback = null;
                    wxterDialogCancelCallback = null;
                    closeWxterDialog(false);
                    if (confirmCallback) confirmCallback(value);
                }
            };
        }
        
        function closeWxterDialog(invokeCancel = true) {
            document.getElementById('wxter-dialog').classList.remove('active');
            document.getElementById('wxter-dialog-input').onkeydown = null;
            const cancelCallback = invokeCancel ? wxterDialogCancelCallback : null;
            wxterDialogCallback = null;
            wxterDialogCancelCallback = null;
            if (cancelCallback) cancelCallback();
        }

        function requestWxterConfirm(title, desc) {
            return new Promise(resolve => {
                showWxterConfirm(title, desc, () => resolve(true), () => resolve(false));
            });
        }

        function requestWxterPrompt(title, desc, defaultValue = '') {
            return new Promise(resolve => {
                showWxterPrompt(title, desc, defaultValue, value => resolve(value), () => resolve(null));
            });
        }

        function extractWxterThoughts(content) {
            const thoughts = [];
            const thinkRegex = /<think>(.*?)<\/think>/gs;
            let match;

            while ((match = thinkRegex.exec(content)) !== null) {
                thoughts.push({
                    type: 'think',
                    text: match[1].trim(),
                    is_loading: false
                });
            }
            return thoughts;
        }

        function renderWxterMessages() {
            if (!wxterElements.messageList || !wxterElements.chatTitle) return;

            const conversation = getActiveWxterConversation();

            if (!conversation.messages.length) {
                wxterElements.messageList.innerHTML = `
                    <div class="wxter-empty-state">
                        <div>
                            <p class="wxter-kicker">Quiet water</p>
                            <h3 style="margin:0 0 10px;font-family:'Baloo 2','Inter',sans-serif;">Start a chat</h3>
                            <p class="wxter-brand-copy">Ask Wxter something or attach files. That is the whole surface now.</p>
                        </div>
                    </div>
                `;
                return;
            }

            wxterElements.messageList.innerHTML = conversation.messages.map(message => {
                const role = message.role === 'user' ? 'user' : 'assistant';
                const label = role === 'user' ? (currentUser?.displayName || 'You') : 'Wxter AI';
                
                let text = message.pending 
                    ? `<div class="wxter-typing"><span></span><span></span><span></span></div>` 
                    : parseWxterMarkdown(message.content || '');

                return `
                    <div class="wxter-message wxter-message--${role}">
                        <div class="wxter-message-content">
                            <span class="wxter-message-role">${label}</span>
                            <div class="wxter-message-text">${text}</div>
                        </div>
                    </div>
                `;
            }).join('');

            renderWxterThoughts();

            // Scroll to bottom
            if (WxterState.shouldScrollToBottom) {
                wxterElements.messageList.scrollTop = wxterElements.messageList.scrollHeight;
                WxterState.shouldScrollToBottom = false;
            }
        }

        function renderWxterThoughts() {
            if (!wxterElements.thoughtProcessFeed) return;

            const conversation = getActiveWxterConversation();
            const thoughts = conversation.thoughts || [];

            wxterElements.thoughtProcessFeed.innerHTML = thoughts.map((thought, index) => {
                const isCollapsed = true;
                const chevronClass = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
                const contentDisplay = isCollapsed ? 'none' : 'block';

                return `
                    <div class="wxter-thought-row">
                        <div class="wxter-thought-header" onclick="toggleWxterThought(event, ${index})">
                            <i class="fas ${chevronClass} wxter-thought-chevron"></i>
                            <span class="wxter-thought-text">${escapeHtml(thought.text)}</span>
                            ${thought.is_loading ? '<i class="fas fa-spinner fa-spin wxter-thought-spinner"></i>' : ''}
                        </div>
                        <div class="wxter-thought-content" style="display: ${contentDisplay};">
                            <p>${escapeHtml(thought.text)}</p> 
                        </div>
                    </div>
                `;
            }).join('');
        }

        function toggleWxterThought(event, index) {
            const header = event.currentTarget;
            const content = header.nextElementSibling;
            const chevron = header.querySelector('.wxter-thought-chevron');

            if (content.style.display === 'none') {
                content.style.display = 'block';
                chevron.classList.remove('fa-chevron-right');
                chevron.classList.add('fa-chevron-down');
            } else {
                content.style.display = 'none';
                chevron.classList.remove('fa-chevron-down');
                chevron.classList.add('fa-chevron-right');
            }
        }

        function renderWxterFiles() {
            if (!wxterElements.fileChips) return;

            if (!WxterState.files.length) {
                wxterElements.fileChips.innerHTML = '';
                wxterElements.fileChips.style.display = 'none';
                return;
            }

            wxterElements.fileChips.style.display = 'flex';
            wxterElements.fileChips.innerHTML = WxterState.files.map((item, index) => {
                const fileNameParts = item.name.split('.');
                const languageBadge = fileNameParts.length > 1 ? fileNameParts.pop().toUpperCase() : 'FILE';
                const lineCount = item.summary || '...'; // Assuming summary might contain line count or is a placeholder

                return `
                    <div class="wxter-file-chip">
                        <span class="wxter-language-badge">${languageBadge}</span>
                        <span class="wxter-filename">${escapeHtml(item.name)}</span>
                        <span class="wxter-line-count">${lineCount}</span>
                        <button class="wxter-apply-edit-button" onclick="applyWxterFileEdit(${index})">Apply</button>
                        <button class="wxter-file-remove" onclick="removeWxterFile(${index})"><i class="fas fa-times"></i></button>
                    </div>
                `;
            }).join('');
        }

        function removeWxterFile(index) {
            WxterState.files.splice(index, 1);
            renderWxterFiles();
        }

        function applyWxterFileEdit(index) {
            const fileToApply = WxterState.files[index];
            if (fileToApply) {
                // Placeholder for actual IDE integration
                console.log(`Applying AI code to ${fileToApply.name}:`, fileToApply.content);
                showToast(`Applying changes to ${fileToApply.name}... (Simulated)`);
                // In a real scenario, you would call a VS Code API here to apply the changes.
                // For example: ideApplyAiCode(fileToApply.name, fileToApply.content);
                // After applying, you might want to remove the file chip:
                removeWxterFile(index);
            }
        }

        // Placeholder for ideApplyAiCode, assuming it would be provided by the IDE context
        function ideApplyAiCode(filename, content) {
            console.log(`IDE applying code to ${filename}:\n${content}`);
            showToast(`Applied changes to ${filename}`);
        }

        function applyWxterBackground() {
            bgOverlay.style.setProperty('--new-bg', wxterWaterBackground);
            bgOverlay.classList.add('transitioning');
            setTimeout(() => {
                bgOverlay.style.setProperty('--current-bg', wxterWaterBackground);
                bgOverlay.classList.remove('transitioning');
            }, 450);
        }

        function syncWxterVisibility() {
            const isWxterActive = isWxterCategory();
            const isIdeActive = isIdeCategory();
            document.body.classList.toggle('wxter-mode', isWxterActive);
            document.body.classList.toggle('ide-mode', isIdeActive);
            if (mainStage) mainStage.classList.toggle('wxter-mode', isWxterActive);
            wxterWorkspace.classList.toggle('hidden', !isWxterActive);
            launcherStrip.style.display = (isWxterActive || isIdeActive) ? 'none' : '';
            gameInfo.style.display = (isWxterActive || isIdeActive) ? 'none' : '';

            if (isWxterActive) {
                applyWxterBackground();
                renderWxterHeader();
                renderWxterMessages();
                renderWxterFiles();

                if (!WxterState.lastHealthCheckAt || (Date.now() - WxterState.lastHealthCheckAt) > 30000) {
                    probeWxterHealth(true);
                }
                const roleBadge = (userRole === 'owner' || (currentUser?.displayName || '').toLowerCase() === 'james') ? 'OWNER (Creator Mode)' : userRole.toUpperCase();
                updateWxterStatus(`Connected to ${WxterState.endpoint} · Mode: ${roleBadge}`);
            }

            if (isIdeActive) {
                requestAnimationFrame(() => {
                    if (isIdeCategory()) {
                        openIde().catch(error => {
                            console.error('IDE open failed', error);
                            showToast('VS Code failed to initialize.');
                        });
                    }
                });
            }

            syncLauncherCompactMode();
        }

        function createNewWxterChat() {
            const conversation = createWxterConversation();
            WxterState.conversations = [conversation, ...WxterState.conversations];
            WxterState.activeConversationId = conversation.id;
            persistWxterConversations();
            renderWxterHeader();
            renderWxterMessages();
            wxterElements.input.focus();
        }

        function selectWxterConversation(conversationId) {
            if (!WxterState.conversations.some(conversation => conversation.id === conversationId)) return;
            WxterState.activeConversationId = conversationId;
            persistWxterConversations();
            renderWxterHeader();
            renderWxterMessages();
        }

        function clearWxterFiles() {
            WxterState.files = [];
            if (wxterElements.fileInput) wxterElements.fileInput.value = '';
            renderWxterFiles();
        }

        function removeWxterFile(index) {
            WxterState.files.splice(index, 1);
            renderWxterFiles();
        }

        function handleWxterFiles(files) {
            const openSlots = Math.max(WxterConfig.maxQueuedFiles - WxterState.files.length, 0);
            const incoming = Array.from(files || []).slice(0, openSlots);
            if (!incoming.length) return;

            incoming.forEach(file => {
                WxterState.files.push({
                    file,
                    name: file.name,
                    summary: `${formatFileSize(file.size)}${file.type ? `, ${file.type}` : ''}`
                });
            });

            renderWxterFiles();
        }

        function handleWxterFileSelection(event) {
            handleWxterFiles(event?.target?.files || []);
            if (event?.target) event.target.value = '';
        }

        // --- Markdown & UI/UX Buffs ---
        function parseWxterMarkdown(input) {
            if (!input) return '';
            
            let html = input;
            
            // 1. Code blocks (```lang code ```)
            html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
                const displayLang = lang || 'code';
                const escapedCode = escapeHtml(code.trim());
                return `
                    <div class="wxter-code-block">
                        <div class="wxter-code-header">
                            <span>${displayLang}</span>
                            <button onclick="copyToClipboard(this)" class="hover:text-white transition">COPY</button>
                        </div>
                        <pre><code>${escapedCode}</code></pre>
                    </div>
                `;
            });

            // 2. Inline code (`code`)
            html = html.replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-[12px] font-mono">$1</code>');

            // 3. Bold (**bold**)
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            // 4. Italic (*italic*)
            html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            
            // 5. Line breaks
            html = html.replace(/\n/g, '<br>');

            return html;
        }

        function copyToClipboard(btn) {
            const code = btn.parentElement.nextElementSibling.innerText;
            navigator.clipboard.writeText(code).then(() => {
                const oldText = btn.textContent;
                btn.textContent = 'COPIED!';
                btn.classList.add('text-green-400');
                setTimeout(() => {
                    btn.textContent = oldText;
                    btn.classList.remove('text-green-400');
                }, 2000);
            });
        }

        // Auto-expand textarea
        if (wxterElements.input) {
            wxterElements.input.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
                if (this.scrollHeight > 250) {
                    this.style.overflowY = 'auto';
                } else {
                    this.style.overflowY = 'hidden';
                }
            });
        }

        async function probeWxterHealth(silent = false) {
            const base = (WxterState.endpoint || WxterConfig.defaultEndpoint).replace(/\/$/, '');
            const candidates = ['/health', '/api/health'];
            updateWxterStatus(`Checking ${base}...`);

            for (const path of candidates) {
                try {
                    const response = await fetch(`${base}${path}`, { method: 'GET' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const payload = await response.json().catch(() => ({}));
                    const ollama = payload.ollama || 'unknown';
                    WxterState.lastHealthCheckAt = Date.now();
                    updateWxterStatus(`Connected to ${base} · Ollama ${ollama}`);
                    if (!silent) showToast('Wxter backend is online.');
                    return true;
                } catch {}
            }

            WxterState.lastHealthCheckAt = Date.now();
            updateWxterStatus(`Backend offline at ${base}`);
            if (!silent) showToast('Wxter backend is offline.');
            return false;
        }

        function buildWxterFormData(prompt, history = []) {
            const formData = new FormData();
            
            formData.append('message', prompt);
            formData.append('history', JSON.stringify(history));
            const currentRole = (userRole === 'owner' || (currentUser?.displayName || '').toLowerCase() === 'james') ? 'owner' : userRole;
            formData.append('username', (currentUser?.displayName || 'User'));
            formData.append('role', currentRole);
            WxterState.files.forEach(item => formData.append('files', item.file, item.name));
            return formData;
        }

        async function requestWxterBackend(prompt) {
            const base = (WxterState.endpoint || WxterConfig.defaultEndpoint).replace(/\/$/, '');
            const endpoints = ['/api/wxter/chat', '/api/chat', '/chat'];
            let lastError = new Error('No backend endpoints responded.');

            for (const path of endpoints) {
                try {
                    const response = await fetch(`${base}${path}`, {
                        method: 'POST',
                        body: buildWxterFormData(prompt)
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const payload = await response.json();
                        return payload.answer || payload.response || payload.message || payload.output || JSON.stringify(payload, null, 2);
                    }

                    return await response.text();
                } catch (error) {
                    lastError = error;
                }
            }

            throw lastError;
        }

        function buildWxterFallback(prompt, error) {
            const files = WxterState.files.length
                ? `Files queued: ${WxterState.files.map(item => `${item.name} (${item.summary})`).join(', ')}.`
                : 'No files were queued.';

            return [
                'Wxter could not reach the local backend.',
                '',
                `Endpoint: ${WxterState.endpoint}`,
                `Reason: ${error?.message || 'Unknown network error.'}`,
                '',
                files,
                '',
                `Prompt: "${prompt}"`
            ].join('\n');
        }

        function setWxterBusy(isBusy) {
            WxterState.busy = isBusy;
            wxterElements.sendButton.disabled = isBusy;
            wxterElements.sendButton.textContent = isBusy ? 'Thinking' : 'Send';
            if (isBusy) updateWxterStatus('Wxter is thinking...');
        }

        async function submitWxterPrompt() {
            if (WxterState.busy) return;

            const typedPrompt = wxterElements.input.value.trim();
            const prompt = typedPrompt || (WxterState.files.length ? 'Summarize the attached files.' : '');
            if (!prompt) {
                showToast('Type something or attach a file first.');
                return;
            }

        const conversation = getActiveWxterConversation();
            
            // Capture history BEFORE we push current message
            const history = (conversation.messages || [])
                .filter(m => !m.pending)
                .slice(-10)
                .map(m => ({ role: m.role, content: m.content }));

            conversation.messages.push({ role: 'user', content: prompt });
            conversation.messages.push({ role: 'assistant', content: 'Reading...', pending: true });
            conversation.updatedAt = Date.now();
            wxterElements.input.value = '';

            renderWxterHistory();
            renderWxterMessages();
            setWxterBusy(true);

            try {
                const formData = buildWxterFormData(prompt, history);
                const response = await fetch(`${WxterState.endpoint}/api/wxter/chat`, {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                const responseText = data.answer;
                const extractedThoughts = extractWxterThoughts(responseText);
                conversation.thoughts = conversation.thoughts ? [...conversation.thoughts, ...extractedThoughts] : [...extractedThoughts];
                const cleanedResponseText = responseText.replace(/<think>(.*?)<\/think>/gs, '').trim();
                const pendingMessage = conversation.messages.find(message => message.pending);
                if (pendingMessage) {
                    pendingMessage.content = cleanedResponseText || 'The backend returned an empty response.';
                    pendingMessage.pending = false;
                }
                updateWxterStatus(`Connected to ${WxterState.endpoint}`);
            } catch (error) {
                const pendingMessage = conversation.messages.find(message => message.pending);
                if (pendingMessage) {
                    pendingMessage.content = buildWxterFallback(prompt, error);
                    pendingMessage.pending = false;
                }
                updateWxterStatus(`Backend offline at ${WxterState.endpoint}`);
            } finally {
                conversation.title = computeWxterConversationTitle(conversation.messages);
                conversation.updatedAt = Date.now();
                persistWxterConversations();
                renderWxterHeader();
                renderWxterMessages();
                clearWxterFiles();
                setWxterBusy(false);
            }
        }

        function initWxter() {
            loadWxterConversations();
            renderWxterHeader();
            renderWxterMessages();
            renderWxterFiles();
            updateWxterStatus(`Backend offline at ${WxterState.endpoint}`);

            wxterElements.input.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitWxterPrompt();
                }
            });

            wxterWorkspace.addEventListener('dragover', event => {
                if (!isWxterCategory()) return;
                event.preventDefault();
            });
            wxterWorkspace.addEventListener('drop', event => {
                if (!isWxterCategory()) return;
                event.preventDefault();
                handleWxterFiles(event.dataTransfer?.files || []);
            });

            updateWxterSettingsIconVisibility(); // Initialize icon visibility
            probeWxterHealth(true);
        }

        async function handleAccountScopedStorageChange() {
            WxterState.activeConversationId = null;
            WxterState.busy = false;
            WxterState.conversations = [];
            WxterState.files = [];
            WxterState.lastHealthCheckAt = 0;
            loadWxterConversations();
            loadClickerState();

            const wxterEndpointInput = document.getElementById('wxter-api-endpoint');
            if (wxterEndpointInput) {
                wxterEndpointInput.value = WxterState.endpoint;
            }

            if (isWxterCategory()) {
                renderWxterHeader();
                renderWxterMessages();
                renderWxterFiles();
                syncWxterVisibility();
                updateWxterSettingsIconVisibility(); // Update icon on login/logout
            }

            IdeState.ideWxterThreads = [];
            IdeState.ideWxterActiveId = null;
            ideResetWorkspaceSession();
            IdeState.db = null;

            if (currentCategory === 'ide') {
                await openIde();
            }
        }

        // ============ WXTER PERSONA SETTINGS ============
        async function loadWxterPersonaSettings() {
            try {
                const base = (WxterState.endpoint || WxterConfig.defaultEndpoint).replace(/\/$/, '');
                
                // Load profile settings
                const profileResponse = await fetch(`${base}/api/settings/profile`);
                const profileData = profileResponse.ok ? await profileResponse.json() : {};
                
                // Load instruction settings
                const instrResponse = await fetch(`${base}/api/settings/instructions`);
                const instrData = instrResponse.ok ? await instrResponse.json() : {};
                
                // Populate form fields
                const nameInput = document.getElementById('wxter-profile-name');
                const bioInput = document.getElementById('wxter-profile-bio');
                const roleSelect = document.getElementById('wxter-profile-role');
                const instrInput = document.getElementById('wxter-instructions');
                const personalityToggle = document.getElementById('wxter-personality-toggle');
                
                if (nameInput) nameInput.value = profileData.name || 'User';
                if (bioInput) bioInput.value = profileData.bio || '';
                
                // Set role from Firebase (read-only or disabled for non-owners)
                const actualRole = userRole || 'user';
                if (roleSelect) {
                    roleSelect.value = actualRole;
                    // Disable role selection for non-owners
                    if (userRole !== 'owner') {
                        roleSelect.disabled = true;
                        roleSelect.title = 'Your Firebase role is: ' + actualRole;
                    } else {
                        roleSelect.disabled = false;
                        roleSelect.title = 'As an owner, you can assign roles';
                    }
                }
                
                if (instrInput) instrInput.value = instrData.instructions || '';
                if (personalityToggle) personalityToggle.checked = instrData.personality_enabled !== false;
                
                showToast('Settings loaded.');
            } catch (error) {
                console.error('Failed to load settings:', error);
                showToast('Could not load settings from backend.');
            }
        }

        async function saveWxterPersonaSettings() {
            try {
                const base = (WxterState.endpoint || WxterConfig.defaultEndpoint).replace(/\/$/, '');
                
                // Get form values
                const name = (document.getElementById('wxter-profile-name') || {}).value?.trim() || 'User';
                const bio = (document.getElementById('wxter-profile-bio') || {}).value?.trim() || '';
                const instructions = (document.getElementById('wxter-instructions') || {}).value?.trim() || '';
                const personalityEnabled = (document.getElementById('wxter-personality-toggle') || {}).checked ?? true;
                
                // ALWAYS use actual Firebase role - never allow user to pick owner/admin
                const role = userRole || 'user';
                
                // Validate
                if (!name || name.length < 1) {
                    showToast('Please enter a name.');
                    return;
                }
                
                if (name.length > 100) {
                    showToast('Name is too long (max 100 characters).');
                    return;
                }
                
                // Save profile with actual role from Firebase
                const profileReq = await fetch(`${base}/api/settings/profile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        bio,
                        role  // Always use Firebase role
                    })
                });
                
                if (!profileReq.ok) {
                    showToast('Failed to save profile.');
                    return;
                }
                
                // Save instructions
                const instrReq = await fetch(`${base}/api/settings/instructions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instructions,
                        personality_enabled: personalityEnabled
                    })
                });
                
                if (!instrReq.ok) {
                    showToast('Failed to save instructions.');
                    return;
                }
                
                showToast('✓ Settings saved! Changes take effect on your next message to Wxter.');
                closeModals();
            } catch (error) {
                console.error('Settings save error:', error);
                showToast('Error saving settings.');
            }
        }

        function updateWxterSettingsIconVisibility() {
            const icon = document.getElementById('wxter-settings-icon');
            if (!icon) return;
            // Only show the blue settings icon when on Wxter tab
            icon.style.display = isWxterCategory() ? 'block' : 'none';
        }
