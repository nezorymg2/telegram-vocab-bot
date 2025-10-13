// Тест прямого обращения к OpenAI API для проверки доступности
const axios = require('axios');
require('dotenv').config();

async function testOpenAIAPI() {
  console.log('🧪 Тестируем прямое обращение к OpenAI API...\n');

  // Проверяем наличие API ключа
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY не найден в переменных окружения');
    console.log('💡 Убедитесь, что файл .env существует и содержит OPENAI_API_KEY=...');
    return;
  }

  console.log('✅ API ключ найден');
  console.log('🔑 Ключ начинается с:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');

  // Тест 1: Простой запрос к GPT-3.5
  console.log('\n📝 Тест 1: Простой запрос к GPT-3.5-turbo');
  
  try {
    const simplePrompt = 'Напиши одно предложение про погоду сегодня.';
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: simplePrompt }],
      temperature: 0.7,
      max_tokens: 100
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 секунд таймаут
    });

    console.log('✅ GPT-3.5 ответил успешно!');
    console.log('📄 Ответ:', response.data.choices[0].message.content);
    console.log('📊 Статус:', response.status);
    console.log('🔢 Использованные токены:', response.data.usage);

  } catch (error) {
    console.error('❌ Ошибка с GPT-3.5:');
    console.error('   Статус:', error.response?.status || 'Нет статуса');
    console.error('   Сообщение:', error.message);
    if (error.response?.data) {
      console.error('   Детали:', error.response.data);
    }
  }

  // Тест 2: Запрос к GPT-4o
  console.log('\n📝 Тест 2: Запрос к GPT-4o');
  
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Привет! Как дела?' }],
      temperature: 0.7,
      max_tokens: 50
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ GPT-4o ответил успешно!');
    console.log('📄 Ответ:', response.data.choices[0].message.content);

  } catch (error) {
    console.error('❌ Ошибка с GPT-4o:');
    console.error('   Статус:', error.response?.status || 'Нет статуса');
    console.error('   Сообщение:', error.message);
    if (error.response?.data) {
      console.error('   Детали:', error.response.data);
    }
  }

  // Тест 3: Запрос к GPT-5 (как в боте)
  console.log('\n📝 Тест 3: Запрос к GPT-5 (как в боте)');
  
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-5',
      messages: [
        { 
          role: 'system', 
          content: 'Ты эксперт по анализу английских текстов для IELTS Writing.' 
        },
        { 
          role: 'user', 
          content: 'LANG=ru\\nTEXT=\\nI like to read books. Reading is good for me.' 
        }
      ],
      temperature: 1,
      max_completion_tokens: 100
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ GPT-5 ответил успешно!');
    console.log('📄 Ответ:', response.data.choices[0].message.content.substring(0, 200) + '...');

  } catch (error) {
    console.error('❌ Ошибка с GPT-5:');
    console.error('   Статус:', error.response?.status || 'Нет статуса');  
    console.error('   Сообщение:', error.message);
    if (error.response?.data) {
      console.error('   Детали:', error.response.data);
    }
  }

  // Тест 4: Генерация текста для стадии 5 (как в боте)
  console.log('\n📝 Тест 4: Генерация текста для стадии 5');
  
  const storyPrompt = `Напиши короткий текст на английском языке из 5-8 предложений на тему технологий.

В тексте используй эти слова: **vital**, **assess**, **competitive**.

Ответ в JSON формате:
{
  "text": "текст",
  "questions": [{"question": "вопрос?", "options": ["a", "b"], "correct_option": "a"}]
}`;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: storyPrompt }],
      temperature: 0.8,
      max_tokens: 1000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ Генерация текста успешна!');
    
    const answer = response.data.choices[0].message.content;
    console.log('📄 Ответ:', answer.substring(0, 300) + '...');
    
    // Пробуем парсить JSON
    try {
      const match = answer.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        console.log('✅ JSON парсится успешно');
        console.log('📝 Текст длиной:', parsed.text?.length || 0, 'символов');
        console.log('❓ Вопросов:', parsed.questions?.length || 0);
      } else {
        console.log('❌ JSON не найден в ответе');
      }
    } catch (parseError) {
      console.log('❌ Ошибка парсинга JSON:', parseError.message);
    }

  } catch (error) {
    console.error('❌ Ошибка генерации текста:');
    console.error('   Статус:', error.response?.status || 'Нет статуса');
    console.error('   Сообщение:', error.message);
    if (error.response?.data) {
      console.error('   Детали:', error.response.data);
    }
  }

  console.log('\n🏁 Тестирование завершено!');
}

// Запускаем тесты
testOpenAIAPI().catch(console.error);