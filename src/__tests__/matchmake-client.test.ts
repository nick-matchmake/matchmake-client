import { MatchmakeClient } from '../matchmake-client';

// Mock dependencies
jest.mock('phoenix', () => {
  return {
    Socket: jest.fn().mockImplementation(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      onError: jest.fn(),
      onClose: jest.fn(),
      channel: jest.fn().mockImplementation(() => ({
        join: jest.fn().mockReturnValue({
          receive: jest.fn().mockReturnThis()
        }),
        push: jest.fn().mockReturnValue({
          receive: jest.fn().mockReturnThis()
        }),
        on: jest.fn(),
        leave: jest.fn()
      }))
    }))
  };
});

describe('MatchmakeClient', () => {
  it('should create an instance', () => {
    const client = new MatchmakeClient('wss://example.com/socket');
    expect(client).toBeInstanceOf(MatchmakeClient);
  });
});