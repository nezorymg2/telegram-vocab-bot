const axios = require('axios');
require('dotenv').config();

async function testFullQuizSystem() {
  console.log('Testing complete quiz system...');
  
  // Тестовые ошибки как из реального анализа
  const mockErrors = [
    {
      title: "Согласование подлежащего и сказуемого",
      rule: "В Present Simple после he/she/it глагол получает окончание -s/-es.",
      examples: [
        {
          from: "My teacher help me learn English.",
          to: "My teacher helps me learn English."
        }
      ]
    },
    {
      title: "Артикли с исчисляемыми существительными", 
      rule: "Исчисляемые существительные в единственном числе обычно требуют артикль a/an или the.",
      examples: [
        {
          from: "Yesterday I saw him at store.",
          to: "Yesterday I saw him at the store."
        }
      ]
    }
  ];

  const quizPrompt = `Создай интерактивный тест на основе ошибок студента. Верни только JSON без лишнего текста.

Структура: 3 Find Hidden Error + 3 Spot & Fix + 4 Mini-dialogs

{
  "quiz_sections": [
    {
      "section_title": "🧠 Часть 1 — Find the Hidden Error (Найди ошибку)",
      "section_description": "(Развивает внимание и чувство языка)",
      "questions": [
        {
          "type": "multiple_choice",
          "question_text": "Choose the correct sentence:",
          "options": ["A) неправильный", "B) правильный ✅", "C) неправильный"],
          "correct_answer": "B",
          "explanation": "💡 Rule: краткое правило"
        }
      ]
    },
    {
      "section_title": "✍️ Часть 2 — Spot & Fix (Исправь как носитель)",
      "section_description": "(Развивает активное воспроизведение)",
      "questions": [
        {
          "type": "text_input",
          "question_text": "Fix the sentence:",
          "wrong_example": "❌ неправильное предложение",
          "input_prompt": "✅ ______________________________",
          "tip": "💬 Tip: подсказка",
          "correct_answer": "правильное предложение",
          "explanation": "🧩 Answer: правильное предложение ✅"
        }
      ]
    },
    {
      "section_title": "💬 Часть 3 — Mini-dialogs (Диалоги в действии)",
      "section_description": "(Закрепляет грамматику в контексте общения — как в IELTS Speaking)",
      "questions": [
        {
          "type": "multiple_choice",
          "question_text": "— Вопрос?\\n— I ______ ответ.",
          "options": ["A) вариант", "B) вариант", "C) правильный ✅", "D) вариант"],
          "correct_answer": "C",
          "explanation": "💡 Rule: правило"
        }
      ]
    }
  ]
}`;

  // Подготавливаем информацию об ошибках
  let errorsInfo = 'Найденные ошибки пользователя:\n';
  mockErrors.forEach((error, index) => {
    errorsInfo += `${index + 1}. ${error.title}\n`;
    if (error.examples && error.examples.length > 0) {
      error.examples.forEach(example => {
        errorsInfo += `   ❌ ${example.from}\n   ✅ ${example.to}\n`;
      });
    }
    errorsInfo += `   Правило: ${error.rule}\n\n`;
  });

  try {
    console.log('Sending quiz generation request to GPT-5...');
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-5',
      messages: [
        { role: 'system', content: quizPrompt },
        { role: 'user', content: errorsInfo }
      ],
      temperature: 1,
      max_completion_tokens: 4000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('\n=== RAW RESPONSE ===');
    const content = response.data.choices[0].message.content.trim();
    console.log('Content length:', content.length);
    
    // Пробуем парсить JSON
    try {
      const parsed = JSON.parse(content);
      console.log('\n=== PARSED SUCCESS ===');
      console.log('Quiz sections:', parsed.quiz_sections?.length || 0);
      
      if (parsed.quiz_sections) {
        parsed.quiz_sections.forEach((section, i) => {
          console.log(`\nSection ${i + 1}: ${section.section_title}`);
          console.log(`Questions: ${section.questions?.length || 0}`);
          
          if (section.questions && section.questions.length > 0) {
            console.log(`First question type: ${section.questions[0].type}`);
            console.log(`First question: ${section.questions[0].question_text?.substring(0, 50)}...`);
          }
        });
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

testFullQuizSystem();