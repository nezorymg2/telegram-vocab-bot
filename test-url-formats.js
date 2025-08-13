/**
 * Test Different URL Formats for Manosphere Episode
 * Try to find the correct URL that works for vocabulary extraction
 */

const { extractVocabularyFromTranscript, getCleanTranscript } = require('./services/bbcQuestions-simple');

async function testDifferentURLs() {
    console.log('🧪 Testing Different URL Formats for Manosphere Episode...\n');
    
    // Different possible URL formats to try
    const urlsToTry = [
        'https://www.bbc.co.uk/learningenglish/features/6-minute-english/ep-250807',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english/ep-250807',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241231',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241224', 
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241217',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241210',
        'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-241203'
    ];
    
    for (const url of urlsToTry) {
        console.log(`\n🌐 Testing URL: ${url}`);
        
        try {
            // Test vocabulary extraction first (faster)
            console.log('   📄 Extracting vocabulary...');
            const vocabularyTerms = await extractVocabularyFromTranscript(url);
            
            if (vocabularyTerms && vocabularyTerms.length > 0) {
                console.log(`   ✅ SUCCESS! Found ${vocabularyTerms.length} vocabulary terms`);
                
                // Check if we found expected terms
                const expectedTerms = ['easy target', 'bravado', 'quote unquote', 'distorted', 'us versus them'];
                const foundExpected = vocabularyTerms.some(term => 
                    expectedTerms.some(expected => 
                        term.term.toLowerCase().includes(expected.toLowerCase())
                    )
                );
                
                if (foundExpected) {
                    console.log('   🎯 FOUND EXPECTED TERMS! This might be the right episode');
                    
                    vocabularyTerms.forEach((term, i) => {
                        console.log(`      ${i+1}. ${term.term} - ${term.definition}`);
                    });
                    
                    // Test clean transcript too
                    try {
                        const cleanTranscript = await getCleanTranscript(url);
                        if (cleanTranscript && typeof cleanTranscript === 'string') {
                            console.log(`   ✅ Clean transcript also works: ${cleanTranscript.length} chars`);
                            
                            // Check for manosphere content
                            if (cleanTranscript.toLowerCase().includes('manosphere')) {
                                console.log('   🎯 CONTAINS "MANOSPHERE" - THIS IS THE RIGHT EPISODE!');
                                return { url, vocabularyTerms, cleanTranscript };
                            }
                        }
                    } catch (transcriptError) {
                        console.log('   ⚠️ Vocabulary works but transcript failed');
                    }
                    
                } else {
                    console.log('   ℹ️ Different episode (no expected terms found)');
                }
                
            } else {
                console.log('   ❌ No vocabulary found');
            }
            
        } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
        }
    }
    
    console.log('\n🔍 Trying to scrape recent episodes to find the manosphere one...');
    await tryScrapingRecentEpisodes();
}

async function tryScrapingRecentEpisodes() {
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    try {
        console.log('📡 Scraping BBC 6 Minute English archive...');
        const archiveUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english';
        
        const response = await axios.get(archiveUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // Look for episodes with "manosphere" in title or description
        const episodes = [];
        
        $('a').each((i, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().toLowerCase();
            
            if (href && href.includes('ep-') && (text.includes('manosphere') || text.includes('target'))) {
                const fullUrl = href.startsWith('http') ? href : `https://www.bbc.co.uk${href}`;
                episodes.push({
                    url: fullUrl,
                    text: text.trim()
                });
            }
        });
        
        if (episodes.length > 0) {
            console.log(`🎯 Found ${episodes.length} potential manosphere episodes:`);
            episodes.forEach((ep, i) => {
                console.log(`   ${i+1}. ${ep.text} - ${ep.url}`);
            });
            
            // Test the first one
            if (episodes[0]) {
                console.log('\n🧪 Testing first candidate...');
                await testSpecificEpisode(episodes[0].url);
            }
        } else {
            console.log('❌ No manosphere episodes found in archive');
        }
        
    } catch (error) {
        console.log('❌ Archive scraping failed:', error.message);
    }
}

async function testSpecificEpisode(url) {
    try {
        const vocabularyTerms = await extractVocabularyFromTranscript(url);
        
        if (vocabularyTerms && vocabularyTerms.length > 0) {
            console.log(`✅ Found ${vocabularyTerms.length} terms in ${url}:`);
            vocabularyTerms.forEach((term, i) => {
                console.log(`   ${i+1}. ${term.term} - ${term.definition}`);
            });
        }
    } catch (error) {
        console.log(`❌ Failed to test ${url}: ${error.message}`);
    }
}

// Run the test
if (require.main === module) {
    testDifferentURLs();
}

module.exports = { testDifferentURLs };
