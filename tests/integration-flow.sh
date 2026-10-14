#!/usr/bin/env bash
#
# Device-side integration flow for the Phase 0 security model.
#
# Prerequisites:
#   - Server running at $BASE_URL (default http://localhost:3000) with schema applied
#   - jq and openssl installed
#   - SMTP not configured (dev mode prints the invitation magic link to the server console)
#
# Covers: EC P-256 registration, stored single-use challenge, replay rejection,
# device token auth, device invitations (pairing code), snapshot, help request,
# command polling, key-change rejection and removed public endpoints.
# The caretaker half (accept with Firebase + pairing code) needs a real Firebase
# ID token and is exercised manually via the caretaker web app.
#
# Usage: ./tests/integration-flow.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
DEVICE_ID="itest-device-$(date +%s)"
CARETAKER_EMAIL="${CARETAKER_EMAIL:-test-primary@example.com}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# request METHOD PATH [BODY] [TOKEN] → sets STATUS and BODY
request() {
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local args=(-s -o "$WORKDIR/body" -w "%{http_code}" -X "$method" "$BASE_URL$path")
  if [ -n "$body" ]; then args+=(-H "Content-Type: application/json" -d "$body"); fi
  if [ -n "$token" ]; then args+=(-H "Authorization: Bearer $token"); fi
  STATUS=$(curl "${args[@]}")
  BODY=$(cat "$WORKDIR/body")
}

expect_status() {
  [ "$STATUS" = "$1" ] || fail "$2 — expected HTTP $1, got $STATUS: $BODY"
  pass "$2"
}

sign() {
  printf '%s' "$1" | openssl dgst -sha256 -sign "$WORKDIR/key.pem" | base64 | tr -d '\n'
}

section "Preflight"
request GET /health
expect_status 200 "server is healthy"

section "Register (EC P-256)"
openssl ecparam -name prime256v1 -genkey -noout -out "$WORKDIR/key.pem" 2>/dev/null
openssl ec -in "$WORKDIR/key.pem" -pubout -out "$WORKDIR/pub.pem" 2>/dev/null
PUB=$(jq -Rs . < "$WORKDIR/pub.pem")
request POST /api/devices/register "{\"deviceId\":\"$DEVICE_ID\",\"publicKey\":$PUB,\"keyAlgorithm\":\"EC_P256\",\"deviceMetadata\":{\"model\":\"itest\"}}"
expect_status 201 "new device registered"
CHALLENGE=$(echo "$BODY" | jq -r .data.challenge)

section "Verify signature"
SIG=$(sign "$CHALLENGE")
request POST /api/devices/verify-signature "{\"deviceId\":\"$DEVICE_ID\",\"challenge\":\"$CHALLENGE\",\"signature\":\"$SIG\"}"
expect_status 200 "signature verified"
TOKEN=$(echo "$BODY" | jq -r .data.deviceToken)
[[ "$TOKEN" == dt_* ]] || fail "device token must start with dt_"
pass "device token issued"

request POST /api/devices/verify-signature "{\"deviceId\":\"$DEVICE_ID\",\"challenge\":\"$CHALLENGE\",\"signature\":\"$SIG\"}"
expect_status 401 "replayed challenge rejected"
[ "$(echo "$BODY" | jq -r .code)" = "CHALLENGE_USED" ] || fail "expected CHALLENGE_USED"

request POST /api/devices/verify-signature "{\"deviceId\":\"$DEVICE_ID\",\"challenge\":\"$(openssl rand -hex 32)\",\"signature\":\"$SIG\"}"
expect_status 401 "unissued challenge rejected"

section "Re-register"
request POST /api/devices/register "{\"deviceId\":\"$DEVICE_ID\",\"publicKey\":$PUB,\"keyAlgorithm\":\"EC_P256\"}"
expect_status 200 "same key re-registers without re-keying"
openssl ecparam -name prime256v1 -genkey -noout -out "$WORKDIR/other.pem" 2>/dev/null
OTHER_PUB=$(openssl ec -in "$WORKDIR/other.pem" -pubout 2>/dev/null | jq -Rs .)
request POST /api/devices/register "{\"deviceId\":\"$DEVICE_ID\",\"publicKey\":$OTHER_PUB,\"keyAlgorithm\":\"EC_P256\"}"
expect_status 409 "different key for existing deviceId rejected"

section "Device API (token)"
request GET /api/device/me "" "$TOKEN"
expect_status 200 "GET /api/device/me"
request GET /api/device/commands "" "dt_not-a-real-token"
expect_status 401 "bad device token rejected"

request POST /api/device/invitations "{\"email\":\"$CARETAKER_EMAIL\"}" "$TOKEN"
expect_status 201 "invitation created"
INVITATION_ID=$(echo "$BODY" | jq -r .data.invitationId)
CODE=$(echo "$BODY" | jq -r .data.pairingCode)
[[ "$CODE" =~ ^[0-9]{6}$ ]] || fail "pairing code must be 6 digits"
echo "$BODY" | jq -e '.data | has("token") or has("inviteUrl") | not' >/dev/null || fail "raw token leaked"
pass "pairing code returned, link token not returned (code: $CODE)"

request GET "/api/device/invitations/$INVITATION_ID" "" "$TOKEN"
expect_status 200 "invitation status"
[ "$(echo "$BODY" | jq -r .data.status)" = "pending" ] || fail "expected pending"

request PUT /api/device/push-token '{"fcmToken":"fake-fcm-token"}' "$TOKEN"
expect_status 204 "push token stored"

request POST /api/device/snapshot '{"batteryLevel":77,"batteryStatus":"charging","storageFreeMb":1234}' "$TOKEN"
expect_status 201 "snapshot posted"

request POST /api/device/help-requests '{"title":"SOS","type":"sos"}' "$TOKEN"
expect_status 201 "help request created"

request GET "/api/device/commands?status=pending" "" "$TOKEN"
expect_status 200 "pending commands polled"

section "Removed public endpoints"
request POST /api/help-requests '{"deviceId":"x","title":"t"}'
expect_status 404 "POST /api/help-requests removed"
request POST /api/shared-state/snapshot '{"deviceId":"x"}'
expect_status 404 "POST /api/shared-state/snapshot removed"
request POST /api/invitations '{"deviceId":"x","email":"a@b.co"}'
expect_status 404 "POST /api/invitations removed"
request GET "/api/devices/$DEVICE_ID"
expect_status 401 "GET /api/devices/:id requires auth"

echo -e "\n${GREEN}All device-side checks passed.${NC}"
echo "Next (manual): open the magic link printed in the server log, sign in as $CARETAKER_EMAIL and enter code $CODE."
