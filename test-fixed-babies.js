const bbcService = require('./services/bbcService.js');

async function testBabiesEpisode() {
  console.log('=== ТЕСТИРУЕМ ИСПРАВЛЕННУЮ СИСТЕМУ ===');

  const testEpisode = {
    title: 'How do babies communicate?',
    pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250619',
    transcript: 'This is a test transcript about baby communication. How do babies learn to communicate? What sounds do they make? When do they start talking? Where do they learn language? Why is early communication important? Which methods help babies communicate?',
    hasTranscript: true
  };

  try {
    const result = await bbcService.generateBBCQuestions(testEpisode);
    
    console.log('✅ РЕЗУЛЬТАТ:');
    console.log('Количество вопросов:', result.questions ? result.questions.length : 0);
    console.log('Enhanced:', result.enhanced);
    console.log('Есть транскрипт:', !!result.transcript);
    
    if (result.questions && result.questions.length > 0) {
      console.log('\n📝 ВОПРОСЫ:');
      result.questions.forEach((q, i) => {
        console.log(`${i+1}. ${q.question}`);
        console.log(`   Тип: ${q.type}`);
      });
    } else {
      console.log('❌ Вопросы не найдены');
    }
  } catch (err) {
    console.error('❌ ОШИБКА:', err.message);
    console.error(err.stack);
  }
}

testBabiesEpisode();
