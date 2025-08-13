const { parseBBCPDFQuiz } = require('./services/bbcQuestions-simple');

async function debugWorksheet() {
    try {
        const worksheetUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250717_6_minute_english_how_can_we_help_wild_bees_worksheet.pdf';
        console.log('Testing worksheet parsing...');
        
        const result = await parseBBCPDFQuiz(worksheetUrl);
        
        console.log('=== RAW PARSING RESULT ===');
        console.log('Full result:', JSON.stringify(result, null, 2));
        
        if (result && result.questions) {
            console.log('\n=== QUESTIONS ANALYSIS ===');
            result.questions.forEach((q, i) => {
                console.log(`\nQuestion ${i + 1}:`);
                console.log('  question:', JSON.stringify(q.question));
                console.log('  type:', q.type);
                console.log('  options:', JSON.stringify(q.options));
                console.log('  correct_answer:', JSON.stringify(q.correct_answer));
                console.log('  answer:', JSON.stringify(q.answer));
            });
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

debugWorksheet();
