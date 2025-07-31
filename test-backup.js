const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

async function createTestBackup() {
  const prisma = new PrismaClient();
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Получаем все слова из базы
    const allWords = await prisma.word.findMany({
      orderBy: { createdAt: 'asc' }
    });
    
    // Получаем все профили пользователей из базы
    const allProfiles = await prisma.userProfile.findMany({
      orderBy: { createdAt: 'asc' }
    });
    
    const backupData = {
      timestamp: new Date().toISOString(),
      totalWords: allWords.length,
      totalProfiles: allProfiles.length,
      words: allWords,
      userProfiles: allProfiles
    };
    
    const backupFileName = `backup-test-${timestamp}.json`;
    fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2));
    
    console.log(`✅ Test backup created: ${backupFileName}`);
    console.log(`📊 Words: ${allWords.length}`);
    console.log(`👤 Profiles: ${allProfiles.length}`);
    
    allProfiles.forEach(p => {
      console.log(`  - ${p.profileName}: Level ${p.level}, XP ${p.xp}, Study Streak ${p.studyStreak}, Login Streak ${p.loginStreak}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestBackup();
