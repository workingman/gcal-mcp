// Cloudflare Workers environment type definitions

export interface Env {
  // KV Namespaces
  OAUTH_KV: KVNamespace;
  GOOGLE_TOKENS_KV: KVNamespace;

  // Cloudflare Secrets
  TOKEN_ENCRYPTION_KEY: string; // 64-char hex string (256-bit AES key)
  TOKEN_HMAC_KEY: string; // 64-char hex string (256-bit HMAC key)
  GOOGLE_CLIENT_ID: string; // Google OAuth client ID
  GOOGLE_CLIENT_SECRET: string; // Google OAuth client secret
  WORKER_URL: string; // Worker base URL (e.g., https://calendar-mcp.workers.dev)

  // Durable Object bindings
  CALENDAR_MCP: DurableObjectNamespace;
}
