const { generateBBCQuestions } = require('./services/bbcService');

async function testSorryEpisode() {
    try {
        console.log('🔍 Тестируем эпизод "How do you say sorry?"...');
        
        const episode = {
            title: 'How do you say sorry?',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250703'
        };
        
        const result = await generateBBCQuestions(episode);
        
        if (result && result.questions) {
            console.log('✅ Успешно получены вопросы:', result.questions.length);
            result.questions.forEach((q, i) => {
                console.log(`\n📊 Вопрос ${i+1}:`);
                console.log(`Текст: ${q.question}`);
                console.log(`Варианты: ${q.options.join(', ')}`);
                console.log(`Правильный ответ: ${q.correct_answer}`);
            });
        } else {
            console.log('❌ Не удалось получить вопросы');
            console.log('Результат:', result);
        }
        
        console.log('\n📜 Vocabulary:');
        if (result && result.vocabulary) {
            if (Array.isArray(result.vocabulary)) {
                result.vocabulary.slice(0, 10).forEach(word => {
                    if (typeof word === 'string') {
                        console.log(`🔤 ${word} - (строка)`);
                    } else if (word && typeof word === 'object') {
                        console.log(`🔤 ${word.word || word.term || 'Неизвестно'} - ${word.translation || word.definition || 'Нет перевода'}`);
                    } else {
                        console.log(`🔤 ${word} - (другой тип: ${typeof word})`);
                    }
                });
            } else {
                console.log('Vocabulary не является массивом:', typeof result.vocabulary);
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
    }
}

testSorryEpisode();
