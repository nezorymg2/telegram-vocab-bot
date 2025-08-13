/**
 * Debug HTML Content of Manosphere Episode
 * Check what's actually on the page
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function debugManosphereHTML() {
    console.log('🔍 Debugging Manosphere Episode HTML Content...\n');
    
    const correctUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250731';
    
    try {
        console.log(`📄 Fetching HTML from: ${correctUrl}`);
        
        const response = await axios.get(correctUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        console.log('✅ Page loaded successfully\n');
        
        // Check for title
        const title = $('h1').first().text().trim();
        console.log(`📝 Page title: "${title}"\n`);
        
        // Look for vocabulary section in different ways
        console.log('🔍 Searching for vocabulary content...\n');
        
        // Method 1: Look for specific text patterns
        const pageText = $.text().toLowerCase();
        
        const vocabPatterns = [
            'vocabulary',
            'easy target',
            'bravado', 
            'quote unquote',
            'distorted',
            'us versus them',
            'paint everyone with the same brush'
        ];
        
        console.log('📋 Checking for vocabulary patterns:');
        vocabPatterns.forEach(pattern => {
            const found = pageText.includes(pattern.toLowerCase());
            console.log(`   ${pattern}: ${found ? '✅' : '❌'}`);
        });
        
        // Method 2: Look for PDF links
        console.log('\n🔗 Checking for PDF links:');
        
        const pdfLinks = [];
        $('a').each((i, element) => {
            const href = $(element).attr('href');
            if (href && href.includes('.pdf')) {
                const fullUrl = href.startsWith('http') ? href : `https://www.bbc.co.uk${href}`;
                pdfLinks.push(fullUrl);
                console.log(`   PDF found: ${fullUrl}`);
            }
        });
        
        // Method 3: Check for download links
        console.log('\n📥 Checking for download links:');
        
        $('a').each((i, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().toLowerCase();
            
            if (href && (text.includes('download') || text.includes('transcript') || text.includes('worksheet'))) {
                const fullUrl = href.startsWith('http') ? href : `https://www.bbc.co.uk${href}`;
                console.log(`   Download link: "${text}" -> ${fullUrl}`);
            }
        });
        
        // If we found PDF links, test them
        if (pdfLinks.length > 0) {
            console.log('\n🧪 Testing found PDF links...');
            
            for (const pdfUrl of pdfLinks) {
                try {
                    console.log(`   Testing: ${pdfUrl}`);
                    const pdfResponse = await axios.get(pdfUrl, { 
                        responseType: 'arraybuffer',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    console.log(`   ✅ PDF accessible: ${pdfResponse.data.length} bytes`);
                    
                    // Try to parse the PDF for vocabulary
                    const { extractVocabularyFromTranscript } = require('./services/bbcQuestions-simple');
                    
                    // Mock the URL to point to this PDF
                    const mockUrl = correctUrl.replace('/ep-', '/ep-test-');
                    
                    // Test vocabulary extraction
                    console.log(`   🔤 Testing vocabulary extraction...`);
                    
                } catch (pdfError) {
                    console.log(`   ❌ PDF test failed: ${pdfError.message}`);
                }
            }
        }
        
        // Method 4: Save a sample of the HTML for manual inspection
        console.log('\n💾 Saving HTML sample...');
        const htmlSample = response.data.substring(0, 5000);
        require('fs').writeFileSync('manosphere-sample.html', htmlSample);
        console.log('✅ First 5000 chars saved to manosphere-sample.html');
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

// Run the debug
if (require.main === module) {
    debugManosphereHTML();
}

module.exports = { debugManosphereHTML };
