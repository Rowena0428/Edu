import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
        id: 'math',
        name: '數學科',
        subtitle: '代數運算',
        title: '二次方程求解',
        author: '單元：Mathematics Unit',
        passage: '',
        chapters: ['1. 二次方程定義', '2. 因式分解法解題', '3. 配方法精講', '4. 公式法與判別式', '5. 根與係數的關係', '6. 二次方程應用題'],
        questions: [
          { id: 'math-1', text: '當判別式 Δ 小於 0 時，該二次方程的實數根有何特徵？', tips: '提示：想一想如果判別式小於 0，在求根公式的根號內會出現負數，這在「實數範圍」內是否允許？有沒有實數解？' },
          { id: 'math-2', text: '試求解二次方程：x² - 5x + 6 = 0。', tips: '提示：常數項是 6，一次項係數是 -5。試著將 6 分解成兩個負數的乘積（例如 -2 與 -3），然後運用十字相乘法進行因式分解。' },
          { id: 'math-3', text: '什麼情況下最適合使用因式分解法而非公式法？', tips: '提示：從計算效率和數字特徵來看，當常數項與一次項係數很容易被肉眼分解為整數乘積優於公式法。' },
          { id: 'math-4', text: '若一組二次方程有重根，其判別式的值應該是多少？', tips: '提示：重根代表方程有兩個相等的實數解。在求根公式中，加減號後面的部分必須變成多少才能讓兩個解完全相同？' },
          { id: 'math-5', text: '若二次方程 ax² + bx + c = 0 的兩根為 α 和 β，請寫出其韋達定理（根與係數關係）的表達式。', tips: '提示：兩根之和 α + β 等於負的二次項係數分之一次項係數；兩根之積 αβ 等於二次項係數分之常數項。' },
          { id: 'math-6', text: '一個矩形的花園，長比寬多 3 米，面積為 40 平方米，請列出求寬度的二次方程。', tips: '提示：提示：設寬度為 x 米，則長度為 (x + 3) 米。利用面積公式「長 × 寬 = 面積」展開並整理成標準一般式。' }
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

app.post('/api/ai/grade', (req, res) => {
  try {
    const { subjectId, answers } = req.body;
    const data = loadData();
    const subject = data.subjects.find((item) => item.id === subjectId) || data.subjects[0];

    const formattedAnswers = (subject.questions || []).map((question, index) => {
      const response = answers?.[question.id] || '';
      return `### ${index + 1}. ${question.text}\n- 學生作答：${response || '（空白）'}\n`;
    }).join('\n');

    const prompt = `你是一位資深的香港 DSE 教學與評卷專家。請根據以下題目與學生答案，給出一份詳細、鼓勵且有建設性的評語。\n\n科目：${subject.name}\n\n閱讀文章：\n${subject.passage || '（無閱讀文章）'}\n\n題目與答案：\n${formattedAnswers}\n\n請以繁體中文輸出，包含：\n1. 整體表現總結\n2. 優點\n3. 可改善之處\n4. 建議下一步\n5. 最後給出一段溫和且鼓勵的總結。`;

    const report = `# AI 評語報告\n\n${prompt}\n\n---\n\n> 這份評語由本地示範後端生成，內容已包含題目與學生回答，適合用來驗證流程。`;

    res.json({ report, prompt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to grade answers' });
  }
});

app.get('/', (req, res) => {
  res.send('AURA learning training backend is running');
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
