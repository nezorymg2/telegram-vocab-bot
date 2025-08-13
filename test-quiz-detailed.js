// Тестируем парсинг worksheet PDF для получения вопросов квиза
const { parseBBCPDFQuiz } = require('./services/bbcQuestions-simple');

(async () => {
  try {
    // URL worksheet для эпизода "What is the manosphere?"
    const worksheetUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250731_6_minute_english_what_is_the_manosphere_worksheet.pdf';
    
    console.log('=== ТЕСТИРУЕМ ПАРСИНГ WORKSHEET PDF ===');
    console.log('URL:', worksheetUrl);
    console.log('');
    
    const result = await parseBBCPDFQuiz(worksheetUrl);
    
    console.log('\\n📊 РЕЗУЛЬТАТЫ ПАРСИНГА:');
    console.log('Успешно:', result.success ? '✅' : '❌');
    console.log('Количество вопросов:', result.questions.length);
    console.log('Количество ответов:', result.answers.length);
    
    if (result.questions.length > 0) {
      console.log('\\n📝 ИЗВЛЕЧЕННЫЕ ВОПРОСЫ:');
      console.log('═'.repeat(60));
      
      result.questions.forEach((q, index) => {
        console.log(`\\n${index + 1}. ВОПРОС ${q.number}:`);
        console.log(`❓ ${q.question}`);
        
        if (q.options && q.options.length > 0) {
          console.log('\\nВАРИАНТЫ ОТВЕТОВ:');
          q.options.forEach(option => {
            console.log(`   ${option.letter}) ${option.text}`);
          });
        }
        
        // Найти правильный ответ
        const correctAnswer = result.answers.find(a => a.question === q.number);
        if (correctAnswer) {
          console.log(`\\n✅ ПРАВИЛЬНЫЙ ОТВЕТ: ${correctAnswer.answer.toUpperCase()}`);
          const correctOption = q.options.find(opt => opt.letter === correctAnswer.answer);
          if (correctOption) {
            console.log(`   "${correctOption.text}"`);
          }
        }
        
        console.log('─'.repeat(40));
      });
    }
    
    if (result.answers.length > 0) {
      console.log('\\n🔑 НАЙДЕННЫЕ ОТВЕТЫ:');
      result.answers.forEach(answer => {
        console.log(`Вопрос ${answer.question}: ${answer.answer.toUpperCase()}`);
      });
    }
    
  } catch (e) {
    console.error('❌ Ошибка:', e.message);
    console.error(e.stack);
  }
})();
