// Скрипт для создания новых таблиц и колонок, а затем коррекции данных
require('dotenv').config({ path: __dirname + '/.env' });
const prisma = require('./database');

async function setupAndCorrectDatabase() {
  try {
    console.log('🔧 Обновляем схему базы данных и исправляем статистику...\n');

    console.log('📋 Шаг 1: Добавляем колонку bothMissedDays...');
    try {
      await prisma.$executeRaw`
        ALTER TABLE "money_system" 
        ADD COLUMN IF NOT EXISTS "bothMissedDays" INTEGER DEFAULT 0
      `;
      console.log('✅ Колонка bothMissedDays добавлена');
    } catch (error) {
      console.log('ℹ️  Колонка bothMissedDays уже существует или ошибка:', error.message);
    }

    console.log('\n📋 Шаг 2: Создаем таблицу shared_bank...');
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "shared_bank" (
          "id" SERIAL PRIMARY KEY,
          "totalAmount" INTEGER DEFAULT 0,
          "lastUpdated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "month" VARCHAR(7) NOT NULL DEFAULT (TO_CHAR(CURRENT_DATE, 'YYYY-MM'))
        )
      `;
      console.log('✅ Таблица shared_bank создана');
    } catch (error) {
      console.log('ℹ️  Таблица shared_bank уже существует или ошибка:', error.message);
    }

    console.log('\n📋 Шаг 3: Исправляем данные согласно реальной статистике...');

    // Реальные данные:
    console.log('Амина прошла: 2,3,7,8,9 октября (5 дней)');
    console.log('Амина пропустила: 6 октября (1 день) → +1000 тг Нурболату');
    console.log('Нурболат прошел: 2,3,6,7,8,9 октября (6 дней)');
    console.log('Оба пропустили: 4,5 октября (2 дня) → 4000 тг в банк');

    // Правильные суммы:
    const correctData = {
      amina: {
        totalEarned: 5000,    // 5 дней × 1000
        totalOwed: 1000,      // должна Нурболату за 6 октября  
        dailyCompletions: 5,  // прошла 5 дней
        dailyMissed: 1,       // пропустила 1 день (6 октября)
        bothMissedDays: 2     // 4,5 октября
      },
      nurbolat: {
        totalEarned: 7000,    // 6000 за свои дни + 1000 за пропуск Амины
        totalOwed: 0,         // ничего не должен
        dailyCompletions: 6,  // прошел 6 дней  
        dailyMissed: 0,       // не пропускал (когда оба пропускали - не считается)
        bothMissedDays: 2     // 4,5 октября
      }
    };

    console.log('\n💰 Исправляем данные Амины...');
    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "totalEarned" = ${correctData.amina.totalEarned},
        "totalOwed" = ${correctData.amina.totalOwed},
        "dailyCompletions" = ${correctData.amina.dailyCompletions},
        "dailyMissed" = ${correctData.amina.dailyMissed},
        "bothMissedDays" = ${correctData.amina.bothMissedDays},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" = 'Амина'
    `;

    console.log('💰 Исправляем данные Нурболата...');
    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "totalEarned" = ${correctData.nurbolat.totalEarned},
        "totalOwed" = ${correctData.nurbolat.totalOwed},
        "dailyCompletions" = ${correctData.nurbolat.dailyCompletions},
        "dailyMissed" = ${correctData.nurbolat.dailyMissed},
        "bothMissedDays" = ${correctData.nurbolat.bothMissedDays},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" = 'Нурболат'
    `;

    console.log('🏦 Устанавливаем банк накоплений...');
    const currentMonth = new Date().toISOString().substring(0, 7); // 2025-10
    
    // Сначала удаляем старые записи если есть
    await prisma.$executeRaw`
      DELETE FROM "shared_bank" WHERE "month" = ${currentMonth}
    `;
    
    // Добавляем правильную запись
    await prisma.$executeRaw`
      INSERT INTO "shared_bank" ("totalAmount", "month", "lastUpdated")
      VALUES (4000, ${currentMonth}, CURRENT_TIMESTAMP)
    `;

    console.log('\n✅ Все исправления завершены!');
    
    // Проверяем результат
    console.log('\n🔍 Проверяем результат:');
    const records = await prisma.$queryRaw`SELECT * FROM "money_system" ORDER BY "profileName"`;
    const bank = await prisma.$queryRaw`SELECT * FROM "shared_bank" WHERE "month" = ${currentMonth}`;

    console.log('\n📊 Обновленная статистика:');
    records.forEach(record => {
      console.log(`${record.profileName}:`);
      console.log(`  ✅ Заработал: ${record.totalEarned.toLocaleString()} тг`);
      console.log(`  ❌ Должен: ${record.totalOwed.toLocaleString()} тг`);
      console.log(`  📅 Завершил: ${record.dailyCompletions} дней`);
      console.log(`  ⏭️ Пропустил: ${record.dailyMissed} дней`);
      console.log(`  👥 Оба пропустили: ${record.bothMissedDays} дней\n`);
    });

    if (bank.length > 0) {
      console.log(`🏦 Банк накоплений: ${bank[0].totalAmount.toLocaleString()} тг (месяц: ${bank[0].month})`);
    }

    console.log('\n🎉 Теперь статистика соответствует реальным данным!');

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupAndCorrectDatabase();