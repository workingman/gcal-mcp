// MCP Server (CalendarMCP Durable Object)
// Will be implemented in issue #15

import type { Env } from './env.d';

export { CalendarMCP } from './mcp-server';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Basic health check endpoint
    return new Response('Calendar MCP Server - Ready', { status: 200 });
  },
};
