const { PrismaClient } = require('@prisma/client');

async function checkUserLevels() {
  const prisma = new PrismaClient();
  
  try {
    // Найдем всех пользователей с их уровнями
    const users = await prisma.userProfile.findMany();
    console.log('📊 Пользователи и их уровни:');
    users.forEach(user => {
      console.log(`👤 ${user.profileName} (ID: ${user.telegramId})`);
      console.log(`   📈 Уровень: ${user.level}`);
      console.log(`   ⭐ XP: ${user.xp}`);
      console.log(`   🔥 Study Streak: ${user.studyStreak || 0}`);
      console.log(`   📅 Login Streak: ${user.loginStreak || 0}`);
      console.log(`   📅 Последнее изучение: ${user.lastStudyDate || 'не установлена'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserLevels();
