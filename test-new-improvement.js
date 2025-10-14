const axios = require('axios');
require('dotenv').config();

async function testNewImprovementFormat() {
  console.log('Testing new improvement format with GPT-5...');
  
  const improvementPrompt = `
ТЫ: Эксперт IELTS Writing, улучшаешь тексты студентов до уровня 7.0

ЗАДАЧА: Улучшить текст и дать 5 практических советов в новом формате с примерами из реального текста пользователя.

ОБЯЗАТЕЛЬНЫЙ ФОРМАТ ОТВЕТА:
{
  "improved_text": "улучшенный текст на английском",
  "writing_advice": [
    {
      "number": "1️⃣",
      "title": "Сделай позицию чёткой и возвращайся к ней в конце",
      "why": "💬 Зачем: IELTS оценивает, насколько ясно ты выражаешь мнение.",
      "how": "🧠 Как: во вступлении пиши фразу, показывающую твою позицию (I strongly believe / I personally prefer / I am convinced that…).",
      "example_bad": "цитата из оригинального текста пользователя",
      "example_good": "исправленная версия этой же цитаты", 
      "action": "🪄 Что делать: начни первое предложение с позиции, и повтори её в последней строке заключения другими словами."
    },
    {
      "number": "2️⃣", 
      "title": "Разделяй текст на 3 блока: вступление — аргументы — вывод",
      "why": "💬 Зачем: Экзаменатор проверяет структуру (Coherence & Cohesion).",
      "how": "🧠 Как:\\n\\nВступление → идея + мнение.\\n\\nОсновная часть → 2 причины с примерами.\\n\\nЗаключение → обобщение и финальная мысль.",
      "example_bad": "цитата из оригинального текста пользователя",
      "example_good": "исправленная версия этой же цитаты",
      "action": "🪄 Что делать: проверь, что у тебя есть четкие границы между частями текста."
    },
    {
      "number": "3️⃣",
      "title": "Добавляй связки, чтобы текст \\"тёк\\" естественно",
      "why": "💬 Зачем: Без связок текст кажется \\"кусочным\\".",  
      "how": "🧠 Как: Используй разные типы:\\n\\nУступка: Although, Even though\\n\\nПротивопоставление: However, On the other hand\\n\\nПричина/следствие: Because, As a result, Therefore\\n\\nВремя: When, After, Before",
      "example_bad": "цитата из оригинального текста пользователя",
      "example_good": "исправленная версия этой же цитаты",
      "action": "🪄 Что делать: найди места, где можно добавить linking words."
    },
    {
      "number": "4️⃣",
      "title": "Укрепляй словарь — 3 новых слова по теме",
      "why": "💬 Зачем: Lexical Resource даёт +0.5–1 балл.",
      "how": "🧠 Как: выбирай синонимы и устойчивые выражения по теме.",
      "example_bad": "цитата из оригинального текста пользователя",
      "example_good": "исправленная версия этой же цитаты",
      "action": "🪄 Что делать: после каждого текста выписывай 3 новых слова и попробуй использовать их в следующем."
    },
    {
      "number": "5️⃣",
      "title": "Добавь \\"гибкую грамматику\\" — хотя бы одно сложное предложение",
      "why": "💬 Зачем: Grammatical Range = обязательный критерий Band 7+.",
      "how": "🧠 Как:\\n\\nИспользуй Although / While / Because для сложных предложений.\\n\\nДобавь условное или причастное:\\nIf I go to bed early, I can't focus well.\\nFeeling tired, I prefer working at night.",
      "example_bad": "цитата из оригинального текста пользователя", 
      "example_good": "исправленная версия этой же цитаты",
      "action": "🪄 Что делать: найди простые предложения и объедини их в сложные."
    }
  ],
  "vocabulary_words": [
    {
      "word": "слово",
      "translation": "перевод", 
      "example": "предложение с этим словом на английском"
    }
  ]
}

КРИТИЧЕСКИ ВАЖНО:
- Все примеры example_bad и example_good должны быть ИЗ РЕАЛЬНОГО ТЕКСТА пользователя
- vocabulary_words - 5 слов релевантных теме текста пользователя
- improved_text только на английском
- Все остальное только на русском
- Возвращай ТОЛЬКО JSON!
`;

  const testText = `I think work at night is better for me. I go to bed late and wake up late. My friends say this is bad but I don't think so. I can work good at night because nobody disturb me. Also the house is quiet and I can focus. In the morning I am tired and cannot concentrate. So I prefer night time for working.`;

  try {
    console.log('Sending request to GPT-5...');
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-5',
      messages: [
        { role: 'system', content: improvementPrompt },
        { role: 'user', content: `Исходный текст для улучшения:\n\n${testText}` }
      ],
      temperature: 1,
      max_completion_tokens: 6000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('\n=== RAW RESPONSE ===');
    console.log('Status:', response.status);
    const content = response.data.choices[0].message.content.trim();
    console.log('Content length:', content.length);
    
    // Пробуем парсить JSON
    try {
      const parsed = JSON.parse(content);
      console.log('\n=== PARSED SUCCESS ===');
      console.log('Has improved_text:', !!parsed.improved_text);
      console.log('Writing advice count:', parsed.writing_advice?.length || 0);
      console.log('Vocabulary words count:', parsed.vocabulary_words?.length || 0);
      
      if (parsed.writing_advice && parsed.writing_advice.length > 0) {
        console.log('\n=== FIRST ADVICE EXAMPLE ===');
        console.log('Title:', parsed.writing_advice[0].title);
        console.log('Example bad:', parsed.writing_advice[0].example_bad);
        console.log('Example good:', parsed.writing_advice[0].example_good);
      }
      
    } catch (parseError) {
      console.log('\n=== JSON PARSE ERROR ===');
      console.log('Parse error:', parseError.message);
      console.log('First 500 chars:', content.substring(0, 500));
    }

  } catch (error) {
    console.error('=== API ERROR ===');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data || error.message);
  }
}

testNewImprovementFormat();