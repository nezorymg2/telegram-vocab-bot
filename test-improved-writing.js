const axios = require('axios');
require('dotenv').config();

// Тест функции улучшения текста
async function testImprovedVersion() {
  try {
    console.log('=== Тест улучшения текста ===');
    
    const testText = `I think climate change is very bad problem. It make many problems for people and animals. We should do something about it because it is important. The temperature is getting higher and this cause problems. People need to use less energy and drive less cars.`;
    
    const improvementPrompt = `
YOU ARE: IELTS Writing Expert & Text Improver

TASK: Улучшить текст студента до уровня IELTS Writing 7.0, учитывая все 4 критерия оценки.

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
6. Исправь все грамматические и лексические ошибки

ФОРМАТ ОТВЕТА (JSON):
{
  "improved_text": "Улучшенный текст на уровне IELTS 7.0",
  "improvements": [
    {
      "category": "Task Response|Coherence & Cohesion|Lexical Resource|Grammar",
      "description": "Что было улучшено",
      "example": "Пример улучшения"
    }
  ],
  "key_changes": "Краткое объяснение основных изменений",
  "writing_tips": [
    "Конкретный совет для развития навыков письма",
    "Еще один полезный совет"
  ]
}

ВАЖНО: Возвращай ТОЛЬКО JSON объект без дополнительного текста!
`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: improvementPrompt },
        { role: 'user', content: `Исходный текст для улучшения:\n\n${testText}` }
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
    } catch (e) {
      console.log('Ошибка парсинга JSON:', e.message);
    }
    
  } catch (error) {
    console.error('Ошибка:', error.response?.data || error.message);
  }
}

testImprovedVersion();