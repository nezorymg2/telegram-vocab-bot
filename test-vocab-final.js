// Финальная версия функции
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
  
  // Process in pairs, but handle multi-line definitions intelligently
  let i = 0;
  while (i < vocabLines.length) {
    const potentialTerm = vocabLines[i];
    
    // A term should be relatively short and not start with common definition patterns
    const looksLikeTerm = potentialTerm.length < 80 && 
                         !potentialTerm.match(/^(someone|word|expression|show of|used to|phrase|changed|idiom|\(|feeling|thing)/i);
    
    if (looksLikeTerm) {
      const term = potentialTerm;
      let definition = '';
      let j = i + 1;
      
      // Collect definition lines until we find the next likely term
      while (j < vocabLines.length) {
        const nextLine = vocabLines[j];
        const nextLooksLikeTerm = nextLine.length < 80 && 
                                 !nextLine.match(/^(someone|word|expression|show of|used to|phrase|changed|idiom|\(|feeling|thing)/i);
        
        // If we've collected some definition and the next line looks like a term, stop
        if (nextLooksLikeTerm && definition.length > 15) {
          break;
        }
        
        definition += (definition ? ' ' : '') + nextLine;
        j++;
        
        // Safety: don't collect more than 3 lines for a definition
        if (j - i > 3) break;
      }
      
      if (definition.trim().length > 5) {
        vocabulary.push({
          term: term,
          definition: definition.trim()
        });
        console.log(`✅ Added: ${term}`);
      }
      
      i = j;
    } else {
      i++;
    }
  }
  
  console.log(`📚 Extracted ${vocabulary.length} vocabulary terms from transcript`);
  return vocabulary;
}

module.exports = { extractVocabularyFromTranscript };

console.log('Функция готова для интеграции!');
