const { PrismaClient } = require('@prisma/client');

async function fixAminaLoginStreak() {
  const prisma = new PrismaClient();
  
  try {
    // Исправляем loginStreak Амины
    const aminaTelegramId = '1131806675';
    
    const aminaProfile = await prisma.userProfile.findFirst({
      where: { telegramId: aminaTelegramId }
    });
    
    if (aminaProfile) {
      await prisma.userProfile.update({
        where: { id: aminaProfile.id },
        data: {
          loginStreak: 6
        }
      });
      console.log(`Login streak для Амины установлен в 6 дней`);
    }
    
    // Показываем итоговое состояние
    console.log('\nИтоговое состояние базы данных:');
    const users = await prisma.userProfile.findMany();
    users.forEach(user => {
      console.log(`Telegram ID: ${user.telegramId}, Profile: ${user.profileName}, Study Streak: ${user.studyStreak || 0}, Login Streak: ${user.loginStreak || 0}, Last Study: ${user.lastStudyDate || 'не установлена'}`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAminaLoginStreak();
