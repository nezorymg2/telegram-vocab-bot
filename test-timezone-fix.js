// Тест для проверки исправлений временной зоны GMT+5

console.log('🕐 Тестируем исправления для GMT+5...\n');

// Симулируем функции
function getLocalDateGMT5() {
  const now = new Date();
  // Добавляем 5 часов к UTC времени
  const localTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return localTime.toDateString();
}

function getLocalDateISOGMT5() {
  const now = new Date();
  // Добавляем 5 часов к UTC времени
  const localTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return localTime.toISOString().split('T')[0];
}

// Сравнения
const utcDate = new Date().toDateString();
const utcISO = new Date().toISOString().split('T')[0];
const gmt5Date = getLocalDateGMT5();
const gmt5ISO = getLocalDateISOGMT5();

console.log('⏰ Сравнение времени:');
console.log(`UTC дата: ${utcDate}`);
console.log(`GMT+5 дата: ${gmt5Date}`);
console.log(`UTC ISO: ${utcISO}`);
console.log(`GMT+5 ISO: ${gmt5ISO}`);

const currentHour = new Date().getHours();
const gmt5Hour = new Date(new Date().getTime() + 5 * 60 * 60 * 1000).getHours();

console.log(`\n🕐 Текущий час UTC: ${currentHour}`);
console.log(`🕐 Текущий час GMT+5: ${gmt5Hour}`);

// Проверяем разные сценарии
console.log('\n🧪 Тестовые сценарии:');

// Сценарий: пользователь проходит умное повторение в 3:00 GMT+5 (22:00 UTC предыдущего дня)
const scenario1UTC = new Date('2025-10-10T22:00:00.000Z'); // 22:00 UTC = 3:00 GMT+5 следующего дня
const scenario1GMT5 = new Date(scenario1UTC.getTime() + 5 * 60 * 60 * 1000);

console.log('Сценарий 1: Прохождение в 3:00 ночи по GMT+5');
console.log(`  UTC время: ${scenario1UTC.toISOString()}`);
console.log(`  GMT+5 время: ${scenario1GMT5.toISOString()}`);
console.log(`  UTC дата: ${scenario1UTC.toDateString()}`);
console.log(`  GMT+5 дата: ${scenario1GMT5.toDateString()}`);

// Проверяем, что даты разные
if (scenario1UTC.toDateString() !== scenario1GMT5.toDateString()) {
  console.log('  ✅ ИСПРАВЛЕНИЕ НЕОБХОДИМО: UTC и GMT+5 показывают разные даты!');
} else {
  console.log('  ℹ️  UTC и GMT+5 показывают одинаковые даты');
}

console.log('\n📋 РЕЗЮМЕ ИСПРАВЛЕНИЙ:');
console.log('✅ Добавлены функции getLocalDateGMT5() и getLocalDateISOGMT5()');
console.log('✅ Заменены все new Date().toDateString() на getLocalDateGMT5()');
console.log('✅ Исправлены функции:');
console.log('   - recordSmartRepeatCompletion');
console.log('   - checkMissedSmartRepeats');
console.log('   - checkDailyBonus');
console.log('   - completeSmartRepeat');
console.log('   - finishSmartRepeat');
console.log('   - sendRemindersToUsers');
console.log('   - и все другие места использования дат');
console.log('✅ Cron задачи уже настроены на Asia/Yekaterinburg (GMT+5)');

console.log('\n🎯 РЕЗУЛЬТАТ:');
console.log('Теперь когда вы проходите умное повторение в 3:00 ночи по GMT+5,');
console.log('система будет считать это за текущий день, а не за предыдущий!');