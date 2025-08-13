/**
 * Test Manosphere Episode Vocabulary Extraction
 * This episode should have the 6 terms mentioned by user
 */

const { extractVocabularyFromTranscript, getCleanTranscript } = require('./services/bbcQuestions-simple');

async function testManosphereEpisode() {
    console.log('🧪 Testing Manosphere Episode Vocabulary Extraction...\n');
    
    // URL that should work for the manosphere episode
    const manosphereUrl = 'https://www.bbc.co.uk/learningenglish/features/6-minute-english/ep-250807';
    
    console.log(`📄 Episode URL: ${manosphereUrl}`);
    console.log('Expected vocabulary terms:');
    console.log('1. easy target - someone who is vulnerable or easily taken advantage of');
    console.log('2. bravado - show of bravery or confidence to impress other people');
    console.log('3. quote unquote - used to show you are repeating someone else\'s words');
    console.log('4. distorted - changed and misshapen so that it looks strange');
    console.log('5. us versus them - phrase used to show hostility between opposing groups');
    console.log('6. paint everyone with the same brush - unfairly think that everyone has same bad qualities');
    console.log('\n--- TESTING ---\n');
    
    try {
        // Test vocabulary extraction
        console.log('1️⃣ Extracting vocabulary...');
        const vocabularyTerms = await extractVocabularyFromTranscript(manosphereUrl);
        
        if (vocabularyTerms && vocabularyTerms.length > 0) {
            console.log(`✅ SUCCESS! Found ${vocabularyTerms.length} terms:\n`);
            
            vocabularyTerms.forEach((term, i) => {
                console.log(`${i+1}. ${term.term}`);
                console.log(`   Definition: ${term.definition}\n`);
            });
            
            // Check if we got the expected terms
            const expectedTerms = ['easy target', 'bravado', 'quote unquote', 'distorted', 'us versus them', 'paint everyone with the same brush'];
            
            console.log('🔍 Checking for expected terms:');
            expectedTerms.forEach(expected => {
                const found = vocabularyTerms.some(term => 
                    term.term.toLowerCase().includes(expected.toLowerCase()) ||
                    expected.toLowerCase().includes(term.term.toLowerCase())
                );
                console.log(`   ${expected}: ${found ? '✅' : '❌'}`);
            });
            
        } else {
            console.log('❌ No vocabulary terms extracted');
        }
        
        // Test clean transcript
        console.log('\n2️⃣ Testing clean transcript...');
        const cleanTranscript = await getCleanTranscript(manosphereUrl);
        
        if (cleanTranscript) {
            console.log(`✅ Clean transcript extracted: ${cleanTranscript.length} characters`);
            
            // Check if transcript contains expected terms
            const expectedInTranscript = ['easy target', 'bravado', 'manosphere'];
            console.log('\n🔍 Checking transcript content:');
            expectedInTranscript.forEach(term => {
                const found = cleanTranscript.toLowerCase().includes(term.toLowerCase());
                console.log(`   Contains "${term}": ${found ? '✅' : '❌'}`);
            });
            
        } else {
            console.log('❌ No clean transcript extracted');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Full error:', error);
    }
}

// Run the test
if (require.main === module) {
    testManosphereEpisode();
}

module.exports = { testManosphereEpisode };
