const { extractVocabularyFromTranscript } = require('./services/bbcQuestions-simple.js');

async function testVocabularyExtraction() {
    console.log('=== ТЕСТИРУЕМ ТОЛЬКО VOCABULARY EXTRACTION ===');
    
    const transcriptUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250731_6_minute_english_what_is_the_manosphere_transcript.pdf';
    
    try {
        console.log('📄 Extracting vocabulary from transcript...');
        const vocabulary = await extractVocabularyFromTranscript(transcriptUrl);
        
        console.log('\n✅ VOCABULARY RESULTS:');
        console.log(`Found ${vocabulary.length} terms\n`);
        
        vocabulary.forEach((item, index) => {
            console.log(`${index + 1}. ТЕРМИН: "${item.term}"`);
            console.log(`   ОПРЕДЕЛЕНИЕ: "${item.definition}"`);
            console.log('   ────────────────────────────────────────');
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testVocabularyExtraction();
