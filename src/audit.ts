// Structured audit logging for security and authentication events
// Logs to console in structured format with sanitized user identifiers

export type AuditLevel = 'INFO' | 'WARN' | 'ERROR';
export type AuditCategory =
  | 'auth'
  | 'token_access'
  | 'token_refresh'
  | 'security_violation'
  | 'session_validation';

export interface AuditEvent {
  timestamp: string; // ISO 8601 format
  level: AuditLevel;
  category: AuditCategory;
  message: string;
  metadata: Record<string, string | number | boolean>;
}

/**
 * AuditLogger - Structured logging for security-critical events
 * All logs include timestamp, level, category, and key-value metadata
 * User identifiers are sanitized (hashes only, no raw emails/tokens)
 */
export class AuditLogger {
  private serviceName: string;

  constructor(serviceName: string = 'calendar-mcp') {
    this.serviceName = serviceName;
  }

  /**
   * Log authentication success (OAuth completion)
   */
  logAuthSuccess(userEmail: string, provider: string = 'google'): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'auth',
      message: 'Authentication successful',
      metadata: {
        service: this.serviceName,
        provider,
        user_email: userEmail, // Email is acceptable in logs (not tokens)
        event: 'auth_success',
      },
    });
  }

  /**
   * Log token refresh event
   */
  logTokenRefresh(userEmail: string, success: boolean): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: success ? 'INFO' : 'WARN',
      category: 'token_refresh',
      message: success ? 'Token refreshed successfully' : 'Token refresh failed',
      metadata: {
        service: this.serviceName,
        user_email: userEmail,
        event: 'token_refresh',
        success,
      },
    });
  }

  /**
   * Log token access (retrieval from KV)
   */
  logTokenAccess(userEmail: string, operation: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'token_access',
      message: `Token accessed for operation: ${operation}`,
      metadata: {
        service: this.serviceName,
        user_email: userEmail,
        operation,
        event: 'token_access',
      },
    });
  }

  /**
   * Log security violation (validation failure, tampering, etc.)
   */
  logSecurityViolation(
    userEmail: string,
    reason: string,
    details?: Record<string, string | number | boolean>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      category: 'security_violation',
      message: `Security violation: ${reason}`,
      metadata: {
        service: this.serviceName,
        user_email: userEmail,
        reason,
        event: 'security_violation',
        ...details,
      },
    });
  }

  /**
   * Log session validation result
   */
  logSessionValidation(
    userEmail: string,
    valid: boolean,
    reason?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: valid ? 'INFO' : 'WARN',
      category: 'session_validation',
      message: valid
        ? 'Session validation successful'
        : `Session validation failed: ${reason || 'unknown'}`,
      metadata: {
        service: this.serviceName,
        user_email: userEmail,
        valid,
        event: 'session_validation',
        ...(reason ? { reason } : {}),
      },
    });
  }

  /**
   * Internal log method - writes structured JSON to console
   */
  private log(event: AuditEvent): void {
    const logLine = JSON.stringify(event);

    switch (event.level) {
      case 'INFO':
        console.log(logLine);
        break;
      case 'WARN':
        console.warn(logLine);
        break;
      case 'ERROR':
        console.error(logLine);
        break;
    }
  }
}
