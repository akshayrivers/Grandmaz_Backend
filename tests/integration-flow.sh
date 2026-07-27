#!/usr/bin/env bash
#
# Full integration test flow for Grandma's Launcher Backend
#
# Prerequisites:
#   - Server running at $BASE_URL (default http://localhost:3000)
#   - jq installed (brew install jq)
#   - openssl installed
#   - .env has RESEND_API_KEY set (or dev mode will log emails to console)
#
# Usage:
#   chmod +x tests/integration-flow.sh
#   ./tests/integration-flow.sh

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:3000}"
FIREBASE_API_KEY="${FIREBASE_API_KEY:-}"
DEVICE_ID="test-device-$(date +%s)"
SECONDARY_EMAIL="${SECONDARY_EMAIL:-test-caretaker@example.com}"
PRIMARY_EMAIL="${PRIMARY_EMAIL:-test-primary@example.com}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Helpers ────────────────────────────────────────────────────

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }
info() { echo -e "${YELLOW}  → $1${NC}"; }

assert_json() {
  # $1 = response body, $2 = jq path, $3 = expected value
  local actual
  actual=$(echo "$1" | jq -r "$2" 2>/dev/null)
  if [ "$actual" != "$3" ]; then
    fail "Expected $2 = '$3', got '$actual'"
  fi
}

assert_not_empty() {
  # $1 = response body, $2 = jq path
  local val
  val=$(echo "$1" | jq -r "$2" 2>/dev/null)
  if [ -z "$val" ] || [ "$val" = "null" ]; then
    fail "Expected $2 to be non-empty, got '$val'"
  fi
}

# ─── Preflight ──────────────────────────────────────────────────

echo -e "${CYAN}Grandma's Launcher — Integration Flow Test${NC}"
echo "Base URL: $BASE_URL"
echo "Device:   $DEVICE_ID"
echo ""

if ! command -v jq &>/dev/null; then
  fail "jq is required. Install with: brew install jq"
fi

if ! curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
  fail "Server not reachable at $BASE_URL/health"
fi
pass "Server is up"

# ─── Generate RSA keypair for device ────────────────────────────

section "1. Device Registration & Verification"

openssl genrsa -out /tmp/test_device_private.pem 2048 2>/dev/null
openssl rsa -in /tmp/test_device_private.pem -pubout -out /tmp/test_device_public.pem 2>/dev/null
pass "RSA keypair generated"

# Register device
RESP=$(curl -sf -X POST "$BASE_URL/api/devices/register" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg deviceId "$DEVICE_ID" \
    --arg publicKey "$(cat /tmp/test_device_public.pem)" \
    '{
      deviceId: $deviceId,
      publicKey: $publicKey,
      deviceMetadata: { model: "Test Device", os: "Android 15" }
    }')")

DEVICE_UUID=$(echo "$RESP" | jq -r '.data.id')
CHALLENGE=$(echo "$RESP" | jq -r '.challenge')

assert_json "$RESP" '.success' 'true'
assert_not_empty "$RESP" '.data.id'
pass "Device registered (UUID: $DEVICE_UUID)"

# Get a fresh challenge
RESP=$(curl -sf -X POST "$BASE_URL/api/devices/challenge" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --arg deviceId "$DEVICE_ID" '{deviceId: $deviceId}')")

CHALLENGE=$(echo "$RESP" | jq -r '.challenge')
assert_json "$RESP" '.success' 'true'
pass "Challenge received"

# Sign and verify
SIGNATURE=$(echo -n "$CHALLENGE" | openssl dgst -sha256 -sign /tmp/test_device_private.pem | base64)
[ -n "$SIGNATURE" ] || fail "Failed to generate signature"

RESP=$(curl -sf -X POST "$BASE_URL/api/devices/verify-signature" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg deviceId "$DEVICE_ID" \
    --arg challenge "$CHALLENGE" \
    --arg signature "$SIGNATURE" \
    '{deviceId: $deviceId, challenge: $challenge, signature: $signature}')")

assert_json "$RESP" '.data.verified' 'true'
pass "Device verified"

# Check device status
RESP=$(curl -sf "$BASE_URL/api/devices/$DEVICE_ID")
assert_json "$RESP" '.data.isVerified' 'true'
assert_json "$RESP" '.data.deviceId' "$DEVICE_ID"
pass "Device status confirmed (isVerified: true)"

# ─── Firebase Auth ──────────────────────────────────────────────

section "2. Firebase Auth — Primary User"

if [ -z "$FIREBASE_API_KEY" ]; then
  info "FIREBASE_API_KEY not set, skipping Firebase sign-up"
  info "Set it and re-run, or manually set PRIMARY_TOKEN / SECONDARY_TOKEN"
  PRIMARY_TOKEN="${PRIMARY_TOKEN:-}"
  SECONDARY_TOKEN="${SECONDARY_TOKEN:-}"
  PRIMARY_USER_UUID="${PRIMARY_USER_UUID:-}"
  SECONDARY_USER_UUID="${SECONDARY_USER_UUID:-}"
else
  # Create primary user
  RESP=$(curl -sf -X POST \
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$FIREBASE_API_KEY" \
    -H "Content-Type: application/json" \
    --data "$(jq -n \
      --arg email "$PRIMARY_EMAIL" \
      --arg password "TestPass123!" \
      '{email: $email, password: $password, returnSecureToken: true}')")

  PRIMARY_TOKEN=$(echo "$RESP" | jq -r '.idToken')
  if [ -z "$PRIMARY_TOKEN" ] || [ "$PRIMARY_TOKEN" = "null" ]; then
    # User might already exist, try sign-in instead
    RESP=$(curl -sf -X POST \
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY" \
      -H "Content-Type: application/json" \
      --data "$(jq -n \
        --arg email "$PRIMARY_EMAIL" \
        --arg password "TestPass123!" \
        '{email: $email, password: $password, returnSecureToken: true}')")
    PRIMARY_TOKEN=$(echo "$RESP" | jq -r '.idToken')
  fi
  assert_not_empty "$PRIMARY_TOKEN" '.'
  pass "Primary user authenticated via Firebase"

  # Sync to backend
  RESP=$(curl -sf -X POST "$BASE_URL/api/auth/verify" \
    -H "Content-Type: application/json" \
    --data "$(jq -n --arg idToken "$PRIMARY_TOKEN" '{idToken: $idToken}')")

  PRIMARY_USER_UUID=$(echo "$RESP" | jq -r '.data.id')
  assert_json "$RESP" '.success' 'true'
  assert_not_empty "$RESP" '.data.id'
  pass "Primary user synced to backend (UUID: $PRIMARY_USER_UUID)"
fi

# ─── Auth / Me ──────────────────────────────────────────────────

section "3. Auth — Verify & /me"

if [ -n "$PRIMARY_TOKEN" ]; then
  RESP=$(curl -sf "$BASE_URL/api/auth/me" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  assert_json "$RESP" '.success' 'true'
  assert_not_empty "$RESP" '.data.email'
  pass "/api/auth/me returns authenticated user"

  RESP=$(curl -sf "$BASE_URL/api/users/me" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  assert_not_empty "$RESP" '.email'
  assert_not_empty "$RESP" '.role'
  pass "/api/users/me returns profile with role"
fi

# ─── Update profile ─────────────────────────────────────────────

section "4. User Profile Update"

if [ -n "$PRIMARY_TOKEN" ]; then
  RESP=$(curl -sf -X PATCH "$BASE_URL/api/users/me" \
    -H "Authorization: Bearer $PRIMARY_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -n '{name: "Test User", avatarUrl: "https://example.com/avatar.png"}')")
  assert_json "$RESP" '.name' 'Test User'
  pass "Profile updated"
fi

# ─── Invitations ────────────────────────────────────────────────

section "5. Invitations"

if [ -n "$PRIMARY_TOKEN" ]; then
  # Send invitation
  RESP=$(curl -sf -X POST "$BASE_URL/api/invitations" \
    -H "Authorization: Bearer $PRIMARY_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -n \
      --arg deviceId "$DEVICE_UUID" \
      --arg email "$SECONDARY_EMAIL" \
      --arg deviceName "Grandmas Pixel" \
      '{deviceId: $deviceId, email: $email, deviceName: $deviceName}')")

  INVITATION_TOKEN=$(echo "$RESP" | jq -r '.data.token')
  assert_json "$RESP" '.success' 'true'
  assert_not_empty "$RESP" '.data.token'
  info "Invitation token: $INVITATION_TOKEN"
  info "Magic link: $(echo "$RESP" | jq -r '.inviteUrl')"
  pass "Invitation created and emailed (check server logs in dev mode)"

  # Validate invitation
  RESP=$(curl -sf "$BASE_URL/api/invitations/$INVITATION_TOKEN")
  assert_json "$RESP" '.data.valid' 'true'
  assert_json "$RESP" '.data.email' "$SECONDARY_EMAIL"
  pass "Invitation token validated"
fi

# ─── Secondary user — Firebase + Accept invitation ─────────────

section "6. Secondary User — Accept Invitation"

if [ -n "$FIREBASE_API_KEY" ] && [ -n "$INVITATION_TOKEN" ]; then
  # Create secondary user in Firebase
  RESP=$(curl -sf -X POST \
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$FIREBASE_API_KEY" \
    -H "Content-Type: application/json" \
    --data "$(jq -n \
      --arg email "$SECONDARY_EMAIL" \
      --arg password "TestPass123!" \
      '{email: $email, password: $password, returnSecureToken: true}')")

  SECONDARY_TOKEN=$(echo "$RESP" | jq -r '.idToken')
  if [ -z "$SECONDARY_TOKEN" ] || [ "$SECONDARY_TOKEN" = "null" ]; then
    RESP=$(curl -sf -X POST \
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY" \
      -H "Content-Type: application/json" \
      --data "$(jq -n \
        --arg email "$SECONDARY_EMAIL" \
        --arg password "TestPass123!" \
        '{email: $email, password: $password, returnSecureToken: true}')")
    SECONDARY_TOKEN=$(echo "$RESP" | jq -r '.idToken')
  fi
  assert_not_empty "$SECONDARY_TOKEN" '.'
  pass "Secondary user authenticated via Firebase"

  # Sync to backend first
  RESP=$(curl -sf -X POST "$BASE_URL/api/auth/verify" \
    -H "Content-Type: application/json" \
    --data "$(jq -n --arg idToken "$SECONDARY_TOKEN" '{idToken: $idToken}')")
  SECONDARY_USER_UUID=$(echo "$RESP" | jq -r '.data.id')
  pass "Secondary user synced to backend (UUID: $SECONDARY_USER_UUID)"

  # Accept invitation
  RESP=$(curl -sf -X POST "$BASE_URL/api/auth/accept-invitation" \
    -H "Content-Type: application/json" \
    --data "$(jq -n \
      --arg idToken "$SECONDARY_TOKEN" \
      --arg invitationToken "$INVITATION_TOKEN" \
      '{idToken: $idToken, invitationToken: $invitationToken}')")

  assert_json "$RESP" '.success' 'true'
  pass "Invitation accepted — caretaker linked to device"
fi

# ─── Caretakers ─────────────────────────────────────────────────

section "7. Caretakers Management"

if [ -n "$PRIMARY_TOKEN" ]; then
  # List caretakers for device
  RESP=$(curl -sf "$BASE_URL/api/caretakers/device/$DEVICE_ID" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  COUNT=$(echo "$RESP" | jq 'length')
  info "Caretakers found: $COUNT"
  pass "Listed caretakers for device"

  # Direct link (if secondary user exists and isn't already linked)
  if [ -n "$SECONDARY_EMAIL" ] && [ -n "$PRIMARY_TOKEN" ]; then
    RESP=$(curl -sf -X POST "$BASE_URL/api/caretakers/link" \
      -H "Authorization: Bearer $PRIMARY_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$(jq -n \
        --arg deviceId "$DEVICE_UUID" \
        --arg email "$SECONDARY_EMAIL" \
        '{deviceId: $deviceId, email: $email, role: "secondary"}')")
    info "Direct link response: $(echo "$RESP" | jq -c '.')"
    pass "Caretaker linked via direct link"
  fi
fi

# ─── Commands / Remote Tasks ────────────────────────────────────

section "8. Commands (Remote Tasks)"

if [ -n "$PRIMARY_TOKEN" ]; then
  # Create command
  RESP=$(curl -sf -X POST "$BASE_URL/api/commands" \
    -H "Authorization: Bearer $PRIMARY_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -n \
      --arg deviceId "$DEVICE_ID" \
      '{deviceId: $deviceId, title: "Restart Launcher", command: "restart_launcher", description: "Restart the app", payload: {force: true}}')")

  COMMAND_ID=$(echo "$RESP" | jq -r '.id')
  assert_not_empty "$RESP" '.id'
  info "Command ID: $COMMAND_ID"
  pass "Command created"

  # List commands for device
  RESP=$(curl -sf "$BASE_URL/api/commands/device/$DEVICE_ID" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  CMD_COUNT=$(echo "$RESP" | jq 'length')
  info "Commands found: $CMD_COUNT"
  pass "Listed commands for device"

  # Get specific command
  RESP=$(curl -sf "$BASE_URL/api/commands/$COMMAND_ID" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  assert_not_empty "$RESP" '.id'
  pass "Fetched specific command"

  # Update status (device reports back — no auth needed)
  RESP=$(curl -sf -X PATCH "$BASE_URL/api/commands/$COMMAND_ID/status" \
    -H "Content-Type: application/json" \
    --data "$(jq -n '{status: "completed", result: {message: "Done"}}')")
  assert_json "$RESP" '.status' 'completed'
  pass "Command status updated to completed"
fi

# ─── Shared State / Snapshots ───────────────────────────────────

section "9. Shared State (Device Snapshots)"

# Post snapshot (device reports — no auth)
RESP=$(curl -sf -X POST "$BASE_URL/api/shared-state/snapshot" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg deviceId "$DEVICE_ID" \
    '{deviceId: $deviceId, batteryLevel: 85, batteryStatus: "charging", wifiSsid: "HomeWiFi", storageFreeMb: 15000, installedApps: ["com.phone", "com.whatsapp"], settings: {brightness: 70, volume: 50}}')")

SNAPSHOT_ID=$(echo "$RESP" | jq -r '.id')
assert_not_empty "$RESP" '.id'
pass "Snapshot posted (ID: $SNAPSHOT_ID)"

if [ -n "$PRIMARY_TOKEN" ]; then
  # Get latest snapshot
  RESP=$(curl -sf "$BASE_URL/api/shared-state/device/$DEVICE_ID/latest" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  assert_not_empty "$RESP" '.id'
  info "Latest snapshot battery: $(echo "$RESP" | jq -r '.batteryLevel')%"
  pass "Fetched latest snapshot"

  # Get history
  RESP=$(curl -sf "$BASE_URL/api/shared-state/device/$DEVICE_ID/history?limit=5" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  HIST_COUNT=$(echo "$RESP" | jq 'length')
  info "History entries: $HIST_COUNT"
  pass "Fetched snapshot history"
fi

# ─── Help Requests ──────────────────────────────────────────────

section "10. Help Requests"

# Create help request (device side — no auth)
RESP=$(curl -sf -X POST "$BASE_URL/api/help-requests" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg deviceId "$DEVICE_ID" \
    '{deviceId: $deviceId, title: "Cannot open WhatsApp", description: "Icon missing from home screen", type: "tech_support"}')")

HELP_REQUEST_ID=$(echo "$RESP" | jq -r '.id')
assert_not_empty "$RESP" '.id'
assert_json "$RESP" '.status' 'pending'
info "Help request ID: $HELP_REQUEST_ID"
pass "Help request created"

if [ -n "$PRIMARY_TOKEN" ]; then
  # List help requests for device
  RESP=$(curl -sf "$BASE_URL/api/help-requests/device/$DEVICE_ID" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  HR_COUNT=$(echo "$RESP" | jq 'length')
  info "Help requests found: $HR_COUNT"
  pass "Listed help requests"

  # Resolve it
  RESP=$(curl -sf -X PATCH "$BASE_URL/api/help-requests/$HELP_REQUEST_ID/resolve" \
    -H "Authorization: Bearer $PRIMARY_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -n '{status: "resolved"}')")
  assert_json "$RESP" '.status' 'resolved'
  pass "Help request resolved"
fi

# ─── Audit Logs ─────────────────────────────────────────────────

section "11. Audit Logs"

if [ -n "$PRIMARY_TOKEN" ]; then
  # Create audit log
  RESP=$(curl -sf -X POST "$BASE_URL/api/audit-logs" \
    -H "Authorization: Bearer $PRIMARY_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -n \
      --arg deviceId "$DEVICE_ID" \
      '{action: "full_flow_test_passed", deviceId: $deviceId, details: {testRun: true, timestamp: now | todate}}')")

  assert_not_empty "$RESP" '.id'
  AUDIT_ID=$(echo "$RESP" | jq -r '.id')
  info "Audit log ID: $AUDIT_ID"
  pass "Audit log created"

  # List by device
  RESP=$(curl -sf "$BASE_URL/api/audit-logs/device/$DEVICE_ID" \
    -H "Authorization: Bearer $PRIMARY_TOKEN")
  AUDIT_COUNT=$(echo "$RESP" | jq 'length')
  info "Audit logs for device: $AUDIT_COUNT"
  pass "Listed audit logs by device"

  # List by user
  if [ -n "$PRIMARY_USER_UUID" ]; then
    RESP=$(curl -sf "$BASE_URL/api/audit-logs/user/$PRIMARY_USER_UUID" \
      -H "Authorization: Bearer $PRIMARY_TOKEN")
    info "Audit logs for user: $(echo "$RESP" | jq 'length')"
    pass "Listed audit logs by user"
  fi
fi

# ─── Cleanup ────────────────────────────────────────────────────

section "Cleanup"
rm -f /tmp/test_device_private.pem /tmp/test_device_public.pem
pass "Temporary keypair removed"

# ─── Summary ────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  All tests passed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Test data created:"
echo "  Device ID:     $DEVICE_ID"
echo "  Device UUID:   $DEVICE_UUID"
if [ -n "${PRIMARY_TOKEN:-}" ]; then
  echo "  Primary user:  $PRIMARY_EMAIL"
fi
if [ -n "${SECONDARY_TOKEN:-}" ]; then
  echo "  Secondary user: $SECONDARY_EMAIL"
fi
if [ -n "${COMMAND_ID:-}" ]; then
  echo "  Command ID:    $COMMAND_ID"
fi
if [ -n "${HELP_REQUEST_ID:-}" ]; then
  echo "  Help request:  $HELP_REQUEST_ID"
fi
echo ""
echo "Note: Emails were logged to server console (dev mode) if RESEND_API_KEY is not set."
echo "Note: Firebase test users persist. Re-run may create duplicates."
