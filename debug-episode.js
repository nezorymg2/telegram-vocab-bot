// Debug test for episode data
const bbcService = require('./services/bbcService');

async function testEpisodeData() {
  try {
    console.log('Testing getNextBBCEpisode...');
    
    const episode = await bbcService.getNextBBCEpisode('test-user', 'test-profile');
    
    if (!episode) {
      console.log('No episode found');
      return;
    }
    
    console.log('Episode data:');
    console.log('ID:', episode.id);
    console.log('Title:', episode.title);
    console.log('pageUrl:', episode.pageUrl);
    console.log('mp3Url:', episode.mp3Url);
    console.log('Has transcript:', !!episode.transcript);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testEpisodeData();
