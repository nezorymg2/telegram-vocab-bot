const { fetchPDF } = require('./services/bbcQuestions-simple');
const fs = require('fs');

async function debugMissingQuestion() {
    try {
        const url = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250710_6_minute_english_do_you_need_to_declutter_your_home__worksheet.pdf';
        
        console.log('Fetching and parsing worksheet...');
        const content = await fetchPDF(url);
        
        // We'll need to access the functions directly. Let's look at the content first
        console.log(`\n=== PDF CONTENT PREVIEW ===`);
        console.log('Content length:', content.length);
        console.log('First 500 characters:');
        console.log(content.substring(0, 500));
        
        console.log('\n=== LOOKING FOR QUESTION 6 ===');
        // Search for question 6 pattern
        const question6Pattern = /6[.)]\s*(.{0,200})/gi;
        const question6Matches = content.match(question6Pattern);
        if (question6Matches) {
            console.log('Found question 6 patterns:');
            question6Matches.forEach((match, i) => {
                console.log(`${i + 1}: ${match.substring(0, 100)}...`);
            });
        } else {
            console.log('No question 6 patterns found');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugMissingQuestion();

debugMissingQuestion();
