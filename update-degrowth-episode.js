/**
 * Update degrowth episode with correct worksheet URL
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateDegrowthEpisode() {
  console.log('🔄 Updating degrowth episode with correct URLs...\n');
  
  try {
    // First, let's see what episodes we have that might be degrowth
    console.log('🔍 Searching for degrowth-related episodes...');
    
    const episodes = await prisma.episodes.findMany({
      where: {
        OR: [
          { title: { contains: 'degrowth', mode: 'insensitive' } },
          { title: { contains: 'What is degrowth', mode: 'insensitive' } },
          { episodeNumber: 'ep-250724' },
          { episodeUrl: { contains: '250724' } }
        ]
      }
    });

    console.log(`Found ${episodes.length} potential degrowth episodes:`);
    episodes.forEach(ep => {
      console.log(`- ${ep.title} (${ep.episodeNumber})`);
      console.log(`  URL: ${ep.episodeUrl}`);
      console.log(`  Quiz URL: ${ep.quizUrl || 'None'}`);
      console.log(`  Worksheet URL: ${ep.worksheetUrl || 'None'}`);
      console.log(`  Transcript URL: ${ep.transcriptUrl || 'None'}`);
    });

    if (episodes.length > 0) {
      const episode = episodes[0];
      
      console.log('\n🔄 Updating with correct URLs...');
      
      const updatedEpisode = await prisma.episodes.update({
        where: { id: episode.id },
        data: {
          worksheetUrl: 'https://downloads.bbc.co.uk/learningenglish/features/6min/250724_6_minute_english_what_is_degrowth__worksheet.pdf',
          transcriptUrl: 'https://downloads.bbc.co.uk/learningenglish/features/6min/250724_6_minute_english_what_is_degrowth__transcript.pdf'
        }
      });
      
      console.log('✅ Updated episode:');
      console.log(`- Title: ${updatedEpisode.title}`);
      console.log(`- Worksheet URL: ${updatedEpisode.worksheetUrl}`);
      console.log(`- Transcript URL: ${updatedEpisode.transcriptUrl}`);
      
    } else {
      console.log('❌ No degrowth episode found to update');
      
      // Let's see recent episodes
      console.log('\n🔍 Recent episodes:');
      const recentEpisodes = await prisma.episodes.findMany({
        take: 10,
        orderBy: { publishDate: 'desc' }
      });
      
      recentEpisodes.forEach(ep => {
        console.log(`- ${ep.title} (${ep.episodeNumber}) - ${ep.publishDate}`);
      });
    }
    
  } catch (error) {
    console.error('Error updating episode:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateDegrowthEpisode().catch(console.error);
