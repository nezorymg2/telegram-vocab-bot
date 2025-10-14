require('dotenv').config();

console.log('=== TESTING ANALYSIS STRUCTURE ===\n');

// Имитируем результат GPT анализа
const mockGptResponse = {
  "band_estimate": "6.5",
  "summary": "Текст понятный и логичный, но есть повторяющиеся ошибки...",
  "global_advice": "Отработай Past Simple для правильных глаголов...",
  "errors": [
    {
      "title": "Неправильное время для прошедших действий (Past Simple)",
      "rule": "Завершённые действия в прошлом выражаются Past Simple.",
      "meme": "Вчера? Тогда -ed!",
      "examples": [
        {
          "from": "it stop working",
          "to": "it stopped working",
          "why": "Действие завершилось в прошлом — нужен Past Simple с -ed."
        }
      ]
    },
    {
      "title": "Comma splice",
      "rule": "Два самостоятельных предложения нельзя соединять только запятой",
      "meme": "Запятая одна — слабая. Дай ей друга: and/so или точку.",
      "examples": [
        {
          "from": "I had a problem, it stop working",
          "to": "I had a problem, and it stopped working"
        }
      ]
    }
  ]
};

console.log('📋 Mock GPT Response:');
console.log('  - band_estimate:', mockGptResponse.band_estimate);
console.log('  - summary length:', mockGptResponse.summary.length);
console.log('  - errors count:', mockGptResponse.errors.length);
console.log('  - errors type:', typeof mockGptResponse.errors);
console.log('  - is array:', Array.isArray(mockGptResponse.errors));

// Тестируем что происходит при передаче в квиз
console.log('\n🧠 Testing quiz generation:');

function testQuizGeneration(analysisData) {
  console.log('\n1. Full analysis object passed:');
  console.log('   - Type:', typeof analysisData);
  console.log('   - Has errors:', !!analysisData.errors);
  console.log('   - Errors type:', typeof analysisData.errors);
  console.log('   - Is array:', Array.isArray(analysisData.errors));

  console.log('\n2. Errors array passed:');
  const errorsArray = analysisData.errors;
  console.log('   - Type:', typeof errorsArray);
  console.log('   - Is array:', Array.isArray(errorsArray));
  console.log('   - Length:', errorsArray?.length);
  
  if (Array.isArray(errorsArray) && errorsArray.length > 0) {
    console.log('   - First error structure:');
    console.log('     * title:', errorsArray[0].title);
    console.log('     * rule:', errorsArray[0].rule);
    console.log('     * examples count:', errorsArray[0].examples?.length);
    
    console.log('\n✅ CORRECT: Pass analysisData.errors to quiz');
  } else {
    console.log('\n❌ ERROR: Cannot generate quiz');
  }
}

// Тест 1: Правильная структура
console.log('\n🔍 Test 1: Valid GPT response');
testQuizGeneration(mockGptResponse);

// Тест 2: Fallback структура 
const fallbackAnalysis = {
  band_estimate: "6.0",
  summary: "Fallback analysis",
  global_advice: "Keep practicing",
  errors: [
    {
      title: "Общие рекомендации по улучшению письма",
      rule: "Обратите внимание на грамматику",
      meme: "Постоянная практика письма поможет улучшить навыки",
      examples: [
        {
          from: "Пример простого предложения",
          to: "Пример улучшенного предложения"
        }
      ]
    }
  ]
};

console.log('\n🔍 Test 2: Fallback analysis');
testQuizGeneration(fallbackAnalysis);

console.log('\n=== ВЫВОД ===');
console.log('✅ Всегда передавать в квиз: session.stage2_analysis.errors');
console.log('✅ Проверить что это массив перед обработкой');
console.log('✅ Добавить отладку для выявления проблем');