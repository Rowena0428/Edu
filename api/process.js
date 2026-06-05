const PVP_PROMPTS = {
    chinese: `你現在是 DSE 中文科對戰題庫系統。請出一道適合快速搶答的中文科（範文或語文常識）單項選擇題。
必須嚴格以 JSON 格式輸出，禁止任何 Markdown 語法、禁止 \`\`\`json 區塊、禁止任何前後前言。
輸出格式範例：
{"question": "題目敘述", "options": ["A選項","B選項","C選項","D選項"], "answer": "A"}`,

    english: `You are now the DSE English language battle question bank system. Generate a single multiple-choice question suitable for quick competitive answering from the DSE English syllabus.
Output STRICTLY in JSON format only. NO Markdown syntax, NO \`\`\`json blocks, NO preamble or explanations.
Output format example:
{"question": "question text", "options": ["Option A","Option B","Option C","Option D"], "answer": "A"}`,

    math_ch: `你現在是 DSE 數學科對戰題庫系統。請出一道適合 1 分鐘內快速心算或簡單筆算完畢的數學選擇題（LaTeX公式請用 $ 格式）。
必須嚴格以 JSON 格式輸出，禁止任何 Markdown 語法、禁止 \`\`\`json 區塊、禁止任何前後前言。
輸出格式範例：
{"question": "題目敘述", "options": ["A選項","B選項","C選項","D選項"], "answer": "B"}`,

    math_en: `You are now the DSE Mathematics battle question bank system. Generate a single multiple-choice question solvable within 1 minute by quick mental or simple calculation (use $ format for LaTeX formulas).
Output STRICTLY in JSON format only. NO Markdown syntax, NO \`\`\`json blocks, NO preamble or explanations.
Output format example:
{"question": "question text", "options": ["Option A","Option B","Option C","Option D"], "answer": "C"}`,
};

const ORIGINAL_PROMPTS = {
    chinese: String.raw`你現在是香港考評局 (HKEAA) 的中文科出卷專家。請生成一份高擬真度的 DSE 中文科模擬試卷（包含卷一及卷二），嚴格遵守官方最新排版與結構。
【官方試卷編號與抬頭要求】：
- 你必須在試卷的最頂端，嚴格依序輸出標準的 DSE 中文科官方編號與抬頭格式，禁止任何 AI 的自我介紹、前言或開場白。
【嚴格題目編號要求】：
- 試卷中的所有題目（包括卷一閱讀能力的甲部與乙部問答題、卷二寫作能力的題目），【必須強制在每題開頭加上清晰的連續數字題號】（例如：「1.」、「2.」、「3.」）。絕對禁止出現沒有題號的孤立題目，以便系統精準識別。
【結構要求】：
1. 卷一（閱讀能力）：必須分為「甲部：指定閱讀 (30%)」及「乙部：閱讀能力考材 (70%)」。
   - 【甲部致命限制：絕對禁止印出文章】：甲部考核的是香港教育局 (EDB) 的指定文言經典學習材料（即 12 篇範文）。你【絕對不要／禁止】在試卷中生成、提供或印出任何課文或文章原文！請直接輸出針對指定篇章（如《論仁、論孝、論君子》、《魚我所欲也》、《始得西山宴遊記》、《六國論》、《出師表》等）的測驗題目，要求考生根據對課文的記憶與理解直接作答。題型須包括文言字詞解釋、句意理解及寫作手法分析。
   - 乙部：提供兩篇課外考材（一篇白話文、一篇文言文），此部分【必須】提供完整的文章白話文與文言文考材，供考生閱讀後作答。
   - 【排版極度嚴格 - 選擇題與分題】：多項選擇題的 A、B、C、D 選項，以及所有題目的分題（務必使用加粗的 **(a)**, **(b)**, **(c)** 防止轉換為版權符號），【必須嚴格垂直排列】。【致命要求】：為了在 Markdown 中正確渲染垂直排版，你【必須在每個選項之間、每個分題之間「空一行」（使用雙換行 / Double Enter）】，絕對不能擠在同一行或只使用單次換行。
   - 【排版極度嚴格 - 卷一作答線】：卷一的所有問答題、闡述題或長題目，必須確保題目考核內容精準簡練，並【必須在題目下方提供適當行數的空白底線（例如：\n＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿\n＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿）】供考生作答。【絕對不要】輸出「限寫兩行」等任何幕後提示文字。
   - 【表格優化】：使用標準且乾淨的 Markdown 表格語法，儲存格內的文字必須高度精簡以防排版錯亂。
2. 卷二（寫作能力）：必須分為「甲部：實用寫作 (30%)」及「乙部：命題寫作 (70%)」。
   - 甲部：設定一情境並提供短小閱讀材料，要求撰寫實用文。必須列明「禁止使用真實姓名」，並提供指定名字（英秀、一心、幼羚、家寶、念慈、思賢、有容、向華、修端、允行）供選用。【致命要求：卷二絕對不要】提供任何作答底線。
   - 乙部：提供 3 條寫作題目，註明只需選答一題（必須分別標註題號為 1.、2.、3.）。【致命要求：卷二絕對不要】提供任何作答底線。
3. 分數標示：請以 Markdown 格式輸出。每道分題末尾【必須】清楚標示佔分（例如：(2分)）。
【致命要求】：因為這是用於學生的模擬試卷，你【絕對不要】提供答案、評分參考或 Marking Scheme！請直接從以下格式開始輸出：

# 202X-DSE-CHIN 1 & 2
## 香港考試及評核局 202X年香港中學文憑考試
## 中國語文 試卷一及試卷二

### 試卷一：閱讀能力
#### 甲部：指定閱讀 (30%)
1. `,
    english: String.raw`You are an expert HKDSE English Language paper setter. Please generate a highly realistic DSE-style mock exam (Paper 1 and Paper 2) that strictly follows the official HKEAA formatting.
【Official Paper Code & Header Requirement】：
- You MUST output the official DSE English paper code and exam header at the very top of the document using Markdown headings. NO conversational intro text or greetings from AI.
【STRICT QUESTION NUMBERING REQUIREMENT】：
- Every single question in Paper 1 and choices in Paper 2 【MUST be strictly and sequentially numbered using standard digits】 (e.g., "1.", "2.", "3."). Never omit the question number at the beginning of any question block.
【Structure Requirements】：
1. Paper 1 (Reading): Must include 'Part A' (Compulsory), 'Part B1' (Easier section), and 'Part B2' (More difficult section), each with its own reading passages. Question types MUST mimic official exams.
   - 【CRITICAL FORMATTING FOR MCQs & SUB-QUESTIONS】: Options A, B, C, D and sub-parts (use bolded **(a)**, **(b)**, **(c)** to prevent copyright symbol rendering) MUST be displayed strictly vertically. 【CRITICAL】: To ensure proper Markdown rendering, you MUST leave a BLANK LINE (use a double line break / double enter) between EVERY option and EVERY sub-part. Do not use single line breaks.
   - 【CRITICAL FORMATTING FOR TABLES】: Use standard and clean Markdown table syntax. Keep text inside cells highly concise to prevent layout breaks.
2. Paper 2 (Writing): Must include 'Part A' (~200 words) and 'Part B' (~400 words). For Part B, provide 3 to 4 distinct choices (strictly numbered as Question 1, 2, 3, etc.). DO NOT provide detailed bullet points, hints, or long lists of instructions. Keep the prompts extremely concise. You MUST include the instruction: "Do not use your real name. If no name is provided, use 'Chris Wong'."
3. Mark Allocation: Use Markdown. For Paper 1, EVERY question MUST have exact marks (e.g., [1 mark]). For Paper 2, Part A and each question in Part B MUST be strictly labelled as [21 marks].
【CRITICAL REQUIREMENT】: Generate ONLY the exam questions. Do NOT generate an answer key, hints, or Marking Scheme. Please start your output strictly from the following format:

# 202X-DSE-ENG LANG 1 & 2
## HONG KONG EXAMINATIONS AND ASSESSMENT AUTHORITY
## ENGLISH LANGUAGE PAPERS 1 & 2

### PAPER 1: READING
#### PART A (Compulsory)
1. `,
    math_ch: String.raw`你現在是香港考評局 (HKEAA) 數學科（必修部分）的出卷專家。請生成一份高擬真度的 DSE 數學模擬試卷（只生成試卷一 Paper 1，不包含 any 選擇題），嚴格遵守官方排版。
【官方試卷編號與抬頭要求】：
- 你必須在試卷的最頂端，嚴格依序輸出標準的 DSE 官方編號與抬頭資訊，禁止任何開場白或 AI 內部思考。
【嚴格題目編號要求】：
- 全卷【必須剛好包含 19 條題目】。這 19 條題目必須嚴格、連續地按順序從 1 編號至 19（即 1., 2., ..., 19.）。每條題目開頭必須強制輸出其數字題號，絕對不能出現中斷或漏寫。
【結構與配分要求】：
1. 結構與配分：試卷一必須分為「甲部(1)」(第1至9題，基礎題目)、「甲部(2)」(第10至14題，中階題目) 與「乙部」(第15至19題，高階題目)。【極度重要：每部的總分必須剛好為 35 分，全卷總分為 105 分】。
2. 題型與內容：全卷均為傳統問答題（絕對不要出選擇題）。
   - 【排版極度嚴格】：長題目必須分拆為加粗的 **(a)**, **(b)**, **(c)**。所有題目的分題【必須嚴格垂直排列】。【致命要求】：為了在 Markdown 中正確渲染垂直排版，你【必須在每個分題之間「空一行」（使用雙換行 / Double Enter）】，絕對不能擠在同一行或只使用單次換行。
   - 【字字限制】：長題目的每一個分題文字敘述【必須極度精簡，最多不能超過兩行文字】。
   - 【無圖表限制：致命純文字描述規範】：
     因為本系統無法生成任何圖片、圖表或幾何附圖，你【絕對禁止】使用「如圖所示」、「圖中所示...」等涉及圖形的字眼，也【絕對不能】輸出「[請想像一張圖]」等任何預留位置符號。所有幾何題、圓方程、三角學或坐標題，你必須完全改用精確的數學文字與代數條件來精準描述圖形結構（例如：將「圖中所示的三角形」改寫為「設 $ABC$ 為一三角形，其中 $AB=5$、\angle ABC=90^{\circ}」），確保考生僅憑文字敘述就能完全推導出幾何關係並完美作答。
【極度重要：第 19 題的終極要求】：
   - 必須是結合「軌跡與圓方程」、「三角形四心」、「配方法」及「坐標變換」的綜合題。
   - 第 19 題的 **(c)** 或 **(d)** 部份必須為「證明題」。
   - 第 19 題所有分題的佔分加起來，【總分必須剛好為 12 分】（例如：(a) 3分, (b) 4分, (c) 5分）。
3. 分數標示：以 Markdown 格式輸出，每道分題末尾清楚標示滿分（如：(3分)）。
【極度重要】：只需生成試卷內容，絕對不要提供解答或評分參考！請直接從以下格式開始輸出：

# 202X-DSE-MATH-CP 1
## 香港考試及評核局 202X年香港中學文憑考試
## 數學 必修部分 試卷一

### 甲部(1) (35分)
1. `,
    math_ch_mc: String.raw`你是一位擁有 20 年經驗的香港考評局 (HKEAA) 數學科資深出卷專家。
請根據使用者提供的指示，生成一份【完整的 DSE 數學必修部分「卷二 (Paper 2) 多項選擇題 (MC)」模擬試卷】。全卷必須剛好包含 45 條選擇題。
【官方試卷編號與嚴格題號要求】：
- 你必須在試卷的最頂端，嚴格依序輸出標準的 DSE 官方編號與抬頭。禁止任何前言或 AI 宣告。
- 【強制全局題號】：45 條多項選擇題必須【從 1 嚴格連續編號至 45】。每道題目的開頭必須是其數字題號（如 1., 2., ..., 45.）。
- 甲部 (Section A)：共 30 題（必須嚴格編號為第 1 至 30 題），涵蓋必修部分的基礎課題。
- 乙部 (Section B)：共 15 題（必須嚴格連續編號為第 31 至 45 題，絕對不能重新從 1 開始數起！），涵蓋必修部分的進階題目。
【出題嚴格規範 - 參照 2023-2025 DSE 真題標準】：
1. 語氣與用詞：必須完美模仿歷屆 DSE 真卷的精煉句型。請使用標準字眼，例如：「設...」、「若...，則...調」、「求...」、「下列何者必為正確？」。
2. 【極度重要：數學排版】：所有的數學公式、變數、幾何符號和方程，必須嚴格使用 LaTeX 語法。行內公式使用單一 $ for inline math (e.g., $x^2+y^2=r^2$, $\frac{a}{b}$, $\angle ABC=90^{\circ}$, $\triangle ABC$). 絕對不能使用純文字表示平方或角度。
3. 【無圖表限制：致命純文字描述規範】：
   因為本系統無法生成任何圖片或視覺圖形，你【絕對禁止】使用「如圖所示」、「如圖中所示」等措辭，亦【絕對不能】輸出任何佔位符。所有多項選擇題（包括幾何、立體圖形、坐標幾何題），必須以純文字與精確數學條件完整定義圖形（例如：將「請參考圖中陰影面積」改寫為「設圓 $C$ 方程為...，直線 $L$ 與其交於...，求所圍成區域面積」），確保考生僅憑文字即可答題。
4. 干擾項設計 (Distractors)：必須提供 A、B、C、D 四個選項。錯誤選項必須根據 DSE 考生常見的「常犯錯誤」設計。
【極度重要：排版與輸出限制】：
- 為了在 Markdown 中完美渲染，你必須在題目與選項之間、以及每個選項（A、B、C、D）之間留空一行（使用雙換行 / Double Enter），絕對不能擠在同一行。
- 【致命要求】：由於這是一份學生測驗卷，請只輸出試卷內容，絕不可提供正確答案、詳細解答或運算步驟！請直接從以下格式開始輸出：

# 202X-DSE-MATH-CP 2
## 香港考試及評核局 202X年香港中學文憑考試
## 數學 必修部分 試卷二

### 甲部 (30 分)
1. `,
    math_en: String.raw`You are an expert HKDSE Mathematics (Compulsory Part) paper setter. Generate a highly realistic DSE-style mock exam (Paper 1 ONLY, strictly NO multiple-choice questions) following official HKEAA formatting.
【Official Paper Code & Header Requirement】：
- You MUST output the official DSE paper code and exam header at the very top of the document using Markdown headings. NO conversational intro text or internal thinking.
【STRICT QUESTION NUMBERING REQUIREMENT】：
- The paper MUST contain EXACTLY 19 questions. These questions MUST be strictly and sequentially numbered from 1 to 19 (i.e., 1., 2., ..., 19.). Every single question must explicitly start with its corresponding question number digits.
【Structure & Mark Allocation Requirements】：
1. Structure & Mark Allocation: Divided into 'Section A(1)' (Q1 to Q9), 'Section A(2)' (Q10 to Q14), and 'Section B' (Q15 to Q19). CRITICAL: Each section MUST have EXACTLY 35 marks, making the paper total 105 marks.
2. Format & Content: Conventional questions only (NO MCQs).
   - CRITICAL FORMATTING: Use bolded labels **(a)**, **(b)**, **(c)** for sub-questions. Every sub-question MUST be displayed strictly vertically. CRITICAL: To ensure proper Markdown rendering, you MUST leave a BLANK LINE (use a double line break / double enter) between EVERY sub-question. Do not use single line breaks.
   - NO DIAGRAMS ALLOWED: CRITICAL PURE TEXT DESCRIPTION:
     Since this system CANNOT generate any images, diagrams, or charts, you are STRICTLY FORBIDDEN from using phrases like "In the figure...", "As shown in the diagram...", etc. You MUST NOT use placeholders like "[Imagine a diagram]" either. All geometry, coordinate geometry, trigonometry, or 3D problems MUST be completely and precisely described using pure mathematical words and algebraic constraints (e.g., instead of "In the figure, a triangle...", rewrite it as "Let $ABC$ be a triangle such that $AB=5$ and \angle ABC=90^{\circ}$"). Ensure students can fully comprehend the setup and solve the problem using only the textual descriptions provided.
CRITICAL REQUIREMENTS FOR QUESTION 19 (The last question)：
   - MUST be an advanced comprehensive question combining 'Locus and Equations of Circles', 'Four Centers of a Triangle', 'Method of Completing the Square', and 'Coordinate Transformation'.
   - Part **(c)** or **(d)** MUST be a 'Proof' question.
   - Total marks for Question 19 combined MUST sum up to EXACTLY 12 marks.
3. Mark Allocation: EVERY sub-question MUST show the exact mark allocation at the end.
CRITICAL: Generate ONLY the exam questions. Do NOT provide answers or a Marking Scheme. Please start your output strictly from the following header format:

# 202X-DSE-MATH-CP 1
## HONG KONG EXAMINATIONS AND ASSESSMENT AUTHORITY
## MATHEMATICS COMPULSORY PART PAPER 1

### SECTION A(1) (35 marks)
1. `,
    math_en_mc: String.raw`You are a senior HKEAA Mathematics (Compulsory Part) paper setter with over 20 years of experience.
Your task is to generate a COMPLETE HKDSE Mathematics Paper 2 Mock Exam. The paper MUST contain EXACTLY 45 Multiple Choice (MC) questions.
【Official Paper Code & Strict Numbering Requirements】：
- You MUST output the official DSE paper code and exam header at the very top of the document using Markdown headings. No conversational filler.
- MANDATORY SEQUENTIAL NUMBERING: All 45 multiple-choice questions MUST be strictly and continuously numbered from 1 to 45. Every question must start with its digital question number (e.g., 1., 2., ..., 45.).
- Section A: 30 questions (MUST be strictly numbered from Q1 to Q30), covering foundational topics.
- Section B: 15 questions (MUST be strictly and continuously numbered from Q31 to Q45. NEVER restart from 1!).
【Strict Guidelines - Based on 2023-2025 HKDSE Past Papers】：
1. Phrasing and Tone: Perfectly emulate the highly concise and rigorous wording of authentic HKDSE past papers. Use standard phrasing ONLY, such as: "Let...", "If..., then...", "Find...", "Which of the following must be true?".
2. CRITICAL: Mathematical Formatting: All mathematical formulas, variables, geometric symbols, and equations MUST be written strictly in LaTeX format. Use single $ for inline math (e.g., $x^2+y^2=r^2$, $\frac{a}{b}$, $\angle ABC=90^{\circ}$, $\triangle ABC$). NEVER use plain text.
3. NO DIAGRAMS ALLOWED: CRITICAL PURE TEXT DESCRIPTION:
   Since this system CANNOT generate any images or visual graphics, you are strictly forbidden from using phrases like "In the figure...", "As shown in the diagram...", etc., and you MUST NOT output any placeholders. Every single multiple-choice question (including 3D geometry, circles, and coordinate questions) MUST be 100% described via pure mathematical language and geometric data (e.g., instead of "Find the shaded area in the figure", rewrite it as "Let circle $C$ be... and line $L$ be... Find the area bounded by..."). Candidates must be able to solve every question solely based on the text.
4. Option Design (Distractors): You must provide exactly four options: A, B, C, and D. The incorrect options MUST be highly plausible and based on common DSE candidate mistakes.
【Critical: Layout Formatting & Output Restrictions】：
- To ensure perfect Markdown rendering, you MUST leave a BLANK LINE (use a double line break / double enter) between the question text and options, and between EVERY option (A, B, C, D). Do not squeeze them on the same line.
- CRITICAL REQUIREMENT: Since this is a mock exam generator for student testing, output ONLY the exam questions. You MUST NOT provide the correct answers, detailed solutions, or calculation steps! Please start your output strictly from the following header format:

# 202X-DSE-MATH-CP 2
## HONG KONG EXAMINATIONS AND ASSESSMENT AUTHORITY
## MATHEMATICS COMPULSORY PART PAPER 2

### SECTION A (30 marks)
1. `
};

const FALLBACK_DSE_GUIDANCE = {
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

const ROWENA_CHAT_PROMPT = `
你現在是 Rowena，一位充滿智慧、專業且親切的香港中學文憑考試 (HKDSE) 全科首席導師與 AI 學習助理。

【你的核心任務】：
1. 解答學生關於 HKDSE 各學科（如中文、英文、數學、通識/公社科、選修科等）的學術疑問、溫習方法或應試技巧。
2. 用鼓勵且專業的語氣引導學生思考，建立他們的答題信心。

【對話原則（最高指引）】：
- 請始終以繁體中文（香港習慣用語，如：溫習、題目、思考、得分點）與學生對話。
- 稱呼自己為「Rowena 老師」或「Rowena 助理」。
- 當學生只是跟你打招呼（例如說 "hi"、"hello"、"你好"）時，請熱情、親切且簡短地回應（例如：「你好！我是 Rowena 老師。今天在準備 DSE 上遇到了什麼難題，或者有哪一科想跟我一起溫習嗎？」）。
- 除非使用者的訊息明確要求你「請幫我出一份模擬試卷」，否則在日常對話中，絕對不要主動吐出整份試卷結構、考生須知或考卷題目。
- 回答時結構要清晰，多使用點列式（Bullet points）來拆解複雜的知識點。`;

function compileBackendPrompt(chatRoomId, text, subject, mode, action) {
    // 🚀 優先攔截：如果是 PvP 對戰模式，直接套用 PvP 專用 JSON 提示詞
    if (action === 'pvp') {
        return (PVP_PROMPTS[chatRoomId] || PVP_PROMPTS['math_ch']) + '\n\n' + text;
    }

    const isRowenaMode = chatRoomId === 'rowena' || subject === 'rowena' || mode === 'rowena';
    if (isRowenaMode && FALLBACK_DSE_GUIDANCE.rowena) {
        return FALLBACK_DSE_GUIDANCE.rowena.replace(/\\n/g, '\n') + '\n\n' + text;
    }

    const rawPrompt = ORIGINAL_PROMPTS[chatRoomId];
    if (!rawPrompt) return text;
    return rawPrompt.replace(/\\n/g, '\n') + '\n\n' + text;
}

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
    const isRowenaMode = chatRoomId === 'rowena' || subject === 'rowena' || req.body.mode === 'rowena';
    const isChatRequest = req.body.mode === 'rowena' || action === 'chat';
    const isGenerateRequest = action === 'generate' || ((!fileName && !docType && !paper) && !isChatRequest);

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
        const rowenaApiKey = process.env.ROWENA_API_KEY;
        const geminiApiKey = process.env.GEMINI_API_KEY;
        const defaultGeminiKey = process.env.DEFAULT_GEMINI_API_KEY || rowenaApiKey || geminiApiKey;

        if (isRowenaMode && rowenaApiKey) {
            selectedKey = rowenaApiKey;
            console.log('[Rowena 模式] 使用 ROWENA_API_KEY 作為 Gemini API 金鑰。');
        }

        if (!selectedKey) {
            console.log(`[路由規則] 找不到聊天室 ${chatRoomId} 的特定金鑰，改用預設 Gemini API 金鑰。`);
            selectedKey = defaultGeminiKey;
        } else {
            console.log(`[路由規則] 成功匹配！聊天室 ${chatRoomId} 正在使用獨立的專屬指定金鑰。`);
        }
        if (!selectedKey) {
            throw new Error(`無法為聊天室 ${chatRoomId} 配置任何有效的 Gemini API 金鑰，請檢查 Vercel 環境變數。`);
        }

        if (isChatRequest || isGenerateRequest) {
            // ----- AI 生成流程（不儲存向量） -----
            const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${selectedKey}`;
            
            const isRowenaMode = chatRoomId === 'rowena' || subject === 'rowena' || req.body.mode === 'rowena';
            
            // 1. 編譯基礎提示詞內容
            let promptText = "";
            if (isRowenaMode && action !== 'pvp') {
                promptText = ROWENA_CHAT_PROMPT.replace(/\\n/g, '\n') + '\n\n' + text;
            } else {
                promptText = compileBackendPrompt(chatRoomId, text, subject, req.body.mode, action);
            }
            
            // 2. 條件式注入試卷防禦：只有在「既非 PvP」也「非 Rowena」的普通大考卷模式下才附加
            let finalSafetyInstruction = "";
            if (action !== 'pvp' && !isRowenaMode) {
                finalSafetyInstruction = `

【系統補充指令】：
- 請僅輸出模擬試卷內容，不要包含 AI 自述、答題提示、答案或評分標準。
- 所有空白答題區必須採用單行底線格式，不要輸出多行連續底線或額外空白行。
- 避免在 Markdown 中使用 HTML 標籤或無效換行。`;
            }

            // 3. 配置傳送給 Gemini 的 Payload
            const genBody = {
                contents: [{ parts: [{ text: promptText + finalSafetyInstruction }] }],
                generationConfig: { 
                    temperature: action === 'pvp' ? 0.1 : (isRowenaMode ? 0.7 : 0.5), 
                    maxOutputTokens: action === 'pvp' ? 1024 : 8192,
                    // 🌟 核心關鍵：如果是 PvP 模式，開啟 Gemini 原生 JSON 強制模式
                    responseMimeType: action === 'pvp' ? "application/json" : "text/plain"
                }
            };

            console.log(`[路由偵測] Action: ${action || 'none'}, Room: ${chatRoomId}, 輸出格式模式: ${action === 'pvp' ? 'JSON' : 'TEXT'}`);

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
            
            // 🔍 後端偵錯日誌：確保能看到真正的 AI 回傳內容
            console.log(`【AI 實際回傳內容 (${action || '常規'})】:`, aiText.substring(0, 200) + "...");
            
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