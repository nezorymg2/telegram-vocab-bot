require('dotenv').config();
const fs = require('fs');

console.log('=== DEBUGGING CALLBACK HANDLER ===\n');

// Читаем bot.js и ищем обработчики callback
const botContent = fs.readFileSync('bot.js', 'utf8');

// 1. Проверяем есть ли обработчик callback_query
const callbackHandlers = botContent.match(/bot\.on\(['"`]callback_query[^'"`]*['"`]/g) || [];
console.log('📋 Найденные callback handlers:');
callbackHandlers.forEach((handler, i) => {
  console.log(`  ${i + 1}. ${handler}`);
});

if (callbackHandlers.length === 0) {
  console.log('❌ НЕТ ОБРАБОТЧИКОВ CALLBACK QUERY!');
} else {
  console.log(`✅ Найдено ${callbackHandlers.length} обработчик(ов)`);
}

// 2. Проверяем где обрабатываются add_vocab_ и skip_vocab_
const vocabCallbacks = botContent.match(/add_vocab_|skip_vocab_/g) || [];
console.log(`\n📚 Упоминания vocab callbacks: ${vocabCallbacks.length}`);

// 3. Проверяем есть ли функция addWordToUserDictionary
const addWordFunction = /async function addWordToUserDictionary/.test(botContent);
console.log(`📖 Функция addWordToUserDictionary: ${addWordFunction ? '✅' : '❌'}`);

// 4. Проверяем структуру fallback анализа
const fallbackMatch = botContent.match(/const fallbackAnalysis = \{[\s\S]*?\};/);
if (fallbackMatch) {
  console.log('\n🔍 Fallback анализ найден, проверяем структуру errors...');
  const fallbackText = fallbackMatch[0];
  
  // Проверяем что в fallback есть поле errors как массив
  const hasErrorsArray = /errors:\s*\[/.test(fallbackText);
  console.log(`📋 Поле errors как массив: ${hasErrorsArray ? '✅' : '❌'}`);
  
  // Проверяем структуру errors
  if (hasErrorsArray) {
    const errorStructureMatch = fallbackText.match(/{\s*title:/);
    console.log(`📝 Структура error с title: ${errorStructureMatch ? '✅' : '❌'}`);
  }
} else {
  console.log('\n❌ Fallback анализ не найден!');
}

console.log('\n=== РЕКОМЕНДАЦИИ ===');
console.log('1. Убедитесь что callback handler зарегистрирован');
console.log('2. Проверьте что fallback анализ имеет правильную структуру errors');
console.log('3. Добавьте логирование в реальный бот для отладки');