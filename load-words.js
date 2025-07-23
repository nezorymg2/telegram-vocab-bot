const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function loadWordsFromOxford() {
  try {
    console.log('🔄 Загружаем слова из oxford3000.json...');
    
    // Читаем файл
    const data = fs.readFileSync('./oxford3000.json', 'utf8');
    const words = JSON.parse(data);
    
    console.log(`📚 Найдено ${words.length} слов для загрузки`);
    
    // Очищаем базу данных (опционально)
    console.log('🗑️ Очищаем существующие слова...');
    await prisma.word.deleteMany();
    
    // Загружаем слова пачками
    const batchSize = 100;
    let loaded = 0;
    
    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, i + batchSize);
      
      await prisma.word.createMany({
        data: batch.map(item => ({
          word: item.word,
          translation: item.translation,
          section: item.section || 'Разное'
        }))
      });
      
      loaded += batch.length;
      console.log(`✅ Загружено ${loaded}/${words.length} слов`);
    }
    
    console.log('🎉 Все слова успешно загружены!');
    
    // Проверяем результат
    const totalWords = await prisma.word.count();
    console.log(`📊 Всего слов в базе: ${totalWords}`);
    
  } catch (error) {
    console.error('❌ Ошибка при загрузке слов:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем загрузку
loadWordsFromOxford();
