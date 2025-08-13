/**
 * Debug URL Construction
 */

async function debugURLConstruction() {
    console.log('🔍 Debug URL Construction...\n');
    
    const episodeUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250731';
    
    // Test URL parts extraction
    const urlParts = episodeUrl.match(/ep-(\d{6})/);
    console.log('URL parts:', urlParts);
    
    if (urlParts) {
        const episodeId = urlParts[1];
        console.log('Episode ID:', episodeId);
        
        // Check if this matches the manosphere episode
        if (episodeId === '250731') {
            console.log('✅ This is the manosphere episode!');
            const expectedUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250731_6_minute_english_what_is_the_manosphere_transcript.pdf';
            console.log('Expected URL:', expectedUrl);
            
            // Test the URL directly
            const axios = require('axios');
            try {
                console.log('\n🧪 Testing direct URL access...');
                const response = await axios.head(expectedUrl);
                console.log(`✅ URL accessible: ${response.status}`);
            } catch (error) {
                console.log(`❌ URL test failed: ${error.message}`);
            }
        }
    }
    
    // Now test the actual function
    const { extractVocabularyFromTranscript } = require('./services/bbcQuestions-simple');
    
    console.log('\n🧪 Testing extractVocabularyFromTranscript function...');
    
    try {
        const result = await extractVocabularyFromTranscript(episodeUrl);
        console.log('Function result:', result.length, 'terms');
        
        if (result.length > 0) {
            console.log('Terms found:');
            result.forEach((term, i) => {
                console.log(`  ${i+1}. ${term.term} - ${term.definition}`);
            });
        }
    } catch (error) {
        console.error('Function error:', error.message);
    }
}

debugURLConstruction();
