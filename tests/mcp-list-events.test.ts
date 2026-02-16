// Unit tests for list_events MCP tool
// Tests parameter handling, date parsing, filtering, and error cases

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CalendarMCP } from '../src/mcp-server.ts';
import type { CalendarEvent, Calendar } from '../src/types.ts';
import { TokenManager, importEncryptionKey, importHmacKey } from '../src/crypto.ts';

// Mock environment
const mockEnv = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(32), // 32 bytes for AES-256
  TOKEN_HMAC_KEY: 'b'.repeat(32), // 32 bytes for HMAC
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

function mockFetch(
  mockResponse: unknown,
  status: number = 200,
  additionalResponses?: Array<{ response: unknown; status: number }>
) {
  let callCount = 0;
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const currentResponse =
      additionalResponses && callCount > 0
        ? additionalResponses[callCount - 1] || { response: mockResponse, status }
        : { response: mockResponse, status };

    callCount++;

    return {
      ok: currentResponse.status >= 200 && currentResponse.status < 300,
      status: currentResponse.status,
      json: async () => currentResponse.response,
      text: async () => JSON.stringify(currentResponse.response),
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

describe('list_events MCP Tool', () => {
  it('should return no events message when no events found', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    // Mock KV to return encrypted tokens
    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    // Mock Google Calendar API responses
    mockFetch(
      { items: [] }, // Calendar list
      200,
      [
        { response: { items: [] }, status: 200 }, // Empty events
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleListEvents({});

    assert.strictEqual(result.content[0].type, 'text');
    assert.strictEqual(result.content[0].text, 'No events found for the specified criteria.');
  });

  it('should format events with all details', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockCalendars: Calendar[] = [
      {
        id: 'primary',
        summary: 'Work',
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
    ];

    const mockEvents: CalendarEvent[] = [
      {
        id: 'event1',
        summary: 'Team standup',
        start: {
          dateTime: '2026-02-20T10:00:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: '2026-02-20T10:30:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        calendarId: 'primary',
        location: 'Zoom',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=abc',
      },
    ];

    mockFetch(
      { items: mockCalendars },
      200,
      [
        { response: { items: mockEvents }, status: 200 },
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleListEvents({});

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Found 1 event:'));
    assert.ok(result.content[0].text.includes('Team standup'));
    assert.ok(result.content[0].text.includes('Calendar: Work'));
    assert.ok(result.content[0].text.includes('Location: Zoom'));
  });

  it('should filter by calendar_id when specified', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockCalendars: Calendar[] = [
      {
        id: 'work@example.com',
        summary: 'Work',
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
      {
        id: 'personal@example.com',
        summary: 'Personal',
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
    ];

    const mockEvents1: CalendarEvent[] = [
      {
        id: 'event1',
        summary: 'Work event',
        start: { dateTime: '2026-02-20T10:00:00-08:00' },
        end: { dateTime: '2026-02-20T11:00:00-08:00' },
        calendarId: 'work@example.com',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=abc',
      },
    ];

    const mockEvents2: CalendarEvent[] = [
      {
        id: 'event2',
        summary: 'Personal event',
        start: { dateTime: '2026-02-20T14:00:00-08:00' },
        end: { dateTime: '2026-02-20T15:00:00-08:00' },
        calendarId: 'personal@example.com',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=def',
      },
    ];

    mockFetch(
      { items: mockCalendars },
      200,
      [
        { response: { items: mockEvents1 }, status: 200 },
        { response: { items: mockEvents2 }, status: 200 },
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleListEvents({
      calendar_id: 'work@example.com',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Found 1 event:'));
    assert.ok(result.content[0].text.includes('Work event'));
    assert.ok(!result.content[0].text.includes('Personal event'));
  });

  it('should handle auth errors with actionable message', async () => {
    const userEmail = 'test@example.com';

    // Mock KV to return null (no tokens)
    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => null,
        put: async () => {},
      },
    };

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleListEvents({});

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Google account not connected'));
    assert.ok(result.content[0].text.includes('https://test.example.com/google/auth'));
  });

  it('should handle all-day events correctly', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockCalendars: Calendar[] = [
      {
        id: 'primary',
        summary: 'Calendar',
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
    ];

    const mockEvents: CalendarEvent[] = [
      {
        id: 'event1',
        summary: 'All-day event',
        start: { date: '2026-02-20' },
        end: { date: '2026-02-21' },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=abc',
      },
    ];

    mockFetch(
      { items: mockCalendars },
      200,
      [
        { response: { items: mockEvents }, status: 200 },
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleListEvents({});

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('All day'));
  });

  it('should use default date_range of "next 7 days"', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    const mockCalendars: Calendar[] = [
      {
        id: 'primary',
        summary: 'Work',
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
    ];

    const capturedUrls: string[] = [];
    let callCount = 0;
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrls.push(url.toString());
      callCount++;

      // First call is calendar list, second is events
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: mockCalendars }),
          text: async () => JSON.stringify({ items: mockCalendars }),
        } as Response;
      } else {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
          text: async () => '{"items":[]}',
        } as Response;
      }
    }) as typeof fetch;

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    await (mcpServer as any).handleListEvents({});

    // Verify at least one URL includes timeMin and timeMax parameters
    const hasTimeParams = capturedUrls.some(url =>
      url.includes('timeMin=') && url.includes('timeMax=')
    );
    assert.ok(hasTimeParams, 'Should include timeMin and timeMax parameters');
  });
});
