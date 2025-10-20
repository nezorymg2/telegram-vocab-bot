// Тест для проверки исправления проблемы с генерацией улучшенного текста

const testInvalidJSON = () => {
  console.log('Testing invalid JSON parsing...');
  
  // Имитируем некорректный JSON как в логах пользователя
  const invalidResponse = `{
  "improved_text": "We are constantly faced with numerous choices in our daily lives, particularly when it comes to food. While some individuals strive to consume healthy meals, they often resort to fast food instead. The distinctions between healthy food and fast food are significant. Firstly, fast food is typically high in cholesterol, which can have detrimental effects on the body. Excessive cholesterol can lead to feelings of fatigue and lethargy, causing individuals to desire more sleep. Secondly, a diet high in fast food can contribute to weight gain, prompting individuals to continue eating excessively. In contrast, healthy food actively helps in reducing cholesterol levels and promotes overall heart health. Incorporating more fruits and vegetables into one's diet leads to a fitter, healthier body. In conclusion, I firmly believe that people should prioritize healthy eating, as the benefits of nutritious food far outweigh those of fast food."
  },
  "writing_advice": [
    {
      "number": "1️⃣",
      "title": "Сделай позицию чёткой и возвращайся к ней в конце",
      "why": "💬 Зачем: IELTS оценивает, насколько ясно ты выражаешь мнение.",
      "how": "🧠 Как: во вступлении пиши фразу, показывающую твою позицию (I strongly believe / I personally prefer / I am convinced that…).",
      "example_bad": "In conclusion, I think about the people need to eat more healthy food.",
      "example_good": "In conclusion, I firmly believe that people should prioritize healthy eating.",
      "action": "🪄 Что делать: начни первое предложение с позиции, и повтори её в последней строке заключения другими словами."
    },
    {
      "number": "2️⃣", 
      "title": "Разделяй текст на 3 блока: вступление — аргументы — вывод",
      "why": "💬 Зачем: Экзаменатор проверяет структуру (Coherence & Cohesion).",
      "how": "🧠 Как:\\n\\nВступление →.idea + opinion.\\n\\nОсновная часть → 2 причины с примерами.\\n\\nЗаключение → обобщение и финальная мысль.",
      "example_bad": "Firstly, fast food have a lot of the cholesterol and the cholesterol have bad effects for body.",
      "example_good": "Firstly, fast food is typically high in cholesterol, which can have detrimental effects on the body.",
      "action": "🪄 Что делать: проверь, что у тебя есть четкие границы между частями текста."
    },
    {
      "number": "3️⃣",
      "title": "Добавляй связки, чтобы текст \\"тёк\\" естественно",
      "why": "💬 Зачем: Без связок текст кажется \\"кусочным\\".",  
      "how": "🧠 Как: Используй разные типы:\\n\\nУступка: Although, Even though\\n\\nПротивопоставление: However, On the other hand\\n\\nПричина/следствие: Because, As a result, Therefore\\n\\nВремя: When, After, Before",
      "example_bad": "Healthy food and fast food have more the differences.",
      "example_good": "The distinctions between healthy food and fast food are significant.",
      "action": "🪄 Что делать: найди места, где можно добавить linking words."
      "example_bad": "Healthy food have a good effects for body.",
    },
    {
      "number": "4️⃣",
      "example_good": "Healthy food actively helps in reducing cholesterol levels and promotes overall heart health.",
      "title": "Укрепляй словарь — 3 новых слова по теме",
      "action": "🪄 Что делать: после каждого текста выписывай 3 новых слова и попробуй использовать их в следующем."
      "why": "💬 Зачем: Lexical Resource даёт +0.5–1 балл.",  
    },
      "how": "🧠 Как: выбирай синонимы и устойчивые выражения по теме.",
    {
      "example_bad": "Healthy food and fast food have more the differences.",
      "number": "5️⃣",
      "example_good": "The distinctions between healthy food and fast food are significant.",
      "title": "Добавь \\"гибкую грамматику\\" — хотя бы одно сложное предложение",
      "action": "🪄 Что делать: найди места, где можно добавить linking words."
      "why": "💬 Зачем: Grammatical Range = обязательный критерий Band 7+.",
    },
      "how": "🧠 Как:\\n\\nИспользуй Although / While / Because для сложных предложений.\\n\\nДобавь условное или причастное:\\nIf I go to bed early, I can't focus well.\\nFeeling tired, I prefer working at night.",
      "example_bad": "If people have a lot of cholesterol , they feel bad and always tired , want yo sleep.",
      "example_good": "Excessive cholesterol can lead to feelings of fatigue and lethargy, causing individuals to desire more sleep.",
      "action": "🪄 Что делать: найди простые предложения и объедини их в сложные."
    }
  ],
  "vocabulary_words": [
    {
      "word": "det detrimental",
      "translation": "вредный", 
      "example": "Fast food can have detrimental effects on one's health."
    },
    {
      "word": "prioritize",
      "translation": "приоритизировать", 
      "example": "People should prioritize their well-being over convenience."
    },
    {
      "word": "incorporate",
      "translation": "включать", 
      "example": "It is important to incorporate a variety of fruits and vegetables into your diet."
    },
    {
      "word": "significant",
      "translation": "значительный", 
      "example": "There is a significant difference between healthy and fast food."
    },
    {
      "word": "lethargy",
      "translation": "слабость", 
      "example": "Consuming too much fast food can lead to lethargy."
    }
  ]
}`;

  console.log('Original response length:', invalidResponse.length);

  // Попытка 1: Обычный JSON.parse
  try {
    const data1 = JSON.parse(invalidResponse);
    console.log('✅ Standard JSON.parse succeeded');
    return data1;
  } catch (e1) {
    console.log('❌ Standard JSON.parse failed:', e1.message);
    
    // Попытка 2: Regex extraction + cleanup
    try {
      const jsonMatch = invalidResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonString = jsonMatch[0];
        
        // Дополнительная очистка
        jsonString = jsonString.replace(/,\s*,/g, ',');
        jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
        
        const data2 = JSON.parse(jsonString);
        console.log('✅ Regex + cleanup succeeded');
        return data2;
      } else {
        throw new Error('JSON not found in response');
      }
    } catch (e2) {
      console.log('❌ Regex + cleanup failed:', e2.message);
      
      // Попытка 3: Manual extraction
      try {
        const improvedTextMatch = invalidResponse.match(/"improved_text":\s*"([^"]*(?:\\.[^"]*)*)"/);
        
        if (improvedTextMatch) {
          console.log('✅ Manual extraction succeeded');
          return {
            improved_text: improvedTextMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
            writing_advice: [],
            vocabulary_words: []
          };
        } else {
          throw new Error('Could not extract improved_text manually');
        }
      } catch (e3) {
        console.log('❌ All methods failed');
        console.log('Using fallback data');
        return {
          improved_text: "Sorry, couldn't generate improved version due to technical issues.",
          writing_advice: [],
          vocabulary_words: []
        };
      }
    }
  }
};

// Запуск тестов
console.log('=== TESTING JSON PARSING FIXES ===');
const result = testInvalidJSON();
console.log('Final result:', {
  hasImprovedText: !!result.improved_text,
  adviceCount: result.writing_advice?.length || 0,
  vocabularyCount: result.vocabulary_words?.length || 0
});

console.log('=== TEST COMPLETED ===');