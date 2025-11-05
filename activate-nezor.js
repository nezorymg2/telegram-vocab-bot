const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

async function activateUser() {
  const prisma = new PrismaClient();
  try {
    const userId = 930858056;
    const code = crypto.randomBytes(16).toString('hex');
    
    console.log(`Активируем пользователя ${userId}...`);
    
    // Создаем код активации как уже использованный
    await prisma.$executeRaw`
      INSERT INTO "activation_codes" ("code", "isUsed", "usedByTelegramId", "usedAt", "createdAt")
      VALUES (${code}, true, ${BigInt(userId)}, NOW(), NOW())
    `;
    
    console.log('✅ Пользователь', userId, 'активирован с кодом:', code);
  } catch (error) {
    console.error('❌ Ошибка активации:', error);
  } finally {
    await prisma.$disconnect();
  }
}

activateUser();