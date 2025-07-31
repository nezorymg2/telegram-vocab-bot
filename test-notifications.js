const { PrismaClient } = require('@prisma/client');

async function testNotificationSystem() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Тестируем систему уведомлений...\n');
    
    // Получаем всех пользователей
    const users = await prisma.userProfile.findMany();
    const today = new Date().toDateString();
    
    console.log(`Дата сегодня: ${today}\n`);
    
    users.forEach(user => {
      console.log(`👤 Пользователь: ${user.profileName} (ID: ${user.telegramId})`);
      console.log(`   - Последнее умное повторение: ${user.lastSmartRepeatDate || 'никогда'}`);
      
      const didSmartRepeatToday = user.lastSmartRepeatDate === today;
      console.log(`   - Прошел умное повторение сегодня: ${didSmartRepeatToday ? 'ДА' : 'НЕТ'}`);
      console.log(`   - Будет получать уведомления: ${didSmartRepeatToday ? 'НЕТ' : 'ДА'}`);
      console.log('');
    });
    
    // Для тестирования - сбросим дату умного повторения для одного пользователя
    console.log('🧪 Тестовый сброс: устанавливаем Нурболату lastSmartRepeatDate на вчера');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toDateString();
    
    await prisma.userProfile.updateMany({
      where: { profileName: 'Нурболат' },
      data: { lastSmartRepeatDate: yesterdayString }
    });
    
    console.log(`   - Установлено: ${yesterdayString}`);
    console.log('   - Теперь Нурболат будет получать уведомления\n');
    
    // Показываем итоговое состояние
    console.log('📊 Итоговое состояние после тестового изменения:');
    const updatedUsers = await prisma.userProfile.findMany();
    
    updatedUsers.forEach(user => {
      console.log(`👤 ${user.profileName}: ${user.lastSmartRepeatDate || 'никогда'}`);
      const willReceiveNotifications = user.lastSmartRepeatDate !== today;
      console.log(`   - Получит уведомления: ${willReceiveNotifications ? 'ДА' : 'НЕТ'}`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testNotificationSystem();
