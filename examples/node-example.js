const { MatchmakeClient } = require('matchmake-client');

async function runExample() {
  const client = new MatchmakeClient('wss://your-server.com/socket', {
    apiToken: 'your-token',
    debug: true
  });
  
  client.on('connected', (configs) => {
    console.log('Connected, available configs:', configs);
  });
  
  try {
    await client.connect({
      playerSlug: 'player123',
      ipAddress: '127.0.0.1'
    });
    
    const lobby = await client.findAndJoinLobby(1);
    console.log('Joined lobby:', lobby);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await client.leaveLobby();
    client.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

runExample();