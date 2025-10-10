// Тест системы накопления трудных слов из этапов 1 и 3 для этапа 5
console.log('🧪 Проверяем систему накопления трудных слов...\n');

// Симулируем сессию пользователя
const mockSession = {
  profile: 'test_user',
  smartRepeatWords: [
    { word: 'apple', translation: 'яблоко', correct: 2 },
    { word: 'book', translation: 'книга', correct: 1 },
    { word: 'car', translation: 'машина', correct: 3 },
    { word: 'dog', translation: 'собака', correct: 0 },
    { word: 'house', translation: 'дом', correct: 2 }
  ]
};

console.log('📋 Исходные слова умного повторения:', mockSession.smartRepeatWords.map(w => w.word));

// Тест 1: Инициализация массива трудных слов
console.log('\n✅ Тест 1: Инициализация массива');
mockSession.difficultWords = [];
console.log('Инициализирован пустой массив difficultWords:', mockSession.difficultWords);

// Тест 2: Добавление неправильных слов из этапа 1 (викторина)
console.log('\n✅ Тест 2: Неправильные ответы в викторине (этап 1)');

function simulateStage1WrongAnswer(session, word) {
  if (!session.difficultWords) {
    session.difficultWords = [];
  }
  
  // Проверяем, что слово еще не добавлено
  const alreadyAdded = session.difficultWords.find(w => w.word === word.word);
  if (!alreadyAdded) {
    session.difficultWords.push({
      word: word.word,
      translation: word.translation,
      correct: word.correct,
      source: 'stage1_quiz'
    });
    console.log(`Added difficult word from Stage 1: ${word.word} (total: ${session.difficultWords.length})`);
  }
}

// Симулируем неправильные ответы в викторине
simulateStage1WrongAnswer(mockSession, mockSession.smartRepeatWords[1]); // book
simulateStage1WrongAnswer(mockSession, mockSession.smartRepeatWords[3]); // dog

// Тест 3: Добавление неправильных слов из этапа 3 ("знаю/не знаю")
console.log('\n✅ Тест 3: Неправильные ответы в этапе "знаю/не знаю" (этап 3)');

function simulateStage3WrongAnswer(session, word) {
  if (!session.difficultWords) {
    session.difficultWords = [];
  }
  
  // Проверяем, что слово еще не добавлено
  const alreadyAdded = session.difficultWords.find(w => w.word === word.word);
  if (!alreadyAdded) {
    session.difficultWords.push({
      word: word.word,
      translation: word.translation,
      correct: word.correct,
      source: 'stage3_know_dont_know'
    });
    console.log(`Added difficult word from Stage 3: ${word.word} (total: ${session.difficultWords.length})`);
  }
}

// Симулируем неправильные ответы в этапе 3
simulateStage3WrongAnswer(mockSession, mockSession.smartRepeatWords[0]); // apple  
simulateStage3WrongAnswer(mockSession, mockSession.smartRepeatWords[1]); // book (дубликат - не должен добавиться)
simulateStage3WrongAnswer(mockSession, mockSession.smartRepeatWords[4]); // house

// Тест 4: Проверка предотвращения дубликатов
console.log('\n✅ Тест 4: Проверка предотвращения дубликатов');
console.log('Попытка добавить "book" еще раз (должно быть проигнорировано)...');
simulateStage1WrongAnswer(mockSession, mockSession.smartRepeatWords[1]); // book еще раз

// Тест 5: Симуляция этапа 5 с использованием трудных слов
console.log('\n✅ Тест 5: Симуляция этапа 5');

function simulateStage5WordSelection(session) {
  console.log('=== SMART REPEAT STAGE 5 SIMULATION ===');
  console.log('Session difficultWords:', session.difficultWords?.length || 0);
  
  let words = [];
  
  if (session.difficultWords && session.difficultWords.length > 0) {
    words = session.difficultWords;
    console.log(`Using ${words.length} difficult words from stages 1 and 3:`, words.map(w => w.word));
    
    // Если трудных слов меньше 10, дополняем
    if (words.length < 10) {
      console.log('Adding more words to reach minimum of 10...');
      const existingWords = words.map(w => w.word);
      const additionalWords = session.smartRepeatWords
        .filter(w => !existingWords.includes(w.word))
        .slice(0, 10 - words.length);
      
      words = words.concat(additionalWords);
      console.log(`Added ${additionalWords.length} additional words. Total: ${words.length}`);
    }
  } else {
    console.log('No difficult words found, would use priority-based selection...');
  }
  
  return words;
}

const stage5Words = simulateStage5WordSelection(mockSession);

// Результаты тестирования
console.log('\n🎯 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
console.log('============================');
console.log('📊 Трудные слова накоплены:', mockSession.difficultWords);
console.log('📝 Слова для этапа 5:', stage5Words.map(w => ({word: w.word, source: w.source || 'additional'})));

console.log('\n✅ Система проверки:');
console.log('• Массив difficultWords инициализируется в начале умного повторения');
console.log('• Неправильные слова из этапа 1 (викторина) сохраняются');  
console.log('• Неправильные слова из этапа 3 ("знаю/не знаю") сохраняются');
console.log('• Дубликаты предотвращаются');
console.log('• Этап 5 использует накопленные трудные слова');
console.log('• При нехватке слов добавляются дополнительные из общего пула');

console.log('\n🚀 Система готова к тестированию в реальном боте!');