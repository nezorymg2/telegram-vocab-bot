require('dotenv').config({ path: __dirname + '/.env' });
console.log('DEBUG: Environment loaded');
// Не логируем токены в production
if (process.env.NODE_ENV !== 'production') {
  console.log('DEBUG: BOT_TOKEN:', process.env.BOT_TOKEN ? 'Set' : 'Not set');
  console.log('DEBUG: OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'Not set');
}
const { Bot, Keyboard, InputFile } = require('grammy');
const axios = require('axios');
const fs = require('fs');
const cron = require('node-cron');
const { execSync } = require('child_process');
const prisma = require('./database');

// Функция для инициализации базы данных
async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...');
    
    // Сначала пытаемся подключиться к базе данных
    await prisma.$connect();
    console.log('✅ Database connection established');
    
    // Проверяем, существует ли таблица words
    try {
      await prisma.word.findFirst();
      console.log('✅ Database schema is valid');
    } catch (schemaError) {
      console.log('⚠️ Schema validation failed, running migration...');
      
      // Выполняем миграцию с флагом accept-data-loss
      try {
        execSync('npx prisma db push --accept-data-loss', { 
          stdio: 'inherit',
          timeout: 30000 // 30 секунд таймаут
        });
        console.log('✅ Database migration completed successfully');
        
        // Проверяем снова после миграции
        await prisma.word.findFirst();
        console.log('✅ Database schema validated after migration');
        
      } catch (migrationError) {
        console.error('❌ Migration failed:', migrationError.message);
        
        // Пытаемся альтернативным способом
        console.log('🔄 Trying alternative migration approach...');
        try {
          execSync('npx prisma generate', { stdio: 'inherit' });
          execSync('npx prisma db push --force-reset --accept-data-loss', { stdio: 'inherit' });
          console.log('✅ Alternative migration successful');
        } catch (altError) {
          console.error('❌ Alternative migration also failed:', altError.message);
          throw new Error('All migration attempts failed');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.log('⚠️ Bot will continue but database operations may fail...');
    console.log('📋 Please check your DATABASE_URL and database connectivity');
  }
}

// Отладочная информация для проверки Prisma Client
console.log('DEBUG: prisma type:', typeof prisma);
console.log('DEBUG: prisma.word type:', typeof prisma.word);
if (prisma.word) {
  console.log('DEBUG: prisma.word.findMany type:', typeof prisma.word.findMany);
} else {
  console.log('DEBUG: prisma.word is undefined!');
  console.log('DEBUG: available properties:', Object.getOwnPropertyNames(prisma));
}

const sessions = {};

const bot = new Bot(process.env.BOT_TOKEN);

// --- Мотивационные цитаты и напоминания (после объявления bot) ---
const motivationalQuotes = [
  'Учить английский — как строить Колизей: по кирпичику каждый день! 🇮🇹',
  'Сегодняшний труд — завтрашний успех на IELTS!',
  'Даже маленький шаг к мечте — уже движение вперёд!',
  'В Рим ведут все дороги, а к успеху — ежедневная практика!',
  'Лучший день для учёбы — сегодня!',
  'Слово за словом — и ты уже ближе к цели!',
  'Тот, кто учит, тот побеждает!',
  'Секрет успеха — не сдаваться и повторять!',
  'Каждый день — новый шанс стать лучше!',
  'IELTS не сдается без боя!',
  'Нурболат и Амина из Казахстана покорят Италию! Каждый день изучения — шаг к мечте! 🇰🇿🇮🇹✨',
  'От степей Казахстана до холмов Тосканы — ваш путь лежит через английский! 🏞️🇮🇹',
  'Венеция ждет гостей из Казахстана! Нурболат и Амина — будущие покорители каналов! 🛶🇰🇿',
  'Флоренция откроет двери студентам из Казахстана! Английский — ваш ключ! 🏛️🗝️',
  'Рим строился не сразу, и английский тоже! Но казахстанцы справятся! 🏛️⚡🇰🇿',
  'Итальянские университеты готовятся к приезду талантов из Казахстана! 🎓🇮🇹🇰🇿',
  'Каждое выученное слово — билет из Казахстана в итальянскую мечту! ✈️🇰🇿🇮🇹',
  'Ваша итальянская мечта начинается с английского! Нурболат и Амина — команда мечты! 💫🇰🇿',
  'Сегодняшний урок — завтрашний успех в Италии! Форца, казахстанцы! 🇮🇹💪',
  'Колизей ждет ваших селфи с дипломами! Учите английский, друзья из Казахстана! 📸🏛️🇰🇿',
  'Милан, Рим, Флоренция... Италия ждет студентов из Казахстана! 🇮🇹🌟',
  'Тоскана готовится встречать гостей с казахской земли! Вперед к знаниям! 🍇🇰🇿🇮🇹',
  'Каждая выученная фраза приближает вас к итальянским университетам! 📚🇮🇹',
  'Казахстанский дух и итальянская мечта — непобедимая комбинация! 🇰🇿🇮🇹💫',
  'Нурболат и Амина: из Алматы в Рим через английский! Мечты сбываются! 🌟🇰🇿➡️🇮🇹'
];

// Функция получения случайной мотивационной цитаты
function getRandomMotivationalQuote() {
  return motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
}

// --- Система уровней и XP ---
const XP_LEVELS = [
  { level: 1, required_xp: 0, title: '🌱 Новичок', emoji: '🌱' },
  { level: 2, required_xp: 300, title: '🔥 Энтузиаст', emoji: '🔥' },
  { level: 3, required_xp: 800, title: '📚 Студент', emoji: '📚' },
  { level: 4, required_xp: 1500, title: '🎓 Знаток', emoji: '🎓' },
  { level: 5, required_xp: 3000, title: '🏅 Эксперт', emoji: '🏅' },
  { level: 6, required_xp: 6000, title: '👑 Мастер', emoji: '👑' },
  { level: 7, required_xp: 12000, title: '⚡ Гуру', emoji: '⚡' },
  { level: 8, required_xp: 25000, title: '🌟 Легенда', emoji: '🌟' },
  { level: 9, required_xp: 50000, title: '💎 Титан', emoji: '💎' },
  { level: 10, required_xp: 100000, title: '🚀 Гранд Мастер', emoji: '🚀' }
];

// Массивы напоминаний о streak (по степени срочности)

// За 6 часов - спокойные напоминания
const REMINDERS_6H = [
  "📚 Добрый вечер! Не забудь про умное повторение сегодня 🌟",
  "☕ Время для изучения! До конца дня ещё много времени ⏰",
  "😊 Привет! Напоминаю про слова - у тебя ещё есть 6 часов 📖",
  "🌅 Хорошее время для занятий! Твой streak ждёт тебя 🔥",
  "📝 Сегодня уже изучал слова? Если нет - самое время начать! 💪",
  "🎯 Поддержи свой streak! Умное повторение займёт всего несколько минут ⚡",
  "🌸 Приятного дня! И не забудь про ежедневную порцию знаний 🧠",
  "📊 Как твои успехи? Пройди умное повторение и прокачай уровень! 🚀",
  "🌟 Твой streak на хорошем счету! Продолжай в том же духе 💎",
  "📚 Знания - это сила! Пополни словарный запас сегодня 🏆",
  "☀️ Новый день, новые возможности! Время для умного повторения 🌈",
  "🎓 Путь к мастерству продолжается! Не пропускай занятия 🔥"
];

// За 3 часа - настойчивые напоминания
const REMINDERS_3H = [
  "⚠️ Внимание! До слёта streak осталось 3 часа ⏰",
  "🔥 Твой streak в опасности! Пройди умное повторение сейчас 💨",
  "📢 Важное напоминание: у тебя есть 3 часа чтобы сохранить streak! ⚡",
  "🚨 Streak-alert! Осталось 3 часа до полуночи 🌙",
  "💪 Не дай streak'у пропасть! Всего несколько минут на повторение 🎯",
  "⏳ Время идёт! 3 часа до потери streak - действуй! 🔥",
  "🎯 Серьёзно, пора заняться! Твой streak висит на волоске 📚",
  "⚡ Экстренное напоминание: streak слетит через 3 часа! 🚨",
  "🔔 Последний шанс сохранить streak! 3 часа в запасе ⏰",
  "💎 Твой драгоценный streak ждёт внимания! Осталось 3 часа 🌟",
  "🏃‍♂️ Беги заниматься! Streak не будет ждать до завтра ⏳",
  "📞 Срочный вызов: твой streak нуждается в тебе! 3 часа осталось 🔥"
];

// За 1 час - критически срочные напоминания  
const REMINDERS_1H = [
  "🚨 КРИТИЧНО! Streak слетит через 1 час! ДЕЙСТВУЙ СЕЙЧАС! ⚡",
  "💥 ПОСЛЕДНИЙ ЧАС! Спаси свой streak прямо сейчас! 🔥",
  "⏰ 60 МИНУТ ДО КАТАСТРОФЫ! Открывай бота и занимайся! 🚨",
  "🆘 SOS! Твой streak умирает! 1 час до полуночи! 💀",
  "🔥 ФИНАЛЬНЫЙ ОТСЧЁТ! 1 час до потери всего прогресса! ⏳",
  "💣 БОМБА ЗАМЕДЛЕННОГО ДЕЙСТВИЯ! Streak взорвётся через час! 💥",
  "🚀 ЭКСТРЕННАЯ МИССИЯ! Спасти streak за 60 минут! 🎯",
  "⚡ МОЛНИЯ НЕ ДРЕМЛЕТ! 1 час до слёта streak! БЕГИ! 🏃‍♂️",
  "🌋 ИЗВЕРЖЕНИЕ БЛИЗКО! Streak пропадёт через час! 🔥",
  "⚰️ ПОСЛЕДНИЕ 60 МИНУТ жизни твоего streak! 💔",
  "🌪️ ТОРНАДО ПРИБЛИЖАЕТСЯ! 1 час до уничтожения streak! 🌊",
  "💎 СОКРОВИЩЕ ИСЧЕЗНЕТ! Всего 1 час чтобы сохранить streak! ⏰"
];

// Советы для отдыха на английском (20 штук)
const RELAX_TIPS = [
  // Фильмы/сериалы (6)
  "🎬 Посмотри любимый фильм с английскими субтитрами",
  "📺 Включи интересный сериал на английском языке", 
  "🎭 Найди документальный фильм на английском на YouTube",
  "🎪 Посмотри стендап комедию на английском для настроения",
  "🎨 Включи фильм с красивой картинкой на английском",
  "🎵 Посмотри музыкальный фильм или концерт на английском",
  
  // Чтение (5)
  "📚 Прочитай несколько страниц любимой книги на английском",
  "📖 Почитай интересные статьи в английской Википедии", 
  "📰 Пролистай англоязычные новости на любимую тему",
  "📝 Почитай короткие рассказы на английском",
  "📑 Изучи англоязычный блог по интересующей теме",
  
  // Игры (4)
  "🎮 Поиграй в любимую игру с английским интерфейсом",
  "🕹️ Попробуй текстовую игру на английском языке",
  "🎯 Поиграй в слова или кроссворды на английском",
  
  // Музыка/подкасты (3)
  "🎵 Послушай англоязычную музыку с текстами песен",
  "🎧 Включи интересный подкаст на английском языке",
  "🎼 Изучи тексты любимых английских песен",
  
  // Интернет-активности (2)
  "💻 Посмотри видео на английском на интересную тему",
  "🌐 Пообщайся на английском в международных чатах"
];

// Массив тем для письменного задания (50 тем, уровень A2-B2)
const WRITING_TOPICS = [
  // Повседневные ситуации
  "My typical day: Describe your usual daily routine from morning to evening",
  "A visit to the supermarket: Write about your last shopping experience", 
  "Cooking at home: Describe how you prepare your favorite meal",
  "Using public transport: Share your experience of traveling by bus or metro",
  "A day at work/university: Tell about what you do during a typical day",
  
  // Личные темы  
  "My favorite hobby: Explain why you enjoy this activity",
  "Weekend plans: What do you usually do on weekends?",
  "My best friend: Describe someone close to you",
  "Learning languages: Why do you study English?",
  "My goals for this year: What do you want to achieve?",
  
  // Описательные
  "My hometown: Describe the place where you live",
  "My favorite place in the city: Where do you like to spend time?",
  "My room/apartment: Describe your living space", 
  "A beautiful place I visited: Write about somewhere special you've been",
  "My favorite season: Describe the time of year you like most",
  
  // Мнения
  "Online learning vs traditional classes: What do you prefer and why?",
  "The importance of exercise: How does sport help people?",
  "Social media in our lives: Is it good or bad?",
  "Healthy food vs fast food: What are the differences?",
  "Books or movies: Which do you prefer for entertainment?",
  
  // Повседневные ситуации
  "A typical morning routine: How do you start your day?",
  "Going to a restaurant: Describe your dining experience",
  "Shopping for clothes: How do you choose what to buy?",
  "A walk in the park: What do you see and feel?",
  "Using technology daily: How do gadgets help you?",
  
  // Личные темы
  "My family traditions: What special customs do you have?",
  "A skill I want to learn: What would you like to be able to do?",
  "My dream vacation: Where would you like to travel?",
  "The best gift I received: Tell about something special someone gave you",
  "My childhood memories: Share a happy moment from when you were young",
  
  // Описательные  
  "My ideal house: What kind of home would you like to have?",
  "A person I admire: Describe someone you respect",
  "My neighborhood: What is it like where you live?",
  "A festival or celebration: Describe a special event you enjoy",
  "The weather today: How does the weather affect your mood?",
  
  // Мнения
  "Working from home: What are the advantages and disadvantages?",
  "The role of music in life: Why is music important?",
  "Traveling alone vs with friends: Which is better?",
  "Early morning vs late night: When are you most productive?",
  "City life vs country life: Where would you prefer to live?",
  
  // Повседневные ситуации
  "A problem I solved recently: How did you handle a difficult situation?",
  "Preparing for an important event: How do you get ready?",
  "A conversation with a stranger: Tell about meeting someone new",
  "Using a new app or website: Describe your experience with technology",
  "A small act of kindness: Write about helping someone or being helped",
  
  // Личные темы
  "My biggest achievement: What are you most proud of?",
  "A habit I want to change: What would you like to improve about yourself?",
  "My favorite time of day: When do you feel most comfortable?",
  "Something that makes me laugh: What brings joy to your life?",
  "A lesson I learned: Share something important you discovered"
];

// Функция для получения случайного совета для отдыха
function getRandomRelaxTip() {
  return RELAX_TIPS[Math.floor(Math.random() * RELAX_TIPS.length)];
}

// Функция расчета XP за правильный ответ
function calculateXP(wordCorrectLevel, streakMultiplier = 1) {
  let baseXP;
  if (wordCorrectLevel <= 1) baseXP = 8;      // новые слова
  else if (wordCorrectLevel === 2) baseXP = 12; // немного изученные
  else if (wordCorrectLevel === 3) baseXP = 18; // средние
  else if (wordCorrectLevel === 4) baseXP = 25; // хорошие
  else baseXP = 35; // отлично изученные (сложнее всего вспомнить)
  
  return Math.floor(baseXP * streakMultiplier);
}

// Функция получения уровня по XP
function getLevelByXP(xp) {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= XP_LEVELS[i].required_xp) {
      return XP_LEVELS[i];
    }
  }
  return XP_LEVELS[0];
}

// Функция получения мультипликатора за streak
function getStreakMultiplier(streak) {
  if (streak >= 30) return 3.0;      // месяц подряд
  if (streak >= 14) return 2.5;      // две недели
  if (streak >= 7) return 2.0;       // неделя
  if (streak >= 3) return 1.5;       // 3 дня
  return 1.0;
}

// Функция начисления XP и проверки повышения уровня
async function awardXP(session, wordCorrectLevel, ctx) {
  if (!session.xp) session.xp = 0;
  if (!session.level) session.level = 1;
  
  const streak = session.studyStreak || 0;
  const multiplier = getStreakMultiplier(streak);
  const xpGained = calculateXP(wordCorrectLevel, multiplier);
  
  const oldLevel = getLevelByXP(session.xp);
  session.xp += xpGained;
  const newLevel = getLevelByXP(session.xp);
  
  // Проверяем повышение уровня
  if (newLevel.level > oldLevel.level) {
    session.level = newLevel.level;
    const nextLevel = XP_LEVELS.find(l => l.level === newLevel.level + 1);
    const xpToNext = nextLevel ? nextLevel.required_xp - session.xp : 0;
    
    await ctx.reply(
      `🎉 <b>ПОЗДРАВЛЯЕМ!</b> 🎉\n\n` +
      `Вы достигли уровня ${newLevel.level}!\n` +
      `${newLevel.emoji} <b>${newLevel.title}</b>\n\n` +
      `💫 Получено XP: +${xpGained}\n` +
      `⭐ Общий XP: ${session.xp}\n` +
      (nextLevel ? `🎯 До следующего уровня: ${xpToNext} XP` : '🏆 Максимальный уровень достигнут!'),
      { parse_mode: 'HTML' }
    );
  }
  
  return xpGained;
}

// Функция для создания персонализированного приветствия в главном меню
function getMainMenuMessage(session) {
  const currentXP = session.xp || 0;
  const currentLevel = getLevelByXP(currentXP);
  const streak = session.studyStreak || 0;
  const loginStreak = session.loginStreak || 0;
  
  let message = `${currentLevel.emoji} <b>Уровень ${currentLevel.level}: ${currentLevel.title}</b>\n`;
  message += `⭐ XP: ${currentXP}`;
  
  const nextLevel = XP_LEVELS.find(l => l.level === currentLevel.level + 1);
  if (nextLevel) {
    const xpToNext = nextLevel.required_xp - currentXP;
    message += ` (до ${nextLevel.level}: ${xpToNext})`;
  }
  message += `\n`;
  
  if (streak > 0) {
    message += `🔥 Streak изучения: ${streak} дней\n`;
  }
  if (loginStreak > 0) {
    message += `📅 Streak входа: ${loginStreak} дней\n`;
  }
  
  message += `\nВыберите действие:`;
  return message;
}

// Функция проверки и начисления ежедневных бонусов
async function checkDailyBonus(session, ctx) {
  const today = new Date().toDateString();
  const lastBonusDate = session.lastBonusDate;
  
  if (lastBonusDate === today) {
    return; // Уже получил бонус сегодня
  }
  
  if (!session.loginStreak) session.loginStreak = 0;
  if (!session.xp) session.xp = 0;
  
  // Проверяем непрерывность входов
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  
  if (lastBonusDate === yesterdayStr) {
    session.loginStreak += 1;
  } else if (lastBonusDate !== today) {
    session.loginStreak = 1; // Сброс streak
  }
  
  // Расчет бонуса
  let bonusXP = 0;
  const streak = session.loginStreak;
  
  if (streak === 1) bonusXP = 20;
  else if (streak === 2) bonusXP = 35;
  else if (streak === 3) bonusXP = 50;
  else if (streak === 7) bonusXP = 100;
  else if (streak === 14) bonusXP = 200;
  else if (streak === 30) bonusXP = 500;
  else if (streak >= 50) bonusXP = 1000;
  else bonusXP = Math.min(15 + streak * 8, 150); // Прогрессивный бонус
  
  session.lastBonusDate = today;
  session.xp += bonusXP;
  
  // Специальные награды
  let specialReward = '';
  if (streak === 7) specialReward = '\n🏆 Титул: "Постоянный ученик"';
  else if (streak === 14) specialReward = '\n⭐ Титул: "Железная воля"';
  else if (streak === 30) specialReward = '\n💎 Титул: "Мастер дисциплины"';
  else if (streak === 50) specialReward = '\n🚀 Титул: "Легенда постоянства"';
  
  await ctx.reply(
    `🎁 <b>Ежедневный бонус!</b>\n\n` +
    `📅 День входа: ${streak}\n` +
    `💫 Бонус XP: +${bonusXP}\n` +
    `⭐ Общий XP: ${session.xp}` +
    specialReward + `\n\n💬 <i>"${getRandomMotivationalQuote()}"</i>`,
    { parse_mode: 'HTML' }
  );
  
  // Проверяем повышение уровня после бонуса
  const currentLevel = getLevelByXP(session.xp);
  if (currentLevel.level > (session.level || 1)) {
    session.level = currentLevel.level;
    await ctx.reply(
      `🌟 Уровень повышен до ${currentLevel.level}!\n${currentLevel.emoji} <b>${currentLevel.title}</b>`,
      { parse_mode: 'HTML' }
    );
  }
  
  // Сохраняем изменения в базу данных
  if (session.profile) {
    await saveUserSession(ctx.from.id, session.profile, session);
  }
}

// --- Напоминания: выбор времени и отправка ---
// sessions[userId].reminderTime = 'HH:MM' (24h)
bot.command('reminder', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId] || {};
  sessions[userId] = session;
  session.step = 'set_reminder_time';
  await ctx.reply('Во сколько напоминать каждый день? Напиши время в формате ЧЧ:ММ (например, 09:00 или 21:30)');
});

// Обработка выбора времени напоминания
async function handleReminderTimeInput(ctx, text, session) {
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    await ctx.reply('Некорректный формат времени. Введите, например: 09:00 или 21:30');
    return;
  }
  let [_, h, m] = match;
  h = parseInt(h, 10);
  m = parseInt(m, 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    await ctx.reply('Некорректное время. Часы 0-23, минуты 0-59.');
    return;
  }
  session.reminderTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  session.step = 'main_menu';
  
  // Сохраняем изменения в базу данных
  if (session.profile) {
    await saveUserSession(ctx.from.id, session.profile, session);
  }
  
  await ctx.reply(`Напоминание установлено на ${session.reminderTime} каждый день!`);
}

// --- Фоновая отправка напоминаний ---
async function sendReminders() {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  for (const userId in sessions) {
    const session = sessions[userId];
    if (!session.reminderTime) continue;
    if (`${hh}:${mm}` !== session.reminderTime) continue;
    // Проверяем активность
    const words = session.profile ? await getWords(session.profile) : [];
    const lastActive = words.length ? new Date(Math.max(...words.map(w => new Date(w.updatedAt || w.createdAt)))) : null;
    if (isToday(lastActive)) continue; // Уже был активен сегодня
    // Отправляем мотивационное напоминание
    const quote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
    try {
      await bot.api.sendMessage(userId, `⏰ Напоминание: ${quote}`);
    } catch (e) {
      // ignore errors (user blocked bot, etc)
    }
  }
}

// Запускать sendReminders каждую минуту
setInterval(sendReminders, 60 * 1000);

// Главное меню
const mainMenu = new Keyboard()
  .text('📝 Добавить слова')
  .text('🎯 Задания по словам')
  .row()
  .text('📊 Мой прогресс')
  .row();

// Подменю: добавить слова
const addWordsMainMenu = new Keyboard()
  .text('✍️ Добавить своё слово')
  .row()
  .text('📚 Слова из Oxford 3000')
  .text('🎓 Слова из IELTS')
  .row()
  .text('🔙 Назад в меню')
  .row();

// Подменю: задания по словам
const wordTasksMenu = new Keyboard()
  .text('🧠 Умное повторение')
  .row()
  .text('� Угадай перевод')
  .row()
  .text('�🎭 Ситуативные задания')
  .text('📺 Примеры из жизни')
  .row()
  .text('🔙 Назад в меню')
  .row();

// Меню ситуативных заданий - 15 мест
const situationalMenu = new Keyboard()
  .text('✈️ Аэропорт')
  .text('🏛️ Музей')
  .text('🏥 Больница')
  .row()
  .text('🍽️ Ресторан')
  .text('🛍️ Магазин')
  .text('🏨 Отель')
  .row()
  .text('🚌 Транспорт')
  .text('📚 Библиотека')
  .text('⚽ Стадион')
  .row()
  .text('🏢 Офис')
  .text('🏦 Банк')
  .text('🛣️ Улица')
  .row()
  .text('🎭 Театр')
  .text('🚗 Автосервис')
  .text('🏫 Школа')
  .row()
  .text('Назад в меню')
  .row();

// Меню примеров из жизни
const examplesMenu = new Keyboard()
  .text('📰 Примеры в стиле новостей')
  .text('🎬 Примеры в стиле фильмов')
  .row()
  .text('Назад в меню')
  .row();

// Меню выбора количества слов
const wordsCountMenu = new Keyboard()
  .text('7 слов')
  .text('10 слов')
  .row()
  .text('15 слов')
  .text('20 слов')
  .row()
  .text('🔙 Назад в меню')
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

// Функция для выделения основной формы слова
function getMainForm(word) {
  return word.split(/[ (]/)[0].trim();
}

// Функция для генерации клавиатуры с разделами oxford3000
const getOxfordSectionsMenu = () => {
  const sections = Array.from(new Set(oxford3000.map(w => w.section)));
  const rows = sections.map(s => [s]);
  return Keyboard.from(rows).row();
};

// --- Функция загрузки/создания профиля пользователя ---
async function getOrCreateUserProfile(telegramId, profileName) {
  const profileKey = `${telegramId}_${profileName}`;
  
  try {
    // Пытаемся найти существующий профиль
    let userProfile = await prisma.userProfile.findFirst({
      where: { 
        telegramId: telegramId.toString(),
        profileName: profileName 
      }
    });
    
    // Если профиль не найден, создаем новый
    if (!userProfile) {
      userProfile = await prisma.userProfile.create({
        data: {
          telegramId: telegramId.toString(),
          profileName: profileName,
          xp: 0,
          level: 1,
          loginStreak: 0,
          studyStreak: 0,
          lastStudyDate: null,
          lastBonusDate: null,
          lastSmartRepeatDate: null,
          reminderTime: null,
          writingTopicIndex: 0
        }
      });
    }
    
    return userProfile;
  } catch (error) {
    console.error('Error getting/creating user profile:', error);
    // Возвращаем дефолтные значения если ошибка с БД
    return {
      xp: 0,
      level: 1,
      loginStreak: 0,
      lastBonusDate: null,
      lastSmartRepeatDate: null,
      reminderTime: null
    };
  }
}

// --- Функция сохранения сессии в БД ---
async function saveUserSession(telegramId, profileName, session) {
  try {
    console.log(`DEBUG SAVE SESSION: Saving session for ${telegramId} (${profileName})`);
    console.log(`  - lastSmartRepeatDate: "${session.lastSmartRepeatDate}"`);
    
    const result = await prisma.userProfile.updateMany({
      where: { 
        telegramId: telegramId.toString(),
        profileName: profileName 
      },
      data: {
        xp: session.xp || 0,
        level: session.level || 1,
        loginStreak: session.loginStreak || 0,
        studyStreak: session.studyStreak || 0,
        lastStudyDate: session.lastStudyDate,
        lastBonusDate: session.lastBonusDate,
        lastSmartRepeatDate: session.lastSmartRepeatDate,
        reminderTime: session.reminderTime
      }
    });
    
    console.log(`  - Updated ${result.count} records`);
  } catch (error) {
    console.error('Error saving user session:', error);
  }
}

// --- Prisma-реализация функций ---
async function addWord(profile, word, translation, section, generateAudio = false) {
  await prisma.word.create({
    data: {
      profile,
      word,
      translation,
      section: section || null,
    },
  });
  
  // Генерируем аудио если это требуется
  if (generateAudio) {
    try {
      await generateAndCacheAudioInDB(word, profile);
    } catch (error) {
      console.error(`Failed to generate audio for new word "${word}":`, error);
    }
  }
}

// Функция для последовательного добавления слов с аудио
async function addWordsSequentiallyWithAudio(ctx, profile, words, section) {
  const processedWords = [];
  
  for (const w of words) {
    const wordForm = section === 'IELTS' ? getFirstTwoWords(w.word) : getMainForm(w.word);
    
    // Добавляем слово в БД с генерацией аудио
    await addWord(profile, wordForm, w.translation, section, true);
    
    processedWords.push({ ...w, processedWord: wordForm });
    
    // Небольшая задержка между генерацией аудио
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return processedWords;
}

// Функция для отправки аудио для списка слов
async function sendAudioForWords(ctx, profile, processedWords) {
  for (const w of processedWords) {
    await sendWordAudioFromDB(ctx, w.processedWord, profile, { silent: true });
    // Небольшая задержка между отправкой аудио
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

async function getWords(profile, filter = {}) {
  return prisma.word.findMany({
    where: {
      profile,
      ...(filter.section ? { section: filter.section } : {}),
    },
    orderBy: { id: 'asc' },
  });
}

async function updateWordCorrect(profile, word, translation, correct) {
  await prisma.word.updateMany({
    where: { profile, word, translation },
    data: { correct },
  });
}

// Вспомогательная функция для отправки аудио (автоматически получает профиль из сессии)
async function sendWordAudio(ctx, word, options = {}) {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    console.log(`⚠️ No session or profile found for sending audio for "${word}"`);
    return false;
  }
  
  return await sendWordAudioFromDB(ctx, word, session.profile, options);
}

// --- TTS (Text-to-Speech) функции для работы с базой данных ---

// Функция для генерации аудио через OpenAI TTS и сохранения в БД
async function generateAndStoreAudio(word, profile) {
  try {
    // Валидация слова перед генерацией аудио
    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      console.error(`❌ Invalid word for audio generation: "${word}"`);
      return false;
    }
    
    // Очищаем слово от лишних символов
    const cleanWord = word.trim().toLowerCase().replace(/[^a-zA-Z\s]/g, '');
    if (cleanWord.length === 0) {
      console.error(`❌ Word contains no valid characters: "${word}"`);
      return false;
    }
    
    console.log(`🎵 Generating audio for word: "${cleanWord}"`);
    
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OpenAI API key not found');
      return false;
    }

    const response = await axios.post('https://api.openai.com/v1/audio/speech', {
      model: 'tts-1',    // Обычная модель, не дорогая
      voice: 'alloy',    
      speed: 0.9,        // Нормальная скорость
      input: `... ${cleanWord} ...` // Добавляем паузы в начале и конце
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });

    // Сохраняем аудиоданные в базу данных
    await prisma.word.updateMany({
      where: { 
        word: word,
        profile: profile 
      },
      data: { 
        audioData: Buffer.from(response.data) 
      }
    });
    
    console.log(`✅ Audio generated and stored in DB for: "${cleanWord}"`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to generate audio for "${cleanWord}":`, error.message);
    return false;
  }
}

// Функция для проверки существования аудио в БД
async function hasAudioInDB(word, profile) {
  try {
    const wordWithAudio = await prisma.word.findFirst({
      where: { 
        word: word,
        profile: profile,
        audioData: { not: null }
      },
      select: { audioData: true }
    });
    
    return wordWithAudio && wordWithAudio.audioData;
  } catch (error) {
    console.error(`❌ Error checking audio in DB for "${word}":`, error);
    return false;
  }
}

// Функция для генерации и сохранения аудио (если его нет)
async function generateAndCacheAudioInDB(word, profile) {
  try {
    // Проверяем, есть ли уже аудио в БД
    const hasAudio = await hasAudioInDB(word, profile);
    if (hasAudio) {
      console.log(`🎵 Audio already in DB for: "${word}"`);
      return true;
    }

    // Генерируем новое аудио
    return await generateAndStoreAudio(word, profile);
  } catch (error) {
    console.error(`❌ Error in generateAndCacheAudioInDB for "${word}":`, error);
    return false;
  }
}

// Функция для отправки аудио пользователю из БД
async function sendWordAudioFromDB(ctx, word, profile, options = {}) {
  try {
    // Получаем аудиоданные из БД
    const wordWithAudio = await prisma.word.findFirst({
      where: { 
        word: word,
        profile: profile,
        audioData: { not: null }
      },
      select: { audioData: true }
    });
    
    if (!wordWithAudio || !wordWithAudio.audioData) {
      console.log(`⚠️ No audio data in DB for "${word}", skipping audio send`);
      return false;
    }

    // Создаем InputFile из Buffer
    const audioBuffer = wordWithAudio.audioData;
    const audioFile = new InputFile(audioBuffer, `${word}.mp3`);
    
    await ctx.replyWithVoice(audioFile, {
      caption: options.caption || null,
      ...options
    });
    
    console.log(`🔊 Audio sent from DB for word: "${word}"`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send audio from DB for "${word}":`, error.message);
    return false;
  }
}

// Функция для удаления аудиоданных слова из БД
async function deleteWordAudioFromDB(word, profile) {
  try {
    await prisma.word.updateMany({
      where: { 
        word: word,
        profile: profile 
      },
      data: { 
        audioData: null 
      }
    });
    
    console.log(`🗑️ Deleted audio data from DB for: "${word}"`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to delete audio from DB for "${word}":`, error);
    return false;
  }
}

// Функция для очистки всех аудиоданных пользователя
async function clearAllAudioFromDB(profile) {
  try {
    const result = await prisma.word.updateMany({
      where: { profile: profile },
      data: { audioData: null }
    });
    
    console.log(`🗑️ Cleared audio data from DB for ${result.count} words of profile: ${profile}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to clear audio data from DB:', error);
    return false;
  }
}

// Функция для массовой генерации аудио для всех слов пользователя
async function generateAudioForUserWordsInDB(profile) {
  try {
    const words = await prisma.word.findMany({
      where: { profile: profile },
      select: { word: true, audioData: true }
    });
    
    console.log(`🎵 Starting mass audio generation for ${words.length} words of user: ${profile}`);
    
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const wordObj of words) {
      try {
        if (wordObj.audioData) {
          skipped++;
          continue;
        }
        
        const success = await generateAndStoreAudio(wordObj.word, profile);
        if (success) {
          generated++;
        } else {
          failed++;
        }
        
        // Небольшая задержка между запросами к API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Error generating audio for "${wordObj.word}":`, error);
        failed++;
      }
    }
    
    console.log(`✅ Mass audio generation completed: ${generated} generated, ${skipped} skipped, ${failed} failed`);
    return { generated, skipped, failed };
  } catch (error) {
    console.error('❌ Failed mass audio generation:', error);
    return { generated: 0, skipped: 0, failed: 0 };
  }
}

// /start — начало сеанса
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  
  try {
    // Проверяем есть ли пользователь в базе данных
    const existingProfiles = await prisma.userProfile.findMany({
      where: { telegramId: userId.toString() }
    });
    
    if (existingProfiles.length > 0) {
      // Если у пользователя несколько профилей, предлагаем выбрать
      if (existingProfiles.length > 1) {
        sessions[userId] = { step: 'awaiting_profile' };
        return ctx.reply('Выберите профиль:', {
          reply_markup: {
            keyboard: [['Амина', 'Нурболат']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
      
      // Пользователь найден в базе, автологиним его
      const profile = existingProfiles[0];
      
      sessions[userId] = {
        profile: profile.profileName,
        step: 'main_menu',
        xp: profile.xp,
        level: profile.level,
        loginStreak: profile.loginStreak,
        lastBonusDate: profile.lastBonusDate,
        lastSmartRepeatDate: profile.lastSmartRepeatDate,
        reminderTime: profile.reminderTime
      };
      
      // Проверяем ежедневный бонус
      await checkDailyBonus(sessions[userId], ctx);
      const menuMessage = getMainMenuMessage(sessions[userId]);
      await ctx.reply(menuMessage, { reply_markup: mainMenu, parse_mode: 'HTML' });
    } else {
      // Новый пользователь
      sessions[userId] = { step: 'awaiting_password' };
      await ctx.reply('Введите пароль:');
    }
  } catch (error) {
    console.error('Error in /start command:', error);
    // Если ошибка с БД, создаем обычную сессию
    sessions[userId] = { step: 'awaiting_password' };
    await ctx.reply('Введите пароль:');
  }
});

// /menu — возвращает в главное меню из любого шага после логина
bot.command('menu', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  if (!session || session.step === 'awaiting_password' || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  const profile = session.profile;
  sessions[userId] = { ...session, step: 'main_menu', profile };
  const menuMessage = getMainMenuMessage(sessions[userId]);
  return ctx.reply(menuMessage, { reply_markup: mainMenu, parse_mode: 'HTML' });
});

// --- Команда /words: показать слова пользователя ---
bot.command('words', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  const section = args.length > 0 ? args.join(' ') : null;
  
  try {
    const filter = section ? { section } : {};
    const words = await getWords(session.profile, filter);
    
    if (!words.length) {
      const msg = section 
        ? `У вас нет слов в разделе "${section}"`
        : 'У вас нет добавленных слов';
      return ctx.reply(msg);
    }
    
    // Группируем по разделам
    const sections = {};
    words.forEach(word => {
      const sec = word.section || 'Без раздела';
      if (!sections[sec]) sections[sec] = [];
      sections[sec].push(word);
    });
    
    let message = section 
      ? `<b>Слова из раздела "${section}":</b>\n\n`
      : '<b>Ваши слова:</b>\n\n';
    
    for (const [sec, sectionWords] of Object.entries(sections)) {
      if (!section) {
        message += `<b>${sec}:</b>\n`;
      }
      
      sectionWords.forEach(word => {
        const correct = word.correct || 0;
        let status = '';
        if (correct <= 2) status = '🔴';
        else if (correct <= 4) status = '🟡';
        else status = '🟢';
        
        message += `${status} <code>${word.word}</code> — ${word.translation}\n`;
      });
      
      if (!section) message += '\n';
    }
    
    message += '\n<i>🔴 новые (≤2), 🟡 изучаемые (3-4), 🟢 изученные (≥5)</i>';
    message += '\n\nДля удаления: /delete [слово]';
    
    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error in /words:', error);
    await ctx.reply('Ошибка при получении списка слов');
  }
});

// --- Команда /delete: удалить слово ---
bot.command('delete', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    return ctx.reply('Укажите слово для удаления: /delete [слово]');
  }
  
  const wordToDelete = args.join(' ').toLowerCase();
  
  try {
    const deletedWords = await prisma.word.deleteMany({
      where: {
        profile: session.profile,
        word: { equals: wordToDelete, mode: 'insensitive' }
      }
    });
    
    if (deletedWords.count === 0) {
      return ctx.reply(`Слово "${wordToDelete}" не найдено`);
    }
    
    await ctx.reply(`✅ Удалено ${deletedWords.count} записей со словом "${wordToDelete}"`);
  } catch (error) {
    console.error('Error in /delete:', error);
    await ctx.reply('Ошибка при удалении слова');
  }
});

// --- Команда /clear: очистить все слова ---
bot.command('clear', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  // Проверяем количество слов
  const wordCount = await prisma.word.count({
    where: { profile: session.profile }
  });
  
  if (wordCount === 0) {
    return ctx.reply('У вас нет слов для удаления');
  }
  
  // Запрашиваем подтверждение
  session.awaitingClearConfirmation = true;
  await ctx.reply(
    `⚠️ Вы уверены, что хотите удалить ВСЕ ${wordCount} слов?\n\n` +
    'Напишите "ДА" для подтверждения или любое другое сообщение для отмены'
  );
});

// --- Команда /clear_audio: очистить аудиоданные из БД ---
bot.command('clear_audio', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  try {
    await ctx.reply('🗑️ Очищаю аудиоданные из базы данных...');
    
    const success = await clearAllAudioFromDB(session.profile);
    
    if (success) {
      await ctx.reply('✅ Аудиоданные успешно очищены из базы данных! Все аудио будет заново создано при необходимости.');
    } else {
      await ctx.reply('❌ Ошибка при очистке аудиоданных');
    }
  } catch (error) {
    console.error('Error in /clear_audio:', error);
    await ctx.reply('❌ Ошибка при очистке аудиоданных');
  }
});

// --- Скрытая команда для массовой генерации аудио ---
bot.command('generate_all_audio', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  try {
    await ctx.reply('🎵 Запускаю массовую генерацию аудио для всех ваших слов...');
    
    const result = await generateAudioForUserWordsInDB(session.profile);
    
    const message = `✅ Массовая генерация аудио завершена!\n\n` +
      `📊 Результаты:\n` +
      `✅ Сгенерировано: ${result.generated}\n` +
      `⏭️ Пропущено (уже есть): ${result.skipped}\n` +
      `❌ Ошибок: ${result.failed}`;
    
    await ctx.reply(message);
  } catch (error) {
    console.error('Error in /generate_all_audio:', error);
    await ctx.reply('❌ Ошибка при массовой генерации аудио');
  }
});

// --- Команда /sections: показать все разделы ---
bot.command('sections', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  try {
    const sections = await prisma.word.groupBy({
      by: ['section'],
      where: { profile: session.profile },
      _count: { id: true }
    });
    
    if (!sections.length) {
      return ctx.reply('У вас нет добавленных слов');
    }
    
    let message = '<b>Ваши разделы:</b>\n\n';
    
    sections
      .sort((a, b) => b._count.id - a._count.id)
      .forEach(section => {
        const name = section.section || 'Без раздела';
        const count = section._count.id;
        message += `📂 <b>${name}</b> — ${count} слов\n`;
      });
    
    message += '\nДля просмотра: /words [название раздела]';
    

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error in /sections:', error);
    await ctx.reply('Ошибка при получении списка разделов');
  }
});

// --- Команда /achievements: личный прогресс и достижения ---
// --- Ленивец дня: трекинг и отображение ---
function isToday(date) {
  if (!date) return false;
  const d = new Date(date);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

// Ленивец дня хранится в сессии (можно расширить на базу)
function setSlothOfTheDay(session) {
  session.slothOfTheDay = true;
  session.studyStreak = 0;
  session.lastSlothDate = new Date();
}

// Проверка активности пользователя (вызывать в начале дня)
async function checkUserInactivity(session, words, ctx) {
  // Если слов вообще нет, не считаем пользователя ленивцем
  if (words.length === 0) {
    session.slothOfTheDay = false;
    return false;
  }
  
  // Последняя активность — по updatedAt любого слова
  const lastActive = words.length ? new Date(Math.max(...words.map(w => new Date(w.updatedAt || w.createdAt)))) : null;
  if (!isToday(lastActive)) {
    // Проверяем, был ли уже ленивцем сегодня, чтобы не спамить
    if (!session.slothOfTheDay || !isToday(session.lastSlothDate)) {
      setSlothOfTheDay(session);
      // Шуточное сообщение с подколом
      if (ctx) {
        const jokes = [
          '😴 Сегодня вы — Ленивец дня! Стрик обнулился, но не расстраивайтесь — даже ленивцы иногда становятся чемпионами! 🦥',
          '🦥 Ой-ой, кто это тут забыл про английский? Ленивец дня объявлен! Завтра будет новый шанс!',
          '😅 Ваш стрик сброшен, а титул "Ленивец дня" присвоен! Не переживайте, даже самые быстрые иногда отдыхают.',
          '🦥 Ленивец дня! Может, сегодня просто день отдыха? Но завтра — снова в бой!'
        ];
        const joke = jokes[Math.floor(Math.random() * jokes.length)];
        await ctx.reply(joke);
      }
    }
    return true;
  }
  session.slothOfTheDay = false;
  return false;
}

// --- Ситуативные задания ---

// Функция для генерации ситуации через ChatGPT
async function generateSituation(location) {
  const locationMap = {
    '✈️ Аэропорт': 'аэропорт',
    '🏛️ Музей': 'музей',
    '🏥 Больница': 'больница',
    '🍽️ Ресторан': 'ресторан',
    '🛍️ Магазин': 'магазин',
    '🏨 Отель': 'отель',
    '🚌 Транспорт': 'общественный транспорт',
    '📚 Библиотека': 'библиотека',
    '⚽ Стадион': 'стадион',
    '🏢 Офис': 'офис',
    '🏦 Банк': 'банк',
    '🛣️ Улица': 'улица',
    '🎭 Театр': 'театр',
    '🚗 Автосервис': 'автосервис',
    '🏫 Школа': 'школа'
  };
  
  const place = locationMap[location] || location;
  
  const prompt = `Ты преподаватель английского языка. Придумай интересную и реалистичную ситуацию средней сложности в месте: ${place}.

Требования:
- Ситуация должна быть уникальной и интересной
- Средний уровень сложности (не слишком простая, но и не слишком сложная)
- Ситуация может быть двух типов:
  1) Где нужно что-то СКАЗАТЬ (диалог, объяснение, вопрос)
  2) Где нужно что-то СДЕЛАТЬ (действие, написать текст, заполнить форму)
- Добавь немного юмора или неожиданности
- Опиши ситуацию в 2-3 предложениях

Формат ответа (ОБЯЗАТЕЛЬНО на двух языках):
1. СНАЧАЛА ВСЯ СИТУАЦИЯ НА АНГЛИЙСКОМ
2. Пустая строка
3. ЗАТЕМ ВСЯ СИТУАЦИЯ НА РУССКОМ
4. Пустая строка
5. What will you say/do in this situation?
6. Что вы скажете/сделаете в этой ситуации?

Пример формата:
While a client is filling out a form to open a bank account, you notice that he is writing his date of birth and address incorrectly. He is confident that everything is correct.

Пока клиент заполняет анкету для открытия счета в банке, вы замечаете, что он пишет неправильно свою дату рождения и адрес. Он уверен, что все верно.

What will you say/do in this situation?
Что вы скажете/сделаете в этой ситуации?

Ответь СТРОГО в этом формате, без дополнительных объяснений.`;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.8
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Ошибка при генерации ситуации:', error);
    return `You are at: ${place}. An interesting situation requires your attention.\n\nВы находитесь в месте: ${place}. Возникла интересная ситуация, требующая вашего вмешательства.\n\nWhat will you say or do in this situation?\nЧто вы скажете или сделаете в этой ситуации?`;
  }
}

// Функция для проверки ответа пользователя через ChatGPT
async function checkGrammar(userResponse) {
  const prompt = `Ты преподаватель английского языка. Проверь грамматику следующего текста и дай подробный фидбек:

"${userResponse}"

Требования к фидбеку:
- Проверь только грамматические ошибки (артикли, времена, порядок слов, предлоги и т.д.)
- НЕ проверяй логичность или содержание ответа
- Учти, что пользователь может как описывать речь ("I would say..."), так и действия ("I would write...")
- Дай подробное объяснение каждой ошибки
- Предложи исправленные варианты
- Если ошибок нет, похвали и отметь сильные стороны
- Используй дружелюбный тон
- Ответ на русском языке

Формат ответа:
✅ Что хорошо: [похвала]
❌ Ошибки: [детальный разбор ошибок с объяснениями]
💡 Исправленный вариант: [исправленный текст]

Если ошибок нет, пропусти раздел "❌ Ошибки".`;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Ошибка при проверке грамматики:', error);
    return 'Спасибо за ваш ответ! К сожалению, произошла ошибка при проверке. Попробуйте еще раз позже.';
  }
}

// --- Функции для поиска примеров из жизни ---

// Функция для поиска примеров из новостей
async function searchNewsExamples(word) {
  try {
    const prompt = `Create 3 educational examples of the English word "${word}" used in news headlines and articles.

IMPORTANT:
- These are EDUCATIONAL examples for English learners, not necessarily real news
- Each example MUST contain the word "${word}"
- Make the word "${word}" bold: **${word}**
- Examples should be realistic and useful for learning
- ALL content should be in ENGLISH ONLY - no translations or Russian text

Requirements:
- News headline or article excerpt style with the word "${word}"
- Show different contexts of word usage
- Indicate source type (Business News, Tech News, Sports, etc.)
- Keep it natural and authentic

Response format (ENGLISH ONLY):
1. **[News Type]**: "Text with highlighted **${word}**"
   Context: Brief explanation of the situation in English
   
2. **[News Type]**: "Text with highlighted **${word}**"
   Context: Brief explanation of the situation in English

3. **[News Type]**: "Text with highlighted **${word}**"
   Context: Brief explanation of the situation in English`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Ошибка при поиске новостных примеров:', error);
    return `Sorry, couldn't create news examples for "${word}". Please try another word.`;
  }
}

// Функция для поиска примеров из фильмов/сериалов
async function searchMovieExamples(word) {
  try {
    const prompt = `Create 3 educational examples of the English word "${word}" used in movie and TV show dialogues.

IMPORTANT:
- These are EDUCATIONAL examples in movie dialogue style, not necessarily real quotes
- Each example MUST contain the word "${word}"
- Make the word "${word}" bold: **${word}**
- Examples should be realistic and useful for English learning
- ALL content should be in ENGLISH ONLY - no translations or Russian text

Requirements:
- Dialogue style from popular movies/TV shows with the word "${word}"
- Indicate genre or type of movie/show and character
- Provide context of the situation in English
- Keep it natural and authentic

Response format (ENGLISH ONLY):
1. **[Genre/Type] - Character:**
   "Dialogue with highlighted **${word}**"
   Context: Brief description of the situation in English

2. **[Genre/Type] - Character:**
   "Dialogue with highlighted **${word}**"
   Context: Brief description of the situation in English

3. **[Genre/Type] - Character:**
   "Dialogue with highlighted **${word}**"
   Context: Brief description of the situation in English

Use different genre styles: drama, comedy, sci-fi, action, etc.`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo', 
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Ошибка при поиске примеров из фильмов:', error);
    return `Sorry, couldn't find movie/TV examples for "${word}". Please try another word.`;
  }
}

// Временная команда для диагностики базы данных (только для админов)
bot.command('checkdb', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || session.profile !== 'Нурболат') {
    return ctx.reply('❌ Доступ запрещен');
  }
  
  try {
    console.log('🔍 Проверяем базу данных...');
    
    // Проверяем общее количество слов
    const totalWords = await prisma.word.count();
    console.log(`Total words in database: ${totalWords}`);
    
    // Проверяем все профили и их количества слов
    const profiles = await prisma.word.groupBy({
      by: ['profile'],
      _count: { id: true }
    });
    
    console.log('Profiles and word counts:', profiles);
    
    // Показываем последние 20 слов с деталями
    const recentWords = await prisma.word.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        profile: true,
        word: true,
        translation: true,
        section: true,
        correct: true,
        createdAt: true
      }
    });
    
    console.log('Recent words:', recentWords);
    
    // Проверяем старые слова (созданные больше недели назад)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const oldWords = await prisma.word.findMany({
      where: {
        createdAt: {
          lt: oneWeekAgo
        }
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        profile: true,
        word: true,
        translation: true,
        section: true,
        correct: true,
        createdAt: true
      }
    });
    
    console.log('Old words (older than 1 week):', oldWords);
    
    // Формируем ответ для пользователя
    let message = `📊 <b>Диагностика базы данных:</b>\n\n`;
    message += `🔢 <b>Всего слов:</b> ${totalWords}\n\n`;
    
    if (profiles.length > 0) {
      message += `👥 <b>Профили:</b>\n`;
      profiles.forEach(p => {
        message += `• ${p.profile}: ${p._count.id} слов\n`;
      });
      message += `\n`;
    } else {
      message += `❌ Профили не найдены\n\n`;
    }
    
    if (recentWords.length > 0) {
      message += `📝 <b>Последние ${recentWords.length} слов:</b>\n`;
      recentWords.slice(0, 10).forEach(w => {
        const date = w.createdAt.toLocaleDateString();
        message += `• ${w.word} — ${w.translation} (${w.profile}, ${date})\n`;
      });
      message += `\n`;
    }
    
    if (oldWords.length > 0) {
      message += `⏰ <b>Старые слова (старше недели):</b>\n`;
      oldWords.slice(0, 5).forEach(w => {
        const date = w.createdAt.toLocaleDateString();
        message += `• ${w.word} — ${w.translation} (${w.profile}, ${date})\n`;
      });
      message += `\n`;
    } else {
      message += `⚠️ <b>Старых слов не найдено!</b> Возможно, данные были потеряны.\n\n`;
    }
    
    message += `💡 Если ваши важные слова отсутствуют, проверьте логи выше для подробной информации.`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
    await ctx.reply(`❌ Ошибка при проверке базы: ${error.message}`);
  }
});

// Админская команда пропуска этапов (только для Нурболат)
bot.command('skip', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || session.profile !== 'Нурболат') {
    return ctx.reply('❌ Доступ запрещен');
  }
  
  console.log(`🚀 Admin SKIP command used. Current step: ${session.step}`);
  
  // Определяем, на каком этапе находится пользователь и пропускаем его
  if (session.step === 'smart_repeat_quiz' && session.smartRepeatStage === 1) {
    // Пропускаем викторину, переходим к этапу 2 (письмо)
    session.smartRepeatStage = 2;
    delete session.currentQuizSession;
    
    await ctx.reply('⏭️ Этап 1 (викторина) пропущен!\n\n🧠 <b>Умное повторение - Этап 2/5</b>\n<b>Напиши текст</b>\n\nПереходим к письменному заданию...');
    return await startSmartRepeatStageWriting(ctx, session);
    
  } else if (session.step === 'writing_task' && session.smartRepeatStage === 2) {
    // Пропускаем этап письма, переходим к этапу 3 (знаю/не знаю)
    session.smartRepeatStage = 3;
    delete session.writingTopic;
    delete session.writingAnalysis;
    
    await ctx.reply('⏭️ Этап 2 (письмо) пропущен!\n\n🧠 <b>Умное повторение - Этап 3/5</b>\n<b>Знаю/Не знаю</b>\n\nПереходим к быстрой оценке слов...');
    return await startSmartRepeatStage2(ctx, session); // Это старая функция "Знаю/Не знаю", которая стала этапом 3
    
  } else if (session.step === 'waiting_answer' && session.smartRepeatStage === 3) {
    // Пропускаем этап 3 (знаю/не знаю), переходим к этапу 4 (предложения)
    session.step = 'smart_repeat_stage_3';
    session.smartRepeatStage = 3;
    delete session.currentIndex;
    delete session.wordsToRepeat;
    delete session.repeatMode;
    
    await ctx.reply('⏭️ Этап 3 (знаю/не знаю) пропущен!\n\n🧠 <b>Умное повторение - Этап 4/5</b>\n<b>Составление предложений</b>\n\nПереходим к практике...');
    return await startSmartRepeatStage3(ctx, session);
    
  } else if (session.step === 'sentence_task' && session.smartRepeatStage === 4) {
    // Пропускаем этап 4 (предложения), переходим к этапу 5 (чтение)
    session.step = 'smart_repeat_stage_4';
    session.smartRepeatStage = 5;
    delete session.sentenceTaskWords;
    delete session.sentenceTaskIndex;
    delete session.stage3Sentences;
    delete session.stage3Context;
    
    await ctx.reply('⏭️ Этап 4 (предложения) пропущен!\n\n🧠 <b>Умное повторение - Этап 5/5</b>\n<b>Чтение текста</b>\n\nПереходим к финальному этапу...');
    return await startSmartRepeatStage5(ctx, session);
    
  } else if (session.step === 'story_task' && session.smartRepeatStage === 5) {
    // Завершаем умное повторение
    await ctx.reply('⏭️ Этап 5 (чтение) пропущен!\n\n✅ <b>Умное повторение завершено!</b>');
    return await finishSmartRepeat(ctx, session);
    
  } else if (session.step === 'quiz_game') {
    // Пропускаем обычную викторину
    await finishQuizSession(ctx, session);
    return ctx.reply('⏭️ Викторина завершена досрочно!');
    
  } else if (session.step === 'waiting_answer') {
    // Пропускаем повторение слов
    session.step = 'main_menu';
    delete session.wordsToRepeat;
    delete session.currentIndex;
    return ctx.reply('⏭️ Повторение слов завершено!', { reply_markup: mainMenu });
    
  } else {
    // Возвращаем в главное меню из любого состояния
    session.step = 'main_menu';
    
    // Очищаем все состояния
    delete session.currentQuizSession;
    delete session.smartRepeatWords;
    delete session.smartRepeatStage;
    delete session.currentStage2Index;
    delete session.stage2Answers;
    delete session.currentStage3Index;
    delete session.stage3Sentences;
    delete session.stage3Context;
    delete session.wordsToRepeat;
    delete session.currentIndex;
    
    await ctx.reply('⏭️ Сброшено в главное меню!', { reply_markup: mainMenu });
  }
});

// Команда просмотра доступных бэкапов (только для Нурболат)
bot.command('backups', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  if (session.profile !== 'Нурболат') {
    return ctx.reply('❌ Эта команда доступна только для администратора');
  }
  
  try {
    // Проверяем, существует ли папка backups
    const backupDir = 'backups';
    if (!fs.existsSync(backupDir)) {
      return ctx.reply('📁 Папка с бэкапами не найдена.\nСоздайте первый бэкап командой /backup');
    }
    
    // Ищем все файлы бэкапов в папке
    const files = fs.readdirSync(backupDir).filter(file => 
      file.startsWith('backup-') && file.endsWith('.json')
    );
    
    if (files.length === 0) {
      return ctx.reply('📁 Локальных бэкапов не найдено.\nСоздайте первый бэкап командой /backup');
    }
    
    let message = `📂 <b>Доступные бэкапы:</b>\n\n`;
    
    // Сортируем по дате (новые сверху)
    files.sort().reverse();
    
    for (let i = 0; i < Math.min(files.length, 10); i++) {
      const file = files[i];
      const filePath = `${backupDir}/${file}`;
      const stats = fs.statSync(filePath);
      const date = stats.mtime.toLocaleString('ru');
      const size = (stats.size / 1024).toFixed(1);
      
      message += `📄 <code>${file}</code>\n`;
      message += `📅 ${date}\n`;
      message += `💾 ${size} KB\n\n`;
    }
    
    if (files.length > 10) {
      message += `И еще ${files.length - 10} бэкапов...\n\n`;
    }
    
    message += `💡 <b>Как скачать:</b>\n`;
    message += `• /backup - создать новый и получить файл\n`;
    message += `• /getbackup название_файла - скачать конкретный\n`;
    message += `• Файлы также отправляются автоматически каждый день`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    console.error('Error listing backups:', error);
    await ctx.reply(`❌ Ошибка: ${error.message}`);
  }
});

// Команда скачивания конкретного бэкапа (только для Нурболат)
bot.command('getbackup', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  if (session.profile !== 'Нурболат') {
    return ctx.reply('❌ Эта команда доступна только для администратора');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('📁 Укажите название файла бэкапа.\nПример: /getbackup backup-2025-01-24T15-30-00-000Z.json\n\nПосмотрите доступные файлы: /backups');
  }
  
  const fileName = args[1];
  const filePath = `backups/${fileName}`;
  
  try {
    if (!fs.existsSync(filePath)) {
      return ctx.reply(`❌ Файл "${fileName}" не найден в папке backups.\nПроверьте список командой /backups`);
    }
    
    if (!fileName.startsWith('backup-') || !fileName.endsWith('.json')) {
      return ctx.reply('❌ Можно скачивать только файлы бэкапов (backup-*.json)');
    }
    
    // Читаем файл как Buffer
    const fileBuffer = fs.readFileSync(filePath);
    
    await ctx.replyWithDocument(new InputFile(fileBuffer, fileName), {
      caption: `📦 Бэкап: ${fileName}\n🕐 ${new Date().toLocaleString('ru')}`
    });
    
  } catch (error) {
    console.error('Error sending backup:', error);
    await ctx.reply(`❌ Ошибка отправки: ${error.message}`);
  }
});

// Команда создания бэкапа (только для Нурболат)
bot.command('backup', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  if (session.profile !== 'Нурболат') {
    return ctx.reply('❌ Эта команда доступна только для администратора');
  }
  
  await ctx.reply('📦 Создаю бэкап базы данных...');
  
  try {
    const backupFile = await createBackup();
    if (backupFile) {
      try {
        // Читаем файл как Buffer
        const fileBuffer = fs.readFileSync(backupFile);
        
        // Извлекаем только имя файла без пути для отправки
        const fileName = backupFile.split('/').pop();
        
        await ctx.replyWithDocument(new InputFile(fileBuffer, fileName), {
          caption: `✅ Бэкап успешно создан!\n🕐 ${new Date().toLocaleString('ru')}`
        });
        
        // НЕ удаляем файл - оставляем в папке backups для истории
      } catch (error) {
        console.error('Error sending backup file:', error);
        await ctx.reply(`✅ Бэкап создан: ${backupFile}\nОшибка отправки файла: ${error.message}`);
      }
    } else {
      await ctx.reply('❌ Ошибка создания бэкапа');
    }
  } catch (error) {
    console.error('Backup command error:', error);
    await ctx.reply(`❌ Ошибка создания бэкапа: ${error.message}`);
  }
});

// Команда восстановления (только для админов)
bot.command('restore', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (!session || (session.profile !== 'Нурболат' && session.profile !== 'Амина')) {
    return ctx.reply('❌ Доступ запрещен');
  }
  
  await ctx.reply('📁 Отправьте файл бэкапа (.json) для восстановления');
  
  // Устанавливаем состояние ожидания файла
  session.step = 'awaiting_backup_file';
});

// Обработка файлов бэкапа
bot.on('message:document', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  
  if (session && session.step === 'awaiting_backup_file') {
    const file = ctx.message.document;
    
    if (!file.file_name.endsWith('.json')) {
      return ctx.reply('❌ Пожалуйста, отправьте JSON файл бэкапа');
    }
    
    try {
      await ctx.reply('🔄 Скачиваю и восстанавливаю данные...');
      
      // Получаем файл
      const fileInfo = await bot.api.getFile(file.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;
      
      // Скачиваем файл
      const response = await axios.get(fileUrl);
      const tempFileName = `temp-restore-${Date.now()}.json`;
      fs.writeFileSync(tempFileName, JSON.stringify(response.data, null, 2));
      
      // Восстанавливаем
      const success = await restoreFromBackup(tempFileName);
      
      // Удаляем временный файл
      fs.unlinkSync(tempFileName);
      
      session.step = 'main_menu';
      
      if (success) {
        await ctx.reply('✅ Данные успешно восстановлены!', { reply_markup: mainMenu });
      } else {
        await ctx.reply('❌ Ошибка восстановления данных', { reply_markup: mainMenu });
      }
      
    } catch (error) {
      console.error('Restore error:', error);
      session.step = 'main_menu';
      await ctx.reply(`❌ Ошибка: ${error.message}`, { reply_markup: mainMenu });
    }
  }
});

bot.command('daily', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  if (!session || !session.profile) {
    return ctx.reply('❌ Сначала выполните /start');
  }
  
  try {
    // Сразу запускаем этап письма (этап 2)
    console.log('=== DAILY COMMAND: Starting writing stage directly ===');
    console.log('User ID:', userId, 'Profile:', session.profile);
    
    await ctx.reply('📝 <b>Ежедневное письмо</b>\n\nЗапускаю этап письменного задания...', { parse_mode: 'HTML' });
    
    // Запускаем этап письма напрямую
    await startSmartRepeatStageWriting(ctx, session);
    
  } catch (error) {
    console.error('Error in daily command:', error);
    await ctx.reply('❌ Произошла ошибка при запуске письменного задания.');
  }
});

bot.command('achievements', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  // Проверяем ежедневный бонус при входе в достижения
  await checkDailyBonus(session, ctx);
  
  // Получаем все слова пользователя
  const words = await getWords(session.profile);
  const total = words.length;
  const mastered = words.filter(w => (w.correct || 0) >= 5).length;
  
  // --- Проверка ленивца дня ---
  await checkUserInactivity(session, words, ctx);
  
  // --- XP и уровень ---
  const currentXP = session.xp || 0;
  const currentLevel = getLevelByXP(currentXP);
  const nextLevel = XP_LEVELS.find(l => l.level === currentLevel.level + 1);
  const xpToNext = nextLevel ? nextLevel.required_xp - currentXP : 0;
  const loginStreak = session.loginStreak || 0;
  
  // --- Streak ---
  // Получаем даты повторения (используем поле updatedAt, если есть, иначе createdAt)
  const dates = words
    .map(w => w.updatedAt || w.createdAt)
    .filter(Boolean)
    .map(d => new Date(d).toDateString());
  const uniqueDays = Array.from(new Set(dates)).sort();
  let studyStreak = session.studyStreak || 0;
  if (!session.slothOfTheDay) {
    // Считаем streak (дней подряд с активностью)
    if (uniqueDays.length) {
      let prev = new Date(uniqueDays[uniqueDays.length - 1]);
      studyStreak = 1;
      for (let i = uniqueDays.length - 2; i >= 0; i--) {
        const curr = new Date(uniqueDays[i]);
        const diff = (prev - curr) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          studyStreak++;
          prev = curr;
        } else if (diff > 1) {
          break;
        }
      }
    }
    session.studyStreak = studyStreak;
    session.lastStudyDate = new Date().toISOString().split('T')[0];
    // Сохраняем обновленный streak в базу данных
    await saveUserSession(session, ctx.from.id);
  } else {
    studyStreak = 0;
    session.studyStreak = 0;
    // Сохраняем обновленный streak в базу данных
    await saveUserSession(session, ctx.from.id);
  }
  
  // --- Мультипликатор XP ---
  const xpMultiplier = getStreakMultiplier(studyStreak);
  
  // --- Ачивки ---
  const achievements = [];
  // По количеству слов
  if (total >= 1) achievements.push('🌱 Новичок — 1 слово');
  if (total >= 5) achievements.push('👣 Первые шаги — 5 слов');
  if (total >= 10) achievements.push('🏅 Словарный запас — 10 слов');
  if (total >= 25) achievements.push('📚 Маленькая библиотека — 25 слов');
  if (total >= 50) achievements.push('🥈 Полсотни — 50 слов');
  if (total >= 100) achievements.push('🥇 Сотня — 100 слов');
  if (total >= 200) achievements.push('⚡ Мозговой штурм — 200 слов');
  if (total >= 500) achievements.push('👑 Гуру слов — 500 слов');
  
  // По отлично выученным словам
  if (mastered >= 10) achievements.push('🟢 Мастер 10 — 10 отлично выученных слов');
  if (mastered >= 50) achievements.push('🟢 Слово-маг — 50 отлично выученных слов');
  if (mastered >= 100) achievements.push('🟢 Суперстар — 100 отлично выученных слов');
  
  // По streak изучения
  if (studyStreak >= 2) achievements.push('🔥 Разогрев — 2 дня изучения подряд');
  if (studyStreak >= 3) achievements.push('🔥 Не сдаюсь — 3 дня изучения подряд');
  if (studyStreak >= 7) achievements.push('🔥 Неделя силы — 7 дней изучения подряд');
  if (studyStreak >= 14) achievements.push('🔥 Две недели — 14 дней изучения подряд');
  if (studyStreak >= 30) achievements.push('🔥 Месяц силы — 30 дней изучения подряд');
  if (studyStreak >= 50) achievements.push('🔥 Несгибаемый — 50 дней изучения подряд');
  if (studyStreak >= 100) achievements.push('🔥 Мастер повторения — 100 дней подряд');
  
  // По уровням
  if (currentLevel.level >= 2) achievements.push(`${currentLevel.emoji} ${currentLevel.title} — уровень ${currentLevel.level}`);
  if (currentLevel.level >= 5) achievements.push('🎯 Серьёзный игрок — уровень 5+');
  if (currentLevel.level >= 8) achievements.push('🌟 Элита — уровень 8+');
  if (currentLevel.level >= 10) achievements.push('🚀 Легенда — максимальный уровень!');
  
  // По login streak
  if (loginStreak >= 7) achievements.push('📅 Неделя постоянства — 7 дней входа подряд');
  if (loginStreak >= 30) achievements.push('📅 Месяц дисциплины — 30 дней входа подряд');
  if (loginStreak >= 100) achievements.push('📅 Машина привычек — 100 дней входа подряд');
  
  let msg = `🏆 <b>Ваши достижения</b>\n\n`;
  
  // --- Уровень и прогресс ---
  msg += `${currentLevel.emoji} <b>Уровень ${currentLevel.level}: ${currentLevel.title}</b>\n`;
  msg += `⭐ XP: ${currentXP}\n`;
  if (nextLevel) {
    const progress = Math.round(((currentXP - currentLevel.required_xp) / (nextLevel.required_xp - currentLevel.required_xp)) * 100);
    msg += `🎯 До уровня ${nextLevel.level}: ${xpToNext} XP (${progress}%)\n`;
  } else {
    msg += `🏆 Максимальный уровень достигнут!\n`;
  }
  msg += `\n`;
  
  // --- Streaks и бонусы ---
  msg += `🔥 <b>Streak изучения:</b> ${studyStreak} дней\n`;
  msg += `📅 <b>Streak входа:</b> ${loginStreak} дней\n`;
  msg += `⚡ <b>Множитель XP:</b> x${xpMultiplier.toFixed(1)}\n\n`;
  
  // --- Статистика ---
  msg += `📊 <b>Статистика:</b>\n`;
  msg += `Всего слов: ${total}\n`;
  msg += `Отлично изучено: ${mastered}\n\n`;
  
  // --- Список достижений ---
  msg += `🏅 <b>Разблокированные достижения:</b>\n`;
  if (achievements.length) {
    msg += achievements.map(a => `• ${a}`).join('\n');
  } else {
    msg += 'Пока нет достижений. Добавьте первое слово!';
  }
  
  await ctx.reply(msg, { parse_mode: 'HTML' });
});

// Обработка любых текстовых сообщений
bot.on('message:text', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const normalized = text.toLowerCase();

    // Игнорируем команды (они обрабатываются через bot.command())
    // ИСКЛЮЧЕНИЕ: разрешаем /auto и /autogen для автогенерации предложений
    if (text.startsWith('/') && text !== '/auto' && text !== '/autogen') {
      return;
    }

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

  // Специальная обработка кнопки "🧠 Умное повторение" из напоминаний
  if (text === '🧠 Умное повторение') {
    const session = sessions[userId];
    if (!session || !session.profile) {
      // Пользователь нажал кнопку из напоминания, но не залогинен
      // Попытаемся автоматически загрузить профиль
      try {
        const existingProfiles = await prisma.userProfile.findMany({
          where: { telegramId: userId.toString() }
        });
        
        if (existingProfiles.length === 1) {
          // Автоматически логиним пользователя
          const profile = existingProfiles[0];
          sessions[userId] = {
            profile: profile.profileName,
            step: 'word_tasks_menu',
            xp: profile.xp,
            level: profile.level,
            loginStreak: profile.loginStreak,
            lastBonusDate: profile.lastBonusDate,
            lastSmartRepeatDate: profile.lastSmartRepeatDate,
            reminderTime: profile.reminderTime
          };
        } else if (existingProfiles.length > 1) {
          // Несколько профилей - нужно выбрать
          sessions[userId] = { step: 'awaiting_profile' };
          return ctx.reply('Выберите профиль:', {
            reply_markup: {
              keyboard: [['Амина', 'Нурболат']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          });
        } else {
          // Новый пользователь
          return ctx.reply('Сначала выполните /start');
        }
      } catch (error) {
        console.error('Error loading profile for smart repeat:', error);
        return ctx.reply('Сначала выполните /start');
      }
    }
  }

  // Убедимся, что сессия инициализирована
  if (!sessions[userId]) {
    sessions[userId] = { step: 'awaiting_password' };
  }
  const session = sessions[userId];
  const step = session.step;

  console.log(`DEBUG: ${userId} | STEP: ${step} | TEXT: "${text}"`);

  // --- ПРИОРИТЕТНАЯ ОБРАБОТКА СОСТОЯНИЙ АВТОРИЗАЦИИ ---
  
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
    // Проверяем что это не текст кнопки
    if (text.includes('⏭️') || text.includes('🔊') || text.includes('📊') || text.includes('🏠') || text.length > 50) {
      return ctx.reply('Пожалуйста, введите корректное имя профиля (без эмодзи и кнопок):');
    }
    
    // Загружаем или создаем профиль пользователя
    const userProfile = await getOrCreateUserProfile(userId, text);
    
    session.profile = text;
    session.step = 'main_menu';
    session.xp = userProfile.xp;
    session.level = userProfile.level;
    session.loginStreak = userProfile.loginStreak;
    session.studyStreak = userProfile.studyStreak || 0;
    session.lastStudyDate = userProfile.lastStudyDate;
    session.lastBonusDate = userProfile.lastBonusDate;
    session.lastSmartRepeatDate = userProfile.lastSmartRepeatDate;
    session.reminderTime = userProfile.reminderTime;
    
    // Проверяем ежедневный бонус и показываем главное меню
    await checkDailyBonus(session, ctx);
    const menuMessage = getMainMenuMessage(session);
    
    return ctx.reply(`Вы вошли как ${session.profile}\n\n${menuMessage}`, {
      reply_markup: mainMenu,
      parse_mode: 'HTML'
    });
  }

  // --- Обработка состояний игры "Угадай перевод" ---
  
  // Обработка ответа в викторине
  if (session.step === 'quiz_game') {
    if (text === '❌ Выйти из игры') {
      session.step = 'word_tasks_menu';
      delete session.currentQuiz;
      delete session.currentQuizSession;
      return ctx.reply('🎯 Выберите тип задания:', {
        reply_markup: wordTasksMenu,
      });
    }
    
    // Обрабатываем ответ
    return await handleQuizAnswer(ctx, session, text);
  }

  // Обработка викторины в рамках умного повторения
  if (session.step === 'smart_repeat_quiz') {
    if (text === '❌ Выйти из умного повторения') {
      session.step = 'word_tasks_menu';
      delete session.currentQuizSession;
      delete session.smartRepeatWords;
      delete session.smartRepeatStage;
      return ctx.reply('🎯 Выберите тип задания:', {
        reply_markup: wordTasksMenu,
      });
    }
    
    // Обрабатываем ответ в викторине умного повторения
    console.log(`DEBUG: Handling smart repeat quiz answer for user ${ctx.from.id}, text: "${text}"`);
    return await handleSmartRepeatQuizAnswer(ctx, session, text);
  }

  // Обработка продолжения игры
  if (session.step === 'quiz_continue') {
    if (text === '🎯 Следующий вопрос' || text === '➡️ Следующий вопрос') {
      return await startQuizGame(ctx, session);
    }
    
    if (text === '🏁 Завершить викторину') {
      return await finishQuizSession(ctx, session);
    }
    
    if (text === '🎯 Новая викторина') {
      // Очищаем старую сессию и начинаем новую
      delete session.currentQuizSession;
      return await startQuizGame(ctx, session);
    }
    
    if (text === '📊 Статистика') {
      const stats = session.quizStats;
      const successRate = stats.gamesPlayed > 0 ? Math.round((stats.correctAnswers / stats.gamesPlayed) * 100) : 0;
      
      const statsMessage = `📊 <b>Статистика игры "Угадай перевод"</b>\n\n` +
        `🎮 <b>Игр сыграно:</b> ${stats.gamesPlayed}\n` +
        `✅ <b>Правильных ответов:</b> ${stats.correctAnswers}\n` +
        `❌ <b>Неправильных ответов:</b> ${stats.gamesPlayed - stats.correctAnswers}\n` +
        `📈 <b>Успешность:</b> ${successRate}%\n\n` +
        `🔥 <b>Текущая серия:</b> ${stats.currentStreak}\n` +
        `🏆 <b>Лучшая серия:</b> ${stats.bestStreak}\n\n` +
        `⭐ <b>Всего очков:</b> ${stats.totalPoints}`;
      
      const continueKeyboard = new Keyboard();
      
      // Проверяем, есть ли активная сессия викторины
      if (session.currentQuizSession && session.currentQuizSession.currentQuestionIndex < session.currentQuizSession.words.length) {
        if (session.currentQuizSession.currentQuestionIndex + 1 < session.currentQuizSession.words.length) {
          continueKeyboard.text('➡️ Следующий вопрос');
        } else {
          continueKeyboard.text('🏁 Завершить викторину');
        }
      } else {
        continueKeyboard.text('🎯 Новая викторина');
      }
      
      continueKeyboard.row()
        .text('🔙 Вернуться к заданиям')
        .row();
      
      return ctx.reply(statsMessage, {
        reply_markup: continueKeyboard,
        parse_mode: 'HTML'
      });
    }
    
    if (text === '🔙 Вернуться к заданиям') {
      session.step = 'word_tasks_menu';
      delete session.currentQuiz;
      delete session.currentQuizSession;
      return ctx.reply('🎯 Выберите тип задания:', {
        reply_markup: wordTasksMenu,
      });
    }
    
    // Если неизвестная команда, показываем меню
    const continueKeyboard = new Keyboard()
      .text('🎯 Следующий вопрос')
      .text('📊 Статистика')
      .row()
      .text('🔙 Вернуться к заданиям')
      .row();
    
    return ctx.reply('Выберите действие:', {
      reply_markup: continueKeyboard
    });
  }

  // Обработка выбора времени напоминания
  if (session.step === 'set_reminder_time') {
    await handleReminderTimeInput(ctx, text, session);
    return;
  }

  // Обработка подтверждения для /clear (должна быть в начале!)
  if (session.awaitingClearConfirmation) {
    if (normalized === 'да') {
      try {
        // Получаем все слова перед удалением для очистки аудиокэша
        const userWords = await getWords(session.profile);
        
        const deletedWords = await prisma.word.deleteMany({
          where: { profile: session.profile }
        });
        
        // Аудиоданные удаляются автоматически вместе со словами (они в той же записи)
        
        session.awaitingClearConfirmation = false;
        session.step = 'main_menu';
        
        await ctx.reply(`✅ Удалено ${deletedWords.count} слов и все связанные аудиоданные`, {
          reply_markup: mainMenu
        });
      } catch (error) {
        console.error('Error clearing words:', error);
        session.awaitingClearConfirmation = false;
        await ctx.reply('Ошибка при удалении слов');
      }
    } else {
      session.awaitingClearConfirmation = false;
      session.step = 'main_menu';
      await ctx.reply('Удаление отменено', { reply_markup: mainMenu });
    }
    return;
  }

  // Главное меню: добавить / повторить
  if (step === 'main_menu') {
    if (text === '📝 Добавить слова') {
      session.step = 'add_words_main_menu';
      return ctx.reply('📝 Выберите способ добавления слов:', {
        reply_markup: addWordsMainMenu,
      });
    }
    if (text === '🎯 Задания по словам') {
      session.step = 'word_tasks_menu';
      return ctx.reply('🎯 Выберите тип задания:', {
        reply_markup: wordTasksMenu,
      });
    }
    if (text === '📊 Мой прогресс') {
      // Вызываем команду achievements
      const userId = ctx.from.id;
      const session = sessions[userId];
      if (!session || !session.profile) {
        return ctx.reply('Сначала выполните /start');
      }
      
      // Проверяем ежедневный бонус при входе в достижения
      await checkDailyBonus(session, ctx);
      
      // Получаем все слова пользователя
      const words = await getWords(session.profile);
      const total = words.length;
      const mastered = words.filter(w => (w.correct || 0) >= 5).length;
      
      // --- Проверка ленивца дня ---
      await checkUserInactivity(session, words, ctx);
      
      // --- XP и уровень ---
      const currentXP = session.xp || 0;
      const currentLevel = getLevelByXP(currentXP);
      const nextLevel = XP_LEVELS.find(l => l.level === currentLevel.level + 1);
      const xpToNext = nextLevel ? nextLevel.required_xp - currentXP : 0;
      const loginStreak = session.loginStreak || 0;
      
      // --- Streak ---
      // Получаем даты повторения (используем поле updatedAt, если есть, иначе createdAt)
      const dates = words
        .map(w => w.updatedAt || w.createdAt)
        .filter(Boolean)
        .map(d => new Date(d).toDateString());
      const uniqueDays = Array.from(new Set(dates)).sort();
      let studyStreak = session.studyStreak || 0;
      if (!session.slothOfTheDay) {
        if (uniqueDays.length > 0) {
          const today = new Date().toDateString();
          const isStudiedToday = uniqueDays.includes(today);
          if (isStudiedToday) {
            studyStreak = 1;
            session.studyStreak = 1;
            session.lastStudyDate = new Date().toISOString().split('T')[0];
            // Сохраняем обновленный streak в базу данных
            await saveUserSession(session, ctx.from.id);
          }
        }
      } else {
        studyStreak = 0;
        session.studyStreak = 0;
        // Сохраняем обновленный streak в базу данных
        await saveUserSession(session, ctx.from.id);
      }
      
      // --- Мультипликатор XP ---
      const xpMultiplier = getStreakMultiplier(studyStreak);
      
      // --- Ачивки ---
      const achievements = [];
      // По количеству слов
      if (total >= 1) achievements.push('🎯 Первое слово — начало положено!');
      if (total >= 5) achievements.push('📚 Коллекционер — 5 слов в копилке');
      if (total >= 10) achievements.push('🌟 Десятка — 10 слов освоено');
      if (total >= 25) achievements.push('🔥 Четверть сотни — 25 слов');
      if (total >= 50) achievements.push('💪 Полсотни — 50 слов');
      if (total >= 100) achievements.push('💯 Сотня — 100 слов в арсенале');
      if (total >= 200) achievements.push('🚀 Двести — серьёзный словарный запас');
      if (total >= 500) achievements.push('👑 Словарный король — 500 слов');
      
      // По отлично выученным словам
      if (mastered >= 10) achievements.push('🟢 Мастер 10 — 10 отлично выученных слов');
      if (mastered >= 50) achievements.push('🟢 Слово-маг — 50 отлично выученных слов');
      if (mastered >= 100) achievements.push('🟢 Суперстар — 100 отлично выученных слов');
      
      // По streak изучения
      if (studyStreak >= 2) achievements.push('🔥 Разогрев — 2 дня изучения подряд');
      if (studyStreak >= 3) achievements.push('🔥 Не сдаюсь — 3 дня изучения подряд');
      if (studyStreak >= 7) achievements.push('🔥 Неделя силы — 7 дней изучения подряд');
      if (studyStreak >= 14) achievements.push('🔥 Две недели — 14 дней изучения подряд');
      if (studyStreak >= 30) achievements.push('🔥 Месяц силы — 30 дней изучения подряд');
      if (studyStreak >= 50) achievements.push('🔥 Несгибаемый — 50 дней изучения подряд');
      if (studyStreak >= 100) achievements.push('🔥 Мастер повторения — 100 дней подряд');
      
      // По уровням
      if (currentLevel.level >= 2) achievements.push(`${currentLevel.emoji} ${currentLevel.title} — уровень ${currentLevel.level}`);
      if (currentLevel.level >= 5) achievements.push('🎯 Серьёзный игрок — уровень 5+');
      if (currentLevel.level >= 8) achievements.push('🌟 Элита — уровень 8+');
      if (currentLevel.level >= 10) achievements.push('🚀 Легенда — максимальный уровень!');
      
      // По login streak
      if (loginStreak >= 7) achievements.push('📅 Неделя постоянства — 7 дней входа подряд');
      if (loginStreak >= 30) achievements.push('📅 Месяц дисциплины — 30 дней входа подряд');
      if (loginStreak >= 100) achievements.push('📅 Машина привычек — 100 дней входа подряд');
      
      let msg = `🏆 <b>Ваши достижения</b>\n\n`;
      
      // --- Уровень и прогресс ---
      msg += `${currentLevel.emoji} <b>Уровень ${currentLevel.level}: ${currentLevel.title}</b>\n`;
      msg += `⭐ XP: ${currentXP}\n`;
      if (nextLevel) {
        const progress = Math.round(((currentXP - currentLevel.required_xp) / (nextLevel.required_xp - currentLevel.required_xp)) * 100);
        msg += `🎯 До уровня ${nextLevel.level}: ${xpToNext} XP (${progress}%)\n`;
      } else {
        msg += `🏆 Максимальный уровень достигнут!\n`;
      }
      msg += `\n`;
      
      // --- Streaks и бонусы ---
      msg += `🔥 <b>Streak изучения:</b> ${studyStreak} дней\n`;
      msg += `📅 <b>Streak входа:</b> ${loginStreak} дней\n`;
      msg += `⚡ <b>Множитель XP:</b> x${xpMultiplier.toFixed(1)}\n\n`;
      
      // --- Статистика ---
      msg += `📊 <b>Статистика:</b>\n`;
      msg += `Всего слов: ${total}\n`;
      msg += `Отлично изучено: ${mastered}\n\n`;
      
      // --- Список достижений ---
      msg += `🏅 <b>Разблокированные достижения:</b>\n`;
      if (achievements.length) {
        msg += achievements.map(a => `• ${a}`).join('\n');
      } else {
        msg += 'Пока нет достижений. Добавьте первое слово!';
      }
      
      return ctx.reply(msg, { parse_mode: 'HTML' });
    }
    // Если текст не из меню — показываем меню снова
    return ctx.reply('Выберите действие из меню:', {
      reply_markup: mainMenu,
    });
  }

  // Подменю: добавить слова
  if (step === 'add_words_main_menu') {
    if (text === '✍️ Добавить своё слово') {
      session.step = 'awaiting_english';
      return ctx.reply('Напиши слово на английском:');
    }
    if (text === '📚 Слова из Oxford 3000') {
      session.step = 'select_words_count_oxford';
      return ctx.reply('Сколько слов добавить?', {
        reply_markup: wordsCountMenu,
      });
    }
    if (text === '🎓 Слова из IELTS') {
      session.step = 'select_words_count_ielts';
      return ctx.reply('Сколько слов добавить?', {
        reply_markup: wordsCountMenu,
      });
    }
    if (text === '🔙 Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    return ctx.reply('📝 Выберите способ добавления слов:', {
      reply_markup: addWordsMainMenu,
    });
  }

  // Подменю: задания по словам
  if (step === 'word_tasks_menu') {
    console.log(`DEBUG: Received text in word_tasks_menu: "${text}"`);
    
    if (text === '🧠 Умное повторение') {
      // Умное повторение с учетом времени последнего обновления
      const userWords = await getWords(session.profile);
      if (userWords.length === 0) {
        session.step = 'main_menu';
        return ctx.reply('Недостаточно слов для теста. Добавьте хотя бы одно.', {
          reply_markup: mainMenu,
        });
      }

      const now = new Date();
      const DAY_MS = 24 * 60 * 60 * 1000;
      
      // Функция расчета приоритета слова для повторения
      function calculatePriority(word) {
        const lastUpdate = word.updatedAt || word.createdAt;
        const daysSinceUpdate = (now - lastUpdate) / DAY_MS;
        
        // Базовые интервалы в зависимости от уровня знания
        let intervalDays;
        if (word.correct <= 1) intervalDays = 1;      // новые слова каждый день
        else if (word.correct === 2) intervalDays = 2; // через день
        else if (word.correct === 3) intervalDays = 4; // через 4 дня
        else if (word.correct === 4) intervalDays = 7; // через неделю
        else if (word.correct === 5) intervalDays = 14; // через 2 недели
        else intervalDays = 30; // месяц для хорошо изученных
        
        // Чем больше просрочка, тем выше приоритет
        const overdue = Math.max(0, daysSinceUpdate - intervalDays);
        return overdue + (6 - Math.min(word.correct, 5)) * 2; // бонус за низкий уровень
      }
      
      // Сортируем слова по приоритету (убывание)
      const sortedWords = userWords
        .map(w => ({ ...w, priority: calculatePriority(w) }))
        .sort((a, b) => b.priority - a.priority);
      
      // Берем топ-20 слов с наивысшим приоритетом для умного повторения
      const wordsToRepeat = sortedWords.slice(0, 20);
      
      // Сохраняем слова для всех этапов умного повторения
      session.smartRepeatWords = wordsToRepeat;
      
      // ЭТАП 1: Запускаем викторину "Угадай перевод" с этими словами
      // Берем первые 20 слов для викторины
      const quizWords = wordsToRepeat.slice(0, 20);
      if (quizWords.length < 20) {
        // Если слов меньше 20, дополняем случайными
        const remainingWords = userWords.filter(w => !quizWords.includes(w));
        while (quizWords.length < 20 && remainingWords.length > 0) {
          const randomIndex = Math.floor(Math.random() * remainingWords.length);
          quizWords.push(remainingWords.splice(randomIndex, 1)[0]);
        }
      }
      
      // Запускаем викторину как первый этап умного повторения
      session.step = 'smart_repeat_quiz';
      session.smartRepeatStage = 1; // Отслеживаем этап умного повторения
      
      // Инициализируем викторину
      const currentQuizSession = {
        words: quizWords,
        currentQuestionIndex: 0,
        score: 0,
        answers: [],
        isSmartRepeat: true // Флаг что это викторина в рамках умного повторения
      };
      
      session.currentQuizSession = currentQuizSession;
      
      // Генерируем первый вопрос
      const firstQuestion = await generateQuizQuestion(currentQuizSession.words, 0, userWords);
      console.log(`DEBUG: Generated first question for smart repeat:`, firstQuestion);
      
      await ctx.reply(
        `🧠 <b>Умное повторение - Этап 1/5</b>\n` +
        `🎯 <b>Викторина "Угадай перевод"</b>\n\n` +
        `Выбраны ${wordsToRepeat.length} приоритетных слов для повторения.\n\n` +
        `<b>Вопрос 1/20:</b>\n${firstQuestion.question}`,
        { 
          reply_markup: firstQuestion.keyboard,
          parse_mode: 'HTML' 
        }
      );
      console.log(`DEBUG: Smart repeat quiz message sent successfully`);
      
      // Отправляем аудио для первого слова
      const currentWord = currentQuizSession.words[0];
      if (currentWord && currentWord.word) {
        try {
          console.log(`DEBUG: Attempting to send audio for word: "${currentWord.word}"`);
          await sendWordAudioFromDB(ctx, currentWord.word, session.profile, { silent: true });
          console.log(`DEBUG: Audio sent successfully for word: "${currentWord.word}"`);
        } catch (error) {
          console.error('Error sending audio for first word in smart repeat:', error);
          // Не прерываем выполнение, если аудио не отправилось
        }
      }
      console.log(`DEBUG: Smart repeat initialization completed for user ${ctx.from.id}`);
      return; // ВАЖНО: останавливаем выполнение после инициализации умного повторения
    }
    
    if (text === '🎯 Угадай перевод' || text === 'Угадай перевод' || text === '� Угадай перевод') {
      console.log('🎯 Quiz button clicked by user:', ctx.from.id);
      
      // Проверяем, есть ли слова у пользователя
      const userWords = await getWords(session.profile);
      console.log('📚 User has', userWords.length, 'words');
      
      if (userWords.length < 4) {
        console.log('❌ Not enough words for quiz');
        session.step = 'word_tasks_menu';
        return ctx.reply('❌ Для игры нужно минимум 4 слова в вашем словаре. Добавьте больше слов!', {
          reply_markup: wordTasksMenu,
        });
      }
      
      console.log('✅ Starting quiz game...');
      // Запускаем игру
      return await startQuizGame(ctx, session);
    }
    
    if (text === '🎭 Ситуативные задания' || text === '�🎭 Ситуативные задания') {
      session.step = 'situational_menu';
      return ctx.reply('🎯 Выберите место для ситуативного задания:', {
        reply_markup: situationalMenu,
      });
    }
    if (text === '📺 Примеры из жизни') {
      session.step = 'examples_menu';
      return ctx.reply('📺 Выберите тип примеров:', {
        reply_markup: examplesMenu,
      });
    }
    if (text === '🔙 Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    return ctx.reply('🎯 Выберите тип задания:', {
      reply_markup: wordTasksMenu,
    });
  }

  // Выбор количества слов для Oxford 3000
  if (step === 'select_words_count_oxford') {
    const countMap = { '7 слов': 7, '10 слов': 10, '15 слов': 15, '20 слов': 20 };
    if (countMap[text]) {
      session.selectedWordsCount = countMap[text];
      session.step = 'awaiting_oxford_section';
      return ctx.reply('Выбери, какие слова ты хочешь сегодня выучить:', {
        reply_markup: getOxfordSectionsMenu(),
      });
    }
    if (text === '🔙 Назад в меню') {
      session.step = 'add_words_main_menu';
      return ctx.reply('📝 Выберите способ добавления слов:', { reply_markup: addWordsMainMenu });
    }
    return ctx.reply('Сколько слов добавить?', {
      reply_markup: wordsCountMenu,
    });
  }

  // Выбор количества слов для IELTS
  if (step === 'select_words_count_ielts') {
    const countMap = { '7 слов': 7, '10 слов': 10, '15 слов': 15, '20 слов': 20 };
    if (countMap[text]) {
      session.selectedWordsCount = countMap[text];
      
      // Сразу добавляем IELTS-слова
      const userWords = await getWords(session.profile);
      const known = new Set(userWords.map(w => w.word.toLowerCase()));
      const newWords = ieltsWords.filter(w => !known.has(getFirstTwoWords(w.word).toLowerCase()));
      if (newWords.length === 0) {
        session.step = 'main_menu';
        return ctx.reply('Все IELTS-слова уже были добавлены!', { reply_markup: mainMenu });
      }
      
      const pick = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);
      const toAdd = pick(newWords, session.selectedWordsCount).map(w => ({ ...w, word: getFirstTwoWords(w.word) }));
      
      const prompt = `Для каждого из этих английских слов: [${toAdd.map(w => w.word).join(', ')}] укажи перевод на русский, очень короткое объяснение (на русском, не более 10 слов), пример на английском и перевод примера. Верни только массив JSON вида [{\"word\": \"example\", \"translation\": \"пример\", \"explanation\": \"краткое объяснение\", \"example\": \"This is an example.\", \"example_translation\": \"Это пример.\"}, ...]. Не добавляй ничего лишнего, только массив.`;
      await ctx.reply('Запрашиваю объяснения и примеры у AI, подождите...');
      
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
        
        let words = [];
        const match = gptRes.data.choices[0].message.content.match(/\[.*\]/s);
        if (match) {
          words = JSON.parse(match[0]);
        } else {
          throw new Error('AI не вернул массив слов.');
        }
        
        // Добавляем слова последовательно с аудио
        const processedWords = await addWordsSequentiallyWithAudio(ctx, session.profile, words, 'IELTS');
        session.step = 'main_menu';
        
        let msgParts = [];
        for (let i = 0; i < processedWords.length; i += 5) {
          const chunk = processedWords.slice(i, i + 5);
          let msg = 'Добавлены IELTS-слова с объяснением и примерами:\n';
          msg += chunk.map(w => `\n<b>${w.word}</b> — ${w.translation}\n${w.explanation}\nПример: ${w.example}\nПеревод: ${w.example_translation}`).join('\n');
          msgParts.push(msg);
        }
        for (const part of msgParts) {
          await ctx.reply(part, { reply_markup: mainMenu, parse_mode: 'HTML' });
        }
        
        // Отправляем аудио после текстовых сообщений
        await sendAudioForWords(ctx, session.profile, processedWords);
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
    if (text === '🔙 Назад в меню') {
      session.step = 'add_words_main_menu';
      return ctx.reply('📝 Выберите способ добавления слов:', { reply_markup: addWordsMainMenu });
    }
    return ctx.reply('Сколько слов добавить?', {
      reply_markup: wordsCountMenu,
    });
  }

  // Меню ситуативных заданий
  if (step === 'situational_menu') {
    const locations = [
      '✈️ Аэропорт', '🏛️ Музей', '🏥 Больница', '🍽️ Ресторан', '🛍️ Магазин', 
      '🏨 Отель', '🚌 Транспорт', '📚 Библиотека', '⚽ Стадион', '🏢 Офис', 
      '🏦 Банк', '🛣️ Улица', '🎭 Театр', '🚗 Автосервис', '🏫 Школа'
    ];
    
    if (locations.includes(text)) {
      session.step = 'generating_situation';
      session.selectedLocation = text;
      
      await ctx.reply('🤔 Генерирую интересную ситуацию...');
      
      try {
        const situation = await generateSituation(text);
        session.currentSituation = situation;
        session.step = 'awaiting_situation_response';
        
        await ctx.reply(`${text}\n\n${situation}`, {
          reply_markup: new Keyboard().text('Назад в меню').row()
        });
      } catch (error) {
        console.error('Ошибка при генерации ситуации:', error);
        session.step = 'situational_menu';
        await ctx.reply('Произошла ошибка при генерации ситуации. Попробуйте еще раз.', {
          reply_markup: situationalMenu
        });
      }
      return;
    }
    
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    
    return ctx.reply('🎯 Выберите место для ситуативного задания:', {
      reply_markup: situationalMenu,
    });
  }

  // Обработка ответа пользователя на ситуацию
  if (step === 'awaiting_situation_response') {
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    
    session.step = 'checking_grammar';
    await ctx.reply('🔍 Проверяю вашу грамматику...');
    
    try {
      const feedback = await checkGrammar(text);
      session.step = 'situational_menu';
      
      await ctx.reply(`📝 <b>Фидбек по вашему ответу:</b>\n\n${feedback}`, {
        reply_markup: situationalMenu,
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Ошибка при проверке грамматики:', error);
      session.step = 'situational_menu';
      await ctx.reply('Произошла ошибка при проверке. Попробуйте еще раз.', {
        reply_markup: situationalMenu
      });
    }
    return;
  }

  // Меню примеров из жизни
  if (step === 'examples_menu') {
    if (text === '📰 Примеры в стиле новостей') {
      session.step = 'awaiting_word_for_news';
      return ctx.reply('📰 Введите английское слово, для которого хотите увидеть примеры в стиле новостей:', {
        reply_markup: new Keyboard().text('Назад в меню').row()
      });
    }
    if (text === '🎬 Примеры в стиле фильмов') {
      session.step = 'awaiting_word_for_movies';
      return ctx.reply('🎬 Введите английское слово, для которого хотите увидеть примеры в стиле диалогов из фильмов/сериалов:', {
        reply_markup: new Keyboard().text('Назад в меню').row()
      });
    }
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    return ctx.reply('📺 Выберите тип примеров:', {
      reply_markup: examplesMenu,
    });
  }

  // Поиск примеров из новостей
  if (step === 'awaiting_word_for_news') {
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    
    const word = text.trim().toLowerCase();
    await ctx.reply('🔍 Создаю примеры в стиле новостей...');
    
    try {
      const examples = await searchNewsExamples(word);
      await ctx.reply(`📰 **News Examples for "${word}":**\n\n${examples}`, {
        reply_markup: new Keyboard()
          .text('Найти другое слово')
          .text('Назад в меню')
          .row(),
        parse_mode: 'Markdown'
      });
      
      session.step = 'examples_news_results';
    } catch (error) {
      console.error('Ошибка при поиске новостных примеров:', error);
      await ctx.reply('Произошла ошибка при поиске примеров. Попробуйте еще раз.', {
        reply_markup: new Keyboard().text('Назад в меню').row()
      });
    }
    return;
  }

  // Поиск примеров из фильмов/сериалов
  if (step === 'awaiting_word_for_movies') {
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    
    const word = text.trim().toLowerCase();
    await ctx.reply('🎬 Создаю примеры в стиле диалогов...');
    
    try {
      const examples = await searchMovieExamples(word);
      await ctx.reply(`🎬 **Movie/TV Examples for "${word}":**\n\n${examples}`, {
        reply_markup: new Keyboard()
          .text('Найти другое слово')
          .text('Назад в меню')
          .row(),
        parse_mode: 'Markdown'
      });
      
      session.step = 'examples_movies_results';
    } catch (error) {
      console.error('Ошибка при поиске примеров из фильмов:', error);
      await ctx.reply('Произошла ошибка при поиске примеров. Попробуйте еще раз.', {
        reply_markup: new Keyboard().text('Назад в меню').row()
      });
    }
    return;
  }

  // Результаты поиска новостей
  if (step === 'examples_news_results') {
    if (text === 'Найти другое слово') {
      session.step = 'awaiting_word_for_news';
      return ctx.reply('📰 Введите другое английское слово для поиска в новостях:', {
        reply_markup: new Keyboard().text('Назад в меню').row()
      });
    }
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    return ctx.reply('Выберите действие:', {
      reply_markup: new Keyboard()
        .text('Найти другое слово')
        .text('Назад в меню')
        .row()
    });
  }

  // Результаты поиска фильмов
  if (step === 'examples_movies_results') {
    if (text === 'Найти другое слово') {
      session.step = 'awaiting_word_for_movies';
      return ctx.reply('🎬 Введите другое английское слово для поиска в фильмах/сериалах:', {
        reply_markup: new Keyboard().text('Назад в меню').row()
      });
    }
    if (text === 'Назад в меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', { reply_markup: mainMenu });
    }
    return ctx.reply('Выберите действие:', {
      reply_markup: new Keyboard()
        .text('Найти другое слово')
        .text('Назад в меню')
        .row()
    });
  }

  // Обработка ответов на повторение слов
  if (step === 'waiting_answer') {
    // Специальная обработка для этапа 3 умного повторения
    if (session.smartRepeatStage === 3) {
      return await handleSmartRepeatStage3Answer(ctx, session, text);
    }
    
    // Проверяем наличие массива и индекса
    if (!session.wordsToRepeat || !Array.isArray(session.wordsToRepeat) || 
        session.currentIndex === undefined || session.currentIndex >= session.wordsToRepeat.length) {
      session.step = 'main_menu';
      return ctx.reply('⚠️ Ошибка в системе повторения. Возвращаемся в меню.', { reply_markup: mainMenu });
    }
    
    const wordObj = session.wordsToRepeat[session.currentIndex];
    let correct, answer;
    if (wordObj.direction === 'en-ru') {
      correct = wordObj.translation.toLowerCase();
      answer = normalized;
    } else {
      correct = wordObj.word.toLowerCase();
      answer = normalized;
    }
    const all = await getWords(session.profile);
    const idx = all.findIndex(w =>
      w.word === wordObj.word && w.translation === wordObj.translation
    );

    // --- Работа над ошибками ---
    if (!session.mistakes) session.mistakes = [];
    if (!session.mistakeCounts) session.mistakeCounts = {};

    if (answer === correct) {
      await ctx.reply('✅ Верно!');
      
      // Начисляем XP за правильный ответ
      const wordCorrectLevel = (all[idx]?.correct || 0);
      const xpGained = await awardXP(session, wordCorrectLevel, ctx);
      
      // Сохраняем обновленный уровень и XP в базу данных
      await saveUserSession(session, ctx.from.id);
      
      if (idx !== -1) await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, (all[idx].correct || 0) + 1);
      
      // Показываем полученный XP
      await ctx.reply(`💫 +${xpGained} XP`);
    } else {
      await ctx.reply(`❌ Неверно. Правильный ответ: ${correct}`);
      if (idx !== -1) {
        // В умном повторении мягко уменьшаем счетчик, не сбрасываем в 0
        if (session.repeatMode === 'smart') {
          const newCorrect = Math.max(0, (all[idx].correct || 0) - 1);
          await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, newCorrect);
        } else {
          await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, 0);
        }
      }
      // Добавляем ошибку, если ещё не добавляли
      const key = wordObj.word + '|' + wordObj.translation;
      if (!session.mistakes.find(w => w.word === wordObj.word && w.translation === wordObj.translation)) {
        session.mistakes.push({ ...wordObj, direction: wordObj.direction });
        session.mistakeCounts[key] = 0;
      }
    }

    session.currentIndex++;
    if (session.currentIndex < session.wordsToRepeat.length) {
      const next = session.wordsToRepeat[session.currentIndex];
      const question = next.direction === 'en-ru'
        ? `Как переводится слово: "${next.word}"?`
        : `Как по-английски: "${next.translation}"?`;
      
      await ctx.reply(question);
      
      // Отправляем аудио для слова (только если направление en-ru)
      if (next.direction === 'en-ru') {
        await sendWordAudioFromDB(ctx, next.word, session.profile);
      }
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
      await ctx.reply(question);
      
      // Отправляем аудио для слова (только если направление en-ru)
      if (firstMistake.direction === 'en-ru') {
        await sendWordAudioFromDB(ctx, firstMistake.word, session.profile);
      }
    } else {
      // --- Изменение: если повторение по разделу или IELTS, то только перевод, без sentence_task ---
      if (session.repeatMode === 'oxford_section' || session.repeatMode === 'ielts') {
        session.step = 'main_menu';
        return ctx.reply('📘 Повторение завершено!', {
          reply_markup: mainMenu,
        });
      }
      // --- Умное повторение переходит к sentence_task ---
      if (session.repeatMode === 'smart') {
        // Проверяем, какой этап умного повторения
        if (session.smartRepeatStage === 3) {
          // Этап 3 завершен - переходим к этапу 4 (предложения)
          await startSmartRepeatStage4(ctx, session);
          return;
        } else {
          // Обычное умное повторение (не многоэтапное) или этап 3 завершен
          // Отмечаем что умное повторение пройдено сегодня
          const todayString = new Date().toDateString();
          session.lastSmartRepeatDate = todayString;
          
          console.log(`DEBUG SMART REPEAT: User ${ctx.from.id} completed smart repeat`);
          console.log(`  - Setting lastSmartRepeatDate to: "${todayString}"`);
          
          // Сохраняем изменения в базу данных
          if (session.profile) {
            await saveUserSession(ctx.from.id, session.profile, session);
            console.log(`  - Saved to database for profile: ${session.profile}`);
          }
          
          const allUserWords = await getWords(session.profile);
          const newWords = allUserWords.filter(w => w.correct <= 2).slice(0, 7);
          if (newWords.length > 0) {
            session.sentenceTaskWords = newWords;
            session.sentenceTaskIndex = 0;
            session.step = 'sentence_task';
            await ctx.reply(`🧠 Умное повторение завершено!\n\nТеперь напиши предложения с новыми словами (${newWords.length}): по одному предложению на слово. Пиши по одному предложению на английском.`);
            await ctx.reply(`Первое слово: "${newWords[0].word}". Напиши предложение с этим словом на английском:`);
            return;
          } else {
            session.step = 'main_menu';
            return ctx.reply('🧠 Умное повторение завершено! Приоритетные слова проработаны.', {
              reply_markup: mainMenu,
            });
          }
        }
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
      const allUserWords = await getWords(session.profile);
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
      
      await ctx.reply(question);
      
      // Отправляем аудио для слова (только если направление en-ru)
      if (next.direction === 'en-ru') {
        await sendWordAudioFromDB(ctx, next.word, session.profile);
      }
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
      const allUserWords = await getWords(session.profile);
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
    await addWord(session.profile, word, translation, null);
    
    // Создаем меню для продолжения добавления слов
    const continueAddingMenu = new Keyboard()
      .text('➕ Добавить ещё слово')
      .row()
      .text('🔙 Назад в меню добавления')
      .text('🏠 Главное меню')
      .row();
    
    session.step = 'word_added_menu';
    return ctx.reply('✅ Слово добавлено!\n\nЧто делаем дальше?', {
      reply_markup: continueAddingMenu,
    });
  }

  // Меню после добавления слова
  if (step === 'word_added_menu') {
    if (text === '➕ Добавить ещё слово') {
      session.step = 'awaiting_english';
      return ctx.reply('Напиши слово на английском:');
    }
    if (text === '🔙 Назад в меню добавления') {
      session.step = 'add_words_main_menu';
      return ctx.reply('📝 Выберите способ добавления слов:', {
        reply_markup: addWordsMainMenu,
      });
    }
    if (text === '🏠 Главное меню') {
      session.step = 'main_menu';
      return ctx.reply('Выберите действие:', {
        reply_markup: mainMenu,
      });
    }
    // Если пользователь ввел что-то другое, показываем меню снова
    const continueAddingMenu = new Keyboard()
      .text('➕ Добавить ещё слово')
      .row()
      .text('🔙 Назад в меню добавления')
      .text('🏠 Главное меню')
      .row();
    return ctx.reply('✅ Выберите действие:', {
      reply_markup: continueAddingMenu,
    });
  }
  // Выбор раздела для добавления выбранного количества слов из 3000
  if (step === 'awaiting_oxford_section') {
    const section = text.trim();
    const sectionWords = oxford3000.filter(w => w.section === section);
    if (!sectionWords.length) {
      // step не меняем, остаёмся на 'awaiting_oxford_section'
      return ctx.reply('В этом разделе нет слов. Выберите другой раздел.', { reply_markup: getOxfordSectionsMenu() });
    }
    // Уже изученные слова пользователя (по word)
    const userWords = await getWords(session.profile);
    const known = new Set(userWords.map(w => w.word.toLowerCase()));
    // Оставляем только новые слова
    const newWords = sectionWords.filter(w => !known.has(w.word.toLowerCase()));
    if (newWords.length === 0) {
      // step не меняем, остаёмся на 'awaiting_oxford_section'
      return ctx.reply('Все слова из этого раздела уже были добавлены!', { reply_markup: getOxfordSectionsMenu() });
    }
    // Берём до выбранного количества случайных новых слов
    const pick = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);
    // Используем только основную форму для ChatGPT и для сохранения
    const wordsCount = session.selectedWordsCount || 20;
    const toAdd = pick(newWords, wordsCount).map(w => ({ ...w, word: getMainForm(w.word) }));
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
      const processedWords = await addWordsSequentiallyWithAudio(ctx, session.profile, words, section);
      session.step = 'main_menu';
      // Формируем сообщения для пользователя по 5 слов в каждом
      let msgParts = [];
      for (let i = 0; i < processedWords.length; i += 5) {
        const chunk = processedWords.slice(i, i + 5);
        let msg = 'Добавлены слова с объяснением и примерами:\n';
        msg += chunk.map(w => `\n<b>${w.word}</b> — ${w.translation}\n${w.explanation}\nПример: ${w.example}\nПеревод: ${w.example_translation}`).join('\n');
        msgParts.push(msg);
      }
      for (const part of msgParts) {
        await ctx.reply(part, { reply_markup: mainMenu, parse_mode: 'HTML' });
      }
      
      // Отправляем аудио после текстовых сообщений
      await sendAudioForWords(ctx, session.profile, processedWords);
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

  // Повторение слов из выбранного раздела oxford3000
  if (step === 'repeat_oxford_section') {
    const section = text.trim();
    const userWords = await getWords(session.profile);
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
    
    // Функция для безопасного выбора направления теста
    function getSafeDirection(word, allWords) {
      // Проверяем, есть ли другие слова с таким же переводом
      const sameTranslation = allWords.filter(w => w.translation.toLowerCase() === word.translation.toLowerCase());
      if (sameTranslation.length > 1) {
        // Если есть дубликаты перевода, используем только en-ru
        return 'en-ru';
      }
      // Если перевод уникальный, можем использовать любое направление
      return Math.random() < 0.5 ? 'en-ru' : 'ru-en';
    }
    
    session.wordsToRepeat = wordsToRepeat.map(w => {
      const direction = getSafeDirection(w, userWords);
      return { ...w, direction };
    });
    session.currentIndex = 0;
    session.step = 'waiting_answer';
    session.repeatMode = 'oxford_section'; // <--- добавлено
    const first = session.wordsToRepeat[0];
    const question = first.direction === 'en-ru'
      ? `Как переводится слово: "${first.word}"?`
      : `Как по-английски: "${first.translation}"?`;
    
    await ctx.reply(question);
    
    // Отправляем аудио для слова (только если направление en-ru)
    if (first.direction === 'en-ru') {
      await sendWordAudio(ctx, first.word);
    }
  }

  // --- Выбор способа создания предложений ---
  if (step === 'sentence_task_choice') {
    if (text === '✍️ Написать самому') {
      // Запускаем ручной ввод предложений
      await startManualSentenceInput(ctx, session);
      return;
    } else if (text === '/auto' || text === '/autogen') {
      // Запускаем автоматическую генерацию (скрытая команда)
      await autoGenerateAndAnalyzeSentences(ctx, session);
      return;
    } else {
      // Неизвестный выбор - переходим к ручному вводу
      await startManualSentenceInput(ctx, session);
      return;
    }
  }

  // --- Этап письменного задания ---
  if (step === 'writing_task') {
    if (text === '⏭️ Пропустить этап') {
      // Пропускаем этап письма и переходим к этапу 3
      session.smartRepeatStage = 3;
      delete session.writingTopic;
      
      await ctx.reply('⏭️ Этап 2 (письмо) пропущен!\n\n🧠 <b>Умное повторение - Этап 3/5</b>\n<b>Знаю/Не знаю</b>\n\nПереходим к быстрой оценке слов...');
      return await startSmartRepeatStage2(ctx, session); // Это старая функция "Знаю/Не знаю", которая стала этапом 3
      
    } else {
      // Пользователь отправил текст для анализа
      await handleWritingAnalysis(ctx, session, text);
      return;
    }
  }

  // --- Результат анализа письма ---
  if (step === 'writing_analysis_result') {
    if (text === '📝 Выполнить упражнения') {
      await startWritingDrills(ctx, session);
      return;
    } else if (text === '➡️ Продолжить к следующему этапу') {
      // Переходим к этапу 3 (Знаю/Не знаю)
      session.smartRepeatStage = 3;
      delete session.writingTopic;
      delete session.writingAnalysis;
      
      await ctx.reply('🧠 <b>Умное повторение - Этап 3/5</b>\n<b>Знаю/Не знаю</b>\n\nПереходим к быстрой оценке слов...');
      return await startSmartRepeatStage2(ctx, session); // Это старая функция "Знаю/Не знаю", которая стала этапом 3
    }
  }

  // --- Упражнения по письму ---
  if (step === 'writing_drill') {
    if (text === '➡️ Следующее упражнение') {
      // Эта кнопка обрабатывается автоматически в handleWritingDrillAnswer, просто показываем следующее
      await showCurrentWritingDrill(ctx, session);
      return;
    } else if (text === '➡️ Продолжить к следующему этапу') {
      // Завершаем упражнения и переходим к этапу 3
      delete session.writingDrills;
      delete session.currentDrillIndex;
      delete session.drillResults;
      delete session.writingAnalysis;
      
      session.smartRepeatStage = 3;
      
      await ctx.reply('🧠 <b>Умное повторение - Этап 3/5</b>\n<b>Знаю/Не знаю</b>\n\nПереходим к быстрой оценке слов...', { parse_mode: 'HTML' });
      return await startSmartRepeatStage2(ctx, session); // Это старая функция "Знаю/Не знаю", которая стала этапом 3
    } else {
      await handleWritingDrillAnswer(ctx, session, text);
      return;
    }
  }

  // --- Задание: предложения с новыми словами ---
  if (step === 'sentence_task') {
    // Проверяем команды автогенерации
    if (text === '/auto' || text === '/autogen') {
      await ctx.reply('🤖 Переключаюсь на автоматическую генерацию...');
      await autoGenerateAndAnalyzeSentences(ctx, session);
      return;
    }
    
    try {
      const idx = session.sentenceTaskIndex || 0;
      const words = session.sentenceTaskWords || [];
      
      // Проверяем, что есть слова и индекс корректный
      if (words.length === 0 || idx >= words.length) {
        session.step = 'main_menu';
        return ctx.reply('⚠️ Ошибка: нет слов для задания. Возвращаемся в меню.', { reply_markup: mainMenu });
      }
      
      // Инициализируем массив для хранения предложений
      if (!session.sentenceTaskAnswers) {
        session.sentenceTaskAnswers = [];
      }
      
      // Сохраняем предложение пользователя
      const wordObj = words[idx];
      const sentence = text.trim();
      
      // Простая валидация - проверяем что предложение не пустое
      if (sentence.length < 3) {
        return ctx.reply('Пожалуйста, напишите более содержательное предложение (минимум 3 символа).');
      }
      
      // Сохраняем предложение с уникальным ID
      const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      session.sentenceTaskAnswers.push({
        id: uniqueId,
        word: wordObj.word,
        translation: wordObj.translation,
        sentence: sentence,
        context: wordObj.context || 'общий контекст' // сохраняем контекст ситуации
      });
      
      await ctx.reply('✅ Предложение записано!');
      
      // Переходим к следующему слову
      session.sentenceTaskIndex = idx + 1;
      if (session.sentenceTaskIndex < words.length) {
        // Получаем подходящий контекст от AI для следующего слова
        const nextWord = words[session.sentenceTaskIndex];
        await ctx.reply('🤔 Подбираю подходящий контекст для слова...');
        const situation = await getAIContext(nextWord.word, nextWord.translation);
        nextWord.context = situation.context; // Сохраняем контекст для следующего слова
        
        await ctx.reply(
          `Напиши предложение со словом <b>"${nextWord.word}"</b> (${nextWord.translation}) в контексте: <b>${situation.context}</b>\n\n${situation.description ? `💡 ${situation.description}` : ''}`,
          { parse_mode: 'HTML' }
        );
      } else {
        // Все предложения написаны - запускаем итоговый AI анализ
        await analyzeSentencesWithAI(ctx, session);
      }
      return;
    } catch (error) {
      console.error('Error in sentence_task handling:', error);
      // В случае сетевой ошибки, пытаемся отправить простое сообщение
      try {
        await ctx.reply('⚠️ Произошла сетевая ошибка. Попробуйте отправить предложение еще раз.');
      } catch (retryError) {
        console.error('Failed to send retry message:', retryError);
      }
      return;
    }
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
      delete session.storyText;
      delete session.storyQuestions;
      delete session.storyQuestionIndex;
      delete session.storyTaskWords;
      
      if (session.smartRepeatStage === 5) {
        // Этап 5 умного повторения завершен - завершаем всё умное повторение
        await completeSmartRepeat(ctx, session);
      } else {
        // Обычное текстовое задание - показываем поздравление
        session.step = 'main_menu';
        const relaxTip = getRandomRelaxTip();
        const congratsMessage = `🎉 <b>Отличная работа!</b> Ты завершил все задания на сегодня!\n\n💡 <b>Время отдохнуть с пользой:</b>\n${relaxTip}`;
        
        return ctx.reply(congratsMessage, { 
          parse_mode: 'HTML',
          reply_markup: mainMenu 
        });
      }
      return;
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
      // Показываем дополнительные слова перед завершением
      if (session.additionalVocabulary && session.additionalVocabulary.length > 0) {
        let vocabMessage = '📚 <b>Дополнительная лексика из текста:</b>\n\n';
        session.additionalVocabulary.forEach((item, index) => {
          vocabMessage += `${index + 1}. <b>${item.word}</b> - ${item.translation}\n`;
        });
        
        await ctx.reply(vocabMessage, { parse_mode: 'HTML' });
      }
      
      delete session.storyText;
      delete session.storyQuestions;
      delete session.storyQuestionIndex;
      delete session.storyTaskWords;
      delete session.additionalVocabulary; // Удаляем дополнительные слова
      
      if (session.smartRepeatStage === 5) {
        // Этап 5 умного повторения завершен - завершаем всё умное повторение
        await completeSmartRepeat(ctx, session);
      } else {
        // Обычное текстовое задание - показываем поздравление
        session.step = 'main_menu';
        const relaxTip = getRandomRelaxTip();
        const congratsMessage = `🎉 <b>Отличная работа!</b> Ты завершил все задания на сегодня!\n\n💡 <b>Время отдохнуть с пользой:</b>\n${relaxTip}`;
        
        await ctx.reply(congratsMessage, { 
          parse_mode: 'HTML',
          reply_markup: mainMenu 
        });
      }
    }
    return;
  }

  // На всякий случай: если ничего не подошло
  return ctx.reply('Не понял. Используйте меню или введите /menu.', {
    reply_markup: mainMenu,
  });
  } catch (error) {
    console.error('Error in message handler:', error);
    try {
      await ctx.reply('⚠️ Произошла ошибка. Попробуйте /menu для возврата в главное меню.');
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

// Функция для генерации story task контента
async function generateStoryTaskContent(session, ctx) {
  try {
    console.log('=== GENERATE STORY TASK CONTENT START ===');
    
    const storyWords = session.storyTaskWords || [];
    console.log('Story words:', storyWords);
    
    // Проверяем наличие API ключа
    if (!process.env.OPENAI_API_KEY) {
      console.error('No OpenAI API key found');
      session.step = 'main_menu';
      await ctx.reply('❌ Функция генерации текста временно недоступна. Обратитесь к администратору.', { reply_markup: mainMenu });
      return;
    }
    
    console.log('API key available, creating prompt...');
    
    // Исправленный промпт для разнообразных ситуаций
    const prompt = `Ты — опытный автор коротких рассказов.

Напиши увлекательный текст на английском языке из 10-15 предложений на ЛЮБУЮ интересную тему (НЕ про школу или учителей).

Темы могут быть разнообразными:
- Приключения и путешествия
- Технологии и будущее  
- Природа и животные
- Городская жизнь
- Спорт и хобби
- Работа и карьера
- Семья и друзья
- Еда и кулинария
- Искусство и культура
- Любая другая интересная тема

В этом тексте обязательно используй ВСЕ следующие слова, выделяя их жирным (используй двойные звёздочки **): [${storyWords.join(', ')}].

Текст должен быть логичным, естественным и подходящим для уровня intermediate (B1–B2).

После текста создай 10 интересных вопросов по нему, соблюдая следующее правило:
- 2 вопроса на общее понимание текста (General understanding)
- 2 вопроса на проверку конкретных деталей из текста (Specific details)
- 2 вопроса на проверку понимания слов в контексте (Vocabulary in context)
- 2 вопроса на логическое умозаключение (Inference question)
- 2 вопроса на выявление причинно-следственной связи (Cause and effect)

К каждому вопросу обязательно дай ровно 5 вариантов ответов (1 правильный и 4 дистрактора, порядок случайный).

Также выбери 15 интересных и сложных слов из текста (НЕ из списка изучаемых слов: [${storyWords.join(', ')}]), которые могут быть полезны для изучения, и дай их перевод на русский.

Ответ должен быть строго в формате JSON без дополнительного текста и комментариев:
{
  "text": "сгенерированный текст",
  "questions": [
    {
      "type": "General understanding",
      "question": "Текст вопроса...",
      "options": ["вариант1", ...],
      "correct_option": "правильный вариант"
    }, ...
  ],
  "additional_vocabulary": [
    {
      "word": "слово",
      "translation": "перевод"
    }, ...
  ]
}`;

    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,  // Увеличиваем для большего разнообразия
      max_tokens: 4000  // Увеличиваем для 10 вопросов и 15 дополнительных слов
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
    session.additionalVocabulary = storyData.additional_vocabulary || []; // Сохраняем дополнительные слова
    
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
      session.step = 'main_menu';
      await ctx.reply('Ошибка: AI не вернул вопросы к тексту.', { reply_markup: mainMenu });
      return;
    }
    
    const q = storyData.questions[0];
    if (!Array.isArray(q.options) || !q.options.length) {
      console.error('AI не вернул опции для первого вопроса! Ответ:', answer);
      session.step = 'main_menu';
      await ctx.reply('Ошибка: AI не вернул варианты ответов.', { reply_markup: mainMenu });
      return;
    }
    
    session.step = 'story_quiz';
    await ctx.reply(`Вопрос 1/10: ${q.question}`, {
      reply_markup: Keyboard.from(q.options.map(opt => [opt]), { one_time_keyboard: true, resize_keyboard: true })
    });
    
  } catch (e) {
    console.error('Error in generateStoryTaskContent:', e);
    
    // Логируем детали ошибки
    if (e.response && e.response.data) {
      console.error('API response error:', e.response.data);
    }
    
    session.step = 'main_menu';
    let errorMsg = 'Произошла ошибка при генерации текста. ';
    
    if (e.response && e.response.data && e.response.data.error) {
      const apiError = e.response.data.error;
      console.error('OpenAI API Error:', apiError);
      
      if (apiError.code === 'insufficient_quota') {
        errorMsg += 'Превышен лимит API запросов. Попробуйте позже.';
      } else if (apiError.code === 'invalid_api_key') {
        errorMsg += 'Проблема с API ключом. Обратитесь к администратору.';
      } else {
        errorMsg += `API ошибка: ${apiError.message}`;
      }
    } else if (e.message.includes('JSON')) {
      errorMsg += 'AI вернул некорректный ответ. Попробуйте еще раз.';
    } else {
      errorMsg += `Ошибка: ${e.message}`;
    }
    
    await ctx.reply(errorMsg, { reply_markup: mainMenu });
  }
}

// Обработка команд бота
bot.api.setMyCommands([
  { command: 'menu', description: 'Главное меню' },
  { command: 'start', description: 'Начать/перезапустить бота' },
  { command: 'words', description: 'Показать мои слова' },
  { command: 'sections', description: 'Показать разделы' },
  { command: 'achievements', description: 'Личный прогресс и достижения' },
  { command: 'reminder', description: 'Настроить ежедневные напоминания' },
  { command: 'delete', description: 'Удалить слово' },
  { command: 'clear', description: 'Удалить все слова' },
  { command: 'clear_audio', description: '🔊 Очистить аудиоданные из БД' },
  { command: 'backup', description: '📦 Создать и скачать бэкап' },
  { command: 'backups', description: '📂 Список всех бэкапов' },
  { command: 'checkdb', description: '🔍 Проверить базу данных' },
]);

// Функция безопасного удаления с подтверждением
async function safeDeleteWord(profile, word, translation) {
  try {
    // Создаем мини-бэкап перед удалением
    const wordToDelete = await prisma.word.findFirst({
      where: { profile, word, translation }
    });
    
    if (wordToDelete) {
      const backupEntry = {
        timestamp: new Date().toISOString(),
        action: 'DELETE',
        word: wordToDelete
      };
      
      const deleteLogFile = `delete-log-${new Date().toISOString().split('T')[0]}.json`;
      let deleteLog = [];
      
      if (fs.existsSync(deleteLogFile)) {
        deleteLog = JSON.parse(fs.readFileSync(deleteLogFile, 'utf8'));
      }
      
      deleteLog.push(backupEntry);
      fs.writeFileSync(deleteLogFile, JSON.stringify(deleteLog, null, 2));
      
      console.log(`📝 Word deletion logged: ${word} -> ${deleteLogFile}`);
    }
    
    // Удаляем аудиоданные для слова из БД
    await deleteWordAudioFromDB(word, profile);
    
    return await prisma.word.deleteMany({
      where: { profile, word, translation }
    });
  } catch (error) {
    console.error('Safe delete error:', error);
    throw error;
  }
}

// Простой сервер для пинга
const http = require('http');
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is alive');
}).listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// --- Система бэкапов ---

// Функция создания бэкапа всех данных
async function createBackup() {
  try {
    console.log('🔄 Starting backup creation...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Создаем папку backups если её нет
    const backupDir = 'backups';
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
      console.log(`📁 Created backup directory: ${backupDir}`);
    }
    
    // Получаем все слова из базы
    console.log('📊 Fetching words from database...');
    const allWords = await prisma.word.findMany({
      orderBy: { createdAt: 'asc' }
    });
    console.log(`📊 Found ${allWords.length} words in database`);
    
    // Получаем все профили пользователей из базы
    console.log('👤 Fetching user profiles from database...');
    const allProfiles = await prisma.userProfile.findMany({
      orderBy: { createdAt: 'asc' }
    });
    console.log(`👤 Found ${allProfiles.length} user profiles in database`);
    
    const backupData = {
      timestamp: new Date().toISOString(),
      totalWords: allWords.length,
      totalProfiles: allProfiles.length,
      words: allWords,
      userProfiles: allProfiles
    };
    
    // Сохраняем локально в папку backups
    const backupFileName = `${backupDir}/backup-${timestamp}.json`;
    console.log(`💾 Writing backup file: ${backupFileName}`);
    
    try {
      fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup file created successfully: ${backupFileName}`);
    } catch (fileError) {
      console.error('❌ File write error:', fileError);
      throw new Error(`Failed to write backup file: ${fileError.message}`);
    }
    
    // Проверяем, что файл существует
    if (!fs.existsSync(backupFileName)) {
      throw new Error(`Backup file was not created: ${backupFileName}`);
    }
    
    console.log(`✅ Backup created: ${backupFileName} (${allWords.length} words)`);
    
    // Отправляем админу уведомление
    const adminUserId = Object.keys(sessions).find(id => 
      sessions[id].profile === 'Нурболат' || sessions[id].profile === 'Амина'
    );
    
    if (adminUserId) {
      console.log(`📨 Sending backup to admin: ${adminUserId}`);
      try {
        // Читаем файл как Buffer
        const fileBuffer = fs.readFileSync(backupFileName);
        
        await bot.api.sendDocument(adminUserId, new InputFile(fileBuffer, backupFileName), {
          caption: `📦 Ежедневный бэкап базы данных\n🕐 ${new Date().toLocaleString('ru')}\n📊 Слов в базе: ${allWords.length}`
        });
        console.log('✅ Backup sent to admin successfully');
      } catch (sendError) {
        console.error('❌ Failed to send backup to admin:', sendError);
        // Не прерываем выполнение, если не удалось отправить
      }
    } else {
      console.log('⚠️ No admin user found to send backup');
    }
    
    return backupFileName;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    return null;
  }
}

// Функция восстановления из бэкапа
async function restoreFromBackup(backupFilePath) {
  try {
    const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
    
    console.log(`🔄 Restoring from backup: ${backupData.totalWords} words`);
    if (backupData.userProfiles) {
      console.log(`🔄 Also restoring: ${backupData.totalProfiles || backupData.userProfiles.length} user profiles`);
    }
    
    // Восстанавливаем слова
    for (const word of backupData.words) {
      // Проверяем, есть ли уже такое слово
      const existing = await prisma.word.findFirst({
        where: {
          profile: word.profile,
          word: word.word,
          translation: word.translation
        }
      });
      
      if (!existing) {
        // Обрабатываем аудиоданные
        let audioData = null;
        if (word.audioData) {
          // Если audioData - это объект Buffer из JSON, конвертируем его в Buffer
          if (word.audioData.type === 'Buffer' && Array.isArray(word.audioData.data)) {
            audioData = Buffer.from(word.audioData.data);
          } else if (typeof word.audioData === 'string') {
            // Если это base64 строка
            audioData = Buffer.from(word.audioData, 'base64');
          } else {
            audioData = word.audioData;
          }
        }
        
        await prisma.word.create({
          data: {
            profile: word.profile,
            word: word.word,
            translation: word.translation,
            section: word.section,
            correct: word.correct,
            audioData: audioData,
            createdAt: word.createdAt,
            updatedAt: word.updatedAt
          }
        });
      }
    }
    
    // Восстанавливаем профили пользователей (если есть в бэкапе)
    if (backupData.userProfiles && Array.isArray(backupData.userProfiles)) {
      for (const profile of backupData.userProfiles) {
        // Проверяем, есть ли уже такой профиль
        const existing = await prisma.userProfile.findFirst({
          where: {
            telegramId: profile.telegramId,
            profileName: profile.profileName
          }
        });
        
        if (existing) {
          // Обновляем существующий профиль, сохраняя максимальные значения
          await prisma.userProfile.update({
            where: { id: existing.id },
            data: {
              xp: Math.max(existing.xp || 0, profile.xp || 0),
              level: Math.max(existing.level || 1, profile.level || 1),
              loginStreak: Math.max(existing.loginStreak || 0, profile.loginStreak || 0),
              studyStreak: Math.max(existing.studyStreak || 0, profile.studyStreak || 0),
              lastStudyDate: profile.lastStudyDate || existing.lastStudyDate,
              lastBonusDate: profile.lastBonusDate || existing.lastBonusDate,
              lastSmartRepeatDate: profile.lastSmartRepeatDate || existing.lastSmartRepeatDate,
              reminderTime: profile.reminderTime || existing.reminderTime
            }
          });
        } else {
          // Создаем новый профиль
          await prisma.userProfile.create({
            data: {
              telegramId: profile.telegramId,
              profileName: profile.profileName,
              xp: profile.xp || 0,
              level: profile.level || 1,
              loginStreak: profile.loginStreak || 0,
              studyStreak: profile.studyStreak || 0,
              lastStudyDate: profile.lastStudyDate,
              lastBonusDate: profile.lastBonusDate,
              lastSmartRepeatDate: profile.lastSmartRepeatDate,
              reminderTime: profile.reminderTime,
              createdAt: profile.createdAt,
              updatedAt: profile.updatedAt
            }
          });
        }
      }
    }
    
    console.log(`✅ Backup restored successfully`);
    return true;
  } catch (error) {
    console.error('❌ Restore failed:', error);
    return false;
  }
}

// --- Система напоминаний о streak ---

// Функция для получения случайного напоминания
function getRandomReminder(remindersArray) {
  return remindersArray[Math.floor(Math.random() * remindersArray.length)];
}

// Функция для отправки напоминаний всем пользователям
async function sendRemindersToUsers(reminderType) {
  const now = new Date();
  const today = now.toDateString();
  
  console.log(`DEBUG REMINDERS: Running ${reminderType} reminders at ${now.toISOString()}`);
  console.log(`  - Today string: "${today}"`);
  
  try {
    // Загружаем всех пользователей из базы данных
    const userProfiles = await prisma.userProfile.findMany();
    
    for (const userProfile of userProfiles) {
      const telegramId = parseInt(userProfile.telegramId);
      
      // Проверяем, не прошел ли уже умное повторение сегодня
      const didSmartRepeatToday = userProfile.lastSmartRepeatDate === today;
      
      console.log(`DEBUG REMINDERS: User ${telegramId} (${userProfile.profileName})`);
      console.log(`  - lastSmartRepeatDate from DB: "${userProfile.lastSmartRepeatDate}"`);
      console.log(`  - today: "${today}"`);
      console.log(`  - didSmartRepeatToday: ${didSmartRepeatToday}`);
      
      if (didSmartRepeatToday) {
        console.log(`  - SKIPPED: User already did smart repeat today`);
        continue;
      }
      
      // Выбираем случайное напоминание в зависимости от типа
      let reminderText;
      switch (reminderType) {
        case '6h':
          reminderText = getRandomReminder(REMINDERS_6H);
          break;
        case '3h':
          reminderText = getRandomReminder(REMINDERS_3H);
          break;
        case '1h':
          reminderText = getRandomReminder(REMINDERS_1H);
          break;
        default:
          continue;
      }
      
      try {
        // Отправляем напоминание БЕЗ кнопки - это просто уведомление
        await bot.api.sendMessage(telegramId, reminderText);
        
        console.log(`Reminder sent to user ${telegramId}: ${reminderType}`);
      } catch (error) {
        console.error(`Failed to send reminder to user ${telegramId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in sendRemindersToUsers:', error);
  }
}

// Настройка cron-задач для напоминаний
// За 6 часов до полуночи (18:00)
cron.schedule('0 18 * * *', () => {
  console.log('Sending 6-hour reminders...');
  sendRemindersToUsers('6h');
}, {
  timezone: "Asia/Yekaterinburg" // GMT+5
});

// За 3 часа до полуночи (21:00)
cron.schedule('0 21 * * *', () => {
  console.log('Sending 3-hour reminders...');
  sendRemindersToUsers('3h');
}, {
  timezone: "Asia/Yekaterinburg" // GMT+5
});

// За 1 час до полуночи (23:00)
cron.schedule('0 23 * * *', () => {
  console.log('Sending 1-hour reminders...');
  sendRemindersToUsers('1h');
}, {
  timezone: "Asia/Yekaterinburg" // GMT+5
});

// Ежедневный автоматический бэкап в 2:00 ночи
cron.schedule('0 2 * * *', () => {
  console.log('� Creating daily backup...');
  createBackup();
}, {
  timezone: "Asia/Yekaterinburg" // GMT+5
});

console.log('�🔔 Reminder system initialized!');
console.log('📦 Daily backup system initialized!');

bot.catch((err) => console.error('Bot error:', err));
// --- Система мини-игр ---

// Функция запуска игры "Угадай перевод"
async function startQuizGame(ctx, session) {
  try {
    console.log('🎮 Starting quiz game for user:', ctx.from.id);
    
    // Инициализируем статистику игры если её нет
    if (!session.quizStats) {
      console.log('📊 Initializing quiz stats for user');
      session.quizStats = {
        gamesPlayed: 0,
        correctAnswers: 0,
        currentStreak: 0,
        bestStreak: 0,
        totalPoints: 0
      };
    }
    
    // Получаем слова пользователя
    console.log('📚 Getting user words for profile:', session.profile);
    const userWords = await getWords(session.profile);
    console.log('📚 Found words:', userWords.length);
    
    if (userWords.length === 0) {
      console.log('❌ No words found for user');
      session.step = 'word_tasks_menu';
      return ctx.reply('❌ У вас нет слов в словаре. Добавьте слова сначала!', {
        reply_markup: wordTasksMenu,
      });
    }
    
    // Если это новая игра, инициализируем сессию викторины
    if (!session.currentQuizSession) {
      // Выбираем 10 случайных слов для викторины
      const shuffledWords = [...userWords].sort(() => Math.random() - 0.5);
      const selectedWords = shuffledWords.slice(0, Math.min(10, userWords.length));
      
      session.currentQuizSession = {
        words: selectedWords,
        currentQuestionIndex: 0,
        correctAnswersInSession: 0,
        startTime: Date.now()
      };
      
      console.log(`🎯 Created new quiz session with ${selectedWords.length} words`);
    }
    
    const quizSession = session.currentQuizSession;
    
    // Проверяем, есть ли еще вопросы
    if (quizSession.currentQuestionIndex >= quizSession.words.length) {
      // Викторина завершена
      return await finishQuizSession(ctx, session);
    }
    
    // Получаем текущее слово для вопроса
    const targetWord = quizSession.words[quizSession.currentQuestionIndex];
    console.log(`🎯 Question ${quizSession.currentQuestionIndex + 1}/${quizSession.words.length}: ${targetWord.word} -> ${targetWord.translation}`);
    
    // Создаем варианты ответов
    console.log('🔄 Generating quiz options...');
    const options = await generateQuizOptions(targetWord, userWords);
    console.log('✅ Generated options:', options);
    
    // Сохраняем данные игры в сессии
    session.currentQuiz = {
      targetWord: targetWord,
      correctAnswer: targetWord.translation,
      options: options,
      startTime: Date.now()
    };
    
    session.step = 'quiz_game';
    
    // Создаем клавиатуру с вариантами
    const quizKeyboard = new Keyboard();
    options.forEach((option, index) => {
      quizKeyboard.text(`${index + 1}️⃣ ${option}`).row();
    });
    quizKeyboard.text('❌ Выйти из игры').row();
    
    // Простое сообщение без общей статистики
    
    const message = `🎯 <b>Угадай перевод!</b>\n\n` +
      `� <b>Вопрос ${quizSession.currentQuestionIndex + 1} из ${quizSession.words.length}</b>\n` +
      `✅ <b>Правильно в этой игре:</b> ${quizSession.correctAnswersInSession}\n\n` +
      `�📝 <b>Слово:</b> <code>${targetWord.word}</code>\n\n` +
      `🤔 Выберите правильный перевод:`;
    console.log('📤 Sending quiz message to user...');
    
    await ctx.reply(message, { 
      reply_markup: quizKeyboard,
      parse_mode: 'HTML'
    });
    
    // Отправляем аудио с произношением слова
    await sendWordAudioFromDB(ctx, targetWord.word, session.profile, { silent: true });
    
  } catch (error) {
    console.error('❌ Quiz game error:', error);
    console.error('❌ Error stack:', error.stack);
    session.step = 'word_tasks_menu';
    return ctx.reply('❌ Ошибка запуска игры. Попробуйте снова.', {
      reply_markup: wordTasksMenu,
    });
  }
}

// Функция генерации вопроса для викторины (для умного повторения)
async function generateQuizQuestion(words, questionIndex, allUserWords) {
  try {
    // Проверяем входные параметры
    if (!Array.isArray(words) || questionIndex < 0 || questionIndex >= words.length) {
      throw new Error('Invalid words array or questionIndex');
    }
    
    const targetWord = words[questionIndex];
    if (!targetWord || !targetWord.word || !targetWord.translation) {
      throw new Error('Invalid target word structure');
    }
    
    // Генерируем варианты ответов
    const options = await generateQuizOptions(targetWord, allUserWords);
    
    // Проверяем, что получили варианты ответов
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error('Failed to generate quiz options');
    }
    
    // Создаем клавиатуру
    const keyboard = new Keyboard();
    options.forEach((option, index) => {
      keyboard.text(`${index + 1}️⃣ ${option}`).row();
    });
    keyboard.text('❌ Выйти из умного повторения').row();
    
    return {
      question: `📝 <b>Слово:</b> <code>${targetWord.word}</code>\n\n🤔 Выберите правильный перевод:`,
      keyboard,
      correctAnswer: targetWord.translation
    };
  } catch (error) {
    console.error('Error in generateQuizQuestion:', error);
    // Возвращаем безопасный fallback
    return {
      question: '⚠️ Ошибка при генерации вопроса',
      keyboard: new Keyboard().text('❌ Выйти из умного повторения').row(),
      correctAnswer: 'unknown'
    };
  }
}

// Функция генерации вариантов ответов для викторины
async function generateQuizOptions(targetWord, userWords) {
  const options = [targetWord.translation];
  
  // Добавляем неправильные варианты из слов пользователя
  const otherUserWords = userWords.filter(w => w.id !== targetWord.id && w.translation !== targetWord.translation);
  const wrongOptions = [];
  
  // Берем случайные переводы из слов пользователя
  while (wrongOptions.length < 2 && otherUserWords.length > 0) {
    const randomWord = otherUserWords[Math.floor(Math.random() * otherUserWords.length)];
    if (!wrongOptions.includes(randomWord.translation)) {
      wrongOptions.push(randomWord.translation);
    }
    otherUserWords.splice(otherUserWords.indexOf(randomWord), 1);
  }
  
  // Если нужно, добавляем варианты из Oxford 3000
  if (wrongOptions.length < 3) {
    const oxfordTranslations = oxford3000
      .filter(w => w.translation && w.translation !== targetWord.translation && !wrongOptions.includes(w.translation))
      .map(w => w.translation);
    
    while (wrongOptions.length < 3 && oxfordTranslations.length > 0) {
      const randomTranslation = oxfordTranslations[Math.floor(Math.random() * oxfordTranslations.length)];
      if (!wrongOptions.includes(randomTranslation)) {
        wrongOptions.push(randomTranslation);
      }
      oxfordTranslations.splice(oxfordTranslations.indexOf(randomTranslation), 1);
    }
  }
  
  // Добавляем неправильные варианты к правильному
  options.push(...wrongOptions);
  
  // Перемешиваем варианты
  return options.sort(() => Math.random() - 0.5);
}

// Функция обработки ответа в викторине
async function handleQuizAnswer(ctx, session, answerText) {
  try {
    const quiz = session.currentQuiz;
    const quizSession = session.currentQuizSession;
    if (!quiz || !quizSession || !Array.isArray(quizSession.words)) {
      console.log('Invalid quiz state in handleQuizAnswer');
      return false;
    }
    
    // Определяем, какой вариант выбрал пользователь
    const answerMatch = answerText.match(/^([1-4])️⃣\s(.+)$/);
    if (!answerMatch) return false;
    
    const selectedAnswer = answerMatch[2];
    const isCorrect = selectedAnswer === quiz.correctAnswer;
  
  // Обновляем статистику викторины (не общую статистику - она обновится в конце)
  if (isCorrect) {
    quizSession.correctAnswersInSession++;
    session.quizStats.correctAnswers++;
    session.quizStats.currentStreak++;
    
    // Обновляем лучшую серию
    if (session.quizStats.currentStreak > session.quizStats.bestStreak) {
      session.quizStats.bestStreak = session.quizStats.currentStreak;
    }
    
    // Начисляем очки
    let points = 10;
    
    // Бонус за серию (каждые 5 правильных ответов подряд)
    if (session.quizStats.currentStreak % 5 === 0) {
      points += 10;
    }
    
    session.quizStats.totalPoints += points;
    
    // Обновляем прогресс слова в базе данных
    try {
      await prisma.word.update({
        where: { id: quiz.targetWord.id },
        data: { correct: quiz.targetWord.correct + 1 }
      });
    } catch (error) {
      console.error('Error updating word progress:', error);
    }
    
    // Подготавливаем сообщение об успехе
    let successMessage = `✅ <b>Правильно!</b> +${points} очков\n\n`;
    successMessage += `📝 <b>${quiz.targetWord.word}</b> — ${quiz.correctAnswer}\n\n`;
    
    // Показываем информацию о слове если есть
    if (quiz.targetWord.section) {
      successMessage += `📂 <b>Раздел:</b> ${quiz.targetWord.section}\n`;
    }
    
    successMessage += `🔥 <b>Серия:</b> ${session.quizStats.currentStreak}\n`;
    successMessage += `⭐ <b>Всего очков:</b> ${session.quizStats.totalPoints}\n\n`;
    
    // Особые сообщения за достижения
    if (session.quizStats.currentStreak === 5) {
      successMessage += `🎉 <b>Отличная серия!</b> Бонус +10 очков!\n`;
    } else if (session.quizStats.currentStreak === 10) {
      successMessage += `🏆 <b>Невероятная серия!</b> Вы на огне!\n`;
    } else if (session.quizStats.currentStreak % 5 === 0 && session.quizStats.currentStreak > 10) {
      successMessage += `💎 <b>Легендарная серия ${session.quizStats.currentStreak}!</b> Бонус +10 очков!\n`;
    }
    
    // Кнопки для продолжения
    const continueKeyboard = new Keyboard();
    
    // Проверяем, есть ли еще вопросы в викторине
    if (quizSession.currentQuestionIndex + 1 < quizSession.words.length) {
      continueKeyboard.text('➡️ Следующий вопрос');
    } else {
      continueKeyboard.text('🏁 Завершить викторину');
    }
    
    continueKeyboard.text('📊 Статистика')
      .row()
      .text('🔙 Вернуться к заданиям')
      .row();
    
    // Добавляем информацию о прогрессе
    successMessage += `\n📊 <b>Прогресс:</b> ${quizSession.currentQuestionIndex + 1}/${quizSession.words.length} вопросов\n`;
    successMessage += `✅ <b>Правильно в этой игре:</b> ${quizSession.correctAnswersInSession}`;
    
    // Переходим к следующему вопросу
    quizSession.currentQuestionIndex++;
    
    session.step = 'quiz_continue';
    
    return ctx.reply(successMessage, {
      reply_markup: continueKeyboard,
      parse_mode: 'HTML'
    });
    
  } else {
    // Неправильный ответ
    session.quizStats.currentStreak = 0;
    
    // Уменьшаем прогресс слова в базе данных
    try {
      const newCorrect = Math.max(0, quiz.targetWord.correct - 1);
      await prisma.word.update({
        where: { id: quiz.targetWord.id },
        data: { correct: newCorrect }
      });
    } catch (error) {
      console.error('Error updating word progress:', error);
    }
    
    let failMessage = `❌ <b>Неправильно!</b>\n\n` +
      `📝 <b>${quiz.targetWord.word}</b> — <b>${quiz.correctAnswer}</b>\n` +
      `🎯 Вы выбрали: ${selectedAnswer}\n\n` +
      `💔 Серия прервана\n` +
      `⭐ Очки: ${session.quizStats.totalPoints}`;
    
    const continueKeyboard = new Keyboard();
    
    // Проверяем, есть ли еще вопросы в викторине
    if (quizSession.currentQuestionIndex + 1 < quizSession.words.length) {
      continueKeyboard.text('➡️ Следующий вопрос');
    } else {
      continueKeyboard.text('🏁 Завершить викторину');
    }
    
    continueKeyboard.text('📊 Статистика')
      .row()
      .text('🔙 Вернуться к заданиям')
      .row();
    
    // Добавляем информацию о прогрессе
    failMessage += `\n\n📊 <b>Прогресс:</b> ${quizSession.currentQuestionIndex + 1}/${quizSession.words.length} вопросов\n`;
    failMessage += `✅ <b>Правильно в этой игре:</b> ${quizSession.correctAnswersInSession}`;
    
    // Переходим к следующему вопросу
    quizSession.currentQuestionIndex++;
    
    session.step = 'quiz_continue';
    
    return ctx.reply(failMessage, {
      reply_markup: continueKeyboard,
      parse_mode: 'HTML'
    });
  }
  } catch (error) {
    console.error('Error in handleQuizAnswer:', error);
    await ctx.reply('⚠️ Произошла ошибка в викторине. Попробуйте /menu.');
    return false;
  }
}

// Функция завершения викторины
async function finishQuizSession(ctx, session) {
  const quizSession = session.currentQuizSession;
  const stats = session.quizStats;
  
  // Обновляем общую статистику
  stats.gamesPlayed++;
  
  // Считаем результаты
  const totalQuestions = quizSession.words.length;
  const correctAnswers = quizSession.correctAnswersInSession;
  const successRate = Math.round((correctAnswers / totalQuestions) * 100);
  const timeTaken = Math.round((Date.now() - quizSession.startTime) / 1000);
  
  // Начисляем бонусные очки за завершение викторины
  let bonusPoints = 0;
  if (successRate >= 90) {
    bonusPoints = 50; // Отличный результат
  } else if (successRate >= 70) {
    bonusPoints = 30; // Хороший результат
  } else if (successRate >= 50) {
    bonusPoints = 15; // Удовлетворительный результат
  }
  
  stats.totalPoints += bonusPoints;
  
  // Формируем сообщение о результатах
  let resultMessage = `🏁 <b>Викторина завершена!</b>\n\n`;
  resultMessage += `📊 <b>Ваш результат:</b>\n`;
  resultMessage += `✅ Правильных ответов: <b>${correctAnswers}</b> из <b>${totalQuestions}</b>\n`;
  resultMessage += `📈 Успешность: <b>${successRate}%</b>\n`;
  resultMessage += `⏱️ Время: <b>${timeTaken} сек</b>\n\n`;
  
  // Добавляем информацию о бонусах
  if (bonusPoints > 0) {
    resultMessage += `🎁 <b>Бонус за результат: +${bonusPoints} очков!</b>\n\n`;
  }
  
  // Добавляем мотивационное сообщение
  if (successRate >= 90) {
    resultMessage += `🌟 <b>Превосходно!</b> Вы отлично знаете эти слова!\n`;
  } else if (successRate >= 70) {
    resultMessage += `👍 <b>Хорошо!</b> Продолжайте в том же духе!\n`;
  } else if (successRate >= 50) {
    resultMessage += `💪 <b>Неплохо!</b> Есть над чем поработать.\n`;
  } else {
    resultMessage += `📚 <b>Нужно больше практики!</b> Повторите эти слова.\n`;
  }
  
  resultMessage += `\n⭐ <b>Всего очков:</b> ${stats.totalPoints}\n`;
  resultMessage += `🏆 <b>Лучшая серия:</b> ${stats.bestStreak}`;
  
  // Создаем клавиатуру для продолжения
  const finishKeyboard = new Keyboard()
    .text('🎯 Новая викторина')
    .text('📊 Статистика')
    .row()
    .text('🔙 Вернуться к заданиям')
    .row();
  
  // Очищаем текущую сессию викторины
  delete session.currentQuizSession;
  session.step = 'quiz_continue';
  
  return ctx.reply(resultMessage, {
    reply_markup: finishKeyboard,
    parse_mode: 'HTML'
  });
}

// Функция обработки ответа в викторине умного повторения
async function handleSmartRepeatQuizAnswer(ctx, session, answerText) {
  console.log(`DEBUG: handleSmartRepeatQuizAnswer called for user ${ctx.from.id}, answer: "${answerText}"`);
  
  const quizSession = session.currentQuizSession;
  if (!quizSession || !quizSession.isSmartRepeat) {
    console.log(`DEBUG: No quiz session or not smart repeat. quizSession: ${!!quizSession}, isSmartRepeat: ${quizSession?.isSmartRepeat}`);
    return false;
  }
  
  console.log(`DEBUG: Quiz session found, currentQuestionIndex: ${quizSession.currentQuestionIndex}, words length: ${quizSession.words.length}`);
  
  const currentQuestionIndex = quizSession.currentQuestionIndex;
  const word = quizSession.words[currentQuestionIndex];
  
  // Генерируем вопрос для текущего слова чтобы получить правильный ответ
  const allWords = await getWords(session.profile);
  const questionData = await generateQuizQuestion(quizSession.words, currentQuestionIndex, allWords);
    
    // Определяем, какой вариант выбрал пользователь
  const answerMatch = answerText.match(/^([1-4])️⃣\s(.+)$/);
  console.log(`DEBUG: Answer text: "${answerText}", match result:`, answerMatch);
  if (!answerMatch) {
    console.log(`DEBUG: Answer text doesn't match expected format. Returning false.`);
    return false;
  }
  
  const selectedAnswer = answerMatch[2];
  const isCorrect = selectedAnswer === questionData.correctAnswer;
  
  // Обновляем статистику слова в базе данных
  if (isCorrect) {
    try {
      await updateWordCorrect(session.profile, word.word, word.translation, word.correct + 1);
      console.log(`Smart repeat quiz: ${word.word} correct count increased`);
    } catch (error) {
      console.error('Error updating word progress in smart repeat quiz:', error);
    }
    
    quizSession.score++;
  }
  
  // Сохраняем ответ
  quizSession.answers.push({
    word: word.word,
    translation: word.translation,
    isCorrect: isCorrect,
    selectedAnswer: selectedAnswer,
    correctAnswer: questionData.correctAnswer
  });
  
  // Переходим к следующему вопросу
  quizSession.currentQuestionIndex++;
  
  let responseMessage;
  
  if (isCorrect) {
    responseMessage = `✅ <b>Правильно!</b>\n\n` +
      `📝 <b>${word.word}</b> — ${questionData.correctAnswer}`;
  } else {
    responseMessage = `❌ <b>Неправильно!</b>\n\n` +
      `📝 <b>${word.word}</b> — <b>${questionData.correctAnswer}</b>\n` +
      `🎯 Вы выбрали: ${selectedAnswer}`;
  }
  
  // Проверяем, закончились ли вопросы
  if (quizSession.currentQuestionIndex >= quizSession.words.length) {
    // Викторина завершена - показываем итоги
    const correctCount = quizSession.score;
    const totalQuestions = quizSession.words.length;
    const percentage = Math.round((correctCount / totalQuestions) * 100);
    
    responseMessage += `\n\n🏆 <b>Этап 1 завершен!</b>\n` +
      `📊 Результат: ${correctCount}/${totalQuestions} (${percentage}%)\n\n` +
      `➡️ Переходим к этапу 2/5: "Напиши текст"`;
    
    // Сначала отправляем итоги викторины
    await ctx.reply(responseMessage, { parse_mode: 'HTML' });
    
    // Потом переходим к этапу 2 (письмо)
    await startSmartRepeatStageWriting(ctx, session);
    
    return;
  } else {
    // Есть еще вопросы - показываем следующий
    const nextQuestion = await generateQuizQuestion(quizSession.words, quizSession.currentQuestionIndex, allWords);
    
    responseMessage += `\n\n📊 <b>Прогресс:</b> ${quizSession.currentQuestionIndex + 1}/${quizSession.words.length}` +
      `\n\n<b>Вопрос ${quizSession.currentQuestionIndex + 1}/20:</b>\n${nextQuestion.question}`;
    
    await ctx.reply(responseMessage, {
      reply_markup: nextQuestion.keyboard,
      parse_mode: 'HTML'
    });
    
    // Отправляем аудио для следующего слова
    const nextWord = quizSession.words[quizSession.currentQuestionIndex];
    if (nextWord && nextWord.word) {
      try {
        await sendWordAudioFromDB(ctx, nextWord.word, session.profile, { silent: true });
      } catch (error) {
        console.error('Error sending audio for next word in smart repeat quiz:', error);
        // Не прерываем выполнение, если аудио не отправилось
      }
    }
  }
}

// Функция запуска этапа 2 умного повторения (Знаю/Не знаю)
async function startSmartRepeatStage2(ctx, session) {
  // Используем слова из умного повторения
  const wordsToRepeat = session.smartRepeatWords || [];
  
  if (wordsToRepeat.length === 0) {
    // Отмечаем что умное повторение пройдено сегодня
    const todayString = new Date().toDateString();
    session.lastSmartRepeatDate = todayString;
    
    // Сохраняем изменения в базу данных
    if (session.profile) {
      await saveUserSession(ctx.from.id, session.profile, session);
    }
    
    session.step = 'word_tasks_menu';
    return ctx.reply('🧠 Умное повторение завершено!', {
      reply_markup: wordTasksMenu,
    });
  }
  
  // Во втором этапе ВСЕГДА показываем английские слова для перевода на русский
  session.wordsToRepeat = wordsToRepeat.map(w => {
    return { ...w, direction: 'en-ru' }; // ТОЛЬКО en-ru для этапа 2
  });
  session.currentIndex = 0;
  session.step = 'waiting_answer';
  session.repeatMode = 'smart';
  session.smartRepeatStage = 2;
  
  const first = session.wordsToRepeat[0];
  const question = `Как переводится слово: "${first.word}"?`;

  // Создаем клавиатуру с кнопкой "Пропустить"
  const skipKeyboard = new Keyboard()
    .text('⏭️ Пропустить слово')
    .row()
    .oneTime()
    .resized();

  await ctx.reply(
    `🧠 <b>Умное повторение - Этап 3/5</b>\n` +
    `🎯 <b>"Знаю/Не знаю"</b>\n\n${question}`,
    { 
      parse_mode: 'HTML',
      reply_markup: skipKeyboard
    }
  );
  
  // Отправляем аудио для слова (только если направление en-ru)
  if (first.direction === 'en-ru' && first.word) {
    try {
      await sendWordAudioFromDB(ctx, first.word, session.profile, { silent: true });
    } catch (error) {
      console.error('Error sending audio in smart repeat stage 2:', error);
      // Не прерываем выполнение, если аудио не отправилось
    }
  }
}

// Обработка ответов в этапе 2 умного повторения
async function handleSmartRepeatStage2Answer(ctx, session, answerText) {
  // Проверяем кнопку "Пропустить"
  if (answerText === '⏭️ Пропустить слово') {
    const wordObj = session.wordsToRepeat[session.currentIndex];
    await ctx.reply(`⏭️ Пропущено: <b>${wordObj.word}</b> — ${wordObj.translation}`, { parse_mode: 'HTML' });
    return await moveToNextStage2Word(ctx, session);
  }

  const wordObj = session.wordsToRepeat[session.currentIndex];
  // В этапе 2 всегда ожидаем русский перевод английского слова
  const expectedAnswer = wordObj.translation;
  
  // Отладочная информация
  console.log(`DEBUG Stage 2 Answer Check:
    Word: ${wordObj.word}
    Translation: ${wordObj.translation}
    Direction: en-ru (fixed)
    User Answer: ${answerText}
    Expected Answer: ${expectedAnswer}`);
  
  try {
    // Используем AI для проверки ответа (всегда en-ru в этапе 2)
    const isCorrect = await checkAnswerWithAI(answerText, expectedAnswer, 'en-ru');
    
    if (isCorrect) {
      await ctx.reply(`✅ <b>Правильно!</b>\n\n📝 <b>${wordObj.word}</b> — ${wordObj.translation}`, { parse_mode: 'HTML' });
      
      // Начисляем XP за правильный ответ
      const wordCorrectLevel = wordObj.correct || 0;
      const xpGained = await awardXP(session, wordCorrectLevel, ctx);
      
      // Сохраняем обновленный уровень и XP в базу данных
      await saveUserSession(session, ctx.from.id);
      
      await ctx.reply(`💫 +${xpGained} XP`);
      
      // Увеличиваем счетчик правильных ответов
      try {
        await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, wordObj.correct + 1);
      } catch (error) {
        console.error('Error updating word progress in stage 2:', error);
      }
    } else {
      await ctx.reply(`❌ <b>Неправильно!</b>\n\n📝 <b>${wordObj.word}</b> — <b>${wordObj.translation}</b>\n🎯 Вы ответили: ${answerText}`, { parse_mode: 'HTML' });
      
      // Мягко уменьшаем счетчик (не сбрасываем в 0)
      try {
        const newCorrect = Math.max(0, (wordObj.correct || 0) - 1);
        await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, newCorrect);
      } catch (error) {
        console.error('Error updating word progress in stage 2:', error);
      }
    }
    
    return await moveToNextStage2Word(ctx, session);
    
  } catch (error) {
    console.error('Error checking answer with AI:', error);
    await ctx.reply('❌ Ошибка проверки ответа. Попробуйте еще раз.');
  }
}

// Переход к следующему слову в этапе 2
async function moveToNextStage2Word(ctx, session) {
  session.currentIndex++;
  
  if (session.currentIndex < session.wordsToRepeat.length) {
    // Есть еще слова - показываем следующее
    const next = session.wordsToRepeat[session.currentIndex];
    // В этапе 2 всегда переводим с английского на русский
    const question = `Как переводится слово: "${next.word}"?`;
      
    const skipKeyboard = new Keyboard()
      .text('⏭️ Пропустить слово')
      .row()
      .oneTime()
      .resized();
      
    await ctx.reply(question, { reply_markup: skipKeyboard });
    
    // Отправляем аудио для слова
    if (next.word) {
      try {
        await sendWordAudioFromDB(ctx, next.word, session.profile, { silent: true });
      } catch (error) {
        console.error('Error sending audio in moveToNextStage2Word:', error);
        // Не прерываем выполнение, если аудио не отправилось
      }
    }
  } else {
    // Этап 2 завершен - переходим к этапу 3
    await startSmartRepeatStage3(ctx, session);
  }
}

// Функция проверки ответа с гибридной логикой
async function checkAnswerWithAI(userAnswer, correctAnswer, direction) {
  const normalizedUser = userAnswer.toLowerCase().trim();
  const normalizedCorrect = correctAnswer.toLowerCase().trim();
  
  console.log(`DEBUG: Checking answer - User: "${normalizedUser}", Correct: "${normalizedCorrect}"`);
  
  // 1. Точное совпадение
  if (normalizedUser === normalizedCorrect) {
    console.log('DEBUG: Exact match - TRUE');
    return true;
  }
  
  // 2. Подсчитываем количество различий (расстояние Левенштейна)
  const distance = calculateLevenshteinDistance(normalizedUser, normalizedCorrect);
  console.log(`DEBUG: Edit distance: ${distance}`);
  
  // 3. Если только 1 ошибка - автоматически засчитываем
  if (distance === 1) {
    console.log('DEBUG: 1 error - AUTO TRUE');
    return true;
  }
  
  // 4. Если 2+ ошибки - отправляем GPT для оценки
  if (distance >= 2) {
    console.log('DEBUG: 2+ errors - sending to GPT');
    try {
      const prompt = `Проверь правильность перевода слова с английского на русский.

Правильный перевод: "${correctAnswer}"
Ответ пользователя: "${userAnswer}"

Правила:
- Принимай синонимы (например: "включать" = "содержать", "охватывать")
- Принимай разные формы слов (падежи, времена)
- НЕ принимай совершенно другие по смыслу слова
- НЕ принимай английские слова вместо русского перевода

Примеры:
- "проводить" для "conduct" = true (точный перевод)
- "выполнять" для "conduct" = true (синоним)
- "engage" для "engage" = false (английское слово вместо перевода)
- "выполнять" для "включать" = false (разные значения)

Ответь только "true" или "false".`;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 10
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = response.data.choices[0].message.content.trim().toLowerCase();
      const isCorrect = result === 'true';
      console.log(`DEBUG: GPT result: ${result} -> ${isCorrect}`);
      return isCorrect;
      
    } catch (error) {
      console.error('GPT check failed:', error);
      // Fallback: если GPT не работает, используем строгую проверку
      return false;
    }
  }
  
  console.log('DEBUG: No match - FALSE');
  return false;
}

// Функция для точного подсчета расстояния Левенштейна (количества ошибок)
function calculateLevenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // замена
          matrix[i][j - 1] + 1,     // вставка
          matrix[i - 1][j] + 1      // удаление
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Функция расчета схожести строк (алгоритм Левенштейна)
function calculateSimilarity(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // замена
          matrix[i][j - 1] + 1,     // вставка
          matrix[i - 1][j] + 1      // удаление
        );
      }
    }
  }
  
  const distance = matrix[str2.length][str1.length];
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - (distance / maxLength);
}

// Функция генерации случайной ситуации для предложений
function getRandomSituation() {
  const situations = [
    // Места
    { context: "в ресторане", example: "как заказать блюдо или пообщаться с официантом" },
    { context: "в офисе", example: "как обсудить проект с коллегами или решить рабочую задачу" },
    { context: "в магазине", example: "как выбрать товар или спросить о цене" },
    { context: "в парке", example: "как описать природу или активности на свежем воздухе" },
    { context: "дома", example: "как организовать быт или провести время с семьей" },
    { context: "в аэропорту", example: "как пройти регистрацию или найти нужный терминал" },
    { context: "в больнице", example: "как описать симптомы или пообщаться с врачом" },
    { context: "в университете", example: "как обсудить учебу или пообщаться с преподавателем" },
    
    // Люди и социальные ситуации
    { context: "с другом", example: "как поделиться новостями или планами на выходные" },
    { context: "с боссом", example: "как обсудить карьерные вопросы или отчитаться о работе" },
    { context: "с незнакомцем", example: "как завязать разговор или попросить помощь" },
    { context: "с семьей", example: "как обсудить планы или поделиться впечатлениями" },
    { context: "на собеседовании", example: "как представить себя или ответить на вопросы HR" },
    { context: "на свидании", example: "как узнать человека лучше или поделиться интересами" },
    
    // Активности и ситуации
    { context: "во время путешествия", example: "как описать достопримечательности или спросить дорогу" },
    { context: "на тренировке", example: "как мотивировать себя или обсудить фитнес-цели" },
    { context: "в повседневной жизни", example: "как выразить мысли или описать ситуацию" },
    { context: "в разговоре", example: "как выразить идею или поделиться мнением" }
  ];
  
  return situations[Math.floor(Math.random() * situations.length)];
}

// Функция для получения подходящего контекста от AI
async function getAIContext(word, translation) {
  try {
    // Проверяем наличие обязательных параметров
    if (!word || !translation) {
      console.log('Missing word or translation for AI context');
      return getRandomSituation();
    }
    
    const prompt = `Для английского слова "${word}" (${translation}) подбери наиболее подходящий жизненный контекст для составления предложения. Верни ответ строго в формате JSON:
{
  "context": "краткое описание ситуации (например: в больнице, в офисе, с друзьями)",
  "description": "краткое описание темы или сферы применения слова, БЕЗ примеров предложений"
}

ВАЖНО: 
- НЕ давай готовые примеры предложений с этим словом
- Только указывай контекст и тематику
- Выбери контекст, где это слово действительно уместно и естественно звучит
- Описание должно помочь понять сферу применения, но не подсказывать готовое предложение`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 120
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // Проверяем валидность ответа от API
    if (!response.data || !response.data.choices || !response.data.choices[0] || 
        !response.data.choices[0].message || !response.data.choices[0].message.content) {
      console.log('Invalid AI response structure, using fallback');
      return getRandomSituation();
    }

    const aiResponse = response.data.choices[0].message.content.trim();
    
    // Пытаемся распарсить JSON ответ
    try {
      const contextData = JSON.parse(aiResponse);
      if (contextData && contextData.context && contextData.description && 
          typeof contextData.context === 'string' && typeof contextData.description === 'string') {
        return contextData;
      } else {
        console.log('AI response missing required fields, using fallback');
        return getRandomSituation();
      }
    } catch (parseError) {
      console.log('Failed to parse AI context response, using fallback');
      return getRandomSituation();
    }
  } catch (error) {
    console.log('Failed to get AI context, using fallback:', error.message);
    return getRandomSituation();
  }
  
  // Fallback: возвращаем случайную ситуацию вместо фиксированного контекста
  return getRandomSituation();
}

// Функция автоматической генерации предложений с AI
async function generateSentencesWithAI(words) {
  try {
    console.log('=== GENERATING SENTENCES WITH AI ===');
    console.log(`Words to generate sentences for:`, words.map(w => w.word));
    
    // Формируем промпт для генерации предложений С ОШИБКАМИ для обучения
    const wordsText = words.map(w => `"${w.word}" (${w.translation})`).join(', ');
    
    const prompt = `Составь одно предложение на английском языке для каждого из этих слов: ${wordsText}

ВАЖНО: В каждом предложении должна быть ОДНА типичная ошибка для изучающих английский язык:
- Грамматические ошибки (времена, артикли, предлоги, порядок слов)
- Лексические ошибки (неправильное использование слов)
- Ошибки согласования (единственное/множественное число)

ТРЕБОВАНИЯ:
- Каждое предложение должно содержать ТОЛЬКО ОДНО из указанных слов
- Предложения должны быть понятными, но с ОДНОЙ ошибкой
- Длина предложения: 5-12 слов
- Ошибки должны быть РАЗНЫМИ в каждом предложении

Примеры типов ошибок:
- "He go to school every day" (go вместо goes)
- "I have much friends" (much вместо many)
- "She is more taller than me" (more taller вместо taller)
- "I am going to home" (to home вместо home)

Верни ответ строго в формате JSON:
{
  "sentences": [
    {
      "word": "первое_слово",
      "sentence": "предложение с первым словом (с ошибкой)"
    },
    {
      "word": "второе_слово", 
      "sentence": "предложение со вторым словом (с ошибкой)"
    }
  ]
}`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 800
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    let answer = response.data.choices[0].message.content;
    const match = answer.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('AI не вернул JSON.');
    }

    const result = JSON.parse(match[0]);
    
    // Проверяем корректность структуры
    if (!result.sentences || !Array.isArray(result.sentences)) {
      throw new Error('Некорректная структура ответа AI');
    }

    // Проверяем, что все слова получили предложения
    const generatedWords = result.sentences.map(s => s.word);
    const missingWords = words.filter(w => !generatedWords.includes(w.word));
    
    // Добавляем fallback предложения с ошибками для пропущенных слов
    for (const missingWord of missingWords) {
      result.sentences.push({
        word: missingWord.word,
        sentence: `I need learn the word "${missingWord.word}" more better.` // специально с ошибками
      });
    }

    console.log(`Generated ${result.sentences.length} sentences with errors for ${words.length} words`);
    return result.sentences;

  } catch (error) {
    console.error('Error generating sentences with AI:', error);
    
    // Fallback: генерируем простые предложения с ошибками
    return words.map(word => ({
      word: word.word,
      sentence: `I should practice use the word "${word.word}" more often.` // намеренная ошибка: use вместо using
    }));
  }
}

// Функция получения следующей темы для письма по порядку
async function getNextWritingTopic(ctx, session) {
  try {
    // Получаем профиль пользователя
    const userId = ctx.from.id;
    const profileName = session.selectedProfile || 'Основной';
    
    const userProfile = await getOrCreateUserProfile(userId, profileName);
    
    // Получаем тему по текущему индексу
    const topic = WRITING_TOPICS[userProfile.writingTopicIndex];
    
    // Увеличиваем индекс для следующего раза (с циклическим возвратом к 0)
    const nextIndex = (userProfile.writingTopicIndex + 1) % WRITING_TOPICS.length;
    
    // Обновляем индекс в базе данных
    await prisma.userProfile.updateMany({
      where: {
        telegramId: userId.toString(),
        profileName: profileName
      },
      data: {
        writingTopicIndex: nextIndex
      }
    });
    
    console.log(`Writing topic selected: #${userProfile.writingTopicIndex + 1} - "${topic}"`);
    console.log(`Next topic index updated to: ${nextIndex}`);
    
    return topic;
  } catch (error) {
    console.error('Error in getNextWritingTopic:', error);
    // Возвращаем случайную тему в случае ошибки
    return WRITING_TOPICS[Math.floor(Math.random() * WRITING_TOPICS.length)];
  }
}

// Функция запуска нового этапа 2 умного повторения (письменное задание)
async function startSmartRepeatStageWriting(ctx, session) {
  try {
    console.log('=== SMART REPEAT STAGE 2 (WRITING) START ===');
    console.log('User ID:', ctx.from.id);
    
    // Получаем следующую тему по порядку
    const topic = await getNextWritingTopic(ctx, session);
    
    session.smartRepeatStage = 2;
    session.step = 'writing_task';
    session.writingTopic = topic;
    
    await ctx.reply(
      `🧠 <b>Умное повторение - Этап 2/5</b>\n` +
      `✍️ <b>Напиши текст</b>\n\n` +
      `📝 <b>Тема:</b> ${topic}\n\n` +
      `Напишите короткий текст из 5-9 предложений на эту тему. ` +
      `Постарайтесь писать естественно и не беспокойтесь об ошибках - ` +
      `я помогу вам их проанализировать и исправить! 📚`,
      { 
        parse_mode: 'HTML',
        reply_markup: new Keyboard()
          .text('⏭️ Пропустить этап')
          .row()
          .oneTime()
          .resized()
      }
    );
    
  } catch (error) {
    console.error('Error in startSmartRepeatStageWriting:', error);
    session.step = 'main_menu';
    await ctx.reply('❌ Произошла ошибка. Возвращаемся в главное меню.', { reply_markup: mainMenu });
  }
}

// Функция анализа письменного текста через OpenAI  
async function handleWritingAnalysis(ctx, session, userText) {
  try {
    console.log('=== WRITING ANALYSIS START ===');
    console.log('User text length:', userText.length);
    
    // Проверяем длину текста
    if (userText.length < 50) {
      await ctx.reply('📝 Текст слишком короткий. Напишите хотя бы 5-6 предложений, чтобы я мог провести качественный анализ.');
      return;
    }
    
    if (userText.length > 2000) {
      await ctx.reply('📝 Текст слишком длинный. Пожалуйста, напишите 5-9 предложений.');
      return;
    }
    
    // Проверяем API ключ
    if (!process.env.OPENAI_API_KEY) {
      console.error('ERROR: OPENAI_API_KEY not found');
      session.step = 'main_menu';
      await ctx.reply('❌ Ошибка конфигурации API. Обратитесь к администратору.', { reply_markup: mainMenu });
      return;
    }
    
    await ctx.reply('🔍 Анализирую ваш текст... Это займет несколько секунд.');
    
    // Системный промпт для анализа
const systemPrompt = `
YOU ARE: IELTS Writing Expert — STRUCTURED FEEDBACK BOT (NO UNDEFINED).

GOAL: Проанализировать короткий студенческий текст (5–9 предложений), найти ВСЕ ключевые грамматические ошибки и выдать компактный, понятный ответ. 
Ответ ДОЛЖЕН быть строго по шаблону ниже, без пропусков и без лишнего текста.

HARD RULES (ОЧЕНЬ ВАЖНО):
- Найди 4–7 ошибок. Если явных мало — возьми мелкие (артикли, -s в Present Simple, предлоги), но только из реальных фрагментов текста.
- Для каждой ошибки обязательно выдай 5 строк (❌, ✅, Правило, Ассоциация, Пример).
- Все объяснения на русском; примеры-предложения на английском.
- Минимализм: никаких эмодзи кроме разрешённых заголовков ниже, никакого Markdown кроме *курсива* в примерах НЕ использовать.
- Ничего не добавляй к шаблону и не меняй порядок блоков.
- ОБЯЗАТЕЛЬНО: Для каждой ошибки заполни ВСЕ поля ("from", "to", "rule", "association", "example"). 
- Если нет подходящего правила или ассоциации — ставь "N/A", но не оставляй пустым.
WHAT TO CHECK (ПРИОРИТЕТЫ):
1) Согласование подлежащего и сказуемого (I/you/we/they — без -s; he/she/it — с -s; един./мн. число).
2) Времена и формы (выбор времени, пропущенный "be", Continuous: am/is/are + V-ing).
3) Неправильные глаголы (taked→took, payed→paid, come→came, forget→forgot).
4) Инфинитивы/модальные (must + bare infinitive; let + bare infinitive).
5) Артикли (a/an/the/0) и конкретность.
6) Предлоги (arrive at / arrive in; in the pan).
7) Коллокации/естественность (have a barbecue, gain experience).
8) Комбо-ошибки: если в одном фрагменте 2 проблемы (напр. предлог+артикль) — объясни обе кратко в "Правило".

DO NOT:
- Не придумывай фразы, которых нет в тексте.
- Не меняй смысл.
- Не пропускай мелочи (артикли, предлоги, -s, am/is/are).
- Не выходи за пределы шаблона.

EDGE CASES:
- Если ошибок мало: всё равно 4. Бери реальные короткие фрагменты (минимальная цитата).
- Если одно правило нарушено много раз: выбери самый показательный пример и укажи в "Правило", что ошибка повторяется.

ALGORITHM:
1) Прочитай текст 2 раза.
2) Выпиши все фрагменты-ошибки (короткие цитаты), сгруппируй по типу.
3) Выбери 4–7 самых полезных для обучения (покрыть разные типы).
4) Для каждой ошибки заполни ВСЕ поля: ❌, ✅, Правило, Ассоциация, Пример.
5) Сформируй оценку, общий отзыв, пошаговый совет и глобальные шаги — строго по шаблону.

OUTPUT TEMPLATE (ВЕРНИ ТОЛЬКО JSON ОБЪЕКТ, БЕЗ ЛИШНЕГО ТЕКСТА):

{
  "band_estimate": "X.X",
  "summary": "2–3 коротких предложения о сильных и слабых сторонах",
  "global_advice": "2–3 конкретных шага, что прокачать первым делом",
  "errors": [
    {
      "title": "Название типа ошибки",
      "rule": "Конкретное правило (1–2 строки)", 
      "meme": "3–10 простых слов для запоминания",
      "examples": [
        { 
          "from": "точная цитата из текста", 
          "to": "исправленный вариант", 
          "why": "конкретное объяснение ошибки" 
        }
      ],
      "drills": [
        {
          "prompt": "Упражнение с пропуском",
          "expected": "правильный ответ",
          "accepted": ["правильный ответ", "альтернатива"],
          "explanation": "объяснение на русском"
        }
      ]
    }
  ]
}

ВАЖНО: Возвращай ТОЛЬКО этот JSON объект, никакого лишнего текста!
`;

    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `LANG=ru\nTEXT=\n${userText}` }
      ],
      temperature: 0.2,
      max_completion_tokens: 6000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    let analysisResponse = gptRes.data.choices[0].message.content.trim();
    
    // Пытаемся извлечь JSON
    const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', analysisResponse);
      throw new Error('AI не вернул валидный JSON');
    }
    
    const analysisData = JSON.parse(jsonMatch[0]);
    
    // Проверяем обязательные поля
    if (!analysisData.band_estimate || !analysisData.summary || !analysisData.global_advice || !Array.isArray(analysisData.errors)) {
      throw new Error('Неполные данные анализа');
    }
    
    // Сохраняем анализ в сессии
    session.writingAnalysis = analysisData;
    session.step = 'writing_analysis_result';
    
    // Показываем результат анализа
    await showWritingAnalysisResult(ctx, session);
    
  } catch (error) {
    console.error('Error in handleWritingAnalysis:', error);
    
    let errorMsg = 'Произошла ошибка при анализе текста. ';
    
    if (error.response && error.response.data && error.response.data.error) {
      const apiError = error.response.data.error;
      console.error('OpenAI API Error:', apiError);
      
      if (apiError.code === 'insufficient_quota') {
        errorMsg = 'Лимит API исчерпан. Обратитесь к администратору.';
      } else if (apiError.code === 'rate_limit_exceeded') {
        errorMsg = 'Слишком много запросов. Попробуйте через минуту.';
      }
    }
    
    session.step = 'main_menu';
    await ctx.reply(`❌ ${errorMsg}`, { reply_markup: mainMenu });
  }
}

// Функция отображения результатов анализа письма
async function showWritingAnalysisResult(ctx, session) {
  const analysis = session.writingAnalysis;
  
  let message = `📊 <b>Анализ вашего текста:</b>\n\n`;
  message += `🎯 <b>Оценка:</b> ${analysis.band_estimate}/9 (IELTS Writing)\n\n`;
  message += `📝 <b>Общий отзыв:</b>\n${analysis.summary}\n\n`;
  message += `💡 <b>Рекомендации:</b>\n${analysis.global_advice}`;
  
  if (analysis.errors && analysis.errors.length > 0) {
    message += `\n\n🔍 <b>Найдено ошибок:</b> ${analysis.errors.length}`;
    
    analysis.errors.forEach((error, index) => {
      message += `\n\n<b>${index + 1}. ${error.title}</b>`;
      message += `\n💡 ${error.rule}`;
      message += `\n🧠 <i>${error.meme}</i>`;
      
      if (error.examples && error.examples.length > 0) {
        error.examples.forEach(example => {
          message += `\n❌ "${example.from}" → ✅ "${example.to}"`;
        });
      }
    });
    
    await ctx.reply(message, { 
      parse_mode: 'HTML',
      reply_markup: new Keyboard()
        .text('📝 Выполнить упражнения')
        .row()
        .text('➡️ Продолжить к следующему этапу')
        .row()
        .oneTime()
        .resized()
    });
  } else {
    message += `\n\n✅ <b>Отличная работа!</b> Серьезных ошибок не найдено.`;
    
    await ctx.reply(message, { 
      parse_mode: 'HTML',
      reply_markup: new Keyboard()
        .text('➡️ Продолжить к следующему этапу')
        .row()
        .oneTime()
        .resized()
    });
  }
}

// Функция запуска мини-упражнений по письму
async function startWritingDrills(ctx, session) {
  const analysis = session.writingAnalysis;
  
  if (!analysis || !analysis.errors || analysis.errors.length === 0) {
    await ctx.reply('❌ Нет упражнений для выполнения.');
    return;
  }
  
  // Собираем все упражнения из всех ошибок
  const allDrills = [];
  analysis.errors.forEach((error, errorIndex) => {
    if (error.drills && error.drills.length > 0) {
      error.drills.forEach((drill, drillIndex) => {
        allDrills.push({
          errorTitle: error.title,
          errorRule: error.rule,
          drill: drill,
          errorIndex: errorIndex,
          drillIndex: drillIndex
        });
      });
    }
  });
  
  if (allDrills.length === 0) {
    await ctx.reply('❌ Нет доступных упражнений.');
    return;
  }
  
  // Инициализируем упражнения в сессии
  session.writingDrills = allDrills;
  session.currentDrillIndex = 0;
  session.drillResults = [];
  session.step = 'writing_drill';
  
  await showCurrentWritingDrill(ctx, session);
}

// Функция отображения текущего упражнения
async function showCurrentWritingDrill(ctx, session) {
  const drills = session.writingDrills;
  const currentIndex = session.currentDrillIndex;
  
  if (currentIndex >= drills.length) {
    // Все упражнения завершены
    await showWritingDrillsCompletion(ctx, session);
    return;
  }
  
  const currentDrill = drills[currentIndex];
  const drill = currentDrill.drill;
  
  let message = `📝 <b>Упражнение ${currentIndex + 1}/${drills.length}</b>\n\n`;
  message += `🎯 <b>Тема:</b> ${currentDrill.errorTitle}\n`;
  message += `💡 <b>Правило:</b> ${currentDrill.errorRule}\n\n`;
  message += `❓ <b>Заполните пропуск:</b>\n<code>${drill.prompt}</code>\n\n`;
  message += `Введите ответ (одно слово или короткую фразу):`;
  
  await ctx.reply(message, { 
    parse_mode: 'HTML',
    reply_markup: new Keyboard()
      .text('🔄 Показать подсказку')
      .row()
      .text('⏭️ Пропустить упражнение')
      .row()
      .oneTime()
      .resized()
  });
}

// Функция обработки ответа на упражнение
async function handleWritingDrillAnswer(ctx, session, userAnswer) {
  const drills = session.writingDrills;
  const currentIndex = session.currentDrillIndex;
  const currentDrill = drills[currentIndex];
  const drill = currentDrill.drill;
  
  if (userAnswer === '🔄 Показать подсказку') {
    let hintMessage = `💡 <b>Подсказка:</b>\n${drill.explanation}\n\n`;
    hintMessage += `❓ <b>Заполните пропуск:</b>\n<code>${drill.prompt}</code>`;
    
    await ctx.reply(hintMessage, { 
      parse_mode: 'HTML',
      reply_markup: new Keyboard()
        .text('⏭️ Пропустить упражнение')
        .row()
        .oneTime()
        .resized()
    });
    return;
  }
  
  if (userAnswer === '⏭️ Пропустить упражнение') {
    // Записываем результат как пропущенный
    session.drillResults.push({
      drillIndex: currentIndex,
      userAnswer: null,
      correct: false,
      skipped: true,
      explanation: drill.explanation
    });
    
    session.currentDrillIndex++;
    await showCurrentWritingDrill(ctx, session);
    return;
  }
  
  // Проверяем ответ
  const normalizedAnswer = userAnswer.trim().toLowerCase();
  const expectedAnswer = drill.expected.toLowerCase();
  const acceptedAnswers = drill.accepted.map(ans => ans.toLowerCase());
  
  const isCorrect = normalizedAnswer === expectedAnswer || acceptedAnswers.includes(normalizedAnswer);
  
  // Записываем результат
  session.drillResults.push({
    drillIndex: currentIndex,
    userAnswer: userAnswer,
    correct: isCorrect,
    skipped: false,
    explanation: drill.explanation,
    expectedAnswer: drill.expected
  });
  
  // Показываем результат
  let resultMessage;
  if (isCorrect) {
    resultMessage = `✅ <b>Правильно!</b>\n\n`;
    resultMessage += `💡 ${drill.explanation}`;
  } else {
    resultMessage = `❌ <b>Неверно</b>\n\n`;
    resultMessage += `✅ <b>Правильный ответ:</b> ${drill.expected}\n`;
    resultMessage += `📝 <b>Ваш ответ:</b> ${userAnswer}\n\n`;
    resultMessage += `💡 ${drill.explanation}`;
  }
  
  await ctx.reply(resultMessage, { 
    parse_mode: 'HTML',
    reply_markup: new Keyboard()
      .text('➡️ Следующее упражнение')
      .row()
      .oneTime()
      .resized()
  });
  
  session.currentDrillIndex++;
  
  // Через небольшую паузу показываем следующее упражнение
  setTimeout(async () => {
    await showCurrentWritingDrill(ctx, session);
  }, 1500);
}

// Функция завершения упражнений
async function showWritingDrillsCompletion(ctx, session) {
  const results = session.drillResults;
  const totalDrills = results.length;
  const correctAnswers = results.filter(r => r.correct).length;
  const skippedAnswers = results.filter(r => r.skipped).length;
  
  let message = `🎉 <b>Упражнения завершены!</b>\n\n`;
  message += `📊 <b>Результаты:</b>\n`;
  message += `✅ Правильных ответов: ${correctAnswers}/${totalDrills}\n`;
  message += `⏭️ Пропущено: ${skippedAnswers}\n`;
  
  if (correctAnswers === totalDrills) {
    message += `\n🏆 Отлично! Все ответы верные!`;
  } else if (correctAnswers >= totalDrills * 0.7) {
    message += `\n👏 Хорошая работа! Большинство ответов правильные.`;
  } else {
    message += `\n💪 Продолжайте практиковаться! Обратите внимание на разобранные правила.`;
  }
  
  // Очищаем данные упражнений
  delete session.writingDrills;
  delete session.currentDrillIndex;
  delete session.drillResults;
  delete session.writingAnalysis;
  
  // Переходим к следующему этапу
  session.smartRepeatStage = 3;
  
  await ctx.reply(message, { 
    parse_mode: 'HTML',
    reply_markup: new Keyboard()
      .text('➡️ Продолжить к следующему этапу')
      .row()
      .oneTime()
      .resized()
  });
  
  setTimeout(async () => {
    await ctx.reply('🧠 <b>Умное повторение - Этап 3/5</b>\n<b>Знаю/Не знаю</b>\n\nПереходим к быстрой оценке слов...');
    await startSmartRepeatStage2(ctx, session); // Это старая функция "Знаю/Не знаю", которая стала этапом 3
  }, 2000);
}

// Функция запуска этапа 3 умного повторения (предложения)
async function startSmartRepeatStage3(ctx, session) {
  // Собираем слова из предыдущих этапов
  const quizWords = session.currentQuizSession ? session.currentQuizSession.words : [];
  const wordsToRepeat = session.wordsToRepeat || [];
  
  // Объединяем все слова и убираем дубликаты
  const allWordsFromStages = [...quizWords, ...wordsToRepeat];
  const uniqueWords = allWordsFromStages.filter((word, index, self) => 
    index === self.findIndex(w => w.id === word.id)
  );
  
  // Берем слова с низким рейтингом для предложений
  const wordsForSentences = uniqueWords.filter(w => w.correct <= 2).slice(0, 7);
  
  if (wordsForSentences.length > 0) {
    session.sentenceTaskWords = wordsForSentences;
    session.sentenceTaskIndex = 0;
    session.smartRepeatStage = 3;
    
    // Сразу запускаем ручной ввод предложений
    await startManualSentenceInput(ctx, session);
  } else {
    // Нет слов для предложений - используем слова из smartRepeatWords
    const fallbackWords = session.smartRepeatWords || [];
    if (fallbackWords.length > 0) {
      const wordsForSentences = fallbackWords.slice(0, 7);
      
      session.sentenceTaskWords = wordsForSentences;
      session.sentenceTaskIndex = 0;
      session.smartRepeatStage = 3;
      
      // Сразу запускаем ручной ввод предложений
      await startManualSentenceInput(ctx, session);
    } else {
      // Совсем нет слов - переходим к этапу 4
      await startSmartRepeatStage4(ctx, session);
    }
  }
}

// Функция автоматической генерации и анализа предложений
async function autoGenerateAndAnalyzeSentences(ctx, session) {
  try {
    const wordsForSentences = session.sentenceTaskWords || [];
    
    if (wordsForSentences.length === 0) {
      await ctx.reply('❌ Нет слов для генерации предложений.');
      await startSmartRepeatStage4(ctx, session);
      return;
    }

    await ctx.reply('🤖 Генерирую предложения автоматически...');

    // Генерируем предложения с помощью AI
    const generatedSentences = await generateSentencesWithAI(wordsForSentences);
    
    // Сохраняем сгенерированные предложения в формате, ожидаемом анализатором
    session.sentenceTaskAnswers = generatedSentences.map(item => {
      const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        id: uniqueId,
        word: item.word,
        sentence: item.sentence
      };
    });

    // Показываем сгенерированные предложения пользователю
    let message = '🤖 <b>Сгенерированные предложения с ошибками для обучения:</b>\n\n';
    message += '💡 <i>Каждое предложение содержит типичную ошибку изучающих английский язык</i>\n\n';
    for (let i = 0; i < generatedSentences.length; i++) {
      const item = generatedSentences[i];
      const wordData = wordsForSentences.find(w => w.word === item.word);
      const translation = wordData ? wordData.translation : '';
      message += `${i + 1}. <b>${item.word}</b> (${translation})\n`;
      message += `   "${item.sentence}"\n\n`;
    }
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    await ctx.reply('📝 Начинаю детальный анализ предложений...');

    // Запускаем анализ предложений
    await analyzeSentencesWithAI(ctx, session);

  } catch (error) {
    console.error('Error in auto generate and analyze sentences:', error);
    await ctx.reply('❌ Ошибка при автоматической генерации предложений. Переходим к следующему этапу.');
    await startSmartRepeatStage4(ctx, session);
  }
}

// Функция запуска ручного ввода предложений
async function startManualSentenceInput(ctx, session) {
  const wordsForSentences = session.sentenceTaskWords || [];
  
  if (wordsForSentences.length === 0) {
    await startSmartRepeatStage4(ctx, session);
    return;
  }

  // Получаем подходящий контекст от AI для первого слова
  const firstWord = wordsForSentences[0];
  await ctx.reply('🤔 Подбираю подходящий контекст для первого слова...');
  const situation = await getAIContext(firstWord.word, firstWord.translation);
  firstWord.context = situation.context;
  
  session.sentenceTaskIndex = 0;
  session.step = 'sentence_task';
  session.sentenceTaskAnswers = [];
  
  await ctx.reply(
    `✍️ <b>Ручной ввод предложений</b>\n\n` +
    `Напиши предложения с словами (${wordsForSentences.length}): по одному предложению на слово. Пиши по одному предложению на английском.`,
    { parse_mode: 'HTML' }
  );
  
  await ctx.reply(
    `Напиши предложение со словом <b>"${firstWord.word}"</b> (${firstWord.translation}) в контексте: <b>${situation.context}</b>\n\n${situation.description ? `💡 ${situation.description}` : ''}`,
    { parse_mode: 'HTML' }
  );
}
async function analyzeSentencesWithAI(ctx, session) {

  const answers = session.sentenceTaskAnswers || [];
  if (answers.length === 0) {
    await ctx.reply('Нет предложений для анализа.');
    return;
  }

  console.log(`=== STARTING SENTENCE ANALYSIS ===`);
  console.log(`Total sentences to analyze: ${answers.length}`);
  console.log(`Sentences:`, answers.map((item, index) => `${index + 1}. ${item.word}: "${item.sentence}"`));

  await ctx.reply('📝 Анализирую ваши предложения... Это займет немного времени, но результат будет стоящим!');

  // --- Автоматическое разбиение на части ---
  const CHUNK_SIZE = 3;
  let allAnalysis = [];
  for (let chunkStart = 0; chunkStart < answers.length; chunkStart += CHUNK_SIZE) {
    const chunk = answers.slice(chunkStart, chunkStart + CHUNK_SIZE);
    console.log(`Processing chunk ${Math.floor(chunkStart / CHUNK_SIZE) + 1}: sentences ${chunkStart + 1}-${chunkStart + chunk.length}`);
    console.log(`Chunk words:`, chunk.map(item => item.word));
    
    const sentencesText = chunk.map((item, index) =>
      `${chunkStart + index + 1}. ID: "${item.id}"\n   Слово: "${item.word}" (${item.translation})\n   Предложение: "${item.sentence}"`
    ).join('\n\n');

    const prompt = `${sentencesText}

ЗАДАЧИ АНАЛИЗА:
1. Грамматическая экспертиза: Найди ТОЛЬКО реально существующие ошибки в предложении
2. Лексическая точность: Проверь естественность использования слов и контекст
3. Тест носителя языка: Сказал бы носитель языка именно так?

КРИТЕРИИ ОЦЕНКИ:
- correct: true - если предложение корректное грамматически И звучит естественно
- correct: false - ТОЛЬКО если есть реальные ошибки в исходном предложении

СТРОГИЕ ПРАВИЛА АНАЛИЗА:
- ПРОВЕРЯЙ ПОСИМВОЛЬНО: Если артикль, форма слова, местоимение или порядок слов УЖЕ ВЕРНЫЕ — НЕ предлагай их как ошибку
- НЕ ВЫДУМЫВАЙ ОШИБКИ: Анализируй только то, что реально написано студентом
- ОРФОГРАФИЧЕСКИЕ ОШИБКИ: Если слово написано неправильно ("fovour" вместо "favour") — отмечай как опечатку
- НЕ придирайся к мелочам, если предложение в целом правильное
- Заглавные буквы в середине предложения - НЕ ошибка для обычных слов

ДЛЯ КАЖДОГО предложения С РЕАЛЬНЫМИ ОШИБКАМИ:
- Подробный разбор ТОЛЬКО тех ошибок, которые действительно есть в предложении
- Исправленную версию с объяснением изменений
- ХИТРЫЙ ТРЮК-СОВЕТ для запоминания правила
- Краткое объяснение правила
- 2 практических примера С АНАЛИЗИРУЕМЫМ СЛОВОМ (не универсальные примеры!)

ДЛЯ КАЖДОГО ПРАВИЛЬНОГО предложения:
- Объяснение why_correct: почему предложение считается верным
- 2 примера practice_examples С ТЕМ ЖЕ АНАЛИЗИРУЕМЫМ СЛОВОМ в правильном контексте

ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ К ПРИМЕРАМ:
- ВСЕ practice_examples ДОЛЖНЫ содержать анализируемое слово в правильной форме
- НЕ используй универсальные примеры типа "She has helped me", если анализируемое слово другое
- Примеры должны показывать корректное употребление ИМЕННО того слова, которое анализируется

ВАЖНО:
- Ответ должен содержать ТОЛЬКО JSON и ничего больше
- ОБЯЗАТЕЛЬНО возвращай поле "id" - точно такой же ID из исходного задания
- Поле "word" должно точно соответствовать целевому слову из предложения студента

ПРИМЕР ПРАВИЛЬНОГО АНАЛИЗА (Ориентируйся на него):
{
  "detailed_analysis": [
    {
      "id": "1690876543210_abc123def",
      "word": "poverty",
      "sentence": "The charity event raised funds to fight poverty.",
      "correct": true,
      "why_correct": "Ты использовал артикль 'the' перед существительным, что звучит естественно. Фраза 'fight poverty' — это именно то, как говорят носители языка.",
      "practice_examples": [
        "Many people live in poverty in developing countries.",
        "The government is working to reduce poverty levels."
      ]
    },
    {
      "id": "1690876543211_xyz789ghi", 
      "word": "favour",
      "sentence": "Can you do me a fovour please?",
      "correct": false,
      "error_analysis": "Орфографическая ошибка: 'fovour' написано неправильно. Правильное написание: 'favour'.",
      "corrected_version": "Can you do me a favour please?",
      "clever_trick": "Запомни: FAVOUR пишется через 'a' после 'f'. Представь: 'F-A-V-O-U-R' — как и в слове 'flavour'.",
      "rule_explanation": "Британское написание слова 'favour' включает букву 'u' после 'o'.",
      "practice_examples": [
        "I need to ask you a favour regarding this project.",
        "She returned the favour by helping him with his homework."
      ]
    },
    {
      "id": "1690876543212_def456ghi",
      "word": "distribute", 
      "sentence": "He is already distribute us some tasks.",
      "correct": false,
      "error_analysis": "Ошибка в форме глагола 'distribute'. После 'already' нужно past participle 'distributed', а также требуется предлог 'to' перед объектом.",
      "corrected_version": "He has already distributed some tasks to us.",
      "clever_trick": "Already = действие завершено = have/has + 3-я форма глагола. Плюс: distribute TO someone (не просто distribute someone).",
      "rule_explanation": "Present perfect (have/has + past participle) используется для завершённых действий. Глагол 'distribute' требует предлога 'to' перед получателем.",
      "practice_examples": [
        "The teacher will distribute the worksheets to all students.",
        "They distribute food packages to families in need."
      ]
    }
  ]
}

БУДЬ ТОЧНЫМ И СПРАВЕДЛИВЫМ! Правильные предложения должны получать correct: true. ВСЕ ОБЪЯСНЕНИЯ НА РУССКОМ ЯЗЫКЕ!`;

    try {
      const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 3500
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      let answer = gptRes.data.choices[0].message.content;
      const match = answer.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error('AI не вернул JSON.');
      }
      let analysis;
      try {
        analysis = JSON.parse(match[0]);
        console.log(`Successfully parsed analysis for chunk, got ${analysis.detailed_analysis?.length || 0} evaluations`);
      } catch (parseError) {
        console.error('JSON parsing failed for detailed sentence analysis:', parseError);
        console.error('Raw AI response:', answer);
        // Создаем fallback анализ с упрощённой структурой
        analysis = {
          detailed_analysis: chunk.map(item => ({
            id: item.id,
            word: item.word,
            sentence: item.sentence,
            correct: false,
            error_analysis: "Не удалось проанализировать предложение. Попробуйте еще раз.",
            corrected_version: "Анализ временно недоступен",
            clever_trick: "💡 Попробуйте перефразировать предложение более простыми словами",
            rule_explanation: "Анализ будет доступен при повторной отправке",
            practice_examples: [
              `Try using the word "${item.word}" in a simple sentence.`,
              `Practice with "${item.word}" in everyday conversation.`
            ]
          }))
        };
      }
      // Проверяем корректность новой структуры ответа
      if (!analysis.detailed_analysis || !Array.isArray(analysis.detailed_analysis)) {
        console.error('Invalid analysis structure - no detailed_analysis array');
        throw new Error('AI вернул некорректную структуру детального анализа');
      }
      
      // Валидируем наличие ID в каждом элементе анализа
      for (const item of analysis.detailed_analysis) {
        if (!item.id) {
          console.error('Missing ID in analysis item:', item);
          // Добавляем fallback ID если его нет
          item.id = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      }
      
      // Убеждаемся, что количество оценок соответствует количеству предложений
      if (analysis.detailed_analysis.length !== chunk.length) {
        console.error(`Mismatch: expected ${chunk.length} detailed evaluations, got ${analysis.detailed_analysis.length}`);
        console.error(`Chunk words:`, chunk.map(item => item.word));
        console.error(`Analysis words:`, analysis.detailed_analysis.map(item => item.word));
        
        // Дополняем недостающие оценки
        while (analysis.detailed_analysis.length < chunk.length) {
          const missingIndex = analysis.detailed_analysis.length;
          console.log(`Adding fallback analysis for missing sentence ${chunkStart + missingIndex + 1}: word="${chunk[missingIndex].word}"`);
          analysis.detailed_analysis.push({
            id: chunk[missingIndex].id,
            word: chunk[missingIndex].word,
            sentence: chunk[missingIndex].sentence,
            correct: false,
            error_analysis: "Анализ не был получен для этого предложения.",
            corrected_version: "Попробуйте еще раз",
            clever_trick: "💡 Используйте более простые конструкции",
            rule_explanation: "Анализ будет доступен при повторной отправке",
            practice_examples: [
              `Try using the word "${chunk[missingIndex].word}" in a simple sentence.`,
              `Practice with "${chunk[missingIndex].word}" in everyday conversation.`
            ]
          });
        }
      }
      // GPT теперь сам возвращает ID в detailed_analysis
      allAnalysis = allAnalysis.concat(analysis.detailed_analysis);
    } catch (error) {
      console.error('Error in AI sentence analysis:', error);
      // fallback для всего чанка с добавлением ID
      const fallbackAnalysis = chunk.map(item => ({
        id: item.id,
        word: item.word,
        sentence: item.sentence,
        correct: false,
        error_analysis: "Не удалось проанализировать предложение. Попробуйте еще раз.",
        corrected_version: "Анализ временно недоступен",
        clever_trick: "💡 Попробуйте перефразировать предложение более простыми словами",
        rule_explanation: "Анализ будет доступен при повторной отправке",
        practice_examples: [
          `Try using the word "${item.word}" in a simple sentence.`,
          `Practice with "${item.word}" in everyday conversation.`
        ]
      }));
      allAnalysis = allAnalysis.concat(fallbackAnalysis);
    }
  }

  // Дедупликация: удаляем дублирующиеся анализы по ID
  const uniqueAnalysis = [];
  const seenIds = new Set();
  
  for (const analysis of allAnalysis) {
    if (!seenIds.has(analysis.id)) {
      seenIds.add(analysis.id);
      uniqueAnalysis.push(analysis);
    } else {
      console.log(`Removing duplicate analysis for ID: ${analysis.id}, word: ${analysis.word}`);
    }
  }

  console.log(`Total analysis before dedup: ${allAnalysis.length}, after dedup: ${uniqueAnalysis.length}`);
  
  // Проверяем, что все исходные предложения получили анализ
  const missingAnalysis = [];
  for (const originalAnswer of answers) {
    const hasAnalysis = uniqueAnalysis.some(analysis => analysis.id === originalAnswer.id);
    if (!hasAnalysis) {
      missingAnalysis.push(originalAnswer);
    }
  }
  
  if (missingAnalysis.length > 0) {
    console.error(`Missing analysis for ${missingAnalysis.length} sentences:`, missingAnalysis.map(item => item.word));
    // Добавляем fallback для пропущенных предложений
    for (const missingItem of missingAnalysis) {
      uniqueAnalysis.push({
        id: missingItem.id,
        word: missingItem.word,
        sentence: missingItem.sentence,
        correct: false,
        error_analysis: "Анализ не был получен для этого предложения.",
        corrected_version: "Попробуйте еще раз",
        clever_trick: "💡 Используйте более простые конструкции",
        rule_explanation: "Анализ будет доступен при повторной отправке",
        practice_examples: [
          `Try using the word "${missingItem.word}" in a simple sentence.`,
          `Practice with "${missingItem.word}" in everyday conversation.`
        ]
      });
    }
    console.log(`Added ${missingAnalysis.length} fallback analyses. Final count: ${uniqueAnalysis.length}`);
  }

  // Обновляем прогресс слов в базе данных
  await updateWordProgressFromDetailedAnalysis(session, uniqueAnalysis);
  // Отправляем детальный фидбек пользователю
  await sendDetailedFeedback(ctx, session, { detailed_analysis: uniqueAnalysis });
  // Переходим к следующему этапу
  await proceedAfterSentenceAnalysis(ctx, session);
}

// Обновляем прогресс слов на основе AI оценок
async function updateWordProgressFromDetailedAnalysis(session, detailedAnalysis) {
  try {
    const allWords = await getWords(session.profile);
    
    for (const analysis of detailedAnalysis) {
      const wordIdx = allWords.findIndex(w => 
        w.word === analysis.word && 
        session.sentenceTaskAnswers.find(a => a.id === analysis.id)
      );
      
      if (wordIdx !== -1) {
        const currentCorrect = allWords[wordIdx].correct || 0;
        const word = allWords[wordIdx];
        
        if (analysis.correct === true) {
          // Правильное использование - увеличиваем счетчик
          await updateWordCorrect(session.profile, word.word, word.translation, currentCorrect + 1);
        } else {
          // Неправильное использование - мягко уменьшаем счетчик
          const newCorrect = Math.max(0, currentCorrect - 1);
          await updateWordCorrect(session.profile, word.word, word.translation, newCorrect);
        }
      }
    }
  } catch (error) {
    console.error('Error updating word progress from detailed analysis:', error);
  }
}

// Отправляем детальный фидбек с русскими объяснениями и трюками запоминания
async function sendDetailedFeedback(ctx, session, analysis) {
  try {
    // 1. Заголовок
    await ctx.reply('🎓 <b>Детальный анализ ваших предложений</b>', { parse_mode: 'HTML' });
    
    // 2. Разбор каждого предложения с подробными русскими объяснениями
    console.log('=== SENDING DETAILED RUSSIAN FEEDBACK ===');
    console.log(`Analysis detailed_analysis count: ${analysis.detailed_analysis.length}`);
    console.log(`Session answers count: ${session.sentenceTaskAnswers.length}`);
    
    for (let i = 0; i < analysis.detailed_analysis.length; i++) {
      const evaluation = analysis.detailed_analysis[i];
      
      console.log(`Processing detailed analysis ${i + 1}: word="${evaluation.word}"`);
      
      // Находим предложение по ID из анализа
      const userAnswer = session.sentenceTaskAnswers.find(answer => answer.id === evaluation.id);
      
      if (!userAnswer) {
        console.error(`Не найдено предложение для ID: ${evaluation.id}, слово: ${evaluation.word}`);
        console.error('Available IDs:', session.sentenceTaskAnswers.map(a => a.id));
        
        // Создаем fallback сообщение
        const fallbackMessage = `❓ <b>${i + 1}. "${evaluation.word}"</b> - ОШИБКА АНАЛИЗА\n` +
                               `📝 <b>Анализ ошибки:</b> Не удалось найти ваше предложение для этого слова.`;
        await ctx.reply(fallbackMessage, { parse_mode: 'HTML' });
        continue;
      }
      
      const status = evaluation.correct ? '✅' : '❌';
      const statusText = evaluation.correct ? 'ПРАВИЛЬНО' : 'ТРЕБУЕТ ИСПРАВЛЕНИЯ';
      
      // Создаем подробное сообщение с новой структурой
      let message = `${status} <b>${i + 1}. Слово: "${evaluation.word}"</b> - ${statusText}\n\n` +
                   `💬 <i>Ваше предложение:</i>\n"${userAnswer.sentence}"\n\n`;
      
      if (evaluation.correct) {
        // Для правильных предложений показываем похвалу
        if (evaluation.why_correct) {
          message += `🎉 <b>Почему это правильно:</b>\n${evaluation.why_correct}\n\n`;
        } else {
          message += `🎉 <b>Отлично!</b> Ваше предложение грамматически правильное и звучит естественно.\n\n`;
        }
        
        // Добавляем примеры для правильных предложений тоже
        if (evaluation.practice_examples && evaluation.practice_examples.length > 0) {
          message += `💡 <b>Примеры с "${evaluation.word}":</b>\n`;
          evaluation.practice_examples.forEach((example, idx) => {
            message += `${idx + 1}. ${example}\n`;
          });
        }
      } else {
        // Для неправильных предложений показываем анализ ошибки
        if (evaluation.error_analysis) {
          message += `📝 <b>Анализ ошибки:</b>\n${evaluation.error_analysis}\n\n`;
        }
        
        // Добавляем исправленную версию (если есть)
        if (evaluation.corrected_version && evaluation.corrected_version !== userAnswer.sentence) {
          message += `✨ <b>Исправленная версия:</b>\n"${evaluation.corrected_version}"\n\n`;
        }
        
        // Добавляем хитрый совет-трюк
        if (evaluation.clever_trick) {
          message += `🧠 <b>Хитрый совет-трюк:</b>\n${evaluation.clever_trick}\n\n`;
        }
        
        // Добавляем объяснение правила
        if (evaluation.rule_explanation) {
          message += `📚 <b>Правило:</b>\n${evaluation.rule_explanation}\n\n`;
        }
        
        // Добавляем примеры для практики
        if (evaluation.practice_examples && evaluation.practice_examples.length > 0) {
          message += `💡 <b>Примеры для практики:</b>\n`;
          evaluation.practice_examples.forEach((example, idx) => {
            message += `${idx + 1}. ${example}\n`;
          });
        }
      }
      
      console.log(`Sending detailed message for word "${evaluation.word}": ${status}`);
      await ctx.reply(message, { parse_mode: 'HTML' });
      
      // Небольшая пауза между сообщениями для лучшего восприятия
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 3. Статистика
    const correctCount = analysis.detailed_analysis.filter(e => e.correct).length;
    const totalCount = analysis.detailed_analysis.length;
    const percentage = Math.round((correctCount / totalCount) * 100);
    
    await ctx.reply(
      `📊 <b>Статистика:</b>\n` +
      `✅ Правильно: ${correctCount}/${totalCount} (${percentage}%)\n` +
      `❌ Требует работы: ${totalCount - correctCount}/${totalCount}`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    console.error('Error sending detailed feedback:', error);
    await ctx.reply('✅ Анализ завершен! Продолжаем изучение.');
  }
}

// Переход к следующему этапу после анализа предложений
async function proceedAfterSentenceAnalysis(ctx, session) {
  // Очищаем данные предложений
  delete session.sentenceTaskWords;
  delete session.sentenceTaskIndex;
  delete session.sentenceTaskAnswers;
  
  if (session.smartRepeatStage === 4) {
    // Этап 4 умного повторения завершен - переходим к этапу 5
    await startSmartRepeatStage5(ctx, session);
  } else {
    // Обычное задание предложений - запускаем story_task
    const storyWords = (session.lastWordsToRepeat || session.wordsToRepeat || []).map(w => w.word);
    if (storyWords.length > 0) {
      session.storyTaskWords = storyWords;
      session.step = 'story_task';
      await ctx.reply('📖 Отлично! Теперь переходим к заданию на понимание текста. Генерирую текст...');
      await generateStoryTaskContent(session, ctx);
    } else {
      session.step = 'main_menu';
      await ctx.reply('🎉 Задание завершено! Отличная работа!', { reply_markup: mainMenu });
    }
  }
}

// Функция запуска этапа 4 умного повторения (текстовое задание)
async function startSmartRepeatStage5(ctx, session) {
  try {
    console.log('=== SMART REPEAT STAGE 5 START ===');
    console.log('User ID:', ctx.from.id);
    console.log('Session smartRepeatWords:', session.smartRepeatWords?.length || 0);
    
    const words = session.smartRepeatWords || [];
    
    if (words.length === 0) {
      console.log('ERROR: No words found for smart repeat stage 4');
      await finishSmartRepeat(ctx, session);
      return;
    }

    // Проверяем API ключ
    if (!process.env.OPENAI_API_KEY) {
      console.error('ERROR: OPENAI_API_KEY not found');
      session.step = 'main_menu';
      await ctx.reply('❌ Ошибка конфигурации API. Обратитесь к администратору.', { reply_markup: mainMenu });
      return;
    }

    console.log('API key is available');
    console.log('Words for stage 4:', words.map(w => w.word));

    // Переходим к этапу 4 - текстовое задание
    session.smartRepeatStage = 4;
    session.storyTaskWords = words.map(w => w.word);
    session.step = 'story_task';
    
    console.log('Set session variables:');
    console.log('- smartRepeatStage:', session.smartRepeatStage);
    console.log('- storyTaskWords:', session.storyTaskWords);
    console.log('- step:', session.step);
    
    await ctx.reply(
      `🧠 <b>Умное повторение - Этап 5/5</b>\n` +
      `📖 <b>Текстовое задание</b>\n\n` +
      `Сейчас будет сгенерирован текст с вашими словами. Внимательно прочитайте его и ответьте на вопросы.`,
      { parse_mode: 'HTML' }
    );
    
    console.log('Reply sent, calling generateStoryTaskContent...');
    
    // Генерируем текст с дополнительной проверкой
    await generateStoryTaskContent(session, ctx);
    
    console.log('generateStoryTaskContent completed successfully');
    
  } catch (error) {
    console.error('=== ERROR IN SMART REPEAT STAGE 4 ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    console.error('Session state:', {
      step: session.step,
      smartRepeatStage: session.smartRepeatStage,
      smartRepeatWords: session.smartRepeatWords?.length || 0,
      storyTaskWords: session.storyTaskWords?.length || 0
    });
    
    // Вместо принудительного завершения, предлагаем варианты
    await ctx.reply(
      `⚠️ <b>Ошибка генерации текста</b>\n\n` +
      `К сожалению, не удалось сгенерировать текст для этапа 4. Это может быть связано с временными проблемами API.\n\n` +
      `🎉 <b>Но вы уже прошли 3 из 4 этапов умного повторения!</b>\n` +
      `✅ Викторина\n` +
      `✅ "Знаю/Не знаю"\n` +
      `✅ Составить предложения\n\n` +
      `Это отличный результат! Попробуйте этап с текстом позже.`,
      { parse_mode: 'HTML' }
    );
    
    // Завершаем умное повторение как успешно пройденное
    await completeSmartRepeat(ctx, session);
  }
}

// Функция завершения умного повторения
async function completeSmartRepeat(ctx, session) {
  // Отмечаем что умное повторение пройдено сегодня
  const todayString = new Date().toDateString();
  session.lastSmartRepeatDate = todayString;
  
  console.log(`DEBUG SMART REPEAT: User ${ctx.from.id} completed all smart repeat stages`);
  console.log(`  - Setting lastSmartRepeatDate to: "${todayString}"`);
  
  // Сохраняем изменения в базу данных
  if (session.profile) {
    await saveUserSession(ctx.from.id, session.profile, session);
    console.log(`  - Saved to database for profile: ${session.profile}`);
  }
  
  // Очищаем данные сессии
  session.step = 'main_menu';
  session.smartRepeatStage = undefined;
  session.smartRepeatWords = undefined;
  session.currentQuizSession = undefined;
  
  return ctx.reply(
    `🧠 <b>Умное повторение завершено!</b>\n\n` +
    `✅ Пройдены все 4 этапа:\n` +
    `1️⃣ Викторина "Угадай перевод"\n` +
    `2️⃣ "Знаю/Не знаю"\n` +
    `3️⃣ Составить предложения\n` +
    `4️⃣ Текстовое задание\n\n` +
    `🎉 Отличная работа!`,
    { 
      reply_markup: mainMenu,
      parse_mode: 'HTML' 
    }
  );
}

// Запускаем бота с инициализацией базы данных
initializeDatabase().then(() => {
  console.log('🚀 Starting bot...');
  bot.start();
}).catch((error) => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});

// Функция завершения умного повторения
async function finishSmartRepeat(ctx, session) {
  console.log(`DEBUG: Finishing smart repeat for user ${ctx.from.id}`);
  
  // Отмечаем что умное повторение пройдено сегодня
  const todayString = new Date().toDateString();
  session.lastSmartRepeatDate = todayString;
  
  console.log(`DEBUG SMART REPEAT: User ${ctx.from.id} completed smart repeat (finishSmartRepeat)`);
  console.log(`  - Setting lastSmartRepeatDate to: "${todayString}"`);
  
  // Сохраняем изменения в базу данных
  if (session.profile) {
    await saveUserSession(ctx.from.id, session.profile, session);
    console.log(`  - Saved to database for profile: ${session.profile}`);
  }
  
  // Очищаем все состояния умного повторения
  delete session.currentQuizSession;
  delete session.smartRepeatWords;
  delete session.smartRepeatStage;
  delete session.currentStage2Index;
  delete session.stage2Answers;
  delete session.currentStage3Index;
  delete session.stage3Sentences;
  delete session.stage3Context;
  
  // Возвращаемся в главное меню
  session.step = 'main_menu';
  
  await ctx.reply('🎉 <b>Умное повторение завершено!</b>\n\nОтличная работа! Все этапы пройдены.', {
    reply_markup: mainMenu,
    parse_mode: 'HTML'
  });
}
