require('dotenv').config({ path: __dirname + '/.env' });
console.log('DEBUG: Environment loaded');
// Не логируем токены в production
if (process.env.NODE_ENV !== 'production') {
  console.log('DEBUG: BOT_TOKEN:', process.env.BOT_TOKEN ? 'Set' : 'Not set');
  console.log('DEBUG: OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'Not set');
}
const { Bot, Keyboard, InputFile, InlineKeyboard } = require('grammy');
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

// Максимальное время неактивности сессии (3 часа для обычных, 6 часов для критических состояний)
const SESSION_TIMEOUT = 3 * 60 * 60 * 1000; // 3 часа
const CRITICAL_SESSION_TIMEOUT = 6 * 60 * 60 * 1000; // 6 часов

// Функция для получения локальной даты GMT+5
function getLocalDateGMT5() {
  const now = new Date();
  // Добавляем 5 часов к UTC времени
  const localTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return localTime.toDateString();
}

// Функция для получения локальной даты в ISO формате GMT+5
function getLocalDateISOGMT5() {
  const now = new Date();
  // Добавляем 5 часов к UTC времени
  const localTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return localTime.toISOString().split('T')[0];
}

// Функция очистки неактивных сессий для экономии памяти
function cleanupInactiveSessions() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [userId, session] of Object.entries(sessions)) {
    const lastActivity = session.lastActivity || now;
    
    // ВАЖНО: НЕ удаляем сессии в критических состояниях
    const criticalSteps = [
      'writing_task',
      'writing_analysis_result', 
      'writing_drill',
      'sentence_task',
      'story_task',
      'smart_repeat_quiz',
      'waiting_answer'
    ];
    
    // Если пользователь в критическом состоянии - увеличиваем таймаут
    const isCriticalState = criticalSteps.includes(session.step) || 
                           session.smartRepeatStage !== undefined;
    
    const timeoutLimit = isCriticalState ? CRITICAL_SESSION_TIMEOUT : SESSION_TIMEOUT;
    
    // Если сессия неактивна более установленного лимита, очищаем её
    if (now - lastActivity > timeoutLimit) {
      const inactiveMinutes = Math.round((now - lastActivity) / 60000);
      const timeoutMinutes = Math.round(timeoutLimit / 60000);
      
      console.log(`🧹 Cleaning inactive session for user ${userId} (inactive for ${inactiveMinutes} minutes, timeout: ${timeoutMinutes} minutes)`);
      
      // Очищаем большие объекты из памяти
      if (session.smartRepeatWords) delete session.smartRepeatWords;
      if (session.wordsToRepeat) delete session.wordsToRepeat;
      if (session.currentQuizSession) delete session.currentQuizSession;
      if (session.storyText) delete session.storyText;
      if (session.storyQuestions) delete session.storyQuestions;
      if (session.sentenceTaskWords) delete session.sentenceTaskWords;
      if (session.stage3Sentences) delete session.stage3Sentences;
      if (session.writingAnalysis) delete session.writingAnalysis;
      
      // Удаляем всю сессию
      delete sessions[userId];
      cleanedCount++;
    } else if (isCriticalState) {
      console.log(`⏳ Keeping critical session for user ${userId} (step: ${session.step}, stage: ${session.smartRepeatStage})`);
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} inactive sessions. Current sessions: ${Object.keys(sessions).length}`);
  }
  
  // Принудительная сборка мусора если доступна
  if (global.gc) {
    global.gc();
    console.log('🗑️ Forced garbage collection');
  }
}

// Функция обновления времени последней активности
function updateSessionActivity(userId) {
  if (sessions[userId]) {
    sessions[userId].lastActivity = Date.now();
  }
}

// Функция очистки больших объектов из сессии для экономии памяти
function cleanupSessionData(session, dataType = 'all') {
  if (!session) return;
  
  try {
    if (dataType === 'all' || dataType === 'quiz') {
      if (session.currentQuizSession) {
        delete session.currentQuizSession;
        console.log('🧹 Cleared currentQuizSession from memory');
      }
    }
    
    if (dataType === 'all' || dataType === 'smart_repeat') {
      if (session.smartRepeatWords) {
        delete session.smartRepeatWords;
        console.log('🧹 Cleared smartRepeatWords from memory');
      }
      if (session.wordsToRepeat) {
        delete session.wordsToRepeat;
        console.log('🧹 Cleared wordsToRepeat from memory');
      }
    }
    
    if (dataType === 'all' || dataType === 'story') {
      if (session.storyText) {
        delete session.storyText;
        console.log('🧹 Cleared storyText from memory');
      }
      if (session.storyQuestions) {
        delete session.storyQuestions;
        console.log('🧹 Cleared storyQuestions from memory');
      }
    }
    
    if (dataType === 'all' || dataType === 'sentences') {
      if (session.sentenceTaskWords) {
        delete session.sentenceTaskWords;
        console.log('🧹 Cleared sentenceTaskWords from memory');
      }
      if (session.stage3Sentences) {
        delete session.stage3Sentences;
        console.log('🧹 Cleared stage3Sentences from memory');
      }
      if (session.stage3Context) {
        delete session.stage3Context;
        console.log('🧹 Cleared stage3Context from memory');
      }
    }
    
    if (dataType === 'all' || dataType === 'writing') {
      if (session.writingAnalysis) {
        delete session.writingAnalysis;
        console.log('🧹 Cleared writingAnalysis from memory');
      }
      if (session.writingTopic) {
        delete session.writingTopic;
        console.log('🧹 Cleared writingTopic from memory');
      }
    }
  } catch (error) {
    console.error('Error cleaning session data:', error);
  }
}

// Функция восстановления сессии из базы данных
async function restoreSessionFromDB(userId, text) {
  try {
    console.log(`🔄 Attempting to restore session for user ${userId}`);
    
    // Загружаем профили пользователя из базы
    const existingProfiles = await prisma.userProfile.findMany({
      where: { telegramId: userId.toString() }
    });
    
    if (existingProfiles.length === 0) {
      console.log(`❌ No profiles found for user ${userId}`);
      return false;
    }
    
    let profile;
    if (existingProfiles.length === 1) {
      profile = existingProfiles[0];
    } else {
      // Если несколько профилей, пытаемся определить по последней активности
      profile = existingProfiles.reduce((latest, current) => 
        new Date(current.updatedAt || current.createdAt) > new Date(latest.updatedAt || latest.createdAt) 
          ? current : latest
      );
    }
    
    console.log(`✅ Restoring session for profile: ${profile.profileName}`);
    
    // Восстанавливаем сессию
    sessions[userId] = {
      profile: profile.profileName,
      step: 'writing_task',
      smartRepeatStage: 2,
      xp: profile.xp,
      level: profile.level,
      loginStreak: profile.loginStreak,
      studyStreak: profile.studyStreak,
      lastStudyDate: profile.lastStudyDate,
      lastBonusDate: profile.lastBonusDate,
      lastSmartRepeatDate: profile.lastSmartRepeatDate,
      reminderTime: profile.reminderTime,
      lastActivity: Date.now(),
      writingTopic: "Восстановленная сессия письменного задания"
    };
    
    console.log(`✅ Session restored for user ${userId}, profile: ${profile.profileName}`);
    return true;
    
  } catch (error) {
    console.error('❌ Error restoring session from DB:', error);
    return false;
  }
}

// Запускаем очистку памяти каждые 5 минут
setInterval(cleanupInactiveSessions, 5 * 60 * 1000);

// Мониторинг использования памяти каждые 10 минут
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.rss / 1024 / 1024);
  const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  
  console.log(`📊 Memory usage: ${memMB}MB RSS, ${heapMB}MB Heap, Sessions: ${Object.keys(sessions).length}`);
  
  // Если память превышает 400MB, принудительно очищаем сессии
  if (memMB > 400) {
    console.log('⚠️ High memory usage detected! Force cleaning sessions...');
    cleanupInactiveSessions();
  }
}, 10 * 60 * 1000);

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

// === СИСТЕМА ДЕНЕЖНОЙ МОТИВАЦИИ ===
// Настройки денежной системы
const MONEY_SYSTEM = {
  TOTAL_BANK: 60000,           // Общий банк в тенге
  DAILY_REWARD: 1000,          // Награда за день в тенге
  TOTAL_DAYS: 30,              // Количество дней в месяце
  
  // ID участников
  NURBOLAT_ID: 'Нурболат',     // ID профиля Нурболата
  AMINA_ID: 'Амина',           // ID профиля Амины
  
  // Telegram ID для уведомлений (нужно будет заполнить реальными)
  NURBOLAT_TELEGRAM_ID: null,   // Заполнить при инициализации
  AMINA_TELEGRAM_ID: null       // Заполнить при инициализации
};

// Функция для получения случайного совета для отдыха
function getRandomRelaxTip() {
  return RELAX_TIPS[Math.floor(Math.random() * RELAX_TIPS.length)];
}

// Функция создания таблицы денежной системы
async function createMoneySystemTable() {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "money_system" (
        "id" SERIAL PRIMARY KEY,
        "profileName" VARCHAR(255) UNIQUE NOT NULL,
        "totalEarned" INTEGER DEFAULT 0,
        "totalOwed" INTEGER DEFAULT 0,
        "dailyCompletions" INTEGER DEFAULT 0,
        "dailyMissed" INTEGER DEFAULT 0,
        "bothMissedDays" INTEGER DEFAULT 0,
        "lastCompletionDate" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    // Создаем отдельную таблицу для общего банка
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "shared_bank" (
        "id" SERIAL PRIMARY KEY,
        "totalAmount" INTEGER DEFAULT 0,
        "lastUpdated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "month" VARCHAR(7) NOT NULL DEFAULT (TO_CHAR(CURRENT_DATE, 'YYYY-MM'))
      )
    `;
    
    // Создаем таблицу для вопросов интерактивного теста
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "quiz_questions" (
        "id" SERIAL PRIMARY KEY,
        "telegramId" BIGINT NOT NULL,
        "questionType" VARCHAR(50) NOT NULL,
        "questionText" TEXT NOT NULL,
        "options" TEXT,
        "correctAnswer" VARCHAR(500),
        "explanation" TEXT,
        "rule" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "lastAsked" TIMESTAMP,
        "timesAsked" INTEGER DEFAULT 0,
        "timesCorrect" INTEGER DEFAULT 0
      )
    `;
    console.log('💰 Money system table created/verified');
    console.log('🧠 Quiz questions table created/verified');
  } catch (error) {
    console.error('Error creating money system table:', error);
  }
}

// Функция инициализации денежной системы с настройкой Telegram ID
async function initializeMoneySystem() {
  try {
    // Создаём таблицу денежной системы если её нет
    await createMoneySystemTable();
    
    // Получаем всех пользователей из базы для настройки ID
    const userProfiles = await prisma.userProfile.findMany();
    
    for (const profile of userProfiles) {
      if (profile.profileName === MONEY_SYSTEM.NURBOLAT_ID) {
        MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID = parseInt(profile.telegramId);
        console.log(`💰 Nurbolat Telegram ID: ${MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID}`);
      } else if (profile.profileName === MONEY_SYSTEM.AMINA_ID) {
        MONEY_SYSTEM.AMINA_TELEGRAM_ID = parseInt(profile.telegramId);
        console.log(`💰 Amina Telegram ID: ${MONEY_SYSTEM.AMINA_TELEGRAM_ID}`);
      }
    }
    
    // Инициализируем исторические данные
    await initializeHistoricalBankData();
    
    console.log('💰 Money system initialized!');
  } catch (error) {
    console.error('Error initializing money system:', error);
  }
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

// === ФУНКЦИИ ДЕНЕЖНОЙ СИСТЕМЫ ===

// Функция получения или создания записи денежной системы для пользователя
async function getOrCreateMoneyRecord(profileName) {
  try {
    // Пытаемся найти существующую запись
    const existingRecords = await prisma.$queryRaw`
      SELECT * FROM "money_system" WHERE "profileName" = ${profileName}
    `;
    
    if (existingRecords.length > 0) {
      return existingRecords[0];
    }
    
    // Создаем новую запись
    await prisma.$executeRaw`
      INSERT INTO "money_system" 
      ("profileName", "totalEarned", "totalOwed", "dailyCompletions", "dailyMissed", "lastCompletionDate")
      VALUES (${profileName}, 0, 0, 0, 0, NULL)
    `;
    
    // Возвращаем созданную запись
    const newRecords = await prisma.$queryRaw`
      SELECT * FROM "money_system" WHERE "profileName" = ${profileName}
    `;
    
    return newRecords[0];
  } catch (error) {
    console.error('Error in getOrCreateMoneyRecord:', error);
    return null;
  }
}

// Функция записи завершения умного повторения и отправки уведомления
async function recordSmartRepeatCompletion(profileName) {
  try {
    const today = getLocalDateGMT5();
    const todayISO = getLocalDateISOGMT5();
    
    console.log(`💰 COMPLETION: Recording completion for ${profileName} on ${today} (${todayISO})`);
    
    // 1. Обновляем основную таблицу user_profiles (для проверки в 23:59)
    const userProfileResult = await prisma.userProfile.updateMany({
      where: { profileName: profileName },
      data: { lastSmartRepeatDate: today }
    });
    
    console.log(`💰 COMPLETION: Updated ${userProfileResult.count} user profiles with completion date: "${today}"`);
    
    // 2. Обновляем денежную систему
    await getOrCreateMoneyRecord(profileName);

    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "lastCompletionDate" = ${today},
        "dailyCompletions" = "dailyCompletions" + 1,
        "totalEarned" = "totalEarned" + ${MONEY_SYSTEM.DAILY_REWARD},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" = ${profileName}
    `;
    
    console.log(`💰 COMPLETION: Money system database updated for ${profileName}`);
    
    // 3. Отправляем уведомление только если основное обновление прошло успешно
    if (userProfileResult.count > 0) {
      console.log(`💰 COMPLETION: Sending notification for ${profileName}`);
      await sendCompletionNotification(profileName);
      console.log(`💰 COMPLETION: ${profileName} completed smart repeat on ${today} - notification sent`);
    } else {
      console.error(`💰 COMPLETION ERROR: No user profiles updated for ${profileName} - notification not sent`);
    }
  } catch (error) {
    console.error('💰 COMPLETION ERROR: Error recording smart repeat completion:', error);
  }
}// Функция отправки уведомления о завершении умного повторения
async function sendCompletionNotification(completedBy) {
  try {
    let recipientTelegramId;
    let message;
    
    console.log(`💰 NOTIFICATION: Sending completion notification for ${completedBy}`);
    console.log(`💰 NOTIFICATION: Nurbolat ID = ${MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID}`);
    console.log(`💰 NOTIFICATION: Amina ID = ${MONEY_SYSTEM.AMINA_TELEGRAM_ID}`);
    
    if (completedBy === MONEY_SYSTEM.NURBOLAT_ID) {
      // Нурболат прошёл - уведомляем Амину
      recipientTelegramId = MONEY_SYSTEM.AMINA_TELEGRAM_ID;
      message = `💰 <b>Денежное уведомление</b>\n\n` +
                `✅ Нурболат только что прошел умное повторение!\n` +
                `💸 Пришли ему 1000 тенге на Каспи`;
    } else if (completedBy === MONEY_SYSTEM.AMINA_ID) {
      // Амина прошла - уведомляем Нурболата  
      recipientTelegramId = MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID;
      message = `💰 <b>Денежное уведомление</b>\n\n` +
                `✅ Амина только что прошла умное повторение!\n` +
                `💸 Она забирает 1000 тенге себе`;
    }
    
    if (recipientTelegramId && message) {
      console.log(`💰 NOTIFICATION: Sending to ${recipientTelegramId}: ${message.substring(0, 50)}...`);
      await bot.api.sendMessage(recipientTelegramId, message, { parse_mode: 'HTML' });
      console.log(`💰 NOTIFICATION: Successfully sent completion notification to ${recipientTelegramId}`);
    } else {
      console.log(`💰 NOTIFICATION: Missing data - recipientId=${recipientTelegramId}, hasMessage=${!!message}`);
    }
  } catch (error) {
    console.error('💰 NOTIFICATION ERROR: Failed to send completion notification:', error);
  }
}

// Функция получения или создания записи банка для текущего месяца
async function getOrCreateSharedBank() {
  try {
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM формат
    
    // Проверяем есть ли запись для текущего месяца
    const existingBank = await prisma.$queryRaw`
      SELECT * FROM "shared_bank" WHERE "month" = ${currentMonth} LIMIT 1
    `;
    
    if (existingBank.length > 0) {
      return existingBank[0];
    }
    
    // Создаем новую запись для месяца
    await prisma.$executeRaw`
      INSERT INTO "shared_bank" ("totalAmount", "month", "lastUpdated")
      VALUES (0, ${currentMonth}, CURRENT_TIMESTAMP)
    `;
    
    const newBank = await prisma.$queryRaw`
      SELECT * FROM "shared_bank" WHERE "month" = ${currentMonth} LIMIT 1
    `;
    
    return newBank[0];
  } catch (error) {
    console.error('Error in getOrCreateSharedBank:', error);
    throw error;
  }
}

// Функция добавления денег в банк накоплений
async function addToSharedBank(amount) {
  try {
    const bank = await getOrCreateSharedBank();
    
    await prisma.$executeRaw`
      UPDATE "shared_bank" SET 
        "totalAmount" = "totalAmount" + ${amount},
        "lastUpdated" = CURRENT_TIMESTAMP
      WHERE "id" = ${bank.id}
    `;
    
    // Возвращаем обновленную сумму
    const updatedBank = await getOrCreateSharedBank();
    return updatedBank.totalAmount;
  } catch (error) {
    console.error('Error in addToSharedBank:', error);
    throw error;
  }
}

// Функция записи дня когда оба пропустили
async function recordBothMissedDay() {
  try {
    const today = getLocalDateGMT5();
    console.log(`💰 BOTH MISSED: Recording both missed day for ${today}`);
    
    // Увеличиваем счетчик для обоих участников
    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "bothMissedDays" = "bothMissedDays" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" IN (${MONEY_SYSTEM.NURBOLAT_ID}, ${MONEY_SYSTEM.AMINA_ID})
    `;
    
    // Добавляем 2000 тг в банк (по 1000 за каждого)
    const newBankTotal = await addToSharedBank(2000);
    
    // Отправляем уведомление обоим
    const message = `💰 <b>Денежное уведомление</b>\n\n` +
                    `😴 Сегодня оба пропустили умное повторение\n` +
                    `💰 Ваши 2000 тг добавлены в банк накоплений\n` +
                    `🏦 Итого в банке: ${newBankTotal.toLocaleString()} тг`;

    // Отправляем уведомления
    if (MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID) {
      await bot.api.sendMessage(MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID, message, { parse_mode: 'HTML' });
    }
    if (MONEY_SYSTEM.AMINA_TELEGRAM_ID) {
      await bot.api.sendMessage(MONEY_SYSTEM.AMINA_TELEGRAM_ID, message, { parse_mode: 'HTML' });
    }
    
    console.log(`💰 BOTH MISSED: Added 2000 tg to bank, new total: ${newBankTotal}`);
    return newBankTotal;
    
  } catch (error) {
    console.error('Error in recordBothMissedDay:', error);
    throw error;
  }
}

// Функция инициализации исторических данных (вызывается один раз)
async function initializeHistoricalBankData() {
  try {
    const bank = await getOrCreateSharedBank();
    
    // Проверяем не инициализированы ли уже исторические данные
    if (bank.totalAmount > 0) {
      console.log(`💰 INIT: Historical data already exists, bank has ${bank.totalAmount} tg`);
      return;
    }
    
    console.log('💰 INIT: Initializing historical bank data for October 4-5...');
    
    // Добавляем 4000 тг за 4,5 октября (по 2000 за каждый день когда оба пропустили)
    await addToSharedBank(4000);
    
    // Обновляем счетчики bothMissedDays для обоих участников (по 2 дня каждый)
    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "bothMissedDays" = "bothMissedDays" + 2,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" IN (${MONEY_SYSTEM.NURBOLAT_ID}, ${MONEY_SYSTEM.AMINA_ID})
    `;
    
    console.log('💰 INIT: Added 4000 tg to bank and updated bothMissedDays counters');
    
  } catch (error) {
    console.error('Error in initializeHistoricalBankData:', error);
  }
}

// Функция деления банка накоплений в конце месяца
async function divideBankAtMonthEnd() {
  try {
    const bank = await getOrCreateSharedBank();
    const totalAmount = bank.totalAmount;
    
    if (totalAmount === 0) {
      console.log('💰 MONTH END: No money in bank to divide');
      return;
    }
    
    console.log(`💰 MONTH END: Dividing bank of ${totalAmount} tg`);
    
    // Делим пополам
    const amountPerPerson = Math.floor(totalAmount / 2);
    
    // Добавляем деньги каждому участнику
    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "totalEarned" = "totalEarned" + ${amountPerPerson},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" IN (${MONEY_SYSTEM.NURBOLAT_ID}, ${MONEY_SYSTEM.AMINA_ID})
    `;
    
    // Обнуляем банк
    await prisma.$executeRaw`
      UPDATE "shared_bank" SET 
        "totalAmount" = 0,
        "lastUpdated" = CURRENT_TIMESTAMP
      WHERE "id" = ${bank.id}
    `;
    
    // Отправляем уведомления
    const message = `💰 <b>Конец месяца!</b>\n\n` +
                    `🏦 Банк накоплений разделен\n` +
                    `💸 Каждый получает: ${amountPerPerson.toLocaleString()} тг\n` +
                    `📊 Общая сумма была: ${totalAmount.toLocaleString()} тг`;

    if (MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID) {
      await bot.api.sendMessage(MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID, message, { parse_mode: 'HTML' });
    }
    if (MONEY_SYSTEM.AMINA_TELEGRAM_ID) {
      await bot.api.sendMessage(MONEY_SYSTEM.AMINA_TELEGRAM_ID, message, { parse_mode: 'HTML' });
    }
    
    console.log(`💰 MONTH END: Successfully divided ${totalAmount} tg (${amountPerPerson} each)`);
    
  } catch (error) {
    console.error('Error in divideBankAtMonthEnd:', error);
    throw error;
  }
}

// Функция проверки пропущенных умных повторений (запускается в 23:59)
async function checkMissedSmartRepeats() {
  try {
    const today = getLocalDateGMT5();
    const todayISO = getLocalDateISOGMT5(); // YYYY-MM-DD формат
    console.log(`💰 MONEY SYSTEM: Checking missed smart repeats for ${today} (${todayISO})`);
    
    // Сначала проверяем статус обоих участников
    const participants = [MONEY_SYSTEM.NURBOLAT_ID, MONEY_SYSTEM.AMINA_ID];
    const completionStatus = {};
    
    for (const profileName of participants) {
      console.log(`💰 Checking ${profileName}...`);
      
      // Получаем данные из основной таблицы user_profiles
      const userProfile = await prisma.userProfile.findFirst({
        where: { profileName: profileName }
      });
      
      if (!userProfile) {
        console.log(`💰 ${profileName}: No user profile found`);
        completionStatus[profileName] = false;
        continue;
      }
      
      // Более надежное сравнение дат - проверяем и строковый и ISO формат
      const didSmartRepeatToday = 
        userProfile.lastSmartRepeatDate === today || 
        userProfile.lastSmartRepeatDate === todayISO ||  
        (userProfile.lastSmartRepeatDate && 
         new Date(userProfile.lastSmartRepeatDate).toDateString() === today);
      
      console.log(`💰 ${profileName}: lastSmartRepeatDate="${userProfile.lastSmartRepeatDate}", today="${today}", todayISO="${todayISO}", completed=${didSmartRepeatToday}`);
      
      completionStatus[profileName] = didSmartRepeatToday;
    }
    
    // Проверяем результаты
    const nurbolatCompleted = completionStatus[MONEY_SYSTEM.NURBOLAT_ID];
    const aminaCompleted = completionStatus[MONEY_SYSTEM.AMINA_ID];
    
    if (!nurbolatCompleted && !aminaCompleted) {
      // Оба пропустили - добавляем в банк накоплений
      console.log(`💰 BOTH MISSED: Both participants missed smart repeat`);
      await recordBothMissedDay();
    } else {
      // Обычная логика - кто-то один пропустил
      for (const profileName of participants) {
        if (!completionStatus[profileName]) {
          console.log(`💰 ${profileName}: Recording individual miss`);
          await recordMissedSmartRepeat(profileName);
          await sendMissedNotification(profileName);
        } else {
          console.log(`💰 ${profileName}: Already completed today, skipping`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking missed smart repeats:', error);
  }
}

// Функция записи пропущенного умного повторения
async function recordMissedSmartRepeat(profileName) {
  try {
    // Создаём запись если её нет
    await getOrCreateMoneyRecord(profileName);
    
    // Обновляем статистику пропуска
    await prisma.$executeRaw`
      UPDATE "money_system" SET 
        "dailyMissed" = "dailyMissed" + 1,
        "totalOwed" = "totalOwed" + ${MONEY_SYSTEM.DAILY_REWARD},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "profileName" = ${profileName}
    `;
    
    console.log(`Money system: ${profileName} missed smart repeat`);
  } catch (error) {
    console.error('Error recording missed smart repeat:', error);
  }
}

// Функция отправки уведомления о пропуске умного повторения  
async function sendMissedNotification(missedBy) {
  try {
    let recipientTelegramId;
    let message;
    
    if (missedBy === MONEY_SYSTEM.NURBOLAT_ID) {
      // Нурболат пропустил - уведомляем Амину
      recipientTelegramId = MONEY_SYSTEM.AMINA_TELEGRAM_ID;
      message = `💰 <b>Денежное уведомление</b>\n\n` +
                `❌ Нурболат ленивец, не прошел умное повторение сегодня!\n` +
                `💸 Можешь взять себе 1000 тенге с его банка 😏`;
    } else if (missedBy === MONEY_SYSTEM.AMINA_ID) {
      // Амина пропустила - уведомляем Нурболата
      recipientTelegramId = MONEY_SYSTEM.NURBOLAT_TELEGRAM_ID;
      message = `💰 <b>Денежное уведомление</b>\n\n` +
                `❌ Вот лентяйка! Амина не прошла умное повторение сегодня!\n` +
                `💸 Скажи чтобы она отдала 1000 тенге с её банка тебе 😈`;
    }
    
    if (recipientTelegramId && message) {
      await bot.api.sendMessage(recipientTelegramId, message, { parse_mode: 'HTML' });
      console.log(`Missed notification sent to ${recipientTelegramId}`);
    }
  } catch (error) {
    console.error('Error sending missed notification:', error);
  }
}

// Функция получения статистики денежной системы
async function getMoneySystemStats() {
  try {
    const nurbolatRecord = await getOrCreateMoneyRecord(MONEY_SYSTEM.NURBOLAT_ID);
    const aminaRecord = await getOrCreateMoneyRecord(MONEY_SYSTEM.AMINA_ID);
    
    // Получаем сумму в банке накоплений
    let sharedBankAmount = 0;
    try {
      const sharedBank = await getOrCreateSharedBank();
      sharedBankAmount = sharedBank.totalAmount;
    } catch (error) {
      console.error('Error getting shared bank amount:', error);
    }
    
    const totalTransferred = nurbolatRecord.totalEarned + aminaRecord.totalEarned + sharedBankAmount;
    const remainingBank = MONEY_SYSTEM.TOTAL_BANK - totalTransferred;
    
    return {
      nurbolat: nurbolatRecord,
      amina: aminaRecord,
      totalBank: MONEY_SYSTEM.TOTAL_BANK,
      remainingBank: remainingBank,
      totalTransferred: totalTransferred,
      sharedBankAmount: sharedBankAmount
    };
  } catch (error) {
    console.error('Error getting money system stats:', error);
    return null;
  }
}

// Функция проверки и начисления ежедневных бонусов
async function checkDailyBonus(session, ctx) {
  const today = getLocalDateGMT5();
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
    console.log(`DEBUG SAVE SESSION: Saving session for ${profileName} (${telegramId})`);
    console.log(`  - lastSmartRepeatDate: "${session.lastSmartRepeatDate}"`);
    
    // Проверяем, что все нужные поля существуют
    if (!session) {
      console.error('ERROR: session is undefined');
      return;
    }
    
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
        lastStudyDate: session.lastStudyDate || null,
        lastBonusDate: session.lastBonusDate || null,
        lastSmartRepeatDate: session.lastSmartRepeatDate || null,
        reminderTime: session.reminderTime || null
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
    session.smartRepeatStage = 4;
    delete session.currentIndex;
    delete session.wordsToRepeat;
    delete session.repeatMode;
    
    await ctx.reply('⏭️ Этап 3 (знаю/не знаю) пропущен!\n\n🧠 <b>Умное повторение - Этап 4/5</b>\n<b>Составление предложений</b>\n\nПереходим к практике...');
    return await startSmartRepeatStage4(ctx, session);
    
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
    await saveUserSession(ctx.from.id, session.profile, session);
  } else {
    studyStreak = 0;
    session.studyStreak = 0;
    // Сохраняем обновленный streak в базу данных
    await saveUserSession(ctx.from.id, session.profile, session);
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

// Команда для просмотра таблицы денежной системы в базе
bot.command('moneytable', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  try {
    // Получаем все записи из таблицы
    const records = await prisma.$queryRaw`SELECT * FROM "money_system" ORDER BY "createdAt" DESC`;
    
    let msg = `📊 <b>Таблица денежной системы</b>\n\n`;
    
    if (records.length === 0) {
      msg += 'ℹ️ Таблица пуста - данные появятся после первого умного повторения';
    } else {
      for (let index = 0; index < records.length; index++) {
        const record = records[index];
        msg += `<b>${index + 1}. ${record.profileName}</b>\n`;
        msg += `✅ Заработал: ${record.totalEarned.toLocaleString()} тг\n`;
        msg += `❌ Должен: ${record.totalOwed.toLocaleString()} тг\n`;
        msg += `📅 Завершил: ${record.dailyCompletions} дней\n`;
        msg += `⏭️ Пропустил: ${record.dailyMissed} дней\n`;
        msg += `👥 Оба пропустили: ${record.bothMissedDays || 0} дней\n`;
        
        if (record.lastCompletionDate) {
          const today = getLocalDateGMT5();
          const isToday = record.lastCompletionDate === today;
          msg += `🕗 Последнее: ${isToday ? 'Сегодня' : record.lastCompletionDate}\n`;
        }
        
        const createdDate = new Date(record.createdAt);
        msg += `📄 Создан: ${createdDate.toLocaleDateString('ru-RU')}\n\n`;
      }
      
      // Добавляем информацию о банке накоплений
      try {
        const sharedBank = await getOrCreateSharedBank();
        msg += `🏦 <b>Банк накоплений:</b> ${sharedBank.totalAmount.toLocaleString()} тг\n`;
        msg += `📅 Месяц: ${sharedBank.month}\n\n`;
      } catch (error) {
        console.error('Error getting shared bank info:', error);
      }
    }
    
    msg += `ℹ️ <i>Обновляется автоматически после каждого умного повторения</i>`;
    
    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error in moneytable command:', error);
    await ctx.reply('❌ Ошибка при получении данных из таблицы');
  }
});

// Команда для просмотра статистики денежной системы
bot.command('money', async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];
  if (!session || !session.profile) {
    return ctx.reply('Сначала выполните /start');
  }
  
  try {
    const stats = await getMoneySystemStats();
    if (!stats) {
      return ctx.reply('❌ Ошибка получения статистики денежной системы');
    }
    
    let msg = `💰 <b>Денежная система мотивации</b>\n\n`;
    
    // Общая информация
    msg += `🏦 <b>Общий банк:</b> ${stats.totalBank.toLocaleString()} тенге\n`;
    msg += `💸 <b>Переведено:</b> ${stats.totalTransferred.toLocaleString()} тенге\n`;
    msg += `💼 <b>Остаток:</b> ${stats.remainingBank.toLocaleString()} тенге\n\n`;
    
    // Статистика Нурболата
    msg += `👨‍💼 <b>Нурболат:</b>\n`;
    msg += `✅ Заработал: ${stats.nurbolat.totalEarned.toLocaleString()} тенге\n`;
    msg += `❌ Должен: ${stats.nurbolat.totalOwed.toLocaleString()} тенге\n`;
    msg += `📅 Завершено: ${stats.nurbolat.dailyCompletions} дней\n`;
    msg += `⏭️ Пропущено: ${stats.nurbolat.dailyMissed} дней\n`;
    msg += `👥 Оба пропустили: ${stats.nurbolat.bothMissedDays || 0} дней\n`;
    
    if (stats.nurbolat.lastCompletionDate) {
      const lastDate = new Date(stats.nurbolat.lastCompletionDate);
      const today = getLocalDateGMT5();
      const isToday = stats.nurbolat.lastCompletionDate === today;
      msg += `🕐 Последнее: ${isToday ? 'Сегодня' : lastDate.toLocaleDateString('ru-RU')}\n`;
    }
    msg += `\n`;
    
    // Статистика Амины
    msg += `👩‍💼 <b>Амина:</b>\n`;
    msg += `✅ Заработала: ${stats.amina.totalEarned.toLocaleString()} тенге\n`;
    msg += `❌ Должна: ${stats.amina.totalOwed.toLocaleString()} тенге\n`;
    msg += `📅 Завершено: ${stats.amina.dailyCompletions} дней\n`;
    msg += `⏭️ Пропущено: ${stats.amina.dailyMissed} дней\n`;
    msg += `👥 Оба пропустили: ${stats.amina.bothMissedDays || 0} дней\n`;
    
    if (stats.amina.lastCompletionDate) {
      const lastDate = new Date(stats.amina.lastCompletionDate);
      const today = getLocalDateGMT5();
      const isToday = stats.amina.lastCompletionDate === today;
      msg += `🕐 Последнее: ${isToday ? 'Сегодня' : lastDate.toLocaleDateString('ru-RU')}\n`;
    }
    msg += `\n`;
    
    // Информация о банке накоплений
    try {
      const sharedBank = await getOrCreateSharedBank();
      msg += `🏦 <b>Банк накоплений:</b> ${sharedBank.totalAmount.toLocaleString()} тенге\n`;
      msg += `💰 <i>Деньги за дни когда оба пропустили (делится в конце месяца)</i>\n\n`;
    } catch (error) {
      console.error('Error getting shared bank info:', error);
      msg += `🏦 <b>Банк накоплений:</b> 0 тенге\n\n`;
    }
    
    // Правила
    msg += `📋 <b>Правила:</b>\n`;
    msg += `• Прошёл умное повторение → +${MONEY_SYSTEM.DAILY_REWARD} тенге\n`;
    msg += `• Один пропустил → ${MONEY_SYSTEM.DAILY_REWARD} тенге другому\n`;
    msg += `• Оба пропустили → ${MONEY_SYSTEM.DAILY_REWARD * 2} тенге в банк накоплений\n`;
    msg += `• Банк делится пополам в конце месяца\n`;
    msg += `• Проверка в 23:59 каждый день\n`;
    msg += `• Всего дней: ${MONEY_SYSTEM.TOTAL_DAYS}`;
    
    await ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error in money command:', error);
    await ctx.reply('❌ Произошла ошибка при получении статистики');
  }
});

// Обработка любых текстовых сообщений
bot.on('message:text', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const normalized = text.toLowerCase();
    
    // Обновляем время последней активности
    updateSessionActivity(userId);
    
    // Инициализируем базовые поля сессии если их нет
    if (sessions[userId] && sessions[userId].profile) {
      if (sessions[userId].lastSmartRepeatDate === undefined) sessions[userId].lastSmartRepeatDate = null;
      if (sessions[userId].lastBonusDate === undefined) sessions[userId].lastBonusDate = null;
      if (sessions[userId].lastStudyDate === undefined) sessions[userId].lastStudyDate = null;
      if (sessions[userId].reminderTime === undefined) sessions[userId].reminderTime = null;
      if (sessions[userId].studyStreak === undefined) sessions[userId].studyStreak = 0;
    }

    // Игнорируем пустые сообщения
    if (!text || text.length === 0) {
      console.log(`DEBUG: Ignoring empty message from user ${userId}`);
      return;
    }

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

  console.log(`DEBUG: ${userId} | STEP: ${step} | TEXT: "${text}" | smartRepeatStage: ${session.smartRepeatStage || 'none'}`);

  // --- ПРИОРИТЕТНАЯ ОБРАБОТКА СОСТОЯНИЙ АВТОРИЗАЦИИ ---
  
  // Шаг 1: ввод пароля
  if (step === 'awaiting_password') {
    const allowed = ['123', 'Aminur777'];
    
    // СПЕЦИАЛЬНАЯ ОБРАБОТКА: если пользователь отправляет длинный текст,
    // возможно его сессия была сброшена во время письменного задания
    if (text.length > 100 && !allowed.includes(text)) {
      console.log(`🔄 User ${userId} sent long text without session - attempting restore`);
      
      const restored = await restoreSessionFromDB(userId, text);
      if (restored) {
        await ctx.reply('✅ Ваша сессия была восстановлена! Анализирую ваш текст...');
        // Обрабатываем текст как письменное задание
        return await handleWritingAnalysis(ctx, sessions[userId], text);
      } else {
        await ctx.reply('⚠️ Похоже, ваша сессия истекла во время письменного задания.\n\nВведите пароль для входа, а затем я помогу восстановить прогресс:');
        return;
      }
    }
    
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
      // Очищаем память от викторины
      cleanupSessionData(session, 'quiz');
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
      delete session.smartRepeatStage;
      // Полная очистка памяти от умного повторения
      cleanupSessionData(session, 'all');
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
          const today = getLocalDateGMT5();
          const isStudiedToday = uniqueDays.includes(today);
          if (isStudiedToday) {
            studyStreak = 1;
            session.studyStreak = 1;
            session.lastStudyDate = new Date().toISOString().split('T')[0];
            // Сохраняем обновленный streak в базу данных
            await saveUserSession(ctx.from.id, session.profile, session);
          }
        }
      } else {
        studyStreak = 0;
        session.studyStreak = 0;
        // Сохраняем обновленный streak в базу данных
        await saveUserSession(ctx.from.id, session.profile, session);
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
      
      // Сохраняем слова стадии 1 для использования в стадии 5
      session.stage1Words = quizWords.map(w => w.word);
      
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

    try {
      // Используем AI для проверки ответа с поддержкой синонимов
      const isCorrect = await checkAnswerWithAI(text, wordObj.translation, wordObj.direction);
      
      if (isCorrect) {
        await ctx.reply('✅ Верно!');
        
        // Начисляем XP за правильный ответ
        const wordCorrectLevel = (all[idx]?.correct || 0);
        const xpGained = await awardXP(session, wordCorrectLevel, ctx);
        
        // Сохраняем обновленный уровень и XP в базу данных (только если сессия полная)
        if (session.profile && session.xp !== undefined) {
          await saveUserSession(ctx.from.id, session.profile, session);
        }
        
        if (idx !== -1) await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, (all[idx].correct || 0) + 1);
        
        // Показываем полученный XP
        await ctx.reply(`💫 +${xpGained} XP`);
      } else {
        await ctx.reply(`❌ Неверно. Правильный ответ: ${wordObj.translation}`);
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
    } catch (error) {
      console.error('Error checking answer with AI:', error);
      await ctx.reply('❌ Ошибка проверки ответа. Попробуйте еще раз.');
      return;
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
          const todayString = getLocalDateGMT5();
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
    const key = wordObj.word + '|' + wordObj.translation;
    
    try {
      // Используем AI для проверки ответа с поддержкой синонимов
      const expectedAnswer = wordObj.direction === 'en-ru' ? wordObj.translation : wordObj.word;
      const isCorrect = await checkAnswerWithAI(text, expectedAnswer, wordObj.direction);
      
      if (isCorrect) {
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
    } catch (error) {
      console.error('Error checking answer with AI in work_on_mistakes:', error);
      await ctx.reply('❌ Ошибка проверки ответа. Попробуйте еще раз.');
      return;
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

  // --- Ответы на интерактивный тест ---
  if (session.waitingForQuizAnswer) {
    await handleQuizAnswer(ctx, session, text);
    return;
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
  console.log(`DEBUG FALLBACK: User ${userId} | Step: ${step} | Stage: ${session.smartRepeatStage || 'none'} | Text: "${text}"`);
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
    // Ограничиваем размер текста для экономии памяти (максимум 2000 символов)
    session.storyText = storyData.text.substring(0, 2000);
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
    
    // Проверяем если это временная ошибка сервера (502, 503, 504)
    const isServerError = e.response && [502, 503, 504].includes(e.response.status);
    const isAPIUnavailable = e.code === 'ECONNRESET' || e.code === 'ENOTFOUND' || isServerError;
    
    if (isAPIUnavailable || e.message.includes('502') || e.message.includes('Bad Gateway')) {
      console.log('Server error detected, providing fallback story...');
      
      // Fallback текст с использованием слов из stадии 1
      const fallbackStory = generateFallbackStory(session.storyTaskWords || []);
      
      session.storyText = fallbackStory.text;
      session.storyQuestions = fallbackStory.questions;
      session.storyQuestionIndex = 0;
      session.additionalVocabulary = fallbackStory.vocabulary;
      
      // Показываем fallback текст
      let storyMessage = `📖 **Текст для изучения:**\n\n${fallbackStory.text}\n\n`;
      storyMessage += `🔍 **Внимательно прочитайте текст выше.** Сейчас будут вопросы на понимание!\n\n`;
      storyMessage += `📚 **Полезные слова:**\n`;
      fallbackStory.vocabulary.slice(0, 5).forEach(vocab => {
        storyMessage += `• **${vocab.word}** - ${vocab.translation}\n`;
      });
      
      await ctx.reply(storyMessage, { parse_mode: 'Markdown' });
      
      // Начинаем первый вопрос
      const q = session.storyQuestions[0];
      session.step = 'story_quiz';
      await ctx.reply(`Вопрос 1/${session.storyQuestions.length}: ${q.question}`, {
        reply_markup: Keyboard.from(q.options.map(opt => [opt]), { one_time_keyboard: true, resize_keyboard: true })
      });
      
      return;
    }
    
    // Остальные ошибки
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
      errorMsg += `Попробуйте позже или обратитесь к администратору.`;
    }
    
    await ctx.reply(errorMsg, { reply_markup: mainMenu });
  }
}

// Функция генерации fallback текста при недоступности OpenAI API
function generateFallbackStory(words) {
  // Базовые шаблоны текстов с местами для вставки слов
  const templates = [
    {
      text: `Modern life presents many challenges that require us to **assess** situations carefully and **commit** to making positive changes. It is **vital** to **remain** focused on our **wellbeing** while living in an increasingly **competitive** world.

When we **undertake** new projects, we must create a proper **sequence** of actions. **Meanwhile**, it's important not to let **anxiety** take control of our daily lives. We should **perform** our duties with dedication and avoid letting negative thoughts **undermine** our confidence.

**No longer** should we allow others to **mislead** us about what truly matters. Instead, we must **wrap** ourselves in positive thinking and focus on **renewable** energy sources for our motivation. Some people still practice **segregation** of ideas, but we must embrace diversity and **stunning** opportunities for growth.

The key to success lies in understanding that every challenge is an opportunity to grow stronger and more resilient.`,
      
      questions: [
        {
          type: "General understanding",
          question: "What is the main message of the text?",
          options: ["Life is too difficult to handle", "We should focus on positive thinking and growth", "Modern life has no solutions", "Competition is harmful", "Anxiety is normal"],
          correct_option: "We should focus on positive thinking and growth"
        },
        {
          type: "General understanding", 
          question: "According to the text, what should we do when facing challenges?",
          options: ["Give up immediately", "Ask others for help", "Assess situations carefully and stay focused", "Avoid all competition", "Ignore the problems"],
          correct_option: "Assess situations carefully and stay focused"
        },
        {
          type: "Specific details",
          question: "What should we avoid letting control our daily lives?",
          options: ["Competition", "Wellbeing", "Anxiety", "Commitment", "Assessment"],
          correct_option: "Anxiety"
        },
        {
          type: "Specific details",
          question: "What kind of energy sources does the text mention for motivation?",
          options: ["Solar energy", "Renewable energy", "Electric energy", "Nuclear energy", "Wind energy"],
          correct_option: "Renewable energy"
        },
        {
          type: "Vocabulary in context",
          question: "In this context, 'assess' means:",
          options: ["To ignore", "To evaluate carefully", "To destroy", "To create", "To avoid"],
          correct_option: "To evaluate carefully"
        },
        {
          type: "Vocabulary in context",
          question: "What does 'undermine' mean in this text?",
          options: ["To strengthen", "To support", "To weaken or damage", "To improve", "To create"],
          correct_option: "To weaken or damage"
        },
        {
          type: "Inference question",
          question: "The author suggests that diversity is:",
          options: ["Harmful to society", "Something to avoid", "Beneficial and should be embraced", "Only for certain people", "Unnecessary"],
          correct_option: "Beneficial and should be embraced"
        },
        {
          type: "Inference question",
          question: "The text implies that challenges:",
          options: ["Should be avoided at all costs", "Are opportunities for growth", "Only happen to unlucky people", "Cannot be overcome", "Are always negative"],
          correct_option: "Are opportunities for growth"
        },
        {
          type: "Cause and effect",
          question: "According to the text, what happens when we let anxiety control us?",
          options: ["We become more successful", "It affects our daily lives negatively", "We perform better", "Nothing changes", "We become stronger"],
          correct_option: "It affects our daily lives negatively"
        },
        {
          type: "Cause and effect",
          question: "What is the result of focusing on positive thinking and wellbeing?",
          options: ["We become weak", "We fail more often", "We grow stronger and more resilient", "We avoid all problems", "We stop working"],
          correct_option: "We grow stronger and more resilient"
        }
      ],
      
      vocabulary: [
        { word: "resilient", translation: "устойчивый, выносливый" },
        { word: "dedication", translation: "преданность, самоотдача" },
        { word: "embrace", translation: "принимать, обнимать" },
        { word: "diversity", translation: "разнообразие" },
        { word: "motivation", translation: "мотивация" },
        { word: "opportunities", translation: "возможности" },
        { word: "challenges", translation: "вызовы, проблемы" },
        { word: "confidence", translation: "уверенность" },
        { word: "focused", translation: "сосредоточенный" },
        { word: "positive", translation: "позитивный" }
      ]
    }
  ];
  
  // Выбираем случайный шаблон (пока только один, но можно добавить больше)
  const template = templates[0];
  
  return {
    text: template.text,
    questions: template.questions,
    vocabulary: template.vocabulary
  };
}

// Обработка команд бота
bot.api.setMyCommands([
  { command: 'menu', description: 'Главное меню' },
  { command: 'start', description: 'Начать/перезапустить бота' },
  { command: 'words', description: 'Показать мои слова' },
  { command: 'sections', description: 'Показать разделы' },
  { command: 'achievements', description: 'Личный прогресс и достижения' },
  { command: 'money', description: '💰 Денежная мотивация и статистика' },
  { command: 'moneytable', description: '📊 Просмотр таблицы денежной системы' },
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
  const today = getLocalDateGMT5();
  
  // Защита от множественного запуска одного типа напоминаний в течение часа
  const lockKey = `reminder_${reminderType}_${today}_${now.getHours()}`;
  if (global[lockKey]) {
    console.log(`DEBUG REMINDERS: ${reminderType} reminder already sent this hour, skipping...`);
    return;
  }
  global[lockKey] = true;
  
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

// Защита от множественного запуска cron задач
if (!global.cronTasksInitialized) {
  global.cronTasksInitialized = true;
  
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
    console.log('📦 Creating daily backup...');
    createBackup();
  }, {
    timezone: "Asia/Yekaterinburg" // GMT+5
  });

  // Проверка пропущенных умных повторений в 23:59
  cron.schedule('59 23 * * *', () => {
    console.log('💰 Checking missed smart repeats...');
    checkMissedSmartRepeats();
  }, {
    timezone: "Asia/Yekaterinburg" // GMT+5
  });

  // Деление банка накоплений 1 числа каждого месяца в 00:01
  cron.schedule('1 0 1 * *', () => {
    console.log('🏦 Dividing shared bank at month end...');
    divideBankAtMonthEnd();
  }, {
    timezone: "Asia/Yekaterinburg" // GMT+5
  });
  
  console.log('🔔 Reminder system initialized!');
  console.log('📦 Daily backup system initialized!');
  console.log('💰 Money system cron initialized!');
  console.log('🏦 Bank division system initialized!');
} else {
  console.log('⚠️ Cron tasks already initialized, skipping...');
}

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
    
    // Очищаем викторину из памяти
    cleanupSessionData(session, 'quiz');
    
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

// Функция запуска этапа 3 умного повторения (Знаю/Не знаю)
async function startSmartRepeatStage2(ctx, session) {
  // Используем слова из умного повторения
  let wordsToRepeat = session.smartRepeatWords || [];
  
  // Если слов нет, но есть слова из викторины - используем их
  if (wordsToRepeat.length === 0 && session.currentQuizSession && session.currentQuizSession.words) {
    wordsToRepeat = session.currentQuizSession.words;
    session.smartRepeatWords = wordsToRepeat; // Сохраняем для следующих этапов
  }
  
  if (wordsToRepeat.length === 0) {
    // Если нет слов для этапа 3, завершаем умное повторение через финальную функцию
    console.log('No words for stage 3, completing smart repeat...');
    return await completeSmartRepeat(ctx, session);
  }
  
  // Во втором этапе ВСЕГДА показываем английские слова для перевода на русский
  session.wordsToRepeat = wordsToRepeat.map(w => {
    return { ...w, direction: 'en-ru' }; // ТОЛЬКО en-ru для этапа 2
  });
  session.currentIndex = 0;
  session.step = 'waiting_answer';
  session.repeatMode = 'smart';
  session.smartRepeatStage = 3;  // Этап 3: "Знаю/Не знаю"
  
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
    console.log(`DEBUG: Calling checkAnswerWithAI with: "${answerText}" vs "${expectedAnswer}"`);
    const isCorrect = await checkAnswerWithAI(answerText, expectedAnswer, 'en-ru');
    console.log(`DEBUG: checkAnswerWithAI returned: ${isCorrect}`);
    
    if (isCorrect) {
      await ctx.reply(`✅ <b>Правильно!</b>\n\n📝 <b>${wordObj.word}</b> — ${wordObj.translation}`, { parse_mode: 'HTML' });
      
      // Начисляем XP за правильный ответ
      const wordCorrectLevel = wordObj.correct || 0;
      const xpGained = await awardXP(session, wordCorrectLevel, ctx);
      
      // Сохраняем обновленный уровень и XP в базу данных
      await saveUserSession(ctx.from.id, session.profile, session);
      
      await ctx.reply(`💫 +${xpGained} XP`);
      
      // Увеличиваем счетчик правильных ответов
      try {
        await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, wordObj.correct + 1);
      } catch (error) {
        console.error('Error updating word progress in stage 2:', error);
      }
      
      // Переходим к следующему слову
      return await moveToNextStage2Word(ctx, session);
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
    await ctx.reply('❌ Ошибка проверки ответа. Засчитываю как неправильный и перехожу к следующему слову.');
    
    // Даже при ошибке переходим к следующему слову, чтобы не зависать
    return await moveToNextStage2Word(ctx, session);
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
    // Этап 3 завершен - очищаем память от wordsToRepeat
    cleanupSessionData(session, 'smart_repeat');
    
    // Переходим к этапу 4
    await startSmartRepeatStage4(ctx, session);
  }
}

// Обработка ответов в этапе 3 умного повторения (Знаю/Не знаю)
async function handleSmartRepeatStage3Answer(ctx, session, answerText) {
  console.log(`DEBUG: handleSmartRepeatStage3Answer called with text: "${answerText}"`);
  
  // Проверяем кнопку "Пропустить"
  if (answerText === '⏭️ Пропустить слово') {
    const wordObj = session.wordsToRepeat[session.currentIndex];
    await ctx.reply(`⏭️ Пропущено: <b>${wordObj.word}</b> — ${wordObj.translation}`, { parse_mode: 'HTML' });
    return await moveToNextStage3Word(ctx, session);
  }

  // В этапе 3 проверяем ответ пользователя через AI (как в обычном режиме)
  const wordObj = session.wordsToRepeat[session.currentIndex];
  const expectedAnswer = wordObj.translation;
  
  console.log(`DEBUG Stage 3 Answer Check:
    Word: ${wordObj.word}
    Translation: ${wordObj.translation}
    User Answer: ${answerText}
    Expected Answer: ${expectedAnswer}`);
  
  try {
    // Используем AI для проверки ответа
    console.log(`DEBUG: Stage 3 - Calling checkAnswerWithAI with: "${answerText}" vs "${expectedAnswer}"`);
    const isCorrect = await checkAnswerWithAI(answerText, expectedAnswer, 'en-ru');
    console.log(`DEBUG: Stage 3 - checkAnswerWithAI returned: ${isCorrect}`);
    
    if (isCorrect) {
      await ctx.reply(`✅ <b>Правильно!</b>\n\n📝 <b>${wordObj.word}</b> — ${wordObj.translation}`, { parse_mode: 'HTML' });
      
      // Начисляем XP за правильный ответ
      const wordCorrectLevel = wordObj.correct || 0;
      const xpGained = await awardXP(session, wordCorrectLevel, ctx);
      
      // Сохраняем обновленный уровень и XP в базу данных
      await saveUserSession(ctx.from.id, session.profile, session);
      
      await ctx.reply(`💫 +${xpGained} XP`);
      
      // Увеличиваем счетчик правильных ответов
      try {
        await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, (wordObj.correct || 0) + 1);
      } catch (error) {
        console.error('Error updating word progress in stage 3:', error);
      }
    } else {
      await ctx.reply(`❌ <b>Неправильно!</b>\n\n📝 <b>${wordObj.word}</b> — <b>${wordObj.translation}</b>\n🎯 Вы ответили: ${answerText}`, { parse_mode: 'HTML' });
      
      // Мягко уменьшаем счетчик (не сбрасываем в 0)
      try {
        const newCorrect = Math.max(0, (wordObj.correct || 0) - 1);
        await updateWordCorrect(session.profile, wordObj.word, wordObj.translation, newCorrect);
      } catch (error) {
        console.error('Error updating word progress in stage 3:', error);
      }
    }
    
    // Переходим к следующему слову
    return await moveToNextStage3Word(ctx, session);
    
  } catch (error) {
    console.error('Error checking answer with AI in stage 3:', error);
    await ctx.reply('❌ Ошибка проверки ответа. Засчитываю как неправильный и перехожу к следующему слову.');
    
    // Даже при ошибке переходим к следующему слову, чтобы не зависать
    return await moveToNextStage3Word(ctx, session);
  }
}

// Переход к следующему слову в этапе 3
async function moveToNextStage3Word(ctx, session) {
  session.currentIndex++;
  
  if (session.currentIndex < session.wordsToRepeat.length) {
    // Есть еще слова - показываем следующее
    const next = session.wordsToRepeat[session.currentIndex];
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
        console.error('Error sending audio in moveToNextStage3Word:', error);
      }
    }
  } else {
    // Этап 3 завершен - переходим к этапу 4
    await startSmartRepeatStage4(ctx, session);
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
  
  // 3. Если 1-2 ошибки и слова похожи - автоматически засчитываем
  if (distance === 1) {
    console.log('DEBUG: 1 error - AUTO TRUE');
    return true;
  }
  
  if (distance === 2 && normalizedUser.length >= 4 && normalizedCorrect.length >= 4) {
    // Для коротких слов с 2 ошибками тоже можем засчитать, если есть общее начало
    const commonStart = getCommonStart(normalizedUser, normalizedCorrect);
    if (commonStart.length >= 3) {
      console.log(`DEBUG: 2 errors but common start "${commonStart}" - AUTO TRUE`);
      return true;
    }
  }
  
  // 4. Если 2+ ошибки - отправляем GPT для оценки
  if (distance >= 2) {
    console.log('DEBUG: 2+ errors - sending to GPT');
    try {
      const prompt = `Проверь перевод с английского на русский. Принимай синонимы и связанные слова.

Правильный перевод: "${correctAnswer}"
Ответ пользователя: "${userAnswer}"

ПРИНИМАЙ:
✅ Синонимы и близкие по смыслу слова  
✅ Разные части речи если смысл тот же ("жертва"="жертвовать")
✅ Разные формы слов (падежи, времена)

ПРИМЕРЫ:
- "жертвовать" для "жертва" = true
- "вдох" для "вдыхать" = true  
- "разнообразный" для "варьироваться" = true
- "содержать" для "соединение" = false (разный смысл)

НЕ ПРИНИМАЙ:
❌ Совершенно другие значения
❌ Английские слова вместо перевода

ВАЖНО: Отвечай ТОЛЬКО словом "true" или "false". Никакого дополнительного текста!

Ответ:`;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = response.data.choices[0].message.content.trim().toLowerCase();
      // Ищем "true" или "false" в ответе, даже если есть дополнительный текст
      const isCorrect = result.includes('true') && !result.includes('false');
      console.log(`DEBUG: GPT result: ${result} -> ${isCorrect}`);
      return isCorrect;
      
    } catch (error) {
      console.error('GPT check failed:', error);
      // Fallback: если GPT не работает, принимаем ответ если он содержит часть правильного ответа
      const userWords = normalizedUser.split(/\s+/);
      const correctWords = normalizedCorrect.split(/\s+/);
      
      // Проверяем, есть ли пересечение слов или общие корни
      for (const userWord of userWords) {
        for (const correctWord of correctWords) {
          // Если слова имеют общий корень длиной 3+ символа
          if (userWord.length >= 3 && correctWord.length >= 3) {
            const minLen = Math.min(userWord.length, correctWord.length);
            const commonStart = getCommonStart(userWord, correctWord);
            if (commonStart.length >= Math.min(3, minLen * 0.6)) {
              console.log(`DEBUG: Found common root "${commonStart}" - accepting as TRUE`);
              return true;
            }
          }
        }
      }
      
      console.log('DEBUG: GPT failed and no common roots found - FALSE');
      return false;
    }
  }
  
  console.log('DEBUG: No match - FALSE');
  return false;
}

// Функция для поиска общего начала двух слов
function getCommonStart(str1, str2) {
  let i = 0;
  while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
    i++;
  }
  return str1.substring(0, i);
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
    
    // Детальный системный промпт для анализа
const systemPrompt = `Ты строгий преподаватель английского языка и эксперт по IELTS Writing. Проанализируй текст студента КРИТИЧЕСКИ и найди ВСЕ грамматические ошибки, стилистические проблемы и неточности.

КРИТИЧЕСКИ ВАЖНО:
1. Найди МИНИМУМ 5-8 различных ошибок или областей улучшения
2. Каждое правило должно начинаться с "💡 Rule:" и быть конкретным
3. Создай для каждой ошибки несколько примеров для тренировки

Верни только JSON в таком формате:
{
  "band_estimate": "6.5", 
  "summary": "Детальный анализ с упоминанием конкретных проблем",
  "global_advice": "Конкретные советы по улучшению",
  "errors": [
    {
      "title": "Конкретная грамматическая проблема",
      "rule": "💡 Rule: Детальное правило с примерами",
      "meme": "Запоминающаяся подсказка", 
      "examples": [
        {
          "from": "точный ошибочный фрагмент из текста",
          "to": "исправленный вариант",
          "why": "почему именно так"
        }
      ]
    }
  ]
}`;

    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `LANG=ru\nTEXT=\n${userText}` }
      ],
      temperature: 0.7,
      max_completion_tokens: 10000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    let analysisResponse = gptRes.data.choices[0].message.content.trim();
    
    // Пытаемся извлечь JSON с максимально надежной обработкой
    console.log('DEBUG: OpenAI raw response:', analysisResponse);
    
    // Проверяем что ответ не пустой
    if (!analysisResponse || analysisResponse.length < 10) {
      console.error('ERROR: OpenAI returned empty or very short response:', analysisResponse);
      
      // Fallback анализ без AI
      const fallbackAnalysis = {
        band_estimate: "6.0",
        summary: "Ваш текст проанализирован базовой системой. Уровень письма соответствует среднему уровню. В тексте есть как сильные стороны, так и области для улучшения.",
        global_advice: "Продолжайте практиковаться в письме, обращайте внимание на грамматику и структуру предложений. Читайте больше английских текстов для расширения словарного запаса.",
        errors: [
          {
            title: "Общие рекомендации по улучшению письма",
            rule: "Обратите внимание на грамматику, времена глаголов и структуру предложений",
            meme: "Постоянная практика письма поможет улучшить навыки",
            examples: [
              {
                from: "Пример простого предложения",
                to: "Пример улучшенного предложения с лучшей структурой"
              }
            ]
          }
        ],
        drills: [
          {
            title: "Past Simple: отрицания с 'have'",
            rule: "Используйте 'didn't have' для отрицания в прошедшем времени",
            exercises: [
              {
                question: "Вчера у меня не было времени",
                type: "fill",
                text: "Yesterday I ▢ ▢ time",
                word_count: 2,
                correct_answer: "didn't have",
                accepted: ["didn't have"],
                hint: "Используйте did not + have"
              }
            ]
          }
        ]
      };
      
      session.writingAnalysis = fallbackAnalysis;
      session.stage2_analysis = fallbackAnalysis; // Для квиза
      session.step = 'writing_analysis_result';
      
      console.log('DEBUG: Saved fallback stage2_analysis:', {
        hasErrors: !!fallbackAnalysis.errors,
        errorsCount: fallbackAnalysis.errors?.length,
        errorsType: typeof fallbackAnalysis.errors
      });
      
      await ctx.reply('✅ Анализ завершен! Показываю основные рекомендации:', { reply_markup: { remove_keyboard: true } });
      await showWritingAnalysisResult(ctx, session);
      await generateImprovedVersion(ctx, session, userText);
      return;
    }
    
    let analysisData;
    
    // Множественные попытки парсинга JSON
    try {
      // 1. Пробуем парсить весь ответ как JSON
      analysisData = JSON.parse(analysisResponse);
    } catch (e1) {
      try {
        // 2. Ищем JSON между фигурными скобками (жадный поиск)
        const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('JSON not found');
        }
      } catch (e2) {
        try {
          // 3. Ищем JSON между ```json блоками
          const codeBlockMatch = analysisResponse.match(/```json\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            analysisData = JSON.parse(codeBlockMatch[1]);
          } else {
            throw new Error('JSON block not found');
          }
        } catch (e3) {
          try {
            // 4. Ищем только первый JSON объект (нежадный поиск)
            const firstJsonMatch = analysisResponse.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
            if (firstJsonMatch) {
              analysisData = JSON.parse(firstJsonMatch[0]);
            } else {
              throw new Error('No valid JSON structure found');
            }
          } catch (e4) {
            console.error('All JSON parsing attempts failed:', {
              originalResponse: analysisResponse,
              errors: [e1.message, e2.message, e3.message, e4.message]
            });
            throw new Error('AI не вернул валидный JSON. Попробуйте еще раз.');
          }
        }
      }
    }
    
    // Проверяем обязательные поля с fallback значениями
    if (!analysisData.band_estimate) {
      analysisData.band_estimate = "6.0"; // Fallback оценка
    }
    if (!analysisData.summary) {
      analysisData.summary = "Анализ завершен. Общий уровень письма соответствует среднему уровню.";
    }
    if (!analysisData.global_advice) {
      analysisData.global_advice = "Продолжайте практиковаться в письме и изучении грамматики.";
    }
    if (!Array.isArray(analysisData.errors)) {
      analysisData.errors = []; // Пустой массив ошибок как fallback
    }
    
    console.log('DEBUG: Parsed analysis data:', {
      band_estimate: analysisData.band_estimate,
      summary_length: analysisData.summary?.length,
      advice_length: analysisData.global_advice?.length,
      errors_count: analysisData.errors?.length
    });
    
    // Сохраняем анализ в сессии
    session.writingAnalysis = analysisData;
    session.stage2_analysis = analysisData; // Для квиза
    session.step = 'writing_analysis_result';
    
    console.log('DEBUG: Saved stage2_analysis:', {
      hasErrors: !!analysisData.errors,
      errorsCount: analysisData.errors?.length,
      errorsType: typeof analysisData.errors
    });
    
    // Показываем результат анализа
    await showWritingAnalysisResult(ctx, session);
    
    // Генерируем улучшенную версию текста
    await generateImprovedVersion(ctx, session, userText);
    
  } catch (error) {
    console.error('Error in handleWritingAnalysis:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    let errorMsg = 'Произошла ошибка при анализе текста. ';
    
    if (error.response && error.response.data && error.response.data.error) {
      const apiError = error.response.data.error;
      console.error('OpenAI API Error:', apiError);
      
      if (apiError.code === 'insufficient_quota') {
        errorMsg = 'Лимит API исчерпан. Обратитесь к администратору.';
      } else if (apiError.code === 'rate_limit_exceeded') {
        errorMsg = 'Слишком много запросов. Попробуйте через минуту.';
      } else if (apiError.code === 'model_not_found') {
        errorMsg = 'Модель недоступна. Попробуйте позже.';
      } else {
        errorMsg += `API ошибка: ${apiError.message}`;
      }
    } else if (error.message.includes('JSON')) {
      // В случае ошибки JSON - предлагаем fallback анализ
      console.log('Providing fallback analysis due to JSON error...');
      
      const simpleFallback = {
        band_estimate: "6.0",
        summary: "Ваш текст содержит хорошие идеи, но есть несколько грамматических ошибок и стилистических неточностей, которые можно исправить.",
        global_advice: "Обратите внимание на времена глаголов, порядок слов и структуру предложений. Практикуйтесь в написании коротких текстов ежедневно.",
        errors: [
          {
            title: "Рекомендации по улучшению текста",
            rule: "Проверьте грамматику, времена глаголов и структуру предложений",
            meme: "Практика - ключ к совершенству в письме",
            examples: [
              {
                from: "Типичная ошибка в грамматике",
                to: "Исправленная версия с правильной грамматикой"
              }
            ]
          }
        ],
        drills: []
      };
      
      session.writingAnalysis = simpleFallback;
      session.step = 'writing_analysis_result';
      
      await ctx.reply('✅ Анализ завершен! Показываю основные рекомендации:', { reply_markup: { remove_keyboard: true } });
      await showWritingAnalysisResult(ctx, session);
      return;
    } else {
      errorMsg += `Детали: ${error.message}`;
    }
    
    session.step = 'main_menu';
    await ctx.reply(`❌ ${errorMsg}`, { reply_markup: mainMenu });
  }
}

// Функция генерации улучшенной версии текста
async function generateImprovedVersion(ctx, session, originalText) {
  try {
    console.log('=== GENERATING IMPROVED VERSION ===');
    
    await ctx.reply('✨ Генерирую улучшенную версию вашего текста...');
    
    const improvementPrompt = `
ТЫ: Эксперт IELTS Writing, улучшаешь тексты студентов до уровня 7.0

ЗАДАЧА: Улучшить текст и дать 5 практических советов в новом формате с примерами из реального текста пользователя.

КРИТЕРИИ IELTS WRITING 7.0:
1. Task Response (Ответ на задание):
   - Полное раскрытие темы
   - Четкая позиция автора
   - Развернутые и релевантные идеи
   - Логичное заключение

2. Coherence & Cohesion (Связность):
   - Логичная структура
   - Эффективные связующие слова
   - Четкие параграфы
   - Плавные переходы между идеями

3. Lexical Resource (Лексика):
   - Широкий словарный запас
   - Точное использование слов
   - Идиоматические выражения
   - Минимальные лексические ошибки

4. Grammar (Грамматика):
   - Разнообразные грамматические структуры
   - Сложные предложения
   - Высокая точность
   - Редкие ошибки

ИНСТРУКЦИИ:
1. Сохрани основную идею и смысл оригинального текста
2. Улучши структуру и логику изложения
3. Обогати лексику более продвинутыми словами и фразами
4. Используй разнообразные грамматические конструкции
5. Добавь связующие слова для лучшей связности
6. Исправи все грамматические и лексические ошибки
7. Подбери 10 продвинутых слов по теме для развития словарного запаса

ЯЗЫКОВЫЕ ТРЕБОВАНИЯ - КРИТИЧЕСКИ ВАЖНО:
- improved_text: ТОЛЬКО НА АНГЛИЙСКОМ ЯЗЫКЕ
- key_changes: ТОЛЬКО НА РУССКОМ ЯЗЫКЕ  
- improvements[].description: ТОЛЬКО НА РУССКОМ ЯЗЫКЕ
- improvements[].example: ТОЛЬКО НА РУССКОМ ЯЗЫКЕ
- writing_tips: ТОЛЬКО НА РУССКОМ ЯЗЫКЕ
- vocabulary_boost[].translation: НА РУССКОМ ЯЗЫКЕ
- vocabulary_boost[].usage: НА АНГЛИЙСКОМ ЯЗЫКЕ (это пример предложения)

ЗАПРЕЩЕНО писать объяснения на английском! Это грубая ошибка!

ПРИМЕР правильного ответа (ОБРАТИ ВНИМАНИЕ НА ЯЗЫКИ!):
{
  "improved_text": "Climate change represents a critical global challenge...",
  "key_changes": "Текст был полностью переработан для улучшения связности между идеями и обогащен продвинутой академической лексикой",
  "improvements": [
    {
      "category": "Task Response",
      "description": "Тема раскрыта более полно с четкой позицией автора и развернутыми аргументами",
      "example": "Добавлены конкретные примеры и более детальное обоснование позиции"
    },
    {
      "category": "Coherence & Cohesion", 
      "description": "Улучшена логическая структура текста с помощью связующих слов и четких переходов",
      "example": "Использованы фразы типа 'Furthermore', 'In addition', 'Consequently'"
    },
    {
      "category": "Lexical Resource",
      "description": "Заменена простая лексика на более продвинутую и точную", 
      "example": "Вместо 'big problem' использовано 'significant challenge'"
    },
    {
      "category": "Grammar",
      "description": "Добавлены сложные грамматические конструкции для разнообразия",
      "example": "Использованы условные предложения и причастные обороты"
    }
  ],
  "writing_tips": [
    "Используйте разнообразные связующие слова для плавного перехода между идеями",
    "Применяйте синонимы и перефразирование чтобы избежать повторений",
    "Структурируйте каждый параграф с четкой главной мыслью"
  ],
  "vocabulary_words": [
    {
      "word": "catastrophic",
      "translation": "катастрофический",
      "example": "The catastrophic effects of climate change are becoming evident."
    }
  ]
}

КРИТИЧЕСКИ ВАЖНО - ИСПОЛЬЗУЙ ТОЛЬКО ЭТОТ ФОРМАТ JSON:
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
- ОБЯЗАТЕЛЬНО включи vocabulary_words - ровно 5 слов релевантных теме текста пользователя
- improved_text только на английском
- Все остальное только на русском
- НИКОГДА НЕ используй поля: key_changes, improvements, writing_tips, vocabulary_boost
- ИСПОЛЬЗУЙ ТОЛЬКО: improved_text, writing_advice, vocabulary_words
- Возвращай ТОЛЬКО JSON!
`;

    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: improvementPrompt },
        { role: 'user', content: `Исходный текст для улучшения:\n\n${originalText}\n\nВНИМАНИE! КРИТИЧЕСКИ ВАЖНО:\n- Улучшенный текст: ТОЛЬКО НА АНГЛИЙСКОМ\n- ВСЕ описания, объяснения, примеры, советы: ТОЛЬКО НА РУССКОМ!\n- НИ ОДНОГО АНГЛИЙСКОГО СЛОВА в key_changes, improvements, writing_tips!\n- Если напишешь объяснения на английском - это ОШИБКА!\n\nОТВЕЧАЙ СТРОГО ПО ИНСТРУКЦИИ!` }
      ],
      temperature: 1,
      max_completion_tokens: 10000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    let improvementResponse = gptRes.data.choices[0].message.content.trim();
    console.log('DEBUG: Improvement raw response:', improvementResponse);
    
    let improvementData;
    
    // Парсим JSON ответ
    try {
      improvementData = JSON.parse(improvementResponse);
      console.log('DEBUG: Parsed improvement data:', JSON.stringify(improvementData, null, 2));
      console.log('DEBUG: Has writing_advice:', !!improvementData.writing_advice);
      console.log('DEBUG: Has vocabulary_words:', !!improvementData.vocabulary_words);
    } catch (e1) {
      try {
        const jsonMatch = improvementResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          improvementData = JSON.parse(jsonMatch[0]);
          console.log('DEBUG: Parsed improvement data (fallback):', JSON.stringify(improvementData, null, 2));
        } else {
          throw new Error('JSON not found');
        }
      } catch (e2) {
        console.error('Failed to parse improvement response:', improvementResponse);
        // Fallback - показываем только оригинальный анализ
        return;
      }
    }
    
    // Проверяем обязательные поля
    if (!improvementData.improved_text) {
      console.error('No improved_text in response');
      return;
    }
    
    // Добавляем fallback данные если отсутствуют
    if (!improvementData.writing_advice || improvementData.writing_advice.length === 0) {
      console.log('WARNING: No writing_advice, adding fallback');
      improvementData.writing_advice = [
        {
          "number": "1️⃣",
          "title": "Используйте более разнообразную лексику",
          "why": "💬 Зачем: Богатый словарный запас повышает оценку IELTS.",
          "how": "🧠 Как: Заменяйте простые слова синонимами. Используйте более точные термины.",
          "example_bad": "good experience",
          "example_good": "valuable/enriching experience",
          "action": "🪄 Что делать: выберите 3-4 простых слова в тексте и замените их на более продвинутые."
        }
      ];
    }
    
    if (!improvementData.vocabulary_words || improvementData.vocabulary_words.length === 0) {
      console.log('WARNING: No vocabulary_words, adding fallback');
      improvementData.vocabulary_words = [
        { "word": "excessive", "translation": "чрезмерный", "example": "excessive use of social media" },
        { "word": "engage", "translation": "участвовать, заниматься", "example": "engage in productive activities" },
        { "word": "consequently", "translation": "следовательно", "example": "consequently, I feel tired" },
        { "word": "aspire", "translation": "стремиться", "example": "I aspire to read more books" },
        { "word": "energized", "translation": "полный энергии", "example": "feel more energized each day" }
      ];
    }

    // Сохраняем улучшенную версию в сессии
    session.improvedText = improvementData;
    
    // Показываем улучшенную версию
    await showImprovedVersion(ctx, session);
    
  } catch (error) {
    console.error('Error generating improved version:', error);
    // Не прерываем весь процесс, просто пропускаем улучшенную версию
  }
}

// Функция отображения улучшенной версии в новом формате
async function showImprovedVersion(ctx, session) {
  const improved = session.improvedText;
  
  if (!improved || !improved.improved_text) {
    return;
  }
  
  try {
    // Часть 1: Улучшенный текст
    let message1 = `✨ <b>Улучшенная версия (IELTS 7.0 - 8.0 уровень):</b>\n\n`;
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
    
    // После показа улучшенного текста переходим к добавлению слов в словарь
    if (improved.vocabulary_words && improved.vocabulary_words.length > 0) {
      setTimeout(() => {
        startVocabularyAddition(ctx, session, improved.vocabulary_words);
      }, 2000);
    } else {
      // Если слов нет, сразу переходим к тесту с ошибками
      setTimeout(() => {
        generatePersonalizedQuiz(ctx, session, session.stage2_analysis.errors);
      }, 2000);
    }
    
  } catch (error) {
    console.error('Error in showImprovedVersion:', error);
    // Fallback - простое сообщение
    await ctx.reply('✨ Улучшенная версия готова! К сожалению, произошла ошибка при отправке полного анализа.');
    // Переходим к тесту с ошибками даже при ошибке
    setTimeout(() => {
      generatePersonalizedQuiz(ctx, session, session.stage2_analysis.errors);
    }, 2000);
  }
}

// Функция добавления слов в словарь (по одному слову)
async function startVocabularyAddition(ctx, session, vocabularyWords) {
  try {
    session.vocabularyWords = vocabularyWords;
    session.currentWordIndex = 0;
    session.addedWordsCount = 0;
    
    await showNextVocabularyWord(ctx, session);
    
  } catch (error) {
    console.error('Error in startVocabularyAddition:', error);
    // При ошибке переходим сразу к тесту
    await generatePersonalizedQuiz(ctx, session, session.stage2_analysis.errors);
  }
}

// Функция показа следующего слова для добавления в словарь
async function showNextVocabularyWord(ctx, session) {
  try {
    if (session.currentWordIndex >= session.vocabularyWords.length) {
      // Все слова просмотрены, переходим к тесту
      await ctx.reply(`✅ Готово! Добавлено слов в словарь: ${session.addedWordsCount}`);
      
      setTimeout(() => {
        generatePersonalizedQuiz(ctx, session, session.stage2_analysis.errors);
      }, 1500);
      return;
    }
    
    const currentWord = session.vocabularyWords[session.currentWordIndex];
    const wordNumber = session.currentWordIndex + 1;
    const totalWords = session.vocabularyWords.length;
    
    const message = `📚 <b>Добавить новое слово? (${wordNumber}/${totalWords})</b>\n\n` +
                   `<b>${currentWord.word}</b> - ${currentWord.translation}\n` +
                   `<i>${currentWord.example}</i>`;
    
    const keyboard = new InlineKeyboard()
      .text('✅ Добавить в словарь', `add_vocab_${session.currentWordIndex}`)
      .text('⏭ Пропустить', `skip_vocab_${session.currentWordIndex}`);
    
    await ctx.reply(message, { 
      parse_mode: 'HTML', 
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Error in showNextVocabularyWord:', error);
    // При ошибке переходим к следующему слову
    session.currentWordIndex++;
    await showNextVocabularyWord(ctx, session);
  }
}

// Функция генерации персонального интерактивного теста
async function generatePersonalizedQuiz(ctx, session, analysisErrors) {
  try {
    console.log('=== GENERATING PERSONALIZED QUIZ ===');
    console.log('Analysis errors received:', analysisErrors);
    
    // Проверяем что analysisErrors корректен
    console.log('DEBUG: analysisErrors type:', typeof analysisErrors);
    console.log('DEBUG: analysisErrors isArray:', Array.isArray(analysisErrors));
    console.log('DEBUG: analysisErrors length:', analysisErrors?.length);
    
    if (!analysisErrors) {
      console.error('analysisErrors is null/undefined');
      await ctx.reply('❌ Не удается создать персональный тест. Нет данных анализа.');
      return;
    }
    
    // analysisErrors уже должен быть массивом ошибок
    if (!Array.isArray(analysisErrors)) {
      console.error('analysisErrors is not an array:', typeof analysisErrors);
      await ctx.reply('❌ Не удается создать персональный тест. Данные анализа некорректны.');
      return;
    }
    
    if (analysisErrors.length === 0) {
      console.log('No errors found, cannot create quiz');
      await ctx.reply('✅ В вашем тексте не найдено ошибок для создания персонального теста!');
      return;
    }
    
    await ctx.reply('🧠 Создаю персональный тест на основе ваших ошибок...');
    
    const quizPrompt = `ТЫ: Эксперт по английскому языку, создаешь персональные интерактивные тесты на основе ошибок студента

ЗАДАЧА: Создать интерактивный тест из 10 вопросов на основе найденных ошибок пользователя

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ТЕСТА:
- 3 вопроса "Find the Hidden Error" (выбор правильного варианта A/B/C/D)  
- 3 вопроса "Spot & Fix" (исправить предложение, ввод текста)
- 4 вопроса "Mini-dialogs" (выбор правильного варианта A/B/C/D в диалоге)

СТРОГИЕ ТРЕБОВАНИЯ К JSON:
1. Возвращай ТОЛЬКО валидный JSON объект без markdown, без лишнего текста
2. Точно соблюдай структуру полей 
3. Все строки должны быть в двойных кавычках
4. НЕ отмечай правильный ответ в options - пользователь должен сам найти ошибку
5. Используй \\n для переносов строк внутри JSON

ОБЯЗАТЕЛЬНЫЙ ФОРМАТ JSON:
{
  "quiz_sections": [
    {
      "section_title": "🧠 Часть 1 — Find the Hidden Error (Найди ошибку)",
      "section_description": "(Развивает внимание и чувство языка)",
      "questions": [
        {
          "type": "multiple_choice",
          "question_text": "Choose the correct sentence:",
          "options": [
            "A) неправильный вариант",
            "B) правильный вариант", 
            "C) неправильный вариант"
          ],
          "correct_answer": "B",
          "explanation": "💡 Rule: объяснение правила"
        }
      ]
    },
    {
      "section_title": "✍️ Часть 2 — Spot & Fix (Исправь как носитель)",
      "section_description": "(Развивает активное воспроизведение)",
      "questions": [
        {
          "type": "text_input",
          "question_text": "Fix the sentence:",
          "wrong_example": "❌ неправильное предложение",
          "input_prompt": "✅ ______________________________",
          "tip": "💬 Tip: краткая подсказка",
          "correct_answer": "правильное предложение",
          "explanation": "🧩 Answer: правильное предложение ✅"
        }
      ]
    },
    {
      "section_title": "💬 Часть 3 — Mini-dialogs (Диалоги в действии)",
      "section_description": "(Закрепляет грамматику в контексте общения — как в IELTS Speaking)",
      "questions": [
        {
          "type": "multiple_choice",
          "question_text": "— Вопрос диалога?\\n— I ______ ответ.",
          "options": [
            "A) неправильный",
            "B) неправильный", 
            "C) правильный",
            "D) неправильный"
          ],
          "correct_answer": "C",
          "explanation": "💡 Rule: объяснение правила"
        }
      ]
    }
  ]
}

КРИТИЧЕСКИ ВАЖНО:
- Все вопросы должны быть основаны на РЕАЛЬНЫХ ошибках из анализа пользователя
- Используй точные фрагменты из текста пользователя в вопросах
- В Find Hidden Error: правильный вариант помечай ✅
- В Spot & Fix: ТОЛЬКО конкретные грамматические ошибки (артикли, времена, предлоги). НЕ стилистические улучшения!
- В Spot & Fix: исправление должно быть ОДНО И ОЧЕВИДНОЕ (добавить артикль, изменить форму глагола)
- В Spot & Fix: показывай ❌ неправильный пример из текста пользователя
- В Mini-dialogs: создавай короткие диалоги с ГРАММАТИЧЕСКИМИ пропусками (времена, артикли, предлоги)
- В Mini-dialogs: НЕ синонимы! Только четкие грамматические различия (was/were, much/many, a/an)
- Объяснения ОБЯЗАТЕЛЬНО начинай с "💡 Rule:" и делай детальными с конкретными примерами
- НИКОГДА не пиши простые объяснения типа "используйте правильную форму"
- КАЖДЫЙ вопрос должен иметь ЛОГИЧНЫЕ варианты ответов с ОЧЕВИДНЫМИ различиями
- Объяснение должно четко показывать ПОЧЕМУ выбранный ответ правильный
- Примеры хороших объяснений: "💡 Rule: Before singular countable nouns → always a/an." или "💡 Rule: Many/much/a few — many + plural countable (many books), much + uncountable (much water), a few + plural countable (a few books)."
- Примеры ПРАВИЛЬНЫХ Spot & Fix: "go for walk" → "go for a walk", "I have learn" → "I have learned", "he don't like" → "he doesn't like"
- Примеры НЕПРАВИЛЬНЫХ Spot & Fix: "funny videos" → "humorous clips" (это стилистика, не грамматика!)
- Примеры ПРАВИЛЬНЫХ Mini-dialogs: "I _____ yesterday" A)go B)went C)going (грамматика времен)
- Примеры НЕПРАВИЛЬНЫХ Mini-dialogs: "_____ videos" A)Funny B)Humorous C)Enjoyable (это лексика, не грамматика!)
- НЕ создавай вопросы где все варианты выглядят правильными или неправильными
- ЗАПРЕЩЕНО: вопросы на синонимы, лексику, стиль ("funny vs humorous")
- ОБЯЗАТЕЛЬНО: только грамматические различия с одним четким правильным ответом
- ВОЗВРАЩАЙ ТОЛЬКО JSON БЕЗ ДОПОЛНИТЕЛЬНОГО ТЕКСТА!`;

    // Получаем старые вопросы для повторения
    const oldQuestions = await getOldQuestionsForRepeat(ctx.from.id);
    
    // Подготавливаем информацию об ошибках для GPT
    let errorsInfo = 'Найденные ошибки пользователя:\n';
    analysisErrors.forEach((error, index) => {
      errorsInfo += `${index + 1}. ${error.title}\n`;
      if (error.examples && error.examples.length > 0) {
        error.examples.forEach(example => {
          errorsInfo += `   ❌ ${example.from}\n   ✅ ${example.to}\n`;
        });
      }
      errorsInfo += `   Правило: ${error.rule}\n\n`;
    });
    
    // Добавляем информацию о старых вопросах
    if (oldQuestions && oldQuestions.length > 0) {
      errorsInfo += '\n\nСтарые вопросы для повторения:\n';
      oldQuestions.forEach((q, index) => {
        errorsInfo += `${index + 1}. ${q.questionText}\n`;
        if (q.options) {
          errorsInfo += `   Варианты: ${q.options}\n`;
        }
        errorsInfo += `   Правильный ответ: ${q.correctAnswer}\n`;
        errorsInfo += `   Объяснение: ${q.explanation}\n\n`;
      });
    }

    const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: quizPrompt },
        { role: 'user', content: errorsInfo }
      ],
      temperature: 0.7,
      max_tokens: 5000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    let quizResponse = gptRes.data.choices[0].message.content.trim();
    
    // Парсим JSON ответ
    let quizData;
    try {
      quizData = JSON.parse(quizResponse);
    } catch (e1) {
      try {
        const jsonMatch = quizResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          quizData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('JSON not found');
        }
      } catch (e2) {
        console.error('Failed to parse quiz response:', quizResponse);
        await ctx.reply('❌ Произошла ошибка при создании теста. Попробуйте еще раз.');
        return;
      }
    }

    // Сохраняем тест в сессию и запускаем
    session.currentQuiz = {
      sections: quizData.quiz_sections,
      currentSectionIndex: 0,
      currentQuestionIndex: 0,
      score: 0,
      totalQuestions: 0,
      answers: []
    };

    // Подсчитываем общее количество вопросов
    quizData.quiz_sections.forEach(section => {
      session.currentQuiz.totalQuestions += section.questions.length;
    });

    // Запускаем тест
    await startQuiz(ctx, session);

  } catch (error) {
    console.error('Error generating personalized quiz:', error);
    await ctx.reply('❌ Произошла ошибка при создании персонального теста.');
  }
}

// Функция запуска интерактивного теста
async function startQuiz(ctx, session) {
  const quiz = session.currentQuiz;
  const currentSection = quiz.sections[quiz.currentSectionIndex];
  const currentQuestion = currentSection.questions[quiz.currentQuestionIndex];
  
  // Показываем заголовок секции (только для первого вопроса в секции)
  if (quiz.currentQuestionIndex === 0) {
    let sectionMessage = `${currentSection.section_title}\n\n`;
    sectionMessage += `${currentSection.section_description}\n\n`;
    await ctx.reply(sectionMessage);
  }
  
  // Показываем вопрос
  await showQuizQuestion(ctx, session, currentQuestion);
}

// Функция отображения вопроса теста
async function showQuizQuestion(ctx, session, question) {
  const quiz = session.currentQuiz;
  const questionNumber = quiz.answers.length + 1;
  
  let message = `❓ <b>Вопрос ${questionNumber}/${quiz.totalQuestions}</b>\n\n`;
  
  if (question.type === 'multiple_choice') {
    message += `${question.question_text}\n\n`;
    question.options.forEach(option => {
      message += `${option}\n`;
    });
    
    // Создаем кнопки A, B, C, D
    const keyboard = new Keyboard();
    const letters = ['A', 'B', 'C', 'D'];
    letters.slice(0, question.options.length).forEach(letter => {
      keyboard.text(letter);
    });
    
    await ctx.reply(message, { 
      parse_mode: 'HTML',
      reply_markup: keyboard.row().oneTime().resized()
    });
    
  } else if (question.type === 'text_input') {
    message += `${question.question_text}\n\n`;
    message += `${question.wrong_example}\n`;
    message += `${question.input_prompt}\n`;
    message += `${question.tip}`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    await ctx.reply('💬 Напишите исправленное предложение:');
  }
  
  // Сохраняем текущий вопрос для обработки ответа
  session.waitingForQuizAnswer = {
    question: question,
    type: question.type
  };
}

// Функция обработки ответа пользователя на вопрос теста
async function handleQuizAnswer(ctx, session, userAnswer) {
  const waitingFor = session.waitingForQuizAnswer;
  const question = waitingFor.question;
  const quiz = session.currentQuiz;
  
  let isCorrect = false;
  let feedbackMessage = '';
  
  if (waitingFor.type === 'multiple_choice') {
    // Обработка выбора A/B/C/D
    const selectedLetter = userAnswer.toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(selectedLetter)) {
      isCorrect = selectedLetter === question.correct_answer;
      
      if (isCorrect) {
        feedbackMessage = `✅ <b>Правильно!</b>\n\n${question.explanation}`;
        quiz.score++;
      } else {
        feedbackMessage = `❌ <b>Неправильно!</b>\n\n`;
        feedbackMessage += `🔸 <b>Вы выбрали:</b> ${selectedLetter}\n`;
        feedbackMessage += `🔸 <b>Правильный ответ:</b> ${question.correct_answer}\n\n`;
        feedbackMessage += `${question.explanation}`;
      }
    } else {
      await ctx.reply('❌ Пожалуйста, выберите правильный вариант: A, B, C или D');
      return;
    }
    
  } else if (waitingFor.type === 'text_input') {
    // Обработка текстового ввода
    const userText = userAnswer.toLowerCase().trim();
    const correctText = question.correct_answer.toLowerCase().trim();
    
    // Строгая проверка - только точное совпадение (допускаем незначительные различия в пунктуации)
    const normalizeText = (text) => text.replace(/[.,!?;]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedUser = normalizeText(userText);
    const normalizedCorrect = normalizeText(correctText);
    
    isCorrect = normalizedUser === normalizedCorrect;
    
    if (isCorrect) {
      feedbackMessage = `✅ <b>Правильно!</b>\n\n${question.explanation}`;
      quiz.score++;
    } else {
      feedbackMessage = `❌ <b>Неправильно!</b>\n\n`;
      feedbackMessage += `🔸 <b>Ваш ответ:</b> ${userAnswer}\n`;
      feedbackMessage += `🔸 <b>Правильный ответ:</b> ${question.correct_answer}\n\n`;
      feedbackMessage += `${question.explanation}\n\n`;
      
      // Добавляем конкретную ошибку если можем определить
      if (userText.includes('had learn')) {
        feedbackMessage += `💡 <b>Ошибка:</b> "had learn" неверно. Используйте Present Perfect: "have learned"`;
      } else if (userText.includes('have learn ')) {
        feedbackMessage += `💡 <b>Ошибка:</b> После "have" нужна форма Past Participle: "learned", а не "learn"`;
      } else {
        feedbackMessage += `💡 <b>Подсказка:</b> Обратите внимание на грамматическую структуру предложения`;
      }
    }
  }
  
  // Показываем результат ответа
  const replyOptions = { parse_mode: 'HTML' };
  
  // Для text_input вопросов убираем клавиатуру после обратной связи
  if (waitingFor.type === 'text_input') {
    replyOptions.reply_markup = { remove_keyboard: true };
  }
  
  await ctx.reply(feedbackMessage, replyOptions);
  
  // Сохраняем ответ
  quiz.answers.push({
    question: question.question_text,
    userAnswer: userAnswer,
    correct: isCorrect,
    correctAnswer: question.correct_answer
  });
  
  // Сохраняем вопрос в базу данных для будущих повторений
  await saveQuizQuestion(ctx.from.id, question);
  
  // Переходим к следующему вопросу
  delete session.waitingForQuizAnswer;
  setTimeout(() => {
    nextQuizQuestion(ctx, session);
  }, 2000);
}

// Переход к следующему вопросу или завершение теста
async function nextQuizQuestion(ctx, session) {
  const quiz = session.currentQuiz;
  
  // Увеличиваем индекс вопроса
  quiz.currentQuestionIndex++;
  
  // Проверяем, закончились ли вопросы в текущей секции
  const currentSection = quiz.sections[quiz.currentSectionIndex];
  if (quiz.currentQuestionIndex >= currentSection.questions.length) {
    // Переходим к следующей секции
    quiz.currentSectionIndex++;
    quiz.currentQuestionIndex = 0;
    
    // Проверяем, закончились ли все секции
    if (quiz.currentSectionIndex >= quiz.sections.length) {
      // Тест завершен
      await finishQuiz(ctx, session);
      return;
    }
  }
  
  // Показываем следующий вопрос
  await startQuiz(ctx, session);
}

// Завершение теста и показ результатов
async function finishQuiz(ctx, session) {
  const quiz = session.currentQuiz;
  const percentage = Math.round((quiz.score / quiz.totalQuestions) * 100);
  
  let resultMessage = `🎯 <b>Тест завершен!</b>\n\n`;
  resultMessage += `📊 <b>Ваш результат:</b> ${quiz.score}/${quiz.totalQuestions} (${percentage}%)\n\n`;
  
  if (percentage >= 80) {
    resultMessage += `🎉 <b>Отличная работа!</b> Вы хорошо усвоили материал.`;
  } else if (percentage >= 60) {
    resultMessage += `👍 <b>Хорошо!</b> Есть над чем поработать, но прогресс заметен.`;
  } else {
    resultMessage += `💪 <b>Продолжайте практиковаться!</b> Повторение - мать учения.`;
  }
  
  await ctx.reply(resultMessage, { 
    parse_mode: 'HTML',
    reply_markup: { remove_keyboard: true }
  });
  
  // Переходим к следующему этапу (этап 3)
  setTimeout(() => {
    session.smartRepeatStage = 3;
    delete session.currentQuiz;
    ctx.reply('🧠 <b>Умное повторение - Этап 3/5</b>\n<b>Знаю/Не знаю</b>\n\nПереходим к быстрой оценке слов...', {
      reply_markup: { remove_keyboard: true }
    });
    startSmartRepeatStage3(ctx, session);
  }, 3000);
}

// Получение 1-2 старых вопросов для повторения
async function getOldQuestionsForRepeat(telegramId) {
  try {
    const oldQuestions = await prisma.$queryRaw`
      SELECT "questionType", "questionText", "options", "correctAnswer", "explanation"
      FROM "quiz_questions" 
      WHERE "telegramId" = ${telegramId} 
        AND "lastAsked" < CURRENT_DATE - INTERVAL '7 days'
      ORDER BY RANDOM()
      LIMIT 2
    `;
    return oldQuestions;
  } catch (error) {
    console.error('Error getting old questions:', error);
    return [];
  }
}

// Сохранение вопроса в базе данных для будущих повторений
async function saveQuizQuestion(telegramId, question) {
  try {
    const questionText = question.question_text || question.wrong_example || '';
    const options = question.options ? JSON.stringify(question.options) : null;
    const correctAnswer = question.correct_answer || '';
    const explanation = question.explanation || '';
    const questionType = question.type === 'multiple_choice' ? 'multiple_choice' : 'text_input';
    
    await prisma.$executeRaw`
      INSERT INTO "quiz_questions" 
      ("telegramId", "questionType", "questionText", "options", "correctAnswer", "explanation", "timesAsked", "lastAsked")
      VALUES (${telegramId}, ${questionType}, ${questionText}, ${options}, ${correctAnswer}, ${explanation}, 1, CURRENT_TIMESTAMP)
    `;
  } catch (error) {
    console.error('Error saving quiz question:', error);
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
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
    // НЕ запускаем квиз здесь - он запустится после добавления слов в словарь
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
  
  let message = `📝 <b>Упражнение ${currentIndex + 1}/${drills.length}</b>\n`;
  message += `Правило: ${drill.rule || currentDrill.errorRule}\n\n`;
  message += `Заполните пропуск:\n<code>${drill.question}</code>\n\n`;
  message += `👉 Введите ${drill.words_count || 1} ${drill.words_count === 1 ? 'слово' : 'слова'}.`;
  
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
    let hintMessage = `💡 <b>Подсказка:</b>\n${drill.hint || drill.explanation}\n\n`;
    hintMessage += `Заполните пропуск:\n<code>${drill.question}</code>`;
    
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
      explanation: drill.hint || drill.explanation
    });
    
    session.currentDrillIndex++;
    await showCurrentWritingDrill(ctx, session);
    return;
  }
  
  // Проверяем ответ
  const normalizedAnswer = userAnswer.trim().toLowerCase();
  const expectedAnswer = (drill.correct_answer || drill.expected).toLowerCase();
  const acceptedAnswers = drill.accepted.map(ans => ans.toLowerCase());
  
  const isCorrect = normalizedAnswer === expectedAnswer || acceptedAnswers.includes(normalizedAnswer);
  
  // Записываем результат
  session.drillResults.push({
    drillIndex: currentIndex,
    userAnswer: userAnswer,
    correct: isCorrect,
    skipped: false,
    explanation: drill.hint || drill.explanation,
    expectedAnswer: drill.correct_answer || drill.expected
  });
  
  // Показываем результат
  let resultMessage;
  if (isCorrect) {
    resultMessage = `✅ Правильно: ${drill.correct_answer || drill.expected}`;
  } else {
    resultMessage = `❌ Неверно\n`;
    resultMessage += `Правильный ответ: ${drill.correct_answer || drill.expected}\n`;
    resultMessage += `Твоё: ${userAnswer}\n`;
    if (drill.hint) {
      resultMessage += `Подсказка: ${drill.hint}`;
    }
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
    session.smartRepeatStage = 4;
    
    // Сразу запускаем ручной ввод предложений
    await startManualSentenceInput(ctx, session);
  } else {
    // Нет слов для предложений - используем слова из smartRepeatWords
    const fallbackWords = session.smartRepeatWords || [];
    if (fallbackWords.length > 0) {
      const wordsForSentences = fallbackWords.slice(0, 7);
      
      session.sentenceTaskWords = wordsForSentences;
      session.sentenceTaskIndex = 0;
      session.smartRepeatStage = 4;
      
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
  const CHUNK_SIZE = 2; // Уменьшаем размер чанка для более надежной обработки
  let allAnalysis = [];
  for (let chunkStart = 0; chunkStart < answers.length; chunkStart += CHUNK_SIZE) {
    const chunk = answers.slice(chunkStart, chunkStart + CHUNK_SIZE);
    console.log(`Processing chunk ${Math.floor(chunkStart / CHUNK_SIZE) + 1}: sentences ${chunkStart + 1}-${chunkStart + chunk.length}`);
    console.log(`Chunk words:`, chunk.map(item => item.word));
    
    const sentencesText = chunk.map((item, index) =>
      `${chunkStart + index + 1}. ID: "${item.id}"\n   Слово: "${item.word}" (${item.translation})\n   Предложение: "${item.sentence}"`
    ).join('\n\n');

    // Упрощенный промпт для более надежной работы
    const prompt = `Проанализируй ВСЕ ${chunk.length} предложения на английском языке.

ПРЕДЛОЖЕНИЯ ДЛЯ АНАЛИЗА:
${sentencesText}

ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ:
1. Проанализируй КАЖДОЕ из ${chunk.length} предложений
2. Для каждого предложения укажи точный ID из списка выше
3. Если предложение правильное - отметь correct: true
4. Если есть ошибки - отметь correct: false и объясни их
5. Ответ должен содержать ровно ${chunk.length} элементов в массиве detailed_analysis

ВАЖНО: 
- Ответ должен быть ТОЛЬКО в JSON формате
- Все объяснения на русском языке
- НЕ пропускай ни одного предложения!

ФОРМАТ ОТВЕТА (JSON):
{
  "detailed_analysis": [
    {
      "id": "точный_ID_предложения",
      "word": "анализируемое_слово",
      "sentence": "предложение_студента",
      "correct": true/false,
      "error_analysis": "объяснение ошибки (если correct: false)",
      "corrected_version": "исправленное предложение (если correct: false)",
      "why_correct": "объяснение правильности (если correct: true)",
      "clever_trick": "совет для запоминания",
      "rule_explanation": "грамматическое правило",
      "practice_examples": ["пример 1 со словом", "пример 2 со словом"]
    }
  ]
}`;

    try {
      console.log(`=== MAKING OPENAI REQUEST FOR CHUNK ${Math.floor(chunkStart / CHUNK_SIZE) + 1} ===`);
      console.log(`Prompt length: ${prompt.length} characters`);
      console.log(`Words in chunk: ${chunk.map(item => item.word).join(', ')}`);
      
      const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 2000
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 секунд таймаут
      });
      
      console.log(`OpenAI API response status: ${gptRes.status}`);
      console.log(`Response usage:`, gptRes.data.usage);
      
      let answer = gptRes.data.choices[0].message.content;
      console.log(`Raw OpenAI response length: ${answer.length}`);
      console.log(`Raw OpenAI response preview: ${answer.substring(0, 200)}...`);
      
      const match = answer.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('No JSON found in OpenAI response');
        console.error('Full response:', answer);
        throw new Error('AI не вернул JSON.');
      }
      
      console.log(`Extracted JSON length: ${match[0].length}`);
      console.log(`JSON preview: ${match[0].substring(0, 200)}...`);
      let analysis;
      try {
        analysis = JSON.parse(match[0]);
        console.log(`Successfully parsed analysis for chunk, got ${analysis.detailed_analysis?.length || 0} evaluations`);
        console.log(`Expected ${chunk.length} evaluations, got ${analysis.detailed_analysis?.length || 0}`);
      } catch (parseError) {
        console.error('JSON parsing failed for detailed sentence analysis:', parseError);
        console.error('JSON that failed to parse:', match[0]);
        console.error('Parse error details:', parseError.message);
        
        // Попробуем исправить обрезанный JSON
        let jsonToFix = match[0];
        if (!jsonToFix.endsWith('}')) {
          console.log('Trying to fix incomplete JSON...');
          // Простая попытка исправить неполный JSON
          if (jsonToFix.includes('"detailed_analysis"')) {
            jsonToFix = jsonToFix + ']}';
            try {
              analysis = JSON.parse(jsonToFix);
              console.log('Successfully fixed incomplete JSON!');
            } catch (fixError) {
              console.error('Failed to fix JSON:', fixError.message);
              analysis = null;
            }
          }
        }
        
        if (!analysis) {
          console.log('Creating fallback analysis for all sentences in chunk');
          // Создаем fallback анализ с упрощённой структурой
          analysis = {
            detailed_analysis: chunk.map(item => ({
              id: item.id,
              word: item.word,
              sentence: item.sentence,
              correct: false,
              error_analysis: "OpenAI API временно недоступен или вернул некорректный ответ.",
              corrected_version: "Попробуйте еще раз через несколько минут",
              clever_trick: "💡 Попробуйте упростить предложение или использовать другие слова",
              rule_explanation: "Анализ будет доступен при повторной отправке",
              practice_examples: [
                `Try using the word "${item.word}" in a simple sentence.`,
                `Practice with "${item.word}" in everyday conversation.`
              ]
            }))
          };
        }
      }
      // Проверяем корректность новой структуры ответа
      if (!analysis.detailed_analysis || !Array.isArray(analysis.detailed_analysis)) {
        console.error('Invalid analysis structure - no detailed_analysis array');
        throw new Error('AI вернул некорректную структуру детального анализа');
      }
      
      // Валидируем наличие ID в каждом элементе анализа
      const chunkIds = chunk.map(item => item.id);
      for (const item of analysis.detailed_analysis) {
        if (!item.id) {
          console.error('Missing ID in analysis item:', item);
          // Пытаемся найти подходящий ID по слову
          const matchingChunkItem = chunk.find(c => c.word === item.word);
          if (matchingChunkItem) {
            item.id = matchingChunkItem.id;
            console.log(`Assigned missing ID ${item.id} to word "${item.word}"`);
          } else {
            // Добавляем fallback ID если его нет
            item.id = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log(`Created fallback ID ${item.id} for word "${item.word}"`);
          }
        } else if (!chunkIds.includes(item.id)) {
          console.error(`Analysis has invalid ID "${item.id}" for word "${item.word}", not in chunk:`, chunkIds);
          // Пытаемся найти правильный ID по слову
          const matchingChunkItem = chunk.find(c => c.word === item.word);
          if (matchingChunkItem) {
            console.log(`Correcting ID from "${item.id}" to "${matchingChunkItem.id}" for word "${item.word}"`);
            item.id = matchingChunkItem.id;
          }
        }
      }
      
      // Убеждаемся, что все предложения из чанка получили анализ
      if (analysis.detailed_analysis.length !== chunk.length) {
        console.error(`Mismatch: expected ${chunk.length} detailed evaluations, got ${analysis.detailed_analysis.length}`);
        console.error(`Chunk words:`, chunk.map(item => item.word));
        console.error(`Analysis words:`, analysis.detailed_analysis.map(item => item.word));
        
        // Находим ТОЧНО какие предложения пропущены по ID
        const analyzedIds = new Set(analysis.detailed_analysis.map(a => a.id));
        const missingItems = chunk.filter(item => !analyzedIds.has(item.id));
        
        console.log(`Missing ${missingItems.length} analyses for IDs:`, missingItems.map(item => `${item.id} (${item.word})`));
        
        // Добавляем fallback только для реально пропущенных предложений
        for (const missingItem of missingItems) {
          console.log(`Adding fallback analysis for missing sentence: word="${missingItem.word}", id="${missingItem.id}"`);
          analysis.detailed_analysis.push({
            id: missingItem.id,
            word: missingItem.word,
            sentence: missingItem.sentence,
            correct: false,
            error_analysis: "OpenAI API не вернул анализ для этого предложения.",
            corrected_version: "Попробуйте переформулировать предложение",
            clever_trick: "💡 Используйте более простые конструкции",
            rule_explanation: "Анализ будет доступен при повторной отправке",
            practice_examples: [
              `Try using the word "${missingItem.word}" in a simple sentence.`,
              `Practice with "${missingItem.word}" in everyday conversation.`
            ]
          });
        }
      }
      // GPT теперь сам возвращает ID в detailed_analysis
      allAnalysis = allAnalysis.concat(analysis.detailed_analysis);
      
      // Добавляем задержку между запросами чтобы не перегружать API
      if (chunkStart + CHUNK_SIZE < answers.length) {
        console.log('Waiting 2 seconds before next OpenAI request...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error('Error in AI sentence analysis:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      // Проверим, не истек ли таймаут или есть ли проблемы с сетью
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        console.log('Request timeout - OpenAI API is slow, using fallback');
      } else if (error.response?.status === 429) {
        console.log('Rate limit exceeded - OpenAI API rate limit, using fallback');
      } else if (error.response?.status >= 500) {
        console.log('OpenAI server error - using fallback');
      }
      
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

// Функция запуска этапа 4 умного повторения (составление предложений)
async function startSmartRepeatStage4(ctx, session) {
  try {
    console.log('=== STARTING SMART REPEAT STAGE 4 ===');
    
    session.smartRepeatStage = 4;
    session.step = 'sentence_task';
    
    // Пересчитываем слова для умного повторения на случай если прошло время
    const userWords = await getWords(session.profile);
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
    const words = sortedWords.slice(0, 20);
    
    // Обновляем слова в сессии
    session.smartRepeatWords = words;
    
    if (words.length === 0) {
      console.log('No words for stage 4, completing smart repeat');
      return await completeSmartRepeat(ctx, session);
    }
    
    // Берем первые 5 слов для составления предложений
    const wordsForSentences = words.slice(0, 5);
    session.sentenceTaskWords = wordsForSentences;
    session.sentenceTaskIndex = 0;
    
    await ctx.reply(
      `🧠 <b>Умное повторение - Этап 4/5</b>\n` +
      `📝 <b>Составление предложений</b>\n\n` +
      `Составьте предложение на английском языке со словом:\n\n` +
      `📖 <b>"${wordsForSentences[0].word}"</b> — ${wordsForSentences[0].translation}\n\n` +
      `💡 Ваше предложение должно показать, что вы понимаете значение слова.`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    console.error('Error in startSmartRepeatStage4:', error);
    await ctx.reply('❌ Ошибка запуска этапа 4. Переходим к следующему этапу.');
    return await startSmartRepeatStage5(ctx, session);
  }
}

// Функция запуска этапа 5 умного повторения (текстовое задание)
async function startSmartRepeatStage5(ctx, session) {
  try {
    console.log('=== SMART REPEAT STAGE 5 START ===');
    console.log('User ID:', ctx.from.id);
    console.log('Session smartRepeatWords:', session.smartRepeatWords?.length || 0);
    console.log('Session stage1Words:', session.stage1Words);
    
    // Используем слова из стадии 1 вместо пересчета по приоритету
    let words = [];
    
    if (session.stage1Words && session.stage1Words.length > 0) {
      console.log('Using stage 1 words for stage 5:', session.stage1Words);
      
      // Получаем полную информацию о словах из стадии 1
      const userWords = await getWords(session.profile);
      const stage1WordsData = userWords.filter(word => session.stage1Words.includes(word.word));
      
      // Перемешиваем слова и берем случайные 15 (или меньше если слов недостаточно)
      const shuffled = [...stage1WordsData].sort(() => Math.random() - 0.5);
      words = shuffled.slice(0, Math.min(15, shuffled.length));
      
      console.log('Selected words for story task:', words.map(w => w.word));
    } else {
      console.log('No stage1Words found, falling back to priority-based selection');
      
      // Fallback: используем старую логику если нет слов из стадии 1
      const userWords = await getWords(session.profile);
      const now = new Date();
      const DAY_MS = 24 * 60 * 60 * 1000;
      
      function calculatePriority(word) {
        const lastUpdate = word.updatedAt || word.createdAt;
        const daysSinceUpdate = (now - lastUpdate) / DAY_MS;
        
        let intervalDays;
        if (word.correct <= 1) intervalDays = 1;
        else if (word.correct === 2) intervalDays = 2;
        else if (word.correct === 3) intervalDays = 4;
        else if (word.correct === 4) intervalDays = 7;
        else if (word.correct === 5) intervalDays = 14;
        else intervalDays = 30;
        
        const overdue = Math.max(0, daysSinceUpdate - intervalDays);
        return overdue + (6 - Math.min(word.correct, 5)) * 2;
      }
      
      const sortedWords = userWords
        .map(w => ({ ...w, priority: calculatePriority(w) }))
        .sort((a, b) => b.priority - a.priority);
      
      words = sortedWords.slice(0, 20);
    }
    
    // Обновляем слова в сессии
    session.smartRepeatWords = words;
    
    if (words.length === 0) {
      console.log('ERROR: No words found for smart repeat stage 5');
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

    // Переходим к этапу 5 - текстовое задание  
    session.smartRepeatStage = 5;
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
  const todayString = getLocalDateGMT5();
  session.lastSmartRepeatDate = todayString;
  
  console.log(`DEBUG SMART REPEAT: User ${ctx.from.id} completed all smart repeat stages`);
  console.log(`  - Setting lastSmartRepeatDate to: "${todayString}"`);
  
  // Сохраняем изменения в базу данных
  if (session.profile) {
    await saveUserSession(ctx.from.id, session.profile, session);
    console.log(`  - Saved to database for profile: ${session.profile}`);
    
    // Записываем завершение умного повторения в денежную систему
    await recordSmartRepeatCompletion(session.profile);
  }
  
  // Очищаем данные сессии и освобождаем память
  session.step = 'main_menu';
  session.smartRepeatStage = undefined;
  
  // Полная очистка всех данных умного повторения для экономии памяти
  cleanupSessionData(session, 'all');
  
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
initializeDatabase().then(async () => {
  console.log('🚀 Starting bot...');
  
  // Инициализируем денежную систему
  await initializeMoneySystem();
  
  bot.start();
}).catch((error) => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});

// Функция завершения умного повторения
async function finishSmartRepeat(ctx, session) {
  console.log(`DEBUG: Finishing smart repeat for user ${ctx.from.id}`);
  
  // Отмечаем что умное повторение пройдено сегодня
  const todayString = getLocalDateGMT5();
  session.lastSmartRepeatDate = todayString;
  
  console.log(`DEBUG SMART REPEAT: User ${ctx.from.id} completed smart repeat (finishSmartRepeat)`);
  console.log(`  - Setting lastSmartRepeatDate to: "${todayString}"`);
  
  // Сохраняем изменения в базу данных
  if (session.profile) {
    await saveUserSession(ctx.from.id, session.profile, session);
    console.log(`  - Saved to database for profile: ${session.profile}`);
    
    // Записываем завершение умного повторения в денежную систему
    await recordSmartRepeatCompletion(session.profile);
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

// Обработчик callback query для кнопок добавления слов в словарь
bot.on('callback_query:data', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const session = sessions[userId];
    
    console.log('DEBUG CALLBACK:', { userId, data, hasSession: !!session });
    
    if (!session) {
      await ctx.answerCallbackQuery('Сессия истекла. Начните заново.');
      return;
    }
    
    // Обработка кнопок добавления/пропуска слов в словарь
    if (data.startsWith('add_vocab_') || data.startsWith('skip_vocab_')) {
      const wordIndex = parseInt(data.split('_')[2]);
      
      if (wordIndex !== session.currentWordIndex) {
        await ctx.answerCallbackQuery('Устаревшая кнопка. Попробуйте еще раз.');
        return;
      }
      
      const currentWord = session.vocabularyWords[wordIndex];
      
      if (data.startsWith('add_vocab_')) {
        // Добавляем слово в словарь пользователя
        try {
          console.log('DEBUG: Adding word to dictionary:', currentWord);
          await addWordToUserDictionary(session.profile, currentWord);
          session.addedWordsCount++;
          console.log('DEBUG: Words added count:', session.addedWordsCount);
          await ctx.answerCallbackQuery(`✅ Слово "${currentWord.word}" добавлено в словарь!`);
        } catch (error) {
          console.error('Error adding word to dictionary:', error);
          await ctx.answerCallbackQuery('❌ Ошибка при добавлении слова');
        }
      } else {
        // Пропускаем слово
        await ctx.answerCallbackQuery(`⏭ Слово "${currentWord.word}" пропущено`);
      }
      
      // Переходим к следующему слову
      session.currentWordIndex++;
      
      // Удаляем предыдущее сообщение с кнопками
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.log('Could not delete message:', error.message);
      }
      
      // Показываем следующее слово
      await showNextVocabularyWord(ctx, session);
    }
    
  } catch (error) {
    console.error('Error in callback query handler:', error);
    await ctx.answerCallbackQuery('Произошла ошибка');
  }
});

// Функция добавления слова в словарь пользователя (используем существующую систему)
async function addWordToUserDictionary(profileName, wordData) {
  try {
    // Проверяем, есть ли уже такое слово у пользователя
    const existingWord = await prisma.word.findFirst({
      where: {
        profile: profileName,
        word: wordData.word.toLowerCase()
      }
    });
    
    if (existingWord) {
      console.log(`Word "${wordData.word}" already exists for user ${profileName}`);
      return;
    }
    
    // Добавляем слово в базу данных
    await prisma.word.create({
      data: {
        profile: profileName,
        word: wordData.word.toLowerCase(),
        translation: wordData.translation,
        section: 'stage2_vocab'
      }
    });
    
    console.log(`Added word "${wordData.word}" to dictionary for user ${profileName}`);
    
  } catch (error) {
    console.error('Error in addWordToUserDictionary:', error);
    throw error;
  }
}
