const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Функция генерации криптографически стойкого кода
function generateSecureCode() {
    // Генерируем 16 случайных байт и конвертируем в hex (32 символа)
    return crypto.randomBytes(16).toString('hex');
}

// Функция создания одного активационного кода
async function createActivationCode() {
    try {
        const code = generateSecureCode();
        
        // Проверяем что код уникален (маловероятно, но для безопасности)
        const existingCode = await prisma.$queryRaw`
            SELECT id FROM "activation_codes" WHERE "code" = ${code}
        `;
        
        if (existingCode.length > 0) {
            console.log('⚠️ Код уже существует, генерируем новый...');
            return createActivationCode(); // Рекурсивно генерируем новый
        }
        
        // Создаем код в базе данных
        await prisma.$executeRaw`
            INSERT INTO "activation_codes" ("code", "isUsed", "createdAt")
            VALUES (${code}, false, NOW())
        `;
        
        console.log(`✅ Создан активационный код: ${code}`);
        return code;
        
    } catch (error) {
        console.error('❌ Ошибка при создании кода:', error);
        throw error;
    }
}

// Функция создания нескольких кодов
async function createMultipleCodes(count = 10) {
    try {
        console.log(`🔑 Создаем ${count} активационных кодов...\n`);
        
        const codes = [];
        for (let i = 0; i < count; i++) {
            const code = await createActivationCode();
            codes.push(code);
        }
        
        console.log(`\n🎉 Успешно создано ${codes.length} кодов!`);
        console.log('\n📋 СПИСОК КОДОВ ДЛЯ ПРОДАЖИ:');
        console.log('=' + '='.repeat(40));
        codes.forEach((code, index) => {
            console.log(`${index + 1}. ${code}`);
        });
        console.log('=' + '='.repeat(40));
        
        return codes;
        
    } catch (error) {
        console.error('❌ Ошибка при создании кодов:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Функция проверки статистики кодов
async function getCodesStats() {
    try {
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN "isUsed" = false THEN 1 END) as available,
                COUNT(CASE WHEN "isUsed" = true THEN 1 END) as used
            FROM "activation_codes"
        `;
        
        const result = stats[0];
        console.log('\n📊 СТАТИСТИКА АКТИВАЦИОННЫХ КОДОВ:');
        console.log(`📦 Всего кодов: ${result.total}`);
        console.log(`✅ Доступно: ${result.available}`);
        console.log(`🔒 Использовано: ${result.used}`);
        
        return result;
        
    } catch (error) {
        console.error('❌ Ошибка при получении статистики:', error);
    }
}

// Основная функция
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'create':
            const count = parseInt(args[1]) || 10;
            await createMultipleCodes(count);
            break;
            
        case 'stats':
            await getCodesStats();
            break;
            
        case 'single':
            await createActivationCode();
            break;
            
        default:
            console.log('🔑 ГЕНЕРАТОР АКТИВАЦИОННЫХ КОДОВ');
            console.log('\nИспользование:');
            console.log('  node generate-codes.js create [количество]  - создать коды (по умолчанию 10)');
            console.log('  node generate-codes.js single              - создать один код');
            console.log('  node generate-codes.js stats               - показать статистику');
            console.log('\nПримеры:');
            console.log('  node generate-codes.js create 5   # создать 5 кодов');
            console.log('  node generate-codes.js create     # создать 10 кодов');
            console.log('  node generate-codes.js single     # создать 1 код');
            console.log('  node generate-codes.js stats      # статистика');
            break;
    }
    
    await prisma.$disconnect();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { createActivationCode, createMultipleCodes, getCodesStats };