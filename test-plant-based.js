const axios = require('axios');

async function testPlantBasedEpisode() {
    const title = "Are plant-based substitutes healthier than meat?";
    
    console.log(`🔍 Тестируем эпизод: "${title}"`);
    
    // Пробуем разные номера эпизодов
    const possibleEpisodeNumbers = ["250807", "250731", "250724", "250717", "250710", "250703", "250626"];
    
    console.log(`📋 Пробуем номера эпизодов: ${possibleEpisodeNumbers.join(', ')}`);
    
    // Генерируем разные варианты title slug
    const titleVariations = [
        title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_'), // are_plantbased_substitutes_healthier_than_meat
        title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '_').replace(/-/g, '_'), // are_plant_based_substitutes_healthier_than_meat
        'are_plant_based_meat_substitutes_healthier',
        'plant_based_substitutes_healthier_than_meat',
        'are_plant_based_substitutes_healthier'
    ];
    
    console.log(`🔤 Title variations:`, titleVariations);
    
    for (const episodeNumber of possibleEpisodeNumbers) {
        console.log(`\n🔢 Проверяю номер эпизода: ${episodeNumber}`);
        
        for (const titleSlug of titleVariations) {
            const worksheetUrls = [
                `https://downloads.bbc.co.uk/learningenglish/features/6min/${episodeNumber}_6_minute_english_${titleSlug}_worksheet.pdf`,
                `https://downloads.bbc.co.uk/learningenglish/features/6min/${episodeNumber}_6_minute_english_${titleSlug}__worksheet.pdf`
            ];
            
            for (const url of worksheetUrls) {
                try {
                    const response = await axios.head(url);
                    console.log(`✅ НАЙДЕН! Episode: ${episodeNumber}, Pattern: ${titleSlug}`);
                    console.log(`📄 URL: ${url}`);
                    return; // Найден правильный URL
                } catch (error) {
                    // Молчаливая обработка 404
                }
            }
        }
    }
    
    console.log('❌ Не удалось найти правильный URL');
}

testPlantBasedEpisode();
