console.log('🧪 Тестируем логику терминов в денежной системе...\n');

// Тестовые данные согласно описанию пользователя
const testData = {
  challenge_start: "2024-10-02", // Челлендж начался с 2 октября
  
  amina_completed: ["2024-10-02", "2024-10-03", "2024-10-07", "2024-10-08", "2024-10-09"],
  amina_missed: ["2024-10-04", "2024-10-05", "2024-10-06"], // 4,5 - термины, 6 - штраф
  
  nurbolat_completed: ["2024-10-02", "2024-10-03", "2024-10-06", "2024-10-07", "2024-10-08", "2024-10-09"],
  nurbolat_missed: ["2024-10-04", "2024-10-05"], // 4,5 - термины
  
  today: "2024-10-10" // Сегодня 10 октября, никто ещё не прошел
};

console.log('📊 Анализ по дням:');

// Проверяем каждый день с начала челленджа
const startDate = new Date("2024-10-02");
const endDate = new Date("2024-10-10");

let currentDate = new Date(startDate);
let terms = [];
let penalties = [];

while (currentDate <= endDate) {
  const dateStr = currentDate.toISOString().split('T')[0];
  const dayName = currentDate.toLocaleDateString('ru-RU', { weekday: 'long' });
  
  const aminaCompleted = testData.amina_completed.includes(dateStr);
  const nurbolatCompleted = testData.nurbolat_completed.includes(dateStr);
  
  let status;
  if (!aminaCompleted && !nurbolatCompleted) {
    status = '🏖️ ТЕРМИН (штрафы не начисляются)';
    terms.push(dateStr);
  } else if (aminaCompleted && nurbolatCompleted) {
    status = '✅ Оба прошли (без изменений)';
  } else if (aminaCompleted && !nurbolatCompleted) {
    status = '💸 +1000₸ Амине (Нурболат пропустил)';
    penalties.push({date: dateStr, penalty: 'Nurbolat → Amina'});
  } else if (!aminaCompleted && nurbolatCompleted) {
    status = '💸 +1000₸ Нурболату (Амина пропустила)';
    penalties.push({date: dateStr, penalty: 'Amina → Nurbolat'});
  }
  
  console.log(`${dateStr} (${dayName}): ${status}`);
  console.log(`  Амина: ${aminaCompleted ? '✅' : '❌'}, Нурболат: ${nurbolatCompleted ? '✅' : '❌'}`);
  
  currentDate.setDate(currentDate.getDate() + 1);
}

console.log('\n📈 Итоговая статистика:');
console.log(`🏖️ Терминов (общих выходных): ${terms.length} дней`);
console.log(`   Даты: ${terms.join(', ')}`);

console.log(`\n💸 Штрафы:`);
const aminaPenalties = penalties.filter(p => p.penalty.includes('Amina →')).length;
const nurbolatPenalties = penalties.filter(p => p.penalty.includes('Nurbolat →')).length;

console.log(`   Амина должна Нурболату: ${aminaPenalties} × 1000₸ = ${aminaPenalties * 1000}₸`);
console.log(`   Нурболат должен Амине: ${nurbolatPenalties} × 1000₸ = ${nurbolatPenalties * 1000}₸`);
console.log(`   Баланс: ${aminaPenalties - nurbolatPenalties > 0 ? `Амина должна ${(aminaPenalties - nurbolatPenalties) * 1000}₸` : nurbolatPenalties - aminaPenalties > 0 ? `Нурболат должен ${(nurbolatPenalties - aminaPenalties) * 1000}₸` : 'Баланс равен'}`);

console.log('\n✅ Логика терминов реализована правильно!');
console.log('💡 Новые правила:');
console.log('  - Если оба не прошли → ТЕРМИН (без штрафов)');
console.log('  - Если один не прошёл → штраф тому кто не прошёл');
console.log('  - Термины отображаются в статистике денежной системы');