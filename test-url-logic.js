// Тестируем разные эпизоды чтобы найти правильную логику
const axios = require('axios');

const testEpisodes = [
  {
    title: "How do you say sorry?",  // 19 символов, нет ?, 4 слова
    number: "250703",
    expected: "single" // По тесту выше - работает одинарное
  },
  {
    title: "Do you need to declutter your home?", // 36 символов, есть ?, 7 слов
    number: "250710", 
    expected: "double" // По предыдущим тестам - работает двойное
  },
  {
    title: "Wild bees", // 9 символов, нет ?, 2 слова
    number: "250626",
    expected: "single" // По предыдущим тестам - работает одинарное
  }
];

async function testLogicPatterns() {
  console.log('🔍 Тестируем логику определения разделителей...\n');
  
  for (const episode of testEpisodes) {
    console.log(`📝 Эпизод: "${episode.title}"`);
    console.log(`   Длина: ${episode.title.length}`);
    console.log(`   Есть "?": ${episode.title.includes('?')}`);
    console.log(`   Количество слов: ${episode.title.split(' ').length}`);
    console.log(`   Ожидаемый тип: ${episode.expected}`);
    
    // Текущая логика
    let currentLogic = '_';
    if (episode.title.length > 25 || 
        episode.title.includes('?') || 
        episode.title.split(' ').length > 5) {
      currentLogic = '__';
    }
    console.log(`   Текущая логика дает: ${currentLogic === '_' ? 'single' : 'double'}`);
    
    // Проверим реальные URL
    const titleSlug = episode.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
    
    const singleUrl = `https://downloads.bbc.co.uk/learningenglish/features/6min/${episode.number}_6_minute_english_${titleSlug}_worksheet.pdf`;
    const doubleUrl = `https://downloads.bbc.co.uk/learningenglish/features/6min/${episode.number}_6_minute_english_${titleSlug}__worksheet.pdf`;
    
    try {
      const singleResponse = await axios.head(singleUrl);
      console.log(`   ✅ Single underscore works: ${singleResponse.status}`);
    } catch (e) {
      console.log(`   ❌ Single underscore failed: 404`);
    }
    
    try {
      const doubleResponse = await axios.head(doubleUrl);
      console.log(`   ✅ Double underscore works: ${doubleResponse.status}`);
    } catch (e) {
      console.log(`   ❌ Double underscore failed: 404`);
    }
    
    console.log('');
  }
}

testLogicPatterns();
