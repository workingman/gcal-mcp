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

  describe('error handling', () => {
    it('should throw error on 401 response', async () => {
      mockFetch({ error: { message: 'Invalid credentials' } }, 401);

      await assert.rejects(
        async () => listEvents('invalid_token', {}),
        /Google Calendar API error \(401\)/,
        'Should throw on 401 response'
      );
    });
  });
});
