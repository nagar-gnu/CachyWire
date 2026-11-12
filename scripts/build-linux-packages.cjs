/**
 * CachyWire Linux Package Generator (Production-Grade Native Distribution)
 * Builds native CachyOS/Arch (.pkg.tar.zst) and Debian (.deb) packages
 * Requires ZERO nodejs dependency on target systems.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'linux');
const distDeb = path.join(distDir, 'deb');
const distCachyos = path.join(distDir, 'cachyos');

[distDeb, distCachyos].forEach(d => fs.mkdirSync(d, { recursive: true }));

console.log('[LINUX] Staging CachyWire application files...');
const tmpBuildRoot = fs.mkdtempSync('/tmp/cachywire-build-');
const stagingDir = path.join(tmpBuildRoot, 'staging');

const optApp = path.join(stagingDir, 'opt', 'cachywire');
const usrBin = path.join(stagingDir, 'usr', 'bin');
const usrApps = path.join(stagingDir, 'usr', 'share', 'applications');
const usrIcons = path.join(stagingDir, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps');
const systemdDir = path.join(stagingDir, 'etc', 'systemd', 'system');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(file => copyRecursive(path.join(src, file), path.join(dest, file)));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

[optApp, usrBin, usrApps, usrIcons, systemdDir].forEach(d => fs.mkdirSync(d, { recursive: true }));

const appItems = [
  'package.json', 'index.html',
  'README.md', 'ARCHITECTURE.md', 'css', 'src', 'src-linux-desktop'
];
for (const item of appItems) {
  const srcP = path.join(rootDir, item);
  if (fs.existsSync(srcP)) {
    copyRecursive(srcP, path.join(optApp, item));
  }
}

if (fs.existsSync(path.join(rootDir, 'dist', 'icons'))) {
  copyRecursive(path.join(rootDir, 'dist', 'icons'), path.join(optApp, 'icons'));
  copyRecursive(path.join(rootDir, 'dist', 'icons'), path.join(optApp, 'dist', 'icons'));
} else if (fs.existsSync(path.join(rootDir, 'icons'))) {
  copyRecursive(path.join(rootDir, 'icons'), path.join(optApp, 'icons'));
  copyRecursive(path.join(rootDir, 'icons'), path.join(optApp, 'dist', 'icons'));
}

const nativeBinSrc = path.join(rootDir, 'cachywire-desktop');
if (fs.existsSync(nativeBinSrc)) {
  const nativeBinDest = path.join(optApp, 'cachywire-desktop');
  fs.copyFileSync(nativeBinSrc, nativeBinDest);
  fs.chmodSync(nativeBinDest, 0o755);
}

const rustDaemonSrc = path.join(rootDir, 'cachywire-daemon');
if (fs.existsSync(rustDaemonSrc)) {
  const rustDaemonDest = path.join(optApp, 'cachywire-daemon');
  fs.copyFileSync(rustDaemonSrc, rustDaemonDest);
  fs.chmodSync(rustDaemonDest, 0o755);
}

const binWrapper = `#!/usr/bin/env bash
INSTALL_DIR="/opt/cachywire"
cd "$INSTALL_DIR" || exit 1
export CACHYWIRE_APP_DIR="$INSTALL_DIR"

if [ "$1" == "--daemon" ]; then
    nohup "$INSTALL_DIR/cachywire-daemon" >/tmp/cachywire-backend.log 2>&1 &
    echo "CachyWire native daemon started on port 8080."
    exit 0
fi

if [ -x "$INSTALL_DIR/cachywire-desktop" ] && { [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; }; then
    exec "$INSTALL_DIR/cachywire-desktop" "$@"
fi

if ! pgrep -f "cachywire-daemon" >/dev/null; then
    nohup "$INSTALL_DIR/cachywire-daemon" >/dev/null 2>&1 &
    sleep 0.5
fi
xdg-open "http://127.0.0.1:8080" 2>/dev/null || sensible-browser "http://127.0.0.1:8080"
`;
fs.writeFileSync(path.join(usrBin, 'cachywire'), binWrapper, { mode: 0o755 });

const desktopEntry = `[Desktop Entry]
Version=1.0
Type=Application
Name=CachyWire Network Monitor
GenericName=Network Traffic Monitor & Firewall
Comment=Visual network monitor, personal firewall, and security threat detector
Exec=/usr/bin/cachywire
Icon=cachywire
Terminal=false
Categories=Network;Security;Monitor;System;
StartupNotify=true
StartupWMClass=cachywire
Keywords=network;firewall;bandwidth;traffic;security;cachywire;cachyos;
`;
fs.writeFileSync(path.join(usrApps, 'cachywire.desktop'), desktopEntry, { mode: 0o644 });

const iconSrc = path.join(rootDir, 'icons', 'icon_512.png');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(usrIcons, 'cachywire.png'));
}

const systemdUnit = `[Unit]
Description=CachyWire Network Security Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cachywire
ExecStart=/opt/cachywire/cachywire-daemon
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
`;
fs.writeFileSync(path.join(systemdDir, 'cachywire.service'), systemdUnit, { mode: 0o644 });

console.log('[LINUX] Building Debian package...');
const debStaging = path.join(tmpBuildRoot, 'deb_staging');
fs.mkdirSync(debStaging, { recursive: true });
fs.writeFileSync(path.join(debStaging, 'debian-binary'), '2.0\n');

const controlDir = path.join(debStaging, 'control');
fs.mkdirSync(controlDir, { recursive: true });

const debControl = `Package: cachywire
Version: 0.1.0-alpha
Architecture: amd64
Maintainer: CachyWire Team <support@cachyos.org>
Installed-Size: 1350
Depends: iptables | nftables, libnotify-bin
Section: net
Priority: optional
Homepage: https://cachyos.org
Description: CachyWire Visual Network Monitor and Firewall for Linux
`;
fs.writeFileSync(path.join(controlDir, 'control'), debControl, { mode: 0o644 });

const postinstScript = `#!/bin/sh
set -e
if [ -x "/usr/bin/systemctl" ]; then
    systemctl daemon-reload >/dev/null 2>&1 || true
    systemctl enable cachywire.service >/dev/null 2>&1 || true
fi
chmod +x /usr/bin/cachywire
if [ -x "/usr/bin/setcap" ] || command -v setcap >/dev/null 2>&1; then
    setcap cap_net_admin,cap_net_raw+ep /opt/cachywire/cachywire-daemon 2>/dev/null || true
fi
update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
echo "CachyWire 0.1.0-alpha installed successfully!"
exit 0
`;
fs.writeFileSync(path.join(controlDir, 'postinst'), postinstScript, { mode: 0o755 });

const controlTarGz = path.join(debStaging, 'control.tar.gz');
const dataTarGz = path.join(debStaging, 'data.tar.gz');
execSync(`tar -czf "${controlTarGz}" -C "${controlDir}" .`);
execSync(`tar -czf "${dataTarGz}" -C "${stagingDir}" .`);

function createArArchive(outputPath, files) {
  const chunks = [];
  chunks.push(Buffer.from('!<arch>\n', 'ascii'));
  files.forEach(f => {
    const content = fs.readFileSync(f.path);
    const stat = fs.statSync(f.path);
    const header = Buffer.alloc(60, 0x20);
    const nameStr = (f.name + '/').padEnd(16, ' ');
    header.write(nameStr, 0, 16, 'ascii');
    const mtimeStr = Math.floor(stat.mtimeMs / 1000).toString().padEnd(12, ' ');
    header.write(mtimeStr, 16, 12, 'ascii');
    header.write('0     ', 28, 6, 'ascii');
    header.write('0     ', 34, 6, 'ascii');
    header.write('100644  ', 40, 8, 'ascii');
    const sizeStr = content.length.toString().padEnd(10, ' ');
    header.write(sizeStr, 48, 10, 'ascii');
    header[58] = 0x60;
    header[59] = 0x0a;
    chunks.push(header);
    chunks.push(content);
    if (content.length % 2 !== 0) {
      chunks.push(Buffer.from('\n', 'ascii'));
    }
  });
  fs.writeFileSync(outputPath, Buffer.concat(chunks));
}

const finalDebPath = path.join(distDeb, 'cachywire_0.1.0-alpha_amd64.deb');
createArArchive(finalDebPath, [
  { name: 'debian-binary', path: path.join(debStaging, 'debian-binary') },
  { name: 'control.tar.gz', path: controlTarGz },
  { name: 'data.tar.gz', path: dataTarGz }
]);
console.log(`[DEB] Successfully created ${finalDebPath}`);

console.log('[CACHYOS/ARCH] Building .pkg.tar.zst package...');
const cachyStaging = path.join(tmpBuildRoot, 'cachy_staging');
copyRecursive(stagingDir, cachyStaging);
fs.chmodSync(path.join(cachyStaging, 'usr', 'bin', 'cachywire'), 0o755);

const pkgInfo = `# Generated by CachyWire Package Engine
pkgname = cachywire
pkgbase = cachywire
pkgver = 0.1.0.alpha-1
pkgdesc = Visual network monitor, personal firewall, and security watchdog for Linux
url = https://cachyos.org
builddate = ${Math.floor(Date.now() / 1000)}
packager = CachyWire Team <support@cachyos.org>
size = ${Math.floor(fs.statSync(dataTarGz).size * 3.5)}
arch = x86_64
license = MIT
depend = gtk3
depend = webkit2gtk-4.1
depend = libayatana-appindicator
depend = sqlite
depend = iptables
depend = libnotify
`;
fs.writeFileSync(path.join(cachyStaging, '.PKGINFO'), pkgInfo, { mode: 0o644 });

const installScript = `post_install() {
    pkill -f "cachywire-desktop" >/dev/null 2>&1 || true
    pkill -f "cachywire-daemon" >/dev/null 2>&1 || true
    if command -v setcap >/dev/null 2>&1; then
        setcap cap_net_admin,cap_net_raw+ep /opt/cachywire/cachywire-daemon 2>/dev/null || true
    fi
    update-desktop-database -q || true
    gtk-update-icon-cache -q -t -f usr/share/icons/hicolor || true
    systemctl daemon-reload >/dev/null 2>&1 || true
    echo ">>> CachyWire 0.1.0-alpha installed successfully!"
}
post_upgrade() { post_install; }
`;
fs.writeFileSync(path.join(cachyStaging, '.INSTALL'), installScript, { mode: 0o644 });

const finalCachyPkg = path.join(distCachyos, 'cachywire-0.1.0_alpha-1-x86_64.pkg.tar.zst');
execSync(`tar --zstd -cf "${finalCachyPkg}" -C "${cachyStaging}" .PKGINFO .INSTALL opt usr etc`);
console.log(`[CACHYOS/ARCH] Successfully created ${finalCachyPkg}`);
