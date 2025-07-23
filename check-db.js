const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Проверяем подключение к базе данных...');
    
    // Проверяем подключение
    await prisma.$connect();
    console.log('✅ Подключение к PostgreSQL успешно');
    
    // Считаем количество слов
    const totalWords = await prisma.word.count();
    console.log(`📊 Всего слов в базе: ${totalWords}`);
    
    // Показываем первые 10 слов
    if (totalWords > 0) {
      console.log('\n📚 Первые 10 слов из базы:');
      const words = await prisma.word.findMany({
        take: 10,
        select: {
          id: true,
          word: true,
          translation: true,
          section: true
        }
      });
      
      words.forEach((word, index) => {
        console.log(`${index + 1}. ${word.word} - ${word.translation} (${word.section})`);
      });
    } else {
      console.log('❌ База данных пуста');
    }
    
    // Показываем разделы
    const sections = await prisma.word.findMany({
      select: { section: true },
      distinct: ['section']
    });
    console.log(`\n📂 Разделы в базе: ${sections.map(s => s.section).join(', ')}`);
    
  } catch (error) {
    console.error('❌ Ошибка при проверке базы данных:', error);
    console.error('Детали:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
