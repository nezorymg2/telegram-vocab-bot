/**
 * Test Direct PDF Access for Manosphere Episode
 * Use the correct PDF URLs we found
 */

const { extractVocabularyFromTranscript, getCleanTranscript } = require('./services/bbcQuestions-simple');
const axios = require('axios');

async function testDirectPDFAccess() {
    console.log('🧪 Testing Direct PDF Access for Manosphere Episode...\n');
    
    const transcriptPdfUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250731_6_minute_english_what_is_the_manosphere_transcript.pdf';
    const worksheetPdfUrl = 'https://downloads.bbc.co.uk/learningenglish/features/6min/250731_6_minute_english_what_is_the_manosphere_worksheet.pdf';
    const pageUrl = 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250731';
    
    console.log('📄 Testing transcript PDF...');
    console.log(`URL: ${transcriptPdfUrl}\n`);
    
    try {
        // Test 1: Extract vocabulary from transcript PDF by patching the function
        console.log('1️⃣ Testing vocabulary extraction with transcript PDF...');
        
        // We need to temporarily modify the URL construction in our function
        // Let's test it by calling with the page URL but checking if it finds the right PDF
        const vocabularyFromPage = await extractVocabularyFromTranscript(pageUrl);
        
        if (vocabularyFromPage && vocabularyFromPage.length > 0) {
            console.log(`✅ SUCCESS! Found ${vocabularyFromPage.length} vocabulary terms:`);
            vocabularyFromPage.forEach((term, i) => {
                console.log(`   ${i+1}. ${term.term} - ${term.definition}`);
            });
        } else {
            console.log('❌ No vocabulary extracted from page URL');
            
            // Try manual PDF parsing
            console.log('\n🔧 Trying manual PDF parsing...');
            const pdfResult = await testManualPDFParsing(transcriptPdfUrl);
            
            if (pdfResult) {
                console.log('✅ Manual PDF parsing worked!');
            }
        }
        
        // Test 2: Get clean transcript
        console.log('\n2️⃣ Testing clean transcript extraction...');
        
        const cleanTranscript = await getCleanTranscript(pageUrl);
        
        if (cleanTranscript && typeof cleanTranscript === 'string') {
            console.log(`✅ Clean transcript extracted: ${cleanTranscript.length} characters`);
            
            // Check content
            const expectedTerms = ['easy target', 'bravado', 'manosphere'];
            console.log('\n🔍 Checking transcript content:');
            expectedTerms.forEach(term => {
                const found = cleanTranscript.toLowerCase().includes(term.toLowerCase());
                console.log(`   Contains "${term}": ${found ? '✅' : '❌'}`);
            });
            
            // Show preview
            console.log('\n📝 Transcript preview:');
            console.log('---');
            console.log(cleanTranscript.substring(0, 500) + '...');
            console.log('---\n');
            
        } else {
            console.log('❌ No clean transcript extracted');
        }
        
        // Test 3: Test worksheet PDF
        console.log('3️⃣ Testing worksheet PDF...');
        
        try {
            const { parseBBCPDFQuiz } = require('./services/bbcQuestions-simple');
            const quizResult = await parseBBCPDFQuiz(worksheetPdfUrl);
            
            if (quizResult && quizResult.success) {
                console.log(`✅ Worksheet parsed: ${quizResult.questions?.length || 0} questions`);
            } else {
                console.log('❌ Worksheet parsing failed');
            }
        } catch (error) {
            console.log('❌ Worksheet test failed:', error.message);
        }
        
    } catch (error) {
        console.error('❌ PDF test failed:', error.message);
    }
}

async function testManualPDFParsing(pdfUrl) {
    try {
        const axios = require('axios');
        const pdfParse = require('pdf-parse');
        
        console.log(`   🔄 Fetching PDF: ${pdfUrl}`);
        
        const response = await axios.get(pdfUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        console.log(`   ✅ PDF downloaded: ${response.data.length} bytes`);
        
        const pdfData = await pdfParse(response.data);
        
        console.log(`   ✅ PDF parsed: ${pdfData.text.length} characters`);
        
        // Look for vocabulary section
        const text = pdfData.text;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        console.log(`   📄 Total lines: ${lines.length}`);
        
        // Search for vocabulary section
        let vocabStartIndex = -1;
        let vocabEndIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            
            if (line.includes('vocabulary') && !line.includes('test')) {
                vocabStartIndex = i;
                console.log(`   🎯 Found VOCABULARY at line ${i}: "${lines[i]}"`);
                break;
            }
        }
        
        if (vocabStartIndex >= 0) {
            // Find end of vocabulary section
            for (let i = vocabStartIndex + 1; i < lines.length; i++) {
                const line = lines[i].toLowerCase();
                
                if (line.includes('discussion') || line.includes('questions') || line.includes('transcript') || line.length === 0) {
                    vocabEndIndex = i;
                    break;
                }
            }
            
            if (vocabEndIndex === -1) vocabEndIndex = Math.min(vocabStartIndex + 20, lines.length);
            
            console.log(`   📚 Vocabulary section from line ${vocabStartIndex} to ${vocabEndIndex}:`);
            
            for (let i = vocabStartIndex; i < vocabEndIndex; i++) {
                if (lines[i].trim()) {
                    console.log(`      ${i}: ${lines[i]}`);
                }
            }
            
            return true;
        } else {
            console.log('   ❌ No vocabulary section found');
            
            // Show first 20 lines for debugging
            console.log('   📋 First 20 lines:');
            lines.slice(0, 20).forEach((line, i) => {
                console.log(`      ${i}: ${line}`);
            });
        }
        
        return false;
        
    } catch (error) {
        console.log(`   ❌ Manual parsing failed: ${error.message}`);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testDirectPDFAccess();
}

module.exports = { testDirectPDFAccess };
