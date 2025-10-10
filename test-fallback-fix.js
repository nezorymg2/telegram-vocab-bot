// Тест исправления fallback анализа
// Проверяем что функция showWritingAnalysisResult вызывается правильно

const fs = require('fs');

console.log('🧪 Тестируем исправление fallback анализа...\n');

// Читаем содержимое bot.js
const botContent = fs.readFileSync('./bot.js', 'utf8');

// Проверяем что showAnalysisResults больше не используется
const showAnalysisResultsUsage = botContent.match(/showAnalysisResults\(/g);
if (showAnalysisResultsUsage) {
  console.log('❌ ОШИБКА: Найдены вызовы showAnalysisResults:', showAnalysisResultsUsage.length);
  process.exit(1);
} else {
  console.log('✅ showAnalysisResults больше не используется');
}

// Проверяем что showWritingAnalysisResult используется в fallback
const fallbackSection = botContent.match(/ERROR: OpenAI returned empty[\s\S]*?return;/);
if (!fallbackSection) {
  console.log('❌ ОШИБКА: Не найден fallback раздел');
  process.exit(1);
}

const fallbackText = fallbackSection[0];
const hasCorrectFunction = fallbackText.includes('showWritingAnalysisResult');
const hasSessionSetup = fallbackText.includes('session.writingAnalysis = fallbackAnalysis');
const hasStepUpdate = fallbackText.includes("session.step = 'writing_analysis_result'");
const hasGenerateImproved = fallbackText.includes('generateImprovedVersion');

console.log('\n📋 Проверка fallback анализа:');
console.log('✅ Правильная функция showWritingAnalysisResult:', hasCorrectFunction ? '✅' : '❌');
console.log('✅ Установка session.writingAnalysis:', hasSessionSetup ? '✅' : '❌');
console.log('✅ Обновление step:', hasStepUpdate ? '✅' : '❌');
console.log('✅ Вызов generateImprovedVersion:', hasGenerateImproved ? '✅' : '❌');

// Проверяем что функция showWritingAnalysisResult определена
const functionDefinition = botContent.match(/async function showWritingAnalysisResult\(/);
if (!functionDefinition) {
  console.log('❌ ОШИБКА: Функция showWritingAnalysisResult не определена');
  process.exit(1);
} else {
  console.log('✅ Функция showWritingAnalysisResult определена');
}

// Проверяем структуру fallback анализа
const fallbackAnalysisMatch = botContent.match(/const fallbackAnalysis = \{[\s\S]*?\};/);
if (!fallbackAnalysisMatch) {
  console.log('❌ ОШИБКА: Структура fallbackAnalysis не найдена');
  process.exit(1);
}

const fallbackStructure = fallbackAnalysisMatch[0];
const hasRequiredFields = [
  'band_estimate',
  'summary', 
  'global_advice',
  'errors',
  'drills'
].every(field => fallbackStructure.includes(field));

console.log('✅ Все обязательные поля в fallback:', hasRequiredFields ? '✅' : '❌');

// Финальная проверка
if (hasCorrectFunction && hasSessionSetup && hasStepUpdate && hasGenerateImproved && hasRequiredFields) {
  console.log('\n🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ!');
  console.log('✅ Fallback анализ исправлен и готов к работе');
  console.log('✅ Функция showWritingAnalysisResult будет вызвана корректно');
  console.log('✅ Генерация улучшенной версии также будет работать');
} else {
  console.log('\n❌ ЕСТЬ ПРОБЛЕМЫ - проверьте код');
  process.exit(1);
}