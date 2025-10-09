// Скрипт для коррекции статистики денежной системы
// Исправляет данные согласно реальным прохождениям с 2 октября

require('dotenv').config({ path: __dirname + '/.env' });
const prisma = require('./database');

async function correctMoneySystemData() {
  try {
    console.log('🔧 Исправляем статистику денежной системы...\n');

    // Данные по реальным прохождениям:
    console.log('📋 Реальные данные:');
    console.log('Амина прошла: 2,3,7,8,9 октября (5 дней)');
    console.log('Амина пропустила: 6 октября (1 день) → +1000 тг Нурболату');
    console.log('Нурболат прошел: 2,3,6,7,8,9 октября (6 дней)');
    console.log('Оба пропустили: 4,5 октября (2 дня) → 4000 тг в банк\n');

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

    console.log('💰 Исправляем данные Амины...');
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

    console.log('🏦 Исправляем банк накоплений...');
    // Устанавливаем правильную сумму в банке: 4000 тг за 4,5 октября
    const currentMonth = new Date().toISOString().substring(0, 7); // 2025-10
    await prisma.$executeRaw`
      INSERT INTO "shared_bank" ("totalAmount", "month", "lastUpdated")
      VALUES (4000, ${currentMonth}, CURRENT_TIMESTAMP)
      ON CONFLICT ("month") DO UPDATE SET
        "totalAmount" = 4000,
        "lastUpdated" = CURRENT_TIMESTAMP
    `;

    console.log('\n✅ Коррекция завершена!');
    console.log('\n📊 Новая статистика:');
    console.log('👩‍💼 Амина: Заработала 5,000 тг, Должна 1,000 тг, Завершила 5 дней, Пропустила 1 день');
    console.log('👨‍💼 Нурболат: Заработал 7,000 тг, Должен 0 тг, Завершил 6 дней, Пропустил 0 дней');
    console.log('👥 Оба пропустили: 2 дня (4,5 октября)');
    console.log('🏦 Банк накоплений: 4,000 тг');

    // Проверяем результат
    console.log('\n🔍 Проверяем результат...');
    const records = await prisma.$queryRaw`SELECT * FROM "money_system" ORDER BY "profileName"`;
    const bank = await prisma.$queryRaw`SELECT * FROM "shared_bank" WHERE "month" = ${currentMonth}`;

    records.forEach(record => {
      console.log(`${record.profileName}: Заработал ${record.totalEarned}, Должен ${record.totalOwed}, Завершил ${record.dailyCompletions}, Пропустил ${record.dailyMissed}, Оба пропустили ${record.bothMissedDays}`);
    });

    if (bank.length > 0) {
      console.log(`Банк: ${bank[0].totalAmount} тг`);
    }

  } catch (error) {
    console.error('❌ Ошибка при коррекции:', error);
  } finally {
    await prisma.$disconnect();
  }
}

correctMoneySystemData();