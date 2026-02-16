// Unit tests for get_event MCP tool
// Tests event retrieval, formatting, and error handling

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

describe('get_event MCP Tool', () => {
  it('should retrieve and format full event details', async () => {
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

    const mockEvent: CalendarEvent = {
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
      description: 'Daily team sync',
      attendees: [
        { email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' },
        { email: 'bob@example.com', displayName: 'Bob', responseStatus: 'tentative' },
      ],
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
    };

    mockFetch(
      mockEvent,
      200,
      [
        { response: { items: mockCalendars }, status: 200 },
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetEvent({
      event_id: 'event1',
    });

    assert.strictEqual(result.content[0].type, 'text');
    const text = result.content[0].text;
    assert.ok(text.includes('Event: Team standup'));
    assert.ok(text.includes('Calendar: Work'));
    assert.ok(text.includes('Location: Zoom'));
    assert.ok(text.includes('Description:'));
    assert.ok(text.includes('Daily team sync'));
    assert.ok(text.includes('Attendees:'));
    assert.ok(text.includes('Alice'));
    assert.ok(text.includes('Bob'));
    assert.ok(text.includes('https://calendar.google.com/event?eid=abc'));
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
        summary: 'Personal',
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
    ];

    const mockEvent: CalendarEvent = {
      id: 'event1',
      summary: 'Birthday',
      start: { date: '2026-02-20' },
      end: { date: '2026-02-21' },
      calendarId: 'primary',
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
    };

    mockFetch(
      mockEvent,
      200,
      [
        { response: { items: mockCalendars }, status: 200 },
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetEvent({
      event_id: 'event1',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('All day'));
  });

  it('should handle recurring event instances', async () => {
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

    const mockEvent: CalendarEvent = {
      id: 'event1_instance',
      summary: 'Weekly meeting',
      start: {
        dateTime: '2026-02-20T14:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: '2026-02-20T15:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      calendarId: 'primary',
      recurringEventId: 'weekly_meeting_series',
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
    };

    mockFetch(
      mockEvent,
      200,
      [
        { response: { items: mockCalendars }, status: 200 },
      ]
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetEvent({
      event_id: 'event1_instance',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Part of recurring series'));
    assert.ok(result.content[0].text.includes('weekly_meeting_series'));
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

    const result = await (mcpServer as any).handleGetEvent({});

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Missing required parameter: event_id'));
  });

  it('should handle event not found (404)', async () => {
    const userEmail = 'test@example.com';
    const encrypted = await setupMockTokens(userEmail);

    const testEnv = {
      ...mockEnv,
      GOOGLE_TOKENS_KV: {
        get: async () => JSON.stringify(encrypted),
        put: async () => {},
      },
    };

    mockFetch(
      { error: { message: 'Not Found' } },
      404
    );

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetEvent({
      event_id: 'nonexistent',
    });

    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Not Found') || result.content[0].text.includes('404'));
  });

  it('should use specified calendar_id', async () => {
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
    ];

    const mockEvent: CalendarEvent = {
      id: 'event1',
      summary: 'Work event',
      start: {
        dateTime: '2026-02-20T10:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: '2026-02-20T11:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      calendarId: 'work@example.com',
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
    };

    const capturedUrls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      capturedUrls.push(urlStr);
      if (urlStr.includes('calendarList')) {
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
          json: async () => mockEvent,
          text: async () => JSON.stringify(mockEvent),
        } as Response;
      }
    }) as typeof fetch;

    const mcpServer = new CalendarMCP({} as any, testEnv as any);
    (mcpServer as any).props = { userEmail };

    const result = await (mcpServer as any).handleGetEvent({
      event_id: 'event1',
      calendar_id: 'work@example.com',
    });

    assert.strictEqual(result.content[0].type, 'text');
    // Check that at least one URL includes the calendar_id
    const hasCalendarId = capturedUrls.some(url => url.includes('work%40example.com') || url.includes('work@example.com'));
    assert.ok(hasCalendarId, 'Should use specified calendar_id in API call');
  });
});
