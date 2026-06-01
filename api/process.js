export default async function handler(req, res) {
    // 🛡️ 限制只允許 POST 請求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允許 POST 請求 (Method Not Allowed)' });
    }

    // 📥 1. 接收從前端 rowena_pdf_uploader.html 傳送過來的資料
    const { text, subject, paper, docType, fileName, chatRoomId } = req.body;

    // 基本防錯檢查
    if (!text || !chatRoomId) {
        return res.status(400).json({ error: '遺失必要的參數：text 或 chatRoomId' });
    }

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

        // 🔄 後備機制：如果這個聊天室沒有專屬金鑰，使用預設的第 7 個通用金鑰
        if (!selectedKey) {
            console.log(`[路由規則] 找不到聊天室 ${chatRoomId} 的特定金鑰，切換為 DEFAULT_GEMINI_API_KEY。`);
            selectedKey = process.env.DEFAULT_GEMINI_API_KEY;
        } else {
            console.log(`[路由規則] 成功匹配！聊天室 ${chatRoomId} 正在使用獨立的專屬指定金鑰。`);
        }

        if (!selectedKey) {
            throw new Error(`無法為聊天室 ${chatRoomId} 配置任何有效的 Gemini API 金鑰，請檢查 Vercel 環境變數。`);
        }

        // 🧠 4. 呼叫 Gemini embedding-001 模型轉向量 (採用 v1beta 穩定端點)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${selectedKey}`;
        
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/embedding-001',
                content: { 
                    parts: [{ text: text }] 
                }
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

        // ⚡ 5. 使用最高權限的 Service Role Key 安全寫入 Supabase (避開資料庫 RLS 限制)
        const supabaseUrl = `${process.env.SUPABASE_URL}/rest/v1/documents`;
        
        const supabaseRes = await fetch(supabaseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Prefer': 'return=minimal' // 節省後端頻寬，不回傳整筆寫入的資料
            },
            body: JSON.stringify({
                content: text,
                embedding: embedding, // 768維度向量
                metadata: { 
                    subject: subject || null, 
                    paper: paper || null, 
                    doc_type: docType || null, 
                    source_file: fileName || 'unknown', 
                    chat_room_id: chatRoomId, // 🚀 寫入房間標籤！未來的 RAG 可以精準過濾聊天室
                    upload_type: 'pdf_batch_vercel_v2' 
                }
            })
        });

        if (!supabaseRes.ok) {
            const supabaseErrText = await supabaseRes.ok ? '' : await supabaseRes.text();
            throw new Error(`Supabase 寫入失敗: ${supabaseErrText}`);
        }

        // 🎉 6. 全部成功，回傳成功響應給前端
        return res.status(200).json({ 
            success: true, 
            message: `聊天室 ${chatRoomId} 數據片段向量化並安全存入 Supabase 成功` 
        });

    } catch (error) {
        console.error("【後端處理錯誤】:", error.message);
        // 回傳 500 伺服器錯誤代碼給前端
        return res.status(500).json({ error: error.message });
    }
}