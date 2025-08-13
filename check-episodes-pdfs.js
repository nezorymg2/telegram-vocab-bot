/**
 * Find and test all episodes up to "Can you keep a secret?"
 * Check which ones have PDF files and quizzes
 */

const { extractVocabularyFromTranscript, getCleanTranscript } = require('./services/bbcQuestions-simple');

// List of recent episodes to check (up to "Can you keep a secret?")
const episodesToCheck = [
    {
        title: "What is the manosphere?",
        date: "2025-01-30",
        pageUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250130"
    },
    {
        title: "Personalised diets",
        date: "2025-01-23", 
        pageUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250123"
    },
    {
        title: "Saving the white rhino",
        date: "2025-01-16",
        pageUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250116"
    },
    {
        title: "The power of humour",
        date: "2025-01-09",
        pageUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250109"
    },
    {
        title: "Can you keep a secret?",
        date: "2025-01-02",
        pageUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250102"
    },
    // Add more episodes from late 2024 if needed
    {
        title: "The life of an influencer",
        date: "2024-12-26",
        pageUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241226"
    },
    {
        title: "Could there be a room-temperature superconductor?",
        date: "2024-12-19",
        pageUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241219"
    }
];

async function checkEpisodesForPDFsAndQuizzes() {
    console.log('🔍 Checking episodes up to "Can you keep a secret?" for PDF files and quizzes...\n');
    
    const workingEpisodes = [];
    const nonWorkingEpisodes = [];
    
    for (let i = 0; i < episodesToCheck.length; i++) {
        const episode = episodesToCheck[i];
        console.log(`\n📚 [${i+1}/${episodesToCheck.length}] Testing: "${episode.title}"`);
        console.log(`📅 Date: ${episode.date}`);
        console.log(`🌐 URL: ${episode.pageUrl}`);
        
        let hasVocabulary = false;
        let hasTranscript = false;
        let vocabularyCount = 0;
        
        // Test vocabulary extraction
        try {
            console.log('   🔤 Testing vocabulary extraction...');
            const vocabularyTerms = await extractVocabularyFromTranscript(episode.pageUrl);
            
            if (vocabularyTerms && vocabularyTerms.length > 0) {
                hasVocabulary = true;
                vocabularyCount = vocabularyTerms.length;
                console.log(`   ✅ Vocabulary: ${vocabularyCount} terms found`);
                
                // Show first few terms
                vocabularyTerms.slice(0, 3).forEach((term, idx) => {
                    console.log(`      ${idx+1}. ${term.term} - ${term.definition.substring(0, 50)}...`);
                });
            } else {
                console.log(`   ❌ Vocabulary: No terms found`);
            }
        } catch (error) {
            console.log(`   ❌ Vocabulary: Error - ${error.message.substring(0, 100)}`);
        }
        
        // Test transcript extraction
        try {
            console.log('   📄 Testing transcript extraction...');
            const cleanTranscript = await getCleanTranscript(episode.pageUrl);
            
            if (cleanTranscript && typeof cleanTranscript === 'string' && cleanTranscript.length > 100) {
                hasTranscript = true;
                console.log(`   ✅ Transcript: ${cleanTranscript.length} characters`);
            } else {
                console.log(`   ❌ Transcript: No clean transcript found`);
            }
        } catch (error) {
            console.log(`   ❌ Transcript: Error - ${error.message.substring(0, 100)}`);
        }
        
        // Categorize episode
        const episodeResult = {
            ...episode,
            hasVocabulary,
            hasTranscript,
            vocabularyCount,
            isWorking: hasVocabulary && hasTranscript && vocabularyCount >= 6
        };
        
        if (episodeResult.isWorking) {
            workingEpisodes.push(episodeResult);
            console.log(`   🎯 WORKING: Has PDF and ${vocabularyCount} vocabulary terms`);
        } else {
            nonWorkingEpisodes.push(episodeResult);
            console.log(`   ⚠️ INCOMPLETE: Missing PDF or insufficient vocabulary`);
        }
        
        // Stop at "Can you keep a secret?" if that's our cutoff
        if (episode.title === "Can you keep a secret?") {
            console.log(`\n🎯 Reached cutoff episode: "${episode.title}"`);
            break;
        }
        
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Summary report
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n✅ WORKING EPISODES (${workingEpisodes.length}):`);
    workingEpisodes.forEach((ep, i) => {
        console.log(`${i+1}. "${ep.title}" (${ep.date}) - ${ep.vocabularyCount} terms`);
    });
    
    console.log(`\n❌ NON-WORKING EPISODES (${nonWorkingEpisodes.length}):`);
    nonWorkingEpisodes.forEach((ep, i) => {
        console.log(`${i+1}. "${ep.title}" (${ep.date}) - ${ep.hasVocabulary ? 'Has vocab' : 'No vocab'}, ${ep.hasTranscript ? 'Has transcript' : 'No transcript'}`);
    });
    
    console.log('\n🗑️ EPISODES TO DELETE:');
    const episodesToDelete = nonWorkingEpisodes.filter(ep => !ep.hasVocabulary || ep.vocabularyCount < 6);
    episodesToDelete.forEach((ep, i) => {
        console.log(`${i+1}. "${ep.title}" (${ep.date}) - Reason: ${!ep.hasVocabulary ? 'No vocabulary' : 'Insufficient vocabulary'}`);
    });
    
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log(`- Keep ${workingEpisodes.length} working episodes`);
    console.log(`- Delete ${episodesToDelete.length} non-working episodes`);
    console.log('- Focus bot development on working episodes only');
    
    return {
        working: workingEpisodes,
        nonWorking: nonWorkingEpisodes,
        toDelete: episodesToDelete
    };
}

// Run the check
if (require.main === module) {
    checkEpisodesForPDFsAndQuizzes()
        .then(() => {
            console.log('\n✅ Episode check completed!');
        })
        .catch(error => {
            console.error('\n❌ Episode check failed:', error);
        });
}

module.exports = { checkEpisodesForPDFsAndQuizzes };
