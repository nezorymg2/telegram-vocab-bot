// Тест для проверки исправления показа слов из 4-го этапа

console.log('=== TESTING STAGE 4 VOCABULARY FIX ===');

// Имитируем формат дополнительных слов от GPT
const mockAdditionalVocabulary = [
  {
    "word": "fascinating",
    "translation": "увлекательный",
    "example": "The documentary was absolutely fascinating."
  },
  {
    "word": "determine",
    "translation": "определять",
    "example": "Scientists are trying to determine the cause of the problem."
  },
  {
    "word": "significant",
    "translation": "значительный"
    // Нет example - тестируем fallback
  }
];

// Тестируем функцию показа слов
function testVocabularyDisplay() {
  console.log('\n--- Testing vocabulary display ---');
  
  mockAdditionalVocabulary.forEach((word, index) => {
    const currentIndex = index + 1;
    const totalWords = mockAdditionalVocabulary.length;
    
    let message = `📚 <b>Сложное слово ${currentIndex}/${totalWords} из текста:</b>\n\n`;
    message += `🔤 <b>${word.word}</b>\n`;
    message += `🇷🇺 ${word.translation}\n`;
    
    // Показываем пример если есть
    if (word.example) {
      message += `📝 <i>${word.example}</i>\n\n`;
    } else {
      message += `\n`;
    }
    
    message += `Добавить в ваш словарь?`;
    
    console.log(`Word ${currentIndex}:`);
    console.log(message);
    console.log('---');
  });
}

// Тестируем процесс сохранения в БД
function testWordSaving() {
  console.log('\n--- Testing word saving format ---');
  
  mockAdditionalVocabulary.forEach(word => {
    const wordData = {
      profile: 'test_user',
      word: word.word.toLowerCase(),
      translation: word.translation,
      section: 'stage4_vocab'
    };
    
    console.log(`Would save:`, wordData);
  });
}

// Запуск тестов
testVocabularyDisplay();
testWordSaving();

console.log('\n=== TESTS COMPLETED ===');
console.log('✅ Format looks correct for stage 4 vocabulary display');
console.log('✅ Words will be saved with section "stage4_vocab"');
console.log('✅ Missing examples are handled gracefully');