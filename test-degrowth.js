/**
 * Test Degrowth Episode
 * Test the specific episode that failed in the bot
 */

const { extractVocabularyFromEpisode } = require('./services/bbcQuestions-simple');

async function testDegrowthEpisode() {
    console.log('🧪 Testing Degrowth Episode...\n');
    
    // Try different possible URLs for the degrowth episode
    const possibleUrls = [
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250807',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250724',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250717',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250710',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241219',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241212',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241205'
    ];
    
    console.log('🔍 Searching for "What is degrowth?" episode...\n');
    
    for (const url of possibleUrls) {
        try {
            console.log(`Testing: ${url}`);
            
            // First, check if the page exists and what title it has
            const axios = require('axios');
            const cheerio = require('cheerio');
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const $ = cheerio.load(response.data);
            const title = $('h1').first().text().trim();
            
            console.log(`  📄 Page exists, title: "${title}"`);
            
            // Check if this is the degrowth episode
            if (title.toLowerCase().includes('degrowth')) {
                console.log('🎯 FOUND DEGROWTH EPISODE!');
                
                // Test vocabulary extraction
                console.log('  🔤 Testing vocabulary extraction...');
                const vocabularyTerms = await extractVocabularyFromEpisode(url);
                
                if (vocabularyTerms && vocabularyTerms.length > 0) {
                    console.log(`  ✅ SUCCESS! Found ${vocabularyTerms.length} vocabulary terms:`);
                    vocabularyTerms.forEach((term, i) => {
                        console.log(`     ${i+1}. ${term.term} - ${term.definition}`);
                    });
                    
                    return {
                        url: url,
                        title: title,
                        vocabulary: vocabularyTerms,
                        success: true
                    };
                } else {
                    console.log('  ❌ No vocabulary found');
                }
            } else {
                console.log(`  ℹ️ Different episode: "${title}"`);
            }
            
        } catch (error) {
            console.log(`  ❌ Failed: ${error.message}`);
        }
    }
    
    console.log('\n🔍 Episode not found in recent URLs. Let me search the archive...');
    
    try {
        // Search BBC archive for degrowth episode
        const archiveUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english';
        
        console.log('📡 Searching BBC archive...');
        
        const response = await axios.get(archiveUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // Look for degrowth episode
        const degrowthLinks = [];
        
        $('a').each((i, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().toLowerCase();
            
            if (href && href.includes('ep-') && text.includes('degrowth')) {
                const fullUrl = href.startsWith('http') ? href : `https://www.bbc.co.uk${href}`;
                degrowthLinks.push({
                    url: fullUrl,
                    text: text.trim()
                });
            }
        });
        
        if (degrowthLinks.length > 0) {
            console.log(`🎯 Found ${degrowthLinks.length} degrowth episode(s) in archive:`);
            
            for (const link of degrowthLinks) {
                console.log(`\n📚 Testing: ${link.text}`);
                console.log(`   URL: ${link.url}`);
                
                try {
                    const vocabularyTerms = await extractVocabularyFromEpisode(link.url);
                    
                    if (vocabularyTerms && vocabularyTerms.length > 0) {
                        console.log(`   ✅ Found ${vocabularyTerms.length} vocabulary terms:`);
                        vocabularyTerms.forEach((term, i) => {
                            console.log(`      ${i+1}. ${term.term} - ${term.definition}`);
                        });
                        
                        return {
                            url: link.url,
                            title: link.text,
                            vocabulary: vocabularyTerms,
                            success: true
                        };
                    } else {
                        console.log('   ❌ No vocabulary found');
                    }
                } catch (error) {
                    console.log(`   ❌ Failed: ${error.message}`);
                }
            }
        } else {
            console.log('❌ No degrowth episodes found in archive');
        }
        
    } catch (error) {
        console.log('❌ Archive search failed:', error.message);
    }
    
    return { success: false, message: 'Degrowth episode not found' };
}

// Run the test
if (require.main === module) {
    testDegrowthEpisode().then(result => {
        if (result.success) {
            console.log('\n🎉 DEGROWTH EPISODE FOUND AND TESTED!');
            console.log(`📊 URL: ${result.url}`);
            console.log(`📝 Title: ${result.title}`);
            console.log(`🔤 Vocabulary: ${result.vocabulary.length} terms`);
        } else {
            console.log('\n❌ DEGROWTH EPISODE NOT FOUND OR FAILED');
        }
    });
}

module.exports = { testDegrowthEpisode };
