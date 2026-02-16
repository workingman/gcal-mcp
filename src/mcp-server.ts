// CalendarMCP Durable Object class
// Will be implemented in issue #15

import type { Env } from './env.d';

export class CalendarMCP {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    return new Response('CalendarMCP stub', { status: 200 });
  }
}
