const { generateBBCQuestions } = require('./services/bbcService');

async function testWildBees() {
    try {
        console.log('Testing wild bees episode...');
        
        const episode = {
            title: 'How can we help wild bees?',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250717'
        };
        
        console.log('Episode:', episode);
        
        const result = await generateBBCQuestions(episode);
        
        console.log('Result:', {
            hasQuestions: !!result.questions,
            questionsLength: result.questions ? result.questions.length : 0,
            enhanced: result.enhanced,
            hasVocabulary: !!result.vocabulary,
            vocabularyLength: result.vocabulary ? result.vocabulary.length : 0,
            hasTranscript: !!result.transcript,
            questions: result.questions
        });
        
        if (result.questions && result.questions.length > 0) {
            console.log('\n=== QUESTIONS ===');
            result.questions.forEach((q, i) => {
                console.log(`${i + 1}. ${q.question}`);
                if (q.options) {
                    q.options.forEach((opt, j) => {
                        console.log(`   ${String.fromCharCode(97 + j)}) ${typeof opt === 'string' ? opt : JSON.stringify(opt)}`);
                    });
                }
                console.log(`   Correct: ${q.correct_answer || q.answer}`);
                console.log('---');
            });
        }
        
        if (result.vocabulary && result.vocabulary.length > 0) {
            console.log('\n=== VOCABULARY ===');
            result.vocabulary.forEach((v, i) => {
                console.log(`${i + 1}. ${v}`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

testWildBees();
