/**
 * Test worksheet parsing for degrowth episode
 */

const { parseBBCPDFQuiz } = require('./services/bbcQuestions-simple');

async function testDegrowthWorksheet() {
  console.log('🧪 Testing degrowth episode worksheet parsing...\n');
  
  // Based on episode 250724 (24 JUL 2025), try different worksheet URLs
  const possibleWorksheetUrls = [
    // Standard BBC worksheet format for 2025
    'https://downloads.bbc.co.uk/learningenglish/pdf/6-minute-english/250724_6-minute-english_worksheet.pdf',
    'https://downloads.bbc.co.uk/learningenglish/features/6min/250724_6_minute_english_worksheet.pdf',
    
    // Google Sheets export (if it's stored in spreadsheet)
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=0',
    
    // Direct PDF from learningenglish
    'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2025/ep-250724-worksheet.pdf'
  ];
  
  for (const url of possibleWorksheetUrls) {
    try {
      console.log(`\n🔍 Testing: ${url}`);
      
      const result = await parseBBCPDFQuiz(url);
      
      if (result && result.questions && result.questions.length > 0) {
        console.log(`✅ SUCCESS! Found ${result.questions.length} questions:`);
        result.questions.forEach((q, i) => {
          console.log(`  ${i+1}. ${q.question || q.text || q}`);
          if (q.options) {
            console.log(`     Options: ${q.options.join(', ')}`);
          }
        });
        break; // Found working URL
      } else {
        console.log(`❌ No questions found`);
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
}

testDegrowthWorksheet().catch(console.error);
