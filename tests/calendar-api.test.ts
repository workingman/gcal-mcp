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
  listAllEvents,
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

    it('should filter events by keyword using q parameter', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: 'event1',
          summary: 'Team Meeting',
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
        q: 'meeting',
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].summary, 'Team Meeting');
    });

    it('should filter events by attendee email', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: 'event1',
          summary: 'Meeting with John',
          start: { dateTime: '2026-02-20T10:00:00-08:00' },
          end: { dateTime: '2026-02-20T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event1',
          attendees: [
            { email: 'john@example.com', displayName: 'John Doe' },
            { email: 'alice@example.com', displayName: 'Alice Smith' },
          ],
        },
        {
          id: 'event2',
          summary: 'Meeting with Bob',
          start: { dateTime: '2026-02-21T10:00:00-08:00' },
          end: { dateTime: '2026-02-21T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event2',
          attendees: [
            { email: 'bob@example.com', displayName: 'Bob Johnson' },
          ],
        },
      ];

      mockFetch({ items: mockEvents });

      const events = await listEvents('test_token', {
        calendarId: 'primary',
        attendee: 'john@example.com',
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].id, 'event1');
      assert.strictEqual(events[0].summary, 'Meeting with John');
    });

    it('should filter events by attendee display name', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: 'event1',
          summary: 'Meeting with Alice',
          start: { dateTime: '2026-02-20T10:00:00-08:00' },
          end: { dateTime: '2026-02-20T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event1',
          attendees: [
            { email: 'alice@example.com', displayName: 'Alice Smith' },
          ],
        },
        {
          id: 'event2',
          summary: 'Solo meeting',
          start: { dateTime: '2026-02-21T10:00:00-08:00' },
          end: { dateTime: '2026-02-21T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event2',
        },
      ];

      mockFetch({ items: mockEvents });

      const events = await listEvents('test_token', {
        calendarId: 'primary',
        attendee: 'Alice',
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].id, 'event1');
    });

    it('should warn when exceeding 1000 event limit', async () => {
      const mockEvents: CalendarEvent[] = Array.from({ length: 500 }, (_, i) => ({
        id: `event${i}`,
        summary: `Event ${i}`,
        start: { dateTime: '2026-02-20T10:00:00-08:00' },
        end: { dateTime: '2026-02-20T11:00:00-08:00' },
        calendarId: 'primary',
        status: 'confirmed' as const,
        htmlLink: `https://calendar.google.com/event?eid=event${i}`,
      }));

      let warnCalled = false;
      const originalWarn = console.warn;
      console.warn = (message: string) => {
        if (message.includes('More events available')) {
          warnCalled = true;
        }
      };

      mockFetch(
        { items: mockEvents, nextPageToken: 'token1' },
        200,
        [
          { response: { items: mockEvents, nextPageToken: 'token2' }, status: 200 },
          { response: { items: mockEvents, nextPageToken: 'token3' }, status: 200 },
        ]
      );

      const events = await listEvents('test_token', { calendarId: 'primary' });

      console.warn = originalWarn;

      assert.strictEqual(events.length, 1000, 'Should return max 1000 events');
      assert.strictEqual(warnCalled, true, 'Should warn about additional events');
    });
  });

  describe('getEvent', () => {
    it('should retrieve a single event by ID with calendar name', async () => {
      const mockEvent: CalendarEvent = {
        id: 'event123',
        summary: 'Single Event',
        start: { dateTime: '2026-02-20T10:00:00-08:00' },
        end: { dateTime: '2026-02-20T11:00:00-08:00' },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=event123',
      };

      const mockCalendars: Calendar[] = [
        {
          id: 'primary',
          summary: 'My Calendar',
          timeZone: 'America/Vancouver',
          primary: true,
          accessRole: 'owner',
        },
      ];

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: mockCalendars }),
            text: async () => JSON.stringify({ items: mockCalendars }),
          } as Response;
        } else if (urlStr.includes('/events/event123')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockEvent,
            text: async () => JSON.stringify(mockEvent),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const event = await getEvent('test_token', 'event123');

      assert.strictEqual(event.id, 'event123');
      assert.strictEqual(event.summary, 'Single Event');
      assert.strictEqual(event.calendarName, 'My Calendar');
      assert.strictEqual(event.calendarId, 'primary');
    });

    it('should throw GoogleApiNotFoundError on 404', async () => {
      mockFetch({ error: { message: 'Not found' } }, 404);

      await assert.rejects(
        async () => getEvent('test_token', 'nonexistent'),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiNotFoundError');
          return true;
        },
        'Should throw GoogleApiNotFoundError on 404'
      );
    });

    it('should return cancelled event with status="cancelled"', async () => {
      const mockCancelledEvent: CalendarEvent = {
        id: 'event456',
        summary: 'Cancelled Meeting',
        start: { dateTime: '2026-02-20T10:00:00-08:00' },
        end: { dateTime: '2026-02-20T11:00:00-08:00' },
        calendarId: 'primary',
        status: 'cancelled',
        htmlLink: 'https://calendar.google.com/event?eid=event456',
      };

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [] }),
            text: async () => JSON.stringify({ items: [] }),
          } as Response;
        } else if (urlStr.includes('/events/event456')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockCancelledEvent,
            text: async () => JSON.stringify(mockCancelledEvent),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const event = await getEvent('test_token', 'event456');

      assert.strictEqual(event.id, 'event456');
      assert.strictEqual(event.status, 'cancelled');
    });

    it('should return recurring event with recurringEventId', async () => {
      const mockRecurringEvent: CalendarEvent = {
        id: 'event789_20260220',
        summary: 'Weekly Standup',
        start: { dateTime: '2026-02-20T09:00:00-08:00' },
        end: { dateTime: '2026-02-20T09:30:00-08:00' },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=event789',
        recurringEventId: 'event789',
      };

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [] }),
            text: async () => JSON.stringify({ items: [] }),
          } as Response;
        } else if (urlStr.includes('/events/event789_20260220')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockRecurringEvent,
            text: async () => JSON.stringify(mockRecurringEvent),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const event = await getEvent('test_token', 'event789_20260220');

      assert.strictEqual(event.id, 'event789_20260220');
      assert.strictEqual(event.recurringEventId, 'event789');
      assert.strictEqual(event.summary, 'Weekly Standup');
    });

    it('should include all event details (attendees, location, description)', async () => {
      const mockDetailedEvent: CalendarEvent = {
        id: 'event999',
        summary: 'Team Meeting',
        description: 'Quarterly planning session',
        location: 'Conference Room A',
        start: { dateTime: '2026-02-20T14:00:00-08:00', timeZone: 'America/Vancouver' },
        end: { dateTime: '2026-02-20T15:00:00-08:00', timeZone: 'America/Vancouver' },
        attendees: [
          { email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' },
          { email: 'bob@example.com', displayName: 'Bob', responseStatus: 'tentative' },
        ],
        organizer: { email: 'manager@example.com', displayName: 'Manager', self: true },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=event999',
      };

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [] }),
            text: async () => JSON.stringify({ items: [] }),
          } as Response;
        } else if (urlStr.includes('/events/event999')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockDetailedEvent,
            text: async () => JSON.stringify(mockDetailedEvent),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const event = await getEvent('test_token', 'event999');

      assert.strictEqual(event.id, 'event999');
      assert.strictEqual(event.description, 'Quarterly planning session');
      assert.strictEqual(event.location, 'Conference Room A');
      assert.strictEqual(event.attendees?.length, 2);
      assert.strictEqual(event.attendees?.[0].email, 'alice@example.com');
      assert.strictEqual(event.attendees?.[0].responseStatus, 'accepted');
      assert.strictEqual(event.organizer?.email, 'manager@example.com');
    });
  });

  describe('createEvent', () => {
    it('should create a new event with required fields', async () => {
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

    it('should create event with attendees properly formatted', async () => {
      const newEventData: Partial<CalendarEvent> = {
        summary: 'Team Sync',
        start: { dateTime: '2026-02-25T14:00:00-08:00' },
        end: { dateTime: '2026-02-25T15:00:00-08:00' },
        attendees: [
          { email: 'alice@example.com', displayName: 'Alice' },
          { email: 'bob@example.com' },
        ],
      };

      const createdEvent: CalendarEvent = {
        id: 'event_with_attendees',
        summary: 'Team Sync',
        start: { dateTime: '2026-02-25T14:00:00-08:00' },
        end: { dateTime: '2026-02-25T15:00:00-08:00' },
        attendees: newEventData.attendees,
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=event_with_attendees',
      };

      mockFetch(createdEvent);

      const event = await createEvent('test_token', 'primary', newEventData);

      assert.strictEqual(event.attendees?.length, 2);
      assert.strictEqual(event.attendees?.[0].email, 'alice@example.com');
      assert.strictEqual(event.attendees?.[1].email, 'bob@example.com');
    });

    it('should create event with optional fields (location, description)', async () => {
      const newEventData: Partial<CalendarEvent> = {
        summary: 'Client Meeting',
        description: 'Discuss Q1 roadmap',
        location: 'Conference Room B',
        start: { dateTime: '2026-02-25T14:00:00-08:00' },
        end: { dateTime: '2026-02-25T15:00:00-08:00' },
      };

      const createdEvent: CalendarEvent = {
        id: 'event_with_details',
        summary: 'Client Meeting',
        description: 'Discuss Q1 roadmap',
        location: 'Conference Room B',
        start: { dateTime: '2026-02-25T14:00:00-08:00' },
        end: { dateTime: '2026-02-25T15:00:00-08:00' },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=event_with_details',
      };

      mockFetch(createdEvent);

      const event = await createEvent('test_token', 'primary', newEventData);

      assert.strictEqual(event.description, 'Discuss Q1 roadmap');
      assert.strictEqual(event.location, 'Conference Room B');
    });

    it('should handle 400 error for invalid event data', async () => {
      mockFetch({ error: { message: 'Invalid event data' } }, 400);

      await assert.rejects(
        async () =>
          createEvent('test_token', 'primary', {
            summary: 'Invalid Event',
            // Missing required start/end
          } as Partial<CalendarEvent>),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiError');
          assert.strictEqual((error as any).statusCode, 400);
          return true;
        },
        'Should throw GoogleApiError on 400'
      );
    });

    it('should handle 403 error with permission message', async () => {
      mockFetch({ error: { message: 'Forbidden' } }, 403);

      await assert.rejects(
        async () =>
          createEvent('test_token', 'readonly@example.com', {
            summary: 'New Event',
            start: { dateTime: '2026-02-25T14:00:00-08:00' },
            end: { dateTime: '2026-02-25T15:00:00-08:00' },
          }),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiPermissionError');
          return true;
        },
        'Should throw GoogleApiPermissionError on 403'
      );
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

  describe('listAllEvents', () => {
    it('should fetch events from all calendars in parallel', async () => {
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

      const primaryEvents: CalendarEvent[] = [
        {
          id: 'event1',
          summary: 'Personal Event',
          start: { dateTime: '2026-02-20T10:00:00-08:00' },
          end: { dateTime: '2026-02-20T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event1',
        },
      ];

      const workEvents: CalendarEvent[] = [
        {
          id: 'event2',
          summary: 'Work Meeting',
          start: { dateTime: '2026-02-20T14:00:00-08:00' },
          end: { dateTime: '2026-02-20T15:00:00-08:00' },
          calendarId: 'work@example.com',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event2',
        },
      ];

      let callCount = 0;
      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        callCount++;
        const urlStr = url.toString();

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: mockCalendars }),
            text: async () => JSON.stringify({ items: mockCalendars }),
          } as Response;
        } else if (urlStr.includes('calendars/primary/events')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: primaryEvents }),
            text: async () => JSON.stringify({ items: primaryEvents }),
          } as Response;
        } else if (urlStr.includes('calendars/work%40example.com/events')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: workEvents }),
            text: async () => JSON.stringify({ items: workEvents }),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const events = await listAllEvents('test_token', {
        timeMin: '2026-02-20T00:00:00Z',
        timeMax: '2026-02-21T00:00:00Z',
      });

      assert.strictEqual(events.length, 2, 'Should return events from both calendars');
      assert.strictEqual(events[0].summary, 'Personal Event');
      assert.strictEqual(events[0].calendarName, 'Primary Calendar');
      assert.strictEqual(events[1].summary, 'Work Meeting');
      assert.strictEqual(events[1].calendarName, 'Work Calendar');
    });

    it('should handle partial failure gracefully', async () => {
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

      const primaryEvents: CalendarEvent[] = [
        {
          id: 'event1',
          summary: 'Personal Event',
          start: { dateTime: '2026-02-20T10:00:00-08:00' },
          end: { dateTime: '2026-02-20T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event1',
        },
      ];

      let errorLogged = false;
      const originalError = console.error;
      console.error = (message: string) => {
        if (message.includes('Failed to fetch events')) {
          errorLogged = true;
        }
      };

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: mockCalendars }),
            text: async () => JSON.stringify({ items: mockCalendars }),
          } as Response;
        } else if (urlStr.includes('calendars/primary/events')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: primaryEvents }),
            text: async () => JSON.stringify({ items: primaryEvents }),
          } as Response;
        } else if (urlStr.includes('calendars/work%40example.com/events')) {
          // Simulate 403 error for work calendar
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: { message: 'Forbidden' } }),
            text: async () => JSON.stringify({ error: { message: 'Forbidden' } }),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const events = await listAllEvents('test_token', {
        timeMin: '2026-02-20T00:00:00Z',
        timeMax: '2026-02-21T00:00:00Z',
      });

      console.error = originalError;

      assert.strictEqual(events.length, 1, 'Should return events from successful calendar only');
      assert.strictEqual(events[0].summary, 'Personal Event');
      assert.strictEqual(errorLogged, true, 'Should log error for failed calendar');
    });

    it('should sort events by start time across calendars', async () => {
      const mockCalendars: Calendar[] = [
        {
          id: 'cal1',
          summary: 'Calendar 1',
          timeZone: 'America/Vancouver',
          accessRole: 'owner',
        },
        {
          id: 'cal2',
          summary: 'Calendar 2',
          timeZone: 'America/Vancouver',
          accessRole: 'writer',
        },
      ];

      const cal1Events: CalendarEvent[] = [
        {
          id: 'event1',
          summary: 'Later Event',
          start: { dateTime: '2026-02-20T15:00:00-08:00' },
          end: { dateTime: '2026-02-20T16:00:00-08:00' },
          calendarId: 'cal1',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event1',
        },
      ];

      const cal2Events: CalendarEvent[] = [
        {
          id: 'event2',
          summary: 'Earlier Event',
          start: { dateTime: '2026-02-20T09:00:00-08:00' },
          end: { dateTime: '2026-02-20T10:00:00-08:00' },
          calendarId: 'cal2',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event2',
        },
      ];

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: mockCalendars }),
            text: async () => JSON.stringify({ items: mockCalendars }),
          } as Response;
        } else if (urlStr.includes('calendars/cal1/events')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: cal1Events }),
            text: async () => JSON.stringify({ items: cal1Events }),
          } as Response;
        } else if (urlStr.includes('calendars/cal2/events')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: cal2Events }),
            text: async () => JSON.stringify({ items: cal2Events }),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const events = await listAllEvents('test_token', {});

      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].summary, 'Earlier Event', 'First event should be earlier one');
      assert.strictEqual(events[1].summary, 'Later Event', 'Second event should be later one');
    });

    it('should warn when user has more than 10 calendars', async () => {
      const mockCalendars: Calendar[] = Array.from({ length: 15 }, (_, i) => ({
        id: `cal${i}`,
        summary: `Calendar ${i}`,
        timeZone: 'America/Vancouver',
        accessRole: 'owner' as const,
      }));

      let warnCalled = false;
      const originalWarn = console.warn;
      console.warn = (message: string) => {
        if (message.includes('15 calendars') && message.includes('first 10 only')) {
          warnCalled = true;
        }
      };

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: mockCalendars }),
            text: async () => JSON.stringify({ items: mockCalendars }),
          } as Response;
        } else {
          // Return empty events for all calendars
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [] }),
            text: async () => JSON.stringify({ items: [] }),
          } as Response;
        }
      }) as typeof fetch;

      await listAllEvents('test_token', {});

      console.warn = originalWarn;

      assert.strictEqual(warnCalled, true, 'Should warn about >10 calendars');
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
    it('should list all accessible calendars without cache', async () => {
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

    it('should return cached calendar list when cache is fresh', async () => {
      const mockCalendars: Calendar[] = [
        {
          id: 'primary',
          summary: 'Cached Calendar',
          timeZone: 'America/Vancouver',
          primary: true,
          accessRole: 'owner',
        },
      ];

      const mockKV = {
        get: async (key: string) => {
          if (key === 'calendar_list:test_user_hash') {
            return JSON.stringify({
              data: mockCalendars,
              timestamp: Date.now() - 1000, // 1 second ago (fresh)
            });
          }
          return null;
        },
        put: async () => {},
      };

      let fetchCalled = false;
      globalThis.fetch = (async (): Promise<Response> => {
        fetchCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
          text: async () => JSON.stringify({ items: [] }),
        } as Response;
      }) as typeof fetch;

      const calendars = await listCalendars('test_token', {
        kv: mockKV,
        userIdHash: 'test_user_hash',
      });

      assert.strictEqual(fetchCalled, false, 'Should not call API when cache is fresh');
      assert.strictEqual(calendars.length, 1);
      assert.strictEqual(calendars[0].summary, 'Cached Calendar');
    });

    it('should fetch from API when cache is stale', async () => {
      const mockCalendars: Calendar[] = [
        {
          id: 'primary',
          summary: 'Fresh Calendar',
          timeZone: 'America/Vancouver',
          primary: true,
          accessRole: 'owner',
        },
      ];

      let putCalled = false;
      const mockKV = {
        get: async (key: string) => {
          if (key === 'calendar_list:test_user_hash') {
            return JSON.stringify({
              data: [],
              timestamp: Date.now() - 3700000, // >1 hour ago (stale)
            });
          }
          return null;
        },
        put: async (key: string, value: string) => {
          putCalled = true;
          const parsed = JSON.parse(value);
          assert.ok(parsed.data, 'Cache should include data');
          assert.ok(parsed.timestamp, 'Cache should include timestamp');
        },
      };

      mockFetch({ items: mockCalendars });

      const calendars = await listCalendars('test_token', {
        kv: mockKV,
        userIdHash: 'test_user_hash',
      });

      assert.strictEqual(putCalled, true, 'Should update cache after API fetch');
      assert.strictEqual(calendars.length, 1);
      assert.strictEqual(calendars[0].summary, 'Fresh Calendar');
    });

    it('should fetch from API when cache is empty', async () => {
      const mockCalendars: Calendar[] = [
        {
          id: 'primary',
          summary: 'New Calendar',
          timeZone: 'America/Vancouver',
          primary: true,
          accessRole: 'owner',
        },
      ];

      let putCalled = false;
      const mockKV = {
        get: async () => null, // No cache
        put: async (key: string, value: string) => {
          putCalled = true;
        },
      };

      mockFetch({ items: mockCalendars });

      const calendars = await listCalendars('test_token', {
        kv: mockKV,
        userIdHash: 'test_user_hash',
      });

      assert.strictEqual(putCalled, true, 'Should populate cache after API fetch');
      assert.strictEqual(calendars.length, 1);
      assert.strictEqual(calendars[0].summary, 'New Calendar');
    });

    it('should handle 403 error from API with clear message', async () => {
      mockFetch({ error: { message: 'Forbidden' } }, 403);

      await assert.rejects(
        async () => listCalendars('test_token'),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiPermissionError');
          return true;
        },
        'Should throw GoogleApiPermissionError on 403'
      );
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
