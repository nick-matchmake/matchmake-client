# Matchmake Client

A TypeScript client library for the Matchmake.io service, supporting both browser and Node.js environments.

## Installation

```bash
npm install matchmake-client
```

If you're using Node.js, you'll also need to install the WebSocket library:

```bash
npm install ws
```


## Usage

```typescript
import { MatchmakeClient } from 'matchmake-client';

// Create a client
const client = new MatchmakeClient('wss://api.matchmake.io/socket', {
  apiToken: 'your-api-token',
  debug: true
});

// Listen for events
client.on('connected', (configs) => {
  console.log('Connected with configs:', configs);
});

client.on('lobbyUpdate', (lobby) => {
  console.log('Lobby updated:', lobby);
});

// Connect and join a lobby
async function start() {
  try {
    await client.connect({
      playerSlug: 'player123',
      ipAddress: '127.0.0.1'
    });
    
    const lobby = await client.findAndJoinLobby(1);
    console.log('Joined lobby:', lobby);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

start();
```
