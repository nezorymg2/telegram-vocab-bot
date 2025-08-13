const { getCleanTranscript } = require('./services/bbcQuestions');
const { PrismaClient } = require('@prisma/client');

async function testVocabularyExtraction() {
  const prisma = new PrismaClient();
  
  try {
    const episode = await prisma.bBCEpisode.findFirst();
    if (episode) {
      console.log('Episode URL:', episode.pageUrl);
      console.log('Title:', episode.title);
      
      console.log('\n🎭 Testing clean transcript and vocabulary extraction...');
      const result = await getCleanTranscript(episode.pageUrl);
      
      if (result && result.transcript) {
        console.log('✅ Clean transcript extracted successfully!');
        console.log(`📄 Transcript length: ${result.transcript.length} characters`);
        
        if (result.vocabulary && result.vocabulary.length > 0) {
          console.log(`\n📚 Vocabulary extracted: ${result.vocabulary.length} terms`);
          console.log('\n🔤 Vocabulary items:');
          result.vocabulary.forEach((item, index) => {
            console.log(`${index + 1}. ${item.term}`);
            console.log(`   ${item.definition}`);
            console.log('');
          });
        } else {
          console.log('\n❌ No vocabulary found');
        }
      } else {
        console.log('❌ Failed to extract clean transcript');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testVocabularyExtraction();
