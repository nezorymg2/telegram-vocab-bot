const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

// Импортируем функции из bot.js (упрощенные версии)
const fs = require('fs');
const path = require('path');

async function getAudioFromCache(word) {
  try {
    const cached = await prisma.audioCache.findUnique({
      where: { word: word.toLowerCase() }
    });
    
    if (cached) {
      console.log(`📼 Found cached audio for: "${word}"`);
      return cached.audioData;
    } else {
      console.log(`📼 No cached audio for: "${word}"`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Failed to get cached audio for "${word}":`, error.message);
    return null;
  }
}

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
            
            console.log(`✅ Audio cached for: "${word}" (${audioBuffer.length} bytes)`);
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

async function sendWordAudio(word) {
  try {
    // Проверяем, что слово содержит английские символы
    if (!/[a-zA-Z]/.test(word)) {
      console.log(`🚫 Skipping audio for non-English word: "${word}"`);
      return false;
    }
    
    const audioBuffer = await getAudioFromCache(word);
    if (!audioBuffer) {
      console.log(`🔇 No audio available for: "${word}"`);
      return false;
    }
    
    // Создаем временный файл для отправки (симуляция)
    const tempFileName = `audio_${Date.now()}_${word.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
    const tempFilePath = path.join(__dirname, 'temp', tempFileName);
    
    // Создаем папку temp если не существует
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Записываем файл
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    console.log(`🔊 Audio file created: ${tempFileName} (${audioBuffer.length} bytes)`);
    
    // Удаляем временный файл
    fs.unlinkSync(tempFilePath);
    
    console.log(`🔊 Audio simulation successful for: "${word}"`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send audio for "${word}":`, error.message);
    return false;
  }
}

async function testQuizAudio() {
  try {
    console.log('🧪 Тестируем аудио в викторине...\n');
    
    // Получаем некоторые слова из базы данных
    const words = await prisma.word.findMany({ 
      take: 5,
      select: { word: true, translation: true }
    });
    
    if (words.length === 0) {
      console.log('❌ Нет слов в базе данных для тестирования');
      return;
    }
    
    console.log(`📚 Найдено ${words.length} слов для тестирования:\n`);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      console.log(`--- Тест ${i + 1}/5: "${word.word}" ---`);
      
      // Генерируем аудио если его нет
      const audioGenerated = await generateAndCacheAudio(word.word);
      
      if (audioGenerated) {
        // Пытаемся отправить аудио
        const audioSent = await sendWordAudio(word.word);
        if (audioSent) {
          console.log(`✅ Аудио успешно "отправлено" для "${word.word}"`);
        } else {
          console.log(`❌ Не удалось "отправить" аудио для "${word.word}"`);
        }
      } else {
        console.log(`❌ Не удалось сгенерировать аудио для "${word.word}"`);
      }
      
      console.log(''); // Пустая строка для разделения
    }
    
    // Проверяем общее количество аудио в кеше
    const audioCount = await prisma.audioCache.count();
    console.log(`📊 Итого аудио в кеше: ${audioCount}`);
    
  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testQuizAudio();
