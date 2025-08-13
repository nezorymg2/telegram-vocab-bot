const { parseBBCPDFQuiz } = require('./services/bbcQuestions-simple');

async function debugAllQuestions() {
    try {
        const url = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250710_6_minute_english_do_you_need_to_declutter_your_home__worksheet.pdf';
        
        const result = await parseBBCPDFQuiz(url);
        
        console.log('\n=== ALL EXTRACTED QUESTIONS (BEFORE FILTERING) ===');
        result.questions.forEach((q, i) => {
            console.log(`\nQuestion ${i + 1} (Number: ${q.number}):`);
            console.log(`  Question: ${q.question}`);
            console.log(`  Correct answer: ${q.correct_answer}`);
            console.log(`  Type: ${q.type}`);
            console.log(`  Options count: ${q.options ? q.options.length : 0}`);
            
            // Check filtering conditions
            const isInstruction = q.question.toLowerCase().includes('now listen to') || 
                                q.question.toLowerCase().includes('listen to the whole episode');
            const hasPlaceholder = q.options && q.options.some(opt => 
                opt.text && opt.text.includes('_______'));
            
            console.log(`  Would be filtered: ${isInstruction || hasPlaceholder} (instruction: ${isInstruction}, placeholder: ${hasPlaceholder})`);
        });
        
        // Apply our filtering
        const filtered = result.questions.filter(q => {
            // Skip questions that look like instructions
            if (q.question.toLowerCase().includes('now listen to') || 
                q.question.toLowerCase().includes('listen to the whole episode')) {
              return false;
            }
            
            // Skip questions with placeholder options like "Word/phrase:_______"
            if (q.options && q.options.some(opt => 
                opt.text && opt.text.includes('_______'))) {
              return false;
            }
            
            return true;
        });
        
        console.log(`\n=== FILTERED RESULT ===`);
        console.log(`Original questions: ${result.questions.length}`);
        console.log(`Filtered questions: ${filtered.length}`);
        
        console.log('\n=== FINAL QUESTIONS FOR QUIZ ===');
        filtered.forEach((q, i) => {
            console.log(`${i + 1}. ${q.question.substring(0, 80)}...`);
            console.log(`   Answer: ${q.correct_answer}`);
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugAllQuestions();
