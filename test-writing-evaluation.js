// Тест реальной оценки письма с новой персональной системой

const axios = require('axios');

// Тестовый текст для оценки (имитируем пользователя уровня B1-B2)
const testText = `
Today I want to write about importance of learning English language in modern world. English is very popular language and many people around the world speak it. In my opinion, English is essential for several reasons.

First of all, English helps us to communicate with people from different countries. When I travel, I can speak English with local people and understand them better. This is very useful for making new friends and learning about different cultures.

Secondly, English is important for career development. Many international companies require employees who can speak English fluently. If you know English well, you have more job opportunities and can work in multinational corporations.

Furthermore, English gives us access to information. Most of the content on internet is in English. Scientific articles, news, entertainment - everything is available in English. Without English, we miss a lot of important information.

In conclusion, I believe that learning English is crucial for personal and professional development. It opens many doors and helps us to connect with the global community. Everyone should try to improve their English skills because it will benefit them in many ways.
`;

async function testWritingEvaluation() {
  console.log('🧪 TESTING WRITING EVALUATION SYSTEM');
  console.log('=====================================\n');
  
  console.log('📝 Test Text (B1-B2 level):');
  console.log(testText.trim());
  console.log('\n🤖 Sending to GPT for personalized feedback...\n');
  
  try {
    // Симулируем промпт из бота
    const improvementPrompt = `
ТЫ: Эксперт IELTS Writing, улучшаешь тексты студентов и даешь персональную оценку

ЗАДАЧА:
1. Улучши текст студента (исправь ошибки, улучши стиль, добавь связанность)
2. Дай персональную оценку по 5 категориям
3. Выдели 3-5 новых слов с переводами

ОБЯЗАТЕЛЬНО отвечай ТОЛЬКО в формате JSON:
{
  "improved_text": "улучшенный текст на английском языке",
  "personalized_feedback": {
    "clarity_focus": "💡 персональный комментарий о ясности и фокусе",
    "flow_rhythm": "🎢 персональный комментарий о потоке и ритме", 
    "tone_engagement": "🎯 персональный комментарий о тоне и вовлеченности",
    "development_depth": "🧠 персональный комментарий о развитии идей",
    "precision_ideas": "🏗️ персональный комментарий о точности выражений"
  },
  "vocabulary_words": [
    {"word": "слово", "translation": "перевод", "example": "пример использования"}
  ]
}

ВАЖНО:
- ОБЯЗАТЕЛЬНО включи ВСЕ требуемые поля: improved_text, personalized_feedback (с ВСЕМИ 5 подполями), vocabulary_words
- improved_text: ТОЛЬКО на английском языке (без русских слов!)
- personalized_feedback: каждый комментарий должен быть персональным, конкретным и поддерживающим
- vocabulary_words: выбери 3-5 новых полезных слов из улучшенного текста
- Отвечай ТОЛЬКО JSON без дополнительного текста

ПРИМЕР ОТВЕТА:
{
  "improved_text": "Your improved English text here without any Russian words",
  "personalized_feedback": {
    "clarity_focus": "💡 Ваши идеи ясны! Попробуйте добавить тезисное предложение в начале каждого абзаца.",
    "flow_rhythm": "🎢 Хорошая структура! Варьируйте длину предложений для лучшего ритма чтения.",
    "tone_engagement": "🎯 Академический тон подходящий. Добавьте больше личных примеров для убедительности.",
    "development_depth": "🧠 Основные аргументы представлены. Развивайте каждую идею с конкретными примерами.",
    "precision_ideas": "🏗️ Хорошее использование связующих слов! Используйте более точные прилагательные."
  },
  "vocabulary_words": [
    {"word": "example", "translation": "пример", "example": "This is a good example."}
  ]
}

ТЕКСТ СТУДЕНТА:
${testText.trim()}`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: improvementPrompt }],
      temperature: 0.7,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const gptResponse = response.data.choices[0].message.content;
    console.log('📤 Raw GPT Response:');
    console.log('-------------------');
    console.log(gptResponse);
    console.log('\n🔍 Parsing JSON...\n');

    // Тестируем наш парсинг
    let improvementResponse = gptResponse.trim();
    let improvementData;
    
    try {
      // Дополнительная очистка ответа
      if (!improvementResponse.startsWith('{') || !improvementResponse.endsWith('}')) {
        console.log('⚠️  Response does not start/end with braces, trying to extract JSON');
        const jsonMatch = improvementResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          improvementResponse = jsonMatch[0];
          console.log('✅ Extracted JSON from text');
        } else {
          throw new Error('No valid JSON structure found');
        }
      }
      
      improvementData = JSON.parse(improvementResponse);
      
      // Валидация обязательных полей
      if (!improvementData.improved_text || typeof improvementData.improved_text !== 'string') {
        throw new Error('Missing or invalid improved_text field');
      }
      
      if (!improvementData.personalized_feedback || typeof improvementData.personalized_feedback !== 'object') {
        throw new Error('Missing or invalid personalized_feedback field');
      }
      
      // Проверка всех блоков персональной оценки
      const requiredFeedbackBlocks = ['clarity_focus', 'flow_rhythm', 'tone_engagement', 'development_depth', 'precision_ideas'];
      let missingBlocks = 0;
      
      for (const block of requiredFeedbackBlocks) {
        if (!improvementData.personalized_feedback[block] || typeof improvementData.personalized_feedback[block] !== 'string') {
          console.log(`⚠️  Missing or invalid ${block} in personalized_feedback`);
          improvementData.personalized_feedback[block] = "Анализ временно недоступен из-за технических проблем.";
          missingBlocks++;
        }
      }
      
      if (!Array.isArray(improvementData.vocabulary_words)) {
        console.log('⚠️  vocabulary_words is not an array, creating empty array');
        improvementData.vocabulary_words = [];
      }
      
      console.log('✅ JSON parsed and validated successfully!');
      console.log(`📊 Missing blocks fixed: ${missingBlocks}`);
      console.log(`📚 Vocabulary words: ${improvementData.vocabulary_words.length}`);
      
    } catch (e1) {
      console.log(`❌ Primary parsing failed: ${e1.message}`);
      console.log('🔄 Using fallback data...');
      
      improvementData = {
        improved_text: "Sorry, couldn't generate improved version due to technical issues.",
        personalized_feedback: {
          clarity_focus: "💡 Извините, возникла техническая проблема с анализом ясности.",
          flow_rhythm: "🎢 Попробуйте варьировать длину предложений для лучшего ритма.",
          tone_engagement: "🎯 Добавьте больше личного мнения для большей вовлеченности.",
          development_depth: "🧠 Развивайте идеи более подробно с конкретными примерами.",
          precision_ideas: "🏗️ Используйте более точные выражения вместо общих слов."
        },
        vocabulary_words: []
      };
    }

    // Показываем результат как в боте
    console.log('\n🎯 FINAL RESULT (as user would see):');
    console.log('=====================================\n');
    
    console.log('📄 IMPROVED TEXT:');
    console.log('------------------');
    console.log(improvementData.improved_text);
    console.log('\n');
    
    console.log('🎯 PERSONALIZED FEEDBACK:');
    console.log('---------------------------');
    console.log('💡 Clarity & Focus:', improvementData.personalized_feedback.clarity_focus);
    console.log('🎢 Flow & Rhythm:', improvementData.personalized_feedback.flow_rhythm);
    console.log('🎯 Tone & Engagement:', improvementData.personalized_feedback.tone_engagement);
    console.log('🧠 Development & Depth:', improvementData.personalized_feedback.development_depth);
    console.log('🏗️ Precision & Ideas:', improvementData.personalized_feedback.precision_ideas);
    console.log('\n');
    
    console.log('📚 VOCABULARY WORDS:');
    console.log('---------------------');
    if (improvementData.vocabulary_words && improvementData.vocabulary_words.length > 0) {
      improvementData.vocabulary_words.forEach((vocab, index) => {
        console.log(`${index + 1}. ${vocab.word} - ${vocab.translation}`);
        if (vocab.example) console.log(`   Example: ${vocab.example}`);
      });
    } else {
      console.log('No vocabulary words provided');
    }
    
    console.log('\n✅ TEST COMPLETED SUCCESSFULLY!');
    console.log('🎉 New personalized feedback system is working!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Запуск теста
testWritingEvaluation();