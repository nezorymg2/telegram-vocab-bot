// Тест для исправления ошибки showAnalysisResults
console.log('🧪 Тестируем исправление ошибки showAnalysisResults...\n');

try {
  // Проверяем что в коде нет вызовов showAnalysisResults
  const fs = require('fs');
  const botContent = fs.readFileSync('bot.js', 'utf8');
  
  const showAnalysisResultsCalls = (botContent.match(/showAnalysisResults/g) || []).length;
  const showWritingAnalysisResultCalls = (botContent.match(/showWritingAnalysisResult/g) || []).length;
  
  console.log('✅ Анализ вызовов функций:');
  console.log(`• showAnalysisResults (старая, ошибочная): ${showAnalysisResultsCalls} вызовов`);
  console.log(`• showWritingAnalysisResult (правильная): ${showWritingAnalysisResultCalls} вызовов`);
  
  if (showAnalysisResultsCalls === 0) {
    console.log('✓ Ошибочные вызовы showAnalysisResults успешно исправлены!');
  } else {
    console.log('❌ Найдены ошибочные вызовы showAnalysisResults');
  }
  
  // Проверяем что fallback анализ правильно использует showWritingAnalysisResult
  const fallbackPattern = /fallbackAnalysis[\s\S]*?showWritingAnalysisResult/;
  if (fallbackPattern.test(botContent)) {
    console.log('✓ Fallback анализ использует правильную функцию showWritingAnalysisResult');
  } else {
    console.log('❌ Fallback анализ не использует showWritingAnalysisResult');
  }
  
  console.log('\n🎯 Проверка завершена!');
  
} catch (error) {
  console.error('❌ Ошибка при тестировании:', error.message);
}