const { formatTranscriptForDisplay, fetchPDF } = require('./services/bbcQuestions-simple');

async function testTranscript() {
    try {
        console.log('🔍 Тестируем улучшенный транскрипт...');
        
        const transcriptUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250626_6_minute_english_are_plant_based_substitutes_healthier_than_meat_transcript.pdf';
        
        console.log('📄 Загружаю PDF...');
        const content = await fetchPDF(transcriptUrl);
        
        console.log('🔄 Форматирую транскрипт...');
        const transcript = formatTranscriptForDisplay(content);
        
        if (transcript) {
            console.log('✅ Транскрипт получен, длина:', transcript.length, 'символов');
            console.log('\n📜 Первые 500 символов:');
            console.log(transcript.substring(0, 500) + '...');
            console.log('\n📜 Последние 300 символов:');
            console.log('...' + transcript.substring(transcript.length - 300));
        } else {
            console.log('❌ Не удалось отформатировать транскрипт');
        }
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании транскрипта:', error.message);
    }
}

testTranscript();
