const { PrismaClient } = require('@prisma/client');

async function linkNurbolatProfile() {
  const prisma = new PrismaClient();
  try {
    const userId = 930858056;
    
    console.log('🔗 Связываем профиль Нурболат с пользователем:', userId);
    
    // Находим профиль Нурболат
    const nurbolatProfile = await prisma.userProfile.findFirst({
      where: { profileName: 'Нурболат' }
    });
    
    if (nurbolatProfile) {
      // Обновляем telegramId
      await prisma.userProfile.update({
        where: { id: nurbolatProfile.id },
        data: { telegramId: userId.toString() }
      });
      
      console.log(`✅ Профиль "${nurbolatProfile.profileName}" связан с пользователем ${userId}`);
      console.log(`📊 XP: ${nurbolatProfile.xp}, Уровень: ${nurbolatProfile.level}`);
      
      // Удаляем сессию из базы данных чтобы пересоздать
      await prisma.$executeRaw`DELETE FROM "user_sessions" WHERE "userId" = ${userId.toString()}`;
      console.log('🗑️ Старая сессия удалена, будет пересоздана при следующем /start');
      
    } else {
      console.log('❌ Профиль Нурболат не найден');
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

linkNurbolatProfile();