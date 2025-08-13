/**
 * Simple Vocabulary Test
 * Direct test of vocabulary extraction with working URL
 */

const { extractVocabularyFromTranscript } = require('./services/bbcQuestions-simple');

async function simpleVocabTest() {
    console.log('🧪 Simple Vocabulary Test...\n');
    
    const workingUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250731';
    
    console.log(`Testing URL: ${workingUrl}`);
    
    try {
        console.log('🔤 Extracting vocabulary...');
        
        const result = await extractVocabularyFromTranscript(workingUrl);
        
        console.log(`Result type: ${typeof result}`);
        console.log(`Result array: ${Array.isArray(result)}`);
        console.log(`Result length: ${result?.length}`);
        
        if (result && result.length > 0) {
            console.log(`\n✅ SUCCESS! Found ${result.length} terms:`);
            result.forEach((term, i) => {
                console.log(`${i+1}. "${term.term}" - "${term.definition}"`);
            });
        } else {
            console.log('\n❌ No vocabulary found');
            console.log(`Raw result:`, result);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run immediately
simpleVocabTest();
