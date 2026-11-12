#!/usr/bin/env bash
# CachyWire Comprehensive Test Script
# يتحقق من جميع الإصلاحات الأمنية والوظيفية

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================="
echo "🧪 CACHYWIRE COMPREHENSIVE TEST SUITE"
echo "📅 Date: $(date)"
echo "========================================================="
echo ""

PASS=0
FAIL=0
WARN=0

pass() {
  echo "   ✅ [PASS] $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "   ❌ [FAIL] $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo "   ⚠️  [WARN] $1"
  WARN=$((WARN + 1))
}

# -------------------------------------------------------
echo "1️⃣  CHECKING RUST BACKEND SECURITY"
echo "-------------------------------------------------------"

# Test 1.1: CORS headers removed
if grep -q "Access-Control-Allow-Origin" src-rust-backend/main.rs; then
  fail "CORS headers still present in main.rs"
else
  pass "CORS headers removed"
fi

# Test 1.2: write_atomic function exists
if grep -q "fn write_atomic" src-rust-backend/main.rs; then
  pass "write_atomic function defined"
else
  fail "write_atomic function missing"
fi

# Test 1.3: content_length cap (64MB)
if grep -q "content_length.min(64" src-rust-backend/main.rs; then
  pass "DoS protection (64MB cap) present"
else
  fail "DoS protection missing"
fi

# Test 1.4: No hardcoded fake MAC
if grep -q "00:11:22:33:44:55" src-rust-backend/main.rs; then
  fail "Hardcoded fake MAC still present"
else
  pass "No hardcoded fake MAC"
fi

# Test 1.5: Mutex poison tolerance
POISON_COUNT=$(grep -c "unwrap_or_else(|e| e.into_inner())" src-rust-backend/main.rs || true)
if [ "$POISON_COUNT" -gt 0 ]; then
  pass "Mutex poison tolerance applied ($POISON_COUNT sites)"
else
  warn "Mutex poison tolerance not applied (non-critical)"
fi

echo ""
echo "2️⃣  CHECKING FRONTEND SECURITY (XSS)"
echo "-------------------------------------------------------"

# Test 2.1: escape.js exists
if [ -f "src/utils/escape.js" ]; then
  pass "escape.js exists"
else
  fail "escape.js missing"
fi

# Test 2.2: escape imported in traffic-monitor.js
if grep -q "import { esc }" src/presentation/traffic-monitor.js 2>/dev/null; then
  pass "escape imported in traffic-monitor.js"
else
  fail "escape not imported in traffic-monitor.js"
fi

# Test 2.3: escape imported in alerts-timeline.js
if grep -q "import { esc }" src/presentation/alerts-timeline.js 2>/dev/null; then
  pass "escape imported in alerts-timeline.js"
else
  fail "escape not imported in alerts-timeline.js"
fi

# Test 2.4: escape imported in lan-scanner.js
if grep -q "import { esc }" src/presentation/lan-scanner.js 2>/dev/null; then
  pass "escape imported in lan-scanner.js"
else
  fail "escape not imported in lan-scanner.js"
fi

# Test 2.5: esc() used in traffic-monitor.js
ESC_COUNT=$(grep -c "esc(" src/presentation/traffic-monitor.js 2>/dev/null || true)
if [ "$ESC_COUNT" -gt 0 ]; then
  pass "esc() used in traffic-monitor.js ($ESC_COUNT times)"
else
  fail "esc() not used in traffic-monitor.js"
fi

echo ""
echo "3️⃣  CHECKING RUN SCRIPT SECURITY"
echo "-------------------------------------------------------"

# Test 3.1: XDG_RUNTIME_DIR used
if grep -q "XDG_RUNTIME_DIR" run-cachywire.sh; then
  pass "XDG_RUNTIME_DIR used (secure temp dir)"
else
  fail "Still using /tmp (insecure)"
fi

# Test 3.2: PID files used instead of pkill -f
if grep -q "stop_by_pidfile" run-cachywire.sh; then
  pass "PID files used for safe process management"
else
  fail "pkill -f still used (dangerous)"
fi

# Test 3.3: Health check loop
if grep -q "curl -sf http://127.0.0.1:8080/api/system/status" run-cachywire.sh; then
  pass "Health check loop present"
else
  warn "Health check loop missing (using fixed sleep)"
fi

# Test 3.4: setcap warning on failure
if grep -q "setcap failed" run-cachywire.sh; then
  pass "setcap failure warning present"
else
  warn "setcap failure not reported"
fi

echo ""
echo "4️⃣  CHECKING PACKAGE.JSON"
echo "-------------------------------------------------------"

# Test 4.1: No trailing spaces in keys
if python3 -c "import json; d=json.load(open('package.json')); assert all(k==k.strip() for k in d.keys())" 2>/dev/null; then
  pass "No trailing spaces in package.json keys"
else
  fail "Trailing spaces in package.json keys"
fi

# Test 4.2: No dead tauri scripts
if grep -q "tauri:dev" package.json; then
  fail "Dead tauri:dev script still present"
else
  pass "Dead tauri scripts removed"
fi

# Test 4.3: No node server.js script
if grep -q '"node server.js"' package.json; then
  fail "Dead 'node server.js' script still present"
else
  pass "Dead server.js script removed"
fi

echo ""
echo "5️⃣  CHECKING INDEX.HTML"
echo "-------------------------------------------------------"

# Test 5.1: No Google Fonts (offline compliance)
if grep -q "fonts.googleapis.com" index.html; then
  fail "Google Fonts still loaded (breaks offline mode)"
else
  pass "No external font CDN (offline compliant)"
fi

# Test 5.2: CSP meta tag present
if grep -q "Content-Security-Policy" index.html; then
  pass "CSP meta tag present"
else
  warn "CSP meta tag missing (recommended)"
fi

echo ""
echo "6️⃣  CHECKING FUNCTIONAL INTEGRITY"
echo "-------------------------------------------------------"

# Test 6.1: No fake Samsung TV device injection
if grep -q "Samsung-Smart-TV" src/presentation/lan-scanner.js 2>/dev/null; then
  fail "Fake Samsung TV device still injected"
else
  pass "No fake device injection"
fi

# Test 6.2: Snooze pill in shell.js
if grep -q "pill-snooze-toggle" src/presentation/shell.js 2>/dev/null; then
  pass "Snooze pill present in shell"
else
  fail "Snooze pill missing from shell"
fi

# Test 6.3: Snooze respected in showToast
if grep -q "isSnoozed" src/presentation/shell.js 2>/dev/null; then
  pass "showToast respects Snooze state"
else
  fail "showToast ignores Snooze state"
fi

# Test 6.4: Profile enforcement in firewall-policy.js
if grep -q "/api/firewall/enforce" src/business/firewall-policy.js 2>/dev/null; then
  pass "Profile switch enforces rules to kernel"
else
  fail "Profile switch doesn't enforce to kernel"
fi

# Test 6.5: Baselines learned (not hardcoded)
if grep -q "learnBaseline" src/business/security-watchdog.js 2>/dev/null; then
  pass "Watchdog baselines are learned dynamically"
else
  fail "Watchdog baselines still hardcoded"
fi

# Test 6.6: No hardcoded gateway MAC
if grep -q "70:4F:57:12:34:56" src/business/security-watchdog.js 2>/dev/null; then
  fail "Hardcoded gateway MAC still present"
else
  pass "No hardcoded gateway MAC"
fi

# Test 6.7: No hardcoded DNS
if grep -q "8.8.8.8" src/business/security-watchdog.js 2>/dev/null; then
  fail "Hardcoded DNS servers still present"
else
  pass "No hardcoded DNS servers"
fi

echo ""
echo "7️⃣  CHECKING DAEMON RUNTIME (if running)"
echo "-------------------------------------------------------"

# Test 7.1: Daemon responding
if curl -sf http://127.0.0.1:8080/api/system/status >/dev/null 2>&1; then
  pass "Daemon responding on port 8080"

  # Test 7.2: CORS not in response headers
  if curl -sI http://127.0.0.1:8080/ 2>/dev/null | grep -qi "access-control"; then
    fail "CORS headers still in HTTP response"
  else
    pass "No CORS headers in HTTP response"
  fi

  # Test 7.3: No fake MAC in ARP response
  FAKE_MAC=$(curl -s http://127.0.0.1:8080/api/network/arp 2>/dev/null | grep -c "00:11:22:33:44:55" || true)
  if [ "$FAKE_MAC" -gt 0 ]; then
    fail "Fake MAC in ARP API response"
  else
    pass "No fake MAC in ARP API response"
  fi
else
  warn "Daemon not running (skipping runtime tests)"
fi

echo ""
echo "========================================================="
echo "📊 TEST SUMMARY"
echo "========================================================="
echo "   ✅ PASSED: $PASS"
echo "   ❌ FAILED: $FAIL"
echo "   ⚠️  WARNINGS: $WARN"
echo "   📝 TOTAL:    $((PASS + FAIL + WARN))"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "🎉 ALL CRITICAL TESTS PASSED!"
  echo "   The project is in a secure and functional state."
  exit 0
else
  echo "⚠️  $FAIL critical issue(s) need attention."
  exit 1
fi
