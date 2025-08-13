const { PrismaClient } = require('@prisma/client');
const { extractVocabularyFromEpisode } = require('./services/bbcQuestions-simple');

const prisma = new PrismaClient();

async function findDegrowthEpisode() {
  console.log('🔍 Searching for degrowth episode...');
  
  try {
    // Search in episodes table
    const episodes = await prisma.episodes.findMany({
      where: {
        OR: [
          { title: { contains: 'degrowth', mode: 'insensitive' } },
          { title: { contains: 'What is degrowth', mode: 'insensitive' } },
          { description: { contains: 'degrowth', mode: 'insensitive' } }
        ]
      }
    });

    console.log(`Found ${episodes.length} episodes matching 'degrowth':`);
    episodes.forEach(ep => {
      console.log(`- ${ep.title} (${ep.episodeNumber})`);
      console.log(`  URL: ${ep.episodeUrl}`);
    });

    if (episodes.length > 0) {
      const episode = episodes[0];
      console.log('\n🧪 Testing vocabulary extraction...');
      
      try {
        const vocabulary = await extractVocabularyFromEpisode(episode.episodeUrl);
        console.log(`✅ Found ${vocabulary.length} vocabulary terms:`);
        vocabulary.forEach((term, i) => {
          console.log(`  ${i+1}. ${term}`);
        });
      } catch (error) {
        console.error('❌ Error extracting vocabulary:', error.message);
      }
    } else {
      console.log('\n❌ No degrowth episode found in database');
    }

  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findDegrowthEpisode().catch(console.error);
