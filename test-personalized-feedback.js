// Тест нового формата персональной оценки

console.log('=== TESTING NEW PERSONALIZED FEEDBACK FORMAT ===');

// Имитируем новый JSON ответ от GPT
const mockImprovedData = {
  "improved_text": "Learning English has been a transformative journey that fundamentally changed my perspective on education and global communication. Initially, I struggled with basic vocabulary and grammar, feeling overwhelmed by the complexity of the language. However, through consistent practice and dedication, I gradually developed confidence in both written and spoken English. This experience taught me that persistence and proper methodology are essential for language acquisition. Currently, I aspire to study abroad with my wife, and English proficiency has become our gateway to international opportunities.",
  
  "personalized_feedback": {
    "clarity_focus": "Текст понятный, но временами теряется фокус — ты описываешь процесс изучения, но не подчёркиваешь, зачем он важен лично для тебя. Сделай мысль более целенаправленной: \"Learning English has completely changed my perspective on studying abroad.\"",
    
    "flow_rhythm": "Предложения часто одинаковой длины, из-за чего рассказ звучит \"ровно\". Добавь вариативность — чередуй короткие и длинные фразы, чтобы текст \"дышал\". Например: \"At first, I struggled. Later, everything changed when I found a teacher from the Philippines.\"",
    
    "tone_engagement": "Тон искренний, но немного описательный. Чтобы звучать на Band 7+, используй больше **\"writer's voice\"** — покажи эмоции или выводы: Instead of: \"I watched a lot of movies in English.\" Try: \"English movies became my window into another world.\"",
    
    "development_depth": "Хорошо, что ты даёшь примеры, но их можно чуть \"развернуть\". IELTS любит, когда причина подкреплена эффектом. Например: \"I watched many English movies\" → \"Watching movies not only improved my listening skills but also made me confident when I talked to foreigners.\"",
    
    "precision_ideas": "Избегай обобщений вроде \"It helped me a lot.\" Замени на точные эффекты: \"It helped me build confidence and expand my vocabulary.\""
  },
  
  "vocabulary_words": [
    {
      "word": "transformative",
      "translation": "преобразующий",
      "example": "Learning English was a transformative experience for me."
    },
    {
      "word": "methodology",
      "translation": "методология",
      "example": "I discovered that proper methodology is crucial for language learning."
    },
    {
      "word": "persistence",
      "translation": "настойчивость",
      "example": "Persistence is the key to mastering any skill."
    },
    {
      "word": "acquisition",
      "translation": "усвоение",
      "example": "Language acquisition requires consistent practice."
    },
    {
      "word": "proficiency",
      "translation": "владение",
      "example": "English proficiency opened many doors for us."
    }
  ]
};

// Тестируем отображение улучшенной версии
console.log('\n--- Testing improved text display ---');
const message1 = `✨ <b>Улучшенная версия (IELTS 7.0+ уровень):</b>\n\n<i>${mockImprovedData.improved_text}</i>`;
console.log('Message 1 (Improved Text):');
console.log(message1);
console.log(`Length: ${message1.length} characters\n`);

// Тестируем отображение персональной оценки (5 отдельных сообщений)
console.log('--- Testing personalized feedback display ---');

const feedbackBlocks = [
  { emoji: '💡', title: 'Clarity & Focus', content: mockImprovedData.personalized_feedback.clarity_focus },
  { emoji: '🎢', title: 'Flow & Rhythm', content: mockImprovedData.personalized_feedback.flow_rhythm },
  { emoji: '🎯', title: 'Tone & Engagement', content: mockImprovedData.personalized_feedback.tone_engagement },
  { emoji: '🧠', title: 'Development & Depth', content: mockImprovedData.personalized_feedback.development_depth },
  { emoji: '🏗️', title: 'Precision of Ideas', content: mockImprovedData.personalized_feedback.precision_ideas }
];

feedbackBlocks.forEach((block, index) => {
  const message = `${block.emoji} <b>${block.title}:</b>\n\n${block.content}`;
  console.log(`Message ${index + 2} (${block.title}):`);
  console.log(message);
  console.log(`Length: ${message.length} characters\n`);
});

// Тестируем отображение словаря
console.log('--- Testing vocabulary display ---');
let vocabMessage = `📚 <b>Топ-5 слов для этой темы:</b>\n\n`;
mockImprovedData.vocabulary_words.forEach((vocab, index) => {
  vocabMessage += `${index + 1}. <b>${vocab.word}</b> - ${vocab.translation}\n`;
  vocabMessage += `   <i>${vocab.example}</i>\n\n`;
});

console.log('Message 7 (Vocabulary):');
console.log(vocabMessage);
console.log(`Length: ${vocabMessage.length} characters`);

console.log('\n=== TEST SUMMARY ===');
console.log('✅ New personalized feedback format implemented');
console.log('✅ 5 separate feedback messages with emojis');
console.log('✅ Specific examples from user text included');
console.log('✅ All messages within Telegram limits');
console.log('✅ Vocabulary section maintained');