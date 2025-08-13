const { getCleanTranscript } = require('./services/bbcQuestions');

async function testVocabExtraction() {
  const episodeUrl = "https://www.bbc.co.uk/learningenglish/features/6-minute-english/ep-250807";
  
  console.log('Testing vocabulary extraction from episode:');
  console.log(episodeUrl);
  console.log();
  
  const result = await getCleanTranscript(episodeUrl);
  
  if (result && result.vocabulary) {
    console.log(`✅ Extracted ${result.vocabulary.length} vocabulary items:`);
    console.log();
    
    result.vocabulary.forEach((item, index) => {
      console.log(`${index + 1}. ${item.term}`);
      console.log(`   ${item.definition}`);
      console.log();
    });
    
    if (result.vocabulary.length === 6) {
      console.log('🎯 Perfect! Exactly 6 vocabulary items extracted.');
    } else {
      console.log(`⚠️  Expected 6 vocabulary items, but got ${result.vocabulary.length}`);
    }
  } else {
    console.log('❌ Failed to extract vocabulary');
  }
}

testVocabExtraction().catch(console.error);
