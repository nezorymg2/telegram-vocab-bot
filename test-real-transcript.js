const bbcService = require('./services/bbcService.js');

async function testRealTranscript() {
  console.log('=== ТЕСТИРУЕМ С РЕАЛЬНЫМ ТРАНСКРИПТОМ ===');

  const testEpisode = {
    title: 'How do babies communicate?',
    pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250619',
    transcript: `Hello and welcome to 6 Minute English. I'm Neil. And I'm Rob. 

Now Rob, you're a dad. How did you feel the first time you held your baby? It was amazing, Neil. You know that moment when you first make eye contact with your newborn baby - it's just incredible.

Yes, and babies are amazing little communicators from the very beginning, aren't they? Before they can even speak, they're finding ways to let us know what they need and how they feel.

That's right. Research shows that babies start communicating from birth. They use crying, facial expressions, and body language. Scientists have discovered that babies can recognise their mother's voice even before they're born.

Experts say that eye contact is particularly important for early communication. When babies look into their parents' eyes, it helps build a strong emotional bond. This is because babies are born with the ability to focus on faces, especially their mother's face.

For instance, studies have found that newborns prefer to look at face-like patterns rather than other shapes. This shows that they're naturally designed to connect with other people from day one.

The reason babies communicate so well is that they have evolved to survive by getting adult attention and care. Their communication skills develop rapidly in the first year of life.`,
    hasTranscript: true
  };

  try {
    const result = await bbcService.generateBBCQuestions(testEpisode);
    
    console.log('✅ РЕЗУЛЬТАТ:');
    console.log('Количество вопросов:', result.questions ? result.questions.length : 0);
    console.log('Enhanced:', result.enhanced);
    console.log('Есть транскрипт:', !!result.transcript);
    
    if (result.questions && result.questions.length > 0) {
      console.log('\n📝 СГЕНЕРИРОВАННЫЕ ВОПРОСЫ:');
      result.questions.forEach((q, i) => {
        console.log(`${i+1}. ${q.question}`);
        console.log(`   Тип: ${q.type}`);
        console.log(`   Ответ: ${q.correct_answer}`);
        console.log('');
      });
    } else {
      console.log('❌ Вопросы не сгенерированы');
    }
  } catch (err) {
    console.error('❌ ОШИБКА:', err.message);
    console.error(err.stack);
  }
}

testRealTranscript();
