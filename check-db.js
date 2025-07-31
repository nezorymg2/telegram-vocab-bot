const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Проверяем подключение к базе данных...');
    
    // Проверяем подключение
    await prisma.$connect();
    console.log('✅ Подключение к PostgreSQL успешно');
    
    // Проверяем профили пользователей
    console.log('\n👥 Профили пользователей:');
    const profiles = await prisma.userProfile.findMany();
    profiles.forEach(p => {
      console.log(`${p.profileName} (ID: ${p.telegramId})`);
      console.log(`  - loginStreak: ${p.loginStreak}`);
      console.log(`  - studyStreak: ${p.studyStreak}`);
      console.log(`  - lastBonusDate: ${p.lastBonusDate}`);
      console.log(`  - lastStudyDate: ${p.lastStudyDate}`);
      console.log(`  - xp: ${p.xp}`);
      console.log('---');
    });
  } catch (error) {
    console.error('❌ Ошибка при проверке базы данных:', error);
    console.error('Детали:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
