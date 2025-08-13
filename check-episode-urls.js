const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEpisodeUrls() {
  try {
    const episodes = await prisma.bBCEpisode.findMany({
      take: 5,
      select: {
        title: true,
        pageUrl: true
      }
    });
    
    console.log('Sample BBC Episodes:');
    episodes.forEach(ep => {
      console.log(`Title: ${ep.title}`);
      console.log(`URL: ${ep.pageUrl}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEpisodeUrls();
