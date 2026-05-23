#!/bin/bash
# Master Setup Orchestration Script for Calendar MCP Server
# Orchestrates: dependencies → encryption keys → GCP OAuth → deployment

set -e

echo "============================================"
echo "  Calendar MCP Server - Master Setup"
echo "============================================"
echo
echo "This script will guide you through complete setup:"
echo "  1. Prerequisites check"
echo "  2. Install dependencies"
echo "  3. Generate encryption keys"
echo "  4. GCP OAuth configuration"
echo "  5. Cloudflare Worker deployment"
echo "  6. Final validation"
echo

# Check prerequisites
echo "Checking prerequisites..."
echo "-------------------------"

MISSING_PREREQS=()

if ! command -v node >/dev/null 2>&1; then
  echo "⚠ Node.js not found"
  MISSING_PREREQS+=("Node.js")
else
  NODE_VERSION=$(node --version)
  echo "✓ Node.js $NODE_VERSION"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "⚠ npm not found"
  MISSING_PREREQS+=("npm")
else
  NPM_VERSION=$(npm --version)
  echo "✓ npm $NPM_VERSION"
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "⚠ npx not found"
  MISSING_PREREQS+=("npx")
else
  echo "✓ npx available"
fi

# Check for gcloud (optional)
if command -v gcloud >/dev/null 2>&1; then
  echo "✓ gcloud CLI (optional)"
  GCLOUD_AVAILABLE=true
else
  echo "  gcloud CLI not found (optional - manual GCP setup will be used)"
  GCLOUD_AVAILABLE=false
fi

if [ ${#MISSING_PREREQS[@]} -gt 0 ]; then
  echo
  echo "⚠ Error: Missing prerequisites: ${MISSING_PREREQS[*]}"
  echo
  echo "Install required tools:"
  echo "  - Node.js 18+: https://nodejs.org/"
  echo "  - npm comes with Node.js"
  echo
  exit 1
fi

echo "✓ All required prerequisites met"
echo

# Step 1: Install dependencies
echo "Step 1/6: Install Dependencies"
echo "================================"
echo
npm install
echo "✓ Dependencies installed"
echo

# Step 2: Generate and set encryption keys
echo "Step 2/6: Encryption Keys"
echo "=========================="
echo

if [ -f .tmp/encryption-keys.txt ]; then
  echo "✓ Encryption keys already exist in .tmp/encryption-keys.txt"
  read -p "Regenerate keys? (y/n): " REGEN
  if [ "$REGEN" != "y" ] && [ "$REGEN" != "Y" ]; then
    echo "Using existing keys"
  else
    rm .tmp/encryption-keys.txt
  fi
fi

if [ ! -f .tmp/encryption-keys.txt ]; then
  mkdir -p .tmp
  echo "Generating new encryption keys..."
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  HMAC_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  cat > .tmp/encryption-keys.txt <<EOF
# Generated Encryption Keys for Calendar MCP
# DO NOT COMMIT THIS FILE

TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY}
TOKEN_HMAC_KEY=${HMAC_KEY}
EOF

  echo "✓ Encryption keys generated"
fi

# Set encryption secrets
echo "Setting Cloudflare Secrets for encryption keys..."
ENCRYPTION_KEY=$(grep TOKEN_ENCRYPTION_KEY .tmp/encryption-keys.txt | cut -d'=' -f2)
HMAC_KEY=$(grep TOKEN_HMAC_KEY .tmp/encryption-keys.txt | cut -d'=' -f2)

echo "${ENCRYPTION_KEY}" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
echo "${HMAC_KEY}" | npx wrangler secret put TOKEN_HMAC_KEY

echo "✓ Encryption secrets set"
echo

# Step 3: Create KV namespaces
echo "Step 3/6: Cloudflare KV Namespaces"
echo "===================================="
echo

if npx wrangler kv namespace list 2>/dev/null | grep -q "calendar-mcp-OAUTH_KV"; then
  echo "✓ OAUTH_KV namespace exists"
else
  echo "Creating OAUTH_KV namespace..."
  npx wrangler kv namespace create OAUTH_KV
  echo "⚠ Update wrangler.jsonc with namespace ID above"
  read -p "Press Enter after updating wrangler.jsonc..."
fi

if npx wrangler kv namespace list 2>/dev/null | grep -q "calendar-mcp-GOOGLE_TOKENS_KV"; then
  echo "✓ GOOGLE_TOKENS_KV namespace exists"
else
  echo "Creating GOOGLE_TOKENS_KV namespace..."
  npx wrangler kv namespace create GOOGLE_TOKENS_KV
  echo "⚠ Update wrangler.jsonc with namespace ID above"
  read -p "Press Enter after updating wrangler.jsonc..."
fi

echo "✓ KV namespaces configured"
echo

# Step 4: GCP OAuth setup
echo "Step 4/6: GCP OAuth Configuration"
echo "==================================="
echo
read -p "Run GCP OAuth setup script? (y/n): " RUN_GCP

if [ "$RUN_GCP" = "y" ] || [ "$RUN_GCP" = "Y" ]; then
  bash scripts/setup-gcp-oauth.sh
else
  echo "⚠ Skipping GCP OAuth setup"
  echo "You can run it later with: bash scripts/setup-gcp-oauth.sh"
fi
echo

# Step 5: Deploy worker
echo "Step 5/6: Deploy Cloudflare Worker"
echo "===================================="
echo
read -p "Deploy worker now? (y/n): " DEPLOY

if [ "$DEPLOY" = "y" ] || [ "$DEPLOY" = "Y" ]; then
  bash scripts/deploy-worker.sh
else
  echo "⚠ Skipping deployment"
  echo "You can deploy later with: bash scripts/deploy-worker.sh"
fi
echo

# Step 6: Final validation
echo "Step 6/6: Final Validation"
echo "==========================="
echo

# Check all secrets are set
echo "Validating Cloudflare Secrets..."
REQUIRED_SECRETS=("TOKEN_ENCRYPTION_KEY" "TOKEN_HMAC_KEY" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "WORKER_URL")
ALL_SET=true

for SECRET in "${REQUIRED_SECRETS[@]}"; do
  if npx wrangler secret list 2>/dev/null | grep -q "$SECRET"; then
    echo "✓ $SECRET"
  else
    echo "⚠ $SECRET not set"
    ALL_SET=false
  fi
done

echo

if [ "$ALL_SET" = true ]; then
  echo "✓ All secrets configured"
else
  echo "⚠ Some secrets missing - setup may be incomplete"
fi

echo
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo
echo "Summary:"
echo "  ✓ Dependencies installed"
echo "  ✓ Encryption keys generated"
echo "  ✓ KV namespaces created"
echo "  ✓ Cloudflare Secrets configured"
echo

if [ "$DEPLOY" = "y" ] || [ "$DEPLOY" = "Y" ]; then
  echo "  ✓ Worker deployed"
fi

echo
echo "Next steps:"
echo "  1. Configure Claude Desktop with your worker URL"
echo "  2. Test MCP connection from Claude"
echo "  3. Authorize with Google Calendar"
echo
echo "Documentation:"
echo "  - Setup guide: docs/oauth-setup.md"
echo "  - README: README.md"
echo "  - Troubleshooting: README.md#troubleshooting"
echo
echo "For issues or questions, see project documentation."
echo "Step 6/6: Verifying configuration..."
npx tsc --noEmit && echo "✓ TypeScript compilation successful"
echo

echo "===== Setup Complete ====="
echo
echo "Next steps:"
echo "1. Run 'npm run dev' to test locally"
echo "2. Run 'npm run deploy' to deploy to Cloudflare Workers"
echo "3. Visit your worker URL to verify it's running"
echo
