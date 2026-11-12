#!/usr/bin/env bash
# CachyWire launcher — hardened (AUDIT SEC-06/07, RUN-01/02)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
export CACHYWIRE_APP_DIR="$SCRIPT_DIR"

# SEC-06: private per-user runtime dir (never world-shared /tmp)
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/cachywire"
mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"
RUNTIME_BIN="$RUNTIME_DIR/cachywire-desktop"
RUNTIME_DAEMON="$RUNTIME_DIR/cachywire-daemon"
DAEMON_PIDFILE="$RUNTIME_DIR/daemon.pid"
DESKTOP_PIDFILE="$RUNTIME_DIR/desktop.pid"

# SEC-07: telemetry logs are private (they contain your network history)
umask 077
DAEMON_LOG="$RUNTIME_DIR/daemon.log"
UI_LOG="$RUNTIME_DIR/ui.log"

# RUN-01: stop previous instances by PID file (never substring pkill)
stop_by_pidfile() {
  local pf="$1"
  [ -f "$pf" ] || return 0
  local pid
  pid="$(cat "$pf" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$pf"
}
stop_by_pidfile "$DESKTOP_PIDFILE"
stop_by_pidfile "$DAEMON_PIDFILE"

# Preflight dependency checks with actionable errors
for tool in rustc gcc pkg-config ss iptables curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[!] Missing required tool: $tool" >&2; exit 1; }
done

if [ ! -x "$SCRIPT_DIR/cachywire-daemon" ] || [ "$SCRIPT_DIR/src-rust-backend/main.rs" -nt "$SCRIPT_DIR/cachywire-daemon" ]; then
  echo "[*] Compiling CachyWire native Rust backend..."
  rustc -C opt-level=3 -C strip=symbols "$SCRIPT_DIR/src-rust-backend/main.rs" -o "$SCRIPT_DIR/cachywire-daemon"
fi
cp -f "$SCRIPT_DIR/cachywire-daemon" "$RUNTIME_DAEMON"
chmod 755 "$RUNTIME_DAEMON"
if ! setcap cap_net_admin,cap_net_raw+ep "$RUNTIME_DAEMON" 2>/dev/null; then
  echo "[!] WARNING: setcap failed — packet capture/firewall features will be degraded" >&2
fi

if [ ! -f "$SCRIPT_DIR/cachywire-desktop" ] || [ "$SCRIPT_DIR/src-linux-desktop/cachywire-desktop.c" -nt "$SCRIPT_DIR/cachywire-desktop" ]; then
  echo "[*] Compiling CachyWire native GTK3 desktop shell..."
  gcc -O2 "$SCRIPT_DIR/src-linux-desktop/cachywire-desktop.c" -o "$SCRIPT_DIR/cachywire-desktop" \
    $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1 dbusmenu-gtk3-0.4 gio-2.0)
fi
cp -f "$SCRIPT_DIR/cachywire-desktop" "$RUNTIME_BIN"
chmod 755 "$RUNTIME_BIN"

echo "[*] Starting CachyWire Telemetry Engine (cachywire-daemon)..."
setsid "$RUNTIME_DAEMON" >"$DAEMON_LOG" 2>&1 &
echo $! > "$DAEMON_PIDFILE"

# RUN-02: wait for real health instead of a fixed sleep
for _ in $(seq 1 40); do
  curl -sf http://127.0.0.1:8080/api/system/status >/dev/null 2>&1 && break
  sleep 0.25
done

if [ "${1:-}" = "--daemon-only" ]; then
  echo "[+] CachyWire daemon active on http://127.0.0.1:8080 (pid $(cat "$DAEMON_PIDFILE"))"
  exit 0
fi

echo "[+] Launching CachyWire Desktop..."
setsid "$RUNTIME_BIN" "$@" >"$UI_LOG" 2>&1 &
echo $! > "$DESKTOP_PIDFILE"
