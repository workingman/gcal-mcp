// Unit tests for get_free_busy MCP tool
// Tests availability query, busy/free block calculation, and error handling

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CalendarMCP } from '../src/mcp-server.ts';
import type { FreeBusyResponse } from '../src/types.ts';
import { TokenManager, importEncryptionKey, importHmacKey } from '../src/crypto.ts';

// Mock environment
const mockEnv = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(32),
  TOKEN_HMAC_KEY: 'b'.repeat(32),
  WORKER_URL: 'https://test.example.com',
  GOOGLE_TOKENS_KV: {
    get: async () => null,
    put: async () => {},
  },
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Reset fetch before each test
});

afterEach(() => {
  // Restore original fetch
  globalThis.fetch = originalFetch;
});

function mockFetch(mockResponse: unknown, status: number = 200) {
  globalThis.fetch = (async (): Promise<Response> => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
    } as Response;
  }) as typeof fetch;
}

async function setupMockTokens(userEmail: string) {
  const encryptionKey = await importEncryptionKey(mockEnv.TOKEN_ENCRYPTION_KEY);
  const hmacKey = await importHmacKey(mockEnv.TOKEN_HMAC_KEY);
  const manager = new TokenManager(encryptionKey, hmacKey);

  const tokens = {
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    expires_at: Date.now() + 3600000,
    scope: 'https://www.googleapis.com/auth/calendar',
    user_email: userEmail,
    user_id: userEmail,
  };

  const encrypted = await manager.encrypt(tokens, userEmail);
  return encrypted;
}

describe('get_free_busy MCP Tool', () => {
  it('should return availability with busy and free blocks', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockResponse: FreeBusyResponse = {
      timeMin: '2026-02-20T09:00:00-08:00',
      timeMax: '2026-02-20T17:00:00-08:00',
      calendars: {
        'primary': {
          busy: [
            {
              start: '2026-02-20T10:00:00-08:00',
              end: '2026-02-20T10:30:00-08:00',
            },
            {
              start: '2026-02-20T14:00:00-08:00',
              end: '2026-02-20T15:00:00-08:00',
            },
          ],
        },
      },
    };

    mockFetch(mockResponse);

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetFreeBusy({
      start_time: '2026-02-20T09:00:00-08:00',
      end_time: '2026-02-20T17:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    const text = result.content[0].text;
    assert.ok(text.includes('Your availability for'));
    assert.ok(text.includes('Busy:'));
    assert.ok(text.includes('Free:'));
  });

  it('should return all free when no busy blocks', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockResponse: FreeBusyResponse = {
      timeMin: '2026-02-20T09:00:00-08:00',
      timeMax: '2026-02-20T17:00:00-08:00',
      calendars: {
        'primary': {
          busy: [],
        },
      },
    };

    mockFetch(mockResponse);

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetFreeBusy({
      start_time: '2026-02-20T09:00:00-08:00',
      end_time: '2026-02-20T17:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Entire time range is available'));
  });

  it('should handle all busy (no free time)', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockResponse: FreeBusyResponse = {
      timeMin: '2026-02-20T09:00:00-08:00',
      timeMax: '2026-02-20T17:00:00-08:00',
      calendars: {
        'primary': {
          busy: [
            {
              start: '2026-02-20T09:00:00-08:00',
              end: '2026-02-20T17:00:00-08:00',
            },
          ],
        },
      },
    };

    mockFetch(mockResponse);

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetFreeBusy({
      start_time: '2026-02-20T09:00:00-08:00',
      end_time: '2026-02-20T17:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    const text = result.content[0].text;
    assert.ok(text.includes('Busy:'));
    assert.ok(text.includes('No free time available'));
  });

  it('should return error for missing parameters', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetFreeBusy({});

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Missing required parameters'));
  });

  it('should return error for invalid time format', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetFreeBusy({
      start_time: 'invalid-time',
      end_time: '2026-02-20T17:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Invalid time format'));
  });

  it('should return error when start_time >= end_time', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetFreeBusy({
      start_time: '2026-02-20T17:00:00-08:00',
      end_time: '2026-02-20T09:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('start_time must be before end_time'));
  });
});
