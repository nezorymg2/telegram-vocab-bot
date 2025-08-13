// Простой тест модуля
try {
  console.log('Загружаем модуль...');
  const mod = require('./services/bbcQuestions');
  
  console.log('Модуль загружен');
  console.log('Тип модуля:', typeof mod);
  console.log('Ключи:', Object.keys(mod));
  
  if (mod.getCleanTranscript) {
    console.log('✅ getCleanTranscript найдена');
  } else {
    console.log('❌ getCleanTranscript не найдена');
  }
  
  if (mod.parseBBCPDFQuiz) {
    console.log('✅ parseBBCPDFQuiz найдена');
  } else {
    console.log('❌ parseBBCPDFQuiz не найдена');
  }
  
} catch (e) {
  console.error('❌ Ошибка:', e.message);
  console.error('Stack:', e.stack);
}
