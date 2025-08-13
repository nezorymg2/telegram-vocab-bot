/**
 * Test BBC Service with known episode
 */

const { generateBBCQuestions } = require('./services/bbcService');

async function testKnownEpisode() {
  console.log('🧪 Testing BBC Service with known episode...\n');
  
  // Create test episode data similar to what bot would pass
  const testEpisode = {
    title: 'What is degrowth?',
    pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english/ep-250103',
    transcript: 'Test transcript content...',
    publishDate: '2025-01-03',
    transcriptUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250103',
    quizUrl: 'https://docs.google.com/spreadsheets/d/1example/export?format=csv', // Example quiz URL
    worksheetUrl: null
  };
  
  try {
    console.log('Testing with episode:', testEpisode.title);
    console.log('Quiz URL:', testEpisode.quizUrl);
    console.log('Transcript URL:', testEpisode.transcriptUrl);
    console.log('Year:', new Date(testEpisode.publishDate).getFullYear());
    
    const result = await generateBBCQuestions(testEpisode);
    
    console.log('\n📊 Result:');
    console.log('Questions:', result.questions?.length || 0);
    console.log('Enhanced:', result.enhanced);
    console.log('Vocabulary terms:', result.vocabulary?.length || 0);
    console.log('Has transcript:', !!result.transcript);
    
    if (result.vocabulary && result.vocabulary.length > 0) {
      console.log('\n🔑 Vocabulary:');
      result.vocabulary.forEach((term, i) => {
        console.log(`  ${i+1}. ${term}`);
      });
    }
    
    if (result.questions && result.questions.length > 0) {
      console.log('\n❓ Questions:');
      result.questions.forEach((q, i) => {
        console.log(`  ${i+1}. ${q.question || q}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testKnownEpisode().catch(console.error);
