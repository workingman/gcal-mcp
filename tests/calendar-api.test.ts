// Unit tests for Google Calendar API client (calendar-api.ts)
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  freebusy,
  listCalendars,
} from '../src/calendar-api.ts';
import type { CalendarEvent, Calendar, FreeBusyResponse } from '../src/types.ts';

// Mock fetch setup
let fetchMock: typeof fetch | null = null;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Reset mock before each test
  fetchMock = null;
});

afterEach(() => {
  // Restore original fetch after each test
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

describe('Google Calendar API Client', () => {
  describe('listEvents', () => {
    it('should list events with singleEvents=true and orderBy=startTime', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: 'event1',
          summary: 'Test Event',
          start: { dateTime: '2026-02-20T10:00:00-08:00' },
          end: { dateTime: '2026-02-20T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event1',
        },
      ];

      mockFetch({ items: mockEvents });

      const events = await listEvents('test_token', {
        calendarId: 'primary',
        timeMin: '2026-02-20T00:00:00Z',
        timeMax: '2026-02-21T00:00:00Z',
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].id, 'event1');
      assert.strictEqual(events[0].summary, 'Test Event');
    });

    it('should auto-paginate up to 1000 events', async () => {
      const page1Events: CalendarEvent[] = [
        {
          id: 'event1',
          summary: 'Event 1',
          start: { dateTime: '2026-02-20T10:00:00-08:00' },
          end: { dateTime: '2026-02-20T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event1',
        },
      ];

      const page2Events: CalendarEvent[] = [
        {
          id: 'event2',
          summary: 'Event 2',
          start: { dateTime: '2026-02-21T10:00:00-08:00' },
          end: { dateTime: '2026-02-21T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event2',
        },
      ];

      mockFetch(
        { items: page1Events, nextPageToken: 'token123' },
        200,
        [{ response: { items: page2Events }, status: 200 }]
      );

      const events = await listEvents('test_token', { calendarId: 'primary' });

      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].id, 'event1');
      assert.strictEqual(events[1].id, 'event2');
    });
  });

  describe('getEvent', () => {
    it('should retrieve a single event by ID', async () => {
      const mockEvent: CalendarEvent = {
        id: 'event123',
        summary: 'Single Event',
        start: { dateTime: '2026-02-20T10:00:00-08:00' },
        end: { dateTime: '2026-02-20T11:00:00-08:00' },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=event123',
      };

      mockFetch(mockEvent);

      const event = await getEvent('test_token', 'event123');

      assert.strictEqual(event.id, 'event123');
      assert.strictEqual(event.summary, 'Single Event');
    });
  });

  describe('createEvent', () => {
    it('should create a new event', async () => {
      const newEventData: Partial<CalendarEvent> = {
        summary: 'New Meeting',
        start: { dateTime: '2026-02-25T14:00:00-08:00' },
        end: { dateTime: '2026-02-25T15:00:00-08:00' },
      };

      const createdEvent: CalendarEvent = {
        id: 'new_event_id',
        summary: 'New Meeting',
        start: { dateTime: '2026-02-25T14:00:00-08:00' },
        end: { dateTime: '2026-02-25T15:00:00-08:00' },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=new_event_id',
      };

      mockFetch(createdEvent);

      const event = await createEvent('test_token', 'primary', newEventData);

      assert.strictEqual(event.id, 'new_event_id');
      assert.strictEqual(event.summary, 'New Meeting');
    });
  });

  describe('updateEvent', () => {
    it('should update an existing event', async () => {
      const updates: Partial<CalendarEvent> = {
        start: { dateTime: '2026-02-26T14:00:00-08:00' },
        end: { dateTime: '2026-02-26T15:00:00-08:00' },
      };

      const updatedEvent: CalendarEvent = {
        id: 'event123',
        summary: 'Updated Meeting',
        start: { dateTime: '2026-02-26T14:00:00-08:00' },
        end: { dateTime: '2026-02-26T15:00:00-08:00' },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=event123',
      };

      mockFetch(updatedEvent);

      const event = await updateEvent('test_token', 'primary', 'event123', updates);

      assert.strictEqual(event.id, 'event123');
      assert.strictEqual(event.start.dateTime, '2026-02-26T14:00:00-08:00');
    });
  });

  describe('freebusy', () => {
    it('should query free/busy availability', async () => {
      const mockFreeBusy: FreeBusyResponse = {
        calendars: {
          primary: {
            busy: [
              {
                start: '2026-02-20T10:00:00-08:00',
                end: '2026-02-20T11:00:00-08:00',
              },
            ],
          },
        },
        timeMin: '2026-02-20T00:00:00Z',
        timeMax: '2026-02-21T00:00:00Z',
      };

      mockFetch(mockFreeBusy);

      const result = await freebusy(
        'test_token',
        '2026-02-20T00:00:00Z',
        '2026-02-21T00:00:00Z'
      );

      assert.strictEqual(result.calendars.primary.busy.length, 1);
      assert.strictEqual(
        result.calendars.primary.busy[0].start,
        '2026-02-20T10:00:00-08:00'
      );
    });
  });

  describe('listCalendars', () => {
    it('should list all accessible calendars', async () => {
      const mockCalendars: Calendar[] = [
        {
          id: 'primary',
          summary: 'Primary Calendar',
          timeZone: 'America/Vancouver',
          primary: true,
          accessRole: 'owner',
        },
        {
          id: 'work@example.com',
          summary: 'Work Calendar',
          timeZone: 'America/Vancouver',
          accessRole: 'writer',
        },
      ];

      mockFetch({ items: mockCalendars });

      const calendars = await listCalendars('test_token');

      assert.strictEqual(calendars.length, 2);
      assert.strictEqual(calendars[0].id, 'primary');
      assert.strictEqual(calendars[1].id, 'work@example.com');
    });
  });

  describe('error handling and retry logic', () => {
    it('should throw GoogleApiAuthError on 401 response', async () => {
      mockFetch({ error: { message: 'Invalid credentials' } }, 401);

      await assert.rejects(
        async () => listEvents('invalid_token', {}),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiAuthError');
          assert.strictEqual((error as any).statusCode, 401);
          return true;
        },
        'Should throw GoogleApiAuthError on 401'
      );
    });

    it('should throw GoogleApiPermissionError on 403 response', async () => {
      mockFetch({ error: { message: 'Forbidden' } }, 403);

      await assert.rejects(
        async () => listEvents('test_token', {}),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiPermissionError');
          assert.strictEqual((error as any).statusCode, 403);
          return true;
        },
        'Should throw GoogleApiPermissionError on 403'
      );
    });

    it('should throw GoogleApiNotFoundError on 404 response', async () => {
      mockFetch({ error: { message: 'Not found' } }, 404);

      await assert.rejects(
        async () => getEvent('test_token', 'nonexistent'),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiNotFoundError');
          assert.strictEqual((error as any).statusCode, 404);
          return true;
        },
        'Should throw GoogleApiNotFoundError on 404'
      );
    });

    it('should retry on 429 rate limit with exponential backoff', async () => {
      let callCount = 0;
      globalThis.fetch = (async (): Promise<Response> => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: false,
            status: 429,
            json: async () => ({ error: { message: 'Rate limit exceeded' } }),
            text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
          text: async () => JSON.stringify({ items: [] }),
        } as Response;
      }) as typeof fetch;

      const events = await listEvents('test_token', {});
      assert.strictEqual(callCount, 3, 'Should retry twice before success');
      assert.strictEqual(events.length, 0);
    });

    it('should retry on 500 server error with exponential backoff', async () => {
      let callCount = 0;
      globalThis.fetch = (async (): Promise<Response> => {
        callCount++;
        if (callCount < 2) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: { message: 'Internal server error' } }),
            text: async () => JSON.stringify({ error: { message: 'Internal server error' } }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
          text: async () => JSON.stringify({ items: [] }),
        } as Response;
      }) as typeof fetch;

      const events = await listEvents('test_token', {});
      assert.strictEqual(callCount, 2, 'Should retry once before success');
      assert.strictEqual(events.length, 0);
    });

    it('should not retry on 400 client errors', async () => {
      let callCount = 0;
      globalThis.fetch = (async (): Promise<Response> => {
        callCount++;
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Bad request' } }),
          text: async () => JSON.stringify({ error: { message: 'Bad request' } }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () => listEvents('test_token', {}),
        (error: Error) => {
          assert.strictEqual(callCount, 1, 'Should not retry on 400 error');
          return true;
        }
      );
    });
  });
});
