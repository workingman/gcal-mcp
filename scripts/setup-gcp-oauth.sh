#!/bin/bash
# GCP OAuth 2.0 Client ID Setup Helper Script
# Provides step-by-step guidance for creating OAuth credentials

set -e

echo "===== GCP OAuth Setup for Calendar MCP ====="
echo
echo "This script will guide you through creating a Google Cloud OAuth 2.0 Client ID."
echo "Note: Some steps require manual action in the Google Cloud Console."
echo

# Check for gcloud CLI
if command -v gcloud >/dev/null 2>&1; then
  echo "✓ gcloud CLI found"
  GCLOUD_AVAILABLE=true
else
  echo "⚠ gcloud CLI not found (optional - manual setup will be used)"
  GCLOUD_AVAILABLE=false
fi
echo

# Get Worker URL
echo "Step 1: Determine your Worker URL"
echo "-----------------------------------"

if [ -f wrangler.jsonc ]; then
  WORKER_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' wrangler.jsonc | cut -d'"' -f4)
  echo "Detected worker name: $WORKER_NAME"
  echo
  read -p "Enter your Cloudflare subdomain (e.g., myaccount): " SUBDOMAIN
  WORKER_URL="https://$WORKER_NAME.$SUBDOMAIN.workers.dev"
  REDIRECT_URI="$WORKER_URL/google/callback"
  echo
  echo "Worker URL: $WORKER_URL"
  echo "Redirect URI: $REDIRECT_URI"
else
  echo "⚠ wrangler.jsonc not found. Using default..."
  read -p "Enter your full Worker URL (e.g., https://calendar-mcp.myaccount.workers.dev): " WORKER_URL
  REDIRECT_URI="$WORKER_URL/google/callback"
fi

echo
echo "Redirect URI will be: $REDIRECT_URI"
echo

# GCP Project Selection
echo "Step 2: Select or Create GCP Project"
echo "--------------------------------------"

if [ "$GCLOUD_AVAILABLE" = true ]; then
  echo "Checking gcloud authentication..."
  if gcloud auth list --filter=status:ACTIVE --format="value(account)" >/dev/null 2>&1; then
    ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
    echo "✓ Authenticated as: $ACTIVE_ACCOUNT"
    echo
    echo "Listing your GCP projects..."
    gcloud projects list --format="table(projectId,name)" 2>/dev/null || echo "No projects found"
    echo
    read -p "Enter GCP Project ID (or press Enter to create new): " PROJECT_ID

    if [ -z "$PROJECT_ID" ]; then
      read -p "Enter new project ID (lowercase, hyphens only): " NEW_PROJECT_ID
      read -p "Enter project name: " PROJECT_NAME
      echo "Creating project $NEW_PROJECT_ID..."
      gcloud projects create "$NEW_PROJECT_ID" --name="$PROJECT_NAME" || {
        echo "⚠ Project creation failed. Continuing with manual setup..."
        PROJECT_ID=""
      }
      PROJECT_ID="$NEW_PROJECT_ID"
    fi

    if [ -n "$PROJECT_ID" ]; then
      echo "Setting active project to $PROJECT_ID..."
      gcloud config set project "$PROJECT_ID"
      echo "✓ Project set"
    fi
  else
    echo "⚠ Not authenticated with gcloud. Using manual setup."
  fi
else
  echo "Manual setup required:"
  echo "1. Go to: https://console.cloud.google.com/projectcreate"
  echo "2. Create a new project or select existing project"
  echo
  read -p "Press Enter when you have selected a project..."
fi

echo

# Enable Calendar API
echo "Step 3: Enable Google Calendar API"
echo "------------------------------------"

if [ "$GCLOUD_AVAILABLE" = true ] && [ -n "$PROJECT_ID" ]; then
  echo "Enabling Google Calendar API for project $PROJECT_ID..."
  gcloud services enable calendar-json.googleapis.com --project="$PROJECT_ID" 2>/dev/null && {
    echo "✓ Google Calendar API enabled"
  } || {
    echo "⚠ Failed to enable API via gcloud. Please enable manually."
  }
else
  echo "Manual setup required:"
  echo "1. Go to: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"
  echo "2. Click 'Enable'"
  echo
  read -p "Press Enter when you have enabled the API..."
fi

echo

# Configure OAuth Consent Screen
echo "Step 4: Configure OAuth Consent Screen"
echo "----------------------------------------"
echo "OAuth consent screen must be configured manually."
echo
echo "1. Go to: https://console.cloud.google.com/apis/credentials/consent"
echo "2. Select 'External' user type (unless using Workspace with internal users)"
echo "3. Fill in required fields:"
echo "   - App name: Calendar MCP Server"
echo "   - User support email: <your-email>"
echo "   - Developer contact: <your-email>"
echo "4. Add scopes: https://www.googleapis.com/auth/calendar"
echo "5. Add test users (your email address) if in 'Testing' mode"
echo "6. Click 'Save and Continue' through all steps"
echo
read -p "Press Enter when you have configured the OAuth consent screen..."
echo

# Create OAuth Client
echo "Step 5: Create OAuth 2.0 Client ID"
echo "------------------------------------"

echo "Manual setup required:"
echo "1. Go to: https://console.cloud.google.com/apis/credentials"
echo "2. Click '+ CREATE CREDENTIALS' → 'OAuth client ID'"
echo "3. Application type: 'Web application'"
echo "4. Name: Calendar MCP"
echo "5. Authorized redirect URIs:"
echo "   $REDIRECT_URI"
echo "6. Click 'CREATE'"
echo "7. Copy the Client ID and Client Secret from the popup"
echo
read -p "Press Enter when you have created the OAuth client..."
echo

# Collect credentials
echo "Step 6: Save OAuth Credentials"
echo "--------------------------------"
echo
read -p "Enter your Google Client ID: " CLIENT_ID
read -sp "Enter your Google Client Secret: " CLIENT_SECRET
echo
echo

# Validate inputs
if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "⚠ Error: Client ID or Secret is empty"
  exit 1
fi

# Save to temp file
mkdir -p .tmp
cat > .tmp/gcp-oauth-credentials.txt <<EOF
# GCP OAuth Credentials for Calendar MCP
# DO NOT COMMIT THIS FILE

GOOGLE_CLIENT_ID=$CLIENT_ID
GOOGLE_CLIENT_SECRET=$CLIENT_SECRET
WORKER_URL=$WORKER_URL

# To set Cloudflare Secrets:
# echo "$CLIENT_ID" | npx wrangler secret put GOOGLE_CLIENT_ID
# echo "$CLIENT_SECRET" | npx wrangler secret put GOOGLE_CLIENT_SECRET
# echo "$WORKER_URL" | npx wrangler secret put WORKER_URL
EOF

echo "✓ Credentials saved to .tmp/gcp-oauth-credentials.txt"
echo

# Set Cloudflare Secrets
echo "Step 7: Set Cloudflare Secrets"
echo "--------------------------------"
echo
read -p "Set Cloudflare secrets now? (y/n): " SET_SECRETS

if [ "$SET_SECRETS" = "y" ] || [ "$SET_SECRETS" = "Y" ]; then
  echo "Setting secrets..."
  echo "$CLIENT_ID" | npx wrangler secret put GOOGLE_CLIENT_ID
  echo "$CLIENT_SECRET" | npx wrangler secret put GOOGLE_CLIENT_SECRET
  echo "$WORKER_URL" | npx wrangler secret put WORKER_URL
  echo "✓ Secrets set"
else
  echo "Skipped. You can set secrets later with:"
  echo "  cat .tmp/gcp-oauth-credentials.txt"
fi

echo
echo "===== GCP OAuth Setup Complete ====="
echo
echo "Summary:"
echo "  Client ID: ${CLIENT_ID:0:20}..."
echo "  Redirect URI: $REDIRECT_URI"
echo "  Worker URL: $WORKER_URL"
echo
echo "Next steps:"
echo "  1. Deploy your worker: npm run deploy"
echo "  2. Test OAuth flow by visiting: $WORKER_URL/google/auth"
echo
echo "For troubleshooting, see: docs/oauth-setup.md"
