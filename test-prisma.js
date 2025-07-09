const { PrismaClient } = require('./generated/prisma');
const prisma = new PrismaClient();

console.log('PrismaClient:', typeof prisma);
console.log('prisma.word:', typeof prisma.word);
console.log('Available methods on prisma:', Object.getOwnPropertyNames(prisma));

// Попробуем найти все доступные модели
const proto = Object.getPrototypeOf(prisma);
console.log('Prototype methods:', Object.getOwnPropertyNames(proto));

if (prisma.word) {
  console.log('✅ prisma.word существует');
  console.log('word methods:', Object.getOwnPropertyNames(prisma.word));
} else {
  console.log('❌ prisma.word НЕ существует');
}

process.exit(0);
