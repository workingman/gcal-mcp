#!/bin/bash
# Cloudflare Worker Deployment Script
# Validates configuration, creates KV namespaces, and deploys worker

set -e

echo "===== Cloudflare Worker Deployment ====="
echo

# Check prerequisites
command -v npx >/dev/null 2>&1 || { echo "Error: npx not found. Install Node.js"; exit 1; }

# Step 1: Verify wrangler.jsonc configuration
echo "Step 1: Verify wrangler.jsonc configuration"
echo "---------------------------------------------"

if [ ! -f wrangler.jsonc ]; then
  echo "⚠ Error: wrangler.jsonc not found"
  exit 1
fi

WORKER_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' wrangler.jsonc | cut -d'"' -f4)
echo "Worker name: $WORKER_NAME"
echo "✓ wrangler.jsonc found"
echo

# Step 2: Create KV namespaces if needed
echo "Step 2: Ensure KV namespaces exist"
echo "------------------------------------"

create_kv_if_needed() {
  local NS_NAME=$1
  local NS_TITLE="calendar-mcp-$NS_NAME"

  if npx wrangler kv namespace list 2>/dev/null | grep -q "$NS_TITLE"; then
    echo "✓ $NS_NAME namespace exists"
  else
    echo "Creating $NS_NAME namespace..."
    npx wrangler kv namespace create "$NS_NAME"
    echo "⚠ Update wrangler.jsonc with the namespace ID printed above"
    read -p "Press Enter after updating wrangler.jsonc..."
  fi
}

create_kv_if_needed "OAUTH_KV"
create_kv_if_needed "GOOGLE_TOKENS_KV"
echo

# Step 3: Validate Cloudflare Secrets
echo "Step 3: Validate required secrets"
echo "-----------------------------------"

REQUIRED_SECRETS=("TOKEN_ENCRYPTION_KEY" "TOKEN_HMAC_KEY" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "WORKER_URL")
MISSING_SECRETS=()

for SECRET in "${REQUIRED_SECRETS[@]}"; do
  if npx wrangler secret list 2>/dev/null | grep -q "$SECRET"; then
    echo "✓ $SECRET is set"
  else
    echo "⚠ $SECRET is NOT set"
    MISSING_SECRETS+=("$SECRET")
  fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
  echo
  echo "⚠ Missing secrets: ${MISSING_SECRETS[*]}"
  echo
  echo "Set missing secrets:"
  for SECRET in "${MISSING_SECRETS[@]}"; do
    if [ "$SECRET" = "TOKEN_ENCRYPTION_KEY" ] || [ "$SECRET" = "TOKEN_HMAC_KEY" ]; then
      echo "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" | npx wrangler secret put $SECRET"
    elif [ "$SECRET" = "WORKER_URL" ]; then
      echo "  echo \"https://$WORKER_NAME.<your-subdomain>.workers.dev\" | npx wrangler secret put $SECRET"
    else
      echo "  echo \"<your-$SECRET>\" | npx wrangler secret put $SECRET"
    fi
  done
  echo
  read -p "Continue deployment without all secrets? (y/n): " CONTINUE
  if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
    echo "Deployment cancelled"
    exit 1
  fi
fi
echo

# Step 4: Run type checking
echo "Step 4: Type checking"
echo "---------------------"
npm run typecheck
echo "✓ Type checking passed"
echo

# Step 5: Run tests
echo "Step 5: Run tests"
echo "------------------"
read -p "Run tests before deployment? (y/n): " RUN_TESTS

if [ "$RUN_TESTS" = "y" ] || [ "$RUN_TESTS" = "Y" ]; then
  npm test
  echo "✓ Tests passed"
else
  echo "⚠ Skipping tests"
fi
echo

# Step 6: Deploy
echo "Step 6: Deploy worker"
echo "----------------------"
echo "Deploying to Cloudflare Workers..."
npx wrangler deploy

echo
echo "✓ Deployment complete!"
echo

# Step 7: Get worker URL
echo "Step 7: Verify deployment"
echo "--------------------------"

WORKER_URL=$(npx wrangler deployments list 2>/dev/null | grep -o 'https://[^ ]*' | head -1)

if [ -n "$WORKER_URL" ]; then
  echo "Worker URL: $WORKER_URL"
  echo
  echo "Test endpoints:"
  echo "  OAuth status: $WORKER_URL/google/status"
  echo "  Health check: $WORKER_URL/"
  echo
  read -p "Test OAuth endpoint now? (y/n): " TEST_OAUTH

  if [ "$TEST_OAUTH" = "y" ] || [ "$TEST_OAUTH" = "Y" ]; then
    curl -s "$WORKER_URL/google/status" | head -20
    echo
    echo "✓ Worker is responding"
  fi
else
  echo "⚠ Could not determine worker URL automatically"
  echo "Check wrangler output above for deployment URL"
fi

echo
echo "===== Deployment Complete ====="
echo
echo "Next steps:"
echo "1. Update Claude Desktop config with worker URL"
echo "2. Test MCP connection from Claude"
echo "3. Complete Google OAuth authorization"
echo
echo "For troubleshooting, see: docs/oauth-setup.md"
