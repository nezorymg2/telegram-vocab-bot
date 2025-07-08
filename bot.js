require('dotenv').config({ path: __dirname + '/.env' });
console.log('DEBUG: BOT_TOKEN:', process.env.BOT_TOKEN);
console.log('DEBUG: OPENAI_API_KEY:', process.env.OPENAI_API_KEY);
const { Bot, Keyboard } = require('grammy');
const { Low } = require('lowdb');
const JSONFile = require('lowdb/node').JSONFile;
const axios = require('axios');
const fs = require('fs');

const sessions = {};
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: {} });

async function initDB() {
  await db.read();
  if (!db.data) db.data = { users: {} };
  await db.write();
}

const bot = new Bot(process.env.BOT_TOKEN);

// Главное меню
const mainMenu = new Keyboard()
  .text('Добавить новое слово')
  .text('Повторить слова')
  .row()
  .text('Добавить новые слова из ...')
  .row();

// Меню выбора источника новых слов
const addWordsMenu = new Keyboard()
  .text('General words 3000')
  .text('Ielts must-have words')
  .row()
  .text('Назад в меню')
  .row();

// Клавиатура для выбора уровня AI-слов
const aiLevelsMenu = new Keyboard()
  .text('Preintermediate')
  .text('Intermediate, Upper Intermediate')
  .row()
  .text('Advanced, Influenced')
  .text('Ielts слова')
  .row();

// Загрузка словаря oxford3000.json
let oxford3000 = [];
try {
  oxford3000 = JSON.parse(fs.readFileSync('oxford3000.json', 'utf8'));
} catch (e) {
  console.error('Не удалось загрузить oxford3000.json:', e);
}

// Загрузка словаря IELTS must-have
let ieltsWords = [];
try {
  ieltsWords = JSON.parse(fs.readFileSync('ielts.json', 'utf8'));
} catch (e) {
  console.error('Не удалось загрузить ielts.json:', e);
}

// Функция для выделения первых двух слов
function getFirstTwoWords(str) {
  return str.split(/\s+/).slice(0, 2).join(' ');
}

// Функция для генерации клавиатуры с разделами oxford3000
const getOxfordSectionsMenu = () => {
  const sections = Array.from(new Set(oxford3000.map(w => w.section)));
  const rows = sections.map(s => [s]);
  return Keyboard.from(rows).row();
};

// /start — начало сеанса
bot.command('start', async (ctx) => {
  await initDB();
  const userId = ctx.from.id;
  sessions[userId] = { step: 'awaiting_password' };
  await ctx.reply('Введите пароль:');
});

// /menu — возвращает в главное меню из любого шага после логина
bot.command('menu', async (ctx) => {
  await initDB();
  const userId = ctx.from.id;
  const session = sessions[userId];

  // Если не авторизован или ещё на этапе ввода пароля
  if (!session || session.step === 'awaiting_password' || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }

  // Сохраняем только профиль, сбрасываем все остальные данные
  const profile = session.profile;
  sessions[userId] = { step: 'main_menu', profile };

  return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
});

// --- Команда /stats: статистика по профилям ---
bot.command('stats', async (ctx) => {
  await initDB();
  const users = db.data.users || {};
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Object.keys(users).length === 0) {
    return ctx.reply('Нет данных по профилям.');
  }
  for (const profile of Object.keys(users)) {
    const words = users[profile] || [];
    const total = words.length;
    const newWords = words.filter(w => (w.correct ?? 0) <= 2).length;
    const learning = words.filter(w => (w.correct ?? 0) >= 3 && (w.correct ?? 0) <= 4).length;
    const mastered = words.filter(w => (w.correct ?? 0) >= 5).length;
    const addedWeek = words.filter(w => w.addedAt && new Date(w.addedAt) >= weekAgo).length;
    const addedMonth = words.filter(w => w.addedAt && new Date(w.addedAt) >= monthAgo).length;
    let msg = `<b>Статистика для профиля: ${profile}</b>\n`;
    msg += `Всего слов: <b>${total}</b>\n`;
    msg += `Новых (correct ≤ 2): <b>${newWords}</b>\n`;
    msg += `Более-менее знает (correct 3–4): <b>${learning}</b>\n`;
    msg += `Знает отлично (correct ≥ 5): <b>${mastered}</b>\n`;
    msg += `Добавлено за неделю: <b>${addedWeek}</b>\n`;
    msg += `Добавлено за месяц: <b>${addedMonth}</b>`;
    await ctx.reply(msg, { parse_mode: 'HTML' });
  }
});

// Обработка любых текстовых сообщений
bot.on('message:text', async (ctx) => {
  await initDB();
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const normalized = text.toLowerCase();

  // Проверка на команду /menu в любом состоянии
  if (normalized === '/menu') {
    const session = sessions[userId];
    if (!session || session.step === 'awaiting_password' || !session.profile) {
      return ctx.reply('Сначала выполните /start');
    }
    const profile = session.profile;
    sessions[userId] = { step: 'main_menu', profile };
    return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
  }

  // Убедимся, что сессия инициализирована
  if (!sessions[userId]) {
    sessions[userId] = { step: 'awaiting_password' };
  }
  const session = sessions[userId];
  const step = session.step;

  console.log(`DEBUG: ${userId} | STEP: ${step} | TEXT: "${text}"`);

  // Шаг 1: ввод пароля
  if (step === 'awaiting_password') {
    const allowed = ['123', 'Aminur777'];
    if (allowed.includes(text)) {
      session.step = 'awaiting_profile';
      return ctx.reply('Выберите профиль:', {
        reply_markup: {
          keyboard: [['Амина', 'Нурболат']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else {
      return ctx.reply('Неверный пароль. Попробуйте снова:');
    }
  }

  // Шаг 2: выбор профиля
  if (step === 'awaiting_profile') {
    session.profile = text;
    session.step = 'main_menu';
    db.data.users[session.profile] ||= [];
    await db.write();
    return ctx.reply(`Вы вошли как ${session.profile}`, {
      reply_markup: mainMenu,
    });
  }

  // Главное меню: добавить / повторить
  if (step === 'main_menu') {
    if (normalized === 'добавить новое слово') {
      session.step = 'awaiting_english';
      return ctx.reply('Напиши слово на английском:');
    }
    if (normalized === 'повторить слова') {
      session.step = 'repeat_menu';
      return ctx.reply('Выберите режим повторения:', {
        reply_markup: new Keyboard()
          .text('Повторить все слова')
          .text('Повторить слова из 3000')
          .row()
          .text('Повторить IELTS-слова')
          .row()
          .text('Назад в меню')
          .row()
      });
    }
    if (normalized === 'добавить новые слова из ...') {
      session.step = 'add_words_menu';
      return ctx.reply('Выберите источник новых слов:', {
        reply_markup: addWordsMenu,
      });
    }
    // Если текст не из меню — показываем меню снова
    return ctx.reply('Выберите действие из меню:', {
      reply_markup: mainMenu,
    });
  }

  // Меню выбора источника новых слов
  if (step === 'add_words_menu') {
    if (text === 'General words 3000') {
      session.step = 'awaiting_oxford_section';
      return ctx.reply('Выбери, какие слова ты хочешь сегодня выучить:', {
        reply_markup: getOxfordSectionsMenu(),
      });
    }
    if (text === 'Ielts must-have words') {
      // Сразу добавляем IELTS-слова, не меняем step и не ждём следующего сообщения
      // Уже изученные слова пользователя (по word)
      const userWords = db.data.users[session.profile] || [];
      const known = new Set(userWords.map(w => w.word.toLowerCase()));
      // Оставляем только новые слова (по первым двум словам)
      const newWords = ieltsWords.filter(w => !known.has(getFirstTwoWords(w.word).toLowerCase()));
      if (newWords.length === 0) {
        session.step = 'main_menu';
        return ctx.reply('Все IELTS-слова уже были добавлены!', { reply_markup: mainMenu });
      }
      // Берём до 20 случайных новых слов
      const pick = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);
      const toAdd = pick(newWords, 20).map(w => ({ ...w, word: getFirstTwoWords(w.word) }));
      // Запрос к ChatGPT для объяснений и примеров
      const prompt = `Для каждого из этих английских слов: [${toAdd.map(w => w.word).join(', ')}] укажи перевод на русский, очень короткое объяснение (на русском, не более 10 слов), пример на английском и перевод примера. Верни только массив JSON вида [{\"word\": \"example\", \"translation\": \"пример\", \"explanation\": \"краткое объяснение\", \"example\": \"This is an example.\", \"example_translation\": \"Это пример.\"}, ...]. Не добавляй ничего лишнего, только массив.`;
      await ctx.reply('Запрашиваю объяснения и примеры у AI, подождите...');
      try {
        console.log('DEBUG: IELTS prompt:', prompt);
        const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 2000
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('DEBUG: IELTS gptRes.data:', gptRes.data);
        let words = [];
        const match = gptRes.data.choices[0].message.content.match(/\[.*\]/s);
        if (match) {
          words = JSON.parse(match[0]);
        } else {
          throw new Error('AI не вернул массив слов.');
        }
        db.data.users[session.profile].push(...words.map(w => ({
          word: getFirstTwoWords(w.word),
          translation: w.translation,
          correct: 0,
          section: 'IELTS',
          addedAt: new Date().toISOString()
        })));
        await db.write();
        session.step = 'main_menu';
        // Формируем сообщения для пользователя по 5 слов в каждом
        let msgParts = [];
        for (let i = 0; i < words.length; i += 5) {
          const chunk = words.slice(i, i + 5);
          let msg = 'Добавлены IELTS-слова с объяснением и примерами:\n';
          msg += chunk.map(w => `\n<b>${w.word}</b> — ${w.translation}\n${w.explanation}\nПример: ${w.example}\nПеревод: ${w.example_translation}`).join('\n');
          msgParts.push(msg);
        }
        for (const part of msgParts) {
          await ctx.reply(part, { reply_markup: mainMenu, parse_mode: 'HTML' });
        }
      } catch (e) {
        session.step = 'main_menu';
        let errorMsg = 'Ошибка при получении объяснений через AI. Попробуйте позже.';
        if (e.response && e.response.data && e.response.data.error && e.response.data.error.message) {
          errorMsg += `\n\nAI ответил: ${e.response.data.error.message}`;
        } else if (e.message) {
          errorMsg += `\n\n${e.message}`;
        }
        console.error('IELTS AI error:', e);
        return ctx.reply(errorMsg, { reply_markup: mainMenu });
      }
      return;
    }
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    return ctx.reply('Выберите источник новых слов:', {
      reply_markup: addWordsMenu,
    });
  }

  // Обработка ответов на повторение слов
  if (step === 'waiting_answer') {
    const wordObj = session.wordsToRepeat[session.currentIndex];
    let correct, answer;
    if (wordObj.direction === 'en-ru') {
      correct = wordObj.translation.toLowerCase();
      answer = normalized;
    } else {
      correct = wordObj.word.toLowerCase();
      answer = normalized;
    }
    const all = db.data.users[session.profile];
    const idx = all.findIndex(w =>
      w.word === wordObj.word && w.translation === wordObj.translation
    );

    // --- Работа над ошибками ---
    if (!session.mistakes) session.mistakes = [];
    if (!session.mistakeCounts) session.mistakeCounts = {};

    if (answer === correct) {
      await ctx.reply('✅ Верно!');
      if (idx !== -1) all[idx].correct = (all[idx].correct || 0) + 1;
    } else {
      await ctx.reply(`❌ Неверно. Правильный ответ: ${correct}`);
      if (idx !== -1) all[idx].correct = 0;
      // Добавляем ошибку, если ещё не добавляли
      const key = wordObj.word + '|' + wordObj.translation;
      if (!session.mistakes.find(w => w.word === wordObj.word && w.translation === wordObj.translation)) {
        session.mistakes.push({ ...wordObj, direction: wordObj.direction });
        session.mistakeCounts[key] = 0;
      }
    }
    await db.write();

    session.currentIndex++;
    if (session.currentIndex < session.wordsToRepeat.length) {
      const next = session.wordsToRepeat[session.currentIndex];
      const question = next.direction === 'en-ru'
        ? `Как переводится слово: "${next.word}"?`
        : `Как по-английски: "${next.translation}"?`;
      return ctx.reply(question);
    } else if (session.mistakes.length > 0) {
      // Переходим к работе над ошибками
      session.step = 'work_on_mistakes';
      session.mistakeIndex = 0;
      session.mistakeTries = 0;
      const firstMistake = session.mistakes[0];
      const question = firstMistake.direction === 'en-ru'
        ? `Как переводится слово: "${firstMistake.word}"?`
        : `Как по-английски: "${firstMistake.translation}"?`;
      await ctx.reply('Работа над ошибками! Сейчас повторим слова, в которых были ошибки. Правильные ответы не будут учтены в базе.');
      return ctx.reply(question);
    } else {
      // --- Изменение: если повторение по разделу или IELTS, то только перевод, без sentence_task ---
      if (session.repeatMode === 'oxford_section' || session.repeatMode === 'ielts') {
        session.step = 'main_menu';
        return ctx.reply('📘 Повторение завершено!', {
          reply_markup: mainMenu,
        });
      }
      // После обычного завершения повторения — sentence_task, если есть новые слова (только для Повторить все слова)
      const allUserWords = db.data.users[session.profile] || [];
      const newWords = allUserWords.filter(w => w.correct <= 2).slice(0, 7);
      if (newWords.length > 0) {
        session.sentenceTaskWords = newWords;
        session.sentenceTaskIndex = 0;
        session.step = 'sentence_task';
        await ctx.reply(`Теперь напиши предложения с новыми словами (${newWords.length}): по одному предложению на слово. Пиши по одному предложению на английском.`);
        await ctx.reply(`Первое слово: "${newWords[0].word}". Напиши предложение с этим словом на английском:`);
        return;
      } else {
        session.step = 'main_menu';
        return ctx.reply('📘 Повторение завершено!', {
          reply_markup: mainMenu,
        });
      }
    }
  }

  // --- Работа над ошибками ---
  if (step === 'work_on_mistakes') {
    const mistakes = session.mistakes;
    let idx = session.mistakeIndex || 0;
    let tries = session.mistakeTries || 0;
    if (idx >= mistakes.length) {
      // --- Изменение: если повторение по разделу или IELTS, то только перевод, без sentence_task ---
      if (session.repeatMode === 'oxford_section' || session.repeatMode === 'ielts') {
        session.step = 'main_menu';
        delete session.mistakes;
        delete session.mistakeCounts;
        delete session.mistakeIndex;
        delete session.mistakeTries;
        return ctx.reply('Работа над ошибками завершена! Возвращаемся в меню.', { reply_markup: mainMenu });
      }
      // После работы над ошибками — sentence_task, если есть новые слова
      const allUserWords = db.data.users[session.profile] || [];
      const newWords = allUserWords.filter(w => w.correct <= 2).slice(0, 7);
      if (newWords.length > 0) {
        session.sentenceTaskWords = newWords;
        session.sentenceTaskIndex = 0;
        session.step = 'sentence_task';
        await ctx.reply(`Теперь напиши предложения с новыми словами (${newWords.length}): по одному предложению на слово. Пиши по одному предложению на английском.`);
        await ctx.reply(`Первое слово: "${newWords[0].word}". Напиши предложение с этим словом на английском:`);
        // Очищаем старые поля
        delete session.mistakes;
        delete session.mistakeCounts;
        delete session.mistakeIndex;
        delete session.mistakeTries;
        return;
      } else {
        session.step = 'main_menu';
        delete session.mistakes;
        delete session.mistakeCounts;
        delete session.mistakeIndex;
        delete session.mistakeTries;
        return ctx.reply('Работа над ошибками завершена! Возвращаемся в меню.', { reply_markup: mainMenu });
      }
    }
    const wordObj = mistakes[idx];
    let correct, answer;
    if (wordObj.direction === 'en-ru') {
      correct = wordObj.translation.toLowerCase();
      answer = normalized;
    } else {
      correct = wordObj.word.toLowerCase();
      answer = normalized;
    }
    const key = wordObj.word + '|' + wordObj.translation;
    if (answer === correct) {
      await ctx.reply('✅ Верно!');
      // Следующее слово
      session.mistakeIndex = idx + 1;
      session.mistakeTries = 0;
    } else {
      // Не показываем правильный ответ!
      session.mistakeTries = tries + 1;
      if (session.mistakeTries >= 3) {
        await ctx.reply('3 ошибки подряд. Переходим к следующему слову.');
        session.mistakeIndex = idx + 1;
        session.mistakeTries = 0;
      } else {
        await ctx.reply('❌ Неверно. Попробуйте ещё раз!');
      }
    }
    // Следующий вопрос или завершение
    if (session.mistakeIndex < mistakes.length) {
      const next = mistakes[session.mistakeIndex];
      const question = next.direction === 'en-ru'
        ? `Как переводится слово: "${next.word}"?`
        : `Как по-английски: "${next.translation}"?`;
      return ctx.reply(question);
    } else if (session.mistakeIndex >= mistakes.length) {
      // --- Изменение: если повторение по разделу или IELTS, то только перевод, без sentence_task ---
      if (session.repeatMode === 'oxford_section' || session.repeatMode === 'ielts') {
        session.step = 'main_menu';
        delete session.mistakes;
        delete session.mistakeCounts;
        delete session.mistakeIndex;
        delete session.mistakeTries;
        return ctx.reply('Работа над ошибками завершена! Возвращаемся в меню.', { reply_markup: mainMenu });
      }
      // После работы над ошибками — sentence_task, если есть новые слова
      const allUserWords = db.data.users[session.profile] || [];
      const newWords = allUserWords.filter(w => w.correct <= 2).slice(0, 7);
      if (newWords.length > 0) {
        session.sentenceTaskWords = newWords;
        session.sentenceTaskIndex = 0;
        session.step = 'sentence_task';
        await ctx.reply(`Теперь напиши предложения с новыми словами (${newWords.length}): по одному предложению на слово. Пиши по одному предложению на английском.`);
        await ctx.reply(`Первое слово: "${newWords[0].word}". Напиши предложение с этим словом на английском:`);
        // Очищаем старые поля
        delete session.mistakes;
        delete session.mistakeCounts;
        delete session.mistakeIndex;
        delete session.mistakeTries;
        return;
      } else {
        session.step = 'main_menu';
        delete session.mistakes;
        delete session.mistakeCounts;
        delete session.mistakeIndex;
        delete session.mistakeTries;
        return ctx.reply('Работа над ошибками завершена! Возвращаемся в меню.', { reply_markup: mainMenu });
      }
    }
  }

  // Добавление нового слова
  if (step === 'awaiting_english') {
    session.newWord = text;
    session.step = 'awaiting_translation';
    return ctx.reply('Теперь введите перевод:');
  }

  if (step === 'awaiting_translation') {
    const word = session.newWord;
    const translation = text;
    db.data.users[session.profile].push({ word, translation, correct: 0, addedAt: new Date().toISOString() });
    await db.write();
    session.step = 'main_menu';
    return ctx.reply('Слово добавлено!', {
      reply_markup: mainMenu,
    });
  }

  // Выбор раздела для добавления 20 слов из 3000
  if (step === 'awaiting_oxford_section') {
    const section = text.trim();
    const sectionWords = oxford3000.filter(w => w.section === section);
    if (!sectionWords.length) {
      // step не меняем, остаёмся на 'awaiting_oxford_section'
      return ctx.reply('В этом разделе нет слов. Выберите другой раздел.', { reply_markup: getOxfordSectionsMenu() });
    }
    // Уже изученные слова пользователя (по word)
    const userWords = db.data.users[session.profile] || [];
    const known = new Set(userWords.map(w => w.word.toLowerCase()));
    // Оставляем только новые слова
    const newWords = sectionWords.filter(w => !known.has(w.word.toLowerCase()));
    if (newWords.length === 0) {
      // step не меняем, остаёмся на 'awaiting_oxford_section'
      return ctx.reply('Все слова из этого раздела уже были добавлены!', { reply_markup: getOxfordSectionsMenu() });
    }
    // Берём до 20 случайных новых слов
    const pick = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);
    // Функция для выделения основной формы слова
    function getMainForm(word) {
      return word.split(/[ (]/)[0].trim();
    }
    // Используем только основную форму для ChatGPT и для сохранения
    const toAdd = pick(newWords, 20).map(w => ({ ...w, word: getMainForm(w.word) }));
    // Запрос к ChatGPT для объяснений и примеров
    const prompt = `Для каждого из этих английских слов: [${toAdd.map(w => w.word).join(', ')}] укажи перевод на русский, очень короткое объяснение (на русском, не более 10 слов), пример на английском и перевод примера. Верни только массив JSON вида [{"word": "example", "translation": "пример", "explanation": "краткое объяснение", "example": "This is an example.", "example_translation": "Это пример."}, ...]. Не добавляй ничего лишнего, только массив.`;
    await ctx.reply('Запрашиваю объяснения и примеры у AI, подождите...');
    try {
      console.log('DEBUG: prompt to ChatGPT:', prompt);
      console.log('DEBUG: OPENAI_API_KEY in axios:', process.env.OPENAI_API_KEY);
      const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('DEBUG: gptRes.data:', gptRes.data);
      let words = [];
      const match = gptRes.data.choices[0].message.content.match(/\[.*\]/s);
      if (match) {
        words = JSON.parse(match[0]);
      } else {
        throw new Error('AI не вернул массив слов.');
      }
      // Сохраняем только word, translation, correct, section
      db.data.users[session.profile].push(...words.map(w => ({
        word: getMainForm(w.word),
        translation: w.translation,
        correct: 0,
        section: section,
        addedAt: new Date().toISOString()
      })));
      await db.write();
      session.step = 'main_menu';
      // Формируем сообщения для пользователя по 5 слов в каждом
      let msgParts = [];
      for (let i = 0; i < words.length; i += 5) {
        const chunk = words.slice(i, i + 5);
        let msg = 'Добавлены слова с объяснением и примерами:\n';
        msg += chunk.map(w => `\n<b>${w.word}</b> — ${w.translation}\n${w.explanation}\nПример: ${w.example}\nПеревод: ${w.example_translation}`).join('\n');
        msgParts.push(msg);
      }
      for (const part of msgParts) {
        await ctx.reply(part, { reply_markup: mainMenu, parse_mode: 'HTML' });
      }
    } catch (e) {
      session.step = 'main_menu';
      let errorMsg = 'Ошибка при получении объяснений через AI. Попробуйте позже.';
      if (e.response && e.response.data && e.response.data.error && e.response.data.error.message) {
        errorMsg += `\n\nAI ответил: ${e.response.data.error.message}`;
      } else if (e.message) {
        errorMsg += `\n\n${e.message}`;
      }
      return ctx.reply(errorMsg, { reply_markup: mainMenu });
    }
  }

  // Меню повторения: выбор режима
  if (step === 'repeat_menu') {
    if (text === 'Повторить все слова') {
      // Старый тест со всеми словами
      const userWords = db.data.users[session.profile] || [];
      const newWords = userWords.filter(w => w.correct <= 2);
      const learning = userWords.filter(w => w.correct >= 3 && w.correct <= 4);
      const mastered = userWords.filter(w => w.correct >= 5);
      const pick = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);
      const wordsToRepeat = [
        ...pick(newWords, 10),
        ...pick(learning, 7),
        ...pick(mastered, 3),
      ].filter(Boolean);
      if (wordsToRepeat.length === 0) {
        session.step = 'main_menu';
        return ctx.reply('Недостаточно слов для теста. Добавьте хотя бы одно.', {
          reply_markup: mainMenu,
        });
      }
      session.wordsToRepeat = wordsToRepeat.map(w => {
        const direction = Math.random() < 0.5 ? 'en-ru' : 'ru-en';
        return { ...w, direction };
      });
      session.currentIndex = 0;
      session.step = 'waiting_answer';
      session.repeatMode = 'all'; // <--- добавлено
      const first = session.wordsToRepeat[0];
      const question = first.direction === 'en-ru'
        ? `Как переводится слово: "${first.word}"?`
        : `Как по-английски: "${first.translation}"?`;
      return ctx.reply(question);
    }
    if (text === 'Повторить слова из 3000') {
      session.step = 'repeat_oxford_section';
      session.repeatMode = 'oxford_section'; // <--- добавлено
      return ctx.reply('Выберите раздел для повторения:', {
        reply_markup: getOxfordSectionsMenu(),
      });
    }
    if (text === 'Повторить IELTS-слова') {
      // Логика повторения IELTS-слов
      const userWords = db.data.users[session.profile] || [];
      const ieltsWordsToRepeat = userWords.filter(w => w.section === 'IELTS');
      if (!ieltsWordsToRepeat.length) {
        session.step = 'repeat_menu';
        return ctx.reply('У вас нет IELTS-слов для повторения. Сначала добавьте их.', {
          reply_markup: mainMenu,
        });
      }
      const newWords = ieltsWordsToRepeat.filter(w => w.correct <= 2);
      const learning = ieltsWordsToRepeat.filter(w => w.correct >= 3 && w.correct <= 4);
      const mastered = ieltsWordsToRepeat.filter(w => w.correct >= 5);
      const pick = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);
      const wordsToRepeat = [
        ...pick(newWords, 10),
        ...pick(learning, 7),
        ...pick(mastered, 3),
      ].filter(Boolean);
      if (wordsToRepeat.length === 0) {
        session.step = 'repeat_menu';
        return ctx.reply('Недостаточно IELTS-слов для теста. Добавьте хотя бы одно.', {
          reply_markup: mainMenu,
        });
      }
      session.wordsToRepeat = wordsToRepeat.map(w => {
        const direction = Math.random() < 0.5 ? 'en-ru' : 'ru-en';
        return { ...w, direction };
      });
      session.currentIndex = 0;
      session.step = 'waiting_answer';
      session.repeatMode = 'ielts'; // <--- добавлено
      const first = session.wordsToRepeat[0];
      const question = first.direction === 'en-ru'
        ? `Как переводится слово: "${first.word}"?`
        : `Как по-английски: "${first.translation}"?`;
      return ctx.reply(question);
    }
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    return ctx.reply('Выберите режим повторения:', {
      reply_markup: new Keyboard()
        .text('Повторить все слова')
        .text('Повторить слова из 3000')
        .row()
        .text('Повторить IELTS-слова')
        .row()
        .text('Назад в меню')
        .row()
    });
  }

  // Повторение слов из выбранного раздела oxford3000
  if (step === 'repeat_oxford_section') {
    const section = text.trim();
    const userWords = db.data.users[session.profile] || [];
    const sectionWords = userWords.filter(w => w.section === section);
    if (!sectionWords.length) {
      session.step = 'repeat_menu';
      return ctx.reply('У вас нет слов из этого раздела. Сначала добавьте их.', {
        reply_markup: getOxfordSectionsMenu(),
      });
    }
    const newWords = sectionWords.filter(w => w.correct <= 2);
    const learning = sectionWords.filter(w => w.correct >= 3 && w.correct <= 4);
    const mastered = sectionWords.filter(w => w.correct >= 5);
    const pick = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);
    const wordsToRepeat = [
      ...pick(newWords, 10),
      ...pick(learning, 7),
      ...pick(mastered, 3),
    ].filter(Boolean);
    if (wordsToRepeat.length === 0) {
      session.step = 'repeat_menu';
      return ctx.reply('Недостаточно слов для теста в этом разделе. Добавьте хотя бы одно.', {
        reply_markup: getOxfordSectionsMenu(),
      });
    }
    session.wordsToRepeat = wordsToRepeat.map(w => {
      const direction = Math.random() < 0.5 ? 'en-ru' : 'ru-en';
      return { ...w, direction };
    });
    session.currentIndex = 0;
    session.step = 'waiting_answer';
    session.repeatMode = 'oxford_section'; // <--- добавлено
    const first = session.wordsToRepeat[0];
    const question = first.direction === 'en-ru'
      ? `Как переводится слово: "${first.word}"?`
      : `Как по-английски: "${first.translation}"?`;
    return ctx.reply(question);
  }

  // --- Задание: предложения с новыми словами ---
  if (step === 'sentence_task') {
    const idx = session.sentenceTaskIndex || 0;
    const words = session.sentenceTaskWords || [];
    if (idx >= words.length) {
      // Story_task всегда запускается: берем слова из lastWordsToRepeat, wordsToRepeat или sentenceTaskWords
      const storyWords = (session.lastWordsToRepeat || session.wordsToRepeat || session.sentenceTaskWords || []).map(w => w.word);
      if (storyWords.length > 0) {
        session.storyTaskWords = storyWords;
        session.step = 'story_task';
        // Явное сообщение перед генерацией текста
        await ctx.reply('Сейчас будет задание на понимание текста. Генерирую текст...');
        // Сформировать промпт для ChatGPT
        const prompt = `Ты — опытный преподаватель английского языка.\n\nНапиши небольшой текст на английском языке из 10-15 предложений.\nВ этом тексте обязательно используй ВСЕ следующие слова, выделяя их жирным (используй двойные звёздочки **): [${storyWords.join(', ')}].\n\nТекст должен быть логичным, естественным и подходящим для уровня intermediate (B1–B2).\n\nПосле текста создай 5 вопросов по нему, соблюдая следующее правило:\n- 1 вопрос на общее понимание текста (General understanding).\n- 1 вопрос на проверку конкретных деталей из текста (Specific details).\n- 1 вопрос на проверку понимания слов в контексте (Vocabulary in context).\n- 1 вопрос на логическое умозаключение (Inference question).\n- 1 вопрос на выявление причинно-следственной связи (Cause and effect).\n\nК каждому вопросу обязательно дай ровно 5 вариантов ответов (1 правильный и 4 дистрактора, порядок случайный).\n\nОтвет должен быть строго в формате JSON без дополнительного текста и комментариев:\n{\n  "text": "сгенерированный текст",\n  "questions": [\n    {\n      "type": "General understanding",\n      "question": "Текст вопроса...",\n      "options": ["вариант1", ...],\n      "correct_option": "правильный вариант"\n    }, ...\n  ]\n}`;
        try {
          const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000
          }, {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          });
          let answer = gptRes.data.choices[0].message.content;
          const match = answer.match(/\{[\s\S]*\}/);
          if (!match) throw new Error('AI не вернул JSON.');
          const storyData = JSON.parse(match[0]);
          session.storyText = storyData.text;
          session.storyQuestions = storyData.questions;
          session.storyQuestionIndex = 0;
          // --- Удаляем все **звёздочки** из текста ---
          let storyText = storyData.text.replace(/\*\*(.*?)\*\*/g, '$1');
          // --- Жирное выделение слов в тексте ---
          if (session.storyTaskWords && Array.isArray(session.storyTaskWords)) {
            for (const w of session.storyTaskWords) {
              const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi');
              storyText = storyText.replace(re, '<b>$&</b>');
            }
          }
          await ctx.reply('Вот текст для чтения:\n' + storyText, { parse_mode: 'HTML' });
          // --- Проверка наличия вопросов и опций ---
          if (!Array.isArray(storyData.questions) || !storyData.questions.length) {
            console.error('AI не вернул вопросы! Ответ:', answer);
            session.step = 'sentence_task';
            await ctx.reply('Ошибка: AI не вернул вопросы к тексту. Попробуйте ещё раз отправить любое сообщение, чтобы сгенерировать тест заново.', { reply_markup: mainMenu });
            return;
          }
          const q = storyData.questions[0];
          if (!Array.isArray(q.options) || !q.options.length) {
            console.error('AI не вернул опции для первого вопроса! Ответ:', answer);
            session.step = 'sentence_task';
            await ctx.reply('Ошибка: AI не вернул варианты ответов для первого вопроса. Попробуйте ещё раз отправить любое сообщение, чтобы сгенерировать тест заново.', { reply_markup: mainMenu });
            return;
          }
          session.step = 'story_quiz';
          await ctx.reply(`Вопрос 1/5: ${q.question}`, {
            reply_markup: Keyboard.from(q.options.map(opt => [opt]), { one_time_keyboard: true, resize_keyboard: true })
          });
        } catch (e) {
          session.step = 'main_menu';
          let errorMsg = 'Ошибка при генерации текста через AI. Попробуйте позже.';
          if (e.response && e.response.data && e.response.data.error && e.response.data.error.message) {
            errorMsg += `\n\nAI ответил: ${e.response.data.error.message}`;
          } else if (e.message) {
            errorMsg += `\n\n${e.message}`;
          }
          await ctx.reply(errorMsg, { reply_markup: mainMenu });
        }
        return;
      } else {
        // Если нет слов для текста — просто ничего не делаем, не возвращаемся в меню и не пишем сообщение
        delete session.sentenceTaskWords;
        delete session.sentenceTaskIndex;
        return;
      }
    }
    const wordObj = words[idx];
    const sentence = text;
    // Промпт для ChatGPT
    const prompt = `Ты — учитель английского языка. Твоя задача — подробно проверить, правильно ли использовано слово '${wordObj.word}' в предложении: '${sentence}'.\n\nОцени по критериям:\n- Грамматическая корректность.\n- Правильность и уместность слова в контексте.\n- Естественность звучания предложения.\n\nОтвет должен быть строго в формате JSON:\n{\n  "ok": true или false,\n  "explanation": "Подробное, но краткое объяснение на русском (до 6 предложений), что именно неправильно или правильно, как исправить ошибку и на что обратить внимание.\",\n  "example": \"Обязательный пример правильного использования этого слова в предложении на английском с переводом на русский. Формат: 'Example: ... (Перевод: ...)'\"\n}\n\nНе добавляй никакого текста помимо JSON.`;
    await ctx.reply('Проверяю предложение через AI, подождите...');
    try {
      const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      let answer = gptRes.data.choices[0].message.content;
      // Ищем JSON в ответе
      const match = answer.match(/\{[\s\S]*\}/);
      let result = null;
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw new Error('AI не вернул JSON.');
      }
      // Обновляем correct
      const all = db.data.users[session.profile];
      const userWordIdx = all.findIndex(w => w.word === wordObj.word && w.translation === wordObj.translation);
      if (userWordIdx !== -1) {
        if (result.ok === true) {
          all[userWordIdx].correct = Math.max((all[userWordIdx].correct || 0) + 1, 0);
        } else {
          all[userWordIdx].correct = Math.max((all[userWordIdx].correct || 0) - 1, 0);
        }
        await db.write();
      }
      // Явная обратная связь по JSON-ответу
      if (result.ok === true) {
        await ctx.reply('✅ Хорошо! Предложение правильно использует слово!');
      } else {
        await ctx.reply('❌ Увы не правильно использовали слово в предложении. Вот что AI говорит:');
      }
      await ctx.reply(result.explanation);
      // Показываем пример правильного использования (если есть)
      if (result.example) {
        await ctx.reply(result.example);
      }
      // Показываем перевод слова
      await ctx.reply(`Перевод: ${wordObj.translation}`);
    } catch (e) {
      let errorMsg = 'Ошибка при проверке предложения через AI. Попробуйте позже.';
      if (e.response && e.response.data && e.response.data.error && e.response.data.error.message) {
        errorMsg += `\n\nAI ответил: ${e.response.data.error.message}`;
      } else if (e.message) {
        errorMsg += `\n\n${e.message}`;
      }
      await ctx.reply(errorMsg);
    }
    // Следующее слово
    session.sentenceTaskIndex = idx + 1;
    if (session.sentenceTaskIndex < words.length) {
      await ctx.reply(`Следующее слово: "${words[session.sentenceTaskIndex].word}". Напиши предложение с этим словом на английском:`);
    }
    // Больше никакого возврата в меню и сообщения!
    return;
  }

  // --- Story quiz ---
  if (step === 'story_quiz') {
    const idx = session.storyQuestionIndex || 0;
    const questions = session.storyQuestions || [];
    if (!Array.isArray(questions) || !questions.length) {
      session.step = 'sentence_task';
      await ctx.reply('Ошибка: нет вопросов для теста. Попробуйте ещё раз отправить любое сообщение, чтобы сгенерировать тест заново.', { reply_markup: mainMenu });
      return;
    }
    if (idx >= questions.length) {
      session.step = 'main_menu';
      delete session.storyText;
      delete session.storyQuestions;
      delete session.storyQuestionIndex;
      delete session.storyTaskWords;
      return ctx.reply('Тест по тексту завершён! Возвращаемся в меню.', { reply_markup: mainMenu });
    }
    const q = questions[idx];
    if (!Array.isArray(q.options) || !q.options.length) {
      session.step = 'sentence_task';
      await ctx.reply('Ошибка: нет вариантов ответа для вопроса. Попробуйте ещё раз отправить любое сообщение, чтобы сгенерировать тест заново.', { reply_markup: mainMenu });
      return;
    }
    if (!q.options.includes(text)) {
      // Если пользователь ввёл не вариант, а что-то другое
      return ctx.reply('Пожалуйста, выберите один из предложенных вариантов.', {
        reply_markup: Keyboard.from(q.options.map(opt => [opt]), { one_time_keyboard: true, resize_keyboard: true })
      });
    }
    if (text === q.correct_option) {
      await ctx.reply('✅ Верно!');
    } else {
      await ctx.reply(`❌ Неверно. Правильный ответ: ${q.correct_option}`);
    }
    session.storyQuestionIndex = idx + 1;
    if (session.storyQuestionIndex < questions.length) {
      const nextQ = questions[session.storyQuestionIndex];
      if (!Array.isArray(nextQ.options) || !nextQ.options.length) {
        session.step = 'sentence_task';
        await ctx.reply('Ошибка: нет вариантов ответа для следующего вопроса. Попробуйте ещё раз отправить любое сообщение, чтобы сгенерировать тест заново.', { reply_markup: mainMenu });
        return;
      }
      await ctx.reply(`Вопрос ${session.storyQuestionIndex + 1}/${questions.length}: ${nextQ.question}`, {
        reply_markup: Keyboard.from(nextQ.options.map(opt => [opt]), { one_time_keyboard: true, resize_keyboard: true })
      });
    } else {
      session.step = 'main_menu';
      delete session.storyText;
      delete session.storyQuestions;
      delete session.storyQuestionIndex;
      delete session.storyTaskWords;
      await ctx.reply('Тест по тексту завершён! Возвращаемся в меню.', { reply_markup: mainMenu });
    }
    return;
  }

  // На всякий случай: если ничего не подошло
  return ctx.reply('Не понял. Используйте меню или введите /menu.', {
    reply_markup: mainMenu,
  });
});

// Добавим описание команд для Telegram, чтобы при вводе / появлялись подсказки
bot.api.setMyCommands([
  { command: 'menu', description: 'Главное меню' },
  { command: 'start', description: 'Начать/перезапустить бота' },
  { command: 'stats', description: 'Статистика по профилям' },
]);

bot.catch((err) => console.error('Bot error:', err));
bot.start();
