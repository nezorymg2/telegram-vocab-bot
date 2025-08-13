const { generateBBCQuestions } = require('./services/bbcService');

async function testDeclutterEpisode() {
    try {
        console.log('Testing declutter episode...');
        
        const episode = {
            title: 'Do you need to declutter your home?',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250710'
        };
        
        console.log('Episode:', episode);
        console.log('Title length:', episode.title.length);
        console.log('Has question mark:', episode.title.includes('?'));
        console.log('Word count:', episode.title.split(' ').length);
        
        const result = await generateBBCQuestions(episode);
        
        console.log('Result:', {
            hasQuestions: !!result.questions,
            questionsLength: result.questions ? result.questions.length : 0,
            enhanced: result.enhanced,
            hasVocabulary: !!result.vocabulary,
            vocabularyLength: result.vocabulary ? result.vocabulary.length : 0,
        });
        
        if (result.questions && result.questions.length > 0) {
            console.log('\n=== SUCCESS! QUESTIONS FOUND ===');
            result.questions.forEach((q, i) => {
                console.log(`${i + 1}. ${q.question.substring(0, 60)}...`);
                console.log(`   Correct: ${q.correct_answer}`);
            });
        } else {
            console.log('\n❌ No questions found');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testDeclutterEpisode();
