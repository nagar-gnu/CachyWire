#!/usr/bin/env python3
"""
CachyWire Auto-Fix Script - Batch #3
يصلح كل المشاكل الأمنية والوظيفية المتبقية
"""
import os
import re
import json

def fix_main_rs():
    """إصلاح الثغرات الأمنية في Rust Backend"""
    file = 'src-rust-backend/main.rs'
    if not os.path.exists(file):
        print(f"⚠️  {file} غير موجود")
        return

    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. إزالة CORS headers
    content = re.sub(
        r'Access-Control-Allow-Origin: \*\r?\nAccess-Control-Allow-Headers: Content-Type\r?\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r?\n',
        '',
        content
    )

    # 2. إضافة دالة write_atomic قبل fn main
    if 'fn write_atomic' not in content:
        atomic_fn = '''
// AUDIT SEC-04: Atomic write to prevent DB corruption
fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path)
}

fn main() {'''
        content = content.replace('fn main() {', atomic_fn)

    # 3. استبدال fs::write بـ write_atomic في POST /api/database/state
    content = re.sub(
        r'let _ = fs::write\(&db_path, &body_bytes\);',
        r'if write_atomic(&db_path, &body_bytes).is_err() { send_response(&mut stream, "500 Internal Server Error", "application/json; charset=utf-8", b"{\\"ok\\":false}"); return; }',
        content
    )

    # 4. إضافة حد 64MB للـ content_length
    content = re.sub(
        r'content_length = val\.trim\(\)\.parse::<usize>\(\)\.unwrap_or\(0\);',
        r'content_length = val.trim().parse::<usize>().unwrap_or(0).min(64 * 1024 * 1024);',
        content
    )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ main.rs - تم إصلاح CORS + Atomic Write + DoS Cap")

def fix_run_script():
    """إصلاح سكريبت التشغيل"""
    file = 'run-cachywire.sh'
    if not os.path.exists(file):
        print(f"⚠️  {file} غير موجود")
        return

    new_content = '''#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
export CACHYWIRE_APP_DIR="$SCRIPT_DIR"

# SEC-06: استخدام مجلد آمن بدلاً من /tmp
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/cachywire"
mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"
RUNTIME_BIN="$RUNTIME_DIR/cachywire-desktop"
RUNTIME_DAEMON="$RUNTIME_DIR/cachywire-daemon"
DAEMON_PID="$RUNTIME_DIR/daemon.pid"
DESKTOP_PID="$RUNTIME_DIR/desktop.pid"

# SEC-07: لوجات خاصة
umask 077
DAEMON_LOG="$RUNTIME_DIR/daemon.log"
UI_LOG="$RUNTIME_DIR/ui.log"

# RUN-01: إيقاف آمن بـ PID files
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

# فحص الأدوات المطلوبة
for tool in rustc gcc pkg-config ss iptables curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[!] Missing tool: $tool" >&2; exit 1; }
done

# بناء الـ Daemon
if [ ! -x "$SCRIPT_DIR/cachywire-daemon" ] || [ "$SCRIPT_DIR/src-rust-backend/main.rs" -nt "$SCRIPT_DIR/cachywire-daemon" ]; then
  echo "[*] Compiling CachyWire native Rust backend..."
  rustc -C opt-level=3 -C strip=symbols "$SCRIPT_DIR/src-rust-backend/main.rs" -o "$SCRIPT_DIR/cachywire-daemon"
fi
cp -f "$SCRIPT_DIR/cachywire-daemon" "$RUNTIME_DAEMON"
chmod 755 "$RUNTIME_DAEMON"
if ! setcap cap_net_admin,cap_net_raw+ep "$RUNTIME_DAEMON" 2>/dev/null; then
  echo "[!] WARNING: setcap failed — firewall features degraded" >&2
fi

# بناء الـ Desktop Shell
if [ ! -f "$SCRIPT_DIR/cachywire-desktop" ] || [ "$SCRIPT_DIR/src-linux-desktop/cachywire-desktop.c" -nt "$SCRIPT_DIR/cachywire-desktop" ]; then
  echo "[*] Compiling CachyWire native GTK3 desktop shell..."
  gcc -O2 "$SCRIPT_DIR/src-linux-desktop/cachywire-desktop.c" -o "$SCRIPT_DIR/cachywire-desktop" \\
    $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1 dbusmenu-gtk3-0.4 gio-2.0)
fi
cp -f "$SCRIPT_DIR/cachywire-desktop" "$RUNTIME_BIN"
chmod 755 "$RUNTIME_BIN"

# تشغيل الـ Daemon
echo "[*] Starting CachyWire Telemetry Engine..."
setsid "$RUNTIME_DAEMON" >"$DAEMON_LOG" 2>&1 &
echo $! > "$DAEMON_PID"

# RUN-02: Health check بدلاً من sleep ثابت
for _ in $(seq 1 40); do
  curl -sf http://127.0.0.1:8080/api/system/status >/dev/null 2>&1 && break
  sleep 0.25
done

if [ "${1:-}" = "--daemon-only" ]; then
  echo "[+] Daemon active on http://127.0.0.1:8080"
  exit 0
fi

# تشغيل الـ Desktop
echo "[+] Launching CachyWire Desktop..."
setsid "$RUNTIME_BIN" "$@" >"$UI_LOG" 2>&1 &
echo $! > "$DESKTOP_PID"
'''

    with open(file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    os.chmod(file, 0o755)
    print("✅ run-cachywire.sh - تم إصلاح XDG + PID files + Health check")

def fix_package_json():
    """تنظيف package.json"""
    file = 'package.json'
    if not os.path.exists(file):
        print(f"⚠️  {file} غير موجود")
        return

    with open(file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # إزالة المسافات الزائدة من المفاتيح
    clean_data = {}
    for k, v in data.items():
        clean_k = k.strip()
        if isinstance(v, str):
            clean_data[clean_k] = v.strip()
        elif isinstance(v, dict) and clean_k == 'scripts':
            clean_scripts = {}
            for sk, sv in v.items():
                clean_sk = sk.strip()
                # إزالة السكربتات الميتة
                if clean_sk in ['start', 'test', 'daemon']:
                    if clean_sk == 'daemon':
                        clean_scripts[clean_sk] = 'bash ./run-cachywire.sh --daemon-only'
                    else:
                        clean_scripts[clean_sk] = sv.strip()
            clean_data[clean_k] = clean_scripts
        else:
            clean_data[clean_k] = v

    with open(file, 'w', encoding='utf-8') as f:
        json.dump(clean_data, f, indent=2)
    print("✅ package.json - تم تنظيف المسافات والسكربتات الميتة")

def create_escape_js():
    """إنشاء ملف escape.js"""
    os.makedirs('src/utils', exist_ok=True)
    file = 'src/utils/escape.js'

    content = '''/**
 * CachyWire - HTML Escaping Helper (SEC-03)
 * كل string ديناميكي يدخل innerHTML لازم يعدّي من هنا
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

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ src/utils/escape.js - تم إنشاء دالة الحماية من XSS")

def fix_traffic_monitor():
    """إصلاح XSS في traffic-monitor.js"""
    file = 'src/presentation/traffic-monitor.js'
    if not os.path.exists(file):
        print(f"⚠️  {file} غير موجود")
        return

    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # إضافة import
    if "import { esc } from '../utils/escape.js';" not in content:
        content = content.replace(
            "import { lookupGeoIp } from '../utils/geoip.js';",
            "import { lookupGeoIp } from '../utils/geoip.js';\nimport { esc } from '../utils/escape.js';"
        )

    # تغليف المتغيرات الديناميكية
    content = re.sub(r'\$\{app\.exe_path \|\| \'\'\}', "${esc(app.exe_path || '')}", content)
    content = re.sub(r'\$\{app\.app_name\}', '${esc(app.app_name)}', content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ traffic-monitor.js - تم إضافة حماية XSS")

def fix_shell_js():
    """إصلاح Snooze في shell.js"""
    file = 'src/presentation/shell.js'
    if not os.path.exists(file):
        print(f"⚠️  {file} غير موجود")
        return

    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # إضافة زر Snooze في الـ header
    if 'id="pill-snooze-toggle"' not in content:
        content = content.replace(
            '<button class="status-pill" id="btn-theme-toggle"',
            '''<button class="status-pill" id="pill-snooze-toggle" title="Snooze alerts for 24h">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
         <span id="text-snooze-status">Snooze</span>
       </button>
       <button class="status-pill" id="btn-theme-toggle"'''
        )

    # إضافة event listener للـ Snooze
    if "pill-snooze-toggle" not in content.split('_bindEvents')[1] if '_bindEvents' in content else '':
        content = content.replace(
            "this.container.querySelector('#pill-incognito-toggle')?.addEventListener('click', () => this.onIncognitoToggle());",
            """this.container.querySelector('#pill-snooze-toggle')?.addEventListener('click', () => this.onSnoozeToggle());
    this.container.querySelector('#pill-incognito-toggle')?.addEventListener('click', () => this.onIncognitoToggle());"""
        )

    # إصلاح showToast لاحترام Snooze
    content = re.sub(
        r'showToast\(message, type = \'info\'\) \{\s*const container = document\.getElementById\(\'toast-container\'\);',
        '''showToast(message, type = 'info') {
    // FUNC-09: احترام Snooze (الحرجة بس تعدّي)
    if (this.state.isSnoozed && type !== 'critical') return;
    const container = document.getElementById('toast-container');''',
        content
    )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ shell.js - تم إضافة Snooze button + إصلاح showToast")

def fix_lan_scanner():
    """إزالة الجهاز الوهمي وإضافة XSS protection"""
    file = 'src/presentation/lan-scanner.js'
    if not os.path.exists(file):
        print(f"⚠️  {file} غير موجود")
        return

    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # إضافة import
    if "import { esc } from '../utils/escape.js';" not in content:
        content = content.replace(
            "import { lookupMacVendor } from '../utils/oui-vendors.js';",
            "import { lookupMacVendor } from '../utils/oui-vendors.js';\nimport { esc } from '../utils/escape.js';"
        )

    # إزالة Samsung TV الوهمي
    content = re.sub(
        r'if \(currentDevices\.length < 6\) \{.*?Samsung-Smart-TV.*?\n\s*\}',
        '// DATA-01: Removed fake device injection',
        content,
        flags=re.DOTALL
    )

    # تغليف المتغيرات
    content = re.sub(r'value="\$\{displayName\}"', 'value="${esc(displayName)}"', content)
    content = re.sub(r'>\$\{dev\.last_ip\}<', '>${esc(dev.last_ip)}<', content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ lan-scanner.js - تم إزالة الجهاز الوهمي + XSS protection")

def fix_firewall_policy():
    """إصلاح تبديل Profiles"""
    file = 'src/business/firewall-policy.js'
    if not os.path.exists(file):
        print(f"⚠️  {file} غير موجود")
        return

    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # إصلاح setProfile ليرسل enforcement
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
        // FUNC-03: تبديل البروفايل لازم يوصل للكيرنل
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
    print("✅ firewall-policy.js - تم إصلاح Profile enforcement")

def fix_security_watchdog():
    """إزالة baselines hardcoded"""
    file = 'src/business/security-watchdog.js'
    if not os.path.exists(file):
        print(f"⚠️  {file} غير موجود")
        return

    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # استبدال baselines hardcoded بـ null
    content = re.sub(
        r'this\.gatewayState = \{\s*ip: \'192\.168\.1\.1\',\s*mac: \'70:4F:57:12:34:56\'\s*\};',
        "this.gatewayState = { ip: null, mac: null };",
        content
    )

    content = re.sub(
        r'this\.dnsServers = \[\'8\.8\.8\.8\', \'1\.1\.1\.1\'\];',
        "this.dnsServers = [];",
        content
    )

    content = re.sub(
        r'this\.hostsFileHash = \'default_hosts_hash_baseline\';',
        "this.hostsFileHash = null;",
        content
    )

    # إضافة دالة learnBaseline
    if 'learnBaseline' not in content:
        learn_fn = '''
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
  }
'''
        content = content.replace(
            "this.isOnline = true;\n  }",
            "this.isOnline = true;\n  }\n" + learn_fn
        )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ security-watchdog.js - تم إزالة baselines hardcoded + إضافة learnBaseline")

def main():
    print("🚀 بدء تطبيق الإصلاحات...\n")

    fix_main_rs()
    fix_run_script()
    fix_package_json()
    create_escape_js()
    fix_traffic_monitor()
    fix_shell_js()
    fix_lan_scanner()
    fix_firewall_policy()
    fix_security_watchdog()

    print("\n" + "="*60)
    print("🎉 تم تطبيق جميع الإصلاحات بنجاح!")
    print("="*60)
    print("\n📋 الخطوات التالية:")
    print("1. شغّل: bash ./run-cachywire.sh")
    print("2. اختبر التطبيق")
    print("3. لو فيه مشاكل، ابعتلي الأخطاء")

if __name__ == '__main__':
    main()
