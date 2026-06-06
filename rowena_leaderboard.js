/**
 * Rowena 全港 DSE 榮譽排行榜 — Supabase user_stats
 * 排序：平均分 ↓ → 同分時提交卷數 ↓
 */
(function (global) {
    const TABLE = 'user_stats';
    const TOP_N = 10;
    let supabaseClient = null;

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function initSupabase() {
        if (supabaseClient) return supabaseClient;
        const cfg = global.RowenaRAG?.SUPABASE_CONFIG;
        if (!cfg?.url || cfg.url.startsWith('YOUR_')) {
            throw new Error('沒有範例數據');
        }
        if (!global.supabase?.createClient) throw new Error('未載入 Supabase SDK。');
        supabaseClient = global.supabase.createClient(cfg.url, cfg.anonKey);
        return supabaseClient;
    }

    function getLocalUserId() {
        const KEY = 'rowena_leaderboard_user_id';
        let id = localStorage.getItem(KEY);
        if (!id) {
            id = `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            localStorage.setItem(KEY, id);
        }
        return id;
    }

    function getUsername() {
        return global.RowenaUser?.getProfile()?.name?.trim() || 'Learner';
    }

    function sortRows(rows) {
        return [...rows].sort((a, b) => {
            const d = (Number(b.average_score) || 0) - (Number(a.average_score) || 0);
            if (d !== 0) return d;
            return (Number(b.total_papers) || 0) - (Number(a.total_papers) || 0);
        });
    }

    function rankBadge(rank) {
        if (rank === 1) return '<span class="lb-medal lb-medal-gold">👑</span>';
        if (rank === 2) return '<span class="lb-medal lb-medal-silver">🥈</span>';
        if (rank === 3) return '<span class="lb-medal lb-medal-bronze">🥉</span>';
        return `<span class="font-mono text-xs text-slate-gray">${String(rank).padStart(2, '0')}</span>`;
    }

    function renderTable(rows, me) {
        if (!rows.length) {
            return '<p class="text-sm text-slate-gray text-center py-16">尚無排行榜數據，請先使用 Check 卷 AI 完成批改。</p>';
        }
        const body = rows.map((r, i) => {
            const rank = i + 1;
            const name = r.username || '—';
            const rc = rank === 1 ? 'lb-row-gold' : rank === 2 ? 'lb-row-silver' : rank === 3 ? 'lb-row-bronze' : name === me ? 'lb-row-you' : '';
            return `<tr class="lb-row ${rc} border-b border-gray-50">
                <td class="py-4 pl-6 text-center">${rankBadge(rank)}</td>
                <td class="py-4 px-2 text-sm text-deep-blue font-medium">${escapeHtml(name)}${name === me ? ' <span class="text-[9px] bg-deep-blue text-white px-1.5 py-0.5 rounded-full">你</span>' : ''}</td>
                <td class="py-4 px-2 text-center font-mono text-sm">${Number(r.total_papers) || 0}</td>
                <td class="py-4 pr-6 text-right font-semibold text-pvp-accent">${(Number(r.average_score) || 0).toFixed(1)}<span class="text-[10px] text-slate-gray font-normal"> /100</span></td>
            </tr>`;
        }).join('');
        return `<table class="w-full"><thead><tr class="text-[10px] text-slate-gray border-b border-gray-100">
            <th class="py-3 pl-6 text-center">名次</th><th class="py-3 px-2">用戶名稱</th>
            <th class="py-3 px-2 text-center">累計提交卷數</th><th class="py-3 pr-6 text-right">官方認證平均分</th>
        </tr></thead><tbody>${body}</tbody></table>`;
    }

    async function fetchAndRenderLeaderboard(containerId) {
        const wrap = document.getElementById(containerId || 'leaderboard-table-wrap');
        const status = document.getElementById('leaderboard-status');
        const me = getUsername();
        if (wrap) wrap.innerHTML = '<div class="py-16 text-center"><div class="w-10 h-10 border-t-2 border-pvp-accent rounded-full animate-spin mx-auto mb-3"></div><p class="text-sm">載入排行榜…</p></div>';
        try {
            const { data, error } = await initSupabase().from(TABLE).select('*');
            if (error) throw error;
            const top = sortRows(data || []).slice(0, TOP_N);
            if (wrap) wrap.innerHTML = renderTable(top, me);
            if (status) status.textContent = `已更新 · Top ${TOP_N} · ${new Date().toLocaleTimeString('zh-HK')}`;
        } catch (err) {
            if (wrap) wrap.innerHTML = `<p class="text-xs text-slate-gray text-center py-12">${escapeHtml(err.message)}</p>`;
            if (status) status.textContent = '載入失敗';
        }
    }

    async function updateUserStats(score) {
        const num = Math.min(100, Math.max(0, Math.round(Number(score) * 10) / 10));
        if (!Number.isFinite(num)) throw new Error('分數無效');
        const user_id = getLocalUserId();
        const username = getUsername();
        const client = initSupabase();
        const { data: row } = await client.from(TABLE).select('*').eq('user_id', user_id).maybeSingle();
        let payload;
        if (row) {
            const total_papers = (Number(row.total_papers) || 0) + 1;
            const total_score = (Number(row.total_score) || 0) + num;
            payload = { username, total_papers, total_score, average_score: Math.round((total_score / total_papers) * 10) / 10, updated_at: new Date().toISOString() };
            await client.from(TABLE).update(payload).eq('id', row.id);
        } else {
            payload = { user_id, username, total_papers: 1, total_score: num, average_score: num, updated_at: new Date().toISOString() };
            await client.from(TABLE).insert(payload);
        }
        return payload;
    }

    function extractScoreFromCheckReport(md) {
        if (!md) return null;
        const t = String(md);
        const m = t.match(/總分[：:\s]*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i) ||
            t.match(/(?:總分|得分)[：:\s]*(\d+(?:\.\d+)?)/i);
        if (!m) return null;
        const got = parseFloat(m[1]);
        const out = m[2] ? parseFloat(m[2]) : 100;
        return Math.round((got / out) * 1000) / 10;
    }

    function mountPanel(tool) {
        return `<div id="leaderboard-root" class="flex flex-col flex-1 min-h-0">
            <header class="mb-6 p-6 md:p-8 rounded-2xl sayo-border bg-gradient-to-br from-pvp-accent/10 to-joyful-amber/5">
                <p class="text-[10px] text-slate-gray tracking-widest">HONG KONG DSE</p>
                <h1 class="text-2xl text-deep-blue font-light mt-1">${escapeHtml(tool?.name || '📊 榮譽排行榜')}</h1>
                <p class="text-sm text-slate-gray mt-2">平均分優先；同分以 Mock 卷提交數量排名。</p>
                <p id="leaderboard-status" class="text-[10px] text-slate-gray mt-2">準備載入…</p>
            </header>
            <section class="sayo-border rounded-xl bg-pure-white flex-1 overflow-hidden flex flex-col">
                <div class="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                    <span class="text-xs tracking-widest text-deep-blue">🏆 Top ${TOP_N}</span>
                    <button type="button" id="btn-leaderboard-refresh" class="text-[10px] px-3 py-1 sayo-border rounded-full">重新整理</button>
                </div>
                <div id="leaderboard-table-wrap" class="flex-1 overflow-auto p-2"></div>
            </section>
        </div>`;
    }

    function afterMountPanel() {
        document.getElementById('btn-leaderboard-refresh')?.addEventListener('click', () => fetchAndRenderLeaderboard());
        fetchAndRenderLeaderboard();
    }

    global.fetchAndRenderLeaderboard = fetchAndRenderLeaderboard;
    global.updateUserStats = updateUserStats;
    global.RowenaLeaderboard = {
        mount: mountPanel,
        afterMount: afterMountPanel,
        extractScoreFromCheckReport,
        extractScoreFromMarkdown: extractScoreFromCheckReport,
    };
})(window);
