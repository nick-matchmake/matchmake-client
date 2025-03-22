export interface MatchmakingConfig {
  id: number;
  name: string;
  max_players: number;
  lobby_type: 'auto_match' | 'player_created';
}

export interface Player {
  id: number;
  slug: string;
  joined_at: string;
}

export interface Lobby {
  id: number;
  name: string;
  status: 'pending' | 'open' | 'full' | 'cancelled' | 'started' | 'finished';
  max_players: number;
  host_type?: 'p2p' | 'dedicated';
  host_address?: string;
  host_port?: number;
  metadata: Record<string, unknown>;
  players: Player[];
  created_at: string;
}

export interface ConnectOptions {
  playerSlug: string;
  ipAddress: string;
}

export interface HostInfo {
  type: 'p2p' | 'dedicated';
  address: string;
  port: number;
}

export interface ClientOptions {
  apiToken?: string;
  debug?: boolean;
}

// These are internal interfaces, not exported from index
export interface ConnectResponse {
  active_configs: MatchmakingConfig[];
  session_token: string;
}

export interface LobbyResponse {
  lobby: Lobby;
}