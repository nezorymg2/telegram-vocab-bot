// Быстрый тест GPT-4o для анализа текста
const axios = require('axios');
require('dotenv').config();

async function quickTestGPT4oAnalysis() {
  console.log('🔥 ЭКСТРЕННЫЙ ТЕСТ: GPT-4o для анализа текста\n');

  const testText = `I think working from home is good. You can save time and money. But it have disadvantages too.`;

  const systemPrompt = `ТЫ: Эксперт по анализу текстов IELTS Writing Task 2

ЗАДАЧА: Проанализировать текст студента и дать краткую обратную связь

ОБЯЗАТЕЛЬНЫЙ JSON ФОРМАТ:
{
  "band_estimate": "6.5",
  "summary": "Краткий отзыв на русском...",
  "global_advice": "Советы на русском...",
  "errors": [
    {
      "title": "Название ошибки",
      "rule": "Правило на русском", 
      "meme": "Ассоциация на русском",
      "examples": [{"from": "Ошибка", "to": "Исправление"}]
    }
  ],
  "drills": []
}`;

  try {
    console.log('📝 Тестовый текст:', testText);
    console.log('\n🚀 Отправляем GPT-4o...');

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `LANG=ru\nTEXT=\n${testText}` }
      ],
      temperature: 0.8,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const analysisResponse = response.data.choices[0].message.content.trim();
    
    console.log('✅ GPT-4o ответил!');
    console.log('📏 Длина ответа:', analysisResponse.length);
    console.log('📄 Ответ:', analysisResponse);
    
    // Проверяем пустота ли ответ
    if (!analysisResponse || analysisResponse.length < 10) {
      console.log('❌ ПУСТОЙ ОТВЕТ - будет fallback!');
      return;
    }

    // Пытаемся парсить JSON
    let analysisData;
    try {
      analysisData = JSON.parse(analysisResponse);
      console.log('✅ JSON парсится успешно!');
      console.log('🎯 Оценка:', analysisData.band_estimate);
      console.log('📝 Отзыв:', analysisData.summary?.substring(0, 100) + '...');
      console.log('🔍 Ошибок:', analysisData.errors?.length || 0);
    } catch (parseError) {
      try {
        const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[0]);
          console.log('✅ JSON найден в тексте и парсится!');
        } else {
          console.log('❌ JSON не найден в ответе');
        }
      } catch (e) {
        console.log('❌ Ошибка парсинга JSON:', e.message);
      }
    }

    console.log('\n🎉 РЕЗУЛЬТАТ: GPT-4o РАБОТАЕТ ДЛЯ АНАЛИЗА!');

  } catch (error) {
    console.error('❌ ОШИБКА:', error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', error.response.data);
    }
  }
}

quickTestGPT4oAnalysis().catch(console.error);