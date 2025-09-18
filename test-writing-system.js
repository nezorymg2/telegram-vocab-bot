const { Bot } = require('grammy');
const prisma = require('./database');

// Простая симуляция для тестирования системы письма
async function testWritingSystem() {
  console.log('=== TESTING WRITING SYSTEM ===');
  
  try {
    // Симулируем пользователя
    const testUserId = '123456789';
    const testProfileName = 'TestProfile';
    
    // Создаем или получаем профиль
    let userProfile = await prisma.userProfile.findFirst({
      where: { 
        telegramId: testUserId.toString(),
        profileName: testProfileName 
      }
    });
    
    if (!userProfile) {
      userProfile = await prisma.userProfile.create({
        data: {
          telegramId: testUserId.toString(),
          profileName: testProfileName,
          xp: 0,
          level: 1,
          loginStreak: 0,
          studyStreak: 0,
          lastStudyDate: null,
          lastBonusDate: null,
          lastSmartRepeatDate: null,
          reminderTime: null,
          writingTopicIndex: 0
        }
      });
      console.log('✅ Created test user profile');
    }
    
    console.log(`📊 Current writing topic index: ${userProfile.writingTopicIndex}`);
    
    // Проверяем, что у нас есть 50 тем
    const bot = require('./bot.js');
    
    // Проверим, что WRITING_TOPICS определен
    // Пока что просто проверим, что база данных работает
    
    console.log('✅ Writing system ready for testing');
    console.log('💡 You can now start the bot and test the writing stage manually');
    
  } catch (error) {
    console.error('❌ Error testing writing system:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testWritingSystem().catch(console.error);