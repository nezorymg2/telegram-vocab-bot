const axios = require('axios');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

async function downloadAndParsePDF() {
  console.log('📥 Downloading and parsing BBC PDF worksheet...\n');
  
  try {
    // URL PDF файла
    const pdfUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250807_6_minute_english_are_you_flourishing_worksheet.pdf';
    
    console.log(`Downloading PDF: ${pdfUrl}`);
    
    // Скачиваем PDF
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    console.log(`✅ Downloaded ${response.data.byteLength} bytes`);
    
    // Сохраняем локально для анализа
    const tempPath = path.join(__dirname, 'temp_worksheet.pdf');
    fs.writeFileSync(tempPath, response.data);
    console.log(`💾 Saved to ${tempPath}`);
    
    // Парсим PDF
    console.log('📖 Parsing PDF content...\n');
    const data = await pdfParse(response.data);
    
    console.log(`📄 PDF Info:`);
    console.log(`  - Pages: ${data.numpages}`);
    console.log(`  - Text length: ${data.text.length} characters\n`);
    
    // Выводим содержимое PDF
    console.log('📝 PDF Content:');
    console.log('=' * 50);
    console.log(data.text);
    console.log('=' * 50);
    
    // Ищем секцию с квизом
    const content = data.text;
    
    console.log('\n🔍 Looking for quiz section...');
    
    // Паттерны для поиска вопросов
    const patterns = [
      /5\.?\s*(?:Quiz|Questions?|Test|Activity)/i,
      /Activity\s*5/i,
      /Quiz\s*time/i,
      /Questions?.*:/i,
      /Choose.*correct.*answer/i,
      /True.*false/i,
      /Multiple.*choice/i
    ];
    
    let quizFound = false;
    
    patterns.forEach((pattern, i) => {
      const match = content.match(pattern);
      if (match) {
        console.log(`✅ Found quiz pattern ${i + 1}: "${match[0]}" at position ${match.index}`);
        quizFound = true;
        
        // Извлекаем контекст вокруг найденного паттерна
        const start = Math.max(0, match.index - 200);
        const end = Math.min(content.length, match.index + 1000);
        const context = content.slice(start, end);
        
        console.log('\n📋 Context around quiz:');
        console.log('-' * 40);
        console.log(context);
        console.log('-' * 40);
      }
    });
    
    if (!quizFound) {
      console.log('❌ No quiz patterns found');
      
      // Показываем весь текст разбитый на секции
      console.log('\n📋 Full content analysis:');
      const sections = content.split(/\n\s*\n/);
      sections.forEach((section, i) => {
        if (section.trim().length > 10) {
          console.log(`\nSection ${i + 1}:`);
          console.log(section.trim());
        }
      });
    }
    
    // Ищем ответы (обычно в конце документа)
    console.log('\n🔍 Looking for answers section...');
    
    const answerPatterns = [
      /Answers?/i,
      /Answer.*key/i,
      /Solutions?/i,
      /Key/i
    ];
    
    answerPatterns.forEach((pattern, i) => {
      const matches = [...content.matchAll(new RegExp(pattern.source, 'gi'))];
      if (matches.length > 0) {
        matches.forEach((match, j) => {
          console.log(`✅ Found answer pattern ${i + 1}.${j + 1}: "${match[0]}" at position ${match.index}`);
          
          // Контекст вокруг ответов
          const start = Math.max(0, match.index - 100);
          const end = Math.min(content.length, match.index + 500);
          const context = content.slice(start, end);
          
          console.log('\n📝 Answer context:');
          console.log('-' * 30);
          console.log(context);
          console.log('-' * 30);
        });
      }
    });
    
    // Очищаем временный файл
    fs.unlinkSync(tempPath);
    console.log('\n🗑️ Cleaned up temporary file');
    
  } catch (error) {
    console.error('❌ Error downloading/parsing PDF:', error.message);
    
    // Очищаем временный файл даже при ошибке
    const tempPath = path.join(__dirname, 'temp_worksheet.pdf');
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

downloadAndParsePDF();
