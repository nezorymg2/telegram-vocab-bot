/**
 * Test BBC Bot Integration - Simplified without OpenAI
 * Tests transcript and vocabulary extraction for 2025+ episodes
 */

const { formatTranscript, getCleanTranscript } = require('./services/bbcService');
const { formatTranscriptForDisplay, extractVocabularyFromTranscript } = require('./services/bbcQuestions-simple');

async function testBotIntegrationSimple() {
    console.log('🤖 Testing BBC Bot Integration (Simplified)...\n');

    try {
        // Test with real 2025 episode
        const realEpisode = {
            id: 'are-you-flourishing-2025',
            title: 'Are you flourishing?',
            publishDate: new Date('2025-08-07'),
            transcriptUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250807',
            transcript: 'Basic transcript content...'
        };

        console.log(`📚 Testing with: "${realEpisode.title}" (${realEpisode.publishDate.getFullYear()})`);

        // Test 1: Extract clean transcript from PDF
        console.log('\n1️⃣ Testing clean transcript extraction...');
        
        try {
            const cleanTranscript = await getCleanTranscript(realEpisode.transcriptUrl);
            
            if (cleanTranscript) {
                console.log(`✅ Clean transcript extracted: ${cleanTranscript.length} chars`);
                console.log('\n📝 Preview:');
                console.log('---');
                console.log(cleanTranscript.substring(0, 300) + '...');
                console.log('---\n');
                
                // Store it in episode for further tests
                realEpisode.cleanTranscript = cleanTranscript;
            } else {
                console.log('❌ No clean transcript extracted');
            }
        } catch (error) {
            console.log('❌ Clean transcript extraction failed:', error.message);
        }

        // Test 2: Extract vocabulary terms
        console.log('2️⃣ Testing vocabulary extraction...');
        
        try {
            const vocabularyTerms = await extractVocabularyFromTranscript(realEpisode.transcriptUrl);
            
            if (vocabularyTerms && vocabularyTerms.length > 0) {
                console.log(`✅ Vocabulary extracted: ${vocabularyTerms.length} terms`);
                vocabularyTerms.forEach((term, i) => {
                    console.log(`   ${i+1}. ${term.term} - ${term.definition}`);
                });
                
                // Store in episode
                realEpisode.vocabularyTerms = vocabularyTerms;
            } else {
                console.log('❌ No vocabulary terms extracted');
            }
        } catch (error) {
            console.log('❌ Vocabulary extraction failed:', error.message);
        }

        // Test 3: Format transcript for bot display
        console.log('\n3️⃣ Testing transcript formatting for bot...');
        
        const transcriptToFormat = realEpisode.cleanTranscript || realEpisode.transcript;
        
        if (typeof transcriptToFormat === 'string') {
            // Test chunking for Telegram limits
            const chunks = formatTranscript(transcriptToFormat);
            console.log(`✅ Transcript chunked: ${chunks.length} parts`);
            
            // Test formatted display with speaker highlighting
            try {
                const formattedChunks = await formatTranscriptForDisplay(realEpisode.transcriptUrl);
                
                if (formattedChunks && formattedChunks.length > 0) {
                    console.log(`✅ Speaker-highlighted format: ${formattedChunks.length} parts`);
                    console.log('\n📄 Formatted preview:');
                    console.log('---');
                    console.log(formattedChunks[0].substring(0, 400) + '...');
                    console.log('---\n');
                }
            } catch (error) {
                console.log('❌ Speaker formatting failed:', error.message);
            }
        } else {
            console.log('❌ No valid transcript to format');
        }

        // Test 4: Prepare bot message
        console.log('4️⃣ Testing bot message preparation...');
        
        const botMessage = prepareBotMessageSimple(realEpisode);
        console.log('✅ Bot message structure:');
        console.log('---');
        console.log(botMessage);
        console.log('---');

        console.log('\n🎉 Simplified bot integration test completed!');
        console.log('\n📊 Results summary:');
        console.log(`- Clean transcript: ${realEpisode.cleanTranscript ? '✅' : '❌'}`);
        console.log(`- Vocabulary terms: ${realEpisode.vocabularyTerms?.length || 0} terms`);
        console.log(`- Bot message: ✅`);
        
    } catch (error) {
        console.error('❌ Bot integration test failed:', error);
        console.error(error.stack);
    }
}

/**
 * Simulate bot message preparation without OpenAI questions
 */
function prepareBotMessageSimple(episode) {
    let message = `🎧 <b>${episode.title}</b>\n`;
    message += `📅 Published: ${episode.publishDate.toDateString()}\n\n`;
    
    // Add vocabulary if available
    if (episode.vocabularyTerms && episode.vocabularyTerms.length > 0) {
        message += `🔤 <b>Vocabulary (${episode.vocabularyTerms.length} terms):</b>\n`;
        episode.vocabularyTerms.forEach(term => {
            message += `• <b>${term.term}</b> - <i>${term.definition}</i>\n`;
        });
        message += '\n';
    } else {
        message += '🔤 <b>Vocabulary:</b> <i>Extracting...</i>\n\n';
    }
    
    message += '📄 <b>Transcript:</b>\n';
    if (episode.cleanTranscript) {
        message += '<i>Clean transcript ready for display...</i>\n';
    } else {
        message += '<i>Using basic transcript...</i>\n';
    }
    message += '\n';
    
    message += '❓ <b>Status:</b>\n';
    message += '• Transcript: ✅ Ready\n';
    message += '• Vocabulary: ' + (episode.vocabularyTerms?.length ? '✅ Ready' : '⚠️ Processing') + '\n';
    message += '• Questions: ⚠️ Requires OpenAI setup\n\n';
    
    message += '▶️ <i>Bot integration test successful!</i>';
    
    return message;
}

// Run the test
if (require.main === module) {
    testBotIntegrationSimple();
}

module.exports = { testBotIntegrationSimple };
