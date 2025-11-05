const { PrismaClient } = require('@prisma/client');

async function createUserSessionsTable() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Создаю таблицу user_sessions...');
    
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "sessionData" TEXT NOT NULL,
        "lastActivity" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_userId ON user_sessions("userId")
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_lastActivity ON user_sessions("lastActivity")
    `;
    
    console.log('✅ Таблица user_sessions успешно создана!');
    
  } catch (error) {
    console.error('❌ Ошибка при создании таблицы:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createUserSessionsTable();