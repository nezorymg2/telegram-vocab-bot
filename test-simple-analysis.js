const axios = require('axios');
require('dotenv').config();

async function testSimpleAnalysis() {
  console.log('Testing simplified analysis with GPT-5...');
  
  const systemPrompt = `Ты эксперт по английскому языку. Проанализируй текст студента и найди грамматические ошибки.

Верни только JSON в таком формате:
{
  "band_estimate": "6.5",
  "summary": "Краткий отзыв о тексте",
  "global_advice": "Главные советы",
  "errors": [
    {
      "title": "Название ошибки",
      "rule": "Правило",
      "meme": "Подсказка для запоминания",
      "examples": [
        {
          "from": "ошибочный фрагмент",
          "to": "исправленный вариант",
          "why": "объяснение"
        }
      ],
      "drills": [
        {
          "rule": "правило",
          "question": "предложение с ▢",
          "words_count": 1,
          "correct_answer": "ответ",
          "accepted": ["ответ"],
          "hint": "подсказка"
        }
      ]
    }
  ]
}`;

  const testText = `I go to school every days. My teacher is very good and help me learn English. Yesterday I saw him at store.`;

  try {
    console.log('Sending request to GPT-5...');
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `LANG=ru\nTEXT=\n${testText}` }
      ],
      temperature: 1,
      max_completion_tokens: 3000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('\n=== RAW RESPONSE ===');
    console.log('Status:', response.status);
    console.log('Content:', response.data.choices[0].message.content);
    
    // Пробуем парсить JSON
    const content = response.data.choices[0].message.content.trim();
    try {
      const parsed = JSON.parse(content);
      console.log('\n=== PARSED SUCCESS ===');
      console.log('Band:', parsed.band_estimate);
      console.log('Summary:', parsed.summary);
      console.log('Errors count:', parsed.errors?.length || 0);
    } catch (parseError) {
      console.log('\n=== JSON PARSE ERROR ===');
      console.log('Parse error:', parseError.message);
      console.log('Content length:', content.length);
    }

  } catch (error) {
    console.error('=== API ERROR ===');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data || error.message);
  }
}

testSimpleAnalysis();