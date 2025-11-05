const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function transferNurbolatProfile() {
    try {
        console.log('🔄 Переносим профиль "Нурболат" на текущий аккаунт...');
        
        // Сначала находим профиль "Нурболат"
        const nurbolatProfile = await prisma.userProfile.findFirst({
            where: {
                telegramId: '380502678',
                profileName: 'Нурболат'
            }
        });
        
        if (!nurbolatProfile) {
            console.log('❌ Профиль "Нурболат" не найден');
            return;
        }
        
        console.log(`📝 Найден профиль: XP=${nurbolatProfile.xp}, Уровень=${nurbolatProfile.level}`);
        
        // Обновляем telegramId
        const result = await prisma.userProfile.update({
            where: {
                id: nurbolatProfile.id
            },
            data: {
                telegramId: '930858056'  // Ваш текущий ID
            }
        });
        
        console.log('✅ Профиль успешно перенесен!');
        console.log(`📝 Профиль "Нурболат" теперь принадлежит пользователю 930858056`);
        console.log(`💎 XP: ${result.xp}, Уровень: ${result.level}`);
        
    } catch (error) {
        console.error('❌ Ошибка при переносе:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Запускаем перенос профиля
transferNurbolatProfile();