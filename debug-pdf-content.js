const axios = require('axios');
const pdfParse = require('pdf-parse');

async function debugPDFContent() {
  try {
    const testUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250807_6_minute_english_are_you_flourishing_worksheet.pdf';
    
    console.log('📥 Downloading PDF...');
    
    const response = await axios.get(testUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const data = await pdfParse(response.data);
    const content = data.text;
    
    // Find section 5
    const quizSectionMatch = content.match(/5\..*?Answer.*?quiz.*?questions.*?[\s\S]*?(?=(?:6\.|Answers|BBC\s+LEARNING\s+ENGLISH|$))/i);
    
    if (quizSectionMatch) {
      const quizSection = quizSectionMatch[0];
      console.log('=== QUIZ SECTION ===');
      console.log(quizSection);
      console.log('=== END QUIZ SECTION ===');
      
      // Show lines of quiz section
      const lines = quizSection.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      console.log('\n=== QUIZ LINES ===');
      lines.forEach((line, index) => {
        console.log(`${index + 1}: ${line}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugPDFContent();
