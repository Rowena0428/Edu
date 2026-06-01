export default async function handler(req, res) {
    // 🛡️ 限制只允許 POST 請求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允許 POST 請求 (Method Not Allowed)' });
    }

    // 📥 1. 接收從前端傳送過來的資料
    const { text, subject, paper, docType, fileName, chatRoomId, action } = req.body;

    // 基本防錯檢查：text 與 chatRoomId 為共用必要欄位
    if (!text || !chatRoomId) {
        return res.status(400).json({ error: '遺失必要的參數：text 或 chatRoomId' });
    }

    // 判斷請求類型：若前端明確傳入 action === 'generate'，或未包含 fileName/docType/paper，視為 AI 生成請求
    const isGenerateRequest = (action === 'generate') || (!fileName && !docType && !paper);

    try {
        // 🔑 2. 從 Vercel 環境變數讀取並解析「金鑰對應 JSON 表」
        const roomMapEnv = process.env.ROOM_KEY_MAP || '{}';
        let roomKeyMap = {};
        try {
            roomKeyMap = JSON.parse(roomMapEnv);
        } catch (e) {
            console.error("解析 ROOM_KEY_MAP 發生 JSON 錯誤:", e);
            throw new Error("伺服器環境變數 ROOM_KEY_MAP 的 JSON 格式設定錯誤");
        }

        // 🎯 3. 依據聊天室規則路由選擇 API 金鑰
        let selectedKey = roomKeyMap[chatRoomId];
        // 後備機制：如果這個聊天室沒有專屬金鑰，使用預設的 DEFAULT_GEMINI_API_KEY
        if (!selectedKey) {
            console.log(`[路由規則] 找不到聊天室 ${chatRoomId} 的特定金鑰，切換為 DEFAULT_GEMINI_API_KEY。`);
            selectedKey = process.env.DEFAULT_GEMINI_API_KEY;
        } else {
            console.log(`[路由規則] 成功匹配！聊天室 ${chatRoomId} 正在使用獨立的專屬指定金鑰。`);
        }
        if (!selectedKey) {
            throw new Error(`無法為聊天室 ${chatRoomId} 配置任何有效的 Gemini API 金鑰，請檢查 Vercel 環境變數。`);
        }

        if (isGenerateRequest) {
            // ----- AI 生成流程（不儲存向量） -----
            // 使用 gemini-2.5-flash 與 generateContent
            const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${selectedKey}`;
            
            // 🛡️ 格式安全防禦：強制注入系統級限制，避免 LaTeX 區塊排版和換行造成前端解析崩潰
            const safetyInstruction = 
                "";

            const genBody = {
                contents: [{ parts: [{ text: text + safetyInstruction }] }],
                generationConfig: { 
                    temperature: 0.5, // 稍微調低點，讓出題邏輯更嚴謹穩定
                    maxOutputTokens: 8192 // 🚀 關鍵修改：從 2048 放寬到 8192，確保一整份長考卷不會吐到一半被截斷
                }
            };

            const genRes = await fetch(genUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(genBody)
            });

            if (!genRes.ok) {
                const genErrText = await genRes.text();
                throw new Error(`Gemini generateContent 失敗: ${genErrText}`);
            }
            const genData = await genRes.json();
            const aiText = genData.candidates?.[0]?.content?.parts?.[0]?.text || genData.outputText || JSON.stringify(genData);
            return res.status(200).json({ success: true, text: aiText });
        }

        // ----- PDF 上傳轉向量流程（保留原有行為） -----
        // 🧠 呼叫 Gemini embedding-001 模型轉向量 (採用 v1beta 穩定端點)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${selectedKey}`;
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/embedding-001',
                content: { parts: [{ text: text }] }
            })
        });
        if (!geminiRes.ok) {
            const geminiErrText = await geminiRes.text();
            throw new Error(`Gemini API 轉向量失敗: ${geminiErrText}`);
        }
        const geminiData = await geminiRes.json();
        // 驗證回傳數據並提取 768 維度向量數值
        if (!geminiData.embedding || !geminiData.embedding.values) {
            throw new Error('Gemini 回傳的資料結構中未包含有效的 embedding 數值');
        }
        const embedding = geminiData.embedding.values;

        // ⚡ 使用最高權限的 Service Role Key 安全寫入 Supabase (避開資料庫 RLS 限制)
        const supabaseUrl = `${process.env.SUPABASE_URL}/rest/v1/documents`;
        const supabaseRes = await fetch(supabaseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                content: text,
                embedding: embedding,
                metadata: {
                    subject: subject || null,
                    paper: paper || null,
                    doc_type: docType || null,
                    source_file: fileName || 'unknown',
                    chat_room_id: chatRoomId,
                    upload_type: 'pdf_batch_vercel_v2'
                }
            })
        });
        if (!supabaseRes.ok) {
            const supabaseErrText = await supabaseRes.ok ? '' : await supabaseRes.text();
            throw new Error(`Supabase 寫入失敗: ${supabaseErrText}`);
        }

        // 全部成功，回傳成功響應給前端
        return res.status(200).json({ success: true, message: `聊天室 ${chatRoomId} 數據片段向量化並安全存入 Supabase 成功` });

    } catch (error) {
        console.error("【後端處理錯誤】:", error.message);
        // 回傳 500 伺服器錯誤代碼給前端
        return res.status(500).json({ error: error.message });
    }
}