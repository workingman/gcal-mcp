// Hono routes for Google OAuth and MCP OAuth
// Will be implemented in issues #12 and #13

import { Hono } from 'hono';
import type { Env } from './env.d';

const app = new Hono<{ Bindings: Env }>();

// Placeholder route
app.get('/', (c) => c.text('Calendar MCP - OAuth routes pending'));

export default app;
