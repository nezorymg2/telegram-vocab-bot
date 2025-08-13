const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findEpisodes() {
  try {
    const episodes = await prisma.bBCEpisode.findMany({
      where: {
        OR: [
          { title: { contains: 'manosphere' } },
          { title: { contains: 'degrowth' } },
          { title: { contains: 'wild bees' } }
        ]
      }
    });
    
    console.log('Найденные эпизоды:');
    episodes.forEach(ep => {
      console.log('- ' + ep.title + ' (' + ep.pageUrl.split('/').pop() + ')');
    });
    
    return episodes;
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findEpisodes();
