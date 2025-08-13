// Тестируем отправку транскрипта в формате бота
const { getCleanTranscript } = require('./services/bbcQuestions-simple');
const { formatTranscript } = require('./services/bbcService');

(async () => {
  try {
    const url = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250731';
    console.log('=== ТЕСТИРУЕМ ОТПРАВКУ В ФОРМАТЕ БОТА ===\n');
    
    // Получаем данные
    const result = await getCleanTranscript(url);
    
    if (!result.transcript) {
      console.log('❌ Транскрипт не получен');
      return;
    }
    
    // Форматируем для отправки
    const transcriptChunks = formatTranscript(result.transcript);
    
    console.log(`📜 ТРАНСКРИПТ ЭПИЗОДА (${transcriptChunks.length} частей):\n`);
    
    // Показываем как будет отправлено
    for (let i = 0; i < transcriptChunks.length; i++) {
      const chunk = transcriptChunks[i];
      const header = transcriptChunks.length > 1 ? `**Часть ${i + 1}/${transcriptChunks.length}:**\n\n` : '';
      
      console.log('🤖 СООБЩЕНИЕ ОТ БОТА:');
      console.log('─'.repeat(50));
      console.log(header + chunk);
      console.log('─'.repeat(50));
      console.log(`Длина: ${chunk.length} символов`);
      if (i < transcriptChunks.length - 1) {
        console.log('\n⏱️ Пауза 500мс...\n');
      }
      console.log();
    }
    
    // Словарь
    if (result.vocabulary && result.vocabulary.length > 0) {
      console.log('🤖 СООБЩЕНИЕ СЛОВАРЯ:');
      console.log('─'.repeat(50));
      let vocabMessage = '📚 **Ключевые слова:**\n\n';
      
      result.vocabulary.forEach(item => {
        vocabMessage += `🔤 **${item.term}**`;
        if (item.definition) {
          vocabMessage += `\n_${item.definition}_`;
        }
        vocabMessage += '\n\n';
      });
      
      console.log(vocabMessage);
      console.log('─'.repeat(50));
      console.log(`Длина словаря: ${vocabMessage.length} символов`);
    }
    
  } catch (e) {
    console.error('❌ Ошибка:', e.message);
  }
})();
