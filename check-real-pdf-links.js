/**
 * Check actual PDF links from episode HTML pages
 * Since direct PDF URLs are failing, let's see what's on the actual pages
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function checkRealPDFLinks() {
    console.log('🔍 Checking actual PDF links from episode HTML pages...\n');

    const testEpisodes = [
        {
            title: 'What is the manosphere?',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250130'
        },
        {
            title: 'Can you keep a secret?',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250123'
        },
        {
            title: 'The power of humour',
            pageUrl: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250109'
        }
    ];

    for (const episode of testEpisodes) {
        console.log(`📚 Checking: "${episode.title}"`);
        console.log(`🌐 Page: ${episode.pageUrl}`);

        try {
            // Get the HTML page
            console.log('🔄 Fetching HTML page...');
            const response = await axios.get(episode.pageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const html = response.data;
            const $ = cheerio.load(html);

            console.log(`✅ HTML page loaded (${html.length} chars)`);

            // Look for PDF links
            const pdfLinks = [];
            
            // Check for various PDF link patterns
            $('a[href*=".pdf"]').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                pdfLinks.push({ href, text });
            });

            // Also check for download links
            $('a[href*="download"]').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                if (href && (href.includes('transcript') || href.includes('pdf'))) {
                    pdfLinks.push({ href, text });
                }
            });

            // Check for transcript-related links
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                if (href && (text.toLowerCase().includes('transcript') || text.toLowerCase().includes('pdf'))) {
                    pdfLinks.push({ href, text });
                }
            });

            if (pdfLinks.length > 0) {
                console.log(`📄 Found ${pdfLinks.length} potential PDF link(s):`);
                pdfLinks.forEach((link, i) => {
                    console.log(`   ${i+1}. "${link.text}" -> ${link.href}`);
                });

                // Test the first PDF link
                const firstPdfLink = pdfLinks[0];
                let fullUrl = firstPdfLink.href;
                
                // Make relative URLs absolute
                if (fullUrl.startsWith('/')) {
                    fullUrl = 'https://www.bbc.co.uk' + fullUrl;
                } else if (!fullUrl.startsWith('http')) {
                    fullUrl = 'https://downloads.bbc.co.uk/' + fullUrl;
                }

                console.log(`🧪 Testing PDF link: ${fullUrl}`);
                
                try {
                    const pdfResponse = await axios.head(fullUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    console.log(`✅ PDF accessible! Status: ${pdfResponse.status}`);
                } catch (pdfError) {
                    console.log(`❌ PDF not accessible: ${pdfError.response?.status || pdfError.message}`);
                }

            } else {
                console.log('❌ No PDF links found on this page');
                
                // Show some sample links for debugging
                console.log('\n🔍 Sample links found on page:');
                let linkCount = 0;
                $('a').each((i, el) => {
                    if (linkCount >= 5) return;
                    const href = $(el).attr('href');
                    const text = $(el).text().trim();
                    if (href && text) {
                        console.log(`   • "${text}" -> ${href}`);
                        linkCount++;
                    }
                });
            }

        } catch (error) {
            console.log(`❌ Error checking "${episode.title}": ${error.message}`);
        }

        console.log('\n' + '='.repeat(60) + '\n');
    }
}

// Run the check
if (require.main === module) {
    checkRealPDFLinks();
}

module.exports = { checkRealPDFLinks };
