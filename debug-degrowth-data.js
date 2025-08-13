/**
 * Debug degrowth episode data
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugDegrowthEpisode() {
  console.log('🔍 Looking for degrowth episode data...\n');
  
  try {
    // Search for degrowth episodes
    const episodes = await prisma.episodes.findMany({
      where: {
        OR: [
          { title: { contains: 'degrowth', mode: 'insensitive' } },
          { title: { contains: 'What is degrowth', mode: 'insensitive' } }
        ]
      }
    });

    if (episodes.length > 0) {
      const episode = episodes[0];
      console.log('📋 Episode data:');
      console.log('Title:', episode.title);
      console.log('Episode Number:', episode.episodeNumber);  
      console.log('Episode URL:', episode.episodeUrl);
      console.log('Quiz URL:', episode.quizUrl);
      console.log('Worksheet URL:', episode.worksheetUrl);
      console.log('Transcript URL:', episode.transcriptUrl);
      console.log('Publish Date:', episode.publishDate);
      console.log('Has Quiz URL:', !!episode.quizUrl);
      console.log('Has Worksheet URL:', !!episode.worksheetUrl);
    } else {
      console.log('❌ No degrowth episode found in database');
      
      // Let's see recent episodes
      console.log('\n🔍 Recent episodes:');
      const recentEpisodes = await prisma.episodes.findMany({
        take: 10,
        orderBy: { publishDate: 'desc' }
      });
      
      recentEpisodes.forEach(ep => {
        console.log(`- ${ep.title} (${ep.episodeNumber}) - Quiz: ${!!ep.quizUrl} - Worksheet: ${!!ep.worksheetUrl}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugDegrowthEpisode().catch(console.error);
