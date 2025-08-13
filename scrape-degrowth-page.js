/**
 * Scrape the actual degrowth episode page to find worksheet URL
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function findWorksheetUrl() {
  console.log('🔍 Scraping degrowth episode page to find worksheet URL...\n');
  
  const episodeUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250724';
  
  try {
    console.log(`Fetching: ${episodeUrl}`);
    
    const response = await axios.get(episodeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    console.log('\n🔍 Looking for worksheet and quiz links...');
    
    // Look for worksheet links
    const worksheetLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      
      if (href && (
        text.includes('worksheet') ||
        text.includes('quiz') ||
        href.includes('worksheet') ||
        href.includes('quiz') ||
        href.includes('.pdf') ||
        href.includes('spreadsheet') ||
        href.includes('docs.google')
      )) {
        worksheetLinks.push({
          text: $(el).text().trim(),
          href: href
        });
      }
    });
    
    console.log(`\nFound ${worksheetLinks.length} potential links:`);
    worksheetLinks.forEach((link, i) => {
      console.log(`${i+1}. "${link.text}" -> ${link.href}`);
    });
    
    // Look for any PDF links
    console.log('\n🔍 All PDF links:');
    const pdfLinks = [];
    $('a[href*=".pdf"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      pdfLinks.push({ text, href });
    });
    
    pdfLinks.forEach((link, i) => {
      console.log(`${i+1}. "${link.text}" -> ${link.href}`);
    });
    
    // Look for any Google Docs/Sheets links
    console.log('\n🔍 All Google Docs/Sheets links:');
    const googleLinks = [];
    $('a[href*="docs.google"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      googleLinks.push({ text, href });
    });
    
    googleLinks.forEach((link, i) => {
      console.log(`${i+1}. "${link.text}" -> ${link.href}`);
    });
    
  } catch (error) {
    console.error('Error scraping episode page:', error.message);
  }
}

findWorksheetUrl().catch(console.error);
