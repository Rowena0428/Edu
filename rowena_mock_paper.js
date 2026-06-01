/**
 * Rowena AI 模擬出卷（GEM 驅動）
 * 各科獨立 API 金鑰 — 僅程式內部使用，不暴露於 UI
 */
(function (global) {
    const SUBJECT_KEYS = {
        chinese: '',
        english: '',
        math_ch: '',
        math_en: '',
        math_ch_mc: '',
        math_en_mc: '',
    };

    // ========== Rowena AI 設置 ==========
    // 編輯以下內容來設定 Gemini API 金鑰和 Rowena 的角色提示
    const ROWENA_CONFIG = {
        // Gemini API 金鑰（https://makersuite.google.com/app/apikey 獲取）
        geminiApiKey: '',
        
        // Rowena 的系統提示 - 定義她的角色和行為
        systemPrompt: `You are Rowena, a helpful AI assistant for DSE (Hong Kong Diploma of Secondary Education) mock papers.

Your role:
- Answer student questions about the mock paper content
- Explain difficult concepts clearly and concisely
- Provide study tips and exam strategies
- Support learning in both English and Chinese

Guidelines:
- Keep responses brief and focused
- Use simple language
- When answering math/science, show key steps
- Be encouraging and supportive`,
    };

    const LOADING_MESSAGE = 'Rowena 正在努力出卷中...';

    const SUBJECT_META = {
        chinese: { tab: '中文', label: 'DSE 中文 Mock 卷', locale: 'zh', toolId: 'zh-mock' },
        english: { tab: '英文', label: 'DSE English Mock Paper', locale: 'en', toolId: 'en-mock' },
        math_ch: { tab: '中文數學', label: 'DSE 數學 Mock 卷（中）', locale: 'zh', toolId: 'math-zh' },
        math_en: { tab: '英文數學', label: 'DSE Mathematics Mock (EN)', locale: 'en', toolId: 'math-en' },
        math_ch_mc: { tab: '中文數學 MC', label: 'DSE 中文數學 MC 模擬卷', locale: 'zh', toolId: 'math-zh-mc' },
        math_en_mc: { tab: '英文數學 MC', label: 'DSE English Mathematics MC Mock Paper', locale: 'en', toolId: 'math-en-mc' },
    };

    const TOOL_TO_SUBJECT = {
        'zh-mock': 'chinese',
        'en-mock': 'english',
        'math-zh': 'math_ch',
        'math-en': 'math_en',
        'math-zh-mc': 'math_ch_mc',
        'math-en-mc': 'math_en_mc',
    };

    let activeSubject = 'chinese';
    let paperText = '';
    let generatedHtml = '';
    const paperCache = {};
    /** 全域防重複點擊鎖：任一科目出卷中時，禁止再次觸發生成或切換科目 */
    let isGenerating = false;
    let generatingSubject = null;
    let assistantMessages = [];
    let pendingMockPracticePrompt = '';
    let pendingMockAutoGenerate = false;

    // Gemini AI 設置（使用 ROWENA_CONFIG 中的值）
    let geminiApiKey = ROWENA_CONFIG.geminiApiKey;
    let rowenaSystemPrompt = ROWENA_CONFIG.systemPrompt;
    let showSettingsPanel = false;

    let rowenaMarkdownParser = null;
    function initRowenaMarkdownParser() {
        if (rowenaMarkdownParser) return rowenaMarkdownParser;
        if (typeof window.markdownit !== 'function') return null;
        const md = window.markdownit({ html: false, linkify: true, typographer: true });
        rowenaMarkdownParser = md;
        return rowenaMarkdownParser;
    }

    function typesetMath(element) {
        if (!element || typeof window.MathJax !== 'object' || typeof MathJax.typesetPromise !== 'function') {
            return Promise.resolve();
        }
        return MathJax.typesetPromise([element]).catch(() => {});
    }

    function normalizeRowenaMarkdown(text) {
        if (!text) return '';
        let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalized.split('\n');
        const outLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const listMarkerOnlyMatch = line.match(/^\s*(\d+)\.\s*$/);

            if (listMarkerOnlyMatch) {
                const number = listMarkerOnlyMatch[1];
                let j = i + 1;
                const itemLines = [];

                while (j < lines.length && lines[j].trim() === '') {
                    j += 1;
                }
                while (j < lines.length && lines[j].trim() !== '' && !/^\s*(\d+)\.\s*$/.test(lines[j]) && !/^\s*#{1,6}\s+/.test(lines[j]) && !/^\s*[-+*]\s+/.test(lines[j])) {
                    itemLines.push(lines[j].trim());
                    j += 1;
                }

                if (itemLines.length > 0) {
                    outLines.push(`${number}. ${itemLines.join(' ')}`);
                    i = j - 1;
                    continue;
                }
            }

            outLines.push(line);
        }

        return outLines.join('\n');
    }

    function renderFallbackMarkdownToHtml(text) {
        const escaped = escapeHtmlPreserveMath(text);
        const lines = escaped.split('\n');
        const blocks = [];
        let listBuffer = [];
        let currentListType = null;
        let paragraphLines = [];

        function flushParagraph() {
            if (!paragraphLines.length) return;
            blocks.push(`<p class="text-sm mb-3 leading-relaxed">${paragraphLines.join('<br>')}</p>`);
            paragraphLines = [];
        }

        function flushList() {
            if (!listBuffer.length) return;
            const tag = currentListType === 'ul' ? 'ul' : 'ol';
            blocks.push(`<${tag} class="text-sm mb-3 leading-relaxed">${listBuffer.join('')}</${tag}>`);
            listBuffer = [];
            currentListType = null;
        }

        function addListItem(type, content) {
            if (currentListType !== type) {
                flushList();
                currentListType = type;
            }
            listBuffer.push(`<li>${content}</li>`);
        }

        function processInlineMarkup(line) {
            return line
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>');
        }

        for (let rawLine of lines) {
            const line = rawLine.trimEnd();
            if (line.trim() === '') {
                flushList();
                flushParagraph();
                continue;
            }
            const heading3 = line.match(/^###\s+(.+)$/);
            const heading2 = line.match(/^##\s+(.+)$/);
            const orderedItem = line.match(/^\s*(\d+)\.\s+(.+)$/);
            const unorderedItem = line.match(/^\s*[-+*]\s+(.+)$/);

            if (heading3) {
                flushList();
                flushParagraph();
                blocks.push(`<h3 class="text-sm font-medium text-deep-blue mt-4 mb-2">${escapeHtmlPreserveMath(heading3[1])}</h3>`);
                continue;
            }
            if (heading2) {
                flushList();
                flushParagraph();
                blocks.push(`<h2 class="text-base font-medium text-deep-blue mt-5 mb-2">${escapeHtmlPreserveMath(heading2[1])}</h2>`);
                continue;
            }
            if (orderedItem) {
                flushParagraph();
                addListItem('ol', processInlineMarkup(orderedItem[2]));
                continue;
            }
            if (unorderedItem) {
                flushParagraph();
                addListItem('ul', processInlineMarkup(unorderedItem[1]));
                continue;
            }
            paragraphLines.push(processInlineMarkup(line));
        }

        flushList();
        flushParagraph();
        return blocks.join('');
    }

    function renderMarkdownToHtml(text) {
        if (!text) return '';
        const normalizedText = normalizeRowenaMarkdown(text);
        const md = initRowenaMarkdownParser();
        if (md) {
            return md.render(normalizedText);
        }
        return renderFallbackMarkdownToHtml(normalizedText);
    }

    function getApiKey(subject) {
        return SUBJECT_KEYS[subject];
    }

    function isEnglishSubject(subject) {
        return SUBJECT_META[subject].locale === 'en';
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function escapeHtmlPreserveMath(s) {
        // Split by math delimiters ($...$ and $$...$$) and escape only non-math parts
        const parts = s.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
        return parts.map((part, i) => {
            if (i % 2 === 1) {
                // This is a math part, preserve as-is for MathJax
                return part;
            } else {
                // This is text, escape HTML special chars
                const d = document.createElement('div');
                d.textContent = part;
                return d.innerHTML;
            }
        }).join('');
    }

    function sanitizeAiMessageHtml(text) {
        if (text == null) return '';
        let normalized = String(text)
            .replace(/©/g, '(c)')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n');
        const brPlaceholder = '___ROWENA_BR___';
        normalized = normalized.replace(/<br\s*\/?>/gi, brPlaceholder);
        const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
        const html = parts.map((part, i) => {
            if (i % 2 === 1) {
                return part;
            }
            const d = document.createElement('div');
            d.textContent = part;
            return d.innerHTML.replace(/\n/g, '<br>');
        }).join('');
        return html.replace(new RegExp(brPlaceholder, 'g'), '<br>');
    }

    function wrapPaperHtml(text) {
        return `<div id="mock-paper-content" class="mock-paper-body text-sm text-deep-blue leading-relaxed">
                    <style>ol{list-style-type:decimal;list-style-position:inside;margin-left:1.5rem;}ul{list-style-position:inside;margin-left:1.5rem;}li{margin-bottom:0.45rem;}</style>
                    ${renderMarkdownToHtml(text)}
                </div>`;
    }

    function syncHtmlFromText() {
        generatedHtml = paperText ? wrapPaperHtml(paperText) : '';
    }

    /** 直接寫入預覽區，覆蓋 Loading 畫面 */
    function renderPaperToPreview(markdownText, subject) {
        const cacheKey = subject || activeSubject;
        paperText = markdownText;
        paperCache[cacheKey] = paperText;
        syncHtmlFromText();

        const previewEl = document.getElementById('mock-paper-preview');
        if (previewEl) {
            previewEl.innerHTML = wrapPaperHtml(markdownText);
            typesetMath(previewEl);
        }
        restorePaperActions();
    }

    function restorePaperActions() {
        const actionsEl = document.getElementById('mock-paper-actions');
        if (paperText) {
            actionsEl?.classList.remove('opacity-40', 'pointer-events-none');
        } else {
            actionsEl?.classList.add('opacity-40', 'pointer-events-none');
        }
    }

    /** 全域忙碌：禁用所有科目 Tabs 與生成按鈕 */
    function setGeneratingUILocked(locked) {
        document.querySelectorAll('.subject-tab').forEach((btn) => {
            if (locked) {
                btn.disabled = true;
                btn.classList.add('opacity-40', 'pointer-events-none');
                btn.setAttribute('aria-disabled', 'true');
            } else {
                btn.disabled = false;
                btn.classList.remove('opacity-40', 'pointer-events-none');
                btn.setAttribute('aria-disabled', 'false');
            }
        });
        const genBtn = document.getElementById('btn-generate-mock');
        if (genBtn) {
            if (locked) {
                genBtn.disabled = true;
                genBtn.classList.add('opacity-40', 'pointer-events-none');
            } else {
                genBtn.disabled = false;
                genBtn.classList.remove('opacity-40', 'pointer-events-none');
            }
        }
        const tablist = document.querySelector('#mock-paper-root [role="tablist"]');
        if (tablist) {
            if (locked) tablist.classList.add('opacity-40', 'pointer-events-none');
            else tablist.classList.remove('opacity-40', 'pointer-events-none');
        }
    }

    function unlockGeneratingUI() {
        isGenerating = false;
        generatingSubject = null;
        setGeneratingUILocked(false);
    }

    function showLoadingPreview(subject, statusMessage) {
        const sub = subject || activeSubject;
        const tabLabel = SUBJECT_META[sub]?.tab || '';
        const message = statusMessage || LOADING_MESSAGE;
        const preview = document.getElementById('mock-paper-preview');
        if (preview) {
            preview.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-center py-20" id="mock-loading-state">
                    <div class="w-10 h-10 rounded-full sayo-border border-t-deep-blue animate-spin mb-5" style="border-top-width:2px"></div>
                    <p class="text-sm text-deep-blue tracking-wide" id="mock-loading-message">${escapeHtml(message)}</p>
                    <p class="text-[10px] text-slate-gray mt-2 tracking-widest">RAG · GEM · ${tabLabel}</p>
                </div>`;
        }
        const loadingBar = document.getElementById('mock-generating');
        if (loadingBar) loadingBar.textContent = message;
        document.getElementById('mock-paper-actions')?.classList.add('opacity-40', 'pointer-events-none');
    }

    function updateLoadingStatus(message) {
        const el = document.getElementById('mock-loading-message');
        if (el) el.textContent = message;
        const loadingBar = document.getElementById('mock-generating');
        if (loadingBar) loadingBar.textContent = message;
    }

    function showErrorPreview(message) {
        const preview = document.getElementById('mock-paper-preview');
        if (preview) {
            preview.innerHTML = `
                <div class="py-12 text-center">
                    <p class="text-sm text-deep-blue mb-2">出卷未能完成</p>
                    <p class="text-xs text-slate-gray max-w-md mx-auto leading-relaxed">${escapeHtml(message)}</p>
                </div>`;
        }
    }

    function renderSubjectTabs() {
        return Object.entries(SUBJECT_META).map(([id, m]) => `
            <button type="button" data-subject-tab="${id}"
                class="subject-tab flex-1 min-w-0 px-3 py-2.5 text-xs tracking-wide transition-all border-b-2 ${id === activeSubject ? 'border-deep-blue text-deep-blue bg-pure-white' : 'border-transparent text-slate-gray hover:text-deep-blue'}">
                ${m.tab}
            </button>
        `).join('');
    }

    function renderPanel(tool) {
        const meta = SUBJECT_META[activeSubject];
        const en = isEnglishSubject(activeSubject);
        return `
            <div class="flex flex-col min-h-0 flex-1" id="mock-paper-root">
                <header class="mb-5">
                    <p class="text-[10px] text-slate-gray tracking-widest mb-1">${en ? 'AI MOCK PAPER' : 'AI 模擬出卷'}</p>
                    <h1 class="text-2xl text-deep-blue font-light tracking-wide">${tool.name}</h1>
                    <p class="text-sm text-slate-gray mt-2 max-w-2xl">
                        ${en
                            ? 'RAG-powered mock papers: retrieve HKEAA guidance from Supabase Vector, then generate with Gemini 2.5 Flash.'
                            : 'RAG 模擬出卷：自 Supabase 向量庫檢索 DSE 官方指引，再由 Gemini 2.5 Flash 生成試卷。'}
                    </p>
                </header>

                <div class="sayo-border rounded-xl bg-pure-white overflow-hidden mb-5 shrink-0">
                    <div class="flex border-b border-gray-100 overflow-x-auto hide-scrollbar" role="tablist">
                        ${renderSubjectTabs()}
                    </div>
                    <div class="px-4 md:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-50">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] px-2 py-1 rounded sayo-border text-slate-gray tracking-widest">RAG</span>
                            <span class="text-[10px] px-2 py-1 rounded sayo-border text-slate-gray tracking-widest">GEM</span>
                            <span class="text-[10px] text-slate-gray">${en ? 'Supabase + Gemini' : 'Supabase 向量庫 + Gemini'} · ${meta.label}</span>
                        </div>
                        <button type="button" id="btn-generate-mock"
                            class="text-xs px-6 py-2.5 bg-deep-blue text-white rounded-full tracking-wider hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                            ${en ? 'Generate Mock Paper' : '生成 Mock 卷'}
                        </button>
                    </div>
                </div>

                <div class="flex-1 min-h-0 grid grid-cols-1 gap-4">
                    <section class="sayo-border rounded-xl bg-pure-white flex flex-col min-h-[360px] overflow-hidden">
                        <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
                            <h3 class="text-xs tracking-widest text-deep-blue">${en ? 'Mock Paper Preview' : 'Mock 卷預覽'}</h3>
                            <div class="flex flex-wrap gap-2 ${generatedHtml ? '' : 'opacity-40 pointer-events-none'}" id="mock-paper-actions">
                                <button type="button" id="btn-fullscreen-mock" class="text-[10px] px-3 py-1.5 sayo-border rounded-full hover:border-deep-blue transition-colors">${en ? 'Full Screen' : '全畫面打開'}</button>
                            </div>
                        </div>
                        <div id="mock-paper-preview" class="flex-1 overflow-y-auto p-5 md:p-6 hide-scrollbar">
                            ${paperText
                                ? generatedHtml
                                : `<div class="h-full flex flex-col items-center justify-center text-center py-16">
                                    <p class="text-sm text-slate-gray">${en ? 'Select a subject and tap Generate Mock Paper.' : '選擇科目後，點擊「生成 Mock 卷」。'}</p>
                                    <p class="text-[10px] text-slate-gray mt-2 tracking-widest">GEM · ${meta.tab}</p>
                                   </div>`}
                        </div>
                        <div id="mock-generating" class="hidden px-4 py-3 border-t border-gray-100 text-xs text-slate-gray tracking-wide">
                            ${LOADING_MESSAGE}
                        </div>
                    </section>
                </div>
            </div>
        `;
    }

    function renderAssistantPanel() {
        const en = isEnglishSubject(activeSubject);
        // 前端不再依賴本地 Gemini 金鑰顯示或阻擋，改由後端處理金鑰路由與安全性
        const hasApiKey = true;
        
        if (showSettingsPanel) {
            return `
                <div class="flex flex-col h-full min-h-0">
                    <div class="p-4 md:p-5 border-b border-gray-100 shrink-0">
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <div class="flex items-center gap-2">
                                <h2 class="text-xs tracking-widest text-deep-blue">Rowena AI</h2>
                                <span class="text-[9px] px-1.5 py-0.5 sayo-border text-slate-gray rounded">GEM</span>
                            </div>
                            <button type="button" id="sidebar-settings-back" class="text-[10px] px-2 py-1 sayo-border rounded hover:border-deep-blue">← ${en ? 'Back' : '返回'}</button>
                        </div>
                        <p class="text-[10px] text-slate-gray leading-relaxed">
                            ${en ? 'Configure Gemini API settings' : '設定 Gemini API'}
                        </p>
                    </div>
                    <div class="flex-1 overflow-y-auto hide-scrollbar px-4 py-3 space-y-3">
                        <div>
                            <label class="text-[10px] font-medium text-deep-blue block mb-1">${en ? 'Gemini API Key' : 'Gemini API 金鑰'}</label>
                            <input type="password" id="sidebar-gemini-key" class="w-full text-[10px] p-2 rounded-lg bg-off-white sayo-border focus:outline-none focus:border-deep-blue" placeholder="sk-..." value="${geminiApiKey}">
                            <p class="text-[9px] text-slate-gray mt-1">${en ? 'Your API key will be saved locally' : '您的 API 金鑰將被本地保存'}</p>
                        </div>
                        <div>
                            <label class="text-[10px] font-medium text-deep-blue block mb-1">${en ? 'System Prompt' : 'Rowena 角色提示'}</label>
                            <textarea id="sidebar-system-prompt" rows="4" class="w-full text-[10px] p-2 rounded-lg bg-off-white sayo-border resize-none focus:outline-none focus:border-deep-blue">${escapeHtml(rowenaSystemPrompt)}</textarea>
                            <p class="text-[9px] text-slate-gray mt-1">${en ? 'Define Rowena\'s role and behavior' : '定義 Rowena 的角色和行為'}</p>
                        </div>
                    </div>
                    <div class="p-4 border-t border-gray-100 shrink-0 space-y-2">
                        <button type="button" id="sidebar-settings-save" class="w-full text-xs py-2 bg-deep-blue text-white rounded-full tracking-wider hover:bg-slate-800 transition-all">${en ? 'Save Settings' : '保存設定'}</button>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="flex flex-col h-full min-h-0">
                <div class="p-4 md:p-5 border-b border-gray-100 shrink-0">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <div class="flex items-center gap-2">
                            <h2 class="text-xs tracking-widest text-deep-blue">Rowena AI</h2>
                            <span class="text-[9px] px-1.5 py-0.5 sayo-border text-slate-gray rounded">GEM</span>
                            <span class="text-[8px] px-1.5 py-0.5 rounded ${hasApiKey ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}">${hasApiKey ? '✓ 已連接' : '⚠ 未設定'}</span>
                        </div>
                        <button type="button" id="sidebar-settings-btn" class="text-[10px] px-2 py-1 sayo-border rounded hover:border-deep-blue">⚙</button>
                    </div>
                    <p class="text-[10px] text-slate-gray leading-relaxed">
                        ${en ? 'Questions about this paper' : '詢問關於此試卷的問題'}
                    </p>
                </div>
                <div class="flex-1 overflow-y-auto hide-scrollbar px-4 py-3 space-y-3" id="sidebar-assistant-messages">
                    ${assistantMessages && assistantMessages.length > 0 ? assistantMessages.map((m) => `
                        <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
                            <div class="max-w-[92%] px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}">${sanitizeAiMessageHtml(m.text)}</div>
                        </div>
                    `).join('') : `
                        <div class="flex justify-start">
                            <div class="max-w-[92%] px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap chat-bubble-ai">${en ? 'I can help answer questions about this mock paper. What would you like to know?' : '我可以幫助回答關於此試卷的問題。你想知道什麼？'}</div>
                        </div>
                    `}
                </div>
                <div class="p-4 border-t border-gray-100 shrink-0">
                    ${!hasApiKey ? `<div class="mb-2 p-2 bg-orange-100 rounded text-[10px] text-orange-800">⚠ ${en ? 'Please configure Gemini API first' : '請先設定 Gemini API'}</div>` : ''}
                    <textarea id="sidebar-assistant-input" rows="2" class="w-full text-xs p-3 rounded-lg bg-off-white sayo-border resize-none focus:outline-none focus:border-deep-blue" placeholder="${en ? 'Ask Rowena...' : '詢問 Rowena...'}"></textarea>
                    <button type="button" id="sidebar-assistant-send" class="mt-2 w-full text-xs py-2 bg-deep-blue text-white rounded-full tracking-wider hover:bg-slate-800 transition-all ${!hasApiKey ? 'opacity-50 cursor-not-allowed' : ''}" ${!hasApiKey ? 'disabled' : ''}>${en ? 'Send' : '送出'}</button>
                </div>
            </div>
        `;
    }

    function setSidebarMode(mode) {
        const tools = document.getElementById('sidebar-tools-panel');
        const assistant = document.getElementById('sidebar-assistant-panel');
        if (!tools || !assistant) return;
        if (mode === 'assistant') {
            tools.classList.add('hidden');
            assistant.classList.remove('hidden');
            assistant.innerHTML = renderAssistantPanel();
            bindAssistantEvents();
            // Ensure MathJax renders any math in assistant messages
            const msgEl = document.getElementById('sidebar-assistant-messages');
            if (msgEl) typesetMath(msgEl);
        } else {
            tools.classList.remove('hidden');
            assistant.classList.add('hidden');
            assistant.innerHTML = '';
        }
    }

    function bindAssistantEvents() {
        const settingsBtn = document.getElementById('sidebar-settings-btn');
        const settingsBackBtn = document.getElementById('sidebar-settings-back');
        const settingsSaveBtn = document.getElementById('sidebar-settings-save');
        const sendBtn = document.getElementById('sidebar-assistant-send');
        const input = document.getElementById('sidebar-assistant-input');
        
        if (settingsBtn) settingsBtn.addEventListener('click', () => {
            showSettingsPanel = true;
            setSidebarMode('assistant');
        });
        
        if (settingsBackBtn) settingsBackBtn.addEventListener('click', () => {
            showSettingsPanel = false;
            setSidebarMode('assistant');
        });
        
        if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', () => {
            const keyInput = document.getElementById('sidebar-gemini-key');
            const promptInput = document.getElementById('sidebar-system-prompt');
            if (keyInput) geminiApiKey = keyInput.value.trim();
            if (promptInput) rowenaSystemPrompt = promptInput.value.trim();
            localStorage.setItem('rowena_gemini_api_key', geminiApiKey);
            localStorage.setItem('rowena_system_prompt', rowenaSystemPrompt);
            showSettingsPanel = false;
            setSidebarMode('assistant');
        });
        
        if (sendBtn) sendBtn.addEventListener('click', sendAssistantMessage);
        if (input) input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAssistantMessage(); }
        });
    }

    async function sendAssistantMessage() {
        const input = document.getElementById('sidebar-assistant-input');
        const text = input?.value.trim();
        if (!text) return;
        
        const en = isEnglishSubject(activeSubject);
        assistantMessages.push({ role: 'user', text });
        input.value = '';
        
        // 更新 UI 顯示用戶消息
        const panel = document.getElementById('sidebar-assistant-panel');
        if (panel) {
            panel.innerHTML = renderAssistantPanel();
            bindAssistantEvents();
            const box = document.getElementById('sidebar-assistant-messages');
            if (box) {
                typesetMath(box);
                box.scrollTop = box.scrollHeight;
            }
        }
        
        // 發送到後端，由後端安全附加金鑰並呼叫 Gemini
        try {
            const resp = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `${rowenaSystemPrompt}\n\nStudent question: ${text}\n\nContext from mock paper:\n${paperText.substring(0, 2000)}`,
                    chatRoomId: activeSubject
                })
            });
            if (!resp.ok) throw new Error('API error');
            const data = await resp.json();
            const aiResponse = data.text || data.result || data.message || data.ai || (en ? 'Unable to get response' : '無法取得回應');
            assistantMessages.push({ role: 'ai', text: aiResponse });
        } catch (error) {
            const errorMsg = en ? 'Error connecting to backend AI service' : '後端 AI 服務連接錯誤';
            assistantMessages.push({ role: 'ai', text: errorMsg + ': ' + (error.message || error) });
        }
        
        // 更新 UI 顯示 AI 回應
        if (panel) {
            panel.innerHTML = renderAssistantPanel();
            bindAssistantEvents();
            const box = document.getElementById('sidebar-assistant-messages');
            if (box) {
                typesetMath(box);
                box.scrollTop = box.scrollHeight;
            }
        }
    }

    function enterEditMode() {
        setSidebarMode('assistant');
    }

    function exitEditMode() {
        setSidebarMode('tools');
        assistantMessages = [];
    }

    function ensureFullscreenOverlay() {
        if (document.getElementById('mock-fullscreen')) return;
        const el = document.createElement('div');
        el.id = 'mock-fullscreen';
        el.className = 'fixed inset-0 z-[160] bg-off-white/50 flex flex-col opacity-0 pointer-events-none transition-opacity duration-300';
        el.innerHTML = `
            <header class="h-14 sayo-border border-t-0 border-l-0 border-r-0 flex items-center justify-between px-6 shrink-0 bg-pure-white">
                <span class="text-xs tracking-widest text-deep-blue" id="mock-fs-title">Mock 卷 · 全畫面</span>
                <div class="flex gap-2">
                    <button type="button" id="mock-fs-download-txt" class="text-[10px] px-3 py-1.5 sayo-border rounded-full hover:border-deep-blue">下載 .txt</button>
                    <button type="button" id="mock-fs-download-pdf" class="text-[10px] px-3 py-1.5 sayo-border rounded-full hover:border-deep-blue">下載 PDF</button>
                    <button type="button" id="mock-fs-close" class="text-[10px] px-3 py-1.5 bg-deep-blue text-white rounded-full">關閉</button>
                </div>
            </header>
            <div class="flex-1 flex flex-col lg:flex-row min-h-0 gap-4 p-6">
                <section id="mock-fs-section" class="sayo-border rounded-xl bg-pure-white flex-1 overflow-hidden flex flex-col">
                    <div class="flex-1 overflow-y-auto p-6 md:p-8 hide-scrollbar" id="mock-fs-content"></div>
                </section>
                <div id="mock-fs-resizer" class="hidden lg:flex items-center justify-center w-2 cursor-col-resize select-none" style="user-select:none">
                    <div style="width:2px;height:36px;background:rgba(10,25,47,0.06);border-radius:2px"></div>
                </div>
                <aside id="mock-fs-aside" class="sayo-border rounded-xl bg-pure-white flex flex-col w-full lg:w-80 max-h-96 lg:max-h-none overflow-hidden">
                    <div class="p-4 border-b border-gray-100 shrink-0">
                        <h3 class="text-xs tracking-widest text-deep-blue mb-1">Rowena AI</h3>
                        <p class="text-[10px] text-slate-gray">詢問關於此試卷</p>
                    </div>
                    <div class="flex-1 overflow-y-auto hide-scrollbar px-4 py-3 space-y-3" id="mock-fs-messages"></div>
                    <div class="p-4 border-t border-gray-100 shrink-0">
                        <textarea id="mock-fs-input" rows="2" class="w-full text-[10px] p-2 rounded bg-off-white sayo-border resize-none focus:outline-none focus:border-deep-blue" placeholder="詢問 Rowena..."></textarea>
                        <button type="button" id="mock-fs-send" class="mt-2 w-full text-[10px] py-2 bg-deep-blue text-white rounded-full tracking-wider hover:bg-slate-800">送出</button>
                    </div>
                </aside>
            </div>
        `;
        document.body.appendChild(el);
        document.getElementById('mock-fs-close')?.addEventListener('click', closeFullscreen);
        document.getElementById('mock-fs-download-txt')?.addEventListener('click', downloadTxt);
        document.getElementById('mock-fs-download-pdf')?.addEventListener('click', downloadPdf);
        document.getElementById('mock-fs-send')?.addEventListener('click', sendFullscreenMessage);
        document.getElementById('mock-fs-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFullscreenMessage(); }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeFullscreen();
        });
        // Fullscreen resizer: allow user to drag to adjust gap between paper and Rowena AI panel
        (function setupFsResizer() {
            const resizer = document.getElementById('mock-fs-resizer');
            const aside = document.getElementById('mock-fs-aside');
            if (!resizer || !aside) return;
            let dragging = false;
            let startX = 0;
            let startWidth = 0;
            const minW = 240; // px
            const maxW = 640; // px

            const onMove = (clientX) => {
                const dx = startX - clientX;
                let newW = startWidth + dx;
                newW = Math.max(minW, Math.min(maxW, newW));
                aside.style.width = newW + 'px';
            };

            resizer.addEventListener('mousedown', (ev) => {
                dragging = true;
                startX = ev.clientX;
                startWidth = aside.getBoundingClientRect().width;
                document.body.style.cursor = 'col-resize';
                ev.preventDefault();
            });

            document.addEventListener('mousemove', (ev) => {
                if (!dragging) return;
                onMove(ev.clientX);
            });

            document.addEventListener('mouseup', () => {
                if (!dragging) return;
                dragging = false;
                document.body.style.cursor = '';
            });

            // Touch support
            resizer.addEventListener('touchstart', (ev) => {
                const t = ev.touches && ev.touches[0];
                if (!t) return;
                dragging = true;
                startX = t.clientX;
                startWidth = aside.getBoundingClientRect().width;
            }, { passive: true });

            document.addEventListener('touchmove', (ev) => {
                if (!dragging) return;
                const t = ev.touches && ev.touches[0];
                if (!t) return;
                onMove(t.clientX);
            }, { passive: true });

            document.addEventListener('touchend', () => {
                dragging = false;
            });

            // Double click to reset width
            resizer.addEventListener('dblclick', () => {
                aside.style.width = '320px';
            });
        })();
    }

    async function sendFullscreenMessage() {
        const input = document.getElementById('mock-fs-input');
        const text = input?.value.trim();
        if (!text) return;
        const en = isEnglishSubject(activeSubject);
        assistantMessages.push({ role: 'user', text });
        input.value = '';
        
        // 更新 UI 顯示用戶消息
        const panel = document.getElementById('mock-fs-messages');
        if (panel) {
            panel.innerHTML = assistantMessages.map((m) => `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
                    <div class="max-w-[85%] px-3 py-2 rounded-lg text-[10px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}">${sanitizeAiMessageHtml(m.text)}</div>
                </div>
            `).join('');
            typesetMath(panel);
            panel.scrollTop = panel.scrollHeight;
        }
        
        // 發送到後端，由後端安全附加金鑰並呼叫 Gemini
        try {
            const resp = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `${rowenaSystemPrompt}\n\nStudent question: ${text}\n\nContext from mock paper:\n${paperText.substring(0, 2000)}`,
                    chatRoomId: activeSubject
                })
            });
            if (!resp.ok) throw new Error('API error');
            const data = await resp.json();
            const aiResponse = data.text || data.result || data.message || data.ai || (en ? 'Unable to get response' : '無法取得回應');
            assistantMessages.push({ role: 'ai', text: aiResponse });
        } catch (error) {
            const errorMsg = en ? 'Error connecting to backend AI service' : '後端 AI 服務連接錯誤';
            assistantMessages.push({ role: 'ai', text: errorMsg + ': ' + (error.message || error) });
        }
        
        // 更新 UI 顯示 AI 回應
        if (panel) {
            panel.innerHTML = assistantMessages.map((m) => `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
                    <div class="max-w-[85%] px-3 py-2 rounded-lg text-[10px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}">${sanitizeAiMessageHtml(m.text)}</div>
                </div>
            `).join('');
            typesetMath(panel);
            panel.scrollTop = panel.scrollHeight;
        }
    }

    function openFullscreen() {
        if (!paperText) return;
        ensureFullscreenOverlay();
        const en = isEnglishSubject(activeSubject);
        const fs = document.getElementById('mock-fullscreen');
        const content = document.getElementById('mock-fs-content');
        const title = document.getElementById('mock-fs-title');
        const msgsPanel = document.getElementById('mock-fs-messages');

        // 顯示生成的 HTML（已排版的試卷）
        if (content) {
            content.innerHTML = generatedHtml;
            typesetMath(content);
        }

        // 顯示歡迎訊息
        assistantMessages = [];
        if (msgsPanel) {
            msgsPanel.innerHTML = `<div class="flex justify-start"><div class="max-w-[85%] px-3 py-2 rounded-lg text-[10px] leading-relaxed chat-bubble-ai">${en ? 'Questions about this paper?' : '對此試卷有疑問？'}</div></div>`;
            typesetMath(msgsPanel);
        }

        // 更新文本內容
        if (title) title.textContent = en ? 'Mock Paper · Full Screen' : 'Mock 卷 · 全畫面';
        document.getElementById('mock-fs-download-txt').textContent = en ? 'Download .txt' : '下載 .txt';
        document.getElementById('mock-fs-download-pdf').textContent = en ? 'Download PDF' : '下載 PDF';
        document.getElementById('mock-fs-close').textContent = en ? 'Close' : '關閉';
        document.getElementById('mock-fs-input').placeholder = en ? 'Ask Rowena...' : '詢問 Rowena...';
        document.getElementById('mock-fs-send').textContent = en ? 'Send' : '送出';

        fs?.classList.remove('opacity-0', 'pointer-events-none');
    }

    function closeFullscreen() {
        const fs = document.getElementById('mock-fullscreen');
        fs?.classList.add('opacity-0', 'pointer-events-none');
        assistantMessages = [];
    }

    function downloadTxt() {
        const text = paperText;
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Rowena_Mock_${activeSubject}_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function downloadPdf() {
        const meta = SUBJECT_META[activeSubject];
        const body = escapeHtml(paperText);
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html lang="${meta.locale === 'en' ? 'en' : 'zh-HK'}"><head><meta charset="UTF-8"><title>${meta.label}</title>
            <style>body{font-family:system-ui,-apple-system,sans-serif;color:#0A192F;padding:40px;font-size:12pt;}
            pre{white-space:pre-wrap;line-height:1.625;margin:0;}</style></head><body><pre>${body}</pre></body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 400);
    }


    function updatePreview() {
        const preview = document.getElementById('mock-paper-preview');
        if (!preview) return;
        const en = isEnglishSubject(activeSubject);
        syncHtmlFromText();
        if (paperText) {
            preview.innerHTML = generatedHtml;
            typesetMath(preview);
            restorePaperActions();
        } else if (!isGenerating) {
            preview.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-center py-16">
                <p class="text-sm text-slate-gray">${en ? 'Select a subject and tap Generate Mock Paper.' : '選擇科目後，點擊「生成 Mock 卷」。'}</p>
            </div>`;
            restorePaperActions();
        }
    }

    async function generateMockPaper() {
        if (isGenerating) return;

        isGenerating = true;
        const requestSubject = activeSubject;
        generatingSubject = requestSubject;
        setGeneratingUILocked(true);

        const loadingBar = document.getElementById('mock-generating');
        loadingBar?.classList.remove('hidden');
        showLoadingPreview(requestSubject);

        try {
            const subjectName = SUBJECT_META[requestSubject]?.tab || '指定科目';
            const practicePrefix = consumePracticePrompt();
            const userPrompt = practicePrefix
                ? `${practicePrefix}\n\n請依學習診斷建議生成【香港 DSE ${subjectName}】針對性模擬練習卷。以 Markdown 輸出。`
                : `請根據以上指引，嚴格為我生成一份全新的【香港 DSE ${subjectName}】模擬試卷。` +
                  `內容必須完全符合該科目考試範圍與題型。以 Markdown 格式輸出，保留清晰分段與換行。`;

            updateLoadingStatus('正在向後端請求 AI 生成試卷...');
            const resp = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: userPrompt, chatRoomId: requestSubject })
            });
            if (!resp.ok) throw new Error('API error');
            const data = await resp.json();
            const markdownText = data.text || data.result || data.markdown || data.message || '';
            renderPaperToPreview(markdownText, requestSubject);
        } catch (err) {
            console.error('[Rowena] generateMockPaper failed:', err);
            if (err && err.message === 'GEMINI_503_BUSY') {
                showErrorPreview('Gemini 服務繁忙（503），請稍後再試。');
            } else if (err && String(err.message).includes('contents')) {
                showErrorPreview(
                    (err.message || '未知錯誤') +
                        '\n\n提示：此錯誤通常來自 Embedding API 格式或快取舊版 JS。請 Ctrl+F5 強制重新整理，並在 rowena_rag.js 的 RAG_CONFIG.GEMINI_EMBED_API_KEY 填入 Google AI Studio 一般 API Key（非僅 Gem 鑰）。'
                );
            } else {
                showErrorPreview(err.message || '未知錯誤');
            }
        } finally {
            unlockGeneratingUI();
            loadingBar?.classList.add('hidden');
            restorePaperActions();
        }
    }

    function bindPanelEvents() {
        document.querySelectorAll('[data-subject-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (isGenerating) return;
                activeSubject = btn.dataset.subjectTab;
                paperText = paperCache[activeSubject] || '';
                syncHtmlFromText();
                document.querySelectorAll('.subject-tab').forEach((b) => {
                    const on = b.dataset.subjectTab === activeSubject;
                    b.className = `subject-tab flex-1 min-w-0 px-3 py-2.5 text-xs tracking-wide transition-all border-b-2 ${on ? 'border-deep-blue text-deep-blue bg-pure-white' : 'border-transparent text-slate-gray hover:text-deep-blue'}`;
                });
                updatePreview();
                const btnGen = document.getElementById('btn-generate-mock');
                const en = isEnglishSubject(activeSubject);
                if (btnGen) btnGen.textContent = en ? 'Generate Mock Paper' : '生成 Mock 卷';
                if (typeof global.onMockPaperSubjectChange === 'function') {
                    global.onMockPaperSubjectChange(activeSubject);
                }
            });
        });
        const genBtn = document.getElementById('btn-generate-mock');
        if (genBtn) {
            genBtn.replaceWith(genBtn.cloneNode(true));
        }
        document.getElementById('btn-generate-mock')?.addEventListener('click', () => {
            if (isGenerating) return;
            generateMockPaper();
        });
        document.getElementById('btn-fullscreen-mock')?.addEventListener('click', openFullscreen);
    }

    function setSubjectFromTool(toolId) {
        if (TOOL_TO_SUBJECT[toolId]) activeSubject = TOOL_TO_SUBJECT[toolId];
    }

    function resetForToolSwitch() {
        setSidebarMode('tools');
    }

    function mount(tool) {
        setSubjectFromTool(tool.id);
        paperText = paperCache[activeSubject] || '';
        syncHtmlFromText();
        ensureFullscreenOverlay();
        return renderPanel(tool);
    }

    function afterMount() {
        bindPanelEvents();
        updatePreview();
        if (pendingMockAutoGenerate && pendingMockPracticePrompt) {
            pendingMockAutoGenerate = false;
            generateMockPaper();
        }
    }

    function consumePracticePrompt() {
        const t = pendingMockPracticePrompt;
        pendingMockPracticePrompt = '';
        return t;
    }

    function setPracticeFromDiagnostic(prompt, autoGenerate) {
        pendingMockPracticePrompt = String(prompt || '').trim();
        pendingMockAutoGenerate = Boolean(autoGenerate);
    }

    global.RowenaMockPaper = {
        mount,
        afterMount,
        setSubjectFromTool,
        resetForToolSwitch,
        isGenerating: () => isGenerating,
        setPracticeFromDiagnostic,
        SUBJECT_KEYS,
        TOOL_TO_SUBJECT,
        SUBJECT_META,
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PvP 對戰（含 Rowena Bot · AI 虛擬對手，統一經 RAG 生成題目與作答）
    // ─────────────────────────────────────────────────────────────────────────

    const PVP_SUBJECT_META = {
        chinese: { tab: '中文', label: 'DSE 中文' },
        english: { tab: '英文', label: 'DSE English' },
        math_ch: { tab: '中文數學', label: 'DSE 數學（中）' },
        math_en: { tab: '英文數學', label: 'DSE Math (EN)' },
    };

    /** PvP 狀態：idle → matching → countdown → playing → result */
    let pvpState = 'idle';
    /** 對戰模式：human 真人配對（示範）| ai Rowena Bot */
    let pvpMode = 'human';
    let pvpCategory = 'math_ch';
    let pvpTimer = null;
    let pvpCountdown = 3;
    let pvpPlayTimer = null;
    let pvpPlaySecondsLeft = 90;

    /** 當前題目：{ question, options: {A,B,C,D}, correct } */
    let pvpQuestion = null;
    let pvpQuestionLoading = false;
    let pvpQuestionError = '';

    let pvpBattleStartMs = 0;
    let pvpUserAnswer = null;
    let pvpUserAnswerSec = null;
    let pvpUserSubmitted = false;

    let pvpAiAnswer = null;
    let pvpAiAnswerSec = null;
    let pvpAiReady = false;
    let pvpAiTask = null;

    let pvpResultPayload = null;

    function pvpEscapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function pvpSleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /** 從 Gemini 回覆中擷取 JSON（支援 ```json 區塊） */
    function pvpExtractJson(text) {
        if (!text) return null;
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced) {
            try {
                return JSON.parse(fenced[1].trim());
            } catch (_) { /* fallthrough */ }
        }
        try {
            return JSON.parse(text.trim());
        } catch (_) { /* fallthrough */ }
        const brace = text.match(/\{[\s\S]*\}/);
        if (brace) {
            try {
                return JSON.parse(brace[0]);
            } catch (_) { /* fallthrough */ }
        }
        return null;
    }

    /** 正規化 MC 題目結構 */
    function pvpNormalizeQuestion(raw, fallbackCategory) {
        if (!raw || typeof raw !== 'object') return null;
        const options = raw.options || raw.choices || {};
        const letters = ['A', 'B', 'C', 'D'];
        const normalized = {};
        letters.forEach((L) => {
            const v = options[L] ?? options[L.toLowerCase()] ?? raw[`option_${L}`] ?? raw[L];
            if (v != null) normalized[L] = String(v).trim();
        });
        if (letters.some((L) => !normalized[L])) return null;
        let correct = String(raw.correct ?? raw.answer ?? raw.correctAnswer ?? '')
            .trim()
            .toUpperCase()
            .replace(/[^A-D]/g, '');
        if (!correct || !letters.includes(correct)) return null;
        const question = String(raw.question ?? raw.stem ?? raw.title ?? '').trim();
        if (!question) return null;
        return { question, options: normalized, correct, category: fallbackCategory };
    }

    /** 示範用靜態題（真人配對模式，無 RAG） */
    function pvpFallbackQuestion(category) {
        const q = {
            math_ch: {
                question: '若 sin θ = 3/5 且 θ 為銳角，求 cos θ 的值。',
                options: { A: '4/5', B: '3/4', C: '5/4', D: '4/3' },
                correct: 'A',
            },
            math_en: {
                question: 'If sin θ = 3/5 and θ is acute, find cos θ.',
                options: { A: '4/5', B: '3/4', C: '5/4', D: '4/3' },
                correct: 'A',
            },
            chinese: {
                question: '下列哪一項最能概括「借景抒情」的寫作手法？',
                options: {
                    A: '直接抒發內心感受，不描寫景物',
                    B: '借助景物描寫寄託作者情感',
                    C: '以議論為主，說理明志',
                    D: '純粹記敘事件經過',
                },
                correct: 'B',
            },
            english: {
                question: 'Which option best describes "show, don\'t tell" in writing?',
                options: {
                    A: 'State emotions directly without details',
                    B: 'Use vivid actions and details to convey meaning',
                    C: 'List facts only',
                    D: 'Avoid any figurative language',
                },
                correct: 'B',
            },
        };
        const base = q[category] || q.math_ch;
        return { ...base, category };
    }

    /** 經 RAG 生成單道 PvP 選擇題 */
    async function pvpGenerateQuestionRAG(category) {
        const meta = PVP_SUBJECT_META[category] || PVP_SUBJECT_META.math_ch;
        // 前端不再檢查或直接使用金鑰，改由後端根據聊天室（category）決定
        const userPrompt =
            `請嚴格依 DSE 官方指引，為【${meta.label}】生成「一題」四選一（MC）練習題。\n` +
            `要求：\n` +
            `1. 題幹清晰，四個選項標示 A、B、C、D，且僅有一個正確答案。\n` +
            `2. 難度符合 DSE 考生水平，勿偏離考綱。\n` +
            `3. 僅輸出 JSON，不要其他說明，格式如下：\n` +
            `{"question":"題幹文字","options":{"A":"選項A","B":"選項B","C":"選項C","D":"選項D"},"correct":"A"}`;

        const resp = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: userPrompt, chatRoomId: category })
        });
        if (!resp.ok) throw new Error('API error');
        const respData = await resp.json();
        const raw = respData.text || respData.result || respData.message || '';
        const parsed = pvpNormalizeQuestion(pvpExtractJson(raw), category);
        if (!parsed) {
            throw new Error('AI 回傳的題目格式無法解析，請再試一局。');
        }
        return parsed;
    }

    function pvpBuildAiAnswerPrompt(q) {
        const opts = ['A', 'B', 'C', 'D']
            .map((L) => `${L}. ${q.options[L]}`)
            .join('\n');
        return (
            `你正在參加 DSE 限時對戰，請根據官方評分與學科指引，選出下列選擇題的唯一正確答案。\n` +
            `題目：${q.question}\n選項：\n${opts}\n\n` +
            `請僅回覆一個大寫字母 A、B、C 或 D，不要附加解釋。`
        );
    }

    function pvpParseAiAnswerLetter(text) {
        if (!text) return null;
        const upper = String(text).trim().toUpperCase();
        const m = upper.match(/\b([ABCD])\b/);
        return m ? m[1] : null;
    }

    /** 啟動 AI 虛擬對手：背景 RAG 作答 + 15~25 秒思考延遲 */
    function pvpStartAiOpponent() {
        pvpAiReady = false;
        pvpAiAnswer = null;
        pvpAiAnswerSec = null;
        if (pvpAiTask && pvpAiTask.cancel) pvpAiTask.cancel();

        const category = pvpQuestion?.category || pvpCategory;
        const thinkMs = 15000 + Math.floor(Math.random() * 10001);
        const battleStart = pvpBattleStartMs || Date.now();
        let cancelled = false;

        pvpAiTask = {
            cancel: () => {
                cancelled = true;
            },
        };

        (async () => {
            try {
                // 向後端請求 AI 作答，後端會根據 chatRoomId 決定使用哪個 API 金鑰
                const ragPromise = (async () => {
                    try {
                        const resp = await fetch('/api/process', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: pvpBuildAiAnswerPrompt(pvpQuestion), chatRoomId: category })
                        });
                        if (!resp.ok) return null;
                        const d = await resp.json();
                        return pvpParseAiAnswerLetter(d.text || d.result || d.message || '');
                    } catch (e) {
                        return null;
                    }
                })();

                const delayPromise = pvpSleep(thinkMs);
                const [letter] = await Promise.all([ragPromise, delayPromise]);
                if (cancelled) return;

                pvpAiAnswer = letter || pvpQuestion.correct;
                pvpAiAnswerSec = Math.max(0, (Date.now() - battleStart) / 1000);
                pvpAiReady = true;
                pvpTryFinalizeBattle();
                pvpRefreshUi();
            } catch (err) {
                console.error('[Rowena PvP] AI opponent failed:', err);
                if (cancelled) return;
                pvpAiAnswer = pvpQuestion?.correct || 'A';
                pvpAiAnswerSec = thinkMs / 1000;
                pvpAiReady = true;
                pvpTryFinalizeBattle();
                pvpRefreshUi();
            }
        })();
    }

    function pvpClearPlayTimer() {
        if (pvpPlayTimer) {
            clearInterval(pvpPlayTimer);
            pvpPlayTimer = null;
        }
    }

    function pvpFormatTimer(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function pvpStartPlayTimer() {
        pvpClearPlayTimer();
        pvpPlaySecondsLeft = 90;
        pvpPlayTimer = setInterval(() => {
            pvpPlaySecondsLeft--;
            const el = document.getElementById('pvp-timer');
            if (el) el.textContent = pvpFormatTimer(pvpPlaySecondsLeft);
            if (pvpPlaySecondsLeft <= 0) {
                pvpClearPlayTimer();
                if (!pvpUserSubmitted) {
                    pvpUserAnswer = null;
                    pvpUserSubmitted = true;
                    pvpUserAnswerSec = 90;
                    pvpTryFinalizeBattle();
                }
            }
        }, 1000);
    }

    /** 判定勝負（正確性優先，再比答題時間） */
    function pvpComputeResult() {
        const correct = pvpQuestion?.correct;
        const userCorrect = pvpUserAnswer === correct;
        const aiCorrect = pvpAiAnswer === correct;
        const userSec = pvpUserAnswerSec ?? 999;
        const aiSec = pvpAiAnswerSec ?? 999;

        let outcome = 'draw';
        let headline = '本局平手';
        let detail = '雙方表現接近，再接再厲！';

        if (userCorrect && !aiCorrect) {
            outcome = 'win';
            headline = '恭喜你擊敗 AI！';
            detail = '你答對了，Rowena Bot 答錯。';
        } else if (!userCorrect && aiCorrect) {
            outcome = 'lose';
            headline = '很遺憾，AI 導師答對了';
            detail = '本題 AI 正確，請再接再厲。';
        } else if (userCorrect && aiCorrect) {
            if (userSec < aiSec - 0.05) {
                outcome = 'win';
                headline = '恭喜你擊敗 AI！';
                detail = `雙方皆答對，你的用時 ${userSec.toFixed(1)} 秒快於 AI 的 ${aiSec.toFixed(1)} 秒。`;
            } else if (aiSec < userSec - 0.05) {
                outcome = 'lose';
                headline = '很遺憾，AI 導師答題速度比你快！';
                detail = `雙方皆答對，AI 用時 ${aiSec.toFixed(1)} 秒，你用時 ${userSec.toFixed(1)} 秒。`;
            } else {
                outcome = 'draw';
                headline = '勢均力敵！';
                detail = '雙方皆答對且用時相近。';
            }
        } else {
            outcome = 'lose';
            headline = '本局 AI 略勝一籌';
            detail = '雙方皆未答對，請複習考點後再戰。';
        }

        return {
            outcome,
            headline,
            detail,
            userCorrect,
            aiCorrect,
            userSec,
            aiSec,
            userAnswer: pvpUserAnswer,
            aiAnswer: pvpAiAnswer,
            correct,
        };
    }

    function pvpTryFinalizeBattle() {
        if (pvpMode !== 'ai') return;
        if (!pvpUserSubmitted || !pvpAiReady) return;
        if (pvpState === 'result') return;

        pvpClearPlayTimer();
        pvpResultPayload = pvpComputeResult();
        pvpState = 'result';
        pvpRefreshUi();
    }

    function pvpSelectAnswer(letter) {
        if (pvpState !== 'playing' || pvpUserSubmitted) return;
        pvpUserAnswer = letter;
        document.querySelectorAll('[data-pvp-option]').forEach((btn) => {
            const on = btn.dataset.pvpOption === letter;
            btn.classList.toggle('border-deep-blue', on);
            btn.classList.toggle('bg-off-white', on);
        });
    }

    function pvpSubmitAnswer() {
        if (pvpState !== 'playing' || pvpUserSubmitted) return;
        if (!pvpUserAnswer) {
            pvpShowToast('請先選擇一個答案', 'amber');
            return;
        }
        pvpUserSubmitted = true;
        pvpUserAnswerSec = Math.max(0, (Date.now() - pvpBattleStartMs) / 1000);

        if (pvpMode === 'ai') {
            if (!pvpAiReady) {
                pvpShowToast('已提交！等待 Rowena Bot 完成思考…', 'blue');
            }
            pvpTryFinalizeBattle();
            pvpRefreshUi();
            return;
        }

        pvpClearPlayTimer();
        pvpResultPayload = {
            outcome: 'win',
            headline: '本局勝利（示範）',
            detail: '真人配對為示範流程，請使用「挑戰 AI 智能導師」體驗完整 RAG 對戰。',
            userCorrect: pvpUserAnswer === pvpQuestion?.correct,
            aiCorrect: false,
            userSec: pvpUserAnswerSec,
            aiSec: 0,
            userAnswer: pvpUserAnswer,
            aiAnswer: '—',
            correct: pvpQuestion?.correct,
        };
        pvpState = 'result';
        pvpRefreshUi();
    }

    function pvpShowToast(message, tone) {
        let toast = document.getElementById('pvp-result-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pvp-result-toast';
            toast.className =
                'fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-full text-xs tracking-wide shadow-lg transition-all duration-300 opacity-0 pointer-events-none';
            document.body.appendChild(toast);
        }
        const colors = {
            win: 'bg-calm-mint text-white',
            lose: 'bg-joyful-amber text-deep-blue',
            draw: 'bg-deep-blue text-white',
            blue: 'bg-pvp-accent text-white',
            amber: 'bg-joyful-amber/90 text-deep-blue',
        };
        const key = tone || 'blue';
        toast.className =
            `fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-full text-xs tracking-wide shadow-lg transition-all duration-300 ${colors[key] || colors.blue}`;
        toast.textContent = message;
        toast.classList.remove('opacity-0', 'pointer-events-none');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
            toast.classList.add('opacity-0', 'pointer-events-none');
        }, 3200);
    }

    function pvpRenderResultBanner() {
        if (!pvpResultPayload) return '';
        const r = pvpResultPayload;
        const bannerClass =
            r.outcome === 'win'
                ? 'border-calm-mint/40 bg-calm-mint/10'
                : r.outcome === 'lose'
                  ? 'border-joyful-amber/40 bg-joyful-amber/10'
                  : 'border-deep-blue/20 bg-off-white';
        const scoreLabel =
            r.outcome === 'win' ? '勝利 +18 分' : r.outcome === 'lose' ? '敗場 +3 分' : '平手 +8 分';

        return `
            <div class="mb-4 p-4 rounded-xl border ${bannerClass} text-center animate-[fadeIn_0.4s_ease-out]">
                <p class="text-base font-medium text-deep-blue">${pvpEscapeHtml(r.headline)}</p>
                <p class="text-xs text-slate-gray mt-2 leading-relaxed">${pvpEscapeHtml(r.detail)}</p>
            </div>
            <div class="space-y-4 text-sm">
                <div class="flex justify-between items-center p-4 bg-off-white rounded-lg">
                    <span>本局結果</span>
                    <span class="${r.outcome === 'win' ? 'text-calm-mint' : r.outcome === 'lose' ? 'text-joyful-amber' : 'text-deep-blue'} font-medium">${scoreLabel}</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
                    <div class="p-3 sayo-border rounded-lg">
                        <p class="text-slate-gray">你的答案</p>
                        <p class="text-lg text-deep-blue mt-1">${r.userAnswer || '—'} ${r.userCorrect ? '✓' : '✗'}</p>
                    </div>
                    <div class="p-3 sayo-border rounded-lg">
                        <p class="text-slate-gray">AI 答案</p>
                        <p class="text-lg text-deep-blue mt-1">${r.aiAnswer || '—'} ${r.aiCorrect ? '✓' : '✗'}</p>
                    </div>
                    <div class="p-3 sayo-border rounded-lg">
                        <p class="text-slate-gray">你的用時</p>
                        <p class="text-lg text-deep-blue mt-1">${r.userSec != null ? r.userSec.toFixed(1) + 's' : '—'}</p>
                    </div>
                    <div class="p-3 sayo-border rounded-lg">
                        <p class="text-slate-gray">AI 用時</p>
                        <p class="text-lg text-deep-blue mt-1">${r.aiSec != null ? r.aiSec.toFixed(1) + 's' : '—'}</p>
                    </div>
                </div>
                <p class="text-[10px] text-slate-gray text-center">正確答案：${pvpEscapeHtml(r.correct || '')}</p>
            </div>`;
    }

    function pvpRenderPlayingArea() {
        if (pvpQuestionLoading) {
            return `
                <div class="flex flex-col items-center justify-center py-16">
                    <div class="w-10 h-10 rounded-full sayo-border border-t-deep-blue animate-spin mb-4" style="border-top-width:2px"></div>
                    <p class="text-sm text-deep-blue">Rowena 正在透過 RAG 出題中…</p>
                    <p class="text-[10px] text-slate-gray mt-2 tracking-widest">Supabase · Gemini</p>
                </div>`;
        }
        if (pvpQuestionError) {
            return `<p class="text-sm text-slate-gray py-8 text-center">${pvpEscapeHtml(pvpQuestionError)}</p>`;
        }
        if (!pvpQuestion) {
            return `<p class="text-sm text-slate-gray py-8 text-center">題目載入中…</p>`;
        }

        const opponentLabel =
            pvpMode === 'ai'
                ? '你 vs <span class="text-pvp-accent font-medium">Rowena Bot · AI 導師</span>'
                : '你 vs <span class="text-deep-blue">同級考生（示範）</span>';

        const aiStatus =
            pvpMode === 'ai'
                ? `<span class="text-[10px] px-2 py-0.5 rounded-full sayo-border ${pvpAiReady ? 'text-calm-mint' : 'text-joyful-amber'}">${pvpAiReady ? 'AI 已作答' : 'AI 思考中…'}</span>`
                : '';

        const optionsHtml = ['A', 'B', 'C', 'D']
            .map(
                (L) => `
            <button type="button" data-pvp-option="${L}"
                class="p-3 text-sm sayo-border rounded-lg hover:border-deep-blue text-left transition-colors ${pvpUserAnswer === L ? 'border-deep-blue bg-off-white' : ''}"
                ${pvpUserSubmitted ? 'disabled' : ''}>
                ${L}. ${pvpEscapeHtml(pvpQuestion.options[L])}
            </button>`
            )
            .join('');

        return `
            <div class="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-gray mb-4">
                <span>${opponentLabel}</span>
                <div class="flex items-center gap-2">
                    ${aiStatus}
                    <span class="font-mono text-joyful-amber" id="pvp-timer">${pvpFormatTimer(pvpPlaySecondsLeft)}</span>
                </div>
            </div>
            <p class="text-sm text-deep-blue mb-4 leading-relaxed">${pvpEscapeHtml(pvpQuestion.question)}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">${optionsHtml}</div>
            <button type="button" id="pvp-btn-submit"
                class="w-full text-xs py-2.5 bg-deep-blue text-white rounded-full tracking-wider hover:bg-slate-800 transition-all disabled:opacity-50"
                ${pvpUserSubmitted ? 'disabled' : ''}>
                ${pvpUserSubmitted && pvpMode === 'ai' && !pvpAiReady ? '等待 AI 完成作答…' : '提交答案'}
            </button>`;
    }

    function pvpRenderPanel(tool) {
        const myForm = typeof global.RowenaUser !== 'undefined' ? global.RowenaUser.getProfile().form : 6;
        const statusMap = {
            idle: {
                label: '待機',
                sub: '選擇對戰模式與學科，開始挑戰',
                color: 'text-slate-gray',
            },
            matching: {
                label: pvpMode === 'ai' ? '準備 AI 對戰' : '配對中',
                sub:
                    pvpMode === 'ai'
                        ? `Rowena Bot 正在準備 · ${PVP_SUBJECT_META[pvpCategory]?.tab || ''}題庫（RAG）…`
                        : `正在匹配 Form ${myForm} · 綜合題庫…`,
                color: 'text-joyful-amber',
            },
            countdown: { label: '即將開始', sub: '', color: 'text-deep-blue' },
            playing: { label: '對戰中', sub: '限時單題決勝 · 請專注作答', color: 'text-deep-blue' },
            result: { label: '本局結束', sub: '查看對戰結果與得分', color: 'text-calm-mint' },
        };
        const s = statusMap[pvpState] || statusMap.idle;

        const subjectTabs = Object.entries(PVP_SUBJECT_META)
            .map(
                ([id, m]) => `
            <button type="button" data-pvp-subject="${id}"
                class="pvp-subject-tab text-[10px] px-2.5 py-1 rounded-full sayo-border transition-colors ${id === pvpCategory ? 'bg-deep-blue text-white border-deep-blue' : 'text-slate-gray hover:border-deep-blue'}"
                ${pvpState !== 'idle' ? 'disabled' : ''}>
                ${m.tab}
            </button>`
            )
            .join('');

        return `
            <header class="mb-6">
                <p class="text-[10px] text-slate-gray tracking-widest mb-1">競技模式</p>
                <h1 class="text-2xl text-deep-blue font-light tracking-wide">${tool.name}</h1>
                <p class="text-sm text-slate-gray mt-2">與同級考生或 Rowena AI 導師限時答題。AI 模式將透過 RAG 檢索 DSE 官方指引後出題與作答。</p>
            </header>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-1 sayo-border rounded-xl bg-pure-white p-6 flex flex-col items-center justify-center min-h-[240px] ${pvpState === 'matching' ? 'pvp-pulse' : ''}">
                    <p class="text-[10px] tracking-widest text-slate-gray mb-2">配對狀態</p>
                    <p class="text-lg font-medium ${s.color}" id="pvp-status-label">${s.label}</p>
                    <p class="text-xs text-slate-gray mt-2 text-center px-2" id="pvp-status-sub">${s.sub}</p>
                    ${pvpState === 'countdown' ? `<div class="text-5xl font-light text-deep-blue mt-4" id="pvp-countdown">${pvpCountdown}</div>` : ''}
                    ${pvpState === 'idle' ? `
                        <div class="flex flex-wrap gap-1.5 justify-center mt-4 mb-2">${subjectTabs}</div>
                        <button type="button" data-pvp-start="human"
                            class="mt-3 w-full max-w-[220px] text-xs px-5 py-2.5 sayo-border rounded-full hover:border-deep-blue transition-all">
                            開始配對（真人 · 示範）
                        </button>
                        <button type="button" data-pvp-start="ai"
                            class="mt-2 w-full max-w-[220px] text-xs px-6 py-3 bg-pvp-accent text-white rounded-full tracking-wider hover:bg-deep-blue transition-all">
                            挑戰 AI 智能導師（Rowena Bot）
                        </button>
                    ` : ''}
                    ${pvpState === 'result' ? `
                        <button type="button" data-pvp-reset
                            class="mt-6 text-xs px-6 py-2.5 sayo-border rounded-full hover:border-deep-blue">再戰一局</button>
                    ` : ''}
                </div>
                <div class="lg:col-span-2 sayo-border rounded-xl bg-pure-white p-6">
                    <h3 class="text-xs tracking-widest text-deep-blue mb-4">對戰準備 / 答題區</h3>
                    ${pvpState === 'playing' ? pvpRenderPlayingArea() : ''}
                    ${pvpState === 'result' ? pvpRenderResultBanner() : ''}
                    ${pvpState !== 'playing' && pvpState !== 'result' ? `
                        <p class="text-sm text-slate-gray leading-relaxed">
                            ${pvpMode === 'ai'
                                ? '選擇學科後點擊「挑戰 AI 智能導師」，系統將以 RAG 生成題目；AI 會在 15~25 秒內完成思考並作答。'
                                : '真人配對為示範流程；完整 RAG 對戰請使用 Rowena Bot 模式。'}
                        </p>
                        <ul class="mt-4 text-xs text-slate-gray space-y-2">
                            <li>· 單題限時 90 秒</li>
                            <li>· AI 模式：Supabase 向量庫 + Gemini 2.5 Flash</li>
                            <li>· 提交後比對正誤與答題時間</li>
                        </ul>
                    ` : ''}
                </div>
            </div>`;
    }

    function pvpRefreshUi() {
        const root = document.getElementById('workspace-root');
        if (!root) return;
        const tool = { name: 'PVP', id: 'pvp' };
        root.innerHTML = pvpRenderPanel(tool);
        pvpBindEvents();
        if (pvpState === 'result' && pvpResultPayload) {
            pvpShowToast(pvpResultPayload.headline, pvpResultPayload.outcome);
        }
    }

    async function pvpBeginMatch(mode) {
        pvpMode = mode === 'ai' ? 'ai' : 'human';
        pvpState = 'matching';
        pvpQuestion = null;
        pvpQuestionError = '';
        pvpQuestionLoading = mode === 'ai';
        pvpUserSubmitted = false;
        pvpUserAnswer = null;
        pvpUserAnswerSec = null;
        pvpAiReady = false;
        pvpAiAnswer = null;
        pvpAiAnswerSec = null;
        pvpResultPayload = null;
        if (pvpAiTask?.cancel) pvpAiTask.cancel();
        pvpRefreshUi();

        try {
            if (pvpMode === 'ai') {
                pvpQuestion = await pvpGenerateQuestionRAG(pvpCategory);
            } else {
                await pvpSleep(800);
                pvpQuestion = pvpFallbackQuestion(pvpCategory);
            }
        } catch (err) {
            console.error('[Rowena PvP] question generation failed:', err);
            pvpQuestionError = err.message || '出題失敗';
            pvpQuestion = pvpFallbackQuestion(pvpCategory);
        } finally {
            pvpQuestionLoading = false;
        }

        await pvpSleep(pvpMode === 'ai' ? 600 : 1200);
        pvpState = 'countdown';
        pvpCountdown = 3;
        pvpRefreshUi();

        if (pvpTimer) clearInterval(pvpTimer);
        pvpTimer = setInterval(() => {
            pvpCountdown--;
            const el = document.getElementById('pvp-countdown');
            if (el) el.textContent = pvpCountdown;
            if (pvpCountdown <= 0) {
                clearInterval(pvpTimer);
                pvpTimer = null;
                pvpState = 'playing';
                pvpBattleStartMs = Date.now();
                pvpRefreshUi();
                pvpStartPlayTimer();
                if (pvpMode === 'ai') pvpStartAiOpponent();
            }
        }, 1000);
    }

    function pvpReset() {
        pvpState = 'idle';
        pvpUserSubmitted = false;
        pvpResultPayload = null;
        if (pvpTimer) clearInterval(pvpTimer);
        pvpTimer = null;
        pvpClearPlayTimer();
        if (pvpAiTask?.cancel) pvpAiTask.cancel();
        pvpRefreshUi();
    }

    function pvpBindEvents() {
        document.querySelectorAll('[data-pvp-start]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (pvpState !== 'idle') return;
                pvpBeginMatch(btn.dataset.pvpStart);
            });
        });
        document.querySelectorAll('[data-pvp-subject]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (pvpState !== 'idle') return;
                pvpCategory = btn.dataset.pvpSubject;
                pvpRefreshUi();
            });
        });
        document.querySelectorAll('[data-pvp-option]').forEach((btn) => {
            btn.addEventListener('click', () => pvpSelectAnswer(btn.dataset.pvpOption));
        });
        document.getElementById('pvp-btn-submit')?.addEventListener('click', pvpSubmitAnswer);
        document.querySelector('[data-pvp-reset]')?.addEventListener('click', pvpReset);
    }

    function pvpMount(tool) {
        return pvpRenderPanel(tool);
    }

    function pvpAfterMount() {
        pvpBindEvents();
    }

    global.RowenaPvp = {
        mount: pvpMount,
        afterMount: pvpAfterMount,
        reset: pvpReset,
        beginMatch: pvpBeginMatch,
        getState: () => pvpState,
    };

    global.startPvpMatch = function (mode) {
        if (pvpState === 'idle') pvpBeginMatch(mode || 'human');
    };

    // ── 共用：Markdown · 報告 Modal · 診斷快取 ─────────────────────────────
    function rowenaMarkdownToHtml(md) {
        return renderMarkdownToHtml(md);
    }
    function reportGetLatest() { return global.RowenaReportStore?.getLatest?.() || null; }
    let reportModalBound = false;
    function reportSyncViews() {
        const latest = reportGetLatest();
        const html = latest?.diagnosticMarkdown ? rowenaMarkdownToHtml(latest.diagnosticMarkdown) : '';
        const body = document.getElementById('report-ai-modal-body');
        const sub = document.getElementById('report-ai-modal-subtitle');
        const panel = document.getElementById('report-ai-panel-content');
        if (body) body.innerHTML = html || '<p class="text-sm text-slate-gray text-center py-12">尚無診斷報告</p>';
        if (sub && latest) sub.textContent = `${latest.subjectLabel || ''} · ${new Date(latest.updatedAt).toLocaleString('zh-HK')}`;
        if (panel && html) panel.innerHTML = html;
        if (body) typesetMath(body);
        if (panel) typesetMath(panel);
    }
    function reportOpenModal() {
        const m = document.getElementById('report-ai-modal');
        if (!m) return;
        reportSyncViews();
        m.classList.add('is-open');
        m.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    function reportCloseModal() {
        const m = document.getElementById('report-ai-modal');
        if (!m) return;
        m.classList.remove('is-open');
        m.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    function reportBindModal() {
        if (reportModalBound) return;
        reportModalBound = true;
        document.querySelectorAll('[data-report-modal-close]').forEach((el) => el.addEventListener('click', reportCloseModal));
        document.getElementById('btn-report-practice-mock')?.addEventListener('click', reportGoToMockPractice);
        document.getElementById('btn-report-goto-panel')?.addEventListener('click', () => { reportCloseModal(); global.rowenaSelectTool?.('report-ai'); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') reportCloseModal(); });
    }
    function reportBuildPracticeBrief(md, sub) {
        const a = md.match(/##\s*三、行動建議[\s\S]*?(?=##|$)/i);
        const b = a?.[0] || md.slice(0, 1200);
        return `【診斷練習需求】科目：${SUBJECT_META[sub]?.label || sub}\n${b}\n請設計 DSE 針對性 Mock 卷。`;
    }
    function reportGoToMockPractice() {
        const latest = reportGetLatest();
        const sub = latest?.subjectCategory || checkSubject;
        global.RowenaMockPaper?.setPracticeFromDiagnostic?.(reportBuildPracticeBrief(latest?.diagnosticMarkdown || '', sub), true);
        reportCloseModal();
        global.rowenaSelectTool?.(SUBJECT_META[sub]?.toolId || 'zh-mock');
    }

    // ── Check 卷 AI（智能批改）────────────────────────────────────────────
    const CHECK_LOADING = 'Rowena 正在辨識試卷並批改中…';
    let checkSubject = 'chinese', checkFileDataUrl = '', checkMimeType = '', checkFileName = '';
    let checkReportMarkdown = '', checkIsGrading = false, checkError = '';
    let checkUserPromptText = '請幫我批改這張考卷，嚴格依照 DSE 官方評分標準逐題給分，並列出改進建議。';
    let checkIsDiagnosing = false, checkDiagnosticError = '', checkDiagnosticProgressPct = 8;

    async function checkSyncLeaderboard(md) {
        const ex = global.RowenaLeaderboard?.extractScoreFromCheckReport;
        const score = typeof ex === 'function' ? ex(md) : null;
        if (score == null || typeof global.updateUserStats !== 'function') return;
        try {
            await global.updateUserStats(score);
            if (document.getElementById('leaderboard-root')) global.fetchAndRenderLeaderboard?.();
        } catch (e) { console.warn('[Check] leaderboard', e); }
    }
    function checkRenderPanel(tool) {
        const meta = SUBJECT_META[checkSubject];
        const tabs = Object.entries(SUBJECT_META).map(([id, m]) =>
            `<button type="button" data-check-subject="${id}" class="text-[10px] px-2.5 py-1 rounded-full sayo-border ${id === checkSubject ? 'bg-deep-blue text-white' : ''}" ${checkIsGrading || checkIsDiagnosing ? 'disabled' : ''}>${m.tab}</button>`).join('');
        let resultHtml = '<p class="text-sm text-slate-gray text-center py-16">上傳試卷後點擊「🚀 開始 AI 批改」</p>';
        if (checkIsGrading) resultHtml = `<div class="py-16 text-center"><div class="w-10 h-10 border-t-2 border-deep-blue rounded-full animate-spin mx-auto mb-4"></div><p id="check-loading-message">${CHECK_LOADING}</p></div>`;
        else if (checkError) resultHtml = `<p class="text-xs text-slate-gray text-center py-12">${escapeHtml(checkError)}</p>`;
        else if (checkReportMarkdown) {
            let banner = '';
            if (checkIsDiagnosing) banner = `<div class="mb-4 p-4 rounded-xl border border-pvp-accent/30 bg-pvp-accent/5"><p class="text-xs text-deep-blue">Rowena 導師正在撰寫深度診斷報告…</p><div class="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden"><div id="check-diagnostic-progress-bar" class="h-full bg-pvp-accent transition-all" style="width:${checkDiagnosticProgressPct}%"></div></div></div>`;
            else if (reportGetLatest()?.diagnosticMarkdown) banner = `<div class="mb-3 flex gap-2"><button type="button" id="btn-check-view-diagnostic" class="text-[10px] px-3 py-1.5 bg-pvp-accent text-white rounded-full">📊 查看診斷報告</button><button type="button" id="btn-check-goto-report" class="text-[10px] px-3 py-1 sayo-border rounded-full">報告 AI 面板</button></div>`;
            resultHtml = banner + `<article>${rowenaMarkdownToHtml(checkReportMarkdown)}</article>`;
        }
        return `<div id="check-paper-root" class="flex flex-col flex-1"><header class="mb-5"><p class="text-[10px] text-slate-gray">Check 卷 AI</p><h1 class="text-2xl text-deep-blue font-light">${escapeHtml(tool.name)}</h1><p class="text-sm text-slate-gray mt-2">RAG 評分標準 + Gemini 2.5 Flash 批改，完成後自動生成報告 AI 診斷。</p></header>
        <div class="sayo-border rounded-xl bg-pure-white p-4 mb-4 flex flex-wrap gap-2">${tabs}</div>
        <div class="sayo-border rounded-xl bg-pure-white p-4 mb-4 flex flex-wrap gap-3 items-center">
            <label class="text-xs px-4 py-2 sayo-border rounded-full cursor-pointer ${checkIsGrading || checkIsDiagnosing ? 'opacity-40 pointer-events-none' : ''}">選擇檔案<input id="check-file-input" type="file" class="hidden" accept=".pdf,.png,.jpg,.jpeg" /></label>
            <button type="button" id="btn-check-grade" class="text-xs px-6 py-2.5 bg-deep-blue text-white rounded-full" ${!checkFileDataUrl || checkIsGrading || checkIsDiagnosing ? 'disabled' : ''}>🚀 開始 AI 批改</button>
            <span class="text-[10px] text-slate-gray">${escapeHtml(meta?.label || '')}</span>
        </div>
        <section class="sayo-border rounded-xl bg-pure-white p-6 min-h-[280px]" id="check-report-preview">${resultHtml}</section>
        <textarea id="check-user-prompt" class="w-full mt-4 text-xs p-3 sayo-border rounded-lg" rows="2" ${checkIsGrading || checkIsDiagnosing ? 'disabled' : ''}>${escapeHtml(checkUserPromptText)}</textarea></div>`;
    }
    function checkReRender() {
        const w = document.getElementById('workspace-root');
        if (w) { w.innerHTML = checkRenderPanel({ name: 'Check 卷 AI（智能批改）', id: 'check-paper' }); checkBindEvents(); }
    }
    async function checkRunDiagnostic(apiKey) {
        if (!checkReportMarkdown) return;
        reportBindModal();
        checkIsDiagnosing = true;
        checkReRender();
        const timer = setInterval(() => {
            checkDiagnosticProgressPct = Math.min(92, checkDiagnosticProgressPct + 8);
            const b = document.getElementById('check-diagnostic-progress-bar');
            if (b) b.style.width = checkDiagnosticProgressPct + '%';
        }, 800);
        try {
            await global.generateDiagnosticReport(checkReportMarkdown, checkSubject, apiKey, () => {});
            reportSyncViews();
            await new Promise((r) => setTimeout(r, 300));
            reportOpenModal();
        } catch (e) { checkDiagnosticError = e.message; }
        finally { clearInterval(timer); checkIsDiagnosing = false; checkReRender(); }
    }
    async function checkStartGrading() {
        if (checkIsGrading || checkIsDiagnosing || !checkFileDataUrl) return;
        const apiKey = getApiKey(checkSubject);
        if (!apiKey?.startsWith('AIza')) { checkError = '請設定 API 金鑰'; checkReRender(); return; }
        checkUserPromptText = document.getElementById('check-user-prompt')?.value?.trim() || checkUserPromptText;
        checkIsGrading = true; checkError = ''; checkReportMarkdown = ''; reportCloseModal(); checkReRender();
        try {
            checkReportMarkdown = await global.analyzeUploadedPaper(checkFileDataUrl, checkMimeType, checkSubject, checkUserPromptText, apiKey, (m) => {
                const el = document.getElementById('check-loading-message'); if (el) el.textContent = m;
            });
            await checkSyncLeaderboard(checkReportMarkdown);
        } catch (e) { checkError = e.message; checkIsGrading = false; checkReRender(); return; }
        checkIsGrading = false; checkReRender();
        if (checkReportMarkdown) await checkRunDiagnostic(apiKey);
    }
    function checkBindEvents() {
        document.querySelectorAll('[data-check-subject]').forEach((b) => b.addEventListener('click', () => { if (!checkIsGrading && !checkIsDiagnosing) { checkSubject = b.dataset.checkSubject; checkReRender(); } }));
        document.getElementById('check-file-input')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            if (f.size > 12 * 1024 * 1024) { checkError = '檔案需小於 12MB'; checkReRender(); return; }
            const r = new FileReader();
            r.onload = () => { checkFileDataUrl = r.result; checkMimeType = f.type || 'image/jpeg'; checkFileName = f.name; checkReportMarkdown = ''; checkReRender(); };
            r.readAsDataURL(f);
        });
        document.getElementById('btn-check-grade')?.addEventListener('click', checkStartGrading);
        document.getElementById('btn-check-view-diagnostic')?.addEventListener('click', () => { reportBindModal(); reportOpenModal(); });
        document.getElementById('btn-check-goto-report')?.addEventListener('click', () => global.rowenaSelectTool?.('report-ai'));
    }
    global.RowenaCheckPaper = {
        mount: checkRenderPanel,
        afterMount: () => { checkBindEvents(); reportBindModal(); },
        resetForToolSwitch: () => { if (!checkIsGrading && !checkIsDiagnosing) checkError = ''; },
        isGrading: () => checkIsGrading || checkIsDiagnosing,
        setSubject: (s) => { if (SUBJECT_META[s]) checkSubject = s; },
    };

    // ── 報告 AI 獨立面板 ───────────────────────────────────────────────────
    function reportRenderPanel(tool) {
        const latest = reportGetLatest();
        if (!latest?.diagnosticMarkdown) {
            return `<div id="report-ai-root" class="flex-1"><header class="mb-6"><h1 class="text-2xl text-deep-blue font-light">${escapeHtml(tool.name)}</h1></header>
            <section class="sayo-border rounded-xl bg-pure-white p-12 text-center"><p class="text-sm text-deep-blue mb-2">目前尚無診斷數據</p><p class="text-xs text-slate-gray mb-6">請先使用 Check 卷 AI 提交考卷</p>
            <button type="button" id="btn-report-goto-check" class="text-xs px-6 py-3 bg-pvp-accent text-white rounded-full">前往 Check 卷 AI</button></section></div>`;
        }
        return `<div id="report-ai-root" class="flex-1 flex flex-col min-h-0"><header class="mb-4 flex justify-between items-end"><div><h1 class="text-2xl text-deep-blue font-light">${escapeHtml(tool.name)}</h1><p class="text-xs text-slate-gray mt-1">${escapeHtml(latest.subjectLabel || '')}</p></div>
        <button type="button" id="btn-report-open-modal" class="text-[10px] px-3 py-1 sayo-border rounded-full">全螢幕</button></header>
        <section class="sayo-border rounded-xl bg-pure-white flex-1 overflow-hidden flex flex-col"><div id="report-ai-panel-content" class="flex-1 overflow-y-auto p-6">${rowenaMarkdownToHtml(latest.diagnosticMarkdown)}</div>
        <footer class="p-4 border-t"><button type="button" id="btn-report-panel-practice" class="w-full text-xs py-3 bg-deep-blue text-white rounded-full">依據建議重新練習</button></footer></section></div>`;
    }
    function reportBindPanelEvents() {
        document.getElementById('btn-report-goto-check')?.addEventListener('click', () => global.rowenaSelectTool?.('check-paper'));
        document.getElementById('btn-report-open-modal')?.addEventListener('click', () => { reportBindModal(); reportOpenModal(); });
        document.getElementById('btn-report-panel-practice')?.addEventListener('click', reportGoToMockPractice);
    }
    global.RowenaReportAI = {
        mount: reportRenderPanel,
        afterMount: () => { reportBindPanelEvents(); reportBindModal(); },
        resetForToolSwitch: () => {},
        isBusy: () => global.RowenaCheckPaper?.isGrading?.() || false,
        bindModal: reportBindModal,
        refresh: reportSyncViews,
        openModal: reportOpenModal,
    };

    global.resetPvp = pvpReset;
})(window);
