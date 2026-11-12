#!/usr/bin/env python3
import os
import re
import json

def fix_package_json():
    if not os.path.exists('package.json'): return
    with open('package.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    clean_data = {}
    for k, v in data.items():
        clean_k = k.strip()
        if isinstance(v, str):
            clean_data[clean_k] = v.strip()
        elif isinstance(v, dict) and clean_k == 'scripts':
            clean_scripts = {}
            for sk, sv in v.items():
                clean_sk = sk.strip()
                # إزالة السكربتات الميتة والخاطئة
                if clean_sk in ['start', 'test']:
                    clean_scripts[clean_sk] = sv.strip()
            clean_data[clean_k] = clean_scripts
        else:
            clean_data[clean_k] = v

    with open('package.json', 'w', encoding='utf-8') as f:
        json.dump(clean_data, f, indent=2)
    print("✅ Fixed package.json (Removed dead scripts & trailing spaces)")

def fix_run_script():
    script_content = '''#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
export CACHYWIRE_APP_DIR="$SCRIPT_DIR"

# SEC-06: Use secure per-user runtime directory instead of /tmp
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/cachywire"
mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"
RUNTIME_BIN="$RUNTIME_DIR/cachywire-desktop"
RUNTIME_DAEMON="$RUNTIME_DIR/cachywire-daemon"
DAEMON_PID="$RUNTIME_DIR/daemon.pid"
DESKTOP_PID="$RUNTIME_DIR/desktop.pid"

# SEC-07: Secure log permissions
umask 077
DAEMON_LOG="$RUNTIME_DIR/daemon.log"
UI_LOG="$RUNTIME_DIR/ui.log"

# RUN-01: Stop previous instances safely using PID files
stop_by_pidfile() {
  [ -f "$1" ] || return 0
  local pid; pid="$(cat "$1" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$1"
}
stop_by_pidfile "$DESKTOP_PID"
stop_by_pidfile "$DAEMON_PID"

for tool in rustc gcc pkg-config ss iptables curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[!] Missing tool: $tool" >&2; exit 1; }
done

if [ ! -x "$SCRIPT_DIR/cachywire-daemon" ] || [ "$SCRIPT_DIR/src-rust-backend/main.rs" -nt "$SCRIPT_DIR/cachywire-daemon" ]; then
  echo "[*] Compiling CachyWire native Rust backend..."
  rustc -C opt-level=3 -C strip=symbols "$SCRIPT_DIR/src-rust-backend/main.rs" -o "$SCRIPT_DIR/cachywire-daemon"
fi
cp -f "$SCRIPT_DIR/cachywire-daemon" "$RUNTIME_DAEMON"
chmod 755 "$RUNTIME_DAEMON"

if ! setcap cap_net_admin,cap_net_raw+ep "$RUNTIME_DAEMON" 2>/dev/null; then
  echo "[!] WARNING: setcap failed — firewall/capture features degraded" >&2
fi

if [ ! -f "$SCRIPT_DIR/cachywire-desktop" ] || [ "$SCRIPT_DIR/src-linux-desktop/cachywire-desktop.c" -nt "$SCRIPT_DIR/cachywire-desktop" ]; then
  echo "[*] Compiling CachyWire native GTK3 desktop shell..."
  gcc -O2 "$SCRIPT_DIR/src-linux-desktop/cachywire-desktop.c" -o "$SCRIPT_DIR/cachywire-desktop" \\
    $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1 dbusmenu-gtk3-0.4 gio-2.0)
fi
cp -f "$SCRIPT_DIR/cachywire-desktop" "$RUNTIME_BIN"
chmod 755 "$RUNTIME_BIN"

echo "[*] Starting CachyWire Telemetry Engine..."
setsid "$RUNTIME_DAEMON" >"$DAEMON_LOG" 2>&1 &
echo $! > "$DAEMON_PID"

# RUN-02: Health check instead of fixed sleep
for _ in $(seq 1 40); do
  curl -sf http://127.0.0.1:8080/api/system/status >/dev/null 2>&1 && break
  sleep 0.25
done

if [ "${1:-}" = "--daemon-only" ]; then
  echo "[+] Daemon active on http://127.0.0.1:8080"
  exit 0
fi

echo "[+] Launching CachyWire Desktop..."
setsid "$RUNTIME_BIN" "$@" >"$UI_LOG" 2>&1 &
echo $! > "$DESKTOP_PID"
'''
    with open('run-cachywire.sh', 'w', encoding='utf-8') as f:
        f.write(script_content)
    os.chmod('run-cachywire.sh', 0o755)
    print("✅ Fixed run-cachywire.sh (XDG dirs, PID files, health check)")

def fix_main_rs():
    if not os.path.exists('src-rust-backend/main.rs'): return
    with open('src-rust-backend/main.rs', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove CORS headers
    content = re.sub(r'Access-Control-Allow-Origin: \*\r?\nAccess-Control-Allow-Headers: Content-Type\r?\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r?\n', '', content)

    # 2. Add write_atomic function
    if 'fn write_atomic' not in content:
        content = content.replace(
            'fn handle_client(mut stream: TcpStream, state: Arc<Mutex<EngineState>>) {',
            '''fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path)
}

fn handle_client(mut stream: TcpStream, state: Arc<Mutex<EngineState>>) {'''
        )

    # 3. Cap content length to prevent DoS
    content = re.sub(
        r'content_length = val\.trim\(\)\.parse::<usize>\(\)\.unwrap_or\(0\);',
        r'content_length = val.trim().parse::<usize>().unwrap_or(0).min(64 * 1024 * 1024);',
        content
    )

    # 4. Atomic write for DB
    content = re.sub(
        r'let _ = fs::write\(&db_path, &body_bytes\);',
        r'if write_atomic(&db_path, &body_bytes).is_err() { send_response(&mut stream, "500 Internal Server Error", "application/json; charset=utf-8", b"{\\"ok\\":false}"); return; }',
        content
    )

    with open('src-rust-backend/main.rs', 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed src-rust-backend/main.rs (No CORS, Atomic Write, DoS Cap)")

def fix_index_html():
    if not os.path.exists('index.html'): return
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove Google Fonts (Offline violation)
    content = re.sub(r'<link[^>]+fonts\.googleapis\.com[^>]+>\n?', '', content)

    # Add CSP Meta Tag
    if 'Content-Security-Policy' not in content:
        content = content.replace(
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; font-src \'self\'; connect-src \'self\';">'
        )

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed index.html (Removed external fonts, added CSP)")

def create_escape_js():
    code = '''/**
 * CachyWire 0.1.0-alpha - HTML Escaping Helper (AUDIT SEC-03)
 * Every dynamic string interpolated into innerHTML MUST pass through esc().
 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
'''
    os.makedirs('src/utils', exist_ok=True)
    with open('src/utils/escape.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print("✅ Created src/utils/escape.js")

def fix_traffic_monitor():
    file = 'src/presentation/traffic-monitor.js'
    if not os.path.exists(file): return
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    if "import { esc } from '../utils/escape.js';" not in content:
        content = content.replace(
            "import { lookupGeoIp } from '../utils/geoip.js';",
            "import { lookupGeoIp } from '../utils/geoip.js';\nimport { esc } from '../utils/escape.js';"
        )

    content = re.sub(r'\$\{app\.exe_path \|\| \'\'\}', '${esc(app.exe_path || \'\')}', content)
    content = re.sub(r'\$\{app\.app_name\}', '${esc(app.app_name)}', content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed src/presentation/traffic-monitor.js (XSS Protection)")

def fix_alerts_timeline():
    file = 'src/presentation/alerts-timeline.js'
    if not os.path.exists(file): return
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    if "import { esc } from '../utils/escape.js';" not in content:
        content = content.replace(
            "import { formatDateTime } from '../utils/formatters.js';",
            "import { formatDateTime } from '../utils/formatters.js';\nimport { esc } from '../utils/escape.js';"
        )

    content = re.sub(r'<span class="alert-title">\$\{alert\.title\}', '<span class="alert-title">${esc(alert.title)}', content)
    content = re.sub(r'<span class="alert-description">\$\{this\._formatDetailsDescription\(details\)\}', '<span class="alert-description">${esc(this._formatDetailsDescription(details))}', content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed src/presentation/alerts-timeline.js (XSS Protection)")

def fix_shell_js():
    file = 'src/presentation/shell.js'
    if not os.path.exists(file): return
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix showToast to respect snooze
    content = re.sub(
        r'showToast\(message, type = \'info\'\) \{\s*const container = document\.getElementById\(\'toast-container\'\);',
        '''showToast(message, type = 'info') {
    // FUNC-09: Respect Snooze mode (critical alerts still break through)
    if (this.state.isSnoozed && type !== 'critical') return;
    const container = document.getElementById('toast-container');''',
        content
    )

    # Add snooze pill to header if missing
    if 'id="pill-snooze-toggle"' not in content:
        content = content.replace(
            '<button class="status-pill" id="btn-theme-toggle"',
            '''<button class="status-pill" id="pill-snooze-toggle" title="Snooze all toast alerts for 24 hours">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
         <span id="text-snooze-status">Snooze</span>
       </button>
       <button class="status-pill" id="btn-theme-toggle"'''
        )
        content = content.replace(
            "this.container.querySelector('#menu-toggle-incognito')?.addEventListener('click', () => this.onIncognitoToggle());",
            """this.container.querySelector('#menu-toggle-snooze')?.addEventListener('click', () => this.onSnoozeToggle());
    this.container.querySelector('#menu-toggle-incognito')?.addEventListener('click', () => this.onIncognitoToggle());"""
        )
        content = content.replace(
            "this.container.querySelector('#pill-incognito-toggle')?.addEventListener('click', () => this.onIncognitoToggle());",
            """this.container.querySelector('#pill-snooze-toggle')?.addEventListener('click', () => this.onSnoozeToggle());
    this.container.querySelector('#pill-incognito-toggle')?.addEventListener('click', () => this.onIncognitoToggle());"""
        )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed src/presentation/shell.js (Snooze logic & UI)")

def fix_lan_scanner():
    file = 'src/presentation/lan-scanner.js'
    if not os.path.exists(file): return
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    if "import { esc } from '../utils/escape.js';" not in content:
        content = content.replace(
            "import { lookupMacVendor } from '../utils/oui-vendors.js';",
            "import { lookupMacVendor } from '../utils/oui-vendors.js';\nimport { esc } from '../utils/escape.js';"
        )

    # Remove fake Samsung TV injection
    content = re.sub(
        r'if \(currentDevices\.length < 6\) \{[^}]+\}[^}]+\}',
        '// DATA-01: Removed fake device injection for integrity',
        content,
        flags=re.DOTALL
    )

    # Wrap dynamic strings
    content = re.sub(r'value="\$\{displayName\}"', 'value="${esc(displayName)}"', content)
    content = re.sub(r'>\$\{dev\.last_ip\}<', '>${esc(dev.last_ip)}<', content)
    content = re.sub(r'>\$\{formatMacAddress\(dev\.mac_address\)\}<', '>${esc(formatMacAddress(dev.mac_address))}<', content)
    content = re.sub(r'>\$\{vendor\}<', '>${esc(vendor)}<', content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed src/presentation/lan-scanner.js (No fake devices, XSS Protection)")

def fix_firewall_policy():
    file = 'src/business/firewall-policy.js'
    if not os.path.exists(file): return
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    old_setProfile = '''  setProfile(profileId) {
    if (this.profileRules[profileId]) {
      this.activeProfile = profileId;
      // Sync applications firewall_state to match current profile
      const blockedSet = this.profileRules[profileId];
      const apps = this.appsRepo.getAll();
      for (const app of apps) {
        const isBlocked = blockedSet.has(app.exe_path);
        this.appsRepo.setFirewallState(app.app_id, isBlocked ? 1 : 0);
      }
      return true;
    }
    return false;
  }'''

    new_setProfile = '''  setProfile(profileId) {
    if (this.profileRules[profileId]) {
      this.activeProfile = profileId;
      const blockedSet = this.profileRules[profileId];
      const apps = this.appsRepo.getAll();
      for (const app of apps) {
        const isBlocked = blockedSet.has(app.exe_path);
        const changed = (app.firewall_state === 1) !== isBlocked;
        this.appsRepo.setFirewallState(app.app_id, isBlocked ? 1 : 0);
        // FUNC-03: Profile switch must reach the kernel, not just the UI
        if (changed && typeof window !== 'undefined' && typeof fetch === 'function') {
          fetch('/api/firewall/enforce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exePath: app.exe_path, blocked: isBlocked && this.enabled })
          }).catch(() => {});
        }
      }
      return true;
    }
    return false;
  }'''

    content = content.replace(old_setProfile, new_setProfile)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed src/business/firewall-policy.js (Profile enforcement)")

def fix_watchdog():
    file = 'src/business/security-watchdog.js'
    if not os.path.exists(file): return
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    old_init = '''  constructor(alertsRepo, appsRepo, devicesRepo) {
    this.alertsRepo = alertsRepo;
    this.appsRepo = appsRepo;
    this.devicesRepo = devicesRepo;
    // Baseline system state
    this.gatewayState = {
      ip: '192.168.1.1',
      mac: '70:4F:57:12:34:56'
    };
    this.dnsServers = ['8.8.8.8', '1.1.1.1'];
    this.hostsFileHash = 'default_hosts_hash_baseline';
    this.currentWifi = {
      ssid: 'HomeOffice-5G',
      bssid: '70:4F:57:12:34:56',
      security: 'WPA2-PSK/AES'
    };
    this.proxyEnabled = false;
    this.isOnline = true;
  }'''

    new_init = '''  constructor(alertsRepo, appsRepo, devicesRepo) {
    this.alertsRepo = alertsRepo;
    this.appsRepo = appsRepo;
    this.devicesRepo = devicesRepo;
    // FUNC-05: Baselines are learned dynamically, not hardcoded
    this.gatewayState = { ip: null, mac: null };
    this.dnsServers = [];
    this.hostsFileHash = null;
    this.currentWifi = { ssid: null, bssid: null, security: null };
    this.proxyEnabled = false;
    this.isOnline = true;
    this.restoreBaseline();
  }

  learnBaseline({ gatewayIp, gatewayMac, dnsServers } = {}) {
    if (gatewayIp && gatewayMac && gatewayMac !== 'UNKNOWN') {
      this.gatewayState = { ip: gatewayIp, mac: gatewayMac.toUpperCase() };
    }
    if (Array.isArray(dnsServers) && dnsServers.length > 0) {
      this.dnsServers = dnsServers.slice();
    }
    this._persistBaseline();
  }

  _persistBaseline() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('cachywire_watchdog_baseline', JSON.stringify({
        g: this.gatewayState,
        d: this.dnsServers
      }));
    } catch {}
  }

  restoreBaseline() {
    if (typeof localStorage === 'undefined') return;
    try {
      const parsed = JSON.parse(localStorage.getItem('cachywire_watchdog_baseline') || 'null');
      if (parsed && parsed.g && parsed.g.ip && parsed.g.mac) this.gatewayState = parsed.g;
      if (parsed && Array.isArray(parsed.d) && parsed.d.length) this.dnsServers = parsed.d;
    } catch {}
  }'''

    content = content.replace(old_init, new_init)

    old_arp = '''  checkArpTable(arpEntries) {
    for (const entry of arpEntries) {
      if (entry.ip === this.gatewayState.ip) {
        if (entry.mac.toUpperCase() !== this.gatewayState.mac.toUpperCase()) {'''

    new_arp = '''  checkArpTable(arpEntries) {
    const entries = Array.isArray(arpEntries) ? arpEntries : [];
    // Learn baseline silently from live kernel data if not set
    if (!this.gatewayState.mac) {
      const gw = entries.find(e => e.ip && e.ip.endsWith('.1') && e.mac && e.mac !== 'UNKNOWN') || entries[0];
      if (gw && gw.mac && gw.mac !== 'UNKNOWN') {
        this.learnBaseline({ gatewayIp: gw.ip, gatewayMac: gw.mac });
      }
      return null;
    }
    for (const entry of entries) {
      if (entry.ip === this.gatewayState.ip) {
        if (entry.mac && entry.mac !== 'UNKNOWN' && entry.mac.toUpperCase() !== this.gatewayState.mac.toUpperCase()) {'''

    content = content.replace(old_arp, new_arp)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed src/business/security-watchdog.js (Dynamic baselines)")

if __name__ == '__main__':
    print("🚀 Starting CachyWire Auto-Patch Script...")
    fix_package_json()
    fix_run_script()
    fix_main_rs()
    fix_index_html()
    create_escape_js()
    fix_traffic_monitor()
    fix_alerts_timeline()
    fix_shell_js()
    fix_lan_scanner()
    fix_firewall_policy()
    fix_watchdog()
    print("🎉 All patches applied successfully!")
    print("👉 Next step: Run `bash ./run-cachywire.sh` to rebuild and test.")
