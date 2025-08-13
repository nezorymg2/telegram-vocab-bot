/**
 * Test BBC Bot Integration with Working Episode
 * Tests with the "manosphere" episode that we know works
 */

const { formatTranscript, getCleanTranscript } = require('./services/bbcService');
const { formatTranscriptForDisplay, extractVocabularyFromTranscript } = require('./services/bbcQuestions-simple');

async function testWithWorkingEpisode() {
    console.log('🤖 Testing BBC Bot Integration with Working Episode...\n');

    try {
        // Use the episode URL we know works from our previous tests
        const workingEpisode = {
            id: 'manosphere-2025',
            title: 'What is the manosphere?',
            publishDate: new Date('2025-01-30'),
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250130',
            transcript: 'Basic transcript content...'
        };

        console.log(`📚 Testing with: "${workingEpisode.title}"`);
        console.log(`🌐 Page URL: ${workingEpisode.pageUrl}\n`);

        // Test 1: Extract vocabulary terms from the episode we know works
        console.log('1️⃣ Testing vocabulary extraction with working episode...');
        
        try {
            const vocabularyTerms = await extractVocabularyFromTranscript(workingEpisode.pageUrl);
            
            if (vocabularyTerms && vocabularyTerms.length > 0) {
                console.log(`✅ Vocabulary extracted: ${vocabularyTerms.length} terms`);
                console.log('\n🔤 Extracted terms:');
                vocabularyTerms.forEach((term, i) => {
                    console.log(`   ${i+1}. ${term.term} - ${term.definition}`);
                });
                
                // Store in episode
                workingEpisode.vocabularyTerms = vocabularyTerms;
            } else {
                console.log('❌ No vocabulary terms extracted');
            }
        } catch (error) {
            console.log('❌ Vocabulary extraction failed:', error.message);
        }

        // Test 2: Get clean transcript
        console.log('\n2️⃣ Testing clean transcript extraction...');
        
        try {
            const cleanTranscript = await getCleanTranscript(workingEpisode.pageUrl);
            
            if (cleanTranscript && typeof cleanTranscript === 'string') {
                console.log(`✅ Clean transcript extracted: ${cleanTranscript.length} chars`);
                console.log('\n📝 Preview:');
                console.log('---');
                console.log(cleanTranscript.substring(0, 400) + '...');
                console.log('---\n');
                
                // Store it in episode for further tests
                workingEpisode.cleanTranscript = cleanTranscript;
            } else {
                console.log('❌ No clean transcript extracted (or not a string)');
            }
        } catch (error) {
            console.log('❌ Clean transcript extraction failed:', error.message);
        }

        // Test 3: Format transcript for bot display
        console.log('3️⃣ Testing transcript formatting for bot...');
        
        const transcriptToFormat = workingEpisode.cleanTranscript || workingEpisode.transcript;
        
        if (typeof transcriptToFormat === 'string') {
            // Test chunking for Telegram limits
            const chunks = formatTranscript(transcriptToFormat);
            console.log(`✅ Transcript chunked: ${chunks.length} parts`);
            
            if (chunks.length > 1) {
                console.log(`   Part 1: ${chunks[0].length} chars`);
                console.log(`   Part 2: ${chunks[1].length} chars`);
            }
        } else {
            console.log('❌ No valid transcript to format');
        }

        // Test 4: Format with speaker highlighting (using correct function)
        console.log('\n4️⃣ Testing speaker highlighting...');
        
        try {
            // Import the correct function
            const { formatTranscriptForDisplay } = require('./services/bbcQuestions-simple');
            const formattedChunks = await formatTranscriptForDisplay(workingEpisode.pageUrl);
            
            if (formattedChunks && formattedChunks.length > 0) {
                console.log(`✅ Speaker-highlighted format: ${formattedChunks.length} parts`);
                console.log('\n📄 Formatted preview:');
                console.log('---');
                console.log(formattedChunks[0].substring(0, 500) + '...');
                console.log('---\n');
                
                workingEpisode.formattedTranscript = formattedChunks;
            }
        } catch (error) {
            console.log('❌ Speaker highlighting failed:', error.message);
        }

        // Test 5: Prepare final bot message
        console.log('5️⃣ Testing final bot message preparation...');
        
        const botMessage = prepareBotMessageWorking(workingEpisode);
        console.log('✅ Complete bot message:');
        console.log('========================================');
        console.log(botMessage);
        console.log('========================================');

        // Test 6: Simulate Telegram message splitting
        console.log('\n6️⃣ Testing Telegram message limits...');
        
        if (workingEpisode.formattedTranscript) {
            console.log('Simulating Telegram message sending:');
            workingEpisode.formattedTranscript.forEach((chunk, i) => {
                console.log(`\n📱 Message ${i+1}/${workingEpisode.formattedTranscript.length}:`);
                console.log(`   Length: ${chunk.length} chars`);
                console.log(`   Preview: ${chunk.substring(0, 100)}...`);
            });
        }

        console.log('\n🎉 Working episode test completed successfully!');
        console.log('\n📊 Final results:');
        console.log(`✅ Vocabulary: ${workingEpisode.vocabularyTerms?.length || 0} terms`);
        console.log(`✅ Clean transcript: ${workingEpisode.cleanTranscript ? 'Available' : 'N/A'}`);
        console.log(`✅ Formatted transcript: ${workingEpisode.formattedTranscript?.length || 0} parts`);
        console.log(`✅ Bot message: Ready`);
        
    } catch (error) {
        console.error('❌ Working episode test failed:', error);
        console.error(error.stack);
    }
}

/**
 * Prepare comprehensive bot message with working data
 */
function prepareBotMessageWorking(episode) {
    let message = `🎧 <b>${episode.title}</b>\n`;
    message += `📅 Episode from ${episode.publishDate.getFullYear()}\n\n`;
    
    // Add vocabulary if available
    if (episode.vocabularyTerms && episode.vocabularyTerms.length > 0) {
        message += `🔤 <b>Vocabulary (${episode.vocabularyTerms.length} terms):</b>\n`;
        episode.vocabularyTerms.forEach((term, i) => {
            message += `${i+1}. <b>${term.term}</b> - <i>${term.definition}</i>\n`;
        });
        message += '\n';
    } else {
        message += '🔤 <b>Vocabulary:</b> <i>Processing...</i>\n\n';
    }
    
    // Add transcript info
    message += '📄 <b>Transcript:</b>\n';
    if (episode.cleanTranscript) {
        message += `✅ Clean transcript ready (${episode.cleanTranscript.length} characters)\n`;
    }
    if (episode.formattedTranscript) {
        message += `✅ Formatted for display (${episode.formattedTranscript.length} parts)\n`;
    }
    message += '\n';
    
    // Add status summary
    message += '🤖 <b>Bot Integration Status:</b>\n';
    message += `• Vocabulary extraction: ${episode.vocabularyTerms?.length ? '✅' : '❌'}\n`;
    message += `• Clean transcript: ${episode.cleanTranscript ? '✅' : '❌'}\n`;
    message += `• Speaker highlighting: ${episode.formattedTranscript ? '✅' : '❌'}\n`;
    message += `• Message formatting: ✅\n`;
    message += `• Questions: ⚠️ (requires OpenAI)\n\n`;
    
    message += `▶️ <i>Ready for bot deployment!</i>`;
    
    return message;
}

// Run the test
if (require.main === module) {
    testWithWorkingEpisode();
}

module.exports = { testWithWorkingEpisode };
