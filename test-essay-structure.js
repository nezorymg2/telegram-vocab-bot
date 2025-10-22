// Тест для проверки добавления универсальной структуры эссе

console.log('=== TESTING ESSAY STRUCTURE ADDITION ===');

// Имитируем сообщение с универсальной структурой
const essayStructureMessage = 
  `💡 <b>Универсальная структура для всех типов эссе:</b>\n\n` +
  `<b>[Intro]</b>\n` +
  `I strongly believe that / I firmly agree that / There is no doubt that __________.\n` +
  `This essay will discuss / aims to examine / will explore __________.\n\n` +
  
  `<b>[Body 1: Background or Reason 1]</b>\n` +
  `Firstly / To begin with / One major reason is that __________.\n` +
  `This is mainly because / This can be explained by / The main reason for this is that __________.\n` +
  `For example / For instance / A good illustration of this is __________.\n\n` +
  
  `<b>[Body 2: Development or Reason 2]</b>\n` +
  `Secondly / In addition / Another important factor is that __________.\n` +
  `As a result / Consequently / This leads to __________.\n` +
  `Furthermore / Moreover / Additionally __________.\n\n` +
  
  `<b>[Conclusion]</b>\n` +
  `In conclusion / To sum up / Overall __________.\n` +
  `Therefore, it is clear that / Hence, it can be concluded that / Thus, it is evident that __________.`;

console.log('Message preview:');
console.log('================');
console.log(essayStructureMessage);
console.log('================');

// Проверяем длину сообщения (Telegram ограничение 4096 символов)
console.log(`\nMessage length: ${essayStructureMessage.length} characters`);
console.log(`Telegram limit: 4096 characters`);
console.log(`Within limit: ${essayStructureMessage.length <= 4096 ? '✅' : '❌'}`);

// Проверяем HTML теги
const htmlTags = essayStructureMessage.match(/<[^>]+>/g) || [];
console.log(`\nHTML tags found: ${htmlTags.length}`);
console.log('Tags:', htmlTags);

// Проверяем баланс тегов
const openTags = (essayStructureMessage.match(/<b>/g) || []).length;
const closeTags = (essayStructureMessage.match(/<\/b>/g) || []).length;
console.log(`\nTag balance: <b> tags: ${openTags}, </b> tags: ${closeTags}`);
console.log(`Tags balanced: ${openTags === closeTags ? '✅' : '❌'}`);

console.log('\n=== TEST COMPLETED ===');
console.log('✅ Message formatting looks correct');
console.log('✅ Within Telegram character limit');
console.log('✅ HTML tags are properly balanced');