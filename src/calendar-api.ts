// Google Calendar API client
// Wraps Google Calendar API v3 REST endpoints with fetch
// Implements exponential backoff, error handling, and secure logging

import type { CalendarEvent, Calendar, FreeBusyResponse } from './types';

// KVNamespace type for Cloudflare Workers KV
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Custom error classes for different Google API error scenarios
 */
export class GoogleApiError extends Error {
  statusCode: number;
  retryable: boolean;

  constructor(statusCode: number, message: string, retryable: boolean = false) {
    super(message);
    this.name = 'GoogleApiError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export class GoogleApiAuthError extends GoogleApiError {
  constructor(message: string = 'Authentication failed. Token may be invalid or expired.') {
    super(401, message, false);
    this.name = 'GoogleApiAuthError';
  }
}

export class GoogleApiPermissionError extends GoogleApiError {
  constructor(message: string = 'Permission denied. Insufficient access to requested resource.') {
    super(403, message, false);
    this.name = 'GoogleApiPermissionError';
  }
}

export class GoogleApiNotFoundError extends GoogleApiError {
  constructor(message: string = 'Resource not found.') {
    super(404, message, false);
    this.name = 'GoogleApiNotFoundError';
  }
}

export class GoogleApiRateLimitError extends GoogleApiError {
  constructor(message: string = 'Rate limit exceeded. Please retry after delay.') {
    super(429, message, true);
    this.name = 'GoogleApiRateLimitError';
  }
}

export class GoogleApiServerError extends GoogleApiError {
  constructor(statusCode: number, message: string = 'Google API server error.') {
    super(statusCode, message, true);
    this.name = 'GoogleApiServerError';
  }
}

/**
 * Sanitize error message to remove sensitive tokens
 */
function sanitizeMessage(message: string): string {
  return message
    .replace(/ya29\.[^\s]+/g, '[REDACTED_TOKEN]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/[0-9a-f]{64}/gi, '[REDACTED_HASH]');
}

/**
 * Log API call (without exposing tokens)
 */
function logApiCall(method: string, url: string, statusCode?: number): void {
  const sanitizedUrl = url.replace(/access_token=[^&]+/, 'access_token=[REDACTED]');
  const logData = {
    timestamp: new Date().toISOString(),
    method,
    url: sanitizedUrl,
    ...(statusCode && { statusCode }),
  };
  console.log(JSON.stringify(logData));
}

/**
 * Parse Google API error response and throw appropriate error
 */
async function parseErrorResponse(response: Response): Promise<never> {
  let errorMessage = `Google Calendar API error (${response.status})`;

  try {
    const errorBody = await response.text();
    const errorJson = JSON.parse(errorBody);

    if (errorJson.error?.message) {
      errorMessage = sanitizeMessage(errorJson.error.message);
    } else if (errorJson.error) {
      errorMessage = sanitizeMessage(JSON.stringify(errorJson.error));
    }
  } catch (parseError) {
    // If parsing fails, use generic message
  }

  // Throw appropriate error class based on status code
  switch (response.status) {
    case 401:
      throw new GoogleApiAuthError(errorMessage);
    case 403:
      throw new GoogleApiPermissionError(errorMessage);
    case 404:
      throw new GoogleApiNotFoundError(errorMessage);
    case 429:
      throw new GoogleApiRateLimitError(errorMessage);
    case 500:
    case 502:
    case 503:
    case 504:
      throw new GoogleApiServerError(response.status, errorMessage);
    default:
      throw new GoogleApiError(response.status, errorMessage, false);
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Base fetch wrapper with Authorization header, error handling, and retry logic
 * Implements exponential backoff for 429 and 5xx errors (1s, 2s, 4s delays)
 */
async function apiFetch(
  accessToken: string,
  url: string,
  options?: RequestInit
): Promise<Response> {
  const method = options?.method || 'GET';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      logApiCall(method, url, response.status);

      if (!response.ok) {
        // Parse error and check if retryable
        try {
          await parseErrorResponse(response);
        } catch (error) {
          // If error is retryable and we have retries left
          if (error instanceof GoogleApiError && error.retryable && attempt < MAX_RETRIES) {
            const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
            console.warn(JSON.stringify({
              timestamp: new Date().toISOString(),
              message: 'Retrying API request',
              attempt: attempt + 1,
              maxRetries: MAX_RETRIES,
              delayMs,
              error: sanitizeMessage(error.message),
            }));
            await sleep(delayMs);
            continue; // Retry
          }
          throw error; // Not retryable or out of retries
        }
      }

      return response;
    } catch (error) {
      // Network errors or other unexpected errors
      if (attempt < MAX_RETRIES && !(error instanceof GoogleApiError)) {
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          message: 'Retrying API request after network error',
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs,
        }));
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }

  // Should never reach here due to loop logic
  throw new GoogleApiError(500, 'Maximum retries exceeded', false);
}

/**
 * List events from a calendar with pagination support
 * Always uses singleEvents=true to expand recurring events
 * Auto-paginates up to 1000 events with warning if more available
 * Supports attendee filtering (client-side)
 *
 * @param accessToken Google OAuth access token
 * @param params Filtering and pagination parameters
 * @param params.calendarId Calendar ID (defaults to "primary")
 * @param params.timeMin Start of time range (ISO 8601)
 * @param params.timeMax End of time range (ISO 8601)
 * @param params.q Keyword search query
 * @param params.attendee Filter by attendee email or display name
 * @param params.maxResults Results per page (default 250, max 2500)
 * @returns Array of CalendarEvent objects
 */
export async function listEvents(
  accessToken: string,
  params: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    q?: string;
    attendee?: string;
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

  // Warn if more events are available beyond 1000 limit
  if (pageToken) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      message: 'More events available beyond 1000 event limit',
      eventsReturned: events.length,
      calendarId,
    }));
  }

  // Client-side attendee filtering
  if (params.attendee) {
    const attendeeQuery = params.attendee.toLowerCase();
    events = events.filter(event =>
      event.attendees?.some(
        a =>
          a.email.toLowerCase().includes(attendeeQuery) ||
          a.displayName?.toLowerCase().includes(attendeeQuery)
      )
    );
  }

  return events;
}

/**
 * Get a single event by ID with enriched calendar metadata
 * Enriches event with calendarName from cached calendar list
 *
 * @param accessToken Google OAuth access token
 * @param eventId Event ID to retrieve
 * @param calendarId Calendar ID (defaults to "primary")
 * @param options Optional KV configuration for calendar list caching
 * @returns CalendarEvent with complete details including calendarName
 */
export async function getEvent(
  accessToken: string,
  eventId: string,
  calendarId: string = 'primary',
  options?: {
    kv?: KVNamespace;
    userIdHash?: string;
  }
): Promise<CalendarEvent> {
  const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;

  const response = await apiFetch(accessToken, url);
  const event = (await response.json()) as CalendarEvent;

  // Enrich with calendar name from cached list
  try {
    const calendars = await listCalendars(accessToken, options);
    const calendar = calendars.find(c => c.id === calendarId);
    event.calendarName = calendar?.summary || calendarId;
  } catch (error) {
    // If calendar list fetch fails, use calendarId as fallback
    event.calendarName = calendarId;
  }

  // Ensure calendarId is set on event
  event.calendarId = calendarId;

  return event;
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
 * List events from all accessible calendars in parallel
 * Fetches calendars first, then queries each calendar in parallel using Promise.allSettled()
 * Handles partial failures gracefully and enriches events with calendar metadata
 *
 * @param accessToken Google OAuth access token
 * @param params Filtering parameters (timeMin, timeMax, q, attendee)
 * @param options Optional KV configuration for calendar list caching
 * @returns Array of CalendarEvent objects from all calendars, sorted by start time
 */
export async function listAllEvents(
  accessToken: string,
  params: {
    timeMin?: string;
    timeMax?: string;
    q?: string;
    attendee?: string;
  },
  options?: {
    kv?: KVNamespace;
    userIdHash?: string;
  }
): Promise<CalendarEvent[]> {
  const MAX_CALENDARS = 10;

  // Step 1: Get all accessible calendars (with caching if KV provided)
  const calendars = await listCalendars(accessToken, options);

  // Limit to 10 calendars to avoid Workers CPU timeout
  const calendarsToFetch = calendars.slice(0, MAX_CALENDARS);
  if (calendars.length > MAX_CALENDARS) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      message: `User has ${calendars.length} calendars, fetching from first ${MAX_CALENDARS} only`,
      totalCalendars: calendars.length,
      fetchingCalendars: MAX_CALENDARS,
    }));
  }

  // Step 2: Fetch events from each calendar in parallel using Promise.allSettled()
  const eventPromises = calendarsToFetch.map(calendar =>
    listEvents(accessToken, {
      calendarId: calendar.id,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      q: params.q,
      attendee: params.attendee,
    })
  );

  const results = await Promise.allSettled(eventPromises);

  // Step 3: Process results and enrich with calendar metadata
  const allEvents: CalendarEvent[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const calendar = calendarsToFetch[index];
      const events = result.value.map(event => ({
        ...event,
        calendarId: calendar.id,
        calendarName: calendar.summary,
      }));
      allEvents.push(...events);
    } else {
      // Log failure but continue with other calendars
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 'Failed to fetch events from calendar',
        calendarId: calendarsToFetch[index].id,
        calendarName: calendarsToFetch[index].summary,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }));
    }
  });

  // Step 4: Sort all events by start time
  allEvents.sort((a, b) => {
    const timeA = new Date(a.start.dateTime || a.start.date || '').getTime();
    const timeB = new Date(b.start.dateTime || b.start.date || '').getTime();
    return timeA - timeB;
  });

  return allEvents;
}

/**
 * Query free/busy availability for specified time range
 * Defaults to all accessible calendars if none specified
 *
 * @param accessToken Google OAuth access token
 * @param timeMin Start of time range (ISO 8601)
 * @param timeMax End of time range (ISO 8601)
 * @param options Optional parameters
 * @param options.calendarIds Specific calendar IDs to query (defaults to all accessible)
 * @param options.kv KV namespace for calendar list caching
 * @param options.userIdHash User ID hash for cache key isolation
 * @returns FreeBusyResponse with busy time blocks per calendar
 */
export async function freebusy(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  options?: {
    calendarIds?: string[];
    kv?: KVNamespace;
    userIdHash?: string;
  }
): Promise<FreeBusyResponse> {
  const url = `${GOOGLE_CALENDAR_API_BASE}/freeBusy`;

  // Default to all accessible calendars if none specified
  let items: Array<{ id: string }>;
  if (options?.calendarIds) {
    items = options.calendarIds.map((id) => ({ id }));
  } else {
    // Fetch all calendars and query all of them
    try {
      const calendars = await listCalendars(accessToken, {
        kv: options?.kv,
        userIdHash: options?.userIdHash,
      });
      items = calendars.map((cal) => ({ id: cal.id }));
    } catch (error) {
      // Fallback to primary calendar if list fails
      items = [{ id: 'primary' }];
    }
  }

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
 * Supports optional KV caching (1 hour TTL) to reduce API calls
 *
 * @param accessToken Google OAuth access token
 * @param options Optional configuration for caching
 * @param options.kv KV namespace for caching (optional)
 * @param options.userIdHash User ID hash for cache key isolation (required if kv provided)
 * @returns Array of Calendar objects
 */
export async function listCalendars(
  accessToken: string,
  options?: {
    kv?: KVNamespace;
    userIdHash?: string;
  }
): Promise<Calendar[]> {
  const CACHE_TTL_MS = 3600000; // 1 hour

  // Check cache if KV is provided
  if (options?.kv && options?.userIdHash) {
    const cacheKey = `calendar_list:${options.userIdHash}`;
    try {
      const cached = await options.kv.get(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached) as {
          data: Calendar[];
          timestamp: number;
        };
        if (Date.now() - timestamp < CACHE_TTL_MS) {
          return data;
        }
      }
    } catch (error) {
      // Log cache read error but continue to API fetch
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 'Cache read failed, falling back to API',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  // Fetch from API
  const url = `${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`;
  const response = await apiFetch(accessToken, url);
  const data = (await response.json()) as { items?: Calendar[] };
  const calendars = data.items || [];

  // Update cache if KV is provided
  if (options?.kv && options?.userIdHash) {
    const cacheKey = `calendar_list:${options.userIdHash}`;
    try {
      await options.kv.put(
        cacheKey,
        JSON.stringify({
          data: calendars,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      // Log cache write error but don't fail the request
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 'Cache write failed',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return calendars;
}
