const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function quickAudioTest() {
  try {
    console.log('🚀 Быстрый тест аудио системы...\n');
    
    // Тест 1: Проверяем модуль gtts
    console.log('1️⃣ Проверяем наличие модуля gtts...');
    try {
      const gTTS = require('gtts');
      console.log('✅ Модуль gtts найден');
    } catch (error) {
      console.log('❌ Модуль gtts не найден:', error.message);
      return;
    }
    
    // Тест 2: Проверяем подключение к базе данных
    console.log('\n2️⃣ Проверяем подключение к базе данных...');
    try {
      await prisma.$connect();
      console.log('✅ Подключение к базе данных успешно');
    } catch (error) {
      console.log('❌ Ошибка подключения к базе:', error.message);
      return;
    }
    
    // Тест 3: Проверяем текущий аудио кеш
    console.log('\n3️⃣ Проверяем текущий аудио кеш...');
    const audioCount = await prisma.audioCache.count();
    console.log(`📼 Количество аудио в кеше: ${audioCount}`);
    
    if (audioCount > 0) {
      const sampleAudio = await prisma.audioCache.findMany({ take: 3 });
      console.log('🔊 Примеры слов с аудио:');
      sampleAudio.forEach(audio => {
        console.log(`   - ${audio.word} (${audio.audioData.length} bytes)`);
      });
    }
    
    // Тест 4: Проверяем количество слов в базе
    console.log('\n4️⃣ Проверяем слова в базе данных...');
    const wordCount = await prisma.word.count();
    console.log(`📚 Всего слов в базе: ${wordCount}`);
    
    if (wordCount > 0) {
      const sampleWords = await prisma.word.findMany({ 
        take: 3, 
        select: { word: true, translation: true, profile: true }
      });
      console.log('📝 Примеры слов:');
      sampleWords.forEach(word => {
        console.log(`   - ${word.word} → ${word.translation} (${word.profile})`);
      });
    }
    
    // Тест 5: Генерируем тестовое аудио
    console.log('\n5️⃣ Тестируем генерацию аудио...');
    const testWord = 'test';
    
    // Проверяем, есть ли уже аудио для слова "test"
    const existingAudio = await prisma.audioCache.findUnique({
      where: { word: testWord.toLowerCase() }
    });
    
    if (existingAudio) {
      console.log(`✅ Аудио для "${testWord}" уже существует (${existingAudio.audioData.length} bytes)`);
    } else {
      console.log(`🔄 Генерируем аудио для "${testWord}"...`);
      
      const gTTS = require('gtts');
      const gtts = new gTTS(testWord, 'en');
      
      try {
        const stream = await gtts.stream();
        const chunks = [];
        
        await new Promise((resolve, reject) => {
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        
        const audioBuffer = Buffer.concat(chunks);
        
        // Сохраняем в базу данных
        await prisma.audioCache.create({
          data: {
            word: testWord.toLowerCase(),
            audioData: audioBuffer
          }
        });
        
        console.log(`✅ Аудио для "${testWord}" успешно создано (${audioBuffer.length} bytes)`);
      } catch (error) {
        console.log(`❌ Ошибка генерации аудио: ${error.message}`);
      }
    }
    
    // Финальная проверка
    console.log('\n6️⃣ Финальная проверка аудио кеша...');
    const finalAudioCount = await prisma.audioCache.count();
    console.log(`📼 Итоговое количество аудио в кеше: ${finalAudioCount}`);
    
    console.log('\n🎉 Тест завершен!');
    
    if (finalAudioCount > 0) {
      console.log('✅ Аудио система работает корректно!');
      console.log('✅ В викторинах должно появляться аудио произношение');
    } else {
      console.log('❌ Проблемы с аудио системой');
    }
    
  } catch (error) {
    console.error('❌ Ошибка в тесте:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

quickAudioTest();
