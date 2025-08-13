const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeBeeEpisode() {
    try {
        console.log('Scraping wild bees episode page...');
        
        const pageUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250717';
        console.log('Page URL:', pageUrl);
        
        const response = await axios.get(pageUrl);
        const $ = cheerio.load(response.data);
        
        // Look for PDF links
        const pdfLinks = [];
        $('a[href*=".pdf"]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href) {
                const fullUrl = href.startsWith('http') ? href : `https://downloads.bbc.co.uk${href}`;
                pdfLinks.push({ text, url: fullUrl });
            }
        });
        
        console.log('Found PDF links:', pdfLinks);
        
        // Check for specific patterns
        let worksheetUrl = null;
        let transcriptUrl = null;
        
        pdfLinks.forEach(link => {
            if (link.text.toLowerCase().includes('worksheet') || link.url.includes('worksheet')) {
                worksheetUrl = link.url;
            }
            if (link.text.toLowerCase().includes('transcript') || link.url.includes('transcript')) {
                transcriptUrl = link.url;
            }
        });
        
        console.log('Worksheet URL:', worksheetUrl);
        console.log('Transcript URL:', transcriptUrl);
        
        // Also look for any download links
        const downloadLinks = [];
        $('a[href*="download"]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href) {
                downloadLinks.push({ text, url: href });
            }
        });
        
        console.log('Download links:', downloadLinks);
        
    } catch (error) {
        console.error('Error scraping:', error.message);
    }
}

scrapeBeeEpisode();
