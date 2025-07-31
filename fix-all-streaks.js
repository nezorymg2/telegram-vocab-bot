const { PrismaClient } = require('@prisma/client');

async function fixUserStreaks() {
  const prisma = new PrismaClient();
  
  try {
    // Найдем всех пользователей
    const users = await prisma.userProfile.findMany();
    console.log('Найдены пользователи:');
    users.forEach(user => {
      console.log(`Telegram ID: ${user.telegramId}, Profile: ${user.profileName}, Study Streak: ${user.studyStreak || 0}, Login Streak: ${user.loginStreak || 0}, Last Study: ${user.lastStudyDate || 'не установлена'}`);
    });
    
    // Исправляем streak Нурболата (ваш ID)
    const nurbolatTelegramId = '930858056';
    
    const nurbolatProfile = await prisma.userProfile.findFirst({
      where: { telegramId: nurbolatTelegramId }
    });
    
    if (nurbolatProfile) {
      await prisma.userProfile.update({
        where: { id: nurbolatProfile.id },
        data: {
          studyStreak: 6,
          loginStreak: 6,
          lastStudyDate: new Date().toISOString().split('T')[0] // сегодняшняя дата
        }
      });
      console.log(`\nStreak для пользователя ${nurbolatTelegramId} (Нурболат) установлен в 6 дней (и учебы и входа)`);
    } else {
      console.log(`\nПользователь ${nurbolatTelegramId} не найден`);
    }
    
    // Проверяем есть ли пользователь с именем "⏭️ Пропустить слово" (это баг)
    const bugUser = await prisma.userProfile.findFirst({
      where: { profileName: '⏭️ Пропустить слово' }
    });
    
    if (bugUser) {
      console.log(`\nНайден баг-пользователь: ID ${bugUser.telegramId}, Profile: ${bugUser.profileName}`);
      // Удаляем этого пользователя
      await prisma.userProfile.delete({
        where: { id: bugUser.id }
      });
      console.log('Баг-пользователь удален из базы данных');
    } else {
      console.log('\nБаг-пользователь "⏭️ Пропустить слово" не найден');
    }
    
    // Показываем итоговое состояние
    console.log('\nИтоговое состояние базы данных:');
    const finalUsers = await prisma.userProfile.findMany();
    finalUsers.forEach(user => {
      console.log(`Telegram ID: ${user.telegramId}, Profile: ${user.profileName}, Study Streak: ${user.studyStreak || 0}, Login Streak: ${user.loginStreak || 0}, Last Study: ${user.lastStudyDate || 'не установлена'}`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixUserStreaks();
