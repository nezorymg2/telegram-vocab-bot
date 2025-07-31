const { PrismaClient } = require('@prisma/client');

async function fixAminaStreak() {
  const prisma = new PrismaClient();
  
  try {
    // Найдем всех пользователей
    const users = await prisma.userProfile.findMany();
    console.log('Найдены пользователи:');
    users.forEach(user => {
      console.log(`Telegram ID: ${user.telegramId}, Profile: ${user.profileName}, Streak: ${user.studyStreak || 0}, Last Study: ${user.lastStudyDate || 'не установлена'}`);
    });
    
    // Найдем Амину
    const aminaTelegramId = '1131806675'; // ID Амины
    
    const aminaProfile = await prisma.userProfile.findFirst({
      where: { telegramId: aminaTelegramId }
    });
    
    if (aminaProfile) {
      await prisma.userProfile.update({
        where: { id: aminaProfile.id },
        data: {
          studyStreak: 6,
          lastStudyDate: new Date().toISOString().split('T')[0] // сегодняшняя дата
        }
      });
      console.log(`Streak для пользователя ${aminaTelegramId} установлен в 6 дней`);
    } else {
      console.log(`Пользователь ${aminaTelegramId} не найден`);
    }
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAminaStreak();
