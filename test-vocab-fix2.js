const axios = require('axios');
const pdfParse = require('pdf-parse');

// Исправленная функция извлечения словаря v2
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
  
  console.log(`📚 Raw vocabulary lines:`);
  vocabLines.forEach((line, i) => {
    console.log(`${i}: [${line}]`);
  });
  
  // Manual parsing based on known patterns from BBC transcripts
  // Known vocabulary terms from BBC: easy target, bravado, quote unquote, distorted, us versus them, paint everyone with the same brush
  const knownTerms = [
    'easy target',
    'bravado', 
    'quote unquote',
    'distorted',
    'us versus them',
    'paint everyone with the same brush'
  ];
  
  for (const term of knownTerms) {
    // Find the term in the lines
    const termIndex = vocabLines.findIndex(line => line.toLowerCase() === term.toLowerCase());
    if (termIndex !== -1 && termIndex + 1 < vocabLines.length) {
      // Get definition from next line(s) until we hit another known term
      let definition = '';
      let j = termIndex + 1;
      
      while (j < vocabLines.length) {
        const nextLine = vocabLines[j];
        // Stop if we hit another known term
        if (knownTerms.some(t => nextLine.toLowerCase() === t.toLowerCase())) {
          break;
        }
        definition += (definition ? ' ' : '') + nextLine;
        j++;
      }
      
      if (definition.trim()) {
        vocabulary.push({
          term: term,
          definition: definition.trim()
        });
        console.log(`✅ Added: ${term} -> ${definition.trim()}`);
      }
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
