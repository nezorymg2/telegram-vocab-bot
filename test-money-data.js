// Тест для проверки данных денежной системы
require('dotenv').config({ path: __dirname + '/.env' });
const prisma = require('./database');

async function testMoneySystemData() {
  try {
    console.log('🧪 Тестируем данные денежной системы...\n');

    // Проверяем таблицу money_system
    console.log('📋 Данные из таблицы money_system:');
    const records = await prisma.$queryRaw`SELECT * FROM "money_system" ORDER BY "profileName"`;
    
    records.forEach(record => {
      console.log(`${record.profileName}:`);
      console.log(`  ✅ totalEarned: ${record.totalEarned}`);
      console.log(`  ❌ totalOwed: ${record.totalOwed}`);
      console.log(`  📅 dailyCompletions: ${record.dailyCompletions}`);
      console.log(`  ⏭️ dailyMissed: ${record.dailyMissed}`);
      console.log(`  👥 bothMissedDays: ${record.bothMissedDays || 'НЕТ ПОЛЯ!'}`);
      console.log(`  🕐 lastCompletionDate: ${record.lastCompletionDate}`);
      console.log('');
    });

    // Проверяем таблицу shared_bank
    console.log('🏦 Данные из таблицы shared_bank:');
    const currentMonth = new Date().toISOString().substring(0, 7);
    const bankRecords = await prisma.$queryRaw`
      SELECT * FROM "shared_bank" WHERE "month" = ${currentMonth}
    `;
    
    if (bankRecords.length > 0) {
      const bank = bankRecords[0];
      console.log(`💰 totalAmount: ${bank.totalAmount}`);
      console.log(`📅 month: ${bank.month}`);
      console.log(`🕐 lastUpdated: ${bank.lastUpdated}`);
    } else {
      console.log('❌ Нет записи в shared_bank для текущего месяца');
    }

    // Проверяем структуру таблицы money_system
    console.log('\n🔍 Структура таблицы money_system:');
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'money_system'
      ORDER BY ordinal_position
    `;
    
    tableInfo.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMoneySystemData();