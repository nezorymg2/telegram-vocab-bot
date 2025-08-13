const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetUserState() {
  try {
    // Delete user state
    await prisma.userState.deleteMany({
      where: { userId: 930858056 }
    });
    
    // Delete any BBC progress in progress
    await prisma.userBBCProgress.deleteMany({
      where: { 
        userId: 930858056,
        completed: false 
      }
    });
    
    console.log('✅ Состояние пользователя полностью сброшено');
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

resetUserState();
