// Тест команды /money - симуляция вывода
require('dotenv').config({ path: __dirname + '/.env' });
const prisma = require('./database');

const MONEY_SYSTEM = {
  TOTAL_BANK: 60000,
  DAILY_REWARD: 1000,
  TOTAL_DAYS: 30,
  NURBOLAT_ID: 'Нурболат',
  AMINA_ID: 'Амина'
};

// Функция для получения локальной даты GMT+5
function getLocalDateGMT5() {
  const now = new Date();
  const localTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return localTime.toDateString();
}

// Функция получения или создания записи банка для текущего месяца
async function getOrCreateSharedBank() {
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    const existingBank = await prisma.$queryRaw`
      SELECT * FROM "shared_bank" WHERE "month" = ${currentMonth} LIMIT 1
    `;
    
    if (existingBank.length > 0) {
      return existingBank[0];
    }
    
    await prisma.$executeRaw`
      INSERT INTO "shared_bank" ("totalAmount", "month", "lastUpdated")
      VALUES (0, ${currentMonth}, CURRENT_TIMESTAMP)
    `;
    
    const newBank = await prisma.$queryRaw`
      SELECT * FROM "shared_bank" WHERE "month" = ${currentMonth} LIMIT 1
    `;
    
    return newBank[0];
  } catch (error) {
    console.error('Error in getOrCreateSharedBank:', error);
    throw error;
  }
}

async function getOrCreateMoneyRecord(profileName) {
  try {
    const existingRecords = await prisma.$queryRaw`
      SELECT * FROM "money_system" WHERE "profileName" = ${profileName}
    `;
    
    if (existingRecords.length > 0) {
      return existingRecords[0];
    }
    
    await prisma.$executeRaw`
      INSERT INTO "money_system" 
      ("profileName", "totalEarned", "totalOwed", "dailyCompletions", "dailyMissed", "lastCompletionDate")
      VALUES (${profileName}, 0, 0, 0, 0, NULL)
    `;
    
    const newRecords = await prisma.$queryRaw`
      SELECT * FROM "money_system" WHERE "profileName" = ${profileName}
    `;
    
    return newRecords[0];
  } catch (error) {
    console.error('Error in getOrCreateMoneyRecord:', error);
    return null;
  }
}

async function getMoneySystemStats() {
  try {
    const nurbolatRecord = await getOrCreateMoneyRecord(MONEY_SYSTEM.NURBOLAT_ID);
    const aminaRecord = await getOrCreateMoneyRecord(MONEY_SYSTEM.AMINA_ID);
    
    // Получаем сумму в банке накоплений
    let sharedBankAmount = 0;
    try {
      const sharedBank = await getOrCreateSharedBank();
      sharedBankAmount = sharedBank.totalAmount;
    } catch (error) {
      console.error('Error getting shared bank amount:', error);
    }
    
    const totalTransferred = nurbolatRecord.totalEarned + aminaRecord.totalEarned + sharedBankAmount;
    const remainingBank = MONEY_SYSTEM.TOTAL_BANK - totalTransferred;
    
    return {
      nurbolat: nurbolatRecord,
      amina: aminaRecord,
      totalBank: MONEY_SYSTEM.TOTAL_BANK,
      remainingBank: remainingBank,
      totalTransferred: totalTransferred,
      sharedBankAmount: sharedBankAmount
    };
  } catch (error) {
    console.error('Error getting money system stats:', error);
    return null;
  }
}

async function testMoneyCommand() {
  try {
    console.log('🧪 Тестируем команду /money...\n');
    
    const stats = await getMoneySystemStats();
    if (!stats) {
      console.log('❌ Ошибка получения статистики денежной системы');
      return;
    }
    
    let msg = `💰 <b>Денежная система мотивации</b>\n\n`;
    
    // Общая информация
    msg += `🏦 <b>Общий банк:</b> ${stats.totalBank.toLocaleString()} тенге\n`;
    msg += `💸 <b>Переведено:</b> ${stats.totalTransferred.toLocaleString()} тенге\n`;
    msg += `💼 <b>Остаток:</b> ${stats.remainingBank.toLocaleString()} тенге\n\n`;
    
    // Статистика Нурболата
    msg += `👨‍💼 <b>Нурболат:</b>\n`;
    msg += `✅ Заработал: ${stats.nurbolat.totalEarned.toLocaleString()} тенге\n`;
    msg += `❌ Должен: ${stats.nurbolat.totalOwed.toLocaleString()} тенге\n`;
    msg += `📅 Завершено: ${stats.nurbolat.dailyCompletions} дней\n`;
    msg += `⏭️ Пропущено: ${stats.nurbolat.dailyMissed} дней\n`;
    msg += `👥 Оба пропустили: ${stats.nurbolat.bothMissedDays || 0} дней\n`;
    
    if (stats.nurbolat.lastCompletionDate) {
      const lastDate = new Date(stats.nurbolat.lastCompletionDate);
      const today = getLocalDateGMT5();
      const isToday = stats.nurbolat.lastCompletionDate === today;
      msg += `🕐 Последнее: ${isToday ? 'Сегодня' : lastDate.toLocaleDateString('ru-RU')}\n`;
    }
    msg += `\n`;
    
    // Статистика Амины
    msg += `👩‍💼 <b>Амина:</b>\n`;
    msg += `✅ Заработала: ${stats.amina.totalEarned.toLocaleString()} тенге\n`;
    msg += `❌ Должна: ${stats.amina.totalOwed.toLocaleString()} тенге\n`;
    msg += `📅 Завершено: ${stats.amina.dailyCompletions} дней\n`;
    msg += `⏭️ Пропущено: ${stats.amina.dailyMissed} дней\n`;
    msg += `👥 Оба пропустили: ${stats.amina.bothMissedDays || 0} дней\n`;
    
    if (stats.amina.lastCompletionDate) {
      const lastDate = new Date(stats.amina.lastCompletionDate);
      const today = getLocalDateGMT5();
      const isToday = stats.amina.lastCompletionDate === today;
      msg += `🕐 Последнее: ${isToday ? 'Сегодня' : lastDate.toLocaleDateString('ru-RU')}\n`;
    }
    msg += `\n`;
    
    // Информация о банке накоплений
    try {
      const sharedBank = await getOrCreateSharedBank();
      msg += `🏦 <b>Банк накоплений:</b> ${sharedBank.totalAmount.toLocaleString()} тенге\n`;
      msg += `💰 <i>Деньги за дни когда оба пропустили (делится в конце месяца)</i>\n\n`;
    } catch (error) {
      console.error('Error getting shared bank info:', error);
      msg += `🏦 <b>Банк накоплений:</b> 0 тенге\n\n`;
    }
    
    // Правила
    msg += `📋 <b>Правила:</b>\n`;
    msg += `• Прошёл умное повторение → +${MONEY_SYSTEM.DAILY_REWARD} тенге\n`;
    msg += `• Один пропустил → ${MONEY_SYSTEM.DAILY_REWARD} тенге другому\n`;
    msg += `• Оба пропустили → ${MONEY_SYSTEM.DAILY_REWARD * 2} тенге в банк накоплений\n`;
    msg += `• Банк делится пополам в конце месяца\n`;
    msg += `• Проверка в 23:59 каждый день\n`;
    msg += `• Всего дней: ${MONEY_SYSTEM.TOTAL_DAYS}`;
    
    console.log('📱 Вывод команды /money:');
    console.log('================================');
    console.log(msg.replace(/<b>/g, '').replace(/<\/b>/g, '').replace(/<i>/g, '').replace(/<\/i>/g, ''));
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMoneyCommand();