// Тест для 2-го этапа - анализ текста учеником и проверка учителем GPT
const axios = require('axios');
require('dotenv').config();

async function testStage2WritingAnalysis() {
  console.log('🧪 Тестируем 2-й этап - анализ текста учителем GPT...\n');

  // Проверяем наличие API ключа
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY не найден');
    return;
  }

  console.log('✅ API ключ найден');

  // Тестовый текст ученика с ошибками для анализа
  const studentText = `Many people believes that working from home is better than office work. I think this is true because you can save time and money. You don't need to spent time for transportation and you can wear comfortable clothes.

But working from home have some disadvantages too. You can't communicate with colleagues face to face and sometimes you feel lonely. Also, it's hard to separate work and personal life when you work at home.

In conclusion, working from home has both advantages and disadvantages, and people should choose what is best for their situation.`;

  console.log('📝 Тестовый текст ученика:');
  console.log(studentText);
  console.log('\n🔍 Отправляем на анализ к GPT-5 учителю...\n');

  // Создаем промпт как в реальном боте (из функции handleWritingAnalysis)
  const systemPrompt = `ТЫ: Эксперт по анализу текстов IELTS Writing Task 2, строгий но справедливый экзаменатор

ЗАДАЧА: Проанализировать текст студента и дать детальную обратную связь

КРИТЕРИИ ОЦЕНКИ (каждый от 0 до 9):
1. Task Response (TR) - полнота раскрытия темы и позиция автора
2. Coherence & Cohesion (CC) - логика, связность, переходы между идеями  
3. Lexical Resource (LR) - словарный запас, точность употребления
4. Grammatical Range & Accuracy (GRA) - разнообразие и правильность грамматики

ОБЯЗАТЕЛЬНЫЙ JSON ФОРМАТ:
{
  "band_estimate": "6.5",
  "summary": "Подробный общий отзыв о тексте на русском...",
  "global_advice": "Конкретные рекомендации для улучшения на русском...",
  "errors": [
    {
      "title": "Название ошибки",
      "rule": "Правило грамматики на русском", 
      "meme": "Ассоциация для запоминания на русском",
      "examples": [
        {
          "from": "Неправильный вариант из текста",
          "to": "Исправленный вариант"
        }
      ]
    }
  ],
  "drills": [
    {
      "title": "Название упражнения",
      "rule": "Правило на русском",
      "exercises": [
        {
          "question": "Вопрос на русском",
          "type": "fill",
          "text": "Предложение с пропуском ▢",
          "word_count": 1,
          "correct_answer": "правильный ответ",
          "accepted": ["правильный ответ", "синоним"],
          "hint": "Подсказка на русском"
        }
      ]
    }
  ]
}

ВАЖНО: Возвращай ТОЛЬКО этот JSON объект, никакого лишнего текста!`;

  try {
    console.log('🔄 Пробуем с GPT-4o (более стабильная модель)...');
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `LANG=ru\nTEXT=\n${studentText}` }
      ],
      temperature: 0.8,
      max_tokens: 4000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 90000 // 90 секунд
    });

    let analysisResponse = response.data.choices[0].message.content.trim();
    
    console.log('🎓 GPT-5 учитель ответил!');
    console.log('📏 Длина ответа:', analysisResponse.length, 'символов');
    console.log('📄 Сырой ответ:');
    console.log(analysisResponse.substring(0, 500) + '...\n');

    // Проверяем что ответ не пустой (как в реальном боте)
    if (!analysisResponse || analysisResponse.length < 10) {
      console.log('❌ Пустой ответ - сработает fallback система');
      return;
    }

    let analysisData;
    
    // Парсим JSON как в реальном боте (множественные попытки)
    try {
      console.log('🔧 Пытаемся парсить JSON...');
      
      // 1. Прямой парсинг
      analysisData = JSON.parse(analysisResponse);
      console.log('✅ Парсинг успешен (прямой)');
    } catch (e1) {
      try {
        // 2. Поиск между {}
        const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[0]);
          console.log('✅ Парсинг успешен (поиск {})');
        } else {
          throw new Error('JSON not found');
        }
      } catch (e2) {
        try {
          // 3. Поиск в ```json блоках
          const codeBlockMatch = analysisResponse.match(/```json\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            analysisData = JSON.parse(codeBlockMatch[1]);
            console.log('✅ Парсинг успешен (```json блок)');
          } else {
            throw new Error('JSON block not found');
          }
        } catch (e3) {
          console.error('❌ Все попытки парсинга провалились:', e1.message, e2.message, e3.message);
          return;
        }
      }
    }

    // Проверяем структуру как в реальном боте
    console.log('\n📊 Анализ результата:');
    console.log('🎯 Оценка:', analysisData.band_estimate || 'НЕТ');
    console.log('📝 Отзыв:', analysisData.summary ? 'ЕСТЬ (' + analysisData.summary.length + ' символов)' : 'НЕТ');
    console.log('💡 Советы:', analysisData.global_advice ? 'ЕСТЬ (' + analysisData.global_advice.length + ' символов)' : 'НЕТ');
    console.log('🔍 Ошибок найдено:', analysisData.errors ? analysisData.errors.length : 0);
    console.log('🏋️ Упражнений создано:', analysisData.drills ? analysisData.drills.length : 0);

    // Показываем детали ошибок
    if (analysisData.errors && analysisData.errors.length > 0) {
      console.log('\n🔍 Детали найденных ошибок:');
      analysisData.errors.forEach((error, index) => {
        console.log(`\n${index + 1}. ${error.title || 'Без названия'}`);
        console.log(`   Правило: ${error.rule || 'Не указано'}`);
        console.log(`   Ассоциация: ${error.meme || 'Нет'}`);
        if (error.examples && error.examples.length > 0) {
          error.examples.forEach((example, i) => {
            console.log(`   Пример ${i + 1}: "${example.from}" → "${example.to}"`);
          });
        }
      });
    }

    // Показываем упражнения
    if (analysisData.drills && analysisData.drills.length > 0) {
      console.log('\n🏋️ Созданные упражнения:');
      analysisData.drills.forEach((drill, index) => {
        console.log(`\n${index + 1}. ${drill.title}`);
        console.log(`   Правило: ${drill.rule}`);
        if (drill.exercises && drill.exercises.length > 0) {
          drill.exercises.forEach((ex, i) => {
            console.log(`   Упражнение ${i + 1}: ${ex.question}`);
            console.log(`   Текст: ${ex.text}`);
            console.log(`   Ответ: ${ex.correct_answer}`);
          });
        }
      });
    }

    // Проверяем готовность для отправки пользователю
    console.log('\n✅ Проверка готовности к отправке:');
    
    // Как в showWritingAnalysisResult
    let message = `📊 Анализ вашего текста:\n\n`;
    message += `🎯 Оценка: ${analysisData.band_estimate}/9 (IELTS Writing)\n\n`;
    message += `📝 Общий отзыв:\n${analysisData.summary}\n\n`;
    message += `💡 Рекомендации:\n${analysisData.global_advice}`;
    
    if (analysisData.errors && analysisData.errors.length > 0) {
      message += `\n\n🔍 Найдено ошибок: ${analysisData.errors.length}`;
      
      analysisData.errors.forEach((error, index) => {
        message += `\n\n${index + 1}. ${error.title}`;
        message += `\n💡 ${error.rule}`;
        message += `\n🧠 ${error.meme}`;
        
        if (error.examples && error.examples.length > 0) {
          error.examples.forEach(example => {
            message += `\n❌ "${example.from}" → ✅ "${example.to}"`;
          });
        }
      });
    }

    console.log('📏 Размер итогового сообщения:', message.length, 'символов');
    console.log('📱 Помещается в Telegram (<4096):', message.length < 4096 ? 'ДА' : 'НЕТ');
    console.log('❌ Есть undefined:', message.includes('undefined') ? 'ДА' : 'НЕТ');

    console.log('\n🎉 Тест 2-го этапа завершен успешно!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
    if (error.response) {
      console.error('📊 Статус:', error.response.status);
      console.error('📄 Детали:', error.response.data);
    }
  }
}

// Запускаем тест
testStage2WritingAnalysis().catch(console.error);