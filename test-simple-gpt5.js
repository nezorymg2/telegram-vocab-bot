const axios = require('axios');
require('dotenv').config();

async function testSimpleGPT5() {
  console.log('Testing simple GPT-5 request...');
  
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-5',
      messages: [
        { role: 'user', content: 'Say hello' }
      ],
      temperature: 1,
      max_completion_tokens: 1000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Response:', response.data.choices[0].message.content);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testSimpleGPT5();