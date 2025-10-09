// Тест для проверки промптов на русском языке
console.log('🧪 Проверяем промпты для генерации улучшенной версии...');

const fs = require('fs');
const botContent = fs.readFileSync('bot.js', 'utf8');

// Ищем промпт функции generateImprovedVersion
const promptStart = botContent.indexOf('ЯЗЫКОВЫЕ ТРЕБОВАНИЯ');
const promptEnd = botContent.indexOf('СТРОГО: Возвращай ТОЛЬКО JSON без лишнего текста!');

if (promptStart !== -1 && promptEnd !== -1) {
    const promptSection = botContent.substring(promptStart, promptEnd + 50);
    console.log('✅ Найден блок языковых требований:');
    console.log('---');
    console.log(promptSection);
    console.log('---');
    
    // Проверяем ключевые фразы
    const checks = [
        'ТОЛЬКО НА РУССКОМ ЯЗЫКЕ',
        'НА РУССКОМ ЯЗЫКЕ',
        'КРИТИЧЕСКИ ВАЖНО',
        'ЗАПРЕЩЕНО писать объяснения на английском'
    ];
    
    let allGood = true;
    checks.forEach(check => {
        if (promptSection.includes(check)) {
            console.log(`✅ Найдено: "${check}"`);
        } else {
            console.log(`❌ НЕ найдено: "${check}"`);
            allGood = false;
        }
    });
    
    if (allGood) {
        console.log('\n🎯 Все проверки пройдены! Промпт должен заставлять GPT отвечать на русском.');
    } else {
        console.log('\n⚠️ Некоторые проверки не пройдены.');
    }
    
} else {
    console.log('❌ Не удалось найти блок языковых требований');
}

// Проверяем пользовательский промпт
const userPromptMatch = botContent.match(/ВНИМАНИЕ! КРИТИЧЕСКИ ВАЖНО:[^}]*/);
if (userPromptMatch) {
    console.log('\n✅ Найден усиленный пользовательский промпт:');
    console.log(userPromptMatch[0]);
} else {
    console.log('\n❌ Усиленный пользовательский промпт не найден');
}

console.log('\n🚀 Теперь бот должен объяснять ТОЛЬКО на русском языке!');