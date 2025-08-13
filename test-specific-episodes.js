/**
 * Test specific episodes that should have PDFs
 * Based on user info: "What is the manosphere?" and "Can you keep a secret?" have PDFs
 */

const { getCleanTranscript, extractVocabularyFromTranscript } = require('./services/bbcQuestions-simple');

async function testSpecificEpisodes() {
    console.log('🔍 Testing specific episodes that should have PDFs...\n');

    const testEpisodes = [
        {
            title: 'What is the manosphere?',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250130',
            expectedPdfUrl: 'https://downloads.bbc.co.uk/learningenglish/features/6min/250130_6_minute_english_transcript.pdf'
        },
        {
            title: 'Can you keep a secret?',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250123',
            expectedPdfUrl: 'https://downloads.bbc.co.uk/learningenglish/features/6min/250123_6_minute_english_transcript.pdf'
        }
    ];

    for (const episode of testEpisodes) {
        console.log(`📚 Testing: "${episode.title}"`);
        console.log(`🌐 Page: ${episode.pageUrl}`);
        console.log(`📄 Expected PDF: ${episode.expectedPdfUrl}`);

        try {
            // Test 1: Clean transcript extraction
            console.log('\n1️⃣ Testing clean transcript...');
            const cleanTranscript = await getCleanTranscript(episode.pageUrl);
            
            if (cleanTranscript && typeof cleanTranscript === 'string') {
                console.log(`✅ Clean transcript: ${cleanTranscript.length} chars`);
                console.log(`📝 Preview: ${cleanTranscript.substring(0, 200)}...`);
            } else {
                console.log(`❌ No clean transcript extracted`);
            }

            // Test 2: Vocabulary extraction
            console.log('\n2️⃣ Testing vocabulary extraction...');
            const vocabulary = await extractVocabularyFromTranscript(episode.pageUrl);
            
            if (vocabulary && vocabulary.length > 0) {
                console.log(`✅ Vocabulary: ${vocabulary.length} terms`);
                vocabulary.forEach((term, i) => {
                    console.log(`   ${i+1}. ${term.term} - ${term.definition}`);
                });
            } else {
                console.log(`❌ No vocabulary extracted`);
            }

        } catch (error) {
            console.log(`❌ Error testing "${episode.title}": ${error.message}`);
        }

        console.log('\n' + '='.repeat(60) + '\n');
    }

    // Test 3: Also check "The power of humour" that user couldn't find
    console.log('📚 Testing: "The power of humour" (user couldn\'t find this one)');
    
    const possibleHumourUrls = [
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250116',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250109',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english/ep-250116',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english/ep-250109'
    ];

    for (const url of possibleHumourUrls) {
        console.log(`🔍 Checking: ${url}`);
        
        try {
            const transcript = await getCleanTranscript(url);
            if (transcript) {
                console.log(`✅ Found "The power of humour" at: ${url}`);
                console.log(`📝 Preview: ${transcript.substring(0, 200)}...`);
                break;
            }
        } catch (error) {
            console.log(`❌ Not found at: ${url}`);
        }
    }

    console.log('\n🎯 Summary:');
    console.log('• Testing episodes that user confirmed have PDFs');
    console.log('• Checking if "The power of humour" exists somewhere');
    console.log('• Will help determine which episodes to keep/delete');
}

// Run the test
if (require.main === module) {
    testSpecificEpisodes();
}

module.exports = { testSpecificEpisodes };
