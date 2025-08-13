const { findWorkingPDFUrl } = require('./services/bbcService');

async function testUniversalParser() {
    try {
        console.log('🔍 Тестируем универсальный парсер...');
        
        const title = "Are plant-based substitutes healthier than meat?";
        const baseEpisodeNumber = "250626"; // From ep-250626 in the URL
        
        console.log(`📝 Title: ${title}`);
        console.log(`📋 Base episode number: ${baseEpisodeNumber}`);
        
        console.log('\n🔍 Ищем worksheet URL...');
        const worksheetUrl = await findWorkingPDFUrl(baseEpisodeNumber, title, 'worksheet');
        
        console.log('\n🔍 Ищем transcript URL...');
        const transcriptUrl = await findWorkingPDFUrl(baseEpisodeNumber, title, 'transcript');
        
        if (worksheetUrl && transcriptUrl) {
            console.log('\n✅ Успешно найдены оба URL!');
            console.log(`📄 Worksheet: ${worksheetUrl}`);
            console.log(`📄 Transcript: ${transcriptUrl}`);
        } else {
            console.log('\n❌ Не удалось найти все URL');
            if (worksheetUrl) console.log(`📄 Worksheet: ${worksheetUrl}`);
            if (transcriptUrl) console.log(`📄 Transcript: ${transcriptUrl}`);
        }
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
    }
}

testUniversalParser();
