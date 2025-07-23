const { PrismaClient } = require('@prisma/client');

console.log('DATABASE: Creating new PrismaClient instance...');
const prisma = new PrismaClient();

console.log('DATABASE: PrismaClient created, checking word model...');
console.log('DATABASE: prisma.word type:', typeof prisma.word);

if (prisma.word) {
  console.log('DATABASE: ✅ prisma.word is available');
  console.log('DATABASE: word.findMany type:', typeof prisma.word.findMany);
} else {
  console.log('DATABASE: ❌ prisma.word is NOT available');
  console.log('DATABASE: Available properties:', Object.getOwnPropertyNames(prisma));
}

module.exports = prisma;
