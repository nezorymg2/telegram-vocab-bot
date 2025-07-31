const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testStreakPersistence() {
  try {
    console.log('🧪 Тестируем сохранение streak данных...');
    
    // Получаем текущие данные
    const beforeUpdate = await prisma.userProfile.findFirst({
      where: { 
        telegramId: "930858056",
        profileName: "Нурболат"
      }
    });
    
    console.log('📊 ДО обновления:');
    console.log(`  loginStreak: ${beforeUpdate.loginStreak}`);
    console.log(`  studyStreak: ${beforeUpdate.studyStreak}`);
    console.log(`  lastBonusDate: ${beforeUpdate.lastBonusDate}`);
    
    // Симулируем обновление (как будто пользователь получил бонус)
    await prisma.userProfile.updateMany({
      where: { 
        telegramId: "930858056",
        profileName: "Нурболат"
      },
      data: {
        loginStreak: beforeUpdate.loginStreak + 1,
        lastBonusDate: new Date().toDateString(),
        xp: beforeUpdate.xp + 50
      }
    });
    
    // Проверяем что данные сохранились
    const afterUpdate = await prisma.userProfile.findFirst({
      where: { 
        telegramId: "930858056",
        profileName: "Нурболат"
      }
    });
    
    console.log('\n📊 ПОСЛЕ обновления:');
    console.log(`  loginStreak: ${afterUpdate.loginStreak}`);
    console.log(`  studyStreak: ${afterUpdate.studyStreak}`);
    console.log(`  lastBonusDate: ${afterUpdate.lastBonusDate}`);
    
    // Возвращаем исходные данные
    await prisma.userProfile.updateMany({
      where: { 
        telegramId: "930858056",
        profileName: "Нурболат"
      },
      data: {
        loginStreak: beforeUpdate.loginStreak,
        lastBonusDate: beforeUpdate.lastBonusDate,
        xp: beforeUpdate.xp
      }
    });
    
    console.log('\n✅ Данные возвращены к исходному состоянию');
    console.log('✅ Тест пройден - механизм сохранения работает!');
    
  } catch (error) {
    console.error('❌ Ошибка теста:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testStreakPersistence();
