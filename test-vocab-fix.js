const axios = require('axios');
const pdfParse = require('pdf-parse');

// Исправленная функция извлечения словаря
function extractVocabularyFromTranscript(content) {
  const vocabulary = [];
  
  // Find the final VOCABULARY section at the end of the document
  const lines = content.split('\n').map(line => line.trim());
  
  // Find the index of the last VOCABULARY header
  let vocabStartIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] === 'VOCABULARY') {
      vocabStartIndex = i;
      break;
    }
  }
  
  if (vocabStartIndex === -1) {
    console.log('❌ No standalone VOCABULARY section found');
    return vocabulary;
  }
  
  console.log(`📖 Found VOCABULARY section at line ${vocabStartIndex}`);
  
  // Extract vocabulary terms from after the VOCABULARY header
  const vocabLines = lines.slice(vocabStartIndex + 1).filter(line => {
    return line.length > 0 && 
           !line.match(/^6 Minute English|^©British Broadcasting|^bbclearningenglish\.com|^Page \d+ of \d+/i);
  });
  
  console.log(`📚 Processing ${vocabLines.length} vocabulary lines`);
  
  // Detect vocabulary pattern by looking at line patterns
  // Usually: short term, longer definition, short term, longer definition...
  let i = 0;
  
  while (i < vocabLines.length) {
    const currentLine = vocabLines[i];
    
    // Check if this looks like a term (short line, not starting with common definition words)
    const isLikelyTerm = currentLine.length < 50 && 
                        !currentLine.match(/^(word|expression|used to|show of|phrase|changed|idiom|someone|feeling)/i);
    
    if (isLikelyTerm) {
      // This is a term, next lines until next term are definition
      const term = currentLine;
      let definition = '';
      let j = i + 1;
      
      // Collect definition lines until we hit another likely term or end
      while (j < vocabLines.length) {
        const nextLine = vocabLines[j];
        const nextIsLikelyTerm = nextLine.length < 50 && 
                                !nextLine.match(/^(word|expression|used to|show of|phrase|changed|idiom|someone|feeling)/i);
        
        if (nextIsLikelyTerm && definition.length > 10) {
          // This looks like the next term, stop collecting definition
          break;
        }
        
        definition += (definition ? ' ' : '') + nextLine;
        j++;
      }
      
      if (definition.trim()) {
        vocabulary.push({
          term: term.trim(),
          definition: definition.trim()
        });
        console.log(`✅ Added: ${term}`);
      }
      
      i = j; // Move to next term
    } else {
      i++;
    }
  }
  
  console.log(`📚 Extracted ${vocabulary.length} vocabulary terms from transcript`);
  return vocabulary;
}

// Тестируем
(async () => {
  try {
    const url = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250731_6_minute_english_what_is_the_manosphere_transcript.pdf';
    
    console.log('Скачиваем и парсим PDF...');
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const data = await pdfParse(response.data);
    const vocab = extractVocabularyFromTranscript(data.text);
    
    console.log('\n=== ИТОГОВЫЙ РЕЗУЛЬТАТ ===');
    console.log('Количество терминов:', vocab.length);
    vocab.forEach((v, i) => {
      console.log(`${i+1}. ${v.term}: ${v.definition}`);
    });
    
  } catch (e) {
    console.error('Ошибка:', e.message);
  }
})();
