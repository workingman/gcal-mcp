// CalendarMCP Durable Object - MCP server for Google Calendar operations
// Implements 7 MCP tools with token retrieval, validation, and refresh logic
// NOTE: McpAgent integration will be completed in integration testing
// For now, using basic Durable Object pattern with placeholder tool registration

import type { Env } from './env.d';
import type { McpSessionProps, GoogleTokens, EncryptedToken } from './types';
import { TokenManager, importEncryptionKey, importHmacKey } from './crypto';
import { computeKVKey, validateSession } from './session';

/**
 * CalendarMCP Durable Object
 * Will extend McpAgent when agents package is properly configured
 * Currently implements basic DO pattern with 7 tool handlers
 */
export class CalendarMCP {
  private state: DurableObjectState;
  private env: Env;
  private props: McpSessionProps;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.props = { userEmail: '' }; // Will be populated from session
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

    // Validate session
    const isValid = await validateSession(userEmail, encryptedToken, hmacKey);
    if (!isValid) {
      throw new Error('Session validation failed. Please re-authorize.');
    }

    // Decrypt tokens
    const manager = new TokenManager(encryptionKey, hmacKey);
    const tokens = await manager.decrypt(encryptedToken);

    // Triple validation: verify user_id matches
    if (tokens.user_id !== userEmail) {
      console.error(
        `Token ownership mismatch: expected=${userEmail}, actual=${tokens.user_id}`
      );
      throw new Error('Token ownership validation failed.');
    }

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

      // Placeholder response
      return {
        content: [
          {
            type: 'text',
            text: `[Placeholder] list_events called with params: ${JSON.stringify(params)}. Token valid until ${new Date(freshTokens.expires_at).toISOString()}`,
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

  private async handleGetEvent(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      return {
        content: [
          {
            type: 'text',
            text: `[Placeholder] get_event called with params: ${JSON.stringify(params)}`,
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

  private async handleSearchEvents(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      return {
        content: [
          {
            type: 'text',
            text: `[Placeholder] search_events called with params: ${JSON.stringify(params)}`,
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

  private async handleGetFreeBusy(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const tokens = await this.getTokenForUser();
      const freshTokens = await this.ensureFreshToken(tokens);

      return {
        content: [
          {
            type: 'text',
            text: `[Placeholder] get_free_busy called with params: ${JSON.stringify(params)}`,
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
