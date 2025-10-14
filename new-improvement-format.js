// Новый промпт для улучшения текстов
const newImprovementPrompt = `
ТЫ: Эксперт IELTS Writing, улучшаешь тексты студентов до уровня 7.0

ЗАДАЧА: Улучшить текст и дать 5 практических советов в новом формате с примерами из реального текста пользователя.

ОБЯЗАТЕЛЬНЫЙ ФОРМАТ ОТВЕТА:
{
  "improved_text": "улучшенный текст на английском",
  "writing_advice": [
    {
      "number": "1️⃣",
      "title": "Сделай позицию чёткой и возвращайся к ней в конце",
      "why": "💬 Зачем: IELTS оценивает, насколько ясно ты выражаешь мнение.",
      "how": "🧠 Как: во вступлении пиши фразу, показывающую твою позицию (I strongly believe / I personally prefer / I am convinced that…).",
      "example_bad": "цитата из оригинального текста пользователя",
      "example_good": "исправленная версия этой же цитаты", 
      "action": "🪄 Что делать: начни первое предложение с позиции, и повтори её в последней строке заключения другими словами."
    },
    {
      "number": "2️⃣", 
      "title": "Разделяй текст на 3 блока: вступление — аргументы — вывод",
      "why": "💬 Зачем: Экзаменатор проверяет структуру (Coherence & Cohesion).",
      "how": "🧠 Как:\\n\\nВступление → идея + мнение.\\n\\nОсновная часть → 2 причины с примерами.\\n\\nЗаключение → обобщение и финальная мысль.",
      "example_bad": "цитата из оригинального текста пользователя",
      "example_good": "исправленная версия этой же цитаты",
      "action": "🪄 Что делать: проверь, что у тебя есть четкие границы между частями текста."
    },
    {
      "number": "3️⃣",
      "title": "Добавляй связки, чтобы текст \\"тёк\\" естественно",
      "why": "💬 Зачем: Без связок текст кажется \\"кусочным\\".",  
      "how": "🧠 Как: Используй разные типы:\\n\\nУступка: Although, Even though\\n\\nПротивопоставление: However, On the other hand\\n\\nПричина/следствие: Because, As a result, Therefore\\n\\nВремя: When, After, Before",
      "example_bad": "цитата из оригинального текста пользователя",
      "example_good": "исправленная версия этой же цитаты",
      "action": "🪄 Что делать: найди места, где можно добавить linking words."
    },
    {
      "number": "4️⃣",
      "title": "Укрепляй словарь — 3 новых слова по теме",
      "why": "💬 Зачем: Lexical Resource даёт +0.5–1 балл.",
      "how": "🧠 Как: выбирай синонимы и устойчивые выражения по теме.",
      "example_bad": "цитата из оригинального текста пользователя",
      "example_good": "исправленная версия этой же цитаты",
      "action": "🪄 Что делать: после каждого текста выписывай 3 новых слова и попробуй использовать их в следующем."
    },
    {
      "number": "5️⃣",
      "title": "Добавь \\"гибкую грамматику\\" — хотя бы одно сложное предложение",
      "why": "💬 Зачем: Grammatical Range = обязательный критерий Band 7+.",
      "how": "🧠 Как:\\n\\nИспользуй Although / While / Because для сложных предложений.\\n\\nДобавь условное или причастное:\\nIf I go to bed early, I can't focus well.\\nFeeling tired, I prefer working at night.",
      "example_bad": "цитата из оригинального текста пользователя", 
      "example_good": "исправленная версия этой же цитаты",
      "action": "🪄 Что делать: найди простые предложения и объедини их в сложные."
    }
  ],
  "vocabulary_words": [
    {
      "word": "слово",
      "translation": "перевод", 
      "example": "предложение с этим словом на английском"
    }
  ]
}

КРИТИЧЕСКИ ВАЖНО:
- Все примеры example_bad и example_good должны быть ИЗ РЕАЛЬНОГО ТЕКСТА пользователя
- vocabulary_words - 5 слов релевантных теме текста пользователя
- improved_text только на английском
- Все остальное только на русском
- Возвращай ТОЛЬКО JSON!
`;

// Новая функция отображения улучшенной версии
async function newShowImprovedVersion(ctx, session) {
  const improved = session.improvedText;
  
  if (!improved || !improved.improved_text) {
    return;
  }
  
  try {
    // Часть 1: Улучшенный текст
    let message1 = `✨ <b>Улучшенная версия (IELTS 7.0 уровень):</b>\n\n`;
    message1 += `<i>${improved.improved_text}</i>`;
    
    await ctx.reply(message1, { parse_mode: 'HTML' });
    
    // Часть 2: Советы в новом формате
    if (improved.writing_advice && improved.writing_advice.length > 0) {
      for (const advice of improved.writing_advice) {
        let adviceMessage = `${advice.number} <b>${advice.title}</b>\n\n`;
        adviceMessage += `${advice.why}\n\n`;
        adviceMessage += `${advice.how}\n\n`;
        adviceMessage += `✍️ <b>Пример:</b>\n`;
        adviceMessage += `❌ ${advice.example_bad}\n`;
        adviceMessage += `✅ ${advice.example_good}\n\n`;
        adviceMessage += `${advice.action}`;
        
        await ctx.reply(adviceMessage, { parse_mode: 'HTML' });
      }
    }
    
    // Часть 3: Словарь
    if (improved.vocabulary_words && improved.vocabulary_words.length > 0) {
      let vocabMessage = `📚 <b>Топ-5 слов для этой темы:</b>\n\n`;
      improved.vocabulary_words.forEach((vocab, index) => {
        vocabMessage += `${index + 1}. <b>${vocab.word}</b> - ${vocab.translation}\n`;
        vocabMessage += `   <i>${vocab.example}</i>\n\n`;
      });
      
      await ctx.reply(vocabMessage, { parse_mode: 'HTML' });
    }
    
    // Финальное сообщение с кнопками
    await ctx.reply('✅ Анализ завершен! Что дальше?', { 
      reply_markup: new Keyboard()
        .text('📝 Выполнить упражнения')
        .row()
        .text('➡️ Продолжить к следующему этапу')
        .row()
        .oneTime()
        .resized()
    });
    
  } catch (error) {
    console.error('Error in newShowImprovedVersion:', error);
    // Fallback - простое сообщение
    await ctx.reply('✨ Улучшенная версия готова! К сожалению, произошла ошибка при отправке полного анализа.', {
      reply_markup: new Keyboard()
        .text('➡️ Продолжить к следующему этапу')
        .row()
        .oneTime()
        .resized()
    });
  }
}