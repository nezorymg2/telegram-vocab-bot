const axios = require('axios');
require('dotenv').config();

async function testCompleteStage2Flow() {
  console.log('=== TESTING COMPLETE STAGE 2 FLOW ===\n');

  // B1 уровень текст с типичными ошибками
  const testText = `I think working at night is better for me. I go to bed late and wake up late. My friends says this is bad but I don't think so. I can work good at night because nobody disturb me. Also the house is quiet and I can focus more better. In the morning I am tired and cannot concentrate proper. So I prefer night time for working. Maybe in future I will become morning person.`;

  console.log('📝 Test text (B1 level with errors):');
  console.log(testText);
  console.log('\n' + '='.repeat(60) + '\n');

  // ЭТАП 1: Анализ ошибок
  console.log('🔍 STAGE 1: Analyzing errors with GPT-5...');
  
  const analysisPrompt = `Find grammar errors in this English text. Return only JSON:

{
  "errors": [
    {
      "title": "Error type",
      "rule": "Grammar rule", 
      "examples": [
        {
          "from": "wrong text",
          "to": "correct text"
        }
      ]
    }
  ]
}`;

  try {
    const analysisResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-5',
      messages: [
        { role: 'system', content: analysisPrompt },
        { role: 'user', content: testText }
      ],
      temperature: 1,
      max_completion_tokens: 5000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Full API response:', JSON.stringify(analysisResponse.data, null, 2));
    const analysisContent = analysisResponse.data.choices[0].message.content.trim();
    console.log('Raw analysis response:', analysisContent);
    console.log('Response length:', analysisContent.length);
    
    if (!analysisContent || analysisContent.length === 0) {
      throw new Error('Empty response from GPT-5 analysis');
    }
    
    const analysis = JSON.parse(analysisContent);
    
    console.log('✅ Analysis completed!');
    console.log(`Errors found: ${analysis.errors?.length || 0}`);
    console.log('\n' + '='.repeat(60) + '\n');

    // ЭТАП 2: Генерация персонального теста
    console.log('🧠 STAGE 2: Generating personalized quiz...');
    
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

    // Подготавливаем информацию об ошибках для GPT
    let errorsInfo = 'Найденные ошибки пользователя:\n';
    analysis.errors.forEach((error, index) => {
      errorsInfo += `${index + 1}. ${error.title}\n`;
      if (error.examples && error.examples.length > 0) {
        error.examples.forEach(example => {
          errorsInfo += `   ❌ ${example.from}\n   ✅ ${example.to}\n`;
        });
      }
      errorsInfo += `   Правило: ${error.rule}\n\n`;
    });

    const quizResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
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

    const quizContent = quizResponse.data.choices[0].message.content.trim();
    console.log('Raw quiz response length:', quizContent.length);
    
    if (quizContent.length === 0) {
      throw new Error('Empty response from GPT-5');
    }

    const quiz = JSON.parse(quizContent);
    
    console.log('✅ Quiz generated successfully!');
    console.log(`Sections: ${quiz.quiz_sections?.length || 0}`);
    console.log('\n' + '='.repeat(60) + '\n');

    // ЭТАП 3: Показ структуры теста
    console.log('============================================================\n');
    console.log('🎯 STAGE 2 (Part 3): Quiz structure preview:\n');
    
    if (quiz.quiz_sections) {
      let totalQuestions = 0;
      quiz.quiz_sections.forEach((section, i) => {
        console.log(`\n${section.section_title}`);
        console.log(section.section_description);
        
        if (section.questions) {
          totalQuestions += section.questions.length;
          section.questions.forEach((q, j) => {
            console.log(`\n  Question ${j + 1}:`);
            console.log(`  ${q.question_text}`);
            
            if (q.type === 'multiple_choice' && q.options) {
              q.options.forEach(option => {
                console.log(`    ${option}`);
              });
            } else if (q.type === 'text_input') {
              console.log(`  ${q.wrong_example}`);
              console.log(`  ${q.input_prompt}`);
              console.log(`  ${q.tip}`);
            }
            
            console.log(`  ${q.explanation}`);
          });
        }
      });
      
      console.log(`\n📊 Total questions: ${totalQuestions}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 SUCCESS: Complete Stage 2 flow tested successfully!');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.response) {
      console.error('API Status:', error.response.status);
      console.error('API Error:', error.response.data);
    }
  }
}

testCompleteStage2Flow();