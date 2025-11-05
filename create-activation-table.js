const { PrismaClient } = require('@prisma/client');

async function createActivationCodesTable() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Создаю таблицу activation_codes...');
    
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS activation_codes (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        "isUsed" BOOLEAN DEFAULT FALSE,
        "usedByTelegramId" BIGINT NULL,
        "usedAt" TIMESTAMP NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code)
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_activation_codes_telegramId ON activation_codes("usedByTelegramId")
    `;
    
    console.log('✅ Таблица activation_codes успешно создана!');
    
  } catch (error) {
    console.error('❌ Ошибка при создании таблицы:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createActivationCodesTable();