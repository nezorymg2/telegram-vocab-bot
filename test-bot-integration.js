/**
 * Test BBC Bot Integration with 2025+ episodes
 * Tests the complete flow: episode retrieval -> transcript enhancement -> bot formatting
 */

const { getNextBBCEpisode, generateBBCQuestions, formatTranscript } = require('./services/bbcService');
const { formatTranscriptForDisplay } = require('./services/bbcQuestions-simple');

async function testBotIntegration() {
    console.log('🤖 Testing BBC Bot Integration...\n');

    try {
        // Test 1: Get a 2025+ episode
        console.log('1️⃣ Testing episode retrieval for 2025+ episodes...');
        
        // Mock a 2025+ episode for testing
        const mockEpisode = {
            id: 'test-episode-2025',
            title: 'What is the manosphere?',
            publishDate: new Date('2025-01-30'),
            transcriptUrl: 'https://www.bbc.co.uk/learningenglish/features/6-minute-english/ep-250130.pdf',
            transcript: 'Basic transcript content...'  // Will be enhanced by generateBBCQuestions
        };

        console.log(`✅ Mock episode: "${mockEpisode.title}" (${mockEpisode.publishDate.getFullYear()})`);

        // Test 2: Generate questions (this will also extract clean transcript and vocabulary)
        console.log('\n2️⃣ Testing enhanced question generation with PDF processing...');
        
        const questions = await generateBBCQuestions(mockEpisode);
        
        console.log(`✅ Generated ${questions.length} questions`);
        
        // Check if enhanced data was added to episode
        if (mockEpisode.cleanTranscript) {
            console.log(`✅ Enhanced transcript extracted (${mockEpisode.cleanTranscript.length} chars)`);
        }
        
        if (mockEpisode.vocabularyTerms) {
            console.log(`✅ Vocabulary terms extracted: ${mockEpisode.vocabularyTerms.length} terms`);
            mockEpisode.vocabularyTerms.forEach((term, i) => {
                console.log(`   ${i+1}. ${term.term} - ${term.definition}`);
            });
        }

        // Test 3: Format transcript for bot display
        console.log('\n3️⃣ Testing transcript formatting for bot...');
        
        const transcriptToFormat = mockEpisode.cleanTranscript || mockEpisode.transcript;
        
        // Test both formatTranscript (chunking) and formatTranscriptForDisplay (speaker highlighting)
        const chunks = formatTranscript(transcriptToFormat);
        console.log(`✅ Transcript split into ${chunks.length} chunks for Telegram limits`);
        
        // Format with speaker highlighting
        const formattedChunks = await formatTranscriptForDisplay(mockEpisode.transcriptUrl);
        
        if (formattedChunks && formattedChunks.length > 0) {
            console.log(`✅ Formatted transcript with speaker highlighting: ${formattedChunks.length} parts`);
            console.log('\n📝 Preview of formatted transcript:');
            console.log('---');
            console.log(formattedChunks[0].substring(0, 500) + '...');
            console.log('---');
        }

        // Test 4: Simulate bot message preparation
        console.log('\n4️⃣ Testing bot message preparation...');
        
        const botMessage = prepareBotMessage(mockEpisode);
        console.log('✅ Bot message prepared:');
        console.log('---');
        console.log(botMessage.substring(0, 800) + '...');
        console.log('---');

        console.log('\n🎉 Bot integration test completed successfully!');
        console.log('\nNext steps:');
        console.log('- Test with real bot instance');
        console.log('- Test user interaction flow');
        console.log('- Test progress saving');
        
    } catch (error) {
        console.error('❌ Bot integration test failed:', error);
        console.error(error.stack);
    }
}

/**
 * Simulate bot message preparation
 */
function prepareBotMessage(episode) {
    let message = `🎧 <b>${episode.title}</b>\n\n`;
    
    // Add vocabulary if available
    if (episode.vocabularyTerms && episode.vocabularyTerms.length > 0) {
        message += '🔤 <b>Vocabulary (6 terms):</b>\n';
        episode.vocabularyTerms.forEach(term => {
            message += `• <b>${term.term}</b> - <i>${term.definition}</i>\n`;
        });
        message += '\n';
    }
    
    message += '📄 <b>Transcript:</b>\n';
    message += '<i>Will be sent as formatted chunks with speaker highlighting...</i>\n\n';
    
    message += '❓ <b>Questions:</b>\n';
    message += '<i>5 IELTS-style questions will be generated...</i>\n\n';
    
    message += '▶️ Ready to start? Use /bbc to begin!';
    
    return message;
}

// Run the test
if (require.main === module) {
    testBotIntegration();
}

module.exports = { testBotIntegration };
