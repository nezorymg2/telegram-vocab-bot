const axios = require('axios');

async function findWorkingPattern() {
  console.log('=== ПОИСК РАБОЧЕГО ПАТТЕРНА URL ===');
  
  // Эпизоды из 2025 года, которые наверняка должны иметь PDF
  const testEpisodes = [
    { number: '250110', title: 'resolutions' },
    { number: '250117', title: 'plastic' },
    { number: '250124', title: 'dating' },
    { number: '250131', title: 'memories' },
    { number: '250207', title: 'food' },
    { number: '250214', title: 'love' },
    { number: '250221', title: 'sleep' },
    { number: '250307', title: 'clothes' },
    { number: '250314', title: 'money' },
    { number: '250321', title: 'work' },
    { number: '250328', title: 'health' },
    { number: '250404', title: 'travel' },
    { number: '250411', title: 'books' },
    { number: '250418', title: 'music' },
    { number: '250425', title: 'nature' },
    { number: '250502', title: 'technology' },
    { number: '250509', title: 'language' },
    { number: '250516', title: 'education' },
    { number: '250523', title: 'culture' },
    { number: '250530', title: 'science' },
    { number: '250606', title: 'environment' },
    { number: '250613', title: 'society' },
    { number: '250620', title: 'future' }
  ];
  
  const urlPatterns = [
    'https://downloads.bbc.co.uk/learningenglish/pdf/6minute/{episode}_6min_english_{title}_transcript.pdf',
    'https://downloads.bbc.co.uk/learningenglish/pdf/6minute/{episode}_{title}_transcript.pdf',
    'https://downloads.bbc.co.uk/learningenglish/features/6min/{episode}_6_minute_english_{title}_transcript.pdf',
    'https://downloads.bbc.co.uk/learningenglish/pdf/6minute/{episode}_6min_english_{title}_worksheet.pdf',
    'https://downloads.bbc.co.uk/learningenglish/pdf/6minute/{episode}_{title}_worksheet.pdf'
  ];
  
  let foundPattern = null;
  
  for (const episode of testEpisodes) {
    console.log(`\n🔍 Тестируем эпизод ${episode.number} (${episode.title})...`);
    
    for (const pattern of urlPatterns) {
      const url = pattern.replace('{episode}', episode.number).replace('{title}', episode.title);
      
      try {
        await axios.head(url, { timeout: 5000 });
        console.log(`✅ НАЙДЕН РАБОЧИЙ URL!`);
        console.log(`📋 Паттерн: ${pattern}`);
        console.log(`🔗 URL: ${url}`);
        foundPattern = pattern;
        return foundPattern;
      } catch (error) {
        // Продолжаем поиск
      }
    }
  }
  
  console.log('\n❌ Не удалось найти рабочий паттерн среди тестовых эпизодов');
  console.log('Возможно, BBC изменил структуру URL или PDF больше не доступны');
  
  return null;
}

findWorkingPattern().catch(console.error);
