const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixNurbolatStreak() {
  try {
    console.log('🔧 Исправляем streak для Нурболата...');
    
    await prisma.userProfile.updateMany({
      where: { 
        telegramId: "930858056",
        profileName: "Нурболат"
      },
      data: {
        loginStreak: 4,
        studyStreak: 4,
        lastBonusDate: 'Mon Jul 28 2025', // Вчера, чтобы сегодня получить бонус
        lastStudyDate: 'Mon Jul 28 2025'
      }
    });
    
    console.log('✅ Streak для Нурболата обновлен');
    
    // Проверяем результат
    const profile = await prisma.userProfile.findFirst({
      where: { 
        telegramId: "930858056",
        profileName: "Нурболат"
      }
    });
    
    console.log(`Нурболат: login=${profile.loginStreak}, study=${profile.studyStreak}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixNurbolatStreak();
