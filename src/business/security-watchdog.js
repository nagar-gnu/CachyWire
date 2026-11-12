/**
 * CachyWire 0.1.0-alpha - Security Watchdogs & System Monitors
 * Implements Section 5.7 and FUNC-05 / FUNC-07:
 * - ARP Spoofing State Machine
 * - Wi-Fi Evil Twin Detector
 * - Binary Integrity Checker (BR-02)
 * - Hosts File & DNS Server Watcher
 * - Remote Desktop & Proxy Watchdogs
 *
 * AUDIT FIXES (Batch #2):
 *  - FUNC-05: baselines (gateway MAC, DNS servers, hosts-file hash, Wi-Fi BSSID)
 *    are now LEARNED from the live system on first sight and persisted to
 *    localStorage, instead of hardcoded values that fired false-positive
 *    critical alerts on every real network.
 */
export class SecurityWatchdog {
  constructor(alertsRepo, appsRepo, devicesRepo) {
    this.alertsRepo = alertsRepo;
    this.appsRepo = appsRepo;
    this.devicesRepo = devicesRepo;
    // Baselines start empty and are learned from live kernel data (AUDIT FUNC-05)
    this.gatewayState = { ip: null, mac: null };
    this.dnsServers = [];
    this.hostsFileHash = null;
    this.currentWifi = { ssid: null, bssid: null, security: null };
    this.proxyEnabled = false;
    this.isOnline = true;
    this.restoreBaseline();
  }

  /** Store a trusted baseline learned from the live system */
  learnBaseline({ gatewayIp, gatewayMac, dnsServers, wifi } = {}) {
    if (gatewayIp && gatewayMac && gatewayMac !== 'UNKNOWN') {
      this.gatewayState = { ip: gatewayIp, mac: gatewayMac.toUpperCase() };
    }
    if (Array.isArray(dnsServers) && dnsServers.length > 0) {
      this.dnsServers = dnsServers.slice();
    }
    if (wifi && wifi.ssid && wifi.bssid) {
      this.currentWifi = { ssid: wifi.ssid, bssid: wifi.bssid, security: wifi.security || null };
    }
    this._persistBaseline();
  }

  _persistBaseline() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('cachywire_watchdog_baseline', JSON.stringify({
        g: this.gatewayState,
        d: this.dnsServers,
        w: this.currentWifi
      }));
    } catch {}
  }

  restoreBaseline() {
    if (typeof localStorage === 'undefined') return;
    try {
      const parsed = JSON.parse(localStorage.getItem('cachywire_watchdog_baseline') || 'null');
      if (parsed && parsed.g && parsed.g.ip && parsed.g.mac) this.gatewayState = parsed.g;
      if (parsed && Array.isArray(parsed.d) && parsed.d.length) this.dnsServers = parsed.d;
      if (parsed && parsed.w && parsed.w.ssid) this.currentWifi = parsed.w;
    } catch {}
  }

  // 1. ARP Spoofing State Machine (Section 5.7 #1)
  checkArpTable(arpEntries) {
    const entries = Array.isArray(arpEntries) ? arpEntries : [];
    // No trusted baseline yet => learn silently from live kernel data (prefer the .1 router)
    if (!this.gatewayState.mac) {
      const gw = entries.find(e => e.ip && e.ip.endsWith('.1') && e.mac && e.mac !== 'UNKNOWN') || entries[0];
      if (gw && gw.mac && gw.mac !== 'UNKNOWN') {
        this.learnBaseline({ gatewayIp: gw.ip, gatewayMac: gw.mac });
      }
      return null;
    }
    for (const entry of entries) {
      if (entry.ip === this.gatewayState.ip) {
        if (entry.mac && entry.mac !== 'UNKNOWN' &&
          entry.mac.toUpperCase() !== this.gatewayState.mac.toUpperCase()) {
          return this.alertsRepo.create({
            alert_type: 'ARP_SPOOF',
            severity: 3, // Critical
            title: 'ARP Spoofing Detected!',
            details_json: {
              gatewayIp: this.gatewayState.ip,
              originalMac: this.gatewayState.mac,
              spoofedMac: entry.mac,
              description: 'Gateway MAC address has changed or is being intercepted by an attacker.'
            }
          });
          }
      }
    }
    return null;
  }

  // 2. Wi-Fi Evil Twin Detector (Section 5.7 #2)
  checkNearbyWifi(beacons) {
    if (!Array.isArray(beacons) || beacons.length === 0) return null;
    // First run: learn the current network as the trusted baseline silently
    if (!this.currentWifi.ssid) {
      this.learnBaseline({ wifi: beacons[0] });
      return null;
    }
    for (const b of beacons) {
      if (b.ssid === this.currentWifi.ssid && b.bssid !== this.currentWifi.bssid) {
        if (b.security === 'Open' || b.security === 'None' || b.security !== this.currentWifi.security) {
          return this.alertsRepo.create({
            alert_type: 'WIFI_EVIL_TWIN',
            severity: 3, // Critical
            title: `Wi-Fi Evil Twin Warning: ${b.ssid}`,
            details_json: {
              ssid: b.ssid,
              fakeBssid: b.bssid,
              realSecurity: this.currentWifi.security,
              fakeSecurity: b.security,
              description: 'An untrusted access point with matching SSID and weaker encryption was detected.'
            }
          });
        }
      }
    }
    return null;
  }

  // 3. Binary Integrity & Modification Check (BR-02, Section 5.7 #3)
  verifyBinaryIntegrity(appId, newSha256, newVersion = null) {
    const app = this.appsRepo.getById(appId);
    if (!app) return null;
    if (app.sha256_hash && app.sha256_hash !== newSha256) {
      const oldHash = app.sha256_hash;
      this.appsRepo.update(appId, {
        sha256_hash: newSha256,
        file_version: newVersion || app.file_version,
        last_seen_ts: Date.now()
      });
      return this.alertsRepo.create({
        alert_type: 'APP_CHANGED',
        severity: 2, // Warning
        app_id: appId,
        title: `Application binary modified: ${app.app_name}`,
        details_json: {
          path: app.exe_path,
          previousSha256: oldHash,
          newSha256: newSha256,
          publisher: app.publisher
        }
      });
    }
    return null;
  }

  // 4. Hosts File Watcher
  verifyHostsFile(currentContentHash) {
    if (!this.hostsFileHash) {
      this.hostsFileHash = currentContentHash; // learn baseline silently
      return null;
    }
    if (this.hostsFileHash !== currentContentHash) {
      this.hostsFileHash = currentContentHash;
      return this.alertsRepo.create({
        alert_type: 'HOSTS_CHANGED',
        severity: 3, // Critical
        title: 'System Hosts file (/etc/hosts) was modified',
                                    details_json: {
                                      path: '/etc/hosts',
                                      action: 'DNS redirection / domain override detected'
                                    }
      });
    }
    return null;
  }

  // 5. DNS Server Watcher
  verifyDnsServers(newDnsList) {
    if (!Array.isArray(newDnsList) || newDnsList.length === 0) return null;
    if (this.dnsServers.length === 0) {
      this.learnBaseline({ dnsServers: newDnsList }); // learn silently on first run
      return null;
    }
    const isDifferent = newDnsList.length !== this.dnsServers.length ||
    newDnsList.some((ip, idx) => ip !== this.dnsServers[idx]);
    if (isDifferent) {
      const previous = [...this.dnsServers];
      this.dnsServers = newDnsList;
      return this.alertsRepo.create({
        alert_type: 'DNS_CHANGED',
        severity: 2, // Warning
        title: 'Network DNS servers changed',
        details_json: {
          previousServers: previous,
          newServers: newDnsList
        }
      });
    }
    return null;
  }

  // 6. RDP Remote Connection Detector
  notifyRdpSession(clientIp, username = 'Administrator') {
    return this.alertsRepo.create({
      alert_type: 'RDP_CONNECTION',
      severity: 2, // Warning
      title: `Remote Desktop connection from ${clientIp}`,
      details_json: { clientIp, username, port: 3389 }
    });
  }

  // 7. Proxy Settings Watcher
  verifyProxySettings(isProxyActive, proxyUrl = '') {
    if (this.proxyEnabled !== isProxyActive) {
      this.proxyEnabled = isProxyActive;
      return this.alertsRepo.create({
        alert_type: 'PROXY_SETTINGS_CHANGED',
        severity: 2, // Warning
        title: isProxyActive ? 'System Proxy enabled' : 'System Proxy disabled',
        details_json: { proxyUrl, active: isProxyActive }
      });
    }
    return null;
  }

  // 8. Internet Connection Loss / Restore
  setInternetStatus(online) {
    if (this.isOnline !== online) {
      this.isOnline = online;
      return this.alertsRepo.create({
        alert_type: online ? 'INTERNET_RESTORED' : 'INTERNET_LOST',
        severity: online ? 1 : 2,
        title: online ? 'Internet access restored' : 'Internet access lost / offline',
        details_json: { isOnline: online, timestamp: Date.now() }
      });
    }
    return null;
  }
}
