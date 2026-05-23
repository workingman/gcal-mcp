// Integration tests for Google Calendar API client
// Tests realistic end-to-end scenarios with multi-step operations
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  listCalendars,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  freebusy,
  listAllEvents,
} from '../src/calendar-api.ts';
import type { CalendarEvent, Calendar, FreeBusyResponse } from '../src/types.ts';

// Mock fetch setup
const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Reset before each test
});

afterEach(() => {
  // Restore original fetch after each test
  globalThis.fetch = originalFetch;
});

describe('Google Calendar API Integration Tests', () => {
  describe('Multi-calendar workflow', () => {
    it('should list calendars, then fetch events from each calendar', async () => {
      const mockCalendars: Calendar[] = [
        {
          id: 'primary',
          summary: 'Personal Calendar',
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
          id: 'personal1',
          summary: 'Personal Meeting',
          start: { dateTime: '2026-02-20T10:00:00-08:00' },
          end: { dateTime: '2026-02-20T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=personal1',
        },
      ];

      const workEvents: CalendarEvent[] = [
        {
          id: 'work1',
          summary: 'Work Meeting',
          start: { dateTime: '2026-02-20T14:00:00-08:00' },
          end: { dateTime: '2026-02-20T15:00:00-08:00' },
          calendarId: 'work@example.com',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=work1',
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

      // Step 1: List all calendars
      const calendars = await listCalendars('test_token');
      assert.strictEqual(calendars.length, 2);

      // Step 2: Fetch events from first calendar
      const personalEvents = await listEvents('test_token', {
        calendarId: calendars[0].id,
      });
      assert.strictEqual(personalEvents.length, 1);
      assert.strictEqual(personalEvents[0].summary, 'Personal Meeting');

      // Step 3: Fetch events from second calendar
      const workEventsResult = await listEvents('test_token', {
        calendarId: calendars[1].id,
      });
      assert.strictEqual(workEventsResult.length, 1);
      assert.strictEqual(workEventsResult[0].summary, 'Work Meeting');
    });
  });

  describe('Event CRUD lifecycle', () => {
    it('should create, retrieve, update, and verify an event', async () => {
      const createdEvent: CalendarEvent = {
        id: 'new_event_123',
        summary: 'New Meeting',
        start: { dateTime: '2026-02-25T14:00:00-08:00' },
        end: { dateTime: '2026-02-25T15:00:00-08:00' },
        calendarId: 'primary',
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event?eid=new_event_123',
      };

      const updatedEvent: CalendarEvent = {
        ...createdEvent,
        start: { dateTime: '2026-02-26T14:00:00-08:00' },
        end: { dateTime: '2026-02-26T15:00:00-08:00' },
      };

      let step = 0;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const urlStr = url.toString();
        const method = init?.method || 'GET';

        if (urlStr.includes('/calendarList')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: [] }),
            text: async () => JSON.stringify({ items: [] }),
          } as Response;
        }

        if (method === 'POST' && urlStr.includes('/events') && step === 0) {
          // Create event
          step++;
          return {
            ok: true,
            status: 200,
            json: async () => createdEvent,
            text: async () => JSON.stringify(createdEvent),
          } as Response;
        }

        if (method === 'GET' && urlStr.includes('/events/new_event_123') && step === 1) {
          // Get event
          step++;
          return {
            ok: true,
            status: 200,
            json: async () => createdEvent,
            text: async () => JSON.stringify(createdEvent),
          } as Response;
        }

        if (method === 'PATCH' && urlStr.includes('/events/new_event_123') && step === 2) {
          // Update event
          step++;
          return {
            ok: true,
            status: 200,
            json: async () => updatedEvent,
            text: async () => JSON.stringify(updatedEvent),
          } as Response;
        }

        if (method === 'GET' && urlStr.includes('/events/new_event_123') && step === 3) {
          // Get updated event
          return {
            ok: true,
            status: 200,
            json: async () => updatedEvent,
            text: async () => JSON.stringify(updatedEvent),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      // Step 1: Create event
      const created = await createEvent('test_token', 'primary', {
        summary: 'New Meeting',
        start: { dateTime: '2026-02-25T14:00:00-08:00' },
        end: { dateTime: '2026-02-25T15:00:00-08:00' },
      });
      assert.strictEqual(created.id, 'new_event_123');

      // Step 2: Retrieve event
      const retrieved = await getEvent('test_token', 'new_event_123');
      assert.strictEqual(retrieved.id, created.id);
      assert.strictEqual(retrieved.start.dateTime, '2026-02-25T14:00:00-08:00');

      // Step 3: Update event (reschedule)
      const updated = await updateEvent('test_token', 'primary', 'new_event_123', {
        start: { dateTime: '2026-02-26T14:00:00-08:00' },
        end: { dateTime: '2026-02-26T15:00:00-08:00' },
      });
      assert.strictEqual(updated.start.dateTime, '2026-02-26T14:00:00-08:00');

      // Step 4: Verify update
      const verified = await getEvent('test_token', 'new_event_123');
      assert.strictEqual(verified.start.dateTime, '2026-02-26T14:00:00-08:00');
    });
  });

  describe('Recurring events expansion', () => {
    it('should expand recurring events into individual instances', async () => {
      const recurringInstances: CalendarEvent[] = [
        {
          id: 'recurring_20260220',
          summary: 'Weekly Standup',
          start: { dateTime: '2026-02-20T09:00:00-08:00' },
          end: { dateTime: '2026-02-20T09:30:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=recurring_20260220',
          recurringEventId: 'recurring_master',
        },
        {
          id: 'recurring_20260227',
          summary: 'Weekly Standup',
          start: { dateTime: '2026-02-27T09:00:00-08:00' },
          end: { dateTime: '2026-02-27T09:30:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=recurring_20260227',
          recurringEventId: 'recurring_master',
        },
      ];

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        // Verify singleEvents=true is set
        if (urlStr.includes('/events') && urlStr.includes('singleEvents=true')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: recurringInstances }),
            text: async () => JSON.stringify({ items: recurringInstances }),
          } as Response;
        }

        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'singleEvents required' } }),
          text: async () => JSON.stringify({ error: { message: 'singleEvents required' } }),
        } as Response;
      }) as typeof fetch;

      const events = await listEvents('test_token', {
        calendarId: 'primary',
        timeMin: '2026-02-20T00:00:00Z',
        timeMax: '2026-03-01T00:00:00Z',
      });

      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].recurringEventId, 'recurring_master');
      assert.strictEqual(events[1].recurringEventId, 'recurring_master');
      assert.notStrictEqual(events[0].id, events[1].id);
    });
  });

  describe('Free/busy availability query', () => {
    it('should query free/busy and identify available time slots', async () => {
      const mockFreeBusy: FreeBusyResponse = {
        calendars: {
          primary: {
            busy: [
              {
                start: '2026-02-20T10:00:00-08:00',
                end: '2026-02-20T11:00:00-08:00',
              },
              {
                start: '2026-02-20T14:00:00-08:00',
                end: '2026-02-20T15:00:00-08:00',
              },
            ],
          },
        },
        timeMin: '2026-02-20T09:00:00-08:00',
        timeMax: '2026-02-20T17:00:00-08:00',
      };

      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/freeBusy')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockFreeBusy,
            text: async () => JSON.stringify(mockFreeBusy),
          } as Response;
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const result = await freebusy(
        'test_token',
        '2026-02-20T09:00:00-08:00',
        '2026-02-20T17:00:00-08:00',
        { calendarIds: ['primary'] }
      );

      assert.strictEqual(result.calendars.primary.busy.length, 2);

      // Verify busy blocks
      const busyBlocks = result.calendars.primary.busy;
      assert.strictEqual(busyBlocks[0].start, '2026-02-20T10:00:00-08:00');
      assert.strictEqual(busyBlocks[0].end, '2026-02-20T11:00:00-08:00');
      assert.strictEqual(busyBlocks[1].start, '2026-02-20T14:00:00-08:00');
      assert.strictEqual(busyBlocks[1].end, '2026-02-20T15:00:00-08:00');

      // Calculate free slots (business logic that could use this data)
      const freeSlots = [];
      const queryStart = new Date('2026-02-20T09:00:00-08:00').getTime();
      const firstBusyStart = new Date(busyBlocks[0].start).getTime();

      if (queryStart < firstBusyStart) {
        freeSlots.push({
          start: '2026-02-20T09:00:00-08:00',
          end: busyBlocks[0].start,
        });
      }

      assert.strictEqual(freeSlots.length, 1, 'Should have one free slot before first busy block');
    });
  });

  describe('Pagination and large result sets', () => {
    it('should auto-paginate and aggregate results up to 1000 events', async () => {
      const generateEvents = (page: number, count: number): CalendarEvent[] => {
        return Array.from({ length: count }, (_, i) => ({
          id: `event_${page}_${i}`,
          summary: `Event ${page * count + i}`,
          start: { dateTime: '2026-02-20T10:00:00-08:00' },
          end: { dateTime: '2026-02-20T11:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed' as const,
          htmlLink: `https://calendar.google.com/event?eid=event_${page}_${i}`,
        }));
      };

      let pageCount = 0;
      globalThis.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = url.toString();

        if (urlStr.includes('/events')) {
          pageCount++;
          const isFirstPage = !urlStr.includes('pageToken');

          if (isFirstPage) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                items: generateEvents(0, 250),
                nextPageToken: 'page2',
              }),
              text: async () => JSON.stringify({
                items: generateEvents(0, 250),
                nextPageToken: 'page2',
              }),
            } as Response;
          } else if (urlStr.includes('pageToken=page2')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                items: generateEvents(1, 250),
                nextPageToken: 'page3',
              }),
              text: async () => JSON.stringify({
                items: generateEvents(1, 250),
                nextPageToken: 'page3',
              }),
            } as Response;
          } else {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                items: generateEvents(2, 250),
              }),
              text: async () => JSON.stringify({
                items: generateEvents(2, 250),
              }),
            } as Response;
          }
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '{}',
        } as Response;
      }) as typeof fetch;

      const events = await listEvents('test_token', {
        calendarId: 'primary',
      });

      assert.strictEqual(events.length, 750, 'Should fetch all 3 pages (750 events)');
      assert.ok(pageCount >= 3, 'Should make at least 3 API calls for pagination');
    });
  });

  describe('Error handling in real workflows', () => {
    it('should handle 404 when getting non-existent event', async () => {
      globalThis.fetch = (async (): Promise<Response> => {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: 'Not found' } }),
          text: async () => JSON.stringify({ error: { message: 'Not found' } }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () => getEvent('test_token', 'nonexistent'),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiNotFoundError');
          return true;
        }
      );
    });

    it('should handle 403 when attempting to create event on read-only calendar', async () => {
      globalThis.fetch = (async (): Promise<Response> => {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { message: 'Forbidden' } }),
          text: async () => JSON.stringify({ error: { message: 'Forbidden' } }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () =>
          createEvent('test_token', 'readonly@example.com', {
            summary: 'Test Event',
            start: { dateTime: '2026-02-25T14:00:00-08:00' },
            end: { dateTime: '2026-02-25T15:00:00-08:00' },
          }),
        (error: Error) => {
          assert.strictEqual(error.name, 'GoogleApiPermissionError');
          return true;
        }
      );
    });
  });

  describe('Multi-calendar parallel aggregation', () => {
    it('should aggregate events from multiple calendars and sort chronologically', async () => {
      const mockCalendars: Calendar[] = [
        {
          id: 'primary',
          summary: 'Personal',
          timeZone: 'America/Vancouver',
          accessRole: 'owner',
        },
        {
          id: 'work@example.com',
          summary: 'Work',
          timeZone: 'America/Vancouver',
          accessRole: 'writer',
        },
      ];

      const personalEvents: CalendarEvent[] = [
        {
          id: 'p1',
          summary: 'Personal (Later)',
          start: { dateTime: '2026-02-20T15:00:00-08:00' },
          end: { dateTime: '2026-02-20T16:00:00-08:00' },
          calendarId: 'primary',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=p1',
        },
      ];

      const workEvents: CalendarEvent[] = [
        {
          id: 'w1',
          summary: 'Work (Earlier)',
          start: { dateTime: '2026-02-20T09:00:00-08:00' },
          end: { dateTime: '2026-02-20T10:00:00-08:00' },
          calendarId: 'work@example.com',
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=w1',
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
        } else if (urlStr.includes('calendars/primary/events')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ items: personalEvents }),
            text: async () => JSON.stringify({ items: personalEvents }),
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

      const allEvents = await listAllEvents('test_token', {});

      assert.strictEqual(allEvents.length, 2);
      assert.strictEqual(allEvents[0].summary, 'Work (Earlier)', 'First event should be earlier');
      assert.strictEqual(allEvents[0].calendarName, 'Work');
      assert.strictEqual(allEvents[1].summary, 'Personal (Later)', 'Second event should be later');
      assert.strictEqual(allEvents[1].calendarName, 'Personal');
    });
  });
});
