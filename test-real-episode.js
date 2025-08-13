/**
 * Test BBC Bot Integration with Real Working Episode
 * Tests with "Do you have eco-anxiety?" from 2023
 */

const { formatTranscript, getCleanTranscript } = require('./services/bbcService');
const { formatTranscriptForDisplay, extractVocabularyFromTranscript } = require('./services/bbcQuestions-simple');

async function testRealWorkingEpisode() {
    console.log('🤖 Testing BBC Bot Integration with REAL Working Episode...\n');

    try {
        // Use the episode that exists and works
        const realEpisode = {
            id: 'eco-anxiety-2023',
            title: 'Do you have eco-anxiety?',
            publishDate: new Date('2023-08-10'),
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2023/ep-230810',
            transcript: 'Basic transcript content...'
        };

        console.log(`📚 Testing with REAL episode: "${realEpisode.title}"`);
        console.log(`📅 Published: ${realEpisode.publishDate.toDateString()}`);
        console.log(`🌐 Page URL: ${realEpisode.pageUrl}\n`);

        // Test 1: Extract vocabulary terms
        console.log('1️⃣ Testing vocabulary extraction with REAL episode...');
        
        try {
            const vocabularyTerms = await extractVocabularyFromTranscript(realEpisode.pageUrl);
            
            if (vocabularyTerms && vocabularyTerms.length > 0) {
                console.log(`✅ Vocabulary extracted: ${vocabularyTerms.length} terms`);
                console.log('\n🔤 Real vocabulary terms:');
                vocabularyTerms.forEach((term, i) => {
                    console.log(`   ${i+1}. ${term.term} - ${term.definition}`);
                });
                
                // Store in episode
                realEpisode.vocabularyTerms = vocabularyTerms;
                console.log(`\n🎯 Successfully got ${vocabularyTerms.length}/6 expected terms!`);
            } else {
                console.log('❌ No vocabulary terms extracted');
            }
        } catch (error) {
            console.log('❌ Vocabulary extraction failed:', error.message);
        }

        // Test 2: Get clean transcript from REAL PDF
        console.log('\n2️⃣ Testing clean transcript extraction with REAL episode...');
        
        try {
            const cleanTranscript = await getCleanTranscript(realEpisode.pageUrl);
            
            if (cleanTranscript && typeof cleanTranscript === 'string' && cleanTranscript.length > 0) {
                console.log(`✅ Clean transcript extracted: ${cleanTranscript.length} chars`);
                console.log('\n📝 Real transcript preview:');
                console.log('---');
                console.log(cleanTranscript.substring(0, 500) + '...');
                console.log('---\n');
                
                // Store it in episode
                realEpisode.cleanTranscript = cleanTranscript;
            } else {
                console.log('❌ No valid clean transcript extracted');
            }
        } catch (error) {
            console.log('❌ Clean transcript extraction failed:', error.message);
        }

        // Test 3: Format transcript for Telegram
        console.log('3️⃣ Testing transcript formatting for Telegram limits...');
        
        const transcriptToFormat = realEpisode.cleanTranscript || realEpisode.transcript;
        
        if (typeof transcriptToFormat === 'string' && transcriptToFormat.length > 0) {
            const chunks = formatTranscript(transcriptToFormat);
            console.log(`✅ Transcript chunked for Telegram: ${chunks.length} parts`);
            
            chunks.forEach((chunk, i) => {
                console.log(`   Part ${i+1}: ${chunk.length} chars`);
            });
        } else {
            console.log('❌ No valid transcript to format');
        }

        // Test 4: Format with speaker highlighting
        console.log('\n4️⃣ Testing speaker highlighting with REAL episode...');
        
        try {
            const formattedChunks = await formatTranscriptForDisplay(realEpisode.pageUrl);
            
            if (formattedChunks && formattedChunks.length > 0) {
                console.log(`✅ Speaker-highlighted format: ${formattedChunks.length} parts`);
                
                formattedChunks.forEach((chunk, i) => {
                    console.log(`   Formatted Part ${i+1}: ${chunk.length} chars`);
                });
                
                console.log('\n📄 Real formatted preview:');
                console.log('---');
                console.log(formattedChunks[0].substring(0, 600) + '...');
                console.log('---\n');
                
                realEpisode.formattedTranscript = formattedChunks;
            } else {
                console.log('❌ No formatted transcript created');
            }
        } catch (error) {
            console.log('❌ Speaker highlighting failed:', error.message);
        }

        // Test 5: Create complete bot message
        console.log('5️⃣ Creating complete bot message for Telegram...');
        
        const botMessage = createCompleteBotMessage(realEpisode);
        console.log('✅ Complete Telegram bot message:');
        console.log('=' .repeat(50));
        console.log(botMessage);
        console.log('=' .repeat(50));

        // Test 6: Simulate actual Telegram workflow
        console.log('\n6️⃣ Simulating actual Telegram bot workflow...');
        
        console.log('\n🤖 Bot would send these messages in sequence:');
        console.log('\n📱 Message 1 (Episode Info + Vocabulary):');
        console.log('-'.repeat(40));
        console.log(botMessage.substring(0, 1000) + '...');
        
        if (realEpisode.formattedTranscript) {
            realEpisode.formattedTranscript.forEach((chunk, i) => {
                console.log(`\n📱 Message ${i+2} (Transcript Part ${i+1}):`);
                console.log('-'.repeat(40));
                console.log(chunk.substring(0, 200) + '...');
                console.log(`[${chunk.length} total characters]`);
            });
        }

        // Test 7: Final summary
        console.log('\n🎉 REAL EPISODE INTEGRATION TEST COMPLETED!\n');
        
        console.log('📊 REAL RESULTS:');
        console.log(`✅ Episode: ${realEpisode.title} (${realEpisode.publishDate.getFullYear()})`);
        console.log(`✅ Vocabulary: ${realEpisode.vocabularyTerms?.length || 0}/6 terms extracted`);
        console.log(`✅ Clean transcript: ${realEpisode.cleanTranscript ? 'Available' : 'N/A'} (${realEpisode.cleanTranscript?.length || 0} chars)`);
        console.log(`✅ Formatted transcript: ${realEpisode.formattedTranscript?.length || 0} parts`);
        console.log(`✅ Bot message: Ready for deployment`);
        
        const totalChars = (realEpisode.formattedTranscript || []).reduce((sum, chunk) => sum + chunk.length, 0);
        console.log(`✅ Total content: ${totalChars} characters across ${(realEpisode.formattedTranscript?.length || 0) + 1} messages`);
        
        if (realEpisode.vocabularyTerms?.length >= 4 && realEpisode.cleanTranscript && realEpisode.formattedTranscript) {
            console.log('\n🏆 INTEGRATION SUCCESS! Ready for bot deployment.');
        } else {
            console.log('\n⚠️  Partial success - some features not working with this episode.');
        }
        
    } catch (error) {
        console.error('❌ Real episode test failed:', error);
        console.error(error.stack);
    }
}

/**
 * Create complete bot message with all available data
 */
function createCompleteBotMessage(episode) {
    let message = `🎧 <b>${episode.title}</b>\n`;
    message += `📅 ${episode.publishDate.toDateString()}\n\n`;
    
    // Add vocabulary section
    if (episode.vocabularyTerms && episode.vocabularyTerms.length > 0) {
        message += `🔤 <b>Key Vocabulary (${episode.vocabularyTerms.length} terms):</b>\n\n`;
        episode.vocabularyTerms.forEach((term, i) => {
            message += `${i+1}. <b>${term.term}</b>\n<i>${term.definition}</i>\n\n`;
        });
    } else {
        message += '🔤 <b>Vocabulary:</b> <i>Processing vocabulary terms...</i>\n\n';
    }
    
    // Add transcript info
    if (episode.cleanTranscript) {
        message += '📄 <b>Transcript:</b> Clean transcript ready\n';
    } else {
        message += '📄 <b>Transcript:</b> Using basic transcript\n';
    }
    
    if (episode.formattedTranscript) {
        message += `📱 <i>Transcript will be sent in ${episode.formattedTranscript.length} formatted parts</i>\n\n`;
    } else {
        message += '📱 <i>Transcript formatting in progress...</i>\n\n';
    }
    
    // Status summary
    message += '🤖 <b>Features Available:</b>\n';
    message += `• Vocabulary extraction: ${episode.vocabularyTerms?.length ? '✅ Ready' : '⚠️ Processing'}\n`;
    message += `• Clean transcript: ${episode.cleanTranscript ? '✅ Ready' : '⚠️ Basic only'}\n`;
    message += `• Speaker formatting: ${episode.formattedTranscript ? '✅ Ready' : '⚠️ Processing'}\n`;
    message += `• IELTS questions: ⚠️ Requires OpenAI\n\n`;
    
    message += '▶️ <i>Reading transcript above, then questions will be generated...</i>';
    
    return message;
}

// Run the test
if (require.main === module) {
    testRealWorkingEpisode();
}

module.exports = { testRealWorkingEpisode };
