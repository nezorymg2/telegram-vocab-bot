/**
 * Менеджер очередей для параллельной обработки GPT запросов
 * Ограничивает количество одновременных запросов к OpenAI API
 */

const axios = require('axios');

class GPTQueueManager {
  constructor(maxConcurrent = 4) {
    this.maxConcurrent = maxConcurrent;
    this.activeRequests = 0;
    this.queue = [];
  }

  /**
   * Добавляет запрос в очередь для обработки
   * @param {Object} requestParams - Параметры для GPT запроса (model, messages, etc.)
   * @param {string} userId - ID пользователя для логирования  
   * @param {string} operation - Тип операции для логирования
   * @returns {Promise} - Промис с результатом запроса
   */
  async addToQueue(requestParams, userId, operation) {
    return new Promise((resolve, reject) => {
      const requestItem = {
        requestParams,
        userId,
        operation,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(requestItem);
      console.log(`📝 Added to GPT queue: ${operation} for user ${userId} (queue size: ${this.queue.length})`);
      
      this.processQueue();
    });
  }

  /**
   * Обрабатывает очередь запросов
   */
  async processQueue() {
    // Если достигнут лимит одновременных запросов или очередь пуста
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const requestItem = this.queue.shift();
    this.activeRequests++;

    console.log(`🚀 Processing GPT request: ${requestItem.operation} for user ${requestItem.userId} (active: ${this.activeRequests}/${this.maxConcurrent})`);

    try {
      const startTime = Date.now();
      
      // Выполняем запрос к OpenAI через axios
      const result = await axios.post('https://api.openai.com/v1/chat/completions', 
        requestItem.requestParams, 
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const duration = Date.now() - startTime;
      console.log(`✅ GPT request completed: ${requestItem.operation} for user ${requestItem.userId} in ${duration}ms`);
      requestItem.resolve(result);
      
    } catch (error) {
      console.error(`❌ GPT request failed: ${requestItem.operation} for user ${requestItem.userId}:`, error.message);
      requestItem.reject(error);
      
    } finally {
      this.activeRequests--;
      
      // Продолжаем обработку очереди
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Получить статистику очереди
   */
  getStats() {
    return {
      queueSize: this.queue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * Установить новый лимит одновременных запросов
   */
  setMaxConcurrent(newLimit) {
    this.maxConcurrent = newLimit;
    console.log(`📊 GPT queue max concurrent updated to: ${newLimit}`);
    this.processQueue(); // Может быть можно обработать больше запросов
  }
}

// Создаем глобальный экземпляр менеджера очередей
const gptQueue = new GPTQueueManager(4); // 4 одновременных запроса

/**
 * Обертка для всех запросов к OpenAI API
 * @param {Object} requestParams - Параметры для GPT запроса (model, messages, temperature, etc.)
 * @param {string} userId - ID пользователя
 * @param {string} operation - Описание операции
 * @returns {Promise} - Результат запроса (axios response)
 */
async function makeGPTRequest(requestParams, userId, operation) {
  return gptQueue.addToQueue(requestParams, userId, operation);
}

module.exports = {
  GPTQueueManager,
  gptQueue,
  makeGPTRequest
};