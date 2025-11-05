const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function activateExistingUsers() {
    try {
        console.log('🔄 Активируем существующих пользователей...\n');
        
        // Сначала добавляем поле isActivated если его нет
        try {
            await prisma.$executeRaw`
                ALTER TABLE "UserProfile" 
                ADD COLUMN IF NOT EXISTS "isActivated" BOOLEAN DEFAULT FALSE
            `;
            console.log('✅ Поле isActivated добавлено в UserProfile');
        } catch (error) {
            console.log('⚠️ Поле isActivated уже существует');
        }
        
        // Активируем всех существующих пользователей
        const result = await prisma.userProfile.updateMany({
            data: {
                isActivated: true
            }
        });
        
        console.log(`✅ Активировано ${result.count} пользователей`);
        
        // Показываем список активированных пользователей  
        const users = await prisma.userProfile.findMany();
        
        console.log('\n📋 Пользователи в базе:');
        users.forEach((user, index) => {
            console.log(`${index + 1}. ID: ${user.telegramId}, XP: ${user.xp}, Level: ${user.level}, Activated: ${user.isActivated || 'undefined'}`);
        });
        
    } catch (error) {
        console.error('❌ Ошибка при активации:', error);
    } finally {
        await prisma.$disconnect();
    }
}

activateExistingUsers();