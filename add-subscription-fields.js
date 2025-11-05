const prisma = require('./database');

async function addSubscriptionFields() {
    try {
        console.log('🔄 Добавляю поля для месячных подписок...');
        
        // Используем Prisma для выполнения raw SQL
        await prisma.$executeRaw`
            ALTER TABLE activation_codes 
            ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(20) DEFAULT 'permanent'
        `;
        console.log('✅ Добавлено поле subscription_type');
        
        await prisma.$executeRaw`
            ALTER TABLE activation_codes 
            ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
        `;
        console.log('✅ Добавлено поле expires_at');
        
        await prisma.$executeRaw`
            ALTER TABLE activation_codes 
            ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP
        `;
        console.log('✅ Добавлено поле activated_at');
        
        // Проверяем структуру таблицы
        const result = await prisma.$queryRaw`
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'activation_codes'
            ORDER BY ordinal_position
        `;
        
        console.log('\n📋 Структура таблицы activation_codes:');
        result.forEach(row => {
            console.log(`- ${row.column_name}: ${row.data_type}${row.column_default ? ` (default: ${row.column_default})` : ''}`);
        });
        
        console.log('\n✅ Все поля для месячных подписок добавлены успешно!');
        
    } catch (error) {
        console.error('❌ Ошибка при добавлении полей:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

addSubscriptionFields();