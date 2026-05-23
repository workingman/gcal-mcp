// Core data models for Calendar MCP Server

/**
 * EncryptedToken - Stored in KV under key "google_tokens:{HMAC-SHA256(user_email)}"
 * Contains encrypted Google OAuth tokens with metadata for validation
 */
export interface EncryptedToken {
  iv: string; // Base64-encoded 12-byte initialization vector
  ciphertext: string; // Base64-encoded AES-256-GCM encrypted payload
  tag: string; // Base64-encoded 16-byte authentication tag
  user_id_hash: string; // HMAC-SHA256(user_email) as 64-char hex string
  created_at: number; // Unix timestamp (milliseconds)
  expires_at: number; // Unix timestamp (milliseconds) - copied from decrypted data
}

/**
 * GoogleTokens - Decrypted payload from EncryptedToken
 * Contains Google OAuth credentials and user identity
 */
export interface GoogleTokens {
  access_token: string; // Google OAuth access token (valid ~1 hour)
  refresh_token: string; // Google OAuth refresh token (valid until revoked)
  expires_at: number; // Unix timestamp (milliseconds) when access_token expires
  scope: string; // OAuth scope granted (should be "https://www.googleapis.com/auth/calendar")
  user_email: string; // Google account email (for logging/debugging)
  user_id: string; // MCP user identity (email from MCP session)
}

/**
 * CalendarEvent - Normalized event from Google Calendar API
 * Includes metadata for recurring events and attendees
 */
export interface CalendarEvent {
  id: string; // Google event ID
  summary: string; // Event title
  description?: string; // Event notes/body
  start: {
    dateTime?: string; // ISO 8601 with timezone (e.g., "2026-02-20T10:00:00-08:00")
    date?: string; // All-day events: YYYY-MM-DD
    timeZone?: string; // IANA timezone (e.g., "America/Vancouver")
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  }>;
  location?: string; // Free-text location
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean; // True if user is organizer
  };
  calendarId: string; // Which calendar this event belongs to
  calendarName?: string; // Human-readable calendar name (fetched separately)
  recurringEventId?: string; // If this is an instance of a recurring event
  recurrence?: string[]; // RRULE strings (only for series master)
  status: "confirmed" | "tentative" | "cancelled";
  htmlLink: string; // Direct link to event in Google Calendar
}

/**
 * Calendar - Metadata from Google Calendar API
 * Represents a calendar the user has access to
 */
export interface Calendar {
  id: string; // Calendar ID (email-like: "primary" or "user@gmail.com")
  summary: string; // Calendar name/title
  description?: string; // Calendar description
  timeZone: string; // Default timezone for events (IANA format)
  primary?: boolean; // True for user's primary calendar
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
}

/**
 * FreeBusyResponse - Google Calendar API free/busy query response
 * Shows busy time blocks for requested calendars
 */
export interface FreeBusyResponse {
  calendars: {
    [calendarId: string]: {
      busy: Array<{
        start: string; // ISO 8601 datetime
        end: string; // ISO 8601 datetime
      }>;
      errors?: Array<{
        domain: string;
        reason: string;
      }>;
    };
  };
  timeMin: string; // Query start time (ISO 8601)
  timeMax: string; // Query end time (ISO 8601)
}

/**
 * McpSessionProps - User identity from MCP OAuth authorization
 * Passed to CalendarMCP Durable Object instance
 */
export interface McpSessionProps {
  userEmail: string; // User's email from MCP authorization form
}
