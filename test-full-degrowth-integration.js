/**
 * Test full degrowth integration - as bot would do it
 */

const { generateBBCQuestions } = require('./services/bbcService');

async function testFullDegrowthIntegration() {
  console.log('🧪 Testing full degrowth integration as bot would do...\n');
  
  // Create episode data as it should be in database (with correct URLs)
  const degrowthEpisode = {
    title: 'What is degrowth?',
    episodeNumber: 'ep-250724',
    pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250724',
    publishDate: '2025-07-24',
    transcript: 'Original transcript text...',
    
    // Correct URLs found by scraping
    worksheetUrl: 'https://downloads.bbc.co.uk/learningenglish/features/6min/250724_6_minute_english_what_is_degrowth__worksheet.pdf',
    transcriptUrl: 'https://downloads.bbc.co.uk/learningenglish/features/6min/250724_6_minute_english_what_is_degrowth__transcript.pdf'
  };
  
  try {
    console.log('🔄 Processing as bbcService.generateBBCQuestions would...');
    console.log(`Episode: ${degrowthEpisode.title}`);
    console.log(`Year: ${new Date(degrowthEpisode.publishDate).getFullYear()}`);
    console.log(`Worksheet URL: ${degrowthEpisode.worksheetUrl}`);
    console.log(`Transcript URL: ${degrowthEpisode.transcriptUrl}`);
    
    const result = await generateBBCQuestions(degrowthEpisode);
    
    console.log('\n📊 Final Result:');
    console.log(`Questions: ${result.questions?.length || 0}`);
    console.log(`Enhanced: ${result.enhanced}`);
    console.log(`Vocabulary terms: ${result.vocabulary?.length || 0}`);
    console.log(`Has transcript: ${!!result.transcript}`);
    
    if (result.questions && result.questions.length > 0) {
      console.log('\n❓ Questions for bot:');
      result.questions.forEach((q, i) => {
        console.log(`\n${i+1}. ${q.question || q.text}`);
        if (q.options && q.options.length > 0) {
          q.options.forEach((opt, j) => {
            const optText = typeof opt === 'string' ? opt : opt.text || opt.value;
            console.log(`   ${String.fromCharCode(97+j)}) ${optText}`);
          });
          if (q.correct_answer) {
            console.log(`   ✓ Answer: ${q.correct_answer}`);
          }
        }
      });
    }
    
    if (result.vocabulary && result.vocabulary.length > 0) {
      console.log('\n📚 Vocabulary for enhanced display:');
      result.vocabulary.forEach((term, i) => {
        console.log(`  ${i+1}. ${term}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error in full integration test:', error.message);
  }
}

testFullDegrowthIntegration().catch(console.error);
