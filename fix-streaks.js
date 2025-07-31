const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixStreakData() {
  try {
    console.log('🔧 Исправляем данные streak...');
    
    // Сначала проверим текущие данные
    const profiles = await prisma.userProfile.findMany();
    console.log('\n📊 Текущие данные:');
    profiles.forEach(p => {
      console.log(`${p.profileName || 'Unknown'} (ID: ${p.telegramId}): login=${p.loginStreak}, study=${p.studyStreak}`);
    });
    
    // Исправляем данные для Амины (telegramId: "1131806675")
    // У неё 2 профиля - удалим дубликат и исправим основной
    const aminaProfiles = await prisma.userProfile.findMany({
      where: { telegramId: "1131806675" }
    });
    
    if (aminaProfiles.length > 0) {
      console.log(`\n🔧 Найдено ${aminaProfiles.length} профилей для Амины`);
      
      // Оставляем первый профиль и обновляем его
      const mainProfile = aminaProfiles[0];
      await prisma.userProfile.update({
        where: { id: mainProfile.id },
        data: {
          loginStreak: 4,
          studyStreak: 4,
          lastBonusDate: 'Mon Jul 28 2025', // Вчера, чтобы сегодня получить бонус и увеличить до 5
          lastStudyDate: 'Mon Jul 28 2025',
          profileName: 'Амина' // Убедимся что имя правильное
        }
      });
      
      // Удаляем дубликаты
      if (aminaProfiles.length > 1) {
        for (let i = 1; i < aminaProfiles.length; i++) {
          await prisma.userProfile.delete({
            where: { id: aminaProfiles[i].id }
          });
          console.log(`🗑️ Удален дубликат профиля ${aminaProfiles[i].id}`);
        }
      }
      
      console.log('✅ Данные Амины обновлены');
    }
    
    // Проверяем результат
    const updatedProfiles = await prisma.userProfile.findMany();
    console.log('\n✅ Обновленные данные:');
    updatedProfiles.forEach(p => {
      console.log(`${p.profileName || 'Unknown'} (ID: ${p.telegramId}): login=${p.loginStreak}, study=${p.studyStreak}`);
    });
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixStreakData();
