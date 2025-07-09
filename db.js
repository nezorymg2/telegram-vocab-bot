const { PrismaClient } = require('./generated/prisma');

// Отладочная информация
console.log('DEBUG: PrismaClient type:', typeof PrismaClient);

const prisma = new PrismaClient();

// Проверяем что экспортируем
console.log('DEBUG: prisma instance type:', typeof prisma);
console.log('DEBUG: prisma.word at export:', typeof prisma.word);
console.log('DEBUG: prisma properties at export:', Object.getOwnPropertyNames(prisma));

module.exports = prisma;