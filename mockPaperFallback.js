const SUBJECT_LABELS = {
  chinese: '香港 DSE 中國語文',
  english: '香港 DSE 英文',
  math_ch: '香港 DSE 數學（中文版）',
  math_en: '香港 DSE Mathematics (English)',
  math_ch_mc: '香港 DSE 數學 MC（中文版）',
  math_en_mc: '香港 DSE Mathematics MC (English)',
};

export function buildFallbackMockPaper(subjectKey = 'chinese', userText = '') {
  const subject = String(subjectKey || 'chinese').toLowerCase();
  const subjectLabel = SUBJECT_LABELS[subject] || '香港 DSE 科目';
  const isEnglish = ['english', 'math_en', 'math_en_mc'].includes(subject);

  if (isEnglish) {
    return `# Mock Paper Preview

## ${subjectLabel}

This is a fallback mock paper generated locally because the AI service is temporarily unavailable.

### Paper Structure
1. Reading comprehension
2. Grammar and vocabulary
3. Short writing task
4. Extended response task

### Notes
- The content is kept concise and exam-style.
- Please use this as a placeholder while the Gemini service is being restored.

User request: ${userText || 'Generate a mock paper.'}`;
  }

  return `# Mock 卷預覽

## ${subjectLabel}

這是一份本地回退的模擬試卷內容，因為 AI 服務暫時不可用，所以先提供一份可預覽的占位版本。

### 試卷結構
1. 閱讀理解題
2. 語文運用題
3. 短答題
4. 延伸寫作題

### 備註
- 內容已盡量保持 DSE 風格與清晰分段。
- 若 Gemini 服務恢復，系統會自動替換為完整試卷內容。

使用者要求：${userText || '請生成一份模擬試卷。'}`;
}
