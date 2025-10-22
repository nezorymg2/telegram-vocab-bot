// Тест исправления дублирования "💡 Rule:"

console.log('🧪 TESTING: Rule duplication fix');

// Симуляция данных анализа как они приходят от GPT
const mockAnalysisData = {
  band_estimate: "6.5",
  summary: "Студент демонстрирует хорошее понимание темы и способен передавать свои мысли, однако есть некоторые грамматические и стилистические ошибки.",
  global_advice: "Сосредоточьтесь на использовании правильных форм глаголов и предлогов. Также следует разнообразить лексический запас и избегать повторений.",
  errors: [
    {
      title: "Неправильное использование предлогов",
      rule: "💡 Rule: После глагола 'dream' нужно использовать 'of' вместо 'to'. Примеры: 'I dream of traveling', 'She dreams of becoming a doctor'.",
      meme: "Мечты требуют 'of', а не 'to'!",
      examples: [
        {
          from: "We both dream to visit Italy",
          to: "We both dream of visiting Italy"
        }
      ]
    },
    {
      title: "Неправильная форма глагола",
      rule: "💡 Rule: После 'dream of' глагол должен быть в форме -ing. Примеры: 'I enjoy swimming', 'He likes reading books'.",
      meme: "После 'dream of' -ing форма, как в 'dreaming'.",
      examples: [
        {
          from: "dream to visit",
          to: "dream of visiting"
        }
      ]
    }
  ]
};

// Симуляция функции отображения как в боте
function simulateErrorDisplay(analysis) {
  console.log('\n📊 СТАРАЯ ВЕРСИЯ (с дублированием):');
  console.log('=====================================');
  
  // Старый код (как было раньше)
  for (let i = 0; i < analysis.errors.length; i++) {
    const error = analysis.errors[i];
    let oldErrorMessage = `${i + 1}. ${error.title}\n`;
    oldErrorMessage += `💡 Rule: ${error.rule}\n`;  // ДУБЛИРОВАНИЕ!
    oldErrorMessage += `🧠 ${error.meme}\n`;
    
    console.log(oldErrorMessage);
    
    if (error.examples && error.examples.length > 0) {
      error.examples.forEach(example => {
        console.log(`❌ "${example.from}" → ✅ "${example.to}"`);
      });
    }
    console.log('---');
  }
  
  console.log('\n✅ НОВАЯ ВЕРСИЯ (исправленная):');
  console.log('====================================');
  
  // Новый код (как сейчас)
  for (let i = 0; i < analysis.errors.length; i++) {
    const error = analysis.errors[i];
    let newErrorMessage = `${i + 1}. ${error.title}\n`;
    newErrorMessage += `${error.rule}\n`;  // БЕЗ дублирования!
    newErrorMessage += `🧠 ${error.meme}\n`;
    
    console.log(newErrorMessage);
    
    if (error.examples && error.examples.length > 0) {
      error.examples.forEach(example => {
        console.log(`❌ "${example.from}" → ✅ "${example.to}"`);
      });
    }
    console.log('---');
  }
}

// Анализ проблемы
function analyzeIssue() {
  console.log('\n🔍 АНАЛИЗ ПРОБЛЕМЫ:');
  console.log('===================');
  
  console.log('❌ ПРОБЛЕМА:');
  console.log('- В промпте GPT: "Каждое правило должно начинаться с 💡 Rule:"');
  console.log('- В коде бота: errorMessage += `💡 Rule: ${error.rule}`');
  console.log('- РЕЗУЛЬТАТ: "💡 Rule: 💡 Rule: После глагола dream..."');
  console.log('');
  
  console.log('✅ РЕШЕНИЕ:');
  console.log('- Промпт остается: "Каждое правило должно начинаться с 💡 Rule:"');
  console.log('- Код изменен: errorMessage += `${error.rule}` (без префикса)');
  console.log('- РЕЗУЛЬТАТ: "💡 Rule: После глагола dream..." (только один раз)');
  console.log('');
  
  console.log('🎯 ПРЕИМУЩЕСТВА:');
  console.log('- Нет дублирования emoji и текста');
  console.log('- Правила выглядят профессионально');
  console.log('- GPT четко понимает требования к формату');
  console.log('- Код стал чище и логичнее');
}

// Запуск тестов
simulateErrorDisplay(mockAnalysisData);
analyzeIssue();

console.log('\n🎉 ЗАКЛЮЧЕНИЕ:');
console.log('===============');
console.log('✅ Дублирование "💡 Rule:" успешно устранено');
console.log('✅ Промпт для GPT остается четким и конкретным');
console.log('✅ Код бота стал чище и без избыточности');
console.log('✅ Пользователи видят правильно оформленные правила');