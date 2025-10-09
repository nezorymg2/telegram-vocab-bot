// Исправление дат последнего прохождения
require('dotenv').config({ path: __dirname + '/.env' });
const prisma = require('./database');

async function fixLastCompletionDates() {
  try {
    console.log('🔧 Исправляем даты последнего прохождения...\n');

    // Функция для получения локальной даты GMT+5
    function getLocalDateGMT5ForDate(dateString) {
      const date = new Date(dateString);
      // Добавляем 5 часов к UTC времени
      const localTime = new Date(date.getTime() + 5 * 60 * 60 * 1000);
      return localTime.toDateString();
    }

    // Согласно вашим данным:
    // Амина прошла: 2,3,7,8,9 октября (последнее - 9 октября)  
    // Нурболат прошел: 2,3,6,7,8,9 октября (последнее - 9 октября)
    
    const oct9GMT5 = getLocalDateGMT5ForDate('2025-10-09');
    console.log(`Устанавливаем дату последнего прохождения: ${oct9GMT5}`);

    console.log('💰 Исправляем дату для Амины...');
    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "lastCompletionDate" = ${oct9GMT5},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" = 'Амина'
    `;

    console.log('💰 Исправляем дату для Нурболата...');  
    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "lastCompletionDate" = ${oct9GMT5},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" = 'Нурболат'
    `;

    console.log('\n✅ Даты исправлены!');
    
    // Проверяем результат
    console.log('\n🔍 Проверяем результат:');
    const records = await prisma.$queryRaw`SELECT * FROM "money_system" ORDER BY "profileName"`;

    records.forEach(record => {
      console.log(`${record.profileName}: lastCompletionDate = "${record.lastCompletionDate}"`);
    });

    console.log(`\n📅 Теперь у обоих последнее прохождение: ${oct9GMT5} (9 октября)`);

  } catch (error) {
    console.error('❌ Ошибка при исправлении дат:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixLastCompletionDates();