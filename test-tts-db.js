const prisma = require('./database');

async function testTTSDatabase() {
  try {
    console.log('🧪 Testing TTS database functionality...');
    
    // 1. Проверяем схему базы данных
    console.log('📋 Checking database schema...');
    const sampleWord = await prisma.word.findFirst();
    if (sampleWord) {
      console.log('✅ Database accessible');
      console.log('🔍 Sample word structure:', {
        id: sampleWord.id,
        word: sampleWord.word,
        hasAudio: !!sampleWord.audioData,
        audioSize: sampleWord.audioData ? sampleWord.audioData.length : 0
      });
    } else {
      console.log('⚠️ No words found in database');
    }
    
    // 2. Проверяем количество слов с аудио
    const wordsWithAudio = await prisma.word.count({
      where: { audioData: { not: null } }
    });
    
    const totalWords = await prisma.word.count();
    
    console.log(`📊 Audio statistics:`);
    console.log(`  Total words: ${totalWords}`);
    console.log(`  Words with audio: ${wordsWithAudio}`);
    console.log(`  Words without audio: ${totalWords - wordsWithAudio}`);
    console.log(`  Audio coverage: ${totalWords > 0 ? Math.round((wordsWithAudio / totalWords) * 100) : 0}%`);
    
    // 3. Показываем примеры слов с аудио по профилям
    const profiles = await prisma.word.groupBy({
      by: ['profile'],
      _count: { id: true },
      where: { audioData: { not: null } }
    });
    
    console.log(`👥 Audio by profiles:`);
    for (const profile of profiles) {
      console.log(`  ${profile.profile}: ${profile._count.id} words with audio`);
    }
    
    console.log('✅ TTS database test completed successfully!');
    
  } catch (error) {
    console.error('❌ TTS database test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем тест
testTTSDatabase();
