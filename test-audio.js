const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

// Функция генерации аудио (копия из bot.js)
async function generateAndCacheAudio(word) {
  try {
    // Проверяем, есть ли уже в кеше
    const existing = await prisma.audioCache.findUnique({
      where: { word: word.toLowerCase() }
    });
    if (existing) {
      console.log(`✅ Found cached audio for: "${word}"`);
      return true;
    }

    console.log(`🔄 Generating audio for: "${word}"`);

    // Создаем аудио с помощью gTTS
    const gTTS = require('gtts');
    const gtts = new gTTS(word, 'en');
    
    return new Promise((resolve) => {
      gtts.stream().then(stream => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', async () => {
          try {
            const audioBuffer = Buffer.concat(chunks);
            
            // Сохраняем в базу данных
            await prisma.audioCache.create({
              data: {
                word: word.toLowerCase(),
                audioData: audioBuffer
              }
            });
            
            console.log(`✅ Audio cached for: "${word}"`);
            resolve(true);
          } catch (error) {
            console.error(`❌ Failed to cache audio for "${word}":`, error.message);
            resolve(false);
          }
        });
        stream.on('error', (error) => {
          console.error(`❌ gTTS stream error for "${word}":`, error.message);
          resolve(false);
        });
      }).catch(error => {
        console.error(`❌ gTTS creation failed for "${word}":`, error.message);
        resolve(false);
      });
    });
  } catch (error) {
    console.error(`❌ Error in generateAndCacheAudio for "${word}":`, error.message);
    return false;
  }
}

async function testAudioGeneration() {
  try {
    console.log('🧪 Тестируем генерацию аудио...');
    
    // Проверяем наличие gtts
    try {
      const gTTS = require('gtts');
      console.log('✅ gTTS module found');
    } catch (error) {
      console.error('❌ gTTS module not found:', error.message);
      console.log('💡 Install with: npm install gtts');
      return;
    }
    
    // Тестируем генерацию аудио для простого слова
    const testWord = 'hello';
    console.log(`🔊 Testing audio generation for: "${testWord}"`);
    
    const result = await generateAndCacheAudio(testWord);
    
    if (result) {
      console.log('✅ Audio generation successful!');
      
      // Проверяем, что аудио действительно сохранилось
      const cached = await prisma.audioCache.findUnique({
        where: { word: testWord.toLowerCase() }
      });
      
      if (cached) {
        console.log('✅ Audio found in cache');
        console.log(`📊 Audio data size: ${cached.audioData.length} bytes`);
      } else {
        console.log('❌ Audio not found in cache after generation');
      }
    } else {
      console.log('❌ Audio generation failed');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testAudioGeneration();
