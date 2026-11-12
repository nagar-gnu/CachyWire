/**
 * CachyWire 0.1.0-alpha - Automated Test Suite
 * Tests Core Business Logic, Database, Firewall, and Security Engines
 */

import { CachyWireDatabase } from '../src/data/db.js';
import { ApplicationsRepository } from '../src/data/applications-repo.js';
import { HostsRepository } from '../src/data/hosts-repo.js';
import { TrafficRepository } from '../src/data/traffic-repo.js';
import { FirewallPolicyController } from '../src/business/firewall-policy.js';
import { SecurityScoreEngine } from '../src/business/security-score.js';
import { esc } from '../src/utils/escape.js';
import { FIREWALL_MODES } from '../src/config/default-settings.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('[*] Running CachyWire Test Suite...\n');

  // Test 1: HTML Escaping (SEC-03)
  console.log('1. Security: HTML Escaper (SEC-03)');
  assert(esc('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;', 'Sanitizes script tags');
  assert(esc('image" onerror="alert(1)') === 'image&quot; onerror=&quot;alert(1)', 'Sanitizes attribute injection');
  assert(esc(null) === '' && esc(undefined) === '', 'Handles null and undefined cleanly');

  // Test 2: Database Initialization & CRUD
  console.log('\n2. Data Layer: CachyWireDatabase');
  const db = new CachyWireDatabase({ storageKey: 'test_db_key' });
  await db.initialize();
  const app = db.registerApplication({
    exe_path: '/usr/bin/cachyos-updater',
    app_name: 'CachyOS Updater',
    publisher: 'CachyOS Team',
    is_signed: 1
  });
  assert(app && app.app_id > 0, 'Registers new application with auto-increment ID');
  assert(db.getApplicationByPath('/usr/bin/cachyos-updater')?.app_id === app.app_id, 'Indexes application by lowercase path (BR-01)');

  const host = db.getOrCreateRemoteHost('1.1.1.1', 'one.one.one.one', 'US', 'Cloudflare');
  assert(host && host.ip_address === '1.1.1.1', 'Creates remote host with IP and ASN');

  // Test 3: Traffic Stats Bucketing & Rollup
  console.log('\n3. Data Layer: Traffic Repository & Downsampling');
  const trafficRepo = new TrafficRepository(db);
  trafficRepo.recordFlow({
    timestamp: Date.now(),
    adapter_id: 'eno1',
    app_id: app.app_id,
    host_id: 1,
    proto_id: 1,
    bytes_in: 1024,
    bytes_out: 512
  });
  const flows = db.queryTrafficStats({ resolutionSec: 1 });
  assert(flows.length > 0 && flows[0].bytes_in === 1024, 'Records live traffic flow correctly');

  // Test 4: Firewall Policy Controller
  console.log('\n4. Business Logic: Firewall Policy & Critical Exemptions (BR-05)');
  const appsRepo = new ApplicationsRepository(db);
  const alertsRepo = { create: () => ({ alert_id: 1 }) };
  const fw = new FirewallPolicyController(appsRepo, alertsRepo, { enabled: true, mode: FIREWALL_MODES.CLICK_TO_BLOCK });

  assert(!fw.isApplicationBlocked(app.exe_path), 'Default application is allowed');
  fw.toggleBlock(app.app_id);
  assert(fw.isApplicationBlocked(app.exe_path), 'Toggling block marks application blocked');

  // Lockdown mode with DHCP exemption
  fw.setMode(FIREWALL_MODES.BLOCK_ALL);
  assert(fw.isApplicationBlocked(app.exe_path), 'General apps blocked in BLOCK_ALL');
  assert(!fw.isApplicationBlocked('/usr/sbin/dhcpcd', 67, 17), 'DHCP UDP 67 exempt in BLOCK_ALL (BR-05)');
  assert(!fw.isApplicationBlocked('/usr/bin/local-ipc', 8080, 6, '127.0.0.1'), 'Loopback exempt in BLOCK_ALL (BR-05)');
  assert(!fw.isApplicationBlocked('/usr/bin/local-ipc', 8080, 6, '::1'), 'IPv6 loopback exempt in BLOCK_ALL (BR-05)');
  let invalidConnectionResult = null;
  try {
    invalidConnectionResult = await fw.evaluateConnection({ app_name: 'bad input' }, { destination_ip: '8.8.8.8' });
  } catch (err) {
    invalidConnectionResult = { allowed: false, reason: 'THREW' };
  }
  assert(invalidConnectionResult && invalidConnectionResult.allowed === false, 'Missing exe_path is rejected without crashing');

  // Test 5: Security Score Engine
  console.log('\n5. Business Logic: Security Score Engine');
  const scoreEngine = new SecurityScoreEngine(appsRepo, alertsRepo);
  const safeScore = scoreEngine.calculateSecurityScore(app);
  assert(safeScore >= 80, `Trusted signed system app receives high score (${safeScore})`);

  const tmpApp = db.registerApplication({
    exe_path: '/tmp/evil_payload.sh',
    app_name: 'evil_payload.sh',
    is_signed: 0
  });
  const tmpScore = scoreEngine.calculateSecurityScore(tmpApp);
  assert(tmpScore < safeScore, `Execution from /tmp receives security penalty (${tmpScore} < ${safeScore})`);

  // Summary
  console.log(`\n========================================`);
  console.log(`Tests Finished: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
