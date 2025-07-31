const { PrismaClient } = require('@prisma/client');

async function deleteSkipWordProfile() {
  const prisma = new PrismaClient();
  
  try {
    // Найдем всех пользователей
    const users = await prisma.userProfile.findMany();
    console.log('Найдены пользователи:');
    users.forEach(user => {
      console.log(`ID: ${user.id}, Telegram ID: ${user.telegramId}, Profile: "${user.profileName}"`);
    });
    
    // Найдем профиль "⏭️ Пропустить слово"
    const skipProfile = await prisma.userProfile.findFirst({
      where: { profileName: '⏭️ Пропустить слово' }
    });
    
    if (skipProfile) {
      console.log(`\nНайден баг-профиль: ID ${skipProfile.id}, Telegram ID: ${skipProfile.telegramId}, Profile: "${skipProfile.profileName}"`);
      
      // Удаляем профиль
      await prisma.userProfile.delete({
        where: { id: skipProfile.id }
      });
      console.log('✅ Баг-профиль "⏭️ Пропустить слово" удален из базы данных');
    } else {
      console.log('\n❌ Профиль "⏭️ Пропустить слово" не найден в базе данных');
    }
    
    // Также проверим профили с похожими названиями (содержащие эмодзи)
    const emojiProfiles = await prisma.userProfile.findMany({
      where: {
        profileName: {
          contains: '⏭️'
        }
      }
    });
    
    if (emojiProfiles.length > 0) {
      console.log('\nНайдены профили с эмодзи:');
      for (const profile of emojiProfiles) {
        console.log(`ID: ${profile.id}, Telegram ID: ${profile.telegramId}, Profile: "${profile.profileName}"`);
        await prisma.userProfile.delete({
          where: { id: profile.id }
        });
        console.log(`✅ Удален профиль: "${profile.profileName}"`);
      }
    }
    
    // Показываем итоговое состояние
    console.log('\n📊 Итоговое состояние базы данных:');
    const finalUsers = await prisma.userProfile.findMany();
    finalUsers.forEach(user => {
      console.log(`Telegram ID: ${user.telegramId}, Profile: "${user.profileName}", Study Streak: ${user.studyStreak || 0}, Login Streak: ${user.loginStreak || 0}`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteSkipWordProfile();
