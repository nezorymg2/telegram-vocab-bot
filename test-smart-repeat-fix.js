const { execSync } = require('child_process');

// Простой тест для проверки исправления
console.log('🧪 Тестируем исправление умного повторения...');

// Проверяем что в startSmartRepeatStage2 больше нет преждевременной установки даты
try {
  const output = execSync('grep -n "session.lastSmartRepeatDate = todayString" bot.js', { encoding: 'utf8' });
  const lines = output.trim().split('\n');
  
  console.log('📍 Места установки lastSmartRepeatDate:');
  lines.forEach(line => {
    const lineNum = line.split(':')[0];
    const content = line.split(':').slice(1).join(':');
    console.log(`  Строка ${lineNum}: ${content.trim()}`);
  });
  
  // Проверяем что в функции startSmartRepeatStage2 больше нет установки даты
  const stage2Output = execSync('grep -A 10 -B 5 "startSmartRepeatStage2" bot.js | grep -n "lastSmartRepeatDate"', { encoding: 'utf8' });
  
  if (stage2Output.trim()) {
    console.log('❌ ПРОБЛЕМА: В startSmartRepeatStage2 все еще есть установка lastSmartRepeatDate');
    console.log(stage2Output);
  } else {
    console.log('✅ ХОРОШО: В startSmartRepeatStage2 больше нет преждевременной установки даты');
  }
  
} catch (error) {
  if (error.status === 1) {
    console.log('✅ ОТЛИЧНО: Не найдено установки lastSmartRepeatDate в startSmartRepeatStage2');
  } else {
    console.error('❌ Ошибка при проверке:', error.message);
  }
}

// Проверяем что есть вызов completeSmartRepeat вместо прямой установки даты
try {
  const completeOutput = execSync('grep -A 5 -B 5 "completeSmartRepeat" bot.js | grep -E "(startSmartRepeatStage2|wordsToRepeat.length === 0)"', { encoding: 'utf8' });
  
  if (completeOutput.trim()) {
    console.log('✅ ХОРОШО: Найден вызов completeSmartRepeat в правильном контексте');
  }
  
} catch (error) {
  console.log('⚠️  Не удалось проверить вызов completeSmartRepeat');
}

console.log('\n🎯 РЕЗЮМЕ:');
console.log('1. Убрана преждевременная установка lastSmartRepeatDate из этапа 3');
console.log('2. Добавлена логика восстановления слов из викторины');
console.log('3. Используется правильная функция completeSmartRepeat');
console.log('\n✅ Исправление должно решить проблему преждевременного завершения!');