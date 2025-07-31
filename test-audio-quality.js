const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAudioQuality() {
  try {
    console.log('🎵 Тестируем качество аудио...');
    
    // Найдем недавно добавленные слова с аудио
    const wordsWithAudio = await prisma.word.findMany({
      where: {
        audioData: { not: null }
      },
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`Найдено ${wordsWithAudio.length} слов с аудио:`);
    
    for (const word of wordsWithAudio) {
      const audioSize = word.audioData ? word.audioData.length : 0;
      console.log(`- ${word.word} (${word.profile}): ${audioSize} байт`);
      
      // Проверяем качество - слишком маленький размер может означать проблемы
      if (audioSize < 5000) {
        console.warn(`  ⚠️ Подозрительно маленький размер аудио для "${word.word}"`);
      } else if (audioSize > 50000) {
        console.warn(`  ⚠️ Слишком большой размер аудио для "${word.word}"`);
      } else {
        console.log(`  ✅ Размер аудио нормальный для "${word.word}"`);
      }
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Ошибка тестирования аудио:', error);
    await prisma.$disconnect();
  }
}

testAudioQuality();
