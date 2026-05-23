// Main Worker entry point
// Routes HTTP requests to Hono app, exports CalendarMCP Durable Object

import app from './app';
import type { Env } from './env.d';

export { CalendarMCP } from './mcp-server';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Route all requests through Hono app
    return app.fetch(request, env, ctx);
  },
};
