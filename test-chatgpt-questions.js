const bbcService = require('./services/bbcService');

async function testChatGPTQuestions() {
  console.log('🧪 Testing ChatGPT question generation...\n');

  try {
    // Test with a simple episode data
    const testEpisode = {
      title: "How do babies communicate?",
      transcript: `Neil: Hello. This is 6 Minute English from BBC Learning English. I'm Neil.
      
Sam: And I'm Sam.

Neil: Having a new baby is one of the most wonderful experiences in life.

Sam: Yes, but it can be exhausting too, can't it? You never know if they're hungry, uncomfortable, or just want a hug. If only babies came with an instruction manual!

Neil: Well, in this programme we'll be hearing about new research which shows that baby behaviour isn't as random as we might think. Babies are actually communicating with us all the time.

Sam: Really? So those little arms and legs movements aren't just random jerky actions?

Neil: No, according to new research from Manchester University, around 75 per cent of baby movements are actually intentional - the babies are trying to tell us something.

Sam: That's amazing! And we'll be learning some related vocabulary along the way.

Neil: But first, I have a question for you, Sam. The idea of 'love at first sight' is a popular concept, but according to research, what percentage of new parents don't immediately feel that overwhelming love for their newborn baby? Is it: a) 10%, b) 20%, or c) 30%?

Sam: Hmm, I think I'll go with b) 20%.

Neil: OK, we'll find out the answer later. Now, let's hear from Dr Sarah Johnson, a baby communication expert at Manchester University...

Dr Johnson: What we found is that babies are incredibly sophisticated communicators right from birth. When they move their arms and legs, they're not just stretching - they're actually trying to get our attention and communicate their needs. These movements might look jerky and random to the naked eye, but our research shows they follow very specific patterns.

Neil: So babies need their parents' care one hundred percent to survive, and they use movement to communicate this need.

Sam: It seems like the idea of 'love at first sight' between parents and babies might be an unhelpful cliché then.

Neil: Yes, building that bond takes time, and understanding your baby's communication is part of that process.`
    };

    console.log('📋 Episode title:', testEpisode.title);
    console.log('📄 Transcript length:', testEpisode.transcript.length, 'characters\n');

    // Test question generation
    console.log('🎯 Generating questions...\n');
    const result = await bbcService.generateBBCQuestions(testEpisode);

    if (result.questions && result.questions.length > 0) {
      console.log(`✅ Successfully generated ${result.questions.length} questions!\n`);
      
      result.questions.forEach((question, index) => {
        console.log(`\n📝 Question ${index + 1} [${question.difficulty?.toUpperCase() || 'MEDIUM'}]:`);
        console.log(`   ${question.question}\n`);
        
        question.options.forEach(option => {
          console.log(`   ${option}`);
        });
        
        console.log(`\n   ✅ Correct answer: ${question.correct_answer}`);
        if (question.explanation) {
          console.log(`   💡 Explanation: ${question.explanation}`);
        }
        console.log('   ' + '─'.repeat(60));
      });

      // Test question difficulty distribution
      const difficulties = result.questions.map(q => q.difficulty);
      const easyCount = difficulties.filter(d => d === 'easy').length;
      const mediumCount = difficulties.filter(d => d === 'medium').length;
      const hardCount = difficulties.filter(d => d === 'hard').length;
      
      console.log(`\n📊 Difficulty Distribution:`);
      console.log(`   Easy: ${easyCount} questions`);
      console.log(`   Medium: ${mediumCount} questions`);
      console.log(`   Hard: ${hardCount} questions`);

    } else {
      console.log('❌ No questions generated');
      console.log('Result:', result);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testChatGPTQuestions();
