const axios = require('axios');

async function testSorryURLs() {
    const episodeNumber = '250703';
    const title = 'how_do_you_say_sorry';
    
    const urls = [
        // Одинарное подчеркивание
        `https://downloads.bbc.co.uk/learningenglish/features/6min/${episodeNumber}_6_minute_english_${title}_worksheet.pdf`,
        `https://downloads.bbc.co.uk/learningenglish/features/6min/${episodeNumber}_6_minute_english_${title}_transcript.pdf`,
        
        // Двойное подчеркивание  
        `https://downloads.bbc.co.uk/learningenglish/features/6min/${episodeNumber}_6_minute_english_${title}__worksheet.pdf`,
        `https://downloads.bbc.co.uk/learningenglish/features/6min/${episodeNumber}_6_minute_english_${title}__transcript.pdf`,
    ];
    
    for (const url of urls) {
        try {
            console.log(`🔍 Проверяю: ${url}`);
            const response = await axios.head(url);
            console.log(`✅ НАЙДЕН! Status: ${response.status}`);
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`❌ 404 - не найден`);
            } else {
                console.log(`❌ Ошибка: ${error.message}`);
            }
        }
    }
}

testSorryURLs();
