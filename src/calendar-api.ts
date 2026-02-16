// Google Calendar API client
// Wraps Google Calendar API v3 REST endpoints with fetch
// Implements exponential backoff, error handling, and secure logging

import type { CalendarEvent, Calendar, FreeBusyResponse } from './types';

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
