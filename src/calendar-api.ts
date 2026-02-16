// Google Calendar API client
// Wraps Google Calendar API v3 REST endpoints with fetch

import type { CalendarEvent, Calendar, FreeBusyResponse } from './types';

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Base fetch wrapper with Authorization header and error handling
 */
async function apiFetch(
  accessToken: string,
  url: string,
  options?: RequestInit
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google Calendar API error (${response.status}): ${errorBody}`
    );
  }

  return response;
}

/**
 * List events from a calendar with pagination support
 * Always uses singleEvents=true to expand recurring events
 * Auto-paginates up to 1000 events
 */
export async function listEvents(
  accessToken: string,
  params: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    q?: string;
    maxResults?: number;
  }
): Promise<CalendarEvent[]> {
  const calendarId = params.calendarId || 'primary';
  const maxResults = params.maxResults || 250;

  const searchParams = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: maxResults.toString(),
  });

  if (params.timeMin) {
    searchParams.set('timeMin', params.timeMin);
  }
  if (params.timeMax) {
    searchParams.set('timeMax', params.timeMax);
  }
  if (params.q) {
    searchParams.set('q', params.q);
  }

  const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events?${searchParams}`;

  const response = await apiFetch(accessToken, url);
  const data = (await response.json()) as { items?: CalendarEvent[]; nextPageToken?: string };

  let events: CalendarEvent[] = data.items || [];

  // Auto-paginate up to 1000 events total
  let pageToken = data.nextPageToken;
  while (pageToken && events.length < 1000) {
    searchParams.set('pageToken', pageToken);
    const pageUrl = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
      calendarId
    )}/events?${searchParams}`;

    const pageResponse = await apiFetch(accessToken, pageUrl);
    const pageData = (await pageResponse.json()) as { items?: CalendarEvent[]; nextPageToken?: string };

    events = events.concat(pageData.items || []);
    pageToken = pageData.nextPageToken;
  }

  return events;
}

/**
 * Get a single event by ID
 */
export async function getEvent(
  accessToken: string,
  eventId: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;

  const response = await apiFetch(accessToken, url);
  return response.json();
}

/**
 * Create a new calendar event
 */
export async function createEvent(
  accessToken: string,
  calendarId: string,
  eventData: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events`;

  const response = await apiFetch(accessToken, url, {
    method: 'POST',
    body: JSON.stringify(eventData),
  });

  return response.json();
}

/**
 * Update an existing event (used for move_event)
 */
export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  updates: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;

  const response = await apiFetch(accessToken, url, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

  return response.json();
}

/**
 * Query free/busy availability for specified time range
 */
export async function freebusy(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  calendarIds?: string[]
): Promise<FreeBusyResponse> {
  const url = `${GOOGLE_CALENDAR_API_BASE}/freeBusy`;

  const items = calendarIds
    ? calendarIds.map((id) => ({ id }))
    : [{ id: 'primary' }];

  const response = await apiFetch(accessToken, url, {
    method: 'POST',
    body: JSON.stringify({
      timeMin,
      timeMax,
      items,
    }),
  });

  return response.json();
}

/**
 * List all calendars the user has access to
 */
export async function listCalendars(accessToken: string): Promise<Calendar[]> {
  const url = `${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`;

  const response = await apiFetch(accessToken, url);
  const data = (await response.json()) as { items?: Calendar[] };

  return data.items || [];
}
