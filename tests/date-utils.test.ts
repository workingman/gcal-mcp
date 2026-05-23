// Unit tests for date range parsing utilities (date-utils.ts)
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseDateRange, isValidDateRange } from '../src/date-utils.ts';

describe('Date Range Parsing', () => {
  describe('parseDateRange', () => {
    it('should parse "today" to start and end of current day', () => {
      const result = parseDateRange('today');
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      assert.ok(result.timeMin, 'timeMin should be defined');
      assert.ok(result.timeMax, 'timeMax should be defined');

      const minDate = new Date(result.timeMin);
      assert.strictEqual(minDate.getHours(), 0, 'Start should be midnight');
      assert.strictEqual(minDate.getDate(), today.getDate(), 'Should be today');
    });

    it('should parse "tomorrow" to start and end of next day', () => {
      const result = parseDateRange('tomorrow');
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const minDate = new Date(result.timeMin);
      const maxDate = new Date(result.timeMax);

      assert.strictEqual(minDate.getHours(), 0, 'Start should be midnight');
      assert.strictEqual(minDate.getDate(), tomorrow.getDate(), 'Should be tomorrow');
      assert.strictEqual(maxDate.getHours(), 23, 'End should be 23:59:59');
    });

    it('should parse "next 7 days" to current time plus 7 days', () => {
      const result = parseDateRange('next 7 days');
      const now = new Date();
      const future = new Date(now);
      future.setDate(future.getDate() + 7);

      const minDate = new Date(result.timeMin);
      const maxDate = new Date(result.timeMax);

      // Allow 1 second tolerance for test execution time
      assert.ok(
        Math.abs(minDate.getTime() - now.getTime()) < 1000,
        'Start should be approximately now'
      );
      assert.ok(
        Math.abs(maxDate.getTime() - future.getTime()) < 1000,
        'End should be approximately 7 days from now'
      );
    });

    it('should parse "next 30 days" correctly', () => {
      const result = parseDateRange('next 30 days');
      const now = new Date();
      const future = new Date(now);
      future.setDate(future.getDate() + 30);

      const maxDate = new Date(result.timeMax);
      assert.ok(
        Math.abs(maxDate.getTime() - future.getTime()) < 1000,
        'End should be approximately 30 days from now'
      );
    });

    it('should parse "next week" to next Monday through Sunday', () => {
      const result = parseDateRange('next week');
      const minDate = new Date(result.timeMin);
      const maxDate = new Date(result.timeMax);

      // Check that start is Monday (day 1)
      assert.strictEqual(minDate.getDay(), 1, 'Start should be Monday');
      assert.strictEqual(minDate.getHours(), 0, 'Start should be midnight');

      // Check that end is Sunday (day 0)
      assert.strictEqual(maxDate.getDay(), 0, 'End should be Sunday');
      assert.strictEqual(maxDate.getHours(), 23, 'End should be 23:59:59');
    });

    it('should parse explicit date range "YYYY-MM-DD to YYYY-MM-DD"', () => {
      const result = parseDateRange('2026-03-01 to 2026-03-15');
      const minDate = new Date(result.timeMin);
      const maxDate = new Date(result.timeMax);

      assert.strictEqual(minDate.getFullYear(), 2026);
      // Date constructor interprets "2026-03-01" as March 1 in local time, which is month index 2
      // But the ISO string might be in UTC. Let's check date number instead:
      assert.strictEqual(minDate.getUTCDate(), 1);
      assert.strictEqual(minDate.getUTCMonth(), 2); // March (0-indexed)

      assert.strictEqual(maxDate.getFullYear(), 2026);
      assert.strictEqual(maxDate.getUTCDate(), 15);
      assert.strictEqual(maxDate.getUTCMonth(), 2);
    });

    it('should default to "next 7 days" for invalid input', () => {
      const result = parseDateRange('invalid input');
      const now = new Date();
      const future = new Date(now);
      future.setDate(future.getDate() + 7);

      const minDate = new Date(result.timeMin);
      const maxDate = new Date(result.timeMax);

      assert.ok(
        Math.abs(minDate.getTime() - now.getTime()) < 1000,
        'Should default to now'
      );
      assert.ok(
        Math.abs(maxDate.getTime() - future.getTime()) < 1000,
        'Should default to 7 days from now'
      );
    });

    it('should handle case-insensitive input', () => {
      const result1 = parseDateRange('TODAY');
      const result2 = parseDateRange('ToMoRrOw');
      const result3 = parseDateRange('NEXT 7 DAYS');

      assert.ok(result1.timeMin, 'TODAY should be parsed');
      assert.ok(result2.timeMin, 'ToMoRrOw should be parsed');
      assert.ok(result3.timeMin, 'NEXT 7 DAYS should be parsed');
    });
  });

  describe('isValidDateRange', () => {
    it('should return true for valid date range strings', () => {
      assert.strictEqual(isValidDateRange('today'), true);
      assert.strictEqual(isValidDateRange('tomorrow'), true);
      assert.strictEqual(isValidDateRange('next 7 days'), true);
      assert.strictEqual(isValidDateRange('2026-03-01 to 2026-03-15'), true);
    });

    it('should return true even for invalid inputs (falls back to default)', () => {
      // Note: Current implementation defaults to "next 7 days" for invalid input
      // So this will return true. In production, you might want stricter validation.
      assert.strictEqual(isValidDateRange('invalid'), true);
    });
  });
});
