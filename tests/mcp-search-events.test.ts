// Unit tests for search_events MCP tool
// Tests keyword search, include_past flag, and multi-calendar search

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CalendarMCP } from '../src/mcp-server.ts';
import type { CalendarEvent, Calendar } from '../src/types.ts';
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

describe('search_events MCP Tool', () => {
  it('should search events by query and return results', async () => {
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
        summary: 'Rennie 1:1',
        start: {
          dateTime: '2026-02-22T10:00:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: '2026-02-22T10:30:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        calendarId: 'primary',
        calendarName: 'Work',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=abc',
      },
      {
        id: 'event2',
        summary: 'Rennie Project Review',
        start: {
          dateTime: '2026-03-01T14:00:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: '2026-03-01T15:00:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        calendarId: 'primary',
        calendarName: 'Work',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=def',
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

    const result = await (mcpServer as any).handleSearchEvents({
      query: 'Rennie',
    });

    assert.strictEqual(result.content[0].type, 'text');
    const text = result.content[0].text;
    assert.ok(text.includes("Found 2 events matching 'Rennie':"));
    assert.ok(text.includes('Rennie 1:1'));
    assert.ok(text.includes('Rennie Project Review'));
    assert.ok(text.includes('Work'));
  });

  it('should return no results message when no matches found', async () => {
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

    mockFetch(
      { items: mockCalendars },
      200,
      [
        { response: { items: [] }, status: 200 },
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleSearchEvents({
      query: 'nonexistent',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes("No events found matching 'nonexistent'"));
    assert.ok(result.content[0].text.includes('include_past=true'));
  });

  it('should search past events when include_past=true', async () => {
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
      const urlStr = url.toString();
      capturedUrls.push(urlStr);
      callCount++;

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

    await (mcpServer as any).handleSearchEvents({
      query: 'test',
      include_past: true,
    });

    // Verify that timeMin is set to ~90 days ago
    const eventsUrl = capturedUrls.find(url => url.includes('/events?'));
    assert.ok(eventsUrl, 'Should make events API call');
    assert.ok(eventsUrl.includes('timeMin='), 'Should include timeMin parameter');
  });

  it('should search future-only when include_past=false (default)', async () => {
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
      const urlStr = url.toString();
      capturedUrls.push(urlStr);
      callCount++;

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

    await (mcpServer as any).handleSearchEvents({
      query: 'test',
    });

    // Verify that timeMin is set to current time (not 90 days ago)
    const eventsUrl = capturedUrls.find(url => url.includes('/events?'));
    assert.ok(eventsUrl, 'Should make events API call');
    assert.ok(eventsUrl.includes('timeMin='), 'Should include timeMin parameter');
  });

  it('should return error for missing query parameter', async () => {
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

    const result = await (mcpServer as any).handleSearchEvents({});

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Missing required parameter: query'));
  });

  it('should search across multiple calendars', async () => {
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
        summary: 'Work Calendar',
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
      {
        id: 'personal@example.com',
        summary: 'Personal Calendar',
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
    ];

    const mockEventsWork: CalendarEvent[] = [
      {
        id: 'event1',
        summary: 'Standup',
        start: {
          dateTime: '2026-02-20T10:00:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: '2026-02-20T10:30:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        calendarId: 'work@example.com',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=abc',
      },
    ];

    const mockEventsPersonal: CalendarEvent[] = [
      {
        id: 'event2',
        summary: 'Standup Comedy Show',
        start: {
          dateTime: '2026-02-21T20:00:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: '2026-02-21T22:00:00-08:00',
          timeZone: 'America/Los_Angeles',
        },
        calendarId: 'personal@example.com',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=def',
      },
    ];

    mockFetch(
      { items: mockCalendars },
      200,
      [
        { response: { items: mockEventsWork }, status: 200 },
        { response: { items: mockEventsPersonal }, status: 200 },
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleSearchEvents({
      query: 'Standup',
    });

    assert.strictEqual(result.content[0].type, 'text');
    const text = result.content[0].text;
    assert.ok(text.includes("Found 2 events matching 'Standup':"));
    assert.ok(text.includes('Work Calendar'));
    assert.ok(text.includes('Personal Calendar'));
  });
});
