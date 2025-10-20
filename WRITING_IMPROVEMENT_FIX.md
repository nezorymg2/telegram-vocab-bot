# Исправление проблемы с умным повторением - Stage 2 Writing

## Проблема
Пользователь "затупил при генерации улучшенного текста и выкинуло из умного повторения". Анализ логов показал:

1. **JSON Parse Error**: При генерации улучшенной версии текста произошла ошибка парсинга JSON ответа от OpenAI
2. **Process Interruption**: Из-за `return` в catch блоке весь процесс прерывался
3. **Session State**: Пользователь оставался в состоянии `writing_task` с `smartRepeatStage: 2` без продолжения
4. **Wrong Function Call**: В finishQuiz была ошибка в вызове функции для перехода к stage 3

## Исправления

### 1. Улучшенный парсинг JSON (строки 7074-7117)
```javascript
// Добавлен многоуровневый fallback для парсинга JSON:
// 1. Стандартный JSON.parse()
// 2. Regex extraction + cleanup дублирующихся запятых
// 3. Manual extraction основного текста
// 4. Final fallback с техническим сообщением
```

### 2. Устранение прерывания процесса (строка 7089)
**ДО:**
```javascript
console.error('Failed to parse improvement response:', improvementResponse);
// Fallback - показываем только оригинальный анализ
return; // ❌ Прерывает весь процесс!
```

**ПОСЛЕ:**
```javascript
console.error('Failed to parse improvement response:', improvementResponse);
// Fallback - создаем минимальные данные для продолжения процесса
console.log('Using fallback improvement data due to parsing error');
improvementData = {
  improved_text: "Sorry, couldn't generate improved version due to technical issues.",
  writing_advice: [],
  vocabulary_words: []
};
```

### 3. Обработка ошибок в generateImprovedText (строки 7138-7154)
**ДО:**
```javascript
} catch (error) {
  console.error('Error generating improved version:', error);
  // Не прерываем весь процесс, просто пропускаем улучшенную версию
}
```

**ПОСЛЕ:**
```javascript
} catch (error) {
  console.error('Error generating improved version:', error);
  // Не прерываем весь процесс, продолжаем с тестом по ошибкам
  await ctx.reply('⚠️ Возникла проблема с генерацией улучшенной версии, но продолжаем с тестом по ошибкам.');
  
  // Переходим сразу к тесту по ошибкам
  if (session.stage2_analysis && session.stage2_analysis.errors && session.stage2_analysis.errors.length > 0) {
    setTimeout(() => {
      generatePersonalizedQuiz(ctx, session, session.stage2_analysis.errors);
    }, 1000);
  }
}
```

### 4. Обработка пустых данных в showImprovedVersion (строки 7158-7168)
**ДО:**
```javascript
if (!improved || !improved.improved_text) {
  return; // ❌ Прерывает процесс!
}
```

**ПОСЛЕ:**
```javascript
if (!improved || !improved.improved_text) {
  console.log('No improved text data, proceeding to quiz generation');
  // Если нет улучшенной версии, переходим сразу к тесту
  if (session.stage2_analysis && session.stage2_analysis.errors && session.stage2_analysis.errors.length > 0) {
    setTimeout(() => {
      generatePersonalizedQuiz(ctx, session, session.stage2_analysis.errors);
    }, 1000);
  }
  return;
}
```

### 5. Исправление перехода к Stage 3 (строка 7731)
**ДО:**
```javascript
startSmartRepeatStage2(ctx, session); // ❌ Неправильная функция!
```

**ПОСЛЕ:**
```javascript
startSmartRepeatStage3(ctx, session); // ✅ Правильная функция для stage 3
```

### 6. Добавлено логирование для отслеживания
- Дополнительные логи в generatePersonalizedQuiz
- Логи переходов между этапами
- Детальная информация об ошибках парсинга

## Результат
Теперь процесс умного повторения будет продолжаться даже при ошибках:

1. **JSON ошибки** → fallback данные + продолжение процесса
2. **Отсутствие улучшенной версии** → прямой переход к тесту
3. **Любые другие ошибки** → graceful fallback с уведомлением пользователя
4. **Корректный переход** между этапами умного повторения

Пользователь больше не будет "застревать" в writing_task и всегда сможет продолжить обучение.