/**
 * Rowena 用戶系統（localStorage）
 * 名稱：最多 12 英文字元單位，或 6 中文字（中文每字計 2 單位，上限 12）
 */
(function (global) {
    const PROFILE_KEY = 'rowena_user_profile';
    const PROFILE_MODAL_STATE_KEY = 'rowena_profile_modal_open';
    const EXAM_SCORES_KEY = 'rowena_exam_scores';

    const DEFAULT_PROFILE = {
        name: 'Learner',
        form: 6,
        avatar: null,
        pvpScore: 0,
    };

    function loadProfile() {
        try {
            const raw = localStorage.getItem(PROFILE_KEY);
            if (!raw) return { ...DEFAULT_PROFILE };
            return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
        } catch {
            return { ...DEFAULT_PROFILE };
        }
    }

    // ===== Exam scores (local storage) =====
    function loadExamScores() {
        try {
            const raw = localStorage.getItem(EXAM_SCORES_KEY);
            if (!raw) return {};
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }

    function saveExamScores(obj) {
        try {
            localStorage.setItem(EXAM_SCORES_KEY, JSON.stringify(obj || {}));
        } catch (e) {
            /* ignore */
        }
    }

    function setExamScore(subjectCode, percentScore) {
        if (!subjectCode) return;
        const scores = loadExamScores();
        const v = Number(percentScore);
        if (!Number.isFinite(v) || v < 0) return;
        scores[subjectCode] = Math.min(100, Math.max(0, Math.round(v * 10) / 10));
        saveExamScores(scores);
        return scores[subjectCode];
    }

    function getExamScore(subjectCode) {
        const scores = loadExamScores();
        return scores[subjectCode] == null ? null : Number(scores[subjectCode]);
    }

    function getAllExamScores() {
        return loadExamScores();
    }

    function computeAverageExamScore() {
        const scores = loadExamScores();
        const keys = Object.keys(scores || {}).filter(k => scores[k] != null && scores[k] !== '');
        if (!keys.length) return null;
        const sum = keys.reduce((s, k) => s + Number(scores[k] || 0), 0);
        return Math.round((sum / keys.length) * 10) / 10;
    }

    function saveProfile(profile) {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }

    function isCJK(ch) {
        return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(ch);
    }

    function getNameUnits(str) {
        let units = 0;
        for (const ch of str) {
            units += isCJK(ch) ? 2 : 1;
        }
        return units;
    }

    function isValidName(str) {
        const trimmed = str.trim();
        if (!trimmed) return false;
        return getNameUnits(trimmed) <= 12;
    }

    function nameLimitHint(str) {
        const u = getNameUnits(str);
        return `已用 ${u}/12 單位（英文每字 1、中文每字 2，最多 12 英文或 6 中文）`;
    }

    function getInitials(name) {
        const t = name.trim();
        if (!t) return '?';
        const first = t[0];
        if (isCJK(first)) return first;
        return t.slice(0, 2).toUpperCase();
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function avatarHtml(profile, sizeClass) {
        const cls = sizeClass || 'w-8 h-8';
        if (profile.avatar) {
            return `<img src="${profile.avatar}" alt="" class="${cls} rounded-full object-cover sayo-border shrink-0" />`;
        }
        return `<span class="${cls} rounded-full bg-off-white sayo-border flex items-center justify-center text-deep-blue font-medium shrink-0 text-xs">${escapeHtml(getInitials(profile.name))}</span>`;
    }

    let profile = loadProfile();
    let modalEl = null;

    function renderHeaderChip(container) {
        if (!container) return;
        const formLabel = `Form ${profile.form}`;
        container.innerHTML = `
            <span class="hidden md:inline text-xs text-slate-gray">${escapeHtml(formLabel)} · 🏆 <span data-rowena-pvp-score>${profile.pvpScore || 0}</span> · 今日已學 <span class="text-deep-blue font-medium">1h 12m</span></span>
            <button type="button" id="rowena-user-btn" class="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full hover:bg-off-white transition-colors sayo-border border-transparent hover:border-gray-200" aria-label="開啟個人主頁">
                ${avatarHtml(profile, 'w-8 h-8')}
                <span class="text-xs text-deep-blue font-medium max-w-[96px] truncate hidden sm:inline" id="rowena-user-name">${escapeHtml(profile.name)}</span>
            </button>
        `;
        container.querySelector('#rowena-user-btn')?.addEventListener('click', openProfileModal);
    }

    function injectModal() {
        if (document.getElementById('rowena-profile-modal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'rowena-profile-modal';
        const persistedOpen = localStorage.getItem(PROFILE_MODAL_STATE_KEY) === '1';
        const params = new URLSearchParams(window.location.search);
        const shouldOpen = params.get('profileOpen') === '1';
        const isInitiallyOpen = persistedOpen || shouldOpen;
        const baseClass = 'fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center transition-opacity duration-300';
        wrap.className = isInitiallyOpen ? baseClass : `${baseClass} opacity-0 pointer-events-none`;
        wrap.innerHTML = `
            <div class="bg-pure-white sayo-border rounded-xl p-6 md:p-8 max-w-md w-full mx-4 shadow-sm" role="dialog" aria-labelledby="profile-modal-title">
                <div class="flex justify-between items-center border-b border-gray-100 pb-3 mb-6">
                    <h2 id="profile-modal-title" class="text-sm tracking-widest text-deep-blue">個人主頁</h2>
                </div>
                <div class="flex flex-col items-center mb-6">
                    <div id="profile-avatar-preview" class="mb-3"></div>
                    <div class="flex gap-4 text-[10px] tracking-widest">
                        <label class="text-slate-gray cursor-pointer hover:text-deep-blue">
                            更換頭貼
                            <input type="file" id="profile-avatar-input" accept="image/jpeg,image/png,image/webp" class="hidden" />
                        </label>
                        <button type="button" id="profile-avatar-remove" class="text-slate-gray hover:text-deep-blue hidden">移除頭貼</button>
                    </div>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="text-[10px] text-slate-gray tracking-widest block mb-1">顯示名稱</label>
                        <input type="text" id="profile-name-input" class="w-full text-sm px-3 py-2.5 rounded-lg bg-off-white sayo-border focus:outline-none focus:border-deep-blue" maxlength="24" />
                        <p id="profile-name-hint" class="text-[10px] text-slate-gray mt-1"></p>
                        <p id="profile-name-error" class="text-[10px] text-red-600 mt-1 hidden"></p>
                    </div>
                    <div>
                        <label class="text-[10px] text-slate-gray tracking-widest block mb-1">年級</label>
                        <select id="profile-form-select" class="w-full text-sm px-3 py-2.5 rounded-lg bg-off-white sayo-border focus:outline-none focus:border-deep-blue text-deep-blue">
                            ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">Form ${n}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="flex gap-3 mt-8 pt-4 border-t border-gray-100">
                    <button type="button" id="profile-leave-btn" class="flex-1 text-xs py-2.5 sayo-border rounded-full text-slate-gray hover:border-deep-blue transition-colors">離開</button>
                    <button type="button" id="profile-save-btn" class="flex-1 text-xs py-2.5 bg-deep-blue text-white rounded-full tracking-wider hover:bg-slate-800 transition-all">儲存</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
        modalEl = wrap;

        document.getElementById('profile-leave-btn')?.addEventListener('click', closeProfileModal);

        const nameInput = document.getElementById('profile-name-input');
        nameInput?.addEventListener('input', () => {
            const hint = document.getElementById('profile-name-hint');
            const err = document.getElementById('profile-name-error');
            if (hint) hint.textContent = nameLimitHint(nameInput.value);
            if (err) {
                err.classList.toggle('hidden', isValidName(nameInput.value));
                err.textContent = isValidName(nameInput.value) ? '' : '名稱過長：最多 12 個英文或 6 個中文。';
            }
        });

        document.getElementById('profile-avatar-input')?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file || file.size > 512000) {
                if (file) alert('圖片請小於 512KB');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                profile.avatar = reader.result;
                updateModalAvatarPreview();
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('profile-avatar-remove')?.addEventListener('click', () => {
            profile.avatar = null;
            const input = document.getElementById('profile-avatar-input');
            if (input) input.value = '';
            updateModalAvatarPreview();
        });

        document.getElementById('profile-save-btn')?.addEventListener('click', () => {
            const nameInputEl = document.getElementById('profile-name-input');
            const formSelect = document.getElementById('profile-form-select');
            const name = nameInputEl?.value.trim() || '';
            if (!isValidName(name)) {
                const err = document.getElementById('profile-name-error');
                if (err) {
                    err.classList.remove('hidden');
                    err.textContent = '名稱過長：最多 12 個英文或 6 個中文。';
                }
                return;
            }
            profile.name = name;
            profile.form = parseInt(formSelect?.value || '6', 10);
            saveProfile(profile);
            syncAllHeaders();
        });
    }

    function updateModalAvatarPreview() {
        const el = document.getElementById('profile-avatar-preview');
        if (el) el.innerHTML = avatarHtml(profile, 'w-20 h-20 text-lg');
        const removeBtn = document.getElementById('profile-avatar-remove');
        if (removeBtn) removeBtn.classList.toggle('hidden', !profile.avatar);
    }

    function openProfileModal(isInstant = false) {
        injectModal();
        profile = loadProfile();
        const nameInput = document.getElementById('profile-name-input');
        const formSelect = document.getElementById('profile-form-select');
        if (nameInput) {
            nameInput.value = profile.name;
            document.getElementById('profile-name-hint').textContent = nameLimitHint(profile.name);
        }
        if (formSelect) formSelect.value = String(profile.form);
        document.getElementById('profile-name-error')?.classList.add('hidden');
        updateModalAvatarPreview();

        if (isInstant) {
            modalEl?.classList.remove('duration-300');
        }

        modalEl?.classList.remove('opacity-0', 'pointer-events-none');

        if (isInstant) {
            setTimeout(() => modalEl?.classList.add('duration-300'), 50);
        }

        try {
            localStorage.setItem(PROFILE_MODAL_STATE_KEY, '1');
        } catch (e) {
            /* ignore storage errors */
        }
    }

    function closeProfileModal() {
        modalEl?.classList.add('opacity-0', 'pointer-events-none');
        try {
            localStorage.removeItem(PROFILE_MODAL_STATE_KEY);
        } catch (e) {
            /* ignore storage errors */
        }
    }

    function syncAllHeaders() {
        profile = loadProfile();
        document.querySelectorAll('[data-rowena-user-header]').forEach(renderHeaderChip);
        document.querySelectorAll('[data-rowena-form-label]').forEach((el) => {
            el.textContent = `Form ${profile.form}`;
        });
        document.querySelectorAll('[data-rowena-pvp-score]').forEach((el) => {
            el.textContent = profile.pvpScore || 0;
        });
        if (typeof global.onRowenaProfileUpdated === 'function') {
            global.onRowenaProfileUpdated(profile);
        }
    }

    function init(selector) {
        profile = loadProfile();
        injectModal();
        const container = document.querySelector(selector);
        if (container) {
            container.setAttribute('data-rowena-user-header', '1');
            renderHeaderChip(container);
        }

        const params = new URLSearchParams(window.location.search);
        const shouldOpen = params.get('profileOpen') === '1';
        const persistedOpen = localStorage.getItem(PROFILE_MODAL_STATE_KEY) === '1';
        if (shouldOpen || persistedOpen) {
            openProfileModal(true); // instant open on initialization
        }
    }

    global.RowenaUser = {
        init,
        loadProfile,
        getProfile: () => loadProfile(),
        getInitials,
        isValidName,
        avatarHtml,
        escapeHtml,
        // exam scores API
        setExamScore,
        getExamScore,
        getAllExamScores,
        computeAverageExamScore,
        addPvpScore: function (scoreToAdd) {
            try {
                const current = loadProfile();
                const newScore = Math.max(0, (current.pvpScore || 0) + (scoreToAdd || 0));
                current.pvpScore = newScore;
                saveProfile(current);
                syncAllHeaders();
                return newScore;
            } catch (e) {
                console.error('Error adding PvP score:', e);
                return (loadProfile().pvpScore || 0);
            }
        },
    };
})(window);
