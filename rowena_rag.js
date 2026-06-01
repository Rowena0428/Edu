/**
 * Rowena RAG — Supabase Vector (pgvector) + Google Embedding + Gemini
 * Retrieve → Augment → Generate
 */
(function (global) {
    const RAG_BUILD = '2026-05-23-embed-content-fix';

    const SUPABASE_CONFIG = {
        url: '',
        anonKey: '',
    };

    /**
     * Embedding 建議使用 Google AI Studio 一般 API Key（非 Gem 專用鑰）
     * 若留空，則 fallback 至各科 SUBJECT_KEYS
     */
    const RAG_CONFIG = {
        SUPABASE_URL: SUPABASE_CONFIG.url,
        SUPABASE_ANON_KEY: SUPABASE_CONFIG.anonKey,
        GEMINI_EMBED_API_KEY: '',
        /** true：Supabase 未設定或無文件時，用內建 DSE 指引仍可出卷 */
        VECTOR_FALLBACK: true,
    };

    /** Supabase 尚未就緒時的內建出卷指引（向量庫上線後會自動改用官方文件） */
    const FALLBACK_DSE_GUIDANCE = {
        chinese:
            `你現在是香港考評局 (HKEAA) 的中文科出卷專家。請生成一份高擬真度的 DSE 中文科模擬試卷（包含卷一及卷二），嚴格遵守官方最新排版與結構。\n` +
            `【官方試卷編號與抬頭要求】：\n` +
            `- 你必須在試卷的最頂端，嚴格依序輸出標準的 DSE 中文科官方編號與抬頭格式，禁止任何 AI 的自我介紹、前言或開場白。\n` +
            `【嚴格題目編號要求】：\n` +
            `- 試卷中的所有題目（包括卷一閱讀能力的甲部與乙部問答題、卷二寫作能力的題目），【必須強制在每題開頭加上清晰的連續數字題號】（例如：「1.」、「2.」、「3.」）。絕對禁止出現沒有題號的孤立題目，以便系統精準識別。\n` +
            `【結構要求】：\n` +
            `1. 卷一（閱讀能力）：必須分為「甲部：指定閱讀 (30%)」及「乙部：閱讀能力考材 (70%)」。\n` +
            `   - 【甲部致命限制：絕對禁止印出文章】：甲部考核的是香港教育局 (EDB) 指定的文言經典學習材料（即 12 篇範文）。你【絕對不要／禁止】在試卷中生成、提供或印出任何課文或文章原文！請直接輸出針對指定篇章（如《論仁、論孝、論君子》、《魚我所欲也》、《始得西山宴遊記》、《六國論》、《出師表》等）的測驗題目，要求考生根據對課文的記憶與理解直接作答。題型須包括文言字詞解釋、句意理解及寫作手法分析。\n` +
            `   - 乙部：提供兩篇課外考材（一篇白話文、一篇文言文），此部分【必須】提供完整的文章白話文與文言文考材，供考生閱讀後作答。\n` +
            `   - 【排版極度嚴格 - 選擇題與分題】：多項選擇題的 A、B、C、D 選項，以及所有題目的分題（務必使用加粗的 **(a)**, **(b)**, **(c)** 防止轉換為版權符號），【必須嚴格垂直排列】。【致命要求】：為了在 Markdown 中正確渲染垂直排版，你【必須在每個選項之間、每個分題之間「空一行」（使用雙換行 / Double Enter）】，絕對不能擠在同一行或只使用單次換行。\n` +
            `   - 【排版極度嚴格 - 卷一作答線】：卷一的所有問答題、闡述題或長題目，必須確保題目考核內容精準簡練。【致命要求】：無論題目佔多少分，每題下方【最多只能提供「單一行」的空白底線】（例如：\n＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿\n），【絕對禁止】產生連續多行的橫線供考生作答。【絕對不要】輸出「限寫兩行」等任何幕後提示文字。\n` +
            `   - 【表格優化】：使用標準且乾淨的 Markdown 表格語法，儲存格內的文字必須高度精簡以防排版錯亂。\n` +
            `2. 卷二（寫作能力）：必須分為「甲部：實用寫作 (30%)」及「乙部：命題寫作 (70%)」。\n` +
            `   - 甲部：設定一個情境並提供短小閱讀材料，要求撰寫實用文。必須列明「禁止使用真實姓名」，並提供指定名字（英秀、一心、幼羚、家寶、念慈、思賢、有容、向華、修端、允行）供選用。【致命要求：卷二絕對不要】提供任何作答底線。\n` +
            `   - 乙部：提供 3 條寫作題目，註明只需選答一題（必須分別標註題號為 1.、2.、3.）。【致命要求：卷二絕對不要】提供任何作答底線。\n` +
            `3. 分數標示：請以 Markdown 格式輸出。每道分題末尾【必須】清楚標示佔分（例如：(2分)）。\n` +
            `【致命要求】：因為這是用於學生的模擬試卷，你【絕對不要】提供答案、評分參考或 Marking Scheme！請直接從以下格式開始輸出：\n\n` +
            `# 202X-DSE-CHIN 1 & 2\n` +
            `## 香港考試及評核局 202X年香港中學文憑考試\n` +
            `## 中國語文 試卷一及試卷二\n\n` +
            `### 試卷一：閱讀能力\n` +
            `#### 甲部：指定閱讀 (30%)\n` +
            `1. `,

        english:
            `You are an expert HKDSE English Language paper setter. Please generate a highly realistic DSE-style mock exam (Paper 1 and Paper 2) that strictly follows the official HKEAA formatting.\n` +
            `【Official Paper Code & Header Requirement】:\n` +
            `- You MUST output the official DSE English paper code and exam header at the very top of the document using Markdown headings. NO conversational intro text or greetings from AI.\n` +
            `【STRICT QUESTION NUMBERING REQUIREMENT】:\n` +
            `- Every single question in Paper 1 and choices in Paper 2 【MUST be strictly and sequentially numbered using standard digits】 (e.g., "1.", "2.", "3."). Never omit the question number at the beginning of any question block.\n` +
            `【Structure Requirements】:\n` +
            `1. Paper 1 (Reading): Must include 'Part A' (Compulsory), 'Part B1' (Easier section), and 'Part B2' (More difficult section), each with its own reading passages. Question types MUST mimic official exams.\n` +
            `   - 【CRITICAL FORMATTING FOR MCQs & SUB-QUESTIONS】: Options A, B, C, D and sub-parts (use bolded **(a)**, **(b)**, **(c)** to prevent copyright symbol rendering) MUST be displayed strictly vertically. 【CRITICAL】: To ensure proper Markdown rendering, you MUST leave a BLANK LINE (use a double line break / double enter) between EVERY option and EVERY sub-part. Do not use single line breaks.\n` +
            `   - 【CRITICAL FORMATTING FOR ANSWER LINES】: For any short-answer or open-ended questions, you MUST provide 【EXACTLY ONE SINGLE LINE of underscores】 (e.g., \n__________________________________________________\n) for student answers. 【CRITICAL】: NEVER generate multiple lines of underscores regardless of mark allocation.\n` +
            `   - 【CRITICAL FORMATTING FOR TABLES】: Use standard and clean Markdown table syntax. Keep text inside cells highly concise to prevent layout breaks.\n` +
            `2. Paper 2 (Writing): Must include 'Part A' (~200 words) and 'Part B' (~400 words). For Part B, provide 3 to 4 distinct choices (strictly numbered as Question 1, 2, 3, etc.). DO NOT provide detailed bullet points, hints, or long lists of instructions. Keep the prompts extremely concise. You MUST include the instruction: "Do not use your real name. If no name is provided, use 'Chris Wong'."\n` +
            `3. Mark Allocation: Use Markdown. For Paper 1, EVERY question MUST have exact marks (e.g., [1 mark]). For Paper 2, Part A and each question in Part B MUST be strictly labelled as [21 marks].\n` +
            `【CRITICAL REQUIREMENT】: Generate ONLY the exam questions. Do NOT generate an answer key, hints, or Marking Scheme. Please start your output strictly from the following header format:\n\n` +
            `# 202X-DSE-ENG LANG 1 & 2\n` +
            `## HONG KONG EXAMINATIONS AND ASSESSMENT AUTHORITY\n` +
            `## ENGLISH LANGUAGE PAPERS 1 & 2\n\n` +
            `### PAPER 1: READING\n` +
            `#### PART A (Compulsory)\n` +
            `1. `,

        math_ch:
            `你現在是香港考評局 (HKEAA) 數學科（必修部分）的出卷專家。請生成一份高擬真度的 DSE 數學模擬試卷（只生成試卷一 Paper 1，不包含 any 選擇題），嚴格遵守官方排版。\n` +
            `【官方試卷編號與抬頭要求】：\n` +
            `- 你必須在試卷的最頂端，嚴格依序輸出標準的 DSE 官方編號與抬頭資訊，禁止任何開場白或 AI 內部思考。\n` +
            `【嚴格題目編號要求】：\n` +
            `- 全卷【必須剛好包含 19 條題目】。這 19 條題目必須嚴格、連續地按順序從 1 編號至 19（即 1., 2., ..., 19.）。每條題目開頭必須強制輸出其數字題號，絕對不能出現中斷或漏寫。\n` +
            `【結構與配分要求】：\n` +
            `1. 結構與配分：試卷一必須分為「甲部(1)」(第1至9題，基礎題目)、「甲部(2)」(第10至14題，中階題目) 與「乙部」(第15至19題，高階題目)。【極度重要：每部的總分必須剛好為 35 分，全卷總分為 105 分】。\n` +
            `2. 題型與內容：全卷均為傳統問答題（絕對不要出選擇題）。\n` +
            `   - 【排版極度嚴格】：長題目必須分拆為加粗的 **(a)**, **(b)**, **(c)**。所有題目的分題【必須嚴格垂直排列】。【致命要求】：為了在 Markdown 中正確渲染垂直排版，你【必須在每個分題之間「空一行」（使用雙換行 / Double Enter）】，絕對不能擠在同一行或只使用單次換行。\n` +
            `   - 【字字限制】：長題目的每一個分題文字敘述【必須極度精簡，最多不能超過兩行文字】。\n` +
            `   - 【無圖表限制：致命純文字描述規範】：\n` +
            `     因為本系統無法生成任何圖片、圖表或幾何附圖，你【絕對禁止】使用「如圖所示」、「圖中所示...」等涉及圖形的字眼，也【絕對不能】輸出「[請想像一張圖]」等任何預留位置符號。所有幾何題、圓方程、三角學或坐標題，你必須完全改用精確的數學文字與代數條件來精準描述圖形結構（例如：將「圖中所示的三角形」改寫為「設 $ABC$ 為一三角形，其中 $AB=5$、$\angle ABC=90^{\\circ}$」），確保考生僅憑文字敘述就能完全推導出幾何關係並完美作答。\n` +
            `【極度重要：第 19 題的終極要求】：\n` +
            `   - 必須是結合「軌跡與圓方程」、「三角形四心」、「配方法」及「坐標變換」的綜合題。\n` +
            `   - 第 19 題的 **(c)** 或 **(d)** 部份必須為「證明題」。\n` +
            `   - 第 19 題所有分題的佔分加起來，【總分必須剛好為 12 分】（例如：(a) 3分, (b) 4分, (c) 5分）。\n` +
            `3. 分數標示：以 Markdown 格式輸出，每道分題末尾清楚標示滿分（如：(3分)）。\n` +
            `【極度重要】：只需生成試卷內容，絕對不要提供解答或評分參考！請直接從以下格式開始輸出：\n\n` +
            `# 202X-DSE-MATH-CP 1\n` +
            `## 香港考試及評核局 202X年香港中學文憑考試\n` +
            `## 數學 必修部分 試卷一\n\n` +
            `### 甲部(1) (35分)\n` +
            `1. `,

        math_ch_mc:
            `你是一位擁有 20 年經驗的香港考評局 (HKEAA) 數學科資深出卷專家。\n` +
            `請根據使用者提供的指示，生成一份【完整的 DSE 數學必修部分「卷二 (Paper 2) 多項選擇題 (MC)」模擬試卷】。全卷必須剛好包含 45 條選擇題。\n` +
            `【官方試卷編號與嚴格題號要求】：\n` +
            `- 你必須在試卷的最頂端，嚴格依序輸出標準的 DSE 官方編號與抬頭。禁止任何前言或 AI 宣告。\n` +
            `- 【強制全局題號】：45 條多項選擇題必須【從 1 嚴格連續編號至 45】。每道題目的開頭必須是其數字題號（如 1., 2., ..., 45.）。\n` +
            `- 甲部 (Section A)：共 30 題（必須嚴格編號為第 1 至 30 題），涵蓋必修部分的基礎課題。\n` +
            `- 乙部 (Section B)：共 15 題（必須嚴格連續編號為第 31 至 45 題，絕對不能重新從 1 開始數起！），涵蓋必修部分的進階課題。\n` +
            `【出題嚴格規範 - 參照 2023-2025 DSE 真題標準】：\n` +
            `1. 語氣與用詞：必須完美模仿歷屆 DSE 真卷的精煉句型。請使用標準字眼，例如：「設...」、「若...，則...調開」、「求...」、「下列何者必為正確？」。\n` +
            `2. 【極度重要：數學排版】：所有的數學公式、變數、幾何符號和方程，必須嚴格使用 LaTeX 語法。行內公式使用單一錢字號（例如 $x^2+y^2=r^2$, $\\frac{a}{b}$, $\\angle ABC=90^{\\circ}$, $\\triangle ABC$）。絕對不能使用純文字表示平方或角度。\n` +
            `3. 【無圖表限制：致命純文字描述規範】：\n` +
            `   因為本系統無法生成任何圖片或幾何圖表，你【絕對禁止】使用「如圖所示」、「圖中所示為...」等字眼，亦【絕對不能】使用任何圖片佔位符。所有的多項選擇題（包括幾何、立體圖形、坐標幾何題），必須「百分之百改用純文字與數學條件」精確定義圖形（例如：原有的「求圖中陰影部分的面積」必須改寫為純文字題目「設圓 $C$ 的方程為...，直線 $L$ 與其相交於...，求由...圍成的區域面積」），確保考生不需要看圖就能直接作答。\n` +
            `4. 干擾項設計 (Distractors)：必須提供 A、B、C、D 四個選項。錯誤的選項必須基於 DSE 考生常見的「常犯錯誤」來設計。\n` +
            `【極度重要：排版與輸出限制】：\n` +
            `- 為了在 Markdown 中完美渲染，你【必須】在題目與選項之間、以及每個選項 (A, B, C, D) 之間「空一行（使用雙換行 Double Enter）」，絕對不能擠在同一行。\n` +
            `- 【致命要求】：因為這是一個用於測驗學生的模擬試卷產生器，請【只需生成試卷內容】。你【絕對不要】提供正確答案、詳細題解或運算步驟！請直接從以下格式開始輸出：\n\n` +
            `# 202X-DSE-MATH-CP 2\n` +
            `## 香港考試及評核局 202X年香港中學文憑考試\n` +
            `## 數學 必修部分 試卷二\n\n` +
            `### 甲部 (共 30 題)\n` +
            `1. `,

        math_en:
            `You are an expert HKDSE Mathematics (Compulsory Part) paper setter. Generate a highly realistic DSE-style mock exam (Paper 1 ONLY, strictly NO multiple-choice questions) following official HKEAA formatting.\n` +
            `【Official Paper Code & Header Requirement】:\n` +
            `- You MUST output the official DSE paper code and exam header at the very top of the document using Markdown headings. NO conversational intro text or internal thinking.\n` +
            `【STRICT QUESTION NUMBERING REQUIREMENT】:\n` +
            `- The paper 【MUST contain EXACTLY 19 questions】. These questions MUST be strictly and sequentially numbered from 1 to 19 (i.e., 1., 2., ..., 19.). Every single question must explicitly start with its corresponding question number digits.\n` +
            `【Structure & Mark Allocation Requirements】:\n` +
            `1. Structure & Mark Allocation: Divided into 'Section A(1)' (Q1 to Q9), 'Section A(2)' (Q10 to Q14), and 'Section B' (Q15 to Q19). 【CRITICAL: Each section MUST have EXACTLY 35 marks, making the paper total 105 marks】.\n` +
            `2. Format & Content: Conventional questions only (NO MCQs).\n` +
            `   - 【CRITICAL FORMATTING】: Use bolded labels **(a)**, **(b)**, **(c)** for sub-questions. Every sub-question MUST be displayed strictly vertically. 【CRITICAL】: To ensure proper Markdown rendering, you MUST leave a BLANK LINE (use a double line break / double enter) between EVERY sub-question. Do not use single line breaks.\n` +
            `   - 【NO DIAGRAMS ALLOWED: CRITICAL PURE TEXT DESCRIPTION】:\n` +
            `     Since this system CANNOT generate any images, diagrams, or charts, you are 【STRICTLY FORBIDDEN】 from using phrases like "In the figure...", "As shown in the diagram...", etc. You 【MUST NOT】 use placeholders like "[Imagine a diagram]" either. All geometry, coordinate geometry, trigonometry, or 3D problems MUST be completely and precisely described using pure mathematical words and algebraic constraints (e.g., instead of "In the figure, a triangle...", rewrite it as "Let $ABC$ be a triangle such that $AB=5$ and \\angle ABC=90^{\\circ}$"). Ensure students can fully comprehend the setup and solve the problem using only the textual descriptions provided.\n` +
            `【CRITICAL REQUIREMENTS FOR QUESTION 19 (The last question)】:\n` +
            `   - MUST be an advanced comprehensive question combining 'Locus and Equations of Circles', 'Four Centers of a Triangle', 'Method of Completing the Square', and 'Coordinate Transformation'.\n` +
            `   - Part **(c)** or **(d)** MUST be a 'Proof' question.\n` +
            `   - Total marks for Question 19 combined MUST sum up to EXACTLY 12 marks.\n` +
            `3. Mark Allocation: EVERY sub-question MUST show the exact mark allocation at the end.\n` +
            `【CRITICAL】: Generate ONLY the exam questions. Do NOT provide answers or a Marking Scheme. Please start your output strictly from the following header format:\n\n` +
            `# 202X-DSE-MATH-CP 1\n` +
            `## HONG KONG EXAMINATIONS AND ASSESSMENT AUTHORITY\n` +
            `## MATHEMATICS COMPULSORY PART PAPER 1\n\n` +
            `### SECTION A(1) (35 marks)\n` +
            `1. `,

        math_en_mc:
            `You are a senior HKEAA Mathematics (Compulsory Part) paper setter with over 20 years of experience.\n` +
            `Your task is to generate a 【COMPLETE HKDSE Mathematics Paper 2 Mock Exam】. The paper MUST contain EXACTLY 45 Multiple Choice (MC) questions.\n` +
            `【Official Paper Code & Strict Numbering Requirements】:\n` +
            `- You MUST output the official DSE paper code and exam header at the very top of the document using Markdown headings. No conversational filler.\n` +
            `- 【MANDATORY SEQUENTIAL NUMBERING】: All 45 multiple-choice questions MUST be 【strictly and continuously numbered from 1 to 45】. Every question must start with its digital question number (e.g., 1., 2., ..., 45.).\n` +
            `- Section A: 30 questions (MUST be strictly numbered from Q1 to Q30), covering foundational topics.\n` +
            `- Section B: 15 questions (MUST be strictly and continuously numbered from Q31 to Q45. NEVER restart from 1!).\n` +
            `【Strict Guidelines - Based on 2023-2025 HKDSE Past Papers】:\n` +
            `1. Phrasing and Tone: Perfectly emulate the highly concise and rigorous wording of authentic HKDSE past papers. Use standard phrasing ONLY, such as: "Let...", "If..., then...", "Find...", "Which of the following must be true?".\n` +
            `2. 【CRITICAL: Mathematical Formatting】: All mathematical formulas, variables, geometric symbols, and equations MUST be written strictly in LaTeX format. Use single $ for inline math (e.g., $x^2+y^2=r^2$, $\\frac{a}{b}$, $\\angle ABC=90^{\\circ}$, $\\triangle ABC$). NEVER use plain text.\n` +
            `3. 【NO DIAGRAMS ALLOWED: CRITICAL PURE TEXT DESCRIPTION】:\n` +
            `   Since this system CANNOT generate any images or visual graphics, you are 【STRICTLY FORBIDDEN】 from using phrases like "In the figure...", "As shown in the diagram...", etc., and you 【MUST NOT】 output any placeholders. Every single multiple-choice question (including 3D geometry, circles, and coordinate questions) MUST be 100% described via pure mathematical language and geometric data (e.g., instead of "Find the shaded area in the figure", rewrite it as "Let circle $C$ be... and line $L$ be... Find the area bounded by..."). Candidates must be able to solve every question solely based on the text.\n` +
            `4. Option Design (Distractors): You must provide exactly four options: A, B, C, and D. The incorrect options MUST be highly plausible and based on common DSE candidate mistakes.\n` +
            `【CRITICAL: Layout Formatting & Output Restrictions】:\n` +
            `- To ensure perfect Markdown rendering, you MUST leave a BLANK LINE (use a double line break / double enter) between the question text and options, and between EVERY option (A, B, C, D). Do not squeeze them on the same line.\n` +
            `- 【CRITICAL REQUIREMENT】: Since this is a mock exam generator for student testing, output ONLY the exam questions. You MUST NOT provide the correct answers, detailed solutions, or calculation steps! Please start your output strictly from the following header format:\n\n` +
            `# 202X-DSE-MATH-CP 2\n` +
            `## HONG KONG EXAMINATIONS AND ASSESSMENT AUTHORITY\n` +
            `## MATHEMATICS COMPULSORY PART PAPER 2\n\n` +
            `### SECTION A (30 marks)\n` +
            `1. `
    };

    /** v1beta embedContent 僅支援 gemini-embedding-001 + content（單數） */
    const EMBEDDING_MODEL = 'gemini-embedding-001';
    /** 與 Supabase documents.embedding vector(768) 欄位一致 */
    const EMBEDDING_OUTPUT_DIMENSIONS = 768;
    const GEMINI_GENERATE_MODEL = 'gemini-2.5-flash';
    const GEMINI_MULTIMODAL_MODEL = 'gemini-2.5-flash';
    const RAG_MATCH_COUNT = 4;
    const RAG_MATCH_THRESHOLD = 0.35;
    const MAX_CHUNK_CHARS = 2400;
    const GEMINI_RETRY_ATTEMPTS = 2;
    const GEMINI_RETRY_DELAY_MS = 1500;

    /** 各科語意檢索查詢詞 */
    const SUBJECT_RETRIEVE_QUERIES = {
        chinese: 'DSE 中文科模擬試卷、評分規則與出卷指引',
        english: 'DSE English Language mock paper marking scheme and assessment framework',
        math_ch: 'DSE 中文數學科模擬試卷與核心公式、評分準則',
        math_en: 'DSE Mathematics mock paper core formulas marking scheme',
        math_ch_mc: 'DSE 中文數學科多項選擇題模擬試卷與核心題型',
        math_en_mc: 'DSE Mathematics Compulsory Part multiple-choice mock paper and core MCQ formats',
    };

    const SUBJECT_TAB_NAMES = {
        chinese: '中文',
        english: '英文',
        math_ch: '中文數學',
        math_en: '英文數學',
        math_ch_mc: '中文數學 MC',
        math_en_mc: '英文數學 MC',
    };

    const DIAGNOSTIC_STORAGE_KEY = 'rowena_latest_diagnostic_v1';

    let supabaseClient = null;

    function resolveApiKey(subjectCategory) {
        return global.RowenaMockPaper?.SUBJECT_KEYS?.[subjectCategory] || '';
    }

    /** Embedding 用鑰：優先 RAG_CONFIG，否則用科目鑰 */
    function resolveEmbedApiKey(subjectApiKey) {
        const dedicated = RAG_CONFIG.GEMINI_EMBED_API_KEY && String(RAG_CONFIG.GEMINI_EMBED_API_KEY).trim();
        if (dedicated && !dedicated.startsWith('YOUR_')) return dedicated;
        return subjectApiKey;
    }

    console.log(`[Rowena RAG] loaded ${RAG_BUILD}`);

    function saveLatestDiagnosticReport(payload) {
        const data = { ...payload, updatedAt: payload.updatedAt || new Date().toISOString() };
        global.RowenaLatestDiagnostic = data;
        try { localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
        return data;
    }

    function loadLatestDiagnosticReport() {
        if (global.RowenaLatestDiagnostic) return global.RowenaLatestDiagnostic;
        try {
            const raw = localStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
            if (raw) global.RowenaLatestDiagnostic = JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return global.RowenaLatestDiagnostic || null;
    }

    function clearLatestDiagnosticReport() {
        global.RowenaLatestDiagnostic = null;
        try { localStorage.removeItem(DIAGNOSTIC_STORAGE_KEY); } catch (e) { /* ignore */ }
    }

    global.RowenaReportStore = { save: saveLatestDiagnosticReport, getLatest: loadLatestDiagnosticReport, clear: clearLatestDiagnosticReport };

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function isSupabaseConfigured() {
        return (
            SUPABASE_CONFIG.url &&
            SUPABASE_CONFIG.anonKey &&
            !SUPABASE_CONFIG.url.startsWith('YOUR_') &&
            !SUPABASE_CONFIG.anonKey.startsWith('YOUR_')
        );
    }

    function isVectorDbSetupError(err) {
        const m = String(err?.message || err);
        return (
            m.includes('match_documents') ||
            m.includes('schema cache') ||
            m.includes('public.documents') ||
            m.includes('PGRST202') ||
            m.includes('PGRST205')
        );
    }

    function fallbackDocumentsForSubject(subject) {
        const content =
            FALLBACK_DSE_GUIDANCE[subject] || FALLBACK_DSE_GUIDANCE.chinese;
        return [{ id: 0, content, similarity: null, _fallback: true }];
    }

    /** 在瀏覽器 Console 執行：await RowenaRAG.checkSupabaseRagReady() */
    async function checkSupabaseRagReady() {
        if (!isSupabaseConfigured()) {
            return { ok: false, step: 'config', message: 'SUPABASE_CONFIG 未填寫' };
        }
        const base = SUPABASE_CONFIG.url.replace(/\/$/, '');
        const headers = {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
        };
        try {
            const tableRes = await fetch(`${base}/rest/v1/documents?select=id&limit=1`, { headers });
            if (!tableRes.ok) {
                const t = await tableRes.json().catch(() => ({}));
                return {
                    ok: false,
                    step: 'documents_table',
                    message: t.message || `HTTP ${tableRes.status}`,
                };
            }
            const dummy = new Array(EMBEDDING_OUTPUT_DIMENSIONS).fill(0.01);
            const rpcRes = await fetch(`${base}/rest/v1/rpc/match_documents`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query_embedding: dummy,
                    match_count: 1,
                    match_threshold: 0,
                }),
            });
            const rpcBody = await rpcRes.json().catch(() => null);
            if (!rpcRes.ok) {
                return {
                    ok: false,
                    step: 'match_documents_rpc',
                    message: (rpcBody && rpcBody.message) || `HTTP ${rpcRes.status}`,
                };
            }
            const rows = Array.isArray(rpcBody) ? rpcBody.length : 0;
            return {
                ok: true,
                message:
                    rows > 0
                        ? `向量庫已就緒（documents 有 ${rows}+ 筆可檢索）`
                        : 'RPC 已建立，但 documents 尚無向量資料，出卷將暫用內建指引',
                documentCountHint: rows,
            };
        } catch (e) {
            return { ok: false, step: 'network', message: String(e.message || e) };
        }
    }

    /** 1. 初始化 Supabase Client */
    function initSupabase() {
        if (supabaseClient) return supabaseClient;
        if (!isSupabaseConfigured()) {
            throw new Error('請在 rowena_rag.js 設定 SUPABASE_CONFIG（url 與 anonKey）。');
        }
        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            throw new Error('未載入 Supabase JS SDK。請在 HTML 加入 @supabase/supabase-js CDN。');
        }
        supabaseClient = global.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        return supabaseClient;
    }

    function geminiGenerateEndpoint(apiKey) {
        return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GENERATE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    }

    function geminiMultimodalEndpoint(apiKey) {
        return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MULTIMODAL_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    }

    async function fetchJsonWithRetry(url, options, label) {
        let lastError = null;
        for (let attempt = 0; attempt <= GEMINI_RETRY_ATTEMPTS; attempt++) {
            try {
                const res = await fetch(url, options);
                const data = await res.json().catch(() => ({}));
                if (res.status === 503 && attempt < GEMINI_RETRY_ATTEMPTS) {
                    await sleep(GEMINI_RETRY_DELAY_MS * (attempt + 1));
                    continue;
                }
                if (!res.ok) {
                    const msg = data?.error?.message || `HTTP ${res.status}`;
                    if (res.status === 503) {
                        const busy = new Error('GEMINI_503_BUSY');
                        busy.status = 503;
                        throw busy;
                    }
                    throw new Error(`[${label}] ${msg}`);
                }
                return data;
            } catch (err) {
                lastError = err;
                if (err && err.message === 'GEMINI_503_BUSY') throw err;
                if (attempt < GEMINI_RETRY_ATTEMPTS) {
                    await sleep(GEMINI_RETRY_DELAY_MS * (attempt + 1));
                    continue;
                }
            }
        }
        throw lastError || new Error(`[${label}] 請求失敗`);
    }

    /**
     * 步驟 A：embedContent 專用請求（嚴禁使用 contents，僅用 content）
     * @see https://ai.google.dev/api/embeddings
     */
    async function callEmbedContent(text, apiKey) {
        const embedKey = resolveEmbedApiKey(apiKey);
        if (!embedKey || embedKey.startsWith('YOUR_')) {
            throw new Error('請在 RAG_CONFIG.GEMINI_EMBED_API_KEY 或 SUBJECT_KEYS 設定有效的 Embedding API 金鑰。');
        }

        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=` +
            encodeURIComponent(embedKey);

        // 僅 content（單數）；勿傳 contents / model（model 已在 URL）
        const embedBody = {
            content: {
                parts: [{ text: String(text) }],
            },
            taskType: 'RETRIEVAL_QUERY',
            outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONS,
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(embedBody),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const msg = data?.error?.message || `HTTP ${res.status}`;
            console.error('[Rowena RAG] embedContent 失敗，request body keys:', Object.keys(embedBody));
            throw new Error(`[Embedding] ${msg}`);
        }

        const values = data?.embedding?.values;
        if (!Array.isArray(values) || values.length === 0) {
            throw new Error('[Embedding] 回傳格式不符合預期（預期 embedding.values）。');
        }
        if (values.length !== EMBEDDING_OUTPUT_DIMENSIONS) {
            console.warn(
                `[Rowena RAG] 向量維度 ${values.length}，預期 ${EMBEDDING_OUTPUT_DIMENSIONS}。請確認 Supabase vector 欄位一致。`
            );
        }
        return values;
    }

    /** 2a. Google Embedding — 將查詢轉為向量 */
    async function embedQuery(text, apiKey) {
        return callEmbedContent(text, apiKey);
    }

    function extractDocumentText(doc) {
        if (!doc || typeof doc !== 'object') return '';
        return String(doc.content ?? doc.text ?? doc.body ?? doc.chunk ?? '').trim();
    }

    /**
     * 呼叫 Supabase RPC match_documents（原生 fetch，參數與 SQL 腳本一致）
     */
    async function callMatchDocumentsRpc(queryEmbedding, filterCategory) {
        if (!isSupabaseConfigured()) {
            throw new Error('請在 rowena_rag.js 設定 SUPABASE_CONFIG（url 與 anonKey）。');
        }

        const rpcUrl = `${SUPABASE_CONFIG.url.replace(/\/$/, '')}/rest/v1/rpc/match_documents`;
        const body = {
            query_embedding: queryEmbedding,
            match_count: RAG_MATCH_COUNT,
            match_threshold: RAG_MATCH_THRESHOLD,
        };
        if (filterCategory) body.filter_category = filterCategory;

        const res = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_CONFIG.anonKey,
                Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
            },
            body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            const msg =
                (data && (data.message || data.error || data.hint)) ||
                `HTTP ${res.status}`;
            if (String(msg).includes('match_documents') && String(msg).includes('schema cache')) {
                throw new Error(
                    '[Supabase] 找不到 match_documents 函數。請在 Supabase SQL Editor 執行專案中的 supabase_match_documents.sql 後再試。'
                );
            }
            console.error('[Rowena RAG] match_documents 失敗:', data);
            throw new Error(`[Supabase] ${msg}`);
        }

        return data;
    }

    async function retrieveDocumentsByPrompt(queryText, apiKey, onStatus, filterCategory, subject) {
        onStatus?.('正在向量化檢索指令…');
        const queryEmbedding = await embedQuery(queryText, apiKey);
        onStatus?.('正在從 Supabase 向量庫檢索官方指引…');

        let data;
        if (global.supabase && typeof global.supabase.createClient === 'function') {
            const client = initSupabase();
            const rpcParams = {
                query_embedding: queryEmbedding,
                match_count: RAG_MATCH_COUNT,
                match_threshold: RAG_MATCH_THRESHOLD,
            };
            if (filterCategory) rpcParams.filter_category = filterCategory;
            const result = await client.rpc('match_documents', rpcParams);
            if (result.error) {
                const em = result.error.message || '';
                if (em.includes('match_documents') && em.includes('schema cache')) {
                    throw new Error(
                        '[Supabase] 找不到 match_documents 函數。請在 Supabase SQL Editor 執行 supabase_match_documents.sql。'
                    );
                }
                throw new Error(`[Supabase] ${em}`);
            }
            data = result.data;
        } else {
            data = await callMatchDocumentsRpc(queryEmbedding, filterCategory);
        }

        if (!Array.isArray(data) || data.length === 0) {
            if (RAG_CONFIG.VECTOR_FALLBACK !== false) {
                console.warn('[Rowena RAG] 向量庫無匹配文件，使用內建 DSE 指引');
                onStatus?.('向量庫暫無文件，使用內建 DSE 指引出卷…');
                return fallbackDocumentsForSubject(subject || 'chinese');
            }
            throw new Error(
                '向量資料庫未找到相關 DSE 官方指引。請在 Supabase documents 表上傳 768 維 embedding 文件。'
            );
        }
        return data.slice(0, RAG_MATCH_COUNT);
    }

    /** 2b. 依科目預設查詢詞檢索 */
    async function retrieveDocuments(subject, apiKey, onStatus) {
        const queryText = SUBJECT_RETRIEVE_QUERIES[subject] || SUBJECT_RETRIEVE_QUERIES.chinese;
        try {
            return await retrieveDocumentsByPrompt(queryText, apiKey, onStatus, null, subject);
        } catch (err) {
            if (RAG_CONFIG.VECTOR_FALLBACK !== false && isVectorDbSetupError(err)) {
                console.warn('[Rowena RAG] Supabase 向量庫未就緒，使用內建指引', err);
                onStatus?.('Supabase 尚未設定，暫用內建 DSE 指引出卷…');
                return fallbackDocumentsForSubject(subject);
            }
            throw err;
        }
    }

    function truncateChunk(text) {
        if (text.length <= MAX_CHUNK_CHARS) return text;
        return text.slice(0, MAX_CHUNK_CHARS) + '\n…（內容已截斷）';
    }

    function buildContextString(documents) {
        return documents
            .map((doc, i) => {
                const body = truncateChunk(extractDocumentText(doc));
                const similarity = doc.similarity != null ? `（相似度 ${Number(doc.similarity).toFixed(3)}）` : '';
                return `[官方指引 ${i + 1}${similarity}]\n${body}`;
            })
            .join('\n\n---\n\n');
    }

    function buildFinalPrompt(context, subject) {
        const subjectName = SUBJECT_TAB_NAMES[subject] || '指定科目';
        return (
            `你是一位嚴格的 HKEAA DSE 專家。請參考以下官方評分與出卷指引：\n${context}\n\n` +
            `請根據以上指引，嚴格為我生成一份全新的【香港 DSE ${subjectName}】模擬試卷。` +
            `內容必須完全符合該科目考試範圍與題型，不可偏離為其他無關主題。` +
            `以 Markdown 格式輸出，保留清晰分段與換行。`
        );
    }

    function parseGeminiGenerateResponse(data) {
        console.log('[Rowena RAG] Gemini generate response:', data);

        if (
            data &&
            data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0]
        ) {
            const parts = data.candidates[0].content.parts;
            const text = parts
                .map((p) => (p && p.text != null ? String(p.text) : ''))
                .filter(Boolean)
                .join('')
                .trim();
            if (text) return text;
        }

        const c0 = data?.candidates?.[0];
        if (c0?.finishReason && c0.finishReason !== 'STOP') {
            throw new Error(`Gemini 未完成生成（${c0.finishReason}）`);
        }

        throw new Error('Gemini 回傳的資料結構不符合預期，請在 Console 查看 raw data');
    }

    /**
     * 步驟 C：generateContent 專用（此處才使用 contents 複數）
     */
    async function callGenerateContent(promptText, apiKey, generationConfig) {
        const data = await fetchJsonWithRetry(
            geminiGenerateEndpoint(apiKey),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: String(promptText) }] }],
                    generationConfig: generationConfig || {
                        temperature: 0.7,
                        maxOutputTokens: 8192,
                    },
                }),
            },
            'Generate'
        );
        return parseGeminiGenerateResponse(data);
    }

    /** 3. Augment & Generate — 拼接 Context 並呼叫 Gemini */
    async function generateWithContext(finalPrompt, apiKey) {
        return callGenerateContent(finalPrompt, apiKey);
    }

    /**
     * 完整 RAG 流程：Retrieve → Augment → Generate
     * @param {string} subject - chinese | english | math_ch | math_en
     * @param {string} apiKey - 該科目 Gemini API 金鑰
     * @param {(msg: string) => void} [onStatus] - Loading 狀態回調
     */
    async function generateMockPaperWithRAG(subject, apiKey, onStatus) {
        const subjectName = SUBJECT_TAB_NAMES[subject] || '指定科目';
        const userPrompt =
            `請根據以上指引，嚴格為我生成一份全新的【香港 DSE ${subjectName}】模擬試卷。` +
            `內容必須完全符合該科目考試範圍與題型，不可偏離為其他無關主題。` +
            `以 Markdown 格式輸出，保留清晰分段與換行。`;
        return generateAIContentWithRAG(userPrompt, subject, apiKey, onStatus);
    }

    /**
     * 通用 RAG 生成入口（掛載於 window，供 Mock 卷、PvP AI 等模組呼叫）
     * @param {string} userPrompt - 使用者／業務端提示詞（不含向量庫 Context）
     * @param {string} category - chinese | english | math_ch | math_en
     * @param {string} apiKey - 該科目 Gemini API 金鑰
     * @param {(msg: string) => void} [onStatus] - 可選狀態回調
     * @returns {Promise<string>} Gemini 生成文字
     */
    async function generateAIContentWithRAG(userPrompt, category, apiKey, onStatus) {
        if (!userPrompt || !String(userPrompt).trim()) {
            throw new Error('generateAIContentWithRAG：userPrompt 不可為空。');
        }
        if (!category || !SUBJECT_RETRIEVE_QUERIES[category]) {
            throw new Error('generateAIContentWithRAG：category 須為 chinese | english | math_ch | math_en | math_ch_mc | math_en_mc。');
        }
        if (!apiKey || apiKey.startsWith('YOUR_')) {
            throw new Error('請設定有效的 Gemini API 金鑰。');
        }

        onStatus?.('Rowena 正在努力檢索官方指引…');
        const documents = await retrieveDocuments(category, apiKey, onStatus);
        const context = buildContextString(documents);
        const finalPrompt =
            `你是一位嚴格的 HKEAA DSE 專家。請參考以下官方評分與出卷指引：\n${context}\n\n` +
            String(userPrompt).trim();

        onStatus?.('正在由 Gemini 生成內容…');
        return generateWithContext(finalPrompt, apiKey);
    }

    global.generateAIContentWithRAG = generateAIContentWithRAG;

    /** Check 卷 AI：RAG + gemini-1.5-flash 多模態批改 */
    async function analyzeUploadedPaper(fileDataUrl, mimeType, subjectCategory, userPrompt, apiKey, onStatus) {
        if (!fileDataUrl?.trim()) throw new Error('analyzeUploadedPaper：缺少試卷檔案。');
        if (!mimeType) throw new Error('analyzeUploadedPaper：缺少 mimeType。');
        if (!SUBJECT_RETRIEVE_QUERIES[subjectCategory]) {
            throw new Error('subjectCategory 須為 chinese | english | math_ch | math_en | math_ch_mc | math_en_mc。');
        }
        const resolvedKey = apiKey || resolveApiKey(subjectCategory);
        const resolvedPrompt = (userPrompt && String(userPrompt).trim()) ||
            '請幫我批改這張考卷，嚴格依照 DSE 官方評分標準逐題給分，並列出改進建議。';
        if (!resolvedKey || resolvedKey.startsWith('YOUR_')) throw new Error('請設定有效的 Gemini API 金鑰。');

        const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
        if (!['application/pdf', 'image/png', 'image/jpeg'].includes(normalizedMime)) {
            throw new Error('僅支援 PDF、PNG、JPG。');
        }
        const base64Data = String(fileDataUrl).includes(',') ? String(fileDataUrl).split(',')[1] : String(fileDataUrl).trim();
        const subjectName = SUBJECT_TAB_NAMES[subjectCategory] || '指定科目';
        const retrieveQuery = `${resolvedPrompt}\n【DSE ${subjectName}】Marking Scheme 評分標準`;

        onStatus?.('正在檢索 DSE 官方評分標準（RAG）…');
        const dseContext = buildContextString(
            await retrieveDocumentsByPrompt(retrieveQuery, resolvedKey, onStatus, null, subjectCategory)
        );
        const instructionText =
            `你是一位嚴格的 HKEAA DSE 閱卷員。請【嚴格依據】以下官方評分標準：\n${dseContext}\n\n${resolvedPrompt}\n\n` +
            `請審閱傳入試卷（影像/PDF），辨識文字，指出錯處，給出客觀得分與改進建議。` +
            `以 Markdown 輸出（總評、逐題得分、錯因、建議）。報告末尾請標示：總分：XX/100。`;

        onStatus?.('Rowena 正在辨識試卷並批改中…');
        const data = await fetchJsonWithRetry(geminiMultimodalEndpoint(resolvedKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: instructionText }, { inlineData: { mimeType: normalizedMime, data: base64Data } }] }],
                generationConfig: { temperature: 0.35, maxOutputTokens: 8192 },
            }),
        }, 'Gemini 多模態批改');
        return parseGeminiGenerateResponse(data);
    }

    /** 報告 AI：深度學習診斷報告 */
    async function generateDiagnosticReport(checkResult, subjectCategory, apiKey, onStatus) {
        if (!checkResult?.trim()) throw new Error('generateDiagnosticReport：checkResult 不可為空。');
        if (!SUBJECT_RETRIEVE_QUERIES[subjectCategory]) throw new Error('subjectCategory 無效。');
        const resolvedKey = apiKey || resolveApiKey(subjectCategory);
        if (!resolvedKey || resolvedKey.startsWith('YOUR_')) throw new Error('請設定有效的 Gemini API 金鑰。');

        const subjectName = SUBJECT_TAB_NAMES[subjectCategory] || '指定科目';
        const trimmed = String(checkResult).trim();
        const diagnosticPrompt =
            `你是【DSE 應試戰略導師】，專精【${subjectName}】。以下為 Check 卷 AI 批改結果，請二次深度診斷，輸出 Markdown《學習診斷報告》：\n\n` +
            `---\n${trimmed}\n---\n\n` +
            `必含章節：## 一、錯誤歸因（概念不清／語法運算失誤／格式不符規範）、## 二、內容不足、## 三、行動建議（3 項具體方案）、## 四、本週學習重點。繁體中文。`;

        onStatus?.('Rowena 導師正在撰寫深度診斷報告…');
        const data = await fetchJsonWithRetry(geminiMultimodalEndpoint(resolvedKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: diagnosticPrompt }] }],
                generationConfig: { temperature: 0.45, maxOutputTokens: 8192 },
            }),
        }, 'Gemini 學習診斷報告');
        const diagnosticMarkdown = parseGeminiGenerateResponse(data);
        saveLatestDiagnosticReport({
            diagnosticMarkdown,
            checkResultMarkdown: trimmed,
            subjectCategory,
            subjectLabel: subjectName,
        });
        return diagnosticMarkdown;
    }

    global.analyzeUploadedPaper = analyzeUploadedPaper;
    global.generateDiagnosticReport = generateDiagnosticReport;

    global.RowenaRAG = {
        RAG_BUILD,
        RAG_CONFIG,
        initSupabase,
        callEmbedContent,
        callGenerateContent,
        callMatchDocumentsRpc,
        embedQuery,
        checkSupabaseRagReady,
        retrieveDocuments,
        retrieveDocumentsByPrompt,
        FALLBACK_DSE_GUIDANCE,
        buildContextString,
        buildFinalPrompt,
        generateWithContext,
        generateMockPaperWithRAG,
        generateAIContentWithRAG,
        analyzeUploadedPaper,
        generateDiagnosticReport,
        SUPABASE_CONFIG,
        SUBJECT_RETRIEVE_QUERIES,
        SUBJECT_TAB_NAMES,
        isSupabaseConfigured,
    };
})(window);
