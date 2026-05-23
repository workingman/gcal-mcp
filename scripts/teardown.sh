#!/bin/bash
# Teardown script for Calendar MCP Server
# Cleans up Cloudflare KV namespaces and secrets
# Preserves GCP OAuth client (must be deleted manually if needed)

set -e

echo "===== Calendar MCP Server Teardown ====="
echo
echo "This will delete:"
echo "  - Cloudflare KV namespaces (OAUTH_KV, GOOGLE_TOKENS_KV)"
echo "  - Cloudflare Secrets (encryption keys, Google credentials)"
echo
echo "This will NOT delete:"
echo "  - GCP OAuth client (must be deleted manually in Google Cloud Console)"
echo "  - Local .tmp/encryption-keys.txt (for reference)"
echo
read -p "Are you sure you want to continue? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Teardown cancelled."
  exit 0
fi
echo

# Delete KV namespaces
echo "Deleting KV namespaces..."

# Get namespace IDs from wrangler.jsonc
OAUTH_KV_ID=$(grep -A 5 "OAUTH_KV" wrangler.jsonc | grep "id" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
GOOGLE_TOKENS_KV_ID=$(grep -A 5 "GOOGLE_TOKENS_KV" wrangler.jsonc | grep "id" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')

if [ -n "$OAUTH_KV_ID" ]; then
  echo "Deleting OAUTH_KV (ID: $OAUTH_KV_ID)..."
  npx wrangler kv namespace delete --namespace-id="$OAUTH_KV_ID" || echo "⚠ Failed to delete OAUTH_KV"
fi

if [ -n "$GOOGLE_TOKENS_KV_ID" ]; then
  echo "Deleting GOOGLE_TOKENS_KV (ID: $GOOGLE_TOKENS_KV_ID)..."
  npx wrangler kv namespace delete --namespace-id="$GOOGLE_TOKENS_KV_ID" || echo "⚠ Failed to delete GOOGLE_TOKENS_KV"
fi

echo "✓ KV namespaces deleted"
echo

# Delete secrets (wrangler doesn't have a delete command, so we provide instructions)
echo "To delete Cloudflare Secrets, run these commands manually:"
echo "  npx wrangler secret delete TOKEN_ENCRYPTION_KEY"
echo "  npx wrangler secret delete TOKEN_HMAC_KEY"
echo "  npx wrangler secret delete GOOGLE_CLIENT_ID"
echo "  npx wrangler secret delete GOOGLE_CLIENT_SECRET"
echo "  npx wrangler secret delete WORKER_URL"
echo

echo "===== Teardown Complete ====="
echo
echo "Manual cleanup required:"
echo "1. Delete GCP OAuth client: https://console.cloud.google.com/apis/credentials"
echo "2. Delete Cloudflare Secrets (commands shown above)"
echo "3. Optionally delete .tmp/encryption-keys.txt"
echo
