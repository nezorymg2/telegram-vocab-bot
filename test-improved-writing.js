const axios = require('axios');
require('dotenv').config();

// Тест функции улучшения текста
async function testImprovedVersion() {
  try {
    console.log('=== Тест улучшения текста ===');
    
    const testText = `I think climate change is very bad problem. It make many problems for people and animals. We should do something about it because it is important. The temperature is getting higher and this cause problems. People need to use less energy and drive less cars.`;
    
    const improvementPrompt = `
ТЫ: Эксперт IELTS Writing и улучшатель текстов

ЗАДАЧА: Улучшить текст студента до уровня IELTS Writing 7.0, учитывая все 4 критерия оценки.

КРИТЕРИИ IELTS WRITING 7.0:
1. Task Response (Ответ на задание):
   - Полное раскрытие темы
   - Четкая позиция автора
   - Развернутые и релевантные идеи
   - Логичное заключение

2. Coherence & Cohesion (Связность):
   - Логичная структура
   - Эффективные связующие слова
   - Четкие параграфы
   - Плавные переходы между идеями

3. Lexical Resource (Лексика):
   - Широкий словарный запас
   - Точное использование слов
   - Идиоматические выражения
   - Минимальные лексические ошибки

4. Grammar (Грамматика):
   - Разнообразные грамматические структуры
   - Сложные предложения
   - Высокая точность
   - Редкие ошибки

ИНСТРУКЦИИ:
1. Сохрани основную идею и смысл оригинального текста
2. Улучши структуру и логику изложения
3. Обогати лексику более продвинутыми словами и фразами
4. Используй разнообразные грамматические конструкции
5. Добавь связующие слова для лучшей связности
6. Исправи все грамматические и лексические ошибки
7. Подбери 10 продвинутых слов по теме для развития словарного запаса

ФОРМАТ ОТВЕТА (JSON):
{
  "improved_text": "Улучшенный текст на уровне IELTS 7.0 (на английском языке)",
  "improvements": [
    {
      "category": "Task Response|Coherence & Cohesion|Lexical Resource|Grammar",
      "description": "Что было улучшено (НА РУССКОМ ЯЗЫКЕ)",
      "example": "Пример улучшения (НА РУССКОМ ЯЗЫКЕ)"
    }
  ],
  "key_changes": "Краткое объяснение основных изменений (НА РУССКОМ ЯЗЫКЕ)",
  "writing_tips": [
    "Конкретный совет для развития навыков письма (НА РУССКОМ ЯЗЫКЕ)",
    "Еще один полезный совет (НА РУССКОМ ЯЗЫКЕ)"
  ]
}

ЯЗЫКОВЫЕ ТРЕБОВАНИЯ:
- Улучшенный текст: ТОЛЬКО НА АНГЛИЙСКОМ
- Все объяснения, описания, примеры, советы: ТОЛЬКО НА РУССКОМ ЯЗЫКЕ
- НИ ОДНОГО АНГЛИЙСКОГО СЛОВА в объяснениях!

ПРИМЕР правильного ответа:
{
  "improved_text": "Climate change represents a critical global challenge...",
  "key_changes": "Текст был переработан для улучшения связности и обогащен продвинутой лексикой",
  "improvements": [
    {
      "category": "Grammar",
      "description": "Добавлены сложные грамматические конструкции и исправлены все ошибки",
      "example": "Вместо простых предложений использованы придаточные предложения"
    }
  ],
  "writing_tips": [
    "Используйте разнообразные связующие слова для улучшения связности текста",
    "Применяйте синонимы чтобы избежать повторений"
  ],
  "vocabulary_boost": [
    {
      "word": "catastrophic",
      "translation": "катастрофический",
      "usage": "The catastrophic effects of climate change are becoming evident.",
      "level": "C1"
    }
  ]
}

ОБЯЗАТЕЛЬНЫЕ ПОЛЯ в JSON:
- improved_text (улучшенный текст на английском)
- key_changes (описание изменений на русском)
- improvements (массив улучшений на русском)
- writing_tips (массив советов на русском)
- vocabulary_boost (ОБЯЗАТЕЛЬНО! массив из 10 слов с переводом и примерами)

СТРОГО: Возвращай ТОЛЬКО JSON без лишнего текста!
`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: improvementPrompt },
        { role: 'user', content: `Исходный текст для улучшения:\n\n${testText}\n\nОТВЕЧАЙ НА РУССКОМ ЯЗЫКЕ ВО ВСЕХ ОБЪЯСНЕНИЯХ! Только сам улучшенный текст должен быть на английском.` }
      ],
      temperature: 0.7,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = response.data.choices[0].message.content.trim();
    console.log('Исходный текст:', testText);
    console.log('\n--- OpenAI ответ ---');
    console.log(result);
    
    try {
      const parsedResult = JSON.parse(result);
      console.log('\n--- Результат ---');
      console.log('Улучшенный текст:', parsedResult.improved_text);
      console.log('\nОсновные изменения:', parsedResult.key_changes);
      console.log('\nУлучшения:');
      parsedResult.improvements?.forEach((imp, i) => {
        console.log(`${i+1}. ${imp.category}: ${imp.description}`);
        if (imp.example) console.log(`   Пример: ${imp.example}`);
      });
      console.log('\nСоветы:');
      parsedResult.writing_tips?.forEach((tip, i) => {
        console.log(`${i+1}. ${tip}`);
      });
      
      if (parsedResult.vocabulary_boost?.length > 0) {
        console.log('\nТоп-10 слов для этой темы:');
        parsedResult.vocabulary_boost.forEach((vocab, i) => {
          console.log(`${i+1}. ${vocab.word} - ${vocab.translation}`);
          if (vocab.usage) console.log(`   Пример: ${vocab.usage}`);
        });
      }
    } catch (e) {
      console.log('Ошибка парсинга JSON:', e.message);
    }
    
  } catch (error) {
    console.error('Ошибка:', error.response?.data || error.message);
  }
}

testImprovedVersion();