# Добавление универсальной структуры эссе во 2-м этапе умного повторения

## Задача
Добавить подсказку с универсальной структурой эссе во 2-м этапе умного повторения (writing), чтобы пользователь мог использовать готовые фразы и написать текст намного лучше.

## Реализация

### Где добавлено
Функция: `startSmartRepeatStageWriting` (строки 6587-6610)

### Что добавлено
После основного сообщения с темой для написания, через 1.5 секунды отправляется дополнительное сообщение с универсальной структурой эссе.

### Код изменения
```javascript
// Отправляем универсальную структуру эссе как подсказку
setTimeout(async () => {
  await ctx.reply(
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
    `Therefore, it is clear that / Hence, it can be concluded that / Thus, it is evident that __________.`,
    { parse_mode: 'HTML' }
  );
}, 1500);
```

## Структура подсказки

### [Intro] - Введение
- **Позиция**: I strongly believe that / I firmly agree that / There is no doubt that
- **Обзор**: This essay will discuss / aims to examine / will explore

### [Body 1] - Первая основная часть  
- **Начало**: Firstly / To begin with / One major reason is that
- **Объяснение**: This is mainly because / This can be explained by / The main reason for this is that
- **Пример**: For example / For instance / A good illustration of this is

### [Body 2] - Вторая основная часть
- **Переход**: Secondly / In addition / Another important factor is that  
- **Следствие**: As a result / Consequently / This leads to
- **Дополнение**: Furthermore / Moreover / Additionally

### [Conclusion] - Заключение
- **Подведение итогов**: In conclusion / To sum up / Overall
- **Финальная мысль**: Therefore, it is clear that / Hence, it can be concluded that / Thus, it is evident that

## Характеристики
- ✅ **Универсальная** - подходит для всех типов эссе
- ✅ **Короткая задержка** - 1.5 секунды после основного сообщения  
- ✅ **Правильное форматирование** - HTML теги для выделения
- ✅ **Оптимальная длина** - 882 символа (в пределах лимита Telegram)
- ✅ **Четкая структура** - разделение на секции с жирным выделением

## Результат
Теперь каждый пользователь во 2-м этапе умного повторения получает:

1. **Тему для написания** (основное сообщение)
2. **Универсальную структуру эссе** (подсказка через 1.5 сек)
3. **Готовые фразы-связки** для каждой части эссе
4. **Четкое понимание** как структурировать свой текст

Это поможет пользователям писать более качественные тексты с правильной структурой и разнообразными linking words.