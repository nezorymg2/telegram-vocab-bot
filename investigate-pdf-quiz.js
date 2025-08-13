const axios = require('axios');
const cheerio = require('cheerio');

async function investigatePDFQuiz() {
  console.log('🔍 Investigating PDF quiz structure...\n');
  
  try {
    // Берем первый эпизод для исследования
    const episodeUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250807';
    
    console.log(`Fetching episode page: ${episodeUrl}`);
    const response = await axios.get(episodeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Ищем ссылки на PDF или worksheet
    console.log('🔍 Looking for PDF/worksheet links...');
    
    const pdfLinks = [];
    
    // Method 1: Поиск по тексту "worksheet" или "pdf"
    $('a').each((i, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().toLowerCase();
      
      if (href && (text.includes('worksheet') || text.includes('download') || href.includes('.pdf'))) {
        pdfLinks.push({
          href: href.startsWith('http') ? href : `https://www.bbc.co.uk${href}`,
          text: $(element).text().trim()
        });
      }
    });
    
    console.log(`Found ${pdfLinks.length} potential PDF links:`);
    pdfLinks.forEach((link, i) => {
      console.log(`${i + 1}. ${link.href} | Text: "${link.text}"`);
    });
    
    // Method 2: Поиск по классам или data атрибутам
    const downloadButtons = $('.download, [data-download], .worksheet, .pdf-link');
    console.log(`\nFound ${downloadButtons.length} download-related elements:`);
    
    downloadButtons.each((i, element) => {
      const href = $(element).attr('href') || $(element).find('a').attr('href');
      const text = $(element).text().trim();
      console.log(`${i + 1}. ${href || 'No href'} | Text: "${text}"`);
    });
    
    // Method 3: Поиск в скриптах (возможно PDF ссылки генерируются JS)
    console.log('\n🔍 Looking in scripts for PDF references...');
    const scripts = $('script');
    let foundInScript = false;
    
    scripts.each((i, script) => {
      const content = $(script).html();
      if (content && (content.includes('.pdf') || content.includes('worksheet'))) {
        const matches = content.match(/https?:\/\/[^"']*\.pdf/g);
        if (matches) {
          console.log('Found PDF URLs in script:');
          matches.forEach(match => console.log(`  - ${match}`));
          foundInScript = true;
        }
      }
    });
    
    if (!foundInScript) {
      console.log('No PDF references found in scripts');
    }
    
    // Method 4: Общий поиск в HTML
    const htmlContent = response.data;
    const pdfMatches = htmlContent.match(/https?:\/\/[^"']*\.pdf/g);
    
    if (pdfMatches) {
      console.log('\n🎯 Direct PDF URLs found in HTML:');
      [...new Set(pdfMatches)].forEach(url => {
        console.log(`  - ${url}`);
      });
    }
    
    // Method 5: Поиск по паттерну 6 Minute English
    const sixMinutePattern = /6[\s-]*minute[\s-]*english.*\.pdf/gi;
    const sixMinuteMatches = htmlContent.match(sixMinutePattern);
    
    if (sixMinuteMatches) {
      console.log('\n📄 6 Minute English PDF patterns found:');
      sixMinuteMatches.forEach(match => {
        console.log(`  - ${match}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error investigating PDF quiz:', error.message);
  }
}

investigatePDFQuiz();
