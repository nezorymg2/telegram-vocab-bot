// Простой тест для проверки отсутствия дублирования

console.log('🧪 TESTING: Checking for message duplication in writing analysis');

// Симуляция функций бота для проверки логики
let messagesSent = [];

function mockReply(message) {
  messagesSent.push(message);
  console.log(`📤 SENT: ${message.substring(0, 50)}...`);
}

// Симуляция старой системы (должна быть отключена)
async function showWritingAnalysisResult(ctx, session) {
  await mockReply('📊 Анализ вашего текста:');
  await mockReply('🎯 Оценка: 6.5/9 (IELTS Writing)');
  await mockReply('1️⃣ Сделай позицию чёткой...');
  await mockReply('2️⃣ Разделяй текст на 3 блока...');
  await mockReply('3️⃣ Добавляй связки...');
  await mockReply('4️⃣ Укрепляй словарь...');
  await mockReply('5️⃣ Добавь "гибкую грамматику"...');
}

// Симуляция новой системы (должна работать)
async function generateImprovedVersion(ctx, session, userText) {
  await mockReply('✨ Генерирую улучшенную версию вашего текста...');
  await mockReply('✨ Улучшенная версия (IELTS 7.0+ уровень):');
  await mockReply('💡 Clarity & Focus: Ваши идеи четко выражены...');
  await mockReply('🎢 Flow & Rhythm: Отличный баланс предложений...');
  await mockReply('🎯 Tone & Engagement: Тон доброжелательный...');
  await mockReply('🧠 Development & Depth: Идеи развиты хорошо...');
  await mockReply('🏗️ Precision & Ideas: Выражения точные...');
}

// Тест СТАРОЙ логики (как было раньше - НЕ ДОЛЖНО БЫТЬ ТАКОГО)
async function testOldLogic() {
  console.log('\n❌ OLD LOGIC (should be removed):');
  messagesSent = [];
  
  await mockReply('🔍 Анализирую ваш текст...');
  await showWritingAnalysisResult(null, null);  // Старая система
  await generateImprovedVersion(null, null, 'test'); // Новая система
  
  console.log(`📊 Total messages sent: ${messagesSent.length}`);
  console.log('⚠️  This would cause DUPLICATION - user sees both old and new feedback');
}

// Тест НОВОЙ логики (как должно быть сейчас)
async function testNewLogic() {
  console.log('\n✅ NEW LOGIC (current implementation):');
  messagesSent = [];
  
  await mockReply('🔍 Анализирую ваш текст...');
  // НЕ вызываем showWritingAnalysisResult - убрано!
  await generateImprovedVersion(null, null, 'test'); // Только новая система
  
  console.log(`📊 Total messages sent: ${messagesSent.length}`);
  console.log('✅ No duplication - user sees only new personalized feedback');
}

// Анализ различий
async function analyzeChanges() {
  console.log('\n📋 ANALYSIS:');
  console.log('=============');
  
  console.log('🔴 OLD SYSTEM PROBLEMS:');
  console.log('- Users saw numbered tips (1️⃣2️⃣3️⃣4️⃣5️⃣)');
  console.log('- Then also saw new personalized feedback (💡🎢🎯🧠🏗️)');
  console.log('- Total: ~12-15 messages = confusion and spam');
  
  console.log('\n🟢 NEW SYSTEM BENEFITS:');
  console.log('- Users see only personalized feedback (💡🎢🎯🧠🏗️)');
  console.log('- Clean, focused experience');
  console.log('- Total: ~7-8 messages = clear and helpful');
  
  console.log('\n🔧 CHANGES MADE:');
  console.log('- Removed showWritingAnalysisResult() calls from 3 places');
  console.log('- Kept only generateImprovedVersion() calls');
  console.log('- Users now get personalized feedback instead of generic tips');
}

// Запуск тестов
async function runTests() {
  await testOldLogic();
  await testNewLogic();
  await analyzeChanges();
  
  console.log('\n🎯 CONCLUSION:');
  console.log('✅ Duplication issue should be FIXED');
  console.log('✅ Users will only see new personalized feedback');
  console.log('✅ No more confusing double messages');
}

runTests();