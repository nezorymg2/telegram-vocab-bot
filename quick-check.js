const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function quickCheck() {
  try {
    console.log('🔍 Быстрая проверка месячных кодов...\n');
    
    const codes = await prisma.$queryRaw`
      SELECT "code", "subscription_type", "isUsed", "usedByTelegramId"
      FROM "activation_codes" 
      WHERE "subscription_type" = 'monthly'
      ORDER BY "createdAt" DESC
      LIMIT 5
    `;
    
    console.log('📋 Первые 5 месячных кодов:');
    codes.forEach((code, index) => {
      console.log(`${index + 1}. ${code.code} - ${code.isUsed ? 'ИСПОЛЬЗОВАН (User: ' + code.usedByTelegramId + ')' : 'ДОСТУПЕН'}`);
    });
    
    console.log('\n✅ Проверка завершена');
    console.log('🤖 Бот запущен и готов к тестированию активации');
    console.log('📱 Попробуйте активировать один из доступных кодов в Telegram боте');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

quickCheck();