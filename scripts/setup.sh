#!/bin/bash
# Automated setup script for Calendar MCP Server
# Creates GCP OAuth client, Cloudflare KV namespaces, and sets Secrets

set -e

echo "===== Calendar MCP Server Setup ====="
echo

# Check prerequisites
command -v npx >/dev/null 2>&1 || { echo "Error: npm/npx not found. Please install Node.js"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: node not found. Please install Node.js"; exit 1; }

# Step 1: Install dependencies
echo "Step 1/6: Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo

# Step 2: Create KV namespaces (if not already created)
echo "Step 2/6: Creating Cloudflare KV namespaces..."

if npx wrangler kv namespace list | grep -q "calendar-mcp-OAUTH_KV"; then
  echo "✓ OAUTH_KV namespace already exists"
else
  echo "Creating OAUTH_KV namespace..."
  npx wrangler kv namespace create OAUTH_KV
fi

if npx wrangler kv namespace list | grep -q "calendar-mcp-GOOGLE_TOKENS_KV"; then
  echo "✓ GOOGLE_TOKENS_KV namespace already exists"
else
  echo "Creating GOOGLE_TOKENS_KV namespace..."
  npx wrangler kv namespace create GOOGLE_TOKENS_KV
fi
echo

# Step 3: Generate encryption keys
echo "Step 3/6: Generating encryption keys..."

if [ ! -f .tmp/encryption-keys.txt ]; then
  mkdir -p .tmp
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  HMAC_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  cat > .tmp/encryption-keys.txt <<EOF
# Generated Encryption Keys for Calendar MCP
# DO NOT COMMIT THIS FILE

TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY}
TOKEN_HMAC_KEY=${HMAC_KEY}

# To set Cloudflare Secrets:
# echo "${ENCRYPTION_KEY}" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
# echo "${HMAC_KEY}" | npx wrangler secret put TOKEN_HMAC_KEY
EOF

  echo "✓ Encryption keys generated and saved to .tmp/encryption-keys.txt"
else
  echo "✓ Encryption keys already exist in .tmp/encryption-keys.txt"
fi
echo

# Step 4: Set encryption secrets (interactive)
echo "Step 4/6: Setting Cloudflare Secrets for encryption keys..."
echo "This will require interactive input."
echo

if [ -f .tmp/encryption-keys.txt ]; then
  ENCRYPTION_KEY=$(grep TOKEN_ENCRYPTION_KEY .tmp/encryption-keys.txt | cut -d'=' -f2)
  HMAC_KEY=$(grep TOKEN_HMAC_KEY .tmp/encryption-keys.txt | cut -d'=' -f2)

  echo "${ENCRYPTION_KEY}" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
  echo "${HMAC_KEY}" | npx wrangler secret put TOKEN_HMAC_KEY

  echo "✓ Encryption secrets set"
else
  echo "⚠ Warning: .tmp/encryption-keys.txt not found. Skipping secret setup."
fi
echo

# Step 5: Instructions for GCP setup
echo "Step 5/6: Google Cloud Platform Setup"
echo "--------------------------------------"
echo "You need to create a GCP OAuth 2.0 Client ID:"
echo
echo "1. Go to: https://console.cloud.google.com/apis/credentials"
echo "2. Create a new OAuth 2.0 Client ID (Web application)"
echo "3. Set Authorized redirect URI: https://calendar-mcp.<your-subdomain>.workers.dev/google/callback"
echo "4. Copy the Client ID and Client Secret"
echo
echo "After creating the OAuth client, set these secrets:"
echo '  echo "<your-client-id>" | npx wrangler secret put GOOGLE_CLIENT_ID'
echo '  echo "<your-client-secret>" | npx wrangler secret put GOOGLE_CLIENT_SECRET'
echo '  echo "https://calendar-mcp.<your-subdomain>.workers.dev" | npx wrangler secret put WORKER_URL'
echo
read -p "Press Enter when you have completed GCP setup and set secrets..."
echo

# Step 6: Verify configuration
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
