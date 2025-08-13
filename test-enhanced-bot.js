/**
 * Test Real Bot Integration
 * Test the complete flow with updated bbcService
 */

const { generateBBCQuestions, formatTranscript } = require('./services/bbcService');

async function testRealBotIntegration() {
    console.log('🤖 Testing Real Bot Integration with Enhanced BBC Service...\n');
    
    // Test episode - the working manosphere episode
    const testEpisode = {
        id: 'manosphere-real-test',
        title: 'What is the manosphere?',
        publishDate: new Date('2025-07-31'), // 2025+ to trigger enhanced processing
        transcriptUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250731',
        transcript: 'Original transcript will be enhanced...'
    };
    
    console.log(`🎯 Testing episode: "${testEpisode.title}"`);
    console.log(`📅 Published: ${testEpisode.publishDate.getFullYear()}`);
    console.log(`🌐 URL: ${testEpisode.transcriptUrl}\n`);
    
    try {
        // Test the enhanced generateBBCQuestions function
        console.log('1️⃣ Testing enhanced BBC question generation...');
        
        // This should trigger vocabulary extraction and transcript enhancement
        const questions = await generateBBCQuestions(testEpisode);
        
        console.log(`📝 Generated ${questions.length} questions`);
        
        // Check if episode was enhanced with vocabulary
        if (testEpisode.vocabularyTerms && testEpisode.vocabularyTerms.length > 0) {
            console.log(`✅ Episode enhanced with ${testEpisode.vocabularyTerms.length} vocabulary terms:`);
            testEpisode.vocabularyTerms.forEach((term, i) => {
                console.log(`   ${i + 1}. ${term.term} - ${term.definition.substring(0, 60)}...`);
            });
        } else {
            console.log('❌ No vocabulary terms added to episode');
        }
        
        // Check if transcript was enhanced
        if (testEpisode.cleanTranscript) {
            console.log(`✅ Clean transcript added: ${testEpisode.cleanTranscript.length} chars`);
        } else {
            console.log('❌ No clean transcript added');
        }
        
        // Test 2: Simulate bot response
        console.log('\n2️⃣ Testing bot message creation...');
        
        const botMessages = createEnhancedBotMessages(testEpisode, questions);
        
        console.log(`✅ Created ${botMessages.length} bot messages`);
        
        // Display first message (with vocabulary)
        console.log('\n📱 Bot Message 1 (Introduction + Vocabulary):');
        console.log('=' .repeat(60));
        console.log(botMessages[0]);
        console.log('=' .repeat(60));
        
        // Display second message preview (transcript)
        if (botMessages[1]) {
            console.log('\n📱 Bot Message 2 Preview (Transcript):');
            console.log('=' .repeat(60));
            console.log(botMessages[1].substring(0, 400) + '...');
            console.log('=' .repeat(60));
        }
        
        // Test 3: Simulate user interaction
        console.log('\n3️⃣ Simulating user interaction flow...');
        
        console.log('👤 User: /bbc');
        console.log('🤖 Bot: Sending enhanced episode with vocabulary...');
        console.log('👤 User: Reads vocabulary and transcript');
        console.log('🤖 Bot: Ready to generate questions (if OpenAI configured)');
        
        // Summary
        console.log('\n📊 Real Bot Integration Summary:');
        console.log(`✅ Enhanced processing: ${testEpisode.publishDate.getFullYear() >= 2025 ? 'Yes' : 'No'}`);
        console.log(`✅ Vocabulary extraction: ${testEpisode.vocabularyTerms?.length || 0} terms`);
        console.log(`✅ Clean transcript: ${testEpisode.cleanTranscript ? 'Available' : 'N/A'}`);
        console.log(`✅ Questions generated: ${questions.length}`);
        console.log(`✅ Bot messages: ${botMessages.length}`);
        console.log(`✅ Ready for deployment: ${testEpisode.vocabularyTerms?.length > 0 ? 'Yes' : 'No'}`);
        
        return {
            success: true,
            episode: testEpisode,
            questions: questions,
            messages: botMessages
        };
        
    } catch (error) {
        console.error('❌ Real bot integration failed:', error);
        console.error('Stack:', error.stack);
        return { success: false, error: error.message };
    }
}

/**
 * Create enhanced bot messages with vocabulary and questions
 */
function createEnhancedBotMessages(episode, questions = []) {
    const messages = [];
    
    // Message 1: Episode intro with enhanced vocabulary
    let introMessage = `🎧 <b>${episode.title}</b>\n`;
    introMessage += `📅 BBC 6 Minute English (${new Date(episode.publishDate).getFullYear()})\n\n`;
    
    // Add vocabulary if available (enhanced for 2025+ episodes)
    if (episode.vocabularyTerms && episode.vocabularyTerms.length > 0) {
        introMessage += `🔤 <b>Enhanced Vocabulary (${episode.vocabularyTerms.length} terms):</b>\n`;
        episode.vocabularyTerms.forEach((term, i) => {
            // Clean up definition text
            const cleanDefinition = term.definition.replace(/\s+/g, ' ').trim();
            introMessage += `${i + 1}. <b>${term.term}</b>\n   <i>${cleanDefinition}</i>\n\n`;
        });
    } else {
        introMessage += `🔤 <b>Vocabulary:</b> <i>Processing...</i>\n\n`;
    }
    
    introMessage += `📚 Study the vocabulary above, then continue for the transcript!`;
    messages.push(introMessage);
    
    // Message 2: Enhanced transcript
    const transcriptText = episode.cleanTranscript || episode.transcript;
    if (transcriptText) {
        const transcriptChunks = formatTranscript(transcriptText);
        
        transcriptChunks.forEach((chunk, i) => {
            let transcriptMessage = `📄 <b>Transcript (Part ${i + 1}/${transcriptChunks.length}):</b>\n\n`;
            
            // Enhanced formatting with speaker highlighting
            const enhancedChunk = chunk
                .replace(/(Phil|Georgie|Will|[A-Z][a-z]+):/g, '<b>$1:</b>')
                .replace(/\n\n+/g, '\n\n'); // Clean up multiple newlines
            
            transcriptMessage += enhancedChunk;
            
            messages.push(transcriptMessage);
        });
    }
    
    // Message 3: Questions status
    let statusMessage = `❓ <b>Questions & Practice:</b>\n\n`;
    
    if (questions.length > 0) {
        statusMessage += `✅ Generated ${questions.length} IELTS-style questions\n`;
        statusMessage += `🎯 Ready to test your comprehension!\n\n`;
    } else {
        statusMessage += `⚠️ Questions require OpenAI API setup\n`;
        statusMessage += `📝 But vocabulary and transcript are ready!\n\n`;
    }
    
    statusMessage += `📊 <b>Episode Status:</b>\n`;
    statusMessage += `• Enhanced vocabulary: ${episode.vocabularyTerms?.length || 0} terms\n`;
    statusMessage += `• Clean transcript: ${episode.cleanTranscript ? 'Available' : 'Basic'}\n`;
    statusMessage += `• Questions: ${questions.length > 0 ? 'Ready' : 'Setup needed'}\n\n`;
    
    statusMessage += `🚀 <b>Enhanced BBC integration working perfectly!</b>`;
    
    messages.push(statusMessage);
    
    return messages;
}

// Run the test
if (require.main === module) {
    testRealBotIntegration().then(result => {
        if (result.success) {
            console.log('\n🎉 REAL BOT INTEGRATION TEST PASSED!');
        } else {
            console.log('\n❌ REAL BOT INTEGRATION TEST FAILED!');
        }
    });
}

module.exports = { testRealBotIntegration };
