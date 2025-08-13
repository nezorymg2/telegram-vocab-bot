const { parseBBCPDFQuiz } = require('./services/bbcQuestions-simple');

async function debugQuestions() {
    try {
        const url = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250717_6_minute_english_how_can_we_help_wild_bees_worksheet.pdf';
        
        const result = await parseBBCPDFQuiz(url);
        
        console.log('\n=== QUESTIONS ANALYSIS ===');
        result.questions.forEach((q, i) => {
            console.log(`\nQuestion ${i + 1}:`);
            console.log('  question:', q.question);
            console.log('  type:', q.type);
            console.log('  correct_answer:', q.correct_answer);
            console.log('  answer:', q.answer);
            console.log('  options count:', q.options ? q.options.length : 'no options');
            if (q.options && q.options.length > 0) {
                console.log('  first option:', JSON.stringify(q.options[0]));
            }
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugQuestions();
