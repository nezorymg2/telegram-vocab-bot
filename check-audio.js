const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAudioCache() {
  try {
    console.log('🔍 Проверяем состояние аудио и базы данных...');
    
    // Проверяем количество аудио в кеше
    const audioCount = await prisma.audioCache.count();
    console.log('📼 Количество аудио в кеше:', audioCount);
    
    if (audioCount > 0) {
      const sampleAudio = await prisma.audioCache.findMany({ take: 5 });
      console.log('🔊 Примеры слов с аудио:');
      sampleAudio.forEach(audio => {
        console.log('  -', audio.word);
      });
    } else {
      console.log('⚠️ Аудио кеш пустой!');
    }

    // Проверим слова пользователей
    const words = await prisma.word.findMany({ take: 10 });
    console.log('\n📚 Примеры слов пользователей:');
    words.forEach(word => {
      console.log('  -', word.word, '→', word.translation, '(profile:', word.profile + ')');
    });

    // Проверим общее количество слов
    const totalWords = await prisma.word.count();
    console.log('\n📊 Всего слов в базе:', totalWords);

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAudioCache();
