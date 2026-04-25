const IdeConfig = {
            dbName: 'WebCodeWorkspace',
            dbVersion: 1,
            storeName: 'files',
            workspaceStorageKey: 'ideWorkspaceFiles',
            legacyTemplateIds: ['seed-index-html', 'seed-styles-css', 'seed-app-js'],
            defaultFiles: []
        };

        const IdeWxterStorage = Object.freeze({
            key: 'ideWxterThreads',
            activeKey: 'ideWxterActiveThread'
        });

        const IdeState = {
            db: null,
            editor: null,
            activeFileId: null,
            openFiles: [],
            models: new Map(),
            sidebarMode: 'explorer',
            sidebarVisible: true,
            terminalVisible: true,
            sidebarWidth: 220,
            terminalHeight: 224,
            dirtyFiles: new Set(),
            terminalBootstrapped: false,
            contextMenuFileId: null,
            ideWxterThreads: [],
            ideWxterActiveId: null,
            editorReadyPromise: null,
            resizeHookBound: false,
            autoSave: true,
            formatOnSave: true,
            autoSaveDelay: 900,
            autoSaveTimer: null,
            suppressAutoSave: false,
            defaultLayoutApplied: false,
            paletteMode: null,
            paletteItems: [],
            paletteSelectedIndex: 0
        };

        function ideGuessLanguageFromFileName(fileName) {
            const ext = (String(fileName).split('.').pop() || '').toLowerCase();
            const map = {
                js: 'javascript', mjs: 'javascript', cjs: 'javascript',
                jsx: 'javascript',
                ts: 'typescript', tsx: 'typescript',
                json: 'json',
                html: 'html', htm: 'html',
                css: 'css', scss: 'scss', sass: 'scss', less: 'less',
                md: 'markdown',
                xml: 'xml',
                yml: 'yaml', yaml: 'yaml',
                py: 'python',
                rb: 'ruby',
                go: 'go',
                rs: 'rust',
                java: 'java',
                c: 'c', h: 'c',
                cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cc: 'cpp',
                cs: 'csharp',
                sh: 'shell', bash: 'shell',
                sql: 'sql',
                vue: 'html',
                svelte: 'html',
                php: 'php',
                swift: 'swift',
                kt: 'kotlin', kts: 'kotlin',
                ini: 'ini', toml: 'ini',
                log: 'plaintext'
            };
            return map[ext] || 'plaintext';
        }

        function ideCreateEmptyWxterThread() {
            return {
                id: 'idewx-' + Date.now() + '-' + Math.random().toString(16).slice(2, 7),
                messages: [],
                title: 'New chat',
                updatedAt: Date.now()
            };
        }

        function ideWxterComputeTitle(messages) {
            const first = (messages || []).find(m => m.role === 'user' && String(m.content || '').trim());
            if (!first) return 'New chat';
            const clean = String(first.content).replace(/\s+/g, ' ').trim();
            return clean.length > 28 ? clean.slice(0, 28) + '…' : clean;
        }

        function ideWxterLoadThreads() {
            try {
                const raw = JSON.parse(getAccountScopedStorageItem(IdeWxterStorage.key) || '[]');
                if (Array.isArray(raw) && raw.length) {
                    IdeState.ideWxterThreads = raw.map(t => ({
                        id: String(t.id),
                        messages: Array.isArray(t.messages)
                            ? t.messages.map(m => ({
                                role: m.role === 'user' ? 'user' : 'assistant',
                                content: String(m.content || '')
                            }))
                            : [],
                        title: String(t.title || 'Chat'),
                        updatedAt: Number(t.updatedAt) || Date.now()
                    }));
                } else {
                    IdeState.ideWxterThreads = [ideCreateEmptyWxterThread()];
                }
            } catch {
                IdeState.ideWxterThreads = [ideCreateEmptyWxterThread()];
            }
            let active = getAccountScopedStorageItem(IdeWxterStorage.activeKey);
            if (!IdeState.ideWxterThreads.some(t => t.id === active)) {
                active = IdeState.ideWxterThreads[0]?.id;
            }
            IdeState.ideWxterActiveId = active || IdeState.ideWxterThreads[0]?.id;
            ideWxterPersistThreads();
        }

        function ideWxterPersistThreads() {
            const serial = IdeState.ideWxterThreads.map(t => ({
                id: t.id,
                title: ideWxterComputeTitle(t.messages) || t.title || 'Chat',
                updatedAt: t.updatedAt || Date.now(),
                messages: (t.messages || [])
                    .filter(m => m && !m.pending)
                    .map(({ role, content }) => ({ role, content: String(content || '') }))
            }));
            setAccountScopedStorageItem(IdeWxterStorage.key, JSON.stringify(serial));
            setAccountScopedStorageItem(IdeWxterStorage.activeKey, IdeState.ideWxterActiveId || '');
        }

        function ideGetActiveIdeWxterThread() {
            let t = IdeState.ideWxterThreads.find(x => x.id === IdeState.ideWxterActiveId);
            if (!t) {
                t = ideCreateEmptyWxterThread();
                IdeState.ideWxterThreads.unshift(t);
                IdeState.ideWxterActiveId = t.id;
                ideWxterPersistThreads();
            }
            return t;
        }

        function renderIdeWxterHistory() {
            const list = document.getElementById('ide-wxter-history-list');
            if (!list) return;
            IdeState.ideWxterThreads = [...IdeState.ideWxterThreads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            list.innerHTML = IdeState.ideWxterThreads.map(t => `
                <button type="button" class="ide-wxter-thread ${t.id === IdeState.ideWxterActiveId ? 'active' : ''}" onclick="ideWxterSelectThread('${t.id}')">
                    <span class="ide-wxter-thread-title">${escapeHtml(t.title || ideWxterComputeTitle(t.messages))}</span>
                </button>
            `).join('');
        }

        function ideWxterSelectThread(id) {
            IdeState.ideWxterActiveId = id;
            ideWxterPersistThreads();
            renderIdeWxterHistory();
            renderIdeWxterMessages();
        }

        function ideWxterNewChat() {
            const t = ideCreateEmptyWxterThread();
            IdeState.ideWxterThreads.unshift(t);
            IdeState.ideWxterActiveId = t.id;
            ideWxterPersistThreads();
            renderIdeWxterHistory();
            renderIdeWxterMessages();
        }

        function ideWxterResetChat() {
            const t = ideGetActiveIdeWxterThread();
            t.messages = [];
            t.title = 'New chat';
            t.updatedAt = Date.now();
            ideWxterPersistThreads();
            renderIdeWxterHistory();
            renderIdeWxterMessages();
            showToast('Water chat cleared.');
        }

        function ideWxterDeleteActiveThread() {
            if (IdeState.ideWxterThreads.length <= 1) {
                ideWxterResetChat();
                return;
            }
            const id = IdeState.ideWxterActiveId;
            IdeState.ideWxterThreads = IdeState.ideWxterThreads.filter(x => x.id !== id);
            IdeState.ideWxterActiveId = IdeState.ideWxterThreads[0]?.id;
            ideWxterPersistThreads();
            renderIdeWxterHistory();
            renderIdeWxterMessages();
            showToast('Chat removed from history.');
        }

        function ideToggleFileMenu(ev) {
            ev.stopPropagation();
            const root = document.getElementById('ide-menu-file-root');
            if (!root) return;
            const willOpen = !root.classList.contains('open');
            document.querySelectorAll('.ide-menubar-item.open').forEach(el => el.classList.remove('open'));
            if (willOpen) root.classList.add('open');
        }

        function ideCloseFileMenu() {
            document.getElementById('ide-menu-file-root')?.classList.remove('open');
        }

        function ideBuildPreviewDocumentHtml(content, lang, fileName) {
            const name = (fileName || '').toLowerCase();
            const dot = name.lastIndexOf('.');
            const ext = dot >= 0 ? name.slice(dot) : '';
            const isHtml = lang === 'html' || ext === '.html' || ext === '.htm';
            if (isHtml) {
                return content || '';
            }
            const isPy = lang === 'python' || ext === '.py';
            if (isPy) {
                return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Python preview</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; max-width: 960px; background: #0d1117; color: #e6edf3; }
    pre { background: #161b22; color: #e6edf3; padding: 12px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; }
    #err { color: #f85149; }
    button { padding: 8px 14px; margin: 8px 0; cursor: pointer; border-radius: 6px; border: 1px solid #30363d; background: #21262d; color: #e6edf3; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <h3>Python (Pyodide)</h3>
  <p>First run downloads the runtime; it may take a few seconds.</p>
  <button id="run" type="button">Run</button>
  <h4 style="font-size:12px;opacity:.8;margin:12px 0 4px">stdout</h4>
  <pre id="out"></pre>
  <h4 style="font-size:12px;opacity:.8;margin:12px 0 4px">stderr / errors</h4>
  <pre id="err"></pre>
  <script src="https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js"><\/script>
  <script>
    const SRC = ${JSON.stringify(content || '')};
    (function () {
      const out = document.getElementById('out');
      const err = document.getElementById('err');
      const btn = document.getElementById('run');
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        err.textContent = '';
        out.textContent = 'Loading Pyodide…';
        try {
          const pyodide = await loadPyodide();
          out.textContent = '';
          pyodide.setStdout({ batched: function (s) { out.textContent += s; } });
          pyodide.setStderr({ batched: function (s) { err.textContent += s; } });
          await pyodide.runPythonAsync(SRC);
        } catch (e) {
          err.textContent = e && e.stack ? e.stack : String(e);
        } finally {
          btn.disabled = false;
        }
      });
    })();
  <\/script>
</body>
</html>`;
            }
            const isJs = lang === 'javascript' || ext === '.js' || ext === '.mjs' || ext === '.cjs';
            if (isJs) {
                return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JavaScript preview</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; background: #0d1117; color: #e6edf3; }
    pre { background: #161b22; color: #e6edf3; padding: 12px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h3>JavaScript preview</h3>
  <p style="opacity:.85;font-size:13px">Console output is captured below.</p>
  <pre id="log"></pre>
  <script>
    const USER = ${JSON.stringify(content || '')};
    (function () {
      var logEl = document.getElementById('log');
      function append(s) { logEl.textContent += s + '\\n'; }
      var _log = console.log, _err = console.error, _warn = console.warn;
      console.log = function () {
        append(Array.prototype.join.call(arguments, ' '));
        _log.apply(console, arguments);
      };
      console.error = function () {
        append('ERROR: ' + Array.prototype.join.call(arguments, ' '));
        _err.apply(console, arguments);
      };
      console.warn = function () {
        append('WARN: ' + Array.prototype.join.call(arguments, ' '));
        _warn.apply(console, arguments);
      };
      window.addEventListener('error', function (e) {
        append('UNCAUGHT: ' + (e && e.message ? e.message : String(e)));
      });
      try { (0, eval)(USER); } catch (e) {
        append('THROW: ' + (e && e.stack ? e.stack : String(e)));
      }
    })();
  <\/script>
</body>
</html>`;
            }
            if (lang === 'css' || ext === '.css') {
                const safeCss = (content || '').replace(/<\/style/gi, '<\\/style');
                return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CSS preview</title>
  <style type="text/css">${safeCss}</style>
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; }
    .sample { padding: 12px; border: 1px dashed #888; margin-top: 12px; }
  </style>
</head>
<body>
  <h3>CSS preview</h3>
  <p>Your rules apply to this page. Sample markup:</p>
  <div class="sample">
    <p class="text">Paragraph with class <code>text</code></p>
    <button type="button" class="btn">Sample button</button>
    <div class="box">div.box</div>
  </div>
</body>
</html>`;
            }
            const label = (lang || 'plaintext').toUpperCase();
            return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(label)} preview</title>
  <style>
    body { font-family: ui-monospace, monospace; margin: 16px; background: #0d1117; color: #e6edf3; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h3>${escapeHtml(label)}</h3>
  <pre><code>${escapeHtml(content || '')}</code></pre>
</body>
</html>`;
        }

        function ideOpenPreviewInBlank() {
            ideCloseFileMenu();
            const snap = ideGetActiveFileSnapshot();
            if (!snap) {
                showToast('Open a file to preview.');
                return;
            }
            const model = IdeState.models.get(snap.id);
            const text = (model && !model.isDisposed()) ? model.getValue() : (snap.content || '');
            const lang = (model && !model.isDisposed()) ? model.getLanguageId() : (snap.language || 'plaintext');
            const html = ideBuildPreviewDocumentHtml(text, lang, snap.name || '');
            const w = window.open('about:blank', '_blank');
            if (!w) {
                showToast('Popup blocked — allow popups for this page.');
                return;
            }
            try { w.opener = null; } catch (_) { /* ignore */ }
            w.document.open();
            w.document.write(html);
            w.document.close();
        }

        function ideTriggerImportFile() {
            document.getElementById('ide-file-import-input')?.click();
        }

        function ideTriggerImportFolder() {
            document.getElementById('ide-folder-import-input')?.click();
        }

        async function ideHandleImportedFileList(fileList) {
            const files = Array.from(fileList || []);
            if (!files.length || !IdeState.db) return;
            for (const f of files) {
                if (f.type && f.type.startsWith('image/')) continue;
                try {
                    const text = await f.text();
                    const id = 'file_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8);
                    const name = (f.webkitRelativePath || f.name || 'untitled.txt').replace(/\\/g, '/');
                    const language = ideGuessLanguageFromFileName(name);
                    await ideSaveFileDB({ id, type: 'file', name, content: text, language });
                } catch (e) {
                    console.warn('Import failed for a file', e);
                }
            }
            await ideRefreshFiles();
            showToast(`Imported ${files.length} file(s).`);
        }

        function queueIdeLayout() {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    if (IdeState.editor) {
                        IdeState.editor.layout();
                    }
                });
            });
        }

        async function ideWaitForHostVisibility(maxFrames = 12) {
            const host = document.getElementById('screen-ide');
            for (let frame = 0; frame < maxFrames; frame += 1) {
                if (host && host.offsetWidth > 0 && host.offsetHeight > 0) {
                    return true;
                }
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }
            return Boolean(host && host.offsetWidth > 0 && host.offsetHeight > 0);
        }

        function ideUpsertOpenFile(file) {
            const existing = IdeState.openFiles.find(entry => entry.id === file.id);
            const savedContent = file.savedContent ?? existing?.savedContent ?? file.content ?? '';
            const content = file.content ?? existing?.content ?? savedContent;
            const normalized = {
                ...existing,
                ...file,
                content,
                savedContent,
                dirty: content !== savedContent
            };
            const openFileIndex = IdeState.openFiles.findIndex(entry => entry.id === file.id);
            if (openFileIndex === -1) {
                IdeState.openFiles.push(normalized);
            } else {
                IdeState.openFiles[openFileIndex] = normalized;
            }
            if (normalized.dirty) IdeState.dirtyFiles.add(normalized.id);
            else IdeState.dirtyFiles.delete(normalized.id);
            return normalized;
        }

        function ideGetActiveFileSnapshot() {
            if (!IdeState.activeFileId) return null;
            const file = IdeState.openFiles.find(entry => entry.id === IdeState.activeFileId);
            if (!file) return null;

            const model = IdeState.models.get(file.id);
            const content = model ? model.getValue() : file.content;
            const savedContent = file.savedContent ?? file.content ?? '';
            return { ...file, content, savedContent, dirty: content !== savedContent };
        }

        function ideMergeFileWithOpenState(file) {
            const open = IdeState.openFiles.find(entry => entry.id === file.id);
            const model = IdeState.models.get(file.id);
            const content = model && !model.isDisposed() ? model.getValue() : (open?.content ?? file.content);
            const savedContent = open?.savedContent ?? file.content ?? '';
            return {
                ...file,
                ...open,
                content,
                savedContent,
                dirty: content !== savedContent
            };
        }

        async function ideGetWorkspaceSnapshot() {
            const files = await ideGetAllFilesDB();
            return files.map(file => ideMergeFileWithOpenState(file));
        }

        function ideComputeDefaultTerminalHeight() {
            const host = document.getElementById('screen-ide');
            const referenceHeight = host?.clientHeight || window.innerHeight || 720;
            return Math.max(160, Math.min(320, Math.round(referenceHeight * 0.28)));
        }

        function ideApplyDefaultLayout() {
            if (IdeState.defaultLayoutApplied) return;
            IdeState.sidebarWidth = 220;
            IdeState.terminalVisible = true;
            IdeState.terminalHeight = ideComputeDefaultTerminalHeight();
            IdeState.defaultLayoutApplied = true;
        }

        function ideGetPaletteCommands() {
            return [
                { id: 'quick-open', iconClass: 'fas fa-file-import', title: 'Quick Open', meta: 'Jump to a file with Ctrl+P', run: () => openIdeQuickOpen() },
                { id: 'save-file', iconClass: 'fas fa-floppy-disk', title: 'Save File', meta: 'Ctrl+S', run: () => ideSaveActiveFile({ formatBeforeSave: IdeState.formatOnSave }) },
                { id: 'format-file', iconClass: 'fas fa-wand-magic-sparkles', title: 'Format Document', meta: 'Prettier on active file', run: () => ideFormatCode() },
                { id: 'toggle-explorer', iconClass: 'fas fa-columns', title: 'Toggle Explorer', meta: 'Ctrl+B', run: () => toggleIdeSidebar() },
                { id: 'toggle-terminal', iconClass: 'fas fa-terminal', title: 'Toggle Terminal', meta: 'Ctrl+J', run: () => toggleIdeTerminal() },
                { id: 'focus-terminal', iconClass: 'fas fa-terminal', title: 'Focus Terminal', meta: 'Open terminal and move focus there', run: () => ideFocusTerminal() },
                { id: 'focus-explorer', iconClass: 'fas fa-folder-open', title: 'Focus Explorer', meta: 'Show file structure in the left rail', run: async () => ideFocusExplorer() },
                { id: 'new-file', iconClass: 'fas fa-file', title: 'New File', meta: 'Create a new file in the workspace', run: () => ideCreateFile() },
                { id: 'new-folder', iconClass: 'fas fa-folder-plus', title: 'New Folder', meta: 'Create a new folder marker', run: () => ideCreateFolder() },
                { id: 'open-preview', iconClass: 'fas fa-arrow-up-right-from-square', title: 'Open Preview', meta: 'Run the active file in a blank tab', run: () => ideOpenPreviewInBlank() },
                { id: 'analyze-water', iconClass: 'fas fa-droplet', title: 'Analyze With Water', meta: 'Ask Water to review the active file', run: () => ideWxterAnalyze() }
            ];
        }

        async function openIdePalette(mode) {
            IdeState.paletteMode = mode;
            IdeState.paletteSelectedIndex = 0;
            const overlay = document.getElementById('ide-palette');
            const title = document.getElementById('ide-palette-title');
            const subtitle = document.getElementById('ide-palette-subtitle');
            const shortcut = document.getElementById('ide-palette-shortcut');
            const input = document.getElementById('ide-palette-input');
            if (!overlay || !title || !subtitle || !shortcut || !input) return;

            overlay.classList.remove('hidden');
            title.textContent = mode === 'commands' ? 'Command Palette' : 'Quick Open';
            subtitle.textContent = mode === 'commands'
                ? 'Run editor actions without leaving the keyboard.'
                : 'Jump straight to a file by name or path fragment.';
            shortcut.textContent = mode === 'commands' ? 'Ctrl+Shift+P' : 'Ctrl+P';
            input.value = '';
            input.placeholder = mode === 'commands' ? 'Type a command...' : 'Type a file name...';
            await renderIdePaletteResults();
            setTimeout(() => input.focus(), 30);
        }

        function openIdeQuickOpen() {
            return openIdePalette('files');
        }

        function openIdeCommandPalette() {
            return openIdePalette('commands');
        }

        function ideMovePaletteSelection(delta) {
            if (!IdeState.paletteItems.length) return;
            IdeState.paletteSelectedIndex = (IdeState.paletteSelectedIndex + delta + IdeState.paletteItems.length) % IdeState.paletteItems.length;
            renderIdePaletteResults();
        }

        async function ideAcceptPaletteSelection(index = IdeState.paletteSelectedIndex) {
            const item = IdeState.paletteItems[index];
            if (!item) return;
            closeIdePalette();
            await item.run();
        }

        async function ideFocusExplorer() {
            IdeState.sidebarVisible = true;
            ideApplySidebarVisibility();
            await switchIdeSidebar('explorer');
        }

        function ideFocusTerminal() {
            if (!IdeState.terminalVisible) {
                IdeState.terminalVisible = true;
                ideApplyTerminalState();
            }
            ideEnsureTerminalBootMessage();
            document.getElementById('ide-terminal-input')?.focus();
            queueIdeLayout();
        }

        function ideQueueAutoSave() {
            if (!IdeState.autoSave || !IdeState.activeFileId) return;
            if (IdeState.autoSaveTimer) clearTimeout(IdeState.autoSaveTimer);
            IdeState.autoSaveTimer = setTimeout(async () => {
                IdeState.autoSaveTimer = null;
                if (!IdeState.activeFileId || IdeState.dirtyFiles.size === 0) return;
                try {
                    await ideSaveActiveFile({ formatBeforeSave: IdeState.formatOnSave });
                } catch (error) {
                    console.warn('Auto save failed', error);
                }
            }, IdeState.autoSaveDelay);
        }

        function ideHandleGlobalShortcut(event) {
            if (!isIdeCategory()) return false;
            const ctrl = event.ctrlKey || event.metaKey;
            if (!ctrl) return false;
            const key = String(event.key || '').toLowerCase();

            if (key === 'p' && event.shiftKey) {
                event.preventDefault();
                openIdeCommandPalette();
                return true;
            }
            if (key === 'p') {
                event.preventDefault();
                openIdeQuickOpen();
                return true;
            }
            if (key === 'b') {
                event.preventDefault();
                toggleIdeSidebar();
                return true;
            }
            if (key === 'j') {
                event.preventDefault();
                toggleIdeTerminal();
                return true;
            }
            if (key === 's') {
                event.preventDefault();
                ideSaveActiveFile({ formatBeforeSave: IdeState.formatOnSave }).then(() => showToast('File saved'));
                return true;
            }

            return false;
        }

        function ideHideContextMenu() {
            const menu = document.getElementById('ide-context-menu');
            if (!menu) return;
            menu.classList.add('hidden');
            IdeState.contextMenuFileId = null;
        }

        function ideRenderContextMenu(file) {
            const menu = document.getElementById('ide-context-menu');
            if (!menu) return;
            const actions = [
                { label: 'New File', icon: 'fa-file', action: 'ideCreateFile()' },
                { label: 'New Folder', icon: 'fa-folder-plus', action: 'ideCreateFolder()' }
            ];
            if (file) {
                actions.push(
                    { divider: true },
                    { label: 'Rename', icon: 'fa-pen', action: `ideRenameEntry('${file.id}')` },
                    { label: 'Delete', icon: 'fa-trash', action: `ideDeleteFile('${file.id}')`, danger: true }
                );
            } else {
                actions.push(
                    { divider: true },
                    { label: 'Refresh', icon: 'fa-rotate-right', action: 'ideRefreshFiles()' }
                );
            }

            menu.innerHTML = actions.map(item => {
                if (item.divider) return '<div class="ide-context-divider"></div>';
                return `
                    <button type="button" class="${item.danger ? 'danger' : ''}" onclick="ideHideContextMenu(); ${item.action}">
                        <i class="fas ${item.icon}" aria-hidden="true"></i>
                        <span>${item.label}</span>
                    </button>
                `;
            }).join('');
        }

        async function ideOpenContextMenu(event, fileId = null) {
            event.preventDefault();
            event.stopPropagation();
            const menu = document.getElementById('ide-context-menu');
            if (!menu) return false;
            const rawFile = fileId ? await ideReadFileDB(fileId) : null;
            const file = rawFile ? ideMergeFileWithOpenState(rawFile) : null;
            IdeState.contextMenuFileId = fileId;
            ideRenderContextMenu(file);
            menu.classList.remove('hidden');
            menu.style.left = `${event.clientX}px`;
            menu.style.top = `${event.clientY}px`;

            const pad = 8;
            const rect = menu.getBoundingClientRect();
            const nextLeft = Math.min(event.clientX, window.innerWidth - rect.width - pad);
            const nextTop = Math.min(event.clientY, window.innerHeight - rect.height - pad);
            menu.style.left = `${Math.max(pad, nextLeft)}px`;
            menu.style.top = `${Math.max(pad, nextTop)}px`;
            return false;
        }

        function syncIdeStatusChips() {
            const autoSaveChip = document.getElementById('ide-status-autosave');
            const formatChip = document.getElementById('ide-status-format-save');
            if (autoSaveChip) {
                autoSaveChip.textContent = IdeState.autoSave
                    ? `Auto Save ${Math.max(0.1, IdeState.autoSaveDelay / 1000).toFixed(1)}s`
                    : 'Auto Save Off';
            }
            if (formatChip) {
                formatChip.textContent = IdeState.formatOnSave ? 'Format on Save' : 'Format Off';
            }
        }

        function updateIdeDirtyStatus() {
            const dirtyCount = IdeState.dirtyFiles.size;
            const node = document.getElementById('ide-status-dirty');
            if (!node) return;
            node.textContent = dirtyCount ? `${dirtyCount} unsaved` : 'Saved';
            node.classList.toggle('dirty', dirtyCount > 0);
            syncIdeStatusChips();
        }

        function renderIdeBreadcrumbs() {
            const container = document.getElementById('ide-breadcrumbs');
            if (!container) return;
            const file = IdeState.openFiles.find(entry => entry.id === IdeState.activeFileId);
            if (!file || file.type === 'folder') {
                container.innerHTML = '<span class="ide-breadcrumbs-empty">Workspace ready - Ctrl+P for files - Ctrl+Shift+P for commands</span>';
                return;
            }
            const parts = ideGetTreePathParts(file);
            container.innerHTML = parts.map((part, index) => `
                <span class="ide-breadcrumb">
                    <span class="ide-breadcrumb-label">${escapeHtml(part)}</span>
                    ${index < parts.length - 1 ? '<i class="fas fa-chevron-right ide-breadcrumb-sep" aria-hidden="true"></i>' : ''}
                </span>
            `).join('');
        }

        function ideIsPaletteOpen() {
            const palette = document.getElementById('ide-palette');
            return Boolean(palette && !palette.classList.contains('hidden'));
        }

        async function ideBuildPaletteItems(query = '') {
            const term = String(query || '').trim().toLowerCase();
            if (IdeState.paletteMode === 'commands') {
                return ideGetPaletteCommands().filter(item =>
                    !term ||
                    item.title.toLowerCase().includes(term) ||
                    item.meta.toLowerCase().includes(term)
                );
            }

            const files = (await ideGetWorkspaceSnapshot())
                .filter(file => file.type !== 'folder')
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

            const filtered = !term ? files : files.filter(file => file.name.toLowerCase().includes(term));
            return filtered.map(file => ({
                id: file.id,
                iconClass: getFileIconMeta(file).classes,
                title: file.name,
                meta: `${(file.language || 'plaintext').toUpperCase()}${IdeState.activeFileId === file.id ? ' • active' : ''}`,
                run: async () => ideOpenFile(file.id)
            }));
        }

        async function renderIdePaletteResults() {
            const resultsNode = document.getElementById('ide-palette-results');
            const input = document.getElementById('ide-palette-input');
            if (!resultsNode || !input) return;

            IdeState.paletteItems = await ideBuildPaletteItems(input.value);
            IdeState.paletteSelectedIndex = Math.max(0, Math.min(IdeState.paletteSelectedIndex, Math.max(0, IdeState.paletteItems.length - 1)));

            if (!IdeState.paletteItems.length) {
                resultsNode.innerHTML = '<div class="ide-palette-empty">No matches. Keep typing or hit Escape.</div>';
                return;
            }

            resultsNode.innerHTML = IdeState.paletteItems.map((item, index) => `
                <button type="button" class="ide-palette-item ${index === IdeState.paletteSelectedIndex ? 'active' : ''}" data-ide-palette-index="${index}">
                    <i class="${item.iconClass} ide-palette-item-icon" aria-hidden="true"></i>
                    <span class="ide-palette-item-copy">
                        <span class="ide-palette-item-title">${escapeHtml(item.title)}</span>
                        <span class="ide-palette-item-meta">${escapeHtml(item.meta || '')}</span>
                    </span>
                </button>
            `).join('');

            resultsNode.querySelectorAll('[data-ide-palette-index]').forEach(button => {
                button.addEventListener('mouseenter', () => {
                    const hoveredIndex = Number(button.dataset.idePaletteIndex);
                    if (IdeState.paletteSelectedIndex === hoveredIndex) return;
                    IdeState.paletteSelectedIndex = hoveredIndex;
                    renderIdePaletteResults();
                });
                button.addEventListener('click', () => ideAcceptPaletteSelection(Number(button.dataset.idePaletteIndex)));
            });

            resultsNode.querySelector('.ide-palette-item.active')?.scrollIntoView({ block: 'nearest' });
        }

        function closeIdePalette() {
            document.getElementById('ide-palette')?.classList.add('hidden');
            IdeState.paletteMode = null;
            IdeState.paletteItems = [];
            IdeState.paletteSelectedIndex = 0;
            if (IdeState.editor && IdeState.activeFileId) {
                IdeState.editor.focus();
            }
        }

        function bindIdePaletteInput() {
            const overlay = document.getElementById('ide-palette');
            const input = document.getElementById('ide-palette-input');
            if (overlay && !overlay.dataset.bound) {
                overlay.dataset.bound = '1';
                overlay.addEventListener('mousedown', (event) => {
                    if (event.target === overlay) {
                        closeIdePalette();
                    }
                });
            }
            if (!input || input.dataset.bound) return;
            input.dataset.bound = '1';
            input.addEventListener('input', () => {
                IdeState.paletteSelectedIndex = 0;
                renderIdePaletteResults();
            });
            input.addEventListener('keydown', async (event) => {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    ideMovePaletteSelection(1);
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    ideMovePaletteSelection(-1);
                } else if (event.key === 'Enter') {
                    event.preventDefault();
                    await ideAcceptPaletteSelection();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    closeIdePalette();
                }
            });
        }

        function ideApplySidebarVisibility() {
            ideApplyDefaultLayout();
            const sidebar = document.getElementById('ide-sidebar');
            const resizer = document.getElementById('ide-sidebar-resizer');
            if (!sidebar || !resizer) return;
            sidebar.style.display = IdeState.sidebarVisible ? 'flex' : 'none';
            resizer.style.display = IdeState.sidebarVisible ? 'block' : 'none';
            if (IdeState.sidebarVisible) {
                sidebar.style.width = `${IdeState.sidebarWidth}px`;
            }
        }

        function ideApplyTerminalState() {
            ideApplyDefaultLayout();
            const terminal = document.getElementById('ide-terminal');
            const resizer = document.getElementById('ide-terminal-resizer');
            if (!terminal || !resizer) return;
            terminal.classList.toggle('hidden', !IdeState.terminalVisible);
            resizer.classList.toggle('hidden', !IdeState.terminalVisible);
            if (IdeState.terminalVisible) {
                if (IdeState.terminalHeight < 120) {
                    IdeState.terminalHeight = ideComputeDefaultTerminalHeight();
                }
                terminal.style.height = `${IdeState.terminalHeight}px`;
            }
            syncIdeStatusChips();
        }

        function ideClearEditorState() {
            if (IdeState.editor) {
                IdeState.editor.setModel(null);
            }
            IdeState.activeFileId = null;
            const lang = document.getElementById('ide-status-lang');
            const cursor = document.getElementById('ide-status-cursor');
            if (lang) lang.textContent = '--';
            if (cursor) cursor.textContent = 'Ln 1, Col 1';
            renderIdeBreadcrumbs();
        }

        function ideSanitizeWorkspaceFiles(files) {
            if (!Array.isArray(files)) return [];

            return files
                .filter(file => file && typeof file === 'object')
                .filter(file => !IdeConfig.legacyTemplateIds.includes(String(file.id || '')))
                .map(file => {
                    const type = file.type === 'folder' ? 'folder' : 'file';
                    const name = String(file.name || '').trim();
                    if (!name) return null;

                    return {
                        id: String(file.id || `${type}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
                        type,
                        name,
                        content: type === 'folder' ? '' : String(file.content || ''),
                        language: type === 'folder' ? 'plaintext' : ideGuessLanguageFromFileName(name),
                        updatedAt: Number(file.updatedAt) || Date.now()
                    };
                })
                .filter(Boolean);
        }

        function ideGetWorkspaceStorageKey() {
            return getAccountScopedStorageKey(IdeConfig.workspaceStorageKey);
        }

        function ideReadWorkspaceStorage() {
            try {
                return ideSanitizeWorkspaceFiles(JSON.parse(getAccountScopedStorageItem(IdeConfig.workspaceStorageKey) || '[]'));
            } catch {
                return [];
            }
        }

        function ideWriteWorkspaceStorage(files) {
            setAccountScopedStorageItem(IdeConfig.workspaceStorageKey, JSON.stringify(ideSanitizeWorkspaceFiles(files)));
        }

        async function ideReadLegacyWorkspaceFiles() {
            if (typeof indexedDB === 'undefined') return [];

            return new Promise(resolve => {
                let settled = false;
                const finish = (files = []) => {
                    if (settled) return;
                    settled = true;
                    resolve(ideSanitizeWorkspaceFiles(files));
                };

                try {
                    const request = indexedDB.open(IdeConfig.dbName, IdeConfig.dbVersion);
                    request.onupgradeneeded = (event) => {
                        const legacyDb = event.target.result;
                        if (!legacyDb.objectStoreNames.contains(IdeConfig.storeName)) {
                            legacyDb.createObjectStore(IdeConfig.storeName, { keyPath: 'id' });
                        }
                    };
                    request.onsuccess = (event) => {
                        const legacyDb = event.target.result;
                        if (!legacyDb.objectStoreNames.contains(IdeConfig.storeName)) {
                            legacyDb.close();
                            finish([]);
                            return;
                        }

                        const tx = legacyDb.transaction(IdeConfig.storeName, 'readonly');
                        const store = tx.objectStore(IdeConfig.storeName);
                        const getAllRequest = store.getAll();
                        getAllRequest.onsuccess = () => {
                            legacyDb.close();
                            finish(getAllRequest.result || []);
                        };
                        getAllRequest.onerror = () => {
                            legacyDb.close();
                            finish([]);
                        };
                    };
                    request.onerror = () => finish([]);
                } catch {
                    finish([]);
                }
            });
        }

        async function ideEnsureWorkspaceStorageReady() {
            const scopedKey = ideGetWorkspaceStorageKey();
            if (localStorage.getItem(scopedKey) !== null) {
                const cleaned = ideReadWorkspaceStorage();
                ideWriteWorkspaceStorage(cleaned);
                return cleaned;
            }

            const migratedFiles = await ideReadLegacyWorkspaceFiles();
            ideWriteWorkspaceStorage(migratedFiles);
            return migratedFiles;
        }

        function ideResetWorkspaceSession() {
            ideClearEditorState();
            IdeState.openFiles = [];
            IdeState.activeFileId = null;
            IdeState.dirtyFiles.clear();
            IdeState.contextMenuFileId = null;
            IdeState.models.forEach(model => {
                if (model && !model.isDisposed()) model.dispose();
            });
            IdeState.models.clear();
        }

        function ideGetOrCreateModel(file) {
            let model = IdeState.models.get(file.id);
            if (!model || model.isDisposed()) {
                model = monaco.editor.createModel(file.content, file.language);
                IdeState.models.set(file.id, model);
            } else if (model.getLanguageId() !== file.language) {
                monaco.editor.setModelLanguage(model, file.language);
            }
            return model;
        }

        async function ideInit() {
            IdeState.db = { kind: 'localStorage' };
            await ideEnsureWorkspaceStorageReady();
        }

        async function ideSaveFileDB(file) {
            const normalizedFile = ideSanitizeWorkspaceFiles([{
                id: file.id,
                type: file.type,
                name: file.name,
                content: file.content,
                language: file.language,
                updatedAt: Date.now()
            }])[0];
            if (!normalizedFile) return;

            const files = ideReadWorkspaceStorage();
            const existingIndex = files.findIndex(entry => entry.id === normalizedFile.id);
            if (existingIndex === -1) files.push(normalizedFile);
            else files[existingIndex] = normalizedFile;
            ideWriteWorkspaceStorage(files);
        }

        async function ideReadFileDB(id) {
            return ideReadWorkspaceStorage().find(file => file.id === id) || null;
        }

        async function ideGetAllFilesDB() {
            return ideReadWorkspaceStorage();
        }

        async function ideDeleteFileDB(id) {
            ideWriteWorkspaceStorage(ideReadWorkspaceStorage().filter(file => file.id !== id));
        }

        async function ideEnsureWorkspaceSeeded() {
            const files = await ideGetAllFilesDB();
            return files;
        }

        async function ideSaveActiveFile(options = {}) {
            const { formatBeforeSave = false } = options;
            if (formatBeforeSave) {
                await ideFormatCode({ silent: true, notifyUnsupported: false, skipAutoSave: true });
            }
            const updatedFile = ideGetActiveFileSnapshot();
            if (!updatedFile || updatedFile.type === 'folder') return;

            if (IdeState.autoSaveTimer) {
                clearTimeout(IdeState.autoSaveTimer);
                IdeState.autoSaveTimer = null;
            }

            const persisted = {
                ...updatedFile,
                savedContent: updatedFile.content,
                dirty: false
            };
            await ideSaveFileDB({
                ...persisted,
                content: persisted.content
            });
            ideUpsertOpenFile(persisted);
            await ideRefreshFiles();
            renderIdeTabs();
            updateIdeDirtyStatus();
        }

        function initMonaco() {
            if (IdeState.editor) return Promise.resolve(IdeState.editor);
            if (IdeState.editorReadyPromise) return IdeState.editorReadyPromise;

            IdeState.editorReadyPromise = new Promise((resolve, reject) => {
                if (typeof require === 'undefined' || typeof require.config !== 'function') {
                    IdeState.editorReadyPromise = null;
                    reject(new Error('Monaco loader was not available on the page.'));
                    return;
                }

                require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
                require(['vs/editor/editor.main'], async function () {
                    try {
                        await ideWaitForHostVisibility();
                        monaco.editor.defineTheme('vx-glass-dark', {
                            base: 'vs-dark',
                            inherit: true,
                            rules: [
                                { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
                                { token: 'string', foreground: 'CE9178' },
                                { token: 'keyword', foreground: '569CD6' },
                                { token: 'number', foreground: 'B5CEA8' },
                                { token: 'delimiter', foreground: 'D4D4D4' },
                                { token: 'identifier', foreground: '9CDCFE' }
                            ],
                            colors: {
                                'editor.background': '#1E1E1E',
                                'editor.foreground': '#D4D4D4',
                                'editor.lineHighlightBackground': '#2A2D2E',
                                'editorCursor.foreground': '#AEAFAD',
                                'editorLineNumber.foreground': '#858585',
                                'editorLineNumber.activeForeground': '#C6C6C6',
                                'editor.selectionBackground': '#264F78',
                                'editor.inactiveSelectionBackground': '#3A3D41',
                                'editorIndentGuide.background1': '#404040',
                                'editorIndentGuide.activeBackground1': '#707070',
                                'editorWhitespace.foreground': '#3B3B3B',
                                'editorBracketMatch.background': '#264F7844',
                                'editorBracketMatch.border': '#3B3B3B',
                                'minimap.background': '#1E1E1E',
                                'scrollbarSlider.background': '#79797966',
                                'scrollbarSlider.hoverBackground': '#646464B3',
                                'scrollbarSlider.activeBackground': '#BFBFBF66'
                            }
                        });

                        IdeState.editor = monaco.editor.create(document.getElementById('ide-monaco'), {
                            value: '// Welcome to VS Code\n// Files are saved to IndexedDB\n',
                            language: 'javascript',
                            theme: 'vx-glass-dark',
                            automaticLayout: true,
                            fontSize: 14,
                            fontFamily: "Consolas, 'Courier New', monospace",
                            fontLigatures: false,
                            lineHeight: 21,
                            smoothScrolling: true,
                            minimap: { enabled: true, renderCharacters: false, size: 'proportional' },
                            bracketPairColorization: { enabled: false },
                            cursorBlinking: 'phase',
                            cursorSmoothCaretAnimation: 'off',
                            guides: { bracketPairs: false, indentation: true },
                            padding: { top: 8, bottom: 8 },
                            fixedOverflowWidgets: true,
                            renderWhitespace: 'selection',
                            overviewRulerBorder: false
                        });

                        IdeState.editor.onDidChangeModelContent(() => {
                            const activeFile = ideGetActiveFileSnapshot();
                            if (activeFile) {
                                ideUpsertOpenFile(activeFile);
                                renderIdeTabs();
                                updateIdeDirtyStatus();
                                if (!IdeState.suppressAutoSave) {
                                    ideQueueAutoSave();
                                }
                            }
                        });

                        IdeState.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
                            await ideSaveActiveFile({ formatBeforeSave: IdeState.formatOnSave });
                            showToast('File saved');
                        });
                        IdeState.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => openIdeQuickOpen());
                        IdeState.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => openIdeCommandPalette());
                        IdeState.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => toggleIdeSidebar());
                        IdeState.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => toggleIdeTerminal());

                        IdeState.editor.onDidChangeCursorPosition((e) => {
                            document.getElementById('ide-status-cursor').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
                        });

                        if (!IdeState.resizeHookBound) {
                            window.addEventListener('resize', queueIdeLayout);
                            IdeState.resizeHookBound = true;
                        }

                        if (IdeState.activeFileId) {
                            await ideOpenFile(IdeState.activeFileId);
                        } else {
                            queueIdeLayout();
                        }

                        resolve(IdeState.editor);
                    } catch (error) {
                        IdeState.editorReadyPromise = null;
                        reject(error);
                    }
                }, function (error) {
                    IdeState.editorReadyPromise = null;
                    reject(error);
                });
            });

            return IdeState.editorReadyPromise;
        }

        async function openIde() {
            await ideWaitForHostVisibility();
            if (!IdeState.db) await ideInit();

            await ideEnsureWorkspaceSeeded();
            ideApplyDefaultLayout();

            try {
                await initMonaco();
            } catch (error) {
                console.error('Monaco init failed', error);
                showToast('VS Code editor failed to load.');
                return;
            }

            ideApplySidebarVisibility();
            ideApplyTerminalState();
            bindIdePaletteInput();
            if (IdeState.terminalVisible) {
                ideEnsureTerminalBootMessage();
            }

            await switchIdeSidebar(IdeState.sidebarMode);

            const files = (await ideGetAllFilesDB()).filter(file => file.type !== 'folder');
            const nextFileId = files.some(file => file.id === IdeState.activeFileId) ? IdeState.activeFileId : files[0]?.id;
            if (nextFileId) {
                await ideOpenFile(nextFileId);
            } else if (IdeState.editor) {
                ideClearEditorState();
            }

            const fi = document.getElementById('ide-file-import-input');
            if (fi && !fi.dataset.bound) {
                fi.dataset.bound = '1';
                fi.addEventListener('change', e => {
                    ideHandleImportedFileList(e.target.files);
                    e.target.value = '';
                });
            }
            const fo = document.getElementById('ide-folder-import-input');
            if (fo && !fo.dataset.bound) {
                fo.dataset.bound = '1';
                fo.addEventListener('change', e => {
                    ideHandleImportedFileList(e.target.files);
                    e.target.value = '';
                });
            }

            updateIdeDirtyStatus();
            renderIdeBreadcrumbs();
            queueIdeLayout();
        }

        function closeIde() {
            document.title = originalTitle;
            if (currentCategory === 'ide') {
                switchCategory('games');
            }
        }

        async function ideCreateFile() {
            ideHideContextMenu();
            const name = (await requestWxterPrompt('New File', 'Enter a file name like index.html', 'index.html'))?.trim();
            if (!name) return;
            const id = 'file_' + Date.now();
            const file = {
                id,
                type: 'file',
                name,
                content: '',
                language: ideGuessLanguageFromFileName(name)
            };
            await ideSaveFileDB(file);
            await ideRefreshFiles();
            await ideOpenFile(id);
        }

        async function ideCreateFolder() {
            ideHideContextMenu();
            const name = (await requestWxterPrompt('New Folder', 'Enter a folder name', 'New Folder'))?.trim();
            if (!name) return;

            const folder = {
                id: 'folder_' + Date.now(),
                type: 'folder',
                name: name.replace(/[\\/]+/g, '').trim() || 'New Folder',
                content: '',
                language: 'plaintext'
            };

            await ideSaveFileDB(folder);
            await ideRefreshFiles();
            showToast(`Folder created: ${folder.name}`);
        }

        async function ideOpenFile(id) {
            let file = await ideReadFileDB(id);
            if (!file) return;
            if (file.type === 'folder') {
                showToast(`Folder "${file.name}" cannot open yet.`);
                return;
            }

            if (!IdeState.editor) {
                await initMonaco();
            }

            const detected = ideGuessLanguageFromFileName(file.name);
            if (file.language !== detected) {
                file.language = detected;
                await ideSaveFileDB(file);
            }

            file = ideMergeFileWithOpenState(file);
            const openFile = ideUpsertOpenFile(file);
            IdeState.activeFileId = id;

            if (IdeState.editor) {
                const model = ideGetOrCreateModel(openFile);
                IdeState.editor.setModel(model);
                document.getElementById('ide-status-lang').textContent = (openFile.language || 'plaintext').toUpperCase();
                queueIdeLayout();
            }

            renderIdeTabs();
            updateIdeDirtyStatus();
            await ideRefreshFiles();
        }

        async function ideDeleteFile(id) {
            ideHideContextMenu();
            const file = await ideReadFileDB(id);
            if (!file) return;

            const confirmed = await requestWxterConfirm('Delete File', `Delete ${file.name}?`);
            if (!confirmed) return;
            await ideDeleteFileDB(id);
            const model = IdeState.models.get(id);
            if (model && !model.isDisposed()) {
                model.dispose();
            }
            IdeState.models.delete(id);
            IdeState.dirtyFiles.delete(id);
            IdeState.openFiles = IdeState.openFiles.filter(f => f.id !== id);
            if (IdeState.activeFileId === id) {
                IdeState.activeFileId = IdeState.openFiles[0]?.id || null;
                if (IdeState.activeFileId) {
                    await ideOpenFile(IdeState.activeFileId);
                } else {
                    ideClearEditorState();
                }
            }
            await ideRefreshFiles();
            renderIdeTabs();
            updateIdeDirtyStatus();
        }

        async function ideRenameEntry(id) {
            ideHideContextMenu();
            const original = await ideReadFileDB(id);
            if (!original) return;
            const isFolder = original.type === 'folder';
            const nextNameRaw = (await requestWxterPrompt(
                isFolder ? 'Rename Folder' : 'Rename File',
                isFolder ? 'Enter a new folder name' : 'Enter a new file name',
                original.name
            ))?.trim();
            if (!nextNameRaw) return;

            const nextName = isFolder
                ? nextNameRaw.replace(/[\\/]+/g, '').trim()
                : nextNameRaw.trim();
            if (!nextName || nextName === original.name) return;

            const allFiles = await ideGetAllFilesDB();
            if (allFiles.some(file => file.id !== id && String(file.name).toLowerCase() === nextName.toLowerCase())) {
                showToast('That name already exists.');
                return;
            }

            const liveFile = ideMergeFileWithOpenState(original);
            const nextLanguage = isFolder ? original.language : ideGuessLanguageFromFileName(nextName);
            await ideSaveFileDB({
                ...original,
                name: nextName,
                language: nextLanguage,
                content: liveFile.savedContent ?? original.content
            });

            const updatedOpenFile = ideUpsertOpenFile({
                ...liveFile,
                name: nextName,
                language: nextLanguage
            });
            const model = IdeState.models.get(id);
            if (model && !model.isDisposed() && !isFolder && model.getLanguageId() !== nextLanguage) {
                monaco.editor.setModelLanguage(model, nextLanguage);
            }
            if (IdeState.activeFileId === id) {
                document.getElementById('ide-status-lang').textContent = (updatedOpenFile.language || 'plaintext').toUpperCase();
            }

            await ideRefreshFiles();
            renderIdeTabs();
            updateIdeDirtyStatus();
            showToast(`${isFolder ? 'Folder' : 'File'} renamed.`);
        }

        async function ideRefreshFiles() {
            if (!IdeState.db) return;
            const files = await ideGetWorkspaceSnapshot();
            const container = document.getElementById('ide-sidebar-content');
            if (IdeState.sidebarMode !== 'explorer') return;

            container.oncontextmenu = (event) => {
                if (!event.target.closest('.file-tree-item')) {
                    ideOpenContextMenu(event, null);
                }
                return false;
            };

            const sortedFiles = [...files].sort((a, b) => {
                const aDirectory = ideGetTreePathParts(a).slice(0, -1).join('/');
                const bDirectory = ideGetTreePathParts(b).slice(0, -1).join('/');
                const directoryOrder = aDirectory.localeCompare(bDirectory, undefined, { sensitivity: 'base' });
                if (directoryOrder !== 0) return directoryOrder;
                if ((a.type === 'folder') !== (b.type === 'folder')) {
                    return a.type === 'folder' ? -1 : 1;
                }
                return ideGetTreeLabel(a).localeCompare(ideGetTreeLabel(b), undefined, { sensitivity: 'base' });
            });

            if (!sortedFiles.length) {
                container.innerHTML = '<div class="ide-sidebar-empty">Workspace empty. Create a file to get started.</div>';
                return;
            }

            container.innerHTML = sortedFiles.map(f => `
                <div class="file-tree-item ${IdeState.activeFileId === f.id ? 'active' : ''}" style="--ide-tree-depth: ${ideGetTreeDepth(f)};" title="${escapeHtml(f.name)}" onclick="ideOpenFile('${f.id}')" oncontextmenu="ideOpenContextMenu(event, '${f.id}'); return false;">
                    <div class="file-tree-item-main">
                        <span class="file-tree-item-guides" aria-hidden="true">${ideRenderTreeGuides(ideGetTreeDepth(f))}</span>
                        ${getFileIconMarkup(f, 'file-tree-item-icon')}
                        <span class="file-tree-item-name">${escapeHtml(ideGetTreeLabel(f))}</span>
                    </div>
                    <div class="file-tree-item-meta">
                        ${f.dirty ? '<span class="file-tree-item-dirty" aria-hidden="true"></span>' : ''}
                    </div>
                </div>
            `).join('');
        }

        function ideGetTreePathParts(file) {
            return String(file?.name || '')
                .split(/[\\/]+/)
                .filter(Boolean);
        }

        function ideGetTreeDepth(file) {
            return Math.max(0, ideGetTreePathParts(file).length - 1);
        }

        function ideGetTreeLabel(file) {
            const parts = ideGetTreePathParts(file);
            return parts[parts.length - 1] || String(file?.name || '');
        }

        function ideRenderTreeGuides(depth) {
            if (!depth) return '';
            return Array.from({ length: depth }, () => '<span class="file-tree-item-guide"></span>').join('');
        }

        function getFileIconMeta(fileOrName) {
            const file = typeof fileOrName === 'object' && fileOrName !== null
                ? fileOrName
                : { name: String(fileOrName || ''), type: 'file' };
            const name = (file.name || '').toLowerCase();
            if (file.type === 'folder') return { classes: 'fa-solid fa-folder ide-icon-folder' };
            if (name.endsWith('.html') || name.endsWith('.htm')) return { classes: 'fa-brands fa-html5 ide-icon-html' };
            if (name.endsWith('.css') || name.endsWith('.scss') || name.endsWith('.sass') || name.endsWith('.less')) return { classes: 'fa-brands fa-css3-alt ide-icon-css' };
            if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')) return { classes: 'fa-brands fa-js ide-icon-js' };
            if (name.endsWith('.ts') || name.endsWith('.tsx')) return { classes: 'fa-solid fa-code ide-icon-ts' };
            if (name.endsWith('.jsx')) return { classes: 'fa-brands fa-react ide-icon-jsx' };
            if (name.endsWith('.json') || name.endsWith('.yaml') || name.endsWith('.yml')) return { classes: 'fa-solid fa-database ide-icon-data' };
            if (name.endsWith('.md')) return { classes: 'fa-solid fa-file-lines ide-icon-md' };
            if (name.endsWith('.py')) return { classes: 'fa-brands fa-python ide-icon-py' };
            return { classes: 'fa-solid fa-file-code ide-icon-file' };
        }

        function getFileIconMarkup(fileOrName, extraClasses = '') {
            const meta = getFileIconMeta(fileOrName);
            return `<i class="${meta.classes} ${extraClasses}" aria-hidden="true"></i>`;
        }

        function renderIdeTabs() {
            const container = document.getElementById('ide-tabs');
            if (!container) return;
            container.innerHTML = IdeState.openFiles.filter(f => f.type !== 'folder').map(f => `
                <div class="ide-tab ${IdeState.activeFileId === f.id ? 'active' : ''} ${f.dirty ? 'dirty' : ''}" title="${escapeHtml(f.name)}" onclick="ideOpenFile('${f.id}')">
                    ${getFileIconMarkup(f, 'ide-tab-icon')}
                    <span class="ide-tab-label">${escapeHtml(ideGetTreeLabel(f))}</span>
                    <span class="ide-tab-dirty" aria-hidden="true"></span>
                    <button type="button" class="ide-tab-close" onclick="event.stopPropagation(); ideCloseTab('${f.id}')"><i class="fas fa-xmark"></i></button>
                </div>
            `).join('');
            renderIdeBreadcrumbs();
            updateIdeDirtyStatus();
        }

        async function ideCloseTab(id) {
            const file = IdeState.openFiles.find(entry => entry.id === id);
            if (file?.dirty) {
                const shouldDiscard = await requestWxterConfirm('Unsaved Changes', `Close ${file.name} without saving?`);
                if (!shouldDiscard) return;
            }
            const model = IdeState.models.get(id);
            if (model && !model.isDisposed()) {
                model.dispose();
            }
            IdeState.models.delete(id);
            IdeState.dirtyFiles.delete(id);
            IdeState.openFiles = IdeState.openFiles.filter(f => f.id !== id);
            if (IdeState.activeFileId === id) {
                IdeState.activeFileId = IdeState.openFiles[0]?.id || null;
                if (IdeState.activeFileId) {
                    await ideOpenFile(IdeState.activeFileId);
                } else {
                    ideClearEditorState();
                }
            }
            renderIdeTabs();
            await ideRefreshFiles();
            updateIdeDirtyStatus();
        }

        async function ideFormatCode(options = {}) {
            const { silent = false, notifyUnsupported = true, skipAutoSave = false } = options;
            if (!IdeState.editor || !IdeState.editor.getModel()) return;
            const content = IdeState.editor.getValue();
            const lang = IdeState.editor.getModel().getLanguageId();
            
            try {
                const parserMap = {
                    javascript: 'babel',
                    html: 'html',
                    css: 'css'
                };
                const parser = parserMap[lang];
                if (!parser) {
                    if (notifyUnsupported && !silent) {
                        showToast('Formatting is available for HTML, CSS, and JavaScript files.');
                    }
                    return false;
                }
                
                const formatted = await prettier.format(content, {
                    parser: parser,
                    plugins: prettierPlugins,
                });
                if (formatted !== content) {
                    IdeState.suppressAutoSave = true;
                    try {
                        const model = IdeState.editor.getModel();
                        IdeState.editor.executeEdits('prettier-format', [{
                            range: model.getFullModelRange(),
                            text: formatted
                        }]);
                        IdeState.editor.pushUndoStop();
                    } finally {
                        IdeState.suppressAutoSave = false;
                    }
                    const activeFile = ideGetActiveFileSnapshot();
                    if (activeFile) {
                        ideUpsertOpenFile(activeFile);
                        renderIdeTabs();
                        updateIdeDirtyStatus();
                    }
                }
                if (!skipAutoSave && IdeState.autoSave) {
                    ideQueueAutoSave();
                }
                if (!silent) {
                    showToast(formatted === content ? 'Already formatted' : 'Code formatted with Prettier');
                }
                return true;
            } catch (e) {
                console.error(e);
                if (!silent) {
                    showToast('Formatting error: ' + e.message);
                }
                return false;
            }
        }

        /* --- IDE Sidebar Modes --- */
        async function switchIdeSidebar(mode) {
            IdeState.sidebarMode = mode;
            const btns = document.querySelectorAll('.ide-activity-btn');
            btns.forEach(b => b.classList.remove('active'));
            const index = mode === 'explorer' ? 0 : (mode === 'search' ? 1 : 2);
            btns[index]?.classList.add('active');

            const title = document.getElementById('ide-sidebar-title');
            const content = document.getElementById('ide-sidebar-content');

            if (mode === 'explorer') {
                title.textContent = 'Explorer';
                await ideRefreshFiles();
            } else if (mode === 'search') {
                title.textContent = 'Search';
                await renderIdeSearchPanel();
            } else if (mode === 'wxter') {
                title.textContent = 'Water AI (Wxter)';
                renderIdeWxter();
            }

            queueIdeLayout();
        }

        function renderIdeWxter() {
            ideWxterLoadThreads();
            const content = document.getElementById('ide-sidebar-content');
            content.innerHTML = `
                <div class="ide-wxter-shell">
                    <aside class="ide-wxter-history">
                        <div class="ide-wxter-history-head">History</div>
                        <div id="ide-wxter-history-list" class="ide-wxter-history-list"></div>
                        <div class="ide-wxter-history-actions">
                            <button type="button" class="ide-sidebar-button" onclick="ideWxterNewChat()">New Chat</button>
                            <button type="button" class="ide-sidebar-button" onclick="ideWxterResetChat()">Reset Chat</button>
                            <button type="button" class="ide-sidebar-button danger" onclick="ideWxterDeleteActiveThread()">Delete Chat</button>
                        </div>
                    </aside>
                    <div class="ide-wxter-maincol">
                        <div id="ide-wxter-chat" class="ide-wxter-chat"></div>
                        <div class="ide-wxter-compose">
                            <textarea id="ide-wxter-input" class="ide-wxter-input" placeholder="Ask Water about this code..." rows="2"></textarea>
                            <div class="ide-wxter-compose-actions">
                                <button type="button" class="ide-sidebar-button" onclick="ideWxterAnalyze()">Analyze File</button>
                                <button type="button" class="ide-sidebar-button primary" onclick="ideWxterChatSubmit()">Send</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            renderIdeWxterHistory();
            renderIdeWxterMessages();

            document.getElementById('ide-wxter-input').addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ideWxterChatSubmit();
                }
            });
        }

        /* --- AI Suggestion Store --- */
        const AiSuggestions = {};

        function extractIdeAssistantContent(content = '') {
            const codeMatch = String(content).match(/```(?:[\w-]+)?\n?([\s\S]*?)```/);
            return {
                code: codeMatch ? codeMatch[1].trim() : '',
                text: String(content).replace(/```(?:[\w-]+)?\n?[\s\S]*?```/g, '').trim()
            };
        }

        async function renderIdeSearchPanel(initialQuery = '') {
            const content = document.getElementById('ide-sidebar-content');
            if (!content) return;
            content.innerHTML = `
                <div class="ide-search-panel">
                    <input
                        type="search"
                        id="ide-search-input"
                        class="ide-search-input"
                        placeholder="Search all workspace files. Use /pattern/i for regex."
                        value="${escapeHtml(initialQuery)}"
                        oninput="ideRunSearch(this.value)"
                    >
                    <div class="ide-search-hint">Searches saved files and unsaved editor changes across this workspace.</div>
                </div>
                <div id="ide-search-results" class="ide-search-results"></div>
            `;
            await ideRunSearch(initialQuery);
            setTimeout(() => document.getElementById('ide-search-input')?.focus(), 20);
        }

        function buildIdeSearchMatcher(query) {
            const raw = String(query || '').trim();
            if (!raw) {
                return { empty: true, matcher: null, label: '' };
            }

            const regexMatch = raw.match(/^\/(.+)\/([dgimsuy]*)$/);
            if (regexMatch) {
                return {
                    empty: false,
                    label: raw,
                    matcher: new RegExp(regexMatch[1], regexMatch[2])
                };
            }

            const lowered = raw.toLowerCase();
            return {
                empty: false,
                label: raw,
                matcher: {
                    test(value) {
                        return String(value || '').toLowerCase().includes(lowered);
                    }
                }
            };
        }

        async function ideRunSearch(query = '') {
            const resultsNode = document.getElementById('ide-search-results');
            if (!resultsNode) return;

            let searchConfig;
            try {
                searchConfig = buildIdeSearchMatcher(query);
            } catch (error) {
                resultsNode.innerHTML = `<div class="ide-search-empty ide-search-error">Invalid regex: ${escapeHtml(error.message || 'Unknown error')}</div>`;
                return;
            }

            if (searchConfig.empty) {
                resultsNode.innerHTML = '<div class="ide-search-empty">Type to search across your workspace.</div>';
                return;
            }

            const files = (await ideGetWorkspaceSnapshot()).filter(file => file.type !== 'folder');
            const results = [];

            for (const file of files) {
                const lines = String(file.content || '').split(/\r?\n/);
                for (let index = 0; index < lines.length; index += 1) {
                    if (searchConfig.matcher.test(lines[index])) {
                        results.push({
                            fileId: file.id,
                            fileName: file.name,
                            lineNumber: index + 1,
                            snippet: lines[index].trim() || '(blank line)'
                        });
                    }
                    if (results.length >= 100) break;
                }
                if (results.length >= 100) break;
            }

            if (!results.length) {
                resultsNode.innerHTML = `<div class="ide-search-empty">No matches for <strong>${escapeHtml(searchConfig.label)}</strong>.</div>`;
                return;
            }

            resultsNode.innerHTML = results.map(result => `
                <button
                    type="button"
                    class="ide-search-result"
                    onclick='ideOpenSearchResult(${JSON.stringify(String(result.fileId))}, ${result.lineNumber})'
                >
                    <div class="ide-search-result-top">
                        <span class="ide-search-result-file">${escapeHtml(result.fileName)}</span>
                        <span class="ide-search-result-line">Line ${result.lineNumber}</span>
                    </div>
                    <div class="ide-search-result-snippet">${escapeHtml(result.snippet)}</div>
                </button>
            `).join('') + (results.length >= 100 ? '<div class="ide-search-limit">Showing first 100 matches.</div>' : '');
        }

        async function ideOpenSearchResult(fileId, lineNumber) {
            await ideOpenFile(fileId);
            if (!IdeState.editor) return;
            IdeState.editor.focus();
            IdeState.editor.revealLineInCenter(lineNumber);
            IdeState.editor.setPosition({ lineNumber, column: 1 });
        }

        function renderIdeWxterMessages() {
            const container = document.getElementById('ide-wxter-chat');
            if (!container) return;
            const thread = ideGetActiveIdeWxterThread();
            const msgs = thread.messages || [];
            container.innerHTML = msgs.map(m => {
                const parsed = m.role === 'assistant'
                    ? extractIdeAssistantContent(m.content)
                    : { text: m.content, code: '' };
                let html = `
                    <div class="ide-wxter-message ide-wxter-message-${m.role === 'user' ? 'user' : 'assistant'}">
                        <div class="ide-wxter-message-role">${m.role === 'user' ? 'You' : 'Water'}</div>
                `;

                if (parsed.text) {
                    html += `<div class="ide-wxter-message-copy">${escapeHtml(parsed.text)}</div>`;
                }

                if (m.role === 'assistant' && parsed.code) {
                    const suggestionId = 'sug_' + Date.now() + Math.random().toString(36).substr(2, 5);
                    AiSuggestions[suggestionId] = parsed.code;
                    html += `<button type="button" class="ide-wxter-apply" onclick="ideApplyAiCode('${suggestionId}')">Apply Changes</button>`;
                }

                html += `</div>`;
                return html;
            }).join('');
            container.scrollTop = container.scrollHeight;
        }

        function ideApplyAiCode(id) {
            const code = AiSuggestions[id];
            if (!code || !IdeState.editor) return;
            IdeState.editor.setValue(code);
            showToast('AI Changes Applied');
        }

        async function ideWxterChatSubmit() {
            const input = document.getElementById('ide-wxter-input');
            const prompt = input?.value?.trim();
            if (!prompt) return;

            const thread = ideGetActiveIdeWxterThread();
            const historyBefore = (thread.messages || []).filter(m => !m.pending).map(({ role, content }) => ({ role, content }));

            thread.messages.push({ role: 'user', content: prompt });
            thread.updatedAt = Date.now();
            ideWxterPersistThreads();
            renderIdeWxterHistory();
            renderIdeWxterMessages();
            input.value = '';

            const activeFile = ideGetActiveFileSnapshot();

            try {
                const formData = new FormData();
                formData.append('message', prompt);
                formData.append('history', JSON.stringify(historyBefore));
                const currentRole = (userRole === 'owner' || (currentUser?.displayName || '').toLowerCase() === 'james') ? 'owner' : userRole;
                formData.append('username', (currentUser?.displayName || 'User'));
                formData.append('role', currentRole);

                if (activeFile) {
                    const blob = new Blob([activeFile.content], { type: 'text/plain' });
                    formData.append('files', blob, activeFile.name);
                }

                const directive = `[SYSTEM: USER IS IN VS CODE IDE. THE ATTACHED FILE "${activeFile ? activeFile.name : 'NONE'}" IS THE LIVE CODE THEY ARE EDITING. PLEASE ANALYZE IT DIRECTLY.]`;
                formData.set('message', `${directive}\n\n${prompt}`);

                const response = await fetch(`${WxterState.endpoint}/api/wxter/chat`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                thread.messages.push({ role: 'assistant', content: data.answer });
            } catch (e) {
                thread.messages.push({ role: 'assistant', content: 'Error connecting to Water backend: ' + e.message });
            }
            thread.title = ideWxterComputeTitle(thread.messages);
            thread.updatedAt = Date.now();
            ideWxterPersistThreads();
            renderIdeWxterHistory();
            renderIdeWxterMessages();
        }

        async function ideWxterAnalyze() {
            const activeFile = ideGetActiveFileSnapshot();
            if (!activeFile) {
                showToast('Open a file to analyze');
                return;
            }
            const input = document.getElementById('ide-wxter-input');
            input.value = `Analyze this ${activeFile.language} file for bugs or improvements.`;
            ideWxterChatSubmit();
        }

        function toggleIdeTerminal() {
            IdeState.terminalVisible = !IdeState.terminalVisible;
            ideApplyTerminalState();
            if (IdeState.terminalVisible) {
                ideEnsureTerminalBootMessage();
                document.getElementById('ide-terminal-input')?.focus();
            }
            queueIdeLayout();
        }

        /* --- IDE Terminal Logic --- */
        const terminalInput = document.getElementById('ide-terminal-input');
        const terminalOutput = document.getElementById('ide-terminal-output');

        function ideEnsureTerminalBootMessage() {
            if (IdeState.terminalBootstrapped) return;
            appendToTerminal('VX terminal ready. Type "help" for commands.');
            IdeState.terminalBootstrapped = true;
        }

        function ideClearTerminal() {
            terminalOutput.innerHTML = '';
        }

        if (terminalInput) {
            terminalInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    const cmdLine = terminalInput.value.trim();
                    terminalInput.value = '';
                    if (!cmdLine) return;

                    appendToTerminal(`<span class="text-sky-300">VX&gt;</span> ${escapeHtml(cmdLine)}`);
                    await executeIdeCommand(cmdLine);
                }
            });
        }

        function appendToTerminal(html) {
            const div = document.createElement('div');
            div.className = 'ide-terminal-line';
            div.innerHTML = html;
            terminalOutput.appendChild(div);
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }

        async function executeIdeCommand(line) {
            const parts = line.split(' ');
            const cmd = parts[0].toLowerCase();
            const args = parts.slice(1);

            switch (cmd) {
                case 'help':
                    appendToTerminal('Available commands: help, ls, cat, clear, pwd, run, save, format, quick, cmd, version');
                    break;
                case 'ls':
                    const files = await ideGetWorkspaceSnapshot();
                    if (files.length === 0) appendToTerminal('No files in workspace.');
                    else appendToTerminal(files.map(f => escapeHtml(f.type === 'folder' ? `${f.name}/` : f.name)).join('  '));
                    break;
                case 'cat':
                    if (!args[0]) appendToTerminal('Usage: cat [filename]');
                    else {
                        const all = await ideGetWorkspaceSnapshot();
                        const f = all.find(x => x.name === args[0]);
                        if (f?.type === 'folder') appendToTerminal(`${f.name} is a folder.`);
                        else if (f) appendToTerminal(`<pre class="text-gray-400 mt-1">${escapeHtml(f.content)}</pre>`);
                        else appendToTerminal(`File not found: ${args[0]}`);
                    }
                    break;
                case 'clear':
                    ideClearTerminal();
                    break;
                case 'pwd':
                    appendToTerminal('/vx/workspace');
                    break;
                case 'run':
                    const runFile = args[0] || (IdeState.activeFileId ? (await ideReadFileDB(IdeState.activeFileId))?.name : null);
                    if (!runFile) appendToTerminal('Usage: run [filename]');
                    else ideLivePreview(runFile);
                    break;
                case 'save':
                    await ideSaveActiveFile({ formatBeforeSave: IdeState.formatOnSave });
                    appendToTerminal('Saved active file.');
                    break;
                case 'format':
                    await ideFormatCode();
                    break;
                case 'quick':
                    openIdeQuickOpen();
                    appendToTerminal('Quick Open ready. Start typing a file name.');
                    break;
                case 'cmd':
                    openIdeCommandPalette();
                    appendToTerminal('Command Palette ready. Start typing an action.');
                    break;
                case 'version':
                    appendToTerminal('VX Code v1.2.0');
                    break;
                default:
                    appendToTerminal(`Command not found: ${cmd}`);
            }
        }

        function ideInlineWorkspaceAssets(html, files) {
            const fileMap = new Map(
                files
                    .filter(file => file.type !== 'folder')
                    .map(file => [file.name, file])
            );
            const stylesheetPattern = new RegExp('<link\\b([^>]*?)href=(["\'])([^"\']+)\\2([^>]*)>', 'gi');
            const scriptPattern = new RegExp('<script\\b([^>]*?)src=(["\'])([^"\']+)\\2([^>]*)>\\s*<\\/script>', 'gi');

            let previewHtml = html;
            previewHtml = previewHtml.replace(stylesheetPattern, (full, beforeHref, quote, href) => {
                const fileName = href.split(/[?#]/)[0];
                const linkedFile = fileMap.get(fileName);
                if (!linkedFile || linkedFile.language !== 'css') return full;
                return `<style data-preview-source="${fileName}">\n${linkedFile.content}\n</style>`;
            });

            previewHtml = previewHtml.replace(scriptPattern, (full, beforeSrc, quote, src) => {
                const fileName = src.split(/[?#]/)[0];
                const linkedFile = fileMap.get(fileName);
                if (!linkedFile || linkedFile.language !== 'javascript') return full;
                return `<script data-preview-source="${fileName}">\n${linkedFile.content}\n<\/script>`;
            });

            return previewHtml;
        }

        async function ideLivePreview(filename) {
            const files = await ideGetWorkspaceSnapshot();
            const file = files.find(f => f.name === filename);
            if (!file || file.type === 'folder') {
                showToast('File not found for preview');
                return;
            }

            let html = file.content;
            if (file.language !== 'html') {
                html = `<html><body><pre>${escapeHtml(file.content)}</pre></body></html>`;
            } else {
                html = ideInlineWorkspaceAssets(html, files);
            }

            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            
            // Re-use game iframe modal for preview
            openGameIframeWithUrl(`Preview: ${file.name}`, url);
            showToast('Previewing ' + file.name);
        }

        function toggleIdeSidebar() {
            IdeState.sidebarVisible = !IdeState.sidebarVisible;
            ideApplySidebarVisibility();
            queueIdeLayout();
        }


        // Modified buildWxterFormData to include IDE specific markers if needed
        // but it's already generic enough.

        async function launchCurrentGame() {
            if (isWxterCategory()) {
                wxterElements.input.focus();
                return;
            }
            if (!filteredGames.length) return;
            document.getElementById('game-actions-modal')?.classList.remove('active');
            currentIndex = Math.max(0, Math.min(currentIndex, filteredGames.length - 1));
            const game = filteredGames[currentIndex];
            const launch = getGameLaunchMeta(game);
            if (!launch.source) return;
            
            document.title = `Playing: ${game.title}`;
            let possibleIcon = game.img || game.fallbackImg;
            if (possibleIcon) document.querySelector('link[rel="icon"]').href = possibleIcon;

            const launchScreen = document.getElementById('launch-screen');
            const launchTitle = document.getElementById('launch-title');
            launchTitle.textContent = `Opening ${game.title}...`;
            launchScreen.classList.add('active');
            const dismissLaunchScreen = (delay = 1800) => {
                clearTimeout(LauncherState.launchScreenTimer);
                LauncherState.launchScreenTimer = setTimeout(() => launchScreen.classList.remove('active'), delay);
            };
            if (game.id === 'vscode') {
                switchCategory('ide');
                launchScreen.classList.remove('active');
                return;
            }

            if (launch.isHtml) {
                const htmlDocument = buildStandaloneHtmlDocument(launch.source, game.title);
                if (gameRenderMode === 'iframe') {
                    openGameIframeWithHtml(game.title, htmlDocument);
                    recordGamePlay(game.id);
                } else if (gameRenderMode === 'blob' || gameRenderMode === 'data-url') {
                    try {
                        const targetUrl = gameRenderMode === 'blob'
                            ? URL.createObjectURL(new Blob([htmlDocument], { type: 'text/html' }))
                            : htmlToDataUrl(htmlDocument);
                        const win = window.open(targetUrl, '_blank');
                        if (win) {
                            recordGamePlay(game.id);
                            if (gameRenderMode === 'blob') {
                                setTimeout(() => URL.revokeObjectURL(targetUrl), 60000);
                            }
                        } else {
                            showToast(`${game.title} was blocked as a popup, so it is opening in the launcher instead.`);
                            openGameIframeWithHtml(game.title, htmlDocument);
                            recordGamePlay(game.id);
                        }
                    } catch (error) {
                        console.warn(`${gameRenderMode} HTML launch failed, falling back to iframe mode:`, error);
                        openGameIframeWithHtml(game.title, htmlDocument);
                        recordGamePlay(game.id);
                    }
                } else {
                    if (openHtmlSourceWindow(htmlDocument, game.title)) {
                        recordGamePlay(game.id);
                    } else {
                        showToast(`${game.title} was blocked as a popup, so it is opening in the launcher instead.`);
                        openGameIframeWithHtml(game.title, htmlDocument);
                        recordGamePlay(game.id);
                    }
                }
                dismissLaunchScreen();
                return;
            }

            const launchUrl = launch.url;
            const launchCheck = await preflightLaunchUrl(launchUrl);
            if (launchCheck.checked && !launchCheck.ok) {
                console.warn(`Launch failed for ${game.title}`, launchCheck);
                clearTimeout(LauncherState.launchScreenTimer);
                launchScreen.classList.remove('active');
                showToast(`${game.title} could not open. ${describeLaunchFailure(launchCheck)}`);
                return;
            }

            if (game.id === 'store') {
                const result = openExternalUrl(launchUrl, {
                    blockedMessage: `${game.title} was blocked as a popup, so it is opening in this tab instead.`
                });
                if (result.opened || result.fallback) {
                    recordGamePlay(game.id);
                }
            } else if (gameRenderMode === 'direct') {
                const result = openExternalUrl(launchUrl, {
                    blockedMessage: `${game.title} was blocked as a popup, so it is opening in this tab instead.`
                });
                if (result.opened || result.fallback) {
                    recordGamePlay(game.id);
                }
            } else if (gameRenderMode === 'iframe') {
                openGameIframeWithUrl(game.title, launchUrl);
                recordGamePlay(game.id);
            } else if (gameRenderMode === 'blob' || gameRenderMode === 'data-url') {
                try {
                    const htmlSource = await fetchLaunchHtmlSource(launchUrl);
                    const targetUrl = gameRenderMode === 'blob'
                        ? URL.createObjectURL(new Blob([htmlSource], { type: 'text/html' }))
                        : htmlToDataUrl(htmlSource);
                    const win = window.open(targetUrl, '_blank');
                    if (win) {
                        recordGamePlay(game.id);
                        if (gameRenderMode === 'blob') {
                            setTimeout(() => URL.revokeObjectURL(targetUrl), 60000);
                        }
                    } else {
                        showToast(`${game.title} was blocked as a popup, so it is opening in this tab instead.`);
                        window.location.href = targetUrl;
                        return;
                    }
                } catch (error) {
                    console.warn(`${gameRenderMode} launch failed, falling back to direct URL:`, error);
                    const result = openExternalUrl(launchUrl, {
                        blockedMessage: `${game.title} could not open in ${gameRenderMode} mode, so it is opening in this tab instead.`
                    });
                    if (result.opened || result.fallback) {
                        recordGamePlay(game.id);
                    }
                }
            } else { // about-blank
                const win = window.open('about:blank', '_blank');
                if (win) {
                    recordGamePlay(game.id);
                    if (shouldInlineLaunch(launchUrl)) {
                        try {
                            await launchInlinePage(win, game.title, launchUrl);
                        } catch (error) {
                            renderLaunchError(
                                win.document,
                                `${game.title} couldn't be embedded`,
                                `This launcher couldn't boot the page inline. ${error.message}.`,
                                launchUrl
                            );
                        }
                    } else {
                        const doc = win.document;
                        doc.title = `${game.title} - Launcher`;
                        const frame = doc.createElement('iframe');
                        frame.src = launchUrl;
                        frame.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;border:none;margin:0;padding:0;overflow:hidden;';
                        frame.setAttribute('allow', 'autoplay; fullscreen; keyboard; gamepad');
                        doc.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:#000;';
                        doc.body.appendChild(frame);
                    }
                } else {
                    showToast(`${game.title} was blocked as a popup, so it is opening in this tab instead.`);
                    window.location.href = launchUrl;
                    return;
                }
            }
            dismissLaunchScreen();
        }

        function updateClock() {
            document.getElementById('clock').textContent = new Date().toLocaleTimeString([], LauncherConfig.clockOptions);
        }

        window.addEventListener('keydown', e => {
            if (isIdeCategory()) {
                if (e.key === 'Escape') {
                    if (ideIsPaletteOpen()) {
                        e.preventDefault();
                        closeIdePalette();
                        return;
                    }
                    if (document.getElementById('ide-menu-file-root')?.classList.contains('open')) {
                        e.preventDefault();
                        ideCloseFileMenu();
                        return;
                    }
                    closeIde();
                    closeModals();
                    closeGameIframe();
                    return;
                }
                if (ideHandleGlobalShortcut(e)) return;
                if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
                return;
            }

            if (e.key === 'Escape') {
                closeModals();
                closeGameIframe();
                return;
            }
            
            // Exit early if user is typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Exit early if a modal or the social sidebar is open
            const social = document.getElementById('social-overlay');
            const isSocialOpen = social && !social.classList.contains('translate-x-full');
            if (document.querySelector('.modal-overlay.active') || isSocialOpen) return;

            if (e.key === '/') {
                e.preventDefault();
                toggleModal('search-modal');
                return;
            }

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setFocus(currentIndex + 1);
            }
            else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setFocus(currentIndex - 1);
            }
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const visibleTabs = Array.from(document.querySelectorAll('.media-btn')).filter(b => b.style.display !== 'none');
                const activeIdx = visibleTabs.findIndex(b => b.classList.contains('active'));
                if (activeIdx < visibleTabs.length - 1) visibleTabs[activeIdx + 1].click();
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const visibleTabs = Array.from(document.querySelectorAll('.media-btn')).filter(b => b.style.display !== 'none');
                const activeIdx = visibleTabs.findIndex(b => b.classList.contains('active'));
                if (activeIdx > 0) visibleTabs[activeIdx - 1].click();
            }
            else if (e.key === 'Enter') launchCurrentGame();
        });

        /* --- IDE Sidebar Resizer --- */
        (function() {
            const resizer = document.getElementById('ide-sidebar-resizer');
            const sidebar = document.getElementById('ide-sidebar');
            const terminalResizer = document.getElementById('ide-terminal-resizer');
            const terminal = document.getElementById('ide-terminal');
            let isDragging = false;
            let isTerminalDragging = false;

            if (resizer) {
                resizer.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    resizer.classList.add('dragging');
                    document.body.style.cursor = 'col-resize';
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    const newWidth = e.clientX - 56;
                    if (newWidth > 180 && newWidth < 560) {
                        IdeState.sidebarWidth = newWidth;
                        sidebar.style.width = newWidth + 'px';
                        queueIdeLayout();
                    }
                });
            }

            if (terminalResizer && terminal) {
                terminalResizer.addEventListener('mousedown', (e) => {
                    isTerminalDragging = true;
                    terminalResizer.classList.add('dragging');
                    document.body.style.cursor = 'row-resize';
                    e.preventDefault();
                });
            }

            document.addEventListener('mousemove', (e) => {
                if (!isTerminalDragging || !IdeState.terminalVisible) return;
                const mainRect = terminal.parentElement.getBoundingClientRect();
                const nextHeight = mainRect.bottom - e.clientY;
                if (nextHeight >= 120 && nextHeight <= 360) {
                    IdeState.terminalHeight = nextHeight;
                    terminal.style.height = `${nextHeight}px`;
                    queueIdeLayout();
                }
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    resizer.classList.remove('dragging');
                    document.body.style.cursor = '';
                    queueIdeLayout();
                }
                if (isTerminalDragging) {
                    isTerminalDragging = false;
                    terminalResizer.classList.remove('dragging');
                    document.body.style.cursor = '';
                    queueIdeLayout();
                }
            });

            document.addEventListener('click', () => ideHideContextMenu());
            window.addEventListener('blur', () => ideHideContextMenu());
        })();
