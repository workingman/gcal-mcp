// Unit tests for move_event MCP tool
// Tests event rescheduling, parameter validation, and error handling

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CalendarMCP } from '../src/mcp-server.ts';
import type { CalendarEvent } from '../src/types.ts';
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

describe('move_event MCP Tool', () => {
  it('should reschedule event to new time', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockUpdatedEvent: CalendarEvent = {
      id: 'event123',
      summary: 'Team planning session',
      start: {
        dateTime: '2026-02-26T15:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: '2026-02-26T17:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      calendarId: 'primary',
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
    };

    mockFetch(mockUpdatedEvent);

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleMoveEvent({
      event_id: 'event123',
      new_start: '2026-02-26T15:00:00-08:00',
      new_end: '2026-02-26T17:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    const text = result.content[0].text;
    assert.ok(text.includes('Event rescheduled successfully!'));
    assert.ok(text.includes('Event ID: event123'));
    assert.ok(text.includes('Title: Team planning session'));
  });

  it('should return error for missing event_id', async () => {
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

    const result = await (mcpServer as any).handleMoveEvent({
      new_start: '2026-02-26T15:00:00-08:00',
      new_end: '2026-02-26T17:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Missing required parameter: event_id'));
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

    const result = await (mcpServer as any).handleMoveEvent({
      event_id: 'event123',
      new_start: 'invalid-time',
      new_end: '2026-02-26T17:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Invalid new_start time format'));
  });

  it('should return error when new_start >= new_end', async () => {
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

    const result = await (mcpServer as any).handleMoveEvent({
      event_id: 'event123',
      new_start: '2026-02-26T17:00:00-08:00',
      new_end: '2026-02-26T15:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('new_start must be before new_end'));
  });

  it('should handle event not found error', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    mockFetch({ error: { message: 'Not Found' } }, 404);

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleMoveEvent({
      event_id: 'nonexistent',
      new_start: '2026-02-26T15:00:00-08:00',
      new_end: '2026-02-26T17:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Not Found') || result.content[0].text.includes('404'));
  });
});
