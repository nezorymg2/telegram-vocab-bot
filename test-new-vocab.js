/**
 * Test New Vocabulary Function
 */

const { extractVocabularyFromEpisode } = require('./services/bbcQuestions-simple');

async function testNewVocabFunction() {
    console.log('🧪 Testing New Vocabulary Function...\n');
    
    const workingUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250731';
    
    console.log(`Testing URL: ${workingUrl}`);
    
    try {
        console.log('🔤 Extracting vocabulary with new function...');
        
        const result = await extractVocabularyFromEpisode(workingUrl);
        
        console.log(`Result type: ${typeof result}`);
        console.log(`Result array: ${Array.isArray(result)}`);
        console.log(`Result length: ${result?.length}`);
        
        if (result && result.length > 0) {
            console.log(`\n✅ SUCCESS! Found ${result.length} terms:`);
            result.forEach((term, i) => {
                console.log(`${i+1}. "${term.term}" - "${term.definition}"`);
            });
            
            // Verify expected terms
            const expectedTerms = ['easy target', 'bravado', 'quote unquote', 'distorted', 'us versus them'];
            console.log('\n🔍 Checking for expected terms:');
            expectedTerms.forEach(expected => {
                const found = result.some(term => 
                    term.term.toLowerCase().includes(expected.toLowerCase()) ||
                    expected.toLowerCase().includes(term.term.toLowerCase())
                );
                console.log(`   ${expected}: ${found ? '✅' : '❌'}`);
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
testNewVocabFunction();
