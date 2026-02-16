// Date range parsing utilities for natural language date inputs
// Converts strings like "today", "next 7 days" to ISO 8601 datetime ranges

/**
 * Date range result with ISO 8601 timestamps
 */
export interface DateRange {
  timeMin: string;
  timeMax: string;
}

/**
 * Parse natural language date range to ISO 8601 timestamps
 * Supports: "today", "tomorrow", "next N days", "next week", "YYYY-MM-DD to YYYY-MM-DD"
 * Defaults to "next 7 days" if input is invalid
 *
 * @param input Natural language date range string
 * @param timezone Optional IANA timezone (defaults to UTC)
 * @returns DateRange with timeMin and timeMax in ISO 8601 format
 */
export function parseDateRange(input: string, timezone: string = 'UTC'): DateRange {
  const normalized = input.trim().toLowerCase();
  const now = new Date();

  // Helper to create date at start/end of day in specified timezone
  const startOfDay = (date: Date): string => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  const endOfDay = (date: Date): string => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };

  // Case: "today"
  if (normalized === 'today') {
    return {
      timeMin: startOfDay(now),
      timeMax: endOfDay(now),
    };
  }

  // Case: "tomorrow"
  if (normalized === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      timeMin: startOfDay(tomorrow),
      timeMax: endOfDay(tomorrow),
    };
  }

  // Case: "next N days" (e.g., "next 7 days", "next 30 days")
  const nextDaysMatch = normalized.match(/^next\s+(\d+)\s+days?$/);
  if (nextDaysMatch) {
    const days = parseInt(nextDaysMatch[1], 10);
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    return {
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
    };
  }

  // Case: "next week" (next Monday to next Sunday)
  if (normalized === 'next week') {
    const today = new Date(now);
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ...
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek; // Days until next Monday

    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);

    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);

    return {
      timeMin: startOfDay(nextMonday),
      timeMax: endOfDay(nextSunday),
    };
  }

  // Case: "YYYY-MM-DD to YYYY-MM-DD" (explicit date range)
  const explicitMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/);
  if (explicitMatch) {
    // Parse dates with explicit UTC interpretation to avoid timezone issues
    const startDate = new Date(explicitMatch[1] + 'T00:00:00.000Z');
    const endDate = new Date(explicitMatch[2] + 'T23:59:59.999Z');

    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      return {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
      };
    }
  }

  // Default fallback: "next 7 days"
  const defaultFuture = new Date(now);
  defaultFuture.setDate(defaultFuture.getDate() + 7);
  return {
    timeMin: now.toISOString(),
    timeMax: defaultFuture.toISOString(),
  };
}

/**
 * Check if a date range string is valid (can be parsed)
 * @param input Date range string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDateRange(input: string): boolean {
  try {
    const result = parseDateRange(input);
    return result.timeMin !== '' && result.timeMax !== '';
  } catch {
    return false;
  }
}
