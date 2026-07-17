import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildFallbackMockPaper } from './mockPaperFallback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Serve frontend static files (allows visiting the HTML from the same origin)
app.use(express.static(path.join(__dirname)));

const dataFilePath = path.join(__dirname, 'data', 'seed.json');
const answersFilePath = path.join(__dirname, 'data', 'answers.json');

function ensureDataFiles() {
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  }

  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify(seedData(), null, 2));
  }

  if (!fs.existsSync(answersFilePath)) {
    fs.writeFileSync(answersFilePath, JSON.stringify({}, null, 2));
  }
}

function loadLocalEnv() {
  const envFiles = [path.join(__dirname, '.env.local'), path.join(__dirname, '.env')];
  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;
    const content = fs.readFileSync(envFile, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key] && value) {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnv();

function getGeminiApiKey(body = {}) {
  return body.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY || '';
}

function buildServicePrompt(action, body, fallbackText) {
  const subject = String(body.chatRoomId || body.subjectId || body.subject || 'general').toLowerCase();
  const userText = body.text || body.prompt || fallbackText || '';

  const subjectLabels = {
    chinese: '香港 DSE 中國語文',
    zh: '香港 DSE 中國語文',
    english: '香港 DSE 英文',
    en: '香港 DSE 英文',
    math_ch: '香港 DSE 數學（中文版）',
    math_en: '香港 DSE Mathematics (English)',
    math_ch_mc: '香港 DSE 數學 MC（中文版）',
    math_en_mc: '香港 DSE Mathematics MC (English)',
  };

  const subjectLabel = subjectLabels[subject] || subject;

  if (action === 'mock-paper') {
    switch (subject) {
      case 'english':
        return `You are an expert HKDSE English Language paper setter. Generate a fully English mock paper for HKDSE English Language. Use Reading and Writing sections, realistic numbering, clear instructions, and exam-style prompts. Do not include answers or marking schemes. Output only the mock paper content in Markdown.\n\nRequirement: ${userText || 'Generate a complete English mock paper.'}`;
      case 'math_ch':
        return `你是一位香港 DSE 數學科出卷專家。請生成一份全中文的數學模擬試卷，內容必須以「傳統問答題」形式呈現，包含完整題目與解題步驟。請嚴格遵守 DSE 數學必修部分的題型與格式，不要生成選擇題。請以 Markdown 輸出。\n\n要求：${userText || '生成一份完整的中文數學模擬試卷。'}`;
      case 'math_en':
        return `You are an expert HKDSE Mathematics paper setter. Generate a fully English mathematics mock paper in traditional written-question format, including complete questions and worked solution steps. Follow HKDSE Mathematics Compulsory Part style and do not include multiple-choice questions. Output only the mock paper in Markdown.\n\nRequirement: ${userText || 'Generate a complete English mathematics mock paper.'}`;
      case 'math_ch_mc':
        return `你是一位香港 DSE 數學科出卷專家。請生成一份中文數學多項選擇題模擬試卷，包含 20 至 30 題，並提供 A、B、C、D 四個選項。題目要符合 DSE 數學必修部分風格，請只輸出試卷內容，不要提供答案。請以 Markdown 輸出。\n\n要求：${userText || '生成一份完整的中文數學 MC 模擬試卷。'}`;
      case 'math_en_mc':
        return `You are an expert HKDSE Mathematics paper setter. Generate a fully English multiple-choice mathematics mock paper with 20 to 30 questions and clear A, B, C, D options. Follow HKDSE Mathematics Compulsory Part style and output only the mock paper content without answers.\n\nRequirement: ${userText || 'Generate a complete English mathematics MC mock paper.'}`;
      default:
        return `你是一位香港 DSE 模擬試卷出卷專家，擅長根據最新的官方考試指引生成高質量、符合 HKEAA 標準的試卷。\n\n科目：${subjectLabel}\n動作：生成完整的 Mock Paper\n\n要求：${userText || '請生成一份完整、具有真實 DSE 難度的模擬試卷。'}`;
    }
  }

  if (action === 'pvp') {
    return `你是一位香港 DSE AI 對戰題庫出題員。請根據科目要求生成一道高質量的單項選擇題。\n科目：${subjectLabel}\n動作：生成對戰題目\n\n要求：${userText || '請生成一道符合 DSE 難度的選擇題。'}`;
  }

  return `你是 Rowena，一位香港 DSE 學習助理。請以繁體中文或英文（根據科目語言）回答使用者問題。\n科目：${subjectLabel}\n\n使用者問題：${userText}`;
}

async function callGemini({ prompt, apiKey, temperature = 0.7, maxOutputTokens = 1800 }) {
  if (!apiKey) {
    throw new Error('未設定 Gemini API 金鑰，請在後端環境變數中配置 GEMINI_API_KEY。');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Gemini API 錯誤 ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || data?.text || '';
  if (!text) {
    throw new Error('Gemini 回傳內容為空。');
  }
  return text;
}

function seedData() {
  return {
    subjects: [
      {
        id: 'chinese',
        name: '中文科',
        subtitle: '十二篇範文',
        title: '廉頗藺相如列傳 (節錄)',
        author: '作者：司馬遷',
        passage: '',
        chapters: [
          '1. 導言與作者背景',
          '2. 完璧歸趙',
          '3. 澠池之會',
          '4. 負荊請罪',
          '5. 人物形象對比',
          '6. 司馬遷寫作手法'
        ],
        questions: [
          { id: 'ch-1', text: '請簡述藺相如在「完璧歸趙」中所展現的智謀。', tips: '提示：可以從藺相如如何看穿秦王並無償城誠意、如何以「璧有瑕」作藉口騙回和氏璧，以及後續如何暗中護送寶璧回國的角度來作答。' },
          { id: 'ch-2', text: '廉頗與藺相如由「不和」走向「同心」的關鍵原因是什麼？', tips: '提示：留意藺相如對廉頗挑釁的處事態度（退讓、顧全大局），以及他提到的那句名言：「先國家之急而後私仇也」。' },
          { id: 'ch-3', text: '本文如何透過對比手法來刻劃兩位主角的性格？', tips: '提示：對比是指將兩個對立的特質並列。試著將廉頗最初的「居功自傲、心胸狹隘」，與藺相如的「豁達大度、深謀遠慮」進行對照分析。' },
          { id: 'ch-4', text: '試解釋「負荊請罪」在現代人際關係中的啟示。', tips: '提示：思考當我們在團隊或人際交往中犯錯時，勇於承認錯誤並付出實際行動，對於團隊大局與個人信用有何正面影響。' },
          { id: 'ch-5', text: '繆賢在文中推薦藺相如時，提及了哪一件事來證明藺相如的遠見？', tips: '提示：回想繆賢曾經犯錯打算逃往燕國，藺相如當時是如何分析燕王的心理並阻止他的。' },
          { id: 'ch-6', text: '分析太史公（司馬遷）在本文結尾中，對藺相如的評價側重於哪一方面？', tips: '提示：思考司馬遷對於藺相如「知難而退、以大局為重」的勇氣給予了怎樣的史學定位。' }
        ]
      },
      {
        id: 'english',
        name: '英文科',
        subtitle: '閱讀理解',
        title: 'Global Warming & Climate Change',
        author: 'Dept: Environmental Science',
        passage: '<p>Global warming remains one of the most defining challenges of the 21st century. Driven primarily by human activities, the excessive burning of fossil fuels has released unprecedented amounts of greenhouse gases into the atmosphere. These gases act like a greenhouse blanket, trapping thermal radiation and causing global average temperatures to spike significantly.</p><p>The direct consequences of this warming trend are already visible worldwide: melting polar ice caps, rapidly shifting weather patterns, and more frequent occurrences of extreme weather events. Beyond the immediate environmental toll, climate change poses severe socioeconomic threats to coastal economies due to rising sea levels, which put valuable infrastructure and local tourism at critical risk.</p><p>To combat this existential threat, international cooperation is vital. Global frameworks, such as the Paris Agreement, play a pivotal role by legally binding nations to carbon reduction targets, forcing global industries to accelerate their transition toward sustainable, renewable energy alternatives before reaching a point of no return.</p>',
        chapters: ['1. Introduction', '2. Causes of Warming', '3. Environmental Impact', '4. Future Solutions', '5. Socioeconomic Toll', '6. Policy Frameworks'],
        questions: [
          { id: 'en-1', text: 'What is identified as the primary driver of climate change?', tips: 'Tip: Scan the opening sentences for keywords like "human activities" and specific types of non-renewable energy resources.' },
          { id: 'en-2', text: 'According to the text, what are the direct consequences of greenhouse gases?', tips: 'Tip: Look closely at what happens when these gases "trap heat" inside the Earth\'s atmosphere and how that impacts daily weather.' },
          { id: 'en-3', text: 'Explain the meaning of the word "shifts" (or shifting) as used in the paragraph.', tips: 'Tip: Consider contextual synonyms that represent long-term changes, variations, or movements away from standard environmental conditions.' },
          { id: 'en-4', text: 'Suggest one individual action that can help reduce carbon emissions.', tips: 'Tip: Think about practical everyday habits related to personal transportation, domestic energy consumption, or green lifestyle choices.' },
          { id: 'en-5', text: 'How do rising sea levels specifically threaten coastal economies according to recent observations?', tips: 'Tip: Think about infrastructure damage, relocation costs, and the loss of tourism or agricultural lands near coastlines.' },
          { id: 'en-6', text: 'What role do international treaties (like the Paris Agreement) play in regulating global industries?', tips: 'Tip: Focus on how legally binding carbon limits force large corporations to transition to greener alternatives.' }
        ]
      },
      {
        id: 'mathematics',
        name: 'Mathematics',
        subtitle: 'Algebra Practice',
        title: 'Quadratic Equation Solving',
        author: 'Unit: Mathematics',
        passage: '',
        chapters: ['1. Quadratic Basics', '2. Factoring Techniques', '3. Completing the Square', '4. Formula and Discriminant', '5. Root-Coefficient Relationships', '6. Applied Quadratic Problems'],
        questions: [
          { id: 'math-1', text: 'When the discriminant Δ is less than 0, what can you say about the real roots of the quadratic equation?', tips: 'Hint: If Δ is negative, the square root part in the quadratic formula is not real. Consider whether the equation has real solutions.' },
          { id: 'math-2', text: 'Solve the quadratic equation: x² - 5x + 6 = 0.', tips: 'Hint: Factor the quadratic expression into two binomials. Look for numbers that multiply to 6 and add to -5.' },
          { id: 'math-3', text: 'When is factoring a better method than the quadratic formula?', tips: 'Hint: Factoring is usually easier when the coefficients are small integers and the expression factors nicely.' },
          { id: 'math-4', text: 'If a quadratic equation has a repeated root, what should the discriminant equal?', tips: 'Hint: A repeated root means the plus/minus part of the quadratic formula is zero.' },
          { id: 'math-5', text: 'For ax² + bx + c = 0 with roots α and β, write Vieta’s formulas linking the roots and coefficients.', tips: 'Hint: α + β = -b/a and αβ = c/a.' },
          { id: 'math-6', text: 'A rectangle’s length is 3m longer than its width and its area is 40 m². Write the quadratic equation to solve for the width.', tips: 'Hint: Let width = x and length = x + 3, then use area = length × width.' }
        ]
      }
    ]
  };
}

function loadData() {
  ensureDataFiles();
  const raw = fs.readFileSync(dataFilePath, 'utf8');
  return JSON.parse(raw);
}

function loadAnswers() {
  ensureDataFiles();
  const raw = fs.readFileSync(answersFilePath, 'utf8');
  return JSON.parse(raw);
}

function saveAnswers(answers) {
  fs.writeFileSync(answersFilePath, JSON.stringify(answers, null, 2));
}

function getCurrentUserId() {
  return 'demo-user';
}

app.get('/api/subjects', (req, res) => {
  try {
    const data = loadData();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load subjects' });
  }
});

app.get('/api/progress/:subjectId', (req, res) => {
  try {
    const answers = loadAnswers();
    const userId = getCurrentUserId();
    const userAnswers = answers[userId] || {};
    const subjectAnswers = userAnswers[req.params.subjectId] || {};
    res.json({ subjectId: req.params.subjectId, answers: subjectAnswers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

app.post('/api/answers/save', (req, res) => {
  try {
    const { questionId, content, subjectId } = req.body;
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }

    const userId = getCurrentUserId();
    const answers = loadAnswers();
    answers[userId] = answers[userId] || {};
    answers[userId][subjectId || 'chinese'] = answers[userId][subjectId || 'chinese'] || {};
    answers[userId][subjectId || 'chinese'][questionId] = {
      content,
      isCompleted: Boolean(content && content.trim()),
      updatedAt: new Date().toISOString()
    };
    saveAnswers(answers);

    res.json({ success: true, questionId, content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

function handleAiGrade(req, res) {
  try {
    console.log('[API] /api/process called with body:', JSON.stringify(req.body).slice(0,1000));
    const { subjectId, answers } = req.body;
    const data = loadData();
    const subject = data.subjects.find((item) => item.id === subjectId) || data.subjects[0];

    const formattedAnswers = (subject.questions || []).map((question, index) => {
      const response = answers?.[question.id] || '';
      return `### ${index + 1}. ${question.text}\n- 學生作答：${response || '（空白）'}\n`;
    }).join('\n');

    const prompt = `你是一位資深的香港 DSE 教學與評卷專家。請根據以下題目與學生答案，給出一份詳細、鼓勵且有建設性的評語。\n\n科目：${subject.name}\n\n閱讀文章：\n${subject.passage || '（無閱讀文章）'}\n\n題目與答案：\n${formattedAnswers}\n\n請以繁體中文輸出，包含：\n1. 整體表現總結\n2. 優點\n3. 可改善之處\n4. 建議下一步\n5. 最後給出一段溫和且鼓勵的總結。`;

    const report = `# AI 評語報告\n\n${prompt}\n\n---\n\n> 這份評語由本地示範後端生成，內容已包含題目與學生回答，適合用來驗證流程.`;

    res.json({ success: true, text: report, prompt });
  } catch (error) {
    console.error(error);
    console.error('[API] /api/process failed:', error && error.stack ? error.stack : error);
    res.status(500).json({ success: false, error: 'Failed to grade answers' });
  }
}

async function handleProcess(req, res) {
  try {
    const body = req.body || {};
    const action = body.action || 'chat';
    const apiKey = getGeminiApiKey(body);
    const prompt = buildServicePrompt(action, body, body.text || '');

    if (action === 'grade' || action === 'grading') {
      return handleAiGrade(req, res);
    }

    try {
      const result = await callGemini({
        prompt,
        apiKey,
        temperature: action === 'pvp' ? 0.2 : 0.7,
        maxOutputTokens: action === 'mock-paper' ? 2600 : 1400,
      });

      res.json({ success: true, text: result, result, message: result, subject: String(body.chatRoomId || body.subjectId || body.subject || 'general').toLowerCase() });
    } catch (error) {
      const subjectKey = String(body.chatRoomId || body.subjectId || body.subject || 'chinese').toLowerCase();
      const fallbackText = buildFallbackMockPaper(subjectKey, body.text || '');
      console.warn('[API] Gemini unavailable, returning fallback mock paper:', error.message || error);
      res.json({ success: true, text: fallbackText, result: fallbackText, message: fallbackText, fallback: true });
    }
  } catch (error) {
    console.error('[API] /api/process failed:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process request' });
  }
}

app.post('/api/ai/grade', handleProcess);
app.post('/api/process', handleProcess);
app.post('/api/mock-paper', handleProcess);

app.get('/', (req, res) => {
  res.send('AURA learning training backend is running');
});

let server;

if (process.env.NODE_ENV !== 'test' && process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

export { app, server };
