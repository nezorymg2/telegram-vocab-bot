-- Создание таблицы user_sessions для persistent storage
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL UNIQUE,
  sessionData TEXT NOT NULL,  -- JSON данные сессии
  lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Создаем индекс для быстрого поиска по userId
CREATE INDEX IF NOT EXISTS idx_user_sessions_userId ON user_sessions(userId);

-- Создаем индекс для очистки старых сессий
CREATE INDEX IF NOT EXISTS idx_user_sessions_lastActivity ON user_sessions(lastActivity);