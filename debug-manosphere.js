const { parseBBCPDFQuiz, convertToIELTSFormat } = require('./services/bbcQuestions');

async function testManosphereEpisode() {
  try {
    // URL for "What is the manosphere?" episode
    const worksheetUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250731_6_minute_english_what_is_the_manosphere_worksheet.pdf';
    
    console.log('🧪 Testing manosphere episode PDF...');
    console.log('URL:', worksheetUrl);
    
    const pdfQuiz = await parseBBCPDFQuiz(worksheetUrl);
    
    if (!pdfQuiz.success) {
      console.log('❌ Failed to parse PDF');
      return;
    }
    
    console.log(`✅ Extracted ${pdfQuiz.questions.length} questions`);
    console.log(`✅ Extracted ${pdfQuiz.answers.length} answers`);
    
    const ieltsQuestions = convertToIELTSFormat(pdfQuiz);
    
    console.log('\n📝 Questions and answers:');
    ieltsQuestions.forEach((q, index) => {
      console.log(`${index + 1}. ${q.question}`);
      q.options.forEach(opt => console.log(`   ${opt}`));
      console.log(`   ✅ ${q.explanation}\n`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testManosphereEpisode();
