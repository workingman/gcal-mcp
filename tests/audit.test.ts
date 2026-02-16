// Unit tests for AuditLogger (audit.ts)
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AuditLogger } from '../src/audit.ts';

describe('AuditLogger', () => {
  it('should log authentication success with structured format', () => {
    const logger = new AuditLogger('test-service');

    // Capture console output
    const originalLog = console.log;
    let logOutput = '';

    console.log = (message: string) => {
      logOutput = message;
      originalLog(message);
    };

    logger.logAuthSuccess('test@example.com', 'google');

    // Restore console
    console.log = originalLog;

    // Parse log output
    const logEvent = JSON.parse(logOutput);

    assert.strictEqual(logEvent.level, 'INFO', 'Level should be INFO');
    assert.strictEqual(logEvent.category, 'auth', 'Category should be auth');
    assert.strictEqual(
      logEvent.message,
      'Authentication successful',
      'Message should match'
    );
    assert.strictEqual(
      logEvent.metadata.user_email,
      'test@example.com',
      'User email should be logged'
    );
    assert.strictEqual(logEvent.metadata.provider, 'google', 'Provider should be logged');
    assert.strictEqual(
      logEvent.metadata.event,
      'auth_success',
      'Event type should be logged'
    );
    assert.ok(logEvent.timestamp, 'Timestamp should be present');
  });

  it('should log token refresh success with INFO level', () => {
    const logger = new AuditLogger();

    const originalLog = console.log;
    let logOutput = '';

    console.log = (message: string) => {
      logOutput = message;
      originalLog(message);
    };

    logger.logTokenRefresh('test@example.com', true);

    console.log = originalLog;

    const logEvent = JSON.parse(logOutput);

    assert.strictEqual(logEvent.level, 'INFO', 'Success should log INFO');
    assert.strictEqual(logEvent.category, 'token_refresh', 'Category should be token_refresh');
    assert.strictEqual(logEvent.metadata.success, true, 'Success should be true');
  });

  it('should log token refresh failure with WARN level', () => {
    const logger = new AuditLogger();

    const originalWarn = console.warn;
    let logOutput = '';

    console.warn = (message: string) => {
      logOutput = message;
      originalWarn(message);
    };

    logger.logTokenRefresh('test@example.com', false);

    console.warn = originalWarn;

    const logEvent = JSON.parse(logOutput);

    assert.strictEqual(logEvent.level, 'WARN', 'Failure should log WARN');
    assert.strictEqual(logEvent.category, 'token_refresh', 'Category should be token_refresh');
    assert.strictEqual(logEvent.metadata.success, false, 'Success should be false');
  });

  it('should log token access with operation details', () => {
    const logger = new AuditLogger();

    const originalLog = console.log;
    let logOutput = '';

    console.log = (message: string) => {
      logOutput = message;
      originalLog(message);
    };

    logger.logTokenAccess('test@example.com', 'list_events');

    console.log = originalLog;

    const logEvent = JSON.parse(logOutput);

    assert.strictEqual(logEvent.level, 'INFO', 'Level should be INFO');
    assert.strictEqual(logEvent.category, 'token_access', 'Category should be token_access');
    assert.strictEqual(
      logEvent.metadata.operation,
      'list_events',
      'Operation should be logged'
    );
    assert.strictEqual(
      logEvent.message,
      'Token accessed for operation: list_events',
      'Message should include operation'
    );
  });

  it('should log security violations with ERROR level', () => {
    const logger = new AuditLogger();

    const originalError = console.error;
    let logOutput = '';

    console.error = (message: string) => {
      logOutput = message;
      originalError(message);
    };

    logger.logSecurityViolation('attacker@example.com', 'user_id_hash mismatch', {
      attempted_user: 'victim@example.com',
    });

    console.error = originalError;

    const logEvent = JSON.parse(logOutput);

    assert.strictEqual(logEvent.level, 'ERROR', 'Level should be ERROR');
    assert.strictEqual(
      logEvent.category,
      'security_violation',
      'Category should be security_violation'
    );
    assert.strictEqual(
      logEvent.metadata.reason,
      'user_id_hash mismatch',
      'Reason should be logged'
    );
    assert.strictEqual(
      logEvent.metadata.attempted_user,
      'victim@example.com',
      'Additional details should be logged'
    );
  });

  it('should log session validation success', () => {
    const logger = new AuditLogger();

    const originalLog = console.log;
    let logOutput = '';

    console.log = (message: string) => {
      logOutput = message;
      originalLog(message);
    };

    logger.logSessionValidation('test@example.com', true);

    console.log = originalLog;

    const logEvent = JSON.parse(logOutput);

    assert.strictEqual(logEvent.level, 'INFO', 'Level should be INFO');
    assert.strictEqual(
      logEvent.category,
      'session_validation',
      'Category should be session_validation'
    );
    assert.strictEqual(logEvent.metadata.valid, true, 'Valid should be true');
  });

  it('should log session validation failure with reason', () => {
    const logger = new AuditLogger();

    const originalWarn = console.warn;
    let logOutput = '';

    console.warn = (message: string) => {
      logOutput = message;
      originalWarn(message);
    };

    logger.logSessionValidation('test@example.com', false, 'user_id_hash mismatch');

    console.warn = originalWarn;

    const logEvent = JSON.parse(logOutput);

    assert.strictEqual(logEvent.level, 'WARN', 'Level should be WARN');
    assert.strictEqual(logEvent.metadata.valid, false, 'Valid should be false');
    assert.strictEqual(
      logEvent.metadata.reason,
      'user_id_hash mismatch',
      'Reason should be logged'
    );
  });

  it('should not log raw tokens in any event', () => {
    const logger = new AuditLogger();

    // Capture all console output
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const logs: string[] = [];

    console.log = (message: string) => {
      logs.push(message);
      originalLog(message);
    };
    console.warn = (message: string) => {
      logs.push(message);
      originalWarn(message);
    };
    console.error = (message: string) => {
      logs.push(message);
      originalError(message);
    };

    // Log various events
    logger.logAuthSuccess('test@example.com', 'google');
    logger.logTokenRefresh('test@example.com', true);
    logger.logTokenAccess('test@example.com', 'list_events');
    logger.logSecurityViolation('test@example.com', 'test violation');
    logger.logSessionValidation('test@example.com', true);

    // Restore console
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;

    // Verify no logs contain sensitive tokens
    const suspiciousPatterns = [
      /ya29\./i, // Google access token prefix
      /access_token.*:/i, // Raw token field
      /refresh_token.*:/i, // Raw refresh token field
    ];

    for (const log of logs) {
      for (const pattern of suspiciousPatterns) {
        assert.ok(
          !pattern.test(log),
          `Log should not contain tokens matching ${pattern}`
        );
      }
    }
  });

  it('should include service name in all logs', () => {
    const logger = new AuditLogger('custom-service');

    const originalLog = console.log;
    let logOutput = '';

    console.log = (message: string) => {
      logOutput = message;
      originalLog(message);
    };

    logger.logAuthSuccess('test@example.com');

    console.log = originalLog;

    const logEvent = JSON.parse(logOutput);

    assert.strictEqual(
      logEvent.metadata.service,
      'custom-service',
      'Service name should be included'
    );
  });

  it('should produce valid ISO 8601 timestamps', () => {
    const logger = new AuditLogger();

    const originalLog = console.log;
    let logOutput = '';

    console.log = (message: string) => {
      logOutput = message;
      originalLog(message);
    };

    logger.logAuthSuccess('test@example.com');

    console.log = originalLog;

    const logEvent = JSON.parse(logOutput);

    // Parse timestamp and verify it's valid
    const timestamp = new Date(logEvent.timestamp);
    assert.ok(!isNaN(timestamp.getTime()), 'Timestamp should be valid ISO 8601');

    // Verify timestamp is recent (within last 5 seconds)
    const now = Date.now();
    const logTime = timestamp.getTime();
    assert.ok(
      Math.abs(now - logTime) < 5000,
      'Timestamp should be within 5 seconds of now'
    );
  });
});
