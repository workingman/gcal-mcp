// Unit tests for create_event MCP tool
// Tests event creation, parameter validation, and error handling

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

describe('create_event MCP Tool', () => {
  it('should create event with all details', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockEvent: CalendarEvent = {
      id: 'created_event_123',
      summary: 'Team planning session',
      start: {
        dateTime: '2026-02-25T14:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: '2026-02-25T16:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      location: 'Conference Room A',
      attendees: [
        { email: 'alice@example.com', responseStatus: 'needsAction' },
        { email: 'bob@example.com', responseStatus: 'needsAction' },
      ],
      calendarId: 'primary',
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
    };

    mockFetch(mockEvent);

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleCreateEvent({
      title: 'Team planning session',
      start: '2026-02-25T14:00:00-08:00',
      end: '2026-02-25T16:00:00-08:00',
      location: 'Conference Room A',
      attendees: ['alice@example.com', 'bob@example.com'],
    });

    assert.strictEqual(result.content[0].type, 'text');
    const text = result.content[0].text;
    assert.ok(text.includes('Event created successfully!'));
    assert.ok(text.includes('Event ID: created_event_123'));
    assert.ok(text.includes('Title: Team planning session'));
    assert.ok(text.includes('Location: Conference Room A'));
    assert.ok(text.includes('Attendees: alice@example.com, bob@example.com'));
  });

  it('should return error for missing title', async () => {
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

    const result = await (mcpServer as any).handleCreateEvent({
      start: '2026-02-25T14:00:00-08:00',
      end: '2026-02-25T16:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Missing required parameter: title'));
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

    const result = await (mcpServer as any).handleCreateEvent({
      title: 'Test Event',
      start: 'invalid-time',
      end: '2026-02-25T16:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Invalid start time format'));
  });

  it('should return error when start >= end', async () => {
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

    const result = await (mcpServer as any).handleCreateEvent({
      title: 'Test Event',
      start: '2026-02-25T16:00:00-08:00',
      end: '2026-02-25T14:00:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('start time must be before end time'));
  });

  it('should create event with minimal parameters', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockEvent: CalendarEvent = {
      id: 'minimal_event_456',
      summary: 'Quick meeting',
      start: {
        dateTime: '2026-02-25T10:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: '2026-02-25T10:30:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      calendarId: 'primary',
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=def',
    };

    mockFetch(mockEvent);

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleCreateEvent({
      title: 'Quick meeting',
      start: '2026-02-25T10:00:00-08:00',
      end: '2026-02-25T10:30:00-08:00',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Event created successfully!'));
    assert.ok(result.content[0].text.includes('Quick meeting'));
  });
});
