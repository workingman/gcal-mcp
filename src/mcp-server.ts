// CalendarMCP Durable Object - MCP server for Google Calendar operations
// Implements 7 MCP tools with token retrieval, validation, and refresh logic
// NOTE: McpAgent integration will be completed in integration testing
// For now, using basic Durable Object pattern with placeholder tool registration

import type { Env } from './env.d.ts';
import type { McpSessionProps, GoogleTokens, EncryptedToken } from './types.ts';
import { TokenManager, importEncryptionKey, importHmacKey } from './crypto.ts';
import { computeKVKey, validateSession } from './session.ts';
import { AuditLogger } from './audit.ts';
import { listAllEvents, getEvent, freebusy } from './calendar-api.ts';
import { parseDateRange } from './date-utils.ts';
import { toMcpErrorResponse } from './error-formatter.ts';

/**
 * CalendarMCP Durable Object
 * Will extend McpAgent when agents package is properly configured
 * Currently implements basic DO pattern with 7 tool handlers
 */
export class CalendarMCP {
  private state: DurableObjectState;
  private env: Env;
  private props: McpSessionProps;
  private auditLogger: AuditLogger;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.props = { userEmail: '' }; // Will be populated from session
    this.auditLogger = new AuditLogger('calendar-mcp');
  }

  /**
   * Fetch handler for Durable Object
   * Will be replaced with McpAgent WebSocket handling
   */
  async fetch(request: Request): Promise<Response> {
    // Placeholder - will be implemented with full MCP protocol
    return new Response('CalendarMCP DO - MCP protocol pending', {
      status: 200,
    });
  }

  /**
   * Tool registration (to be implemented with McpAgent integration)
   * Documenting 7 tools: list_events, get_event, search_events, get_free_busy,
   * create_event, move_event, calendar_auth_status
   * Full registration will be completed in integration testing
   */
  private registerTools(): void {
    // Placeholder - actual tool registration pending McpAgent integration
    // Each tool will call corresponding handle* methods below
  }

  /**
   * Get tokens for the current user from KV storage
   * Validates session and decrypts tokens
   */
  private async getTokenForUser(): Promise<GoogleTokens> {
    const userEmail = this.props.userEmail;

    if (!userEmail) {
      throw new Error('User identity not available. Please reconnect MCP.');
    }

    // Import keys
    const encryptionKey = await importEncryptionKey(
      this.env.TOKEN_ENCRYPTION_KEY
    );
    const hmacKey = await importHmacKey(this.env.TOKEN_HMAC_KEY);

    // Compute KV key
    const kvKey = await computeKVKey(userEmail, hmacKey);

    // Fetch encrypted token
    const encryptedJson = await this.env.GOOGLE_TOKENS_KV.get(kvKey);

    if (!encryptedJson) {
      const authUrl = `${this.env.WORKER_URL}/google/auth?user=${encodeURIComponent(
        userEmail
      )}`;
      throw new Error(
        `Google account not connected for ${userEmail}. Please visit ${authUrl} to authorize access to your Google Calendar, then try again.`
      );
    }

    const encryptedToken: EncryptedToken = JSON.parse(encryptedJson);

    // Validate session (Layer 2: post-fetch validation)
    const isValid = await validateSession(
      userEmail,
      encryptedToken,
      hmacKey,
      this.auditLogger
    );
    if (!isValid) {
      throw new Error('Session validation failed. Please re-authorize.');
    }

    // Decrypt tokens
    const manager = new TokenManager(encryptionKey, hmacKey);
    const tokens = await manager.decrypt(encryptedToken);

    // Triple validation: verify user_id matches (Layer 3: post-decrypt validation)
    if (tokens.user_id !== userEmail) {
      this.auditLogger.logSecurityViolation(
        userEmail,
        'Token ownership mismatch',
        {
          expected_user: userEmail,
          token_user: tokens.user_id,
        }
      );
      throw new Error('Token ownership validation failed.');
    }

    // Log token access
    this.auditLogger.logTokenAccess(userEmail, 'token_retrieval');

    return tokens;
  }

  /**
   * Ensure token is fresh, refresh if < 5 min remaining
   */
  private async ensureFreshToken(tokens: GoogleTokens): Promise<GoogleTokens> {
    const timeUntilExpiry = tokens.expires_at - Date.now();
    const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    if (timeUntilExpiry > REFRESH_THRESHOLD) {
      return tokens; // Still fresh
    }

    // Refresh token
    try {
      const refreshResponse = await fetch(
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.env.GOOGLE_CLIENT_ID,
            client_secret: this.env.GOOGLE_CLIENT_SECRET,
            refresh_token: tokens.refresh_token,
            grant_type: 'refresh_token',
          }),
        }
      );

      if (!refreshResponse.ok) {
        this.auditLogger.logTokenRefresh(tokens.user_id, false);
        const authUrl = `${this.env.WORKER_URL}/google/auth?user=${encodeURIComponent(
          tokens.user_id
        )}`;
        throw new Error(
          `Token refresh failed. Your Google authorization has expired. Please visit ${authUrl} to re-authorize, then try again.`
        );
      }

      const refreshData = (await refreshResponse.json()) as {
        access_token: string;
        expires_in: number;
      };

      // Update tokens with new access_token
      const refreshedTokens: GoogleTokens = {
        ...tokens,
        access_token: refreshData.access_token,
        expires_at: Date.now() + refreshData.expires_in * 1000,
      };

      // Re-encrypt and store updated tokens
      const encryptionKey = await importEncryptionKey(
        this.env.TOKEN_ENCRYPTION_KEY
      );
      const hmacKey = await importHmacKey(this.env.TOKEN_HMAC_KEY);
      const manager = new TokenManager(encryptionKey, hmacKey);

      const encrypted = await manager.encrypt(
        refreshedTokens,
        tokens.user_id
      );
      const kvKey = await computeKVKey(tokens.user_id, hmacKey);
      await this.env.GOOGLE_TOKENS_KV.put(kvKey, JSON.stringify(encrypted));

      // Log successful token refresh
      this.auditLogger.logTokenRefresh(tokens.user_id, true);
      console.log(`[Token Refresh] Refreshed token for user: ${tokens.user_id}`);

      return refreshedTokens;
    } catch (error) {
      if (error instanceof Error && error.message.includes('visit')) {
        // Re-throw auth errors as-is
        throw error;
      }
      throw new Error(
        `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Tool Handlers (placeholder implementations)

  private async handleListEvents(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      // Parse parameters
      const dateRangeInput = (params.date_range as string) || 'next 7 days';
      const calendarId = params.calendar_id as string | undefined;
      const keyword = params.keyword as string | undefined;
      const attendee = params.attendee as string | undefined;

      // Parse date range
      const { timeMin, timeMax } = parseDateRange(dateRangeInput);

      // Fetch events
      const events = await listAllEvents(
        freshTokens.access_token,
        {
          timeMin,
          timeMax,
          q: keyword,
          attendee,
        },
        {
          kv: this.env.GOOGLE_TOKENS_KV,
          userIdHash: tokens.user_id,
        }
      );

      // Filter by calendar if specified
      const filteredEvents = calendarId
        ? events.filter(e => e.calendarId === calendarId)
        : events;

      // Format response
      if (filteredEvents.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No events found for the specified criteria.',
            },
          ],
        };
      }

      const formattedEvents = filteredEvents.map(event => {
        const start = event.start.dateTime || event.start.date || '';
        const end = event.end.dateTime || event.end.date || '';
        const startDate = new Date(start);
        const endDate = new Date(end);

        // Format time range
        let timeStr: string;
        if (event.start.date) {
          // All-day event
          timeStr = `All day, ${startDate.toLocaleDateString()}`;
        } else {
          timeStr = `${startDate.toLocaleString()} - ${endDate.toLocaleTimeString()}`;
        }

        const parts = [
          `• ${event.summary}`,
          `  ${timeStr}`,
          `  Calendar: ${event.calendarName || event.calendarId}`,
        ];

        if (event.location) {
          parts.push(`  Location: ${event.location}`);
        }

        return parts.join('\n');
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'}:\n\n${formattedEvents}`,
          },
        ],
      };
    } catch (error) {
      return toMcpErrorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async handleGetEvent(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      // Parse parameters
      const eventId = params.event_id as string;
      const calendarId = (params.calendar_id as string) || 'primary';

      if (!eventId) {
        return toMcpErrorResponse('Missing required parameter: event_id');
      }

      // Fetch event
      const event = await getEvent(
        freshTokens.access_token,
        eventId,
        calendarId,
        {
          kv: this.env.GOOGLE_TOKENS_KV,
          userIdHash: tokens.user_id,
        }
      );

      // Format event details
      const parts: string[] = [];

      // Title
      parts.push(`Event: ${event.summary}`);
      parts.push('');

      // Time
      const start = event.start.dateTime || event.start.date || '';
      const end = event.end.dateTime || event.end.date || '';
      const startDate = new Date(start);
      const endDate = new Date(end);

      if (event.start.date) {
        // All-day event
        parts.push(`When: All day, ${startDate.toLocaleDateString()}`);
      } else {
        // Timed event
        parts.push(`When: ${startDate.toLocaleString()} - ${endDate.toLocaleTimeString()}`);
      }

      // Calendar
      parts.push(`Calendar: ${event.calendarName || event.calendarId}`);

      // Location
      if (event.location) {
        parts.push(`Location: ${event.location}`);
      }

      parts.push('');

      // Attendees
      if (event.attendees && event.attendees.length > 0) {
        parts.push('Attendees:');
        event.attendees.forEach(attendee => {
          const name = attendee.displayName || attendee.email;
          const status = attendee.responseStatus ? ` - ${attendee.responseStatus}` : '';
          parts.push(`  • ${name}${status}`);
        });
        parts.push('');
      }

      // Description
      if (event.description) {
        parts.push('Description:');
        parts.push(event.description);
        parts.push('');
      }

      // Recurring event metadata
      if (event.recurringEventId) {
        parts.push(`Part of recurring series (ID: ${event.recurringEventId})`);
        parts.push('');
      }

      // Link
      if (event.htmlLink) {
        parts.push(`Link: ${event.htmlLink}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: parts.join('\n'),
          },
        ],
      };
    } catch (error) {
      return toMcpErrorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async handleSearchEvents(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      // Parse parameters
      const query = params.query as string;
      const includePast = (params.include_past as boolean) || false;

      if (!query) {
        return toMcpErrorResponse('Missing required parameter: query');
      }

      // Calculate time range
      const now = new Date();
      let timeMin: string;
      if (includePast) {
        // Include past 90 days
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        timeMin = ninetyDaysAgo.toISOString();
      } else {
        // Future only
        timeMin = now.toISOString();
      }

      // Search events across all calendars
      const events = await listAllEvents(
        freshTokens.access_token,
        {
          timeMin,
          q: query,
        },
        {
          kv: this.env.GOOGLE_TOKENS_KV,
          userIdHash: tokens.user_id,
        }
      );

      // Format response
      if (events.length === 0) {
        const pastHint = includePast ? '' : ' Try setting include_past=true to search historical events.';
        return {
          content: [
            {
              type: 'text',
              text: `No events found matching '${query}'.${pastHint}`,
            },
          ],
        };
      }

      const formattedEvents = events.map((event, index) => {
        const start = event.start.dateTime || event.start.date || '';
        const end = event.end.dateTime || event.end.date || '';
        const startDate = new Date(start);
        const endDate = new Date(end);

        // Format time range
        let timeStr: string;
        if (event.start.date) {
          // All-day event
          timeStr = `All day, ${startDate.toLocaleDateString()}`;
        } else {
          timeStr = `${startDate.toLocaleString()} - ${endDate.toLocaleTimeString()}`;
        }

        return `${index + 1}. ${event.summary} (${timeStr}) - ${event.calendarName || event.calendarId}`;
      }).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${events.length} event${events.length === 1 ? '' : 's'} matching '${query}':\n\n${formattedEvents}`,
          },
        ],
      };
    } catch (error) {
      return toMcpErrorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async handleGetFreeBusy(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      // Parse parameters
      const startTime = params.start_time as string;
      const endTime = params.end_time as string;

      if (!startTime || !endTime) {
        return toMcpErrorResponse('Missing required parameters: start_time and end_time');
      }

      // Validate ISO 8601 format
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return toMcpErrorResponse('Invalid time format. Use ISO 8601 format (e.g., 2026-02-20T09:00:00-08:00)');
      }

      if (startDate >= endDate) {
        return toMcpErrorResponse('start_time must be before end_time');
      }

      // Query free/busy for all calendars
      const freebusyResponse = await freebusy(
        freshTokens.access_token,
        startTime,
        endTime,
        {
          kv: this.env.GOOGLE_TOKENS_KV,
          userIdHash: tokens.user_id,
        }
      );

      // Collect all busy blocks across calendars
      const allBusyBlocks: Array<{ start: string; end: string; calendar: string }> = [];
      for (const [calendarId, calendarData] of Object.entries(freebusyResponse.calendars)) {
        if (calendarData.busy) {
          calendarData.busy.forEach(block => {
            allBusyBlocks.push({
              start: block.start,
              end: block.end,
              calendar: calendarId,
            });
          });
        }
      }

      // Sort busy blocks by start time
      allBusyBlocks.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      // Format response
      const parts: string[] = [];
      parts.push(`Your availability for ${startDate.toLocaleString()} - ${endDate.toLocaleString()}:`);
      parts.push('');

      if (allBusyBlocks.length === 0) {
        parts.push('Free: Entire time range is available');
      } else {
        parts.push('Busy:');
        allBusyBlocks.forEach(block => {
          const blockStart = new Date(block.start);
          const blockEnd = new Date(block.end);
          parts.push(`  • ${blockStart.toLocaleTimeString()} - ${blockEnd.toLocaleTimeString()} (${block.calendar})`);
        });

        // Calculate free blocks
        parts.push('');
        parts.push('Free:');
        const freeBlocks: Array<{ start: Date; end: Date }> = [];

        let currentTime = startDate;
        for (const busyBlock of allBusyBlocks) {
          const busyStart = new Date(busyBlock.start);
          if (currentTime < busyStart) {
            freeBlocks.push({ start: new Date(currentTime), end: busyStart });
          }
          const busyEnd = new Date(busyBlock.end);
          currentTime = busyEnd > currentTime ? busyEnd : currentTime;
        }

        // Add final free block if there's time after last busy block
        if (currentTime < endDate) {
          freeBlocks.push({ start: new Date(currentTime), end: endDate });
        }

        if (freeBlocks.length === 0) {
          parts.push('  No free time available');
        } else {
          freeBlocks.forEach(block => {
            parts.push(`  • ${block.start.toLocaleTimeString()} - ${block.end.toLocaleTimeString()}`);
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: parts.join('\n'),
          },
        ],
      };
    } catch (error) {
      return toMcpErrorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async handleCreateEvent(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      return {
        content: [
          {
            type: 'text',
            text: `[Placeholder] create_event called with params: ${JSON.stringify(params)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  private async handleMoveEvent(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      return {
        content: [
          {
            type: 'text',
            text: `[Placeholder] move_event called with params: ${JSON.stringify(params)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  private async handleCalendarAuthStatus(): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const userEmail = this.props.userEmail;

      if (!userEmail) {
        return {
          content: [
            {
              type: 'text',
              text: 'User identity not available. Please reconnect MCP.',
            },
          ],
        };
      }

      const tokens = await this.getTokenForUser();

      const timeRemaining = tokens.expires_at - Date.now();
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      return {
        content: [
          {
            type: 'text',
            text: `Google account is connected for ${userEmail}. Token valid for ~${minutesRemaining} minutes.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }
}
