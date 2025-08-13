/**
 * Test parsing the actual degrowth worksheet
 */

const { parseBBCPDFQuiz, extractVocabularyFromEpisode } = require('./services/bbcQuestions-simple');

async function testActualDegrowthWorksheet() {
  console.log('🧪 Testing actual degrowth worksheet and transcript...\n');
  
  const worksheetUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250724_6_minute_english_what_is_degrowth__worksheet.pdf';
  const transcriptUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250724_6_minute_english_what_is_degrowth__transcript.pdf';
  
  try {
    console.log('📋 Testing worksheet parsing...');
    console.log(`URL: ${worksheetUrl}`);
    
    const quizResult = await parseBBCPDFQuiz(worksheetUrl);
    
    if (quizResult && quizResult.questions) {
      console.log(`✅ Found ${quizResult.questions.length} questions from worksheet:`);
      quizResult.questions.forEach((q, i) => {
        console.log(`\n${i+1}. ${q.question || q.text || JSON.stringify(q).substring(0, 100)}`);
        if (q.options) {
          q.options.forEach((option, j) => {
            const optionText = typeof option === 'string' ? option : option.text || option.value || JSON.stringify(option);
            const marker = q.correct_answer === String.fromCharCode(97 + j) ? '✓' : ' ';
            console.log(`   ${marker} ${optionText}`);
          });
        }
        if (q.correct_answer) {
          console.log(`   → Correct: ${q.correct_answer}`);
        }
      });
    } else {
      console.log('❌ No questions found in worksheet');
    }
    
    console.log('\n📚 Testing vocabulary extraction...');
    console.log(`URL: ${transcriptUrl}`);
    
    const vocabulary = await extractVocabularyFromEpisode(transcriptUrl);
    
    if (vocabulary && vocabulary.length > 0) {
      console.log(`✅ Found ${vocabulary.length} vocabulary terms:`);
      vocabulary.forEach((term, i) => {
        console.log(`  ${i+1}. ${term}`);
      });
    } else {
      console.log('❌ No vocabulary found in transcript');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testActualDegrowthWorksheet().catch(console.error);
