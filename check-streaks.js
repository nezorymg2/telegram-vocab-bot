const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkProfiles() {
  const profiles = await prisma.profile.findMany();
  console.log('All profiles in database:');
  profiles.forEach(p => {
    console.log('Profile: ' + p.telegramId);
    console.log('  - loginStreak: ' + p.loginStreak);
    console.log('  - studyStreak: ' + p.studyStreak);
    console.log('  - lastBonusDate: ' + p.lastBonusDate);
    console.log('  - lastStudyDate: ' + p.lastStudyDate);
    console.log('  - xp: ' + p.xp);
    console.log('---');
  });
  await prisma.$disconnect();
}

checkProfiles().catch(console.error);
