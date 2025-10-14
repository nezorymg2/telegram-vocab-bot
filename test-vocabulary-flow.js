require('dotenv').config();
const { Bot } = require('grammy');

// Имитируем контекст Telegram
const mockCtx = {
  from: { id: 123456789 },
  reply: async (message, options) => {
    console.log('\n📤 BOT REPLY:');
    console.log(message);
    if (options?.reply_markup) {
      console.log('🔘 BUTTONS:');
      if (options.reply_markup.inline_keyboard) {
        options.reply_markup.inline_keyboard.forEach(row => {
          row.forEach(button => {
            console.log(`  [${button.text}] (${button.callback_data})`);
          });
        });
      }
    }
    console.log('─'.repeat(50));
  },
  deleteMessage: async () => {
    console.log('🗑 Message deleted');
  },
  answerCallbackQuery: async (message) => {
    console.log(`✅ Callback answered: ${message}`);
  },
  callbackQuery: { data: null }
};

// Имитируем сессию с тестовыми словами
const mockSession = {
  profile: 'test_user',
  vocabularyWords: [
    {
      word: 'circadian',
      translation: 'циркадный, суточный',
      example: 'My circadian rhythm makes me more alert at night.'
    },
    {
      word: 'nocturnal', 
      translation: 'ночной',
      example: 'I follow a nocturnal work pattern that aligns with my peak focus.'
    },
    {
      word: 'lethargic',
      translation: 'вялый, апатичный', 
      example: 'Early mornings leave me lethargic and unfocused.'
    },
    {
      word: 'conducive',
      translation: 'благоприятствующий, способствующий',
      example: 'The late-night quiet is conducive to deep concentration.'
    },
    {
      word: 'immerse',
      translation: 'погружаться (во что-либо)',
      example: 'I can immerse myself in complex tasks without interruptions.'
    }
  ],
  stage2_analysis: {
    errors: [
      { title: 'Subject-verb agreement', rule: 'Test rule' },
      { title: 'Articles', rule: 'Test rule' }
    ]
  }
};

// Имитируем функции (заглушки для тестирования)
async function addWordToUserDictionary(profileName, wordData) {
  console.log(`📚 ADDING WORD TO DICTIONARY:`);
  console.log(`  Profile: ${profileName}`);
  console.log(`  Word: ${wordData.word} - ${wordData.translation}`);
  console.log(`  Example: ${wordData.example}`);
  return Promise.resolve();
}

async function generatePersonalizedQuiz(ctx, session, analysisErrors) {
  console.log('\n🧠 GENERATING PERSONALIZED QUIZ...');
  console.log(`Based on ${analysisErrors.errors.length} error types`);
  await ctx.reply('🎯 Персональный тест готов! Начинаем...');
}

// Копируем функции из bot.js
async function startVocabularyAddition(ctx, session, vocabularyWords) {
  try {
    session.vocabularyWords = vocabularyWords;
    session.currentWordIndex = 0;
    session.addedWordsCount = 0;
    
    await showNextVocabularyWord(ctx, session);
    
  } catch (error) {
    console.error('Error in startVocabularyAddition:', error);
    await generatePersonalizedQuiz(ctx, session, session.stage2_analysis);
  }
}

async function showNextVocabularyWord(ctx, session) {
  try {
    if (session.currentWordIndex >= session.vocabularyWords.length) {
      await ctx.reply(`✅ Готово! Добавлено слов в словарь: ${session.addedWordsCount}`);
      
      setTimeout(() => {
        generatePersonalizedQuiz(ctx, session, session.stage2_analysis);
      }, 1500);
      return;
    }
    
    const currentWord = session.vocabularyWords[session.currentWordIndex];
    const wordNumber = session.currentWordIndex + 1;
    const totalWords = session.vocabularyWords.length;
    
    const message = `📚 <b>Добавить новое слово? (${wordNumber}/${totalWords})</b>\n\n` +
                   `<b>${currentWord.word}</b> - ${currentWord.translation}\n` +
                   `<i>${currentWord.example}</i>`;
    
    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Добавить в словарь', callback_data: `add_vocab_${session.currentWordIndex}` },
        { text: '⏭ Пропустить', callback_data: `skip_vocab_${session.currentWordIndex}` }
      ]]
    };
    
    await ctx.reply(message, { 
      parse_mode: 'HTML', 
      reply_markup: keyboard 
    });
    
  } catch (error) {
    console.error('Error in showNextVocabularyWord:', error);
    session.currentWordIndex++;
    await showNextVocabularyWord(ctx, session);
  }
}

// Функция обработки callback
async function handleVocabularyCallback(ctx, session, data) {
  const wordIndex = parseInt(data.split('_')[2]);
  
  if (wordIndex !== session.currentWordIndex) {
    await ctx.answerCallbackQuery('Устаревшая кнопка. Попробуйте еще раз.');
    return;
  }
  
  const currentWord = session.vocabularyWords[wordIndex];
  
  if (data.startsWith('add_vocab_')) {
    try {
      await addWordToUserDictionary(session.profile, currentWord);
      session.addedWordsCount++;
      await ctx.answerCallbackQuery(`✅ Слово "${currentWord.word}" добавлено в словарь!`);
    } catch (error) {
      console.error('Error adding word to dictionary:', error);
      await ctx.answerCallbackQuery('❌ Ошибка при добавлении слова');
    }
  } else {
    await ctx.answerCallbackQuery(`⏭ Слово "${currentWord.word}" пропущено`);
  }
  
  session.currentWordIndex++;
  await ctx.deleteMessage();
  await showNextVocabularyWord(ctx, session);
}

// Тест
async function testVocabularyFlow() {
  console.log('=== TESTING VOCABULARY ADDITION FLOW ===\n');
  
  console.log('📋 Test scenario:');
  console.log('- 5 vocabulary words to process (как в реальном боте)');
  console.log('- User will add 1st and 3rd words, skip 2nd, 4th, and 5th');
  console.log('- Then proceed to personalized quiz\n');
  
  console.log('🚀 Starting vocabulary addition...\n');
  
  // Запускаем процесс добавления слов
  await startVocabularyAddition(mockCtx, mockSession, mockSession.vocabularyWords);
  
  // Имитируем пользовательские действия
  console.log('\n👤 USER ACTION: Add first word (circadian)');
  await handleVocabularyCallback(mockCtx, mockSession, 'add_vocab_0');
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n👤 USER ACTION: Skip second word (nocturnal)');
  await handleVocabularyCallback(mockCtx, mockSession, 'skip_vocab_1');
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n👤 USER ACTION: Add third word (lethargic)');
  await handleVocabularyCallback(mockCtx, mockSession, 'add_vocab_2');
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n👤 USER ACTION: Skip fourth word (conducive)');
  await handleVocabularyCallback(mockCtx, mockSession, 'skip_vocab_3');
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n👤 USER ACTION: Skip fifth word (immerse)');
  await handleVocabularyCallback(mockCtx, mockSession, 'skip_vocab_4');
  
  console.log('\n🎉 VOCABULARY FLOW TEST COMPLETED!');
  console.log(`📊 Final results: ${mockSession.addedWordsCount}/5 words added`);
}

// Запускаем тест
testVocabularyFlow().catch(console.error);