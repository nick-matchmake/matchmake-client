import { Socket as PhoenixSocket, Channel } from 'phoenix';
import { EventEmitter } from 'events';
import {
  MatchmakingConfig,
  Player,
  Lobby,
  ConnectOptions,
  HostInfo,
  ClientOptions,
  ConnectResponse,
  LobbyResponse
} from './types';


// Custom error classes
export class MatchmakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchmakeError';
  }
}

export class ConnectionError extends MatchmakeError {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class LobbyError extends MatchmakeError {
  constructor(message: string) {
    super(message);
    this.name = 'LobbyError';
  }
}

export class MatchmakeClient extends EventEmitter {
  private socket: PhoenixSocket;
  private appChannel!: Channel;
  private lobbyChannel: Channel | null = null;
  private sessionToken?: string;
  private debugEnabled: boolean = false;
  private currentLobby: Lobby | null = null;

  /**
   * Creates a new instance of the MatchmakeClient
   * @param endpoint The WebSocket endpoint for the matchmake service
   * @param options Configuration options for the client
   */
  constructor(endpoint: string, options: ClientOptions = {}) {
    super();
    
    const apiToken = options.apiToken || "of0FnIPtpGEtIfEMliuEawiMkGYoLImS1csN9dHYZA0=";
    this.debugEnabled = options.debug || false;

    // Determine if we're in Node.js or browser environment
    if (typeof window === 'undefined') {
      // Node.js environment - use ws with headers
      const WebSocket = require('ws');
      
      class CustomWebSocket extends WebSocket {
        constructor(url: string) {
          super(url, {
            headers: { "x-authorization": `Bearer ${apiToken}` }
          });
        }
      }
      
      this.socket = new PhoenixSocket(endpoint, {
        transport: CustomWebSocket as any,
        params: {},
      });
    } else {
      // Browser environment - use params instead of headers
      this.socket = new PhoenixSocket(endpoint, {
        params: { token: apiToken },
      });
    }

    // Set up socket event handlers
    this.socket.onError(this.onSocketError.bind(this));
    this.socket.onClose(this.onSocketClose.bind(this));
  }

  /**
   * Enables or disables debug logging
   * @param enabled Whether debug mode should be enabled
   * @returns The client instance for chaining
   */
  setDebug(enabled: boolean): this {
    this.debugEnabled = enabled;
    return this;
  }

  /**
   * Connects to the matchmaking service
   * @param options Connection options
   * @returns A promise that resolves to the available matchmaking configurations
   */
  async connect(options: ConnectOptions): Promise<MatchmakingConfig[]> {
    this.debugLog('Connecting to socket...');
    
    this.socket.connect();
    
    this.debugLog('Creating app channel...');
    this.appChannel = this.socket.channel("app:auth", {
      player_slug: options.playerSlug,
      ip_address: options.ipAddress
    });

    try {
      const response = await new Promise<ConnectResponse>((resolve, reject) => {
        this.appChannel.join()
          .receive("ok", (resp) => {
            this.debugLog('App channel joined successfully');
            resolve(resp);
          })
          .receive("error", (err) => {
            this.debugLog('App channel join failed:', err);
            reject(new ConnectionError(`Failed to join app channel: ${err.reason || 'Unknown error'}`));
          });
      });

      this.sessionToken = response.session_token;
      this.emit('connected', response.active_configs);
      return response.active_configs;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Finds a lobby based on a configuration ID
   * @param configId The ID of the matchmaking configuration
   * @returns A promise that resolves to the found lobby
   */
  async findLobby(configId: number): Promise<Lobby> {
    this.debugLog(`Finding lobby for config ${configId}...`);
    
    try {
      const response = await new Promise<LobbyResponse>((resolve, reject) => {
        this.appChannel.push("find_lobby", { config_id: configId })
          .receive("ok", resolve)
          .receive("error", (err) => {
            reject(new LobbyError(`Failed to find lobby: ${err.reason || 'Unknown error'}`));
          });
      });

      this.debugLog(`Found lobby ${response.lobby.id}`);
      this.emit('lobbyFound', response.lobby);
      return response.lobby;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Joins a specific lobby
   * @param lobby The lobby to join
   * @returns A promise that resolves when the lobby is joined
   */
  async joinLobby(lobby: Lobby): Promise<Lobby> {
    if (!this.sessionToken) throw new ConnectionError("Not connected");

    this.debugLog(`Joining lobby ${lobby.id}...`);
    
    this.lobbyChannel = this.socket.channel(`lobby:${lobby.id}`, {
      session_token: this.sessionToken
    });

    // Set up lobby channel event handlers
    this.lobbyChannel.on("lobby_update", (payload) => this.onLobbyUpdate(payload.lobby));

    try {
      const response = await new Promise<{lobby: Lobby}>((resolve, reject) => {
        this.lobbyChannel!.join()
          .receive("ok", (resp) => {
            this.debugLog('Lobby joined successfully');
            resolve(resp);
          })
          .receive("error", (err) => {
            this.debugLog('Lobby join failed:', err);
            reject(new LobbyError(`Failed to join lobby: ${err.reason || 'Unknown error'}`));
          });
      });

      this.currentLobby = response.lobby;
      this.emit('lobbyJoined', response.lobby);
      return response.lobby;
    } catch (error) {
      this.lobbyChannel = null;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Convenience method to find and join a lobby in one operation
   * @param configId The ID of the matchmaking configuration
   * @returns A promise that resolves to the joined lobby
   */
  async findAndJoinLobby(configId: number): Promise<Lobby> {
    const lobby = await this.findLobby(configId);
    return this.joinLobby(lobby);
  }

  /**
   * Sets host information for the current lobby
   * @param hostInfo Host information
   * @returns A promise that resolves when the host info is set
   */
  async setHostInfo(hostInfo: HostInfo): Promise<void> {
    if (!this.lobbyChannel) throw new LobbyError("Not in a lobby");
    if (!this.sessionToken) throw new ConnectionError("Not connected");

    this.debugLog(`Setting host info: ${hostInfo.type} ${hostInfo.address}:${hostInfo.port}`);

    try {
      await new Promise<void>((resolve, reject) => {
        this.lobbyChannel!.push("set_host", {
          host_type: hostInfo.type,
          host_address: hostInfo.address,
          host_port: hostInfo.port,
          session_token: this.sessionToken
        })
          .receive("ok", () => {
            this.debugLog('Host info set successfully');
            resolve();
          })
          .receive("error", (err) => {
            this.debugLog('Failed to set host info:', err);
            reject(new LobbyError(`Failed to set host info: ${err.reason || 'Unknown error'}`));
          });
      });

      this.emit('hostInfoSet', hostInfo);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Leaves the current lobby
   * @returns A promise that resolves when the lobby is left
   */
  async leaveLobby(): Promise<void> {
    if (!this.lobbyChannel || !this.sessionToken || !this.currentLobby) {
      throw new LobbyError("Not in a lobby");
    }

    const lobbyId = this.currentLobby.id;
    this.debugLog(`Leaving lobby ${lobbyId}...`);

    try {
      await new Promise<void>((resolve, reject) => {
        this.lobbyChannel!.push("leave", {
          lobby_id: lobbyId,
          session_token: this.sessionToken
        })
          .receive("ok", () => {
            this.debugLog('Left lobby successfully');
            resolve();
          })
          .receive("error", (err) => {
            this.debugLog('Failed to leave lobby:', err);
            reject(new LobbyError(`Failed to leave lobby: ${err.reason || 'Unknown error'}`));
          });
      });

      this.lobbyChannel.leave();
      this.lobbyChannel = null;
      this.currentLobby = null;
      this.emit('lobbyLeft', lobbyId);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnects from the matchmaking service
   */
  disconnect(): void {
    this.debugLog('Disconnecting...');
    
    if (this.lobbyChannel) {
      this.lobbyChannel.leave();
      this.lobbyChannel = null;
    }
    
    if (this.appChannel) {
      this.appChannel.leave();
    }
    
    this.socket.disconnect();
    this.currentLobby = null;
    this.emit('disconnected');
  }

  /**
   * Gets the current lobby, if any
   * @returns The current lobby or null if not in a lobby
   */
  getCurrentLobby(): Lobby | null {
    return this.currentLobby;
  }

  /**
   * Handles lobby updates
   * @param lobby The updated lobby information
   */
  private onLobbyUpdate(lobby: Lobby): void {
    this.debugLog(`Received lobby update: ${JSON.stringify(lobby)}`);
    
    // Check for player changes
    if (this.currentLobby) {
      const oldPlayerIds = new Set(this.currentLobby.players.map(p => p.id));
      const newPlayerIds = new Set(lobby.players.map(p => p.id));
      
      // Find joined players
      lobby.players.forEach(player => {
        if (!oldPlayerIds.has(player.id)) {
          this.emit('playerJoined', player, lobby);
        }
      });
      
      // Find left players
      this.currentLobby.players.forEach(player => {
        if (!newPlayerIds.has(player.id)) {
          this.emit('playerLeft', player, lobby);
        }
      });
      
      // Check for status changes
      if (lobby.status !== this.currentLobby.status) {
        this.emit('statusChanged', lobby.status, lobby);
      }
      
      // Check for host changes
      if (lobby.host_address !== this.currentLobby.host_address || 
          lobby.host_port !== this.currentLobby.host_port || 
          lobby.host_type !== this.currentLobby.host_type) {
        this.emit('hostChanged', {
          type: lobby.host_type,
          address: lobby.host_address,
          port: lobby.host_port
        }, lobby);
      }
    }
    
    this.currentLobby = lobby;
    this.emit('lobbyUpdate', lobby);
  }

  /**
   * Handles socket errors
   * @param error The error information
   */
  private onSocketError(error: any): void {
    this.debugLog('Socket error:', error);
    this.emit('socketError', new ConnectionError('WebSocket connection error'));
  }

  /**
   * Handles socket close
   */
  private onSocketClose(): void {
    this.debugLog('Socket closed');
    this.emit('socketClosed');
  }

  /**
   * Logs debug information if debug mode is enabled
   * @param args Arguments to log
   */
  private debugLog(...args: any[]): void {
    if (this.debugEnabled) {
      console.log('[MatchmakeClient]', ...args);
    }
  }
}