const { generateBBCQuestions } = require('./services/bbcService');

async function testWildBeesVocab() {
    try {
        const episode = {
            title: 'How can we help wild bees?',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250717'
        };
        
        const result = await generateBBCQuestions(episode);
        
        console.log('Vocabulary details:');
        if (result.vocabulary) {
            result.vocabulary.forEach((v, i) => {
                console.log(`${i + 1}. Type: ${typeof v}, Value: ${JSON.stringify(v)}`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

testWildBeesVocab();
