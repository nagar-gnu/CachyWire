/**
 * CachyWire 0.1.0-alpha - Modals Controller
 * Implements:
 * - SCR-07: Application Detail Modal
 * - SCR-08: Remote Host Detail Modal
 * - SCR-09: Ask to Connect Firewall Prompt
 * - SCR-10: Multi-Tab Settings Dialog
 */

import { formatBytes, formatDateTime } from '../utils/formatters.js';
import { getAppIconSvg } from '../utils/app-icons.js';

export class ModalsController {
  constructor(options = {}) {
    this.appsRepo = options.appsRepo;
    this.hostsRepo = options.hostsRepo;
    this.trafficRepo = options.trafficRepo;
    this.firewallPolicy = options.firewallPolicy;
    this.securityScoreEngine = options.securityScoreEngine;
    this.virusTotalClient = options.virusTotalClient;
    this.exportService = options.exportService;
    this.settings = options.settings;
    this.onSettingsUpdated = options.onSettingsUpdated || (() => {});
  }

  // --------------------------------------------------------------------------
  // Premium Lifetime License Modal (All Services Unlocked)
  // --------------------------------------------------------------------------
  showLicenseModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;

    backdrop.innerHTML = `
      <div class="gw-dialog" style="width: 520px; border: 2px solid #FFD700;">
        <div class="dialog-header" style="background: linear-gradient(90deg, rgba(255, 215, 0, 0.15) 0%, rgba(0, 194, 255, 0.1) 100%);">
          <div class="dialog-title" style="color: #FFD700;">
            <span>👑</span>
            <span>CachyWire Lifetime Edition (v0.1.0-alpha)</span>
          </div>
          <button class="dialog-close-btn" id="modal-close-x">✕</button>
        </div>

        <div class="dialog-body">
          <div style="display:flex;align-items:center;gap:12px;padding:8px 0;">
            <div style="font-size: 28px;">🛡️</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--gw-text-primary);">All Premium & Enterprise Features Unlocked</div>
              <div style="font-size: 11px; color: var(--gw-safe); margin-top: 2px;">● Status: Activated & Unlimited (Free for All Users — CachyOS Edition)</div>
            </div>
          </div>

          <table class="meta-table">
            <tr>
              <td class="meta-label">License Key</td>
              <td class="meta-val" style="color:#00C2FF;">GW-PREMIUM-LIFETIME-UNLIMITED-ENTERPRISE</td>
            </tr>
            <tr>
              <td class="meta-label">History Retention</td>
              <td class="meta-val" style="color:var(--gw-safe);">Unlimited (5m, 3h, 24h, Week, Month, 1 Year+)</td>
            </tr>
            <tr>
              <td class="meta-label">Remote Servers</td>
              <td class="meta-val" style="color:var(--gw-safe);">Unlimited Multi-Server Monitoring (Port 7010 TLS)</td>
            </tr>
            <tr>
              <td class="meta-label">Firewall Features</td>
              <td class="meta-val" style="color:var(--gw-safe);">Ask-to-Connect, Lockdown Block-All, Multiple Profiles</td>
            </tr>
            <tr>
              <td class="meta-label">Security Watchdogs</td>
              <td class="meta-val" style="color:var(--gw-safe);">ARP Spoofing, DNS Hijack, Hosts File, Wi-Fi Evil Twin</td>
            </tr>
            <tr>
              <td class="meta-label">VirusTotal API</td>
              <td class="meta-val" style="color:var(--gw-safe);">Automated Background Multi-Engine Inspection</td>
            </tr>
            <tr>
              <td class="meta-label">Visual Themes</td>
              <td class="meta-val" style="color:var(--gw-safe);">All Skins Unlocked (Cyber-Analytics, Light, Midnight, Cyberpunk)</td>
            </tr>
          </table>
        </div>

        <div class="dialog-footer">
          <button class="pill-btn active" id="btn-modal-done">Close</button>
        </div>
      </div>
    `;

    backdrop.classList.add('open');
    const close = () => {
      backdrop.classList.remove('open');
      if (window.gwApp && window.gwApp.trafficView) {
        window.gwApp.trafficView.renderGraph();
        window.gwApp.trafficView.renderScrubber();
        window.gwApp.trafficView.refreshAppsList();
      }
    };
    backdrop.querySelector('#modal-close-x').addEventListener('click', close);
    backdrop.querySelector('#btn-modal-done').addEventListener('click', close);
  }

  // --------------------------------------------------------------------------
  // SCR-07: Application Detail Modal
  // --------------------------------------------------------------------------
  showAppDetailModal(app) {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;

    const rating = this.securityScoreEngine.getScoreRating(app.security_score);
    const glyph = app.app_name.substring(0, 2).toUpperCase();

    backdrop.innerHTML = `
      <div class="gw-dialog" style="width: 580px;">
        <div class="dialog-header">
          <div class="dialog-title">
            <span class="app-vector-icon" style="width:24px;height:24px;display:inline-flex;">${getAppIconSvg(app.app_name, app.exe_path)}</span>
            <span>${app.app_name}</span>
          </div>
          <button class="dialog-close-btn" id="modal-close-x">✕</button>
        </div>

        <div class="dialog-body">
          <table class="meta-table">
            <tr>
              <td class="meta-label">Executable Path</td>
              <td class="meta-val">${app.exe_path}</td>
            </tr>
            <tr>
              <td class="meta-label">Publisher</td>
              <td class="meta-val">${app.publisher || 'Unknown'} ${app.is_signed ? '✓ (Authenticode Verified)' : '⚠️ (Unsigned)'}</td>
            </tr>
            <tr>
              <td class="meta-label">File Version</td>
              <td class="meta-val">${app.file_version || '1.0.0.0'}</td>
            </tr>
            <tr>
              <td class="meta-label">SHA-256 Hash</td>
              <td class="meta-val" style="font-size: 11px;">${app.sha256_hash}</td>
            </tr>
            <tr>
              <td class="meta-label">CachyWire Score</td>
              <td class="meta-val">
                <span class="score-badge ${rating.cssClass}">${app.security_score}/100 ${rating.label}</span>
              </td>
            </tr>
            <tr>
              <td class="meta-label">VirusTotal Status</td>
              <td class="meta-val">
                ${app.vt_total > 0
                  ? `<span class="vt-pill ${app.vt_positives === 0 ? 'clean' : 'infected'}">${app.vt_positives} / ${app.vt_total} detections</span>`
                  : '<span class="vt-pill unknown">Not yet scanned</span>'}
              </td>
            </tr>
            <tr>
              <td class="meta-label">Firewall State</td>
              <td class="meta-val" style="color:${app.firewall_state === 1 ? 'var(--gw-danger)' : 'var(--gw-safe)'}; font-weight:700;">
                ${app.firewall_state === 1 ? 'BLOCKED' : 'ALLOWED'}
              </td>
            </tr>
            <tr>
              <td class="meta-label">First Seen</td>
              <td class="meta-val">${formatDateTime(app.first_seen_ts)}</td>
            </tr>
            <tr>
              <td class="meta-label">Last Activity</td>
              <td class="meta-val">${formatDateTime(app.last_seen_ts)}</td>
            </tr>
          </table>
        </div>

        <div class="dialog-footer">
          <button class="pill-btn" id="btn-open-file-location">Open File Location</button>
          <button class="pill-btn ${app.firewall_state === 1 ? 'active' : ''}" id="btn-modal-toggle-block">
            ${app.firewall_state === 1 ? 'Unblock Application' : 'Block Application'}
          </button>
          <button class="pill-btn active" id="btn-modal-done">Close</button>
        </div>
      </div>
    `;

    backdrop.classList.add('open');

    // Close handlers
    const close = () => {
      backdrop.classList.remove('open');
      if (window.gwApp && window.gwApp.trafficView) {
        window.gwApp.trafficView.renderGraph();
        window.gwApp.trafficView.renderScrubber();
        window.gwApp.trafficView.refreshAppsList();
      }
    };
    backdrop.querySelector('#modal-close-x').addEventListener('click', close);
    backdrop.querySelector('#btn-modal-done').addEventListener('click', close);

    // Open file location handler (Section 3.2 Screen 1 / 4)
    backdrop.querySelector('#btn-open-file-location').addEventListener('click', () => {
      if (window.app && window.app.shell) {
        window.app.shell.showToast(`File location: ${app.exe_path}`, 'info');
      }
    });

    // Toggle block button
    backdrop.querySelector('#btn-modal-toggle-block').addEventListener('click', () => {
      this.firewallPolicy.toggleBlock(app.app_id);
      if (window.app && window.app.firewallView) {
        window.app.firewallView.refresh();
      }
      this.showAppDetailModal(this.appsRepo.getById(app.app_id));
    });
  }

  // --------------------------------------------------------------------------
  // SCR-08: Remote Host Detail Modal
  // --------------------------------------------------------------------------
  showHostDetailModal(host) {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;

    backdrop.innerHTML = `
      <div class="gw-dialog" style="width: 520px;">
        <div class="dialog-header">
          <div class="dialog-title">
            <span>🌐</span>
            <span>Remote Host: ${host.domain_name || host.ip_address}</span>
          </div>
          <button class="dialog-close-btn" id="modal-close-x">✕</button>
        </div>

        <div class="dialog-body">
          <table class="meta-table">
            <tr>
              <td class="meta-label">IP Address</td>
              <td class="meta-val">${host.ip_address}</td>
            </tr>
            <tr>
              <td class="meta-label">Hostname / Domain</td>
              <td class="meta-val">${host.domain_name || 'No reverse DNS record'}</td>
            </tr>
            <tr>
              <td class="meta-label">Country</td>
              <td class="meta-val">${host.country_iso2} (${host.country_iso2 === 'LAN' ? 'Local Network' : 'Global'})</td>
            </tr>
            <tr>
              <td class="meta-label">Organization / ASN</td>
              <td class="meta-val">${host.asn_org || 'Standard Autonomous System'}</td>
            </tr>
            <tr>
              <td class="meta-label">First Contact</td>
              <td class="meta-val">${formatDateTime(host.first_seen_ts)}</td>
            </tr>
            <tr>
              <td class="meta-label">Last Seen</td>
              <td class="meta-val">${formatDateTime(host.last_seen_ts)}</td>
            </tr>
          </table>
        </div>

        <div class="dialog-footer">
          <button class="pill-btn active" id="btn-modal-done">Close</button>
        </div>
      </div>
    `;

    backdrop.classList.add('open');
    const close = () => {
      backdrop.classList.remove('open');
      if (window.gwApp && window.gwApp.trafficView) {
        window.gwApp.trafficView.renderGraph();
        window.gwApp.trafficView.renderScrubber();
        window.gwApp.trafficView.refreshAppsList();
      }
    };
    backdrop.querySelector('#modal-close-x').addEventListener('click', close);
    backdrop.querySelector('#btn-modal-done').addEventListener('click', close);
  }

  // --------------------------------------------------------------------------
  // SCR-09: Ask to Connect Firewall Prompt
  // --------------------------------------------------------------------------
  showAskToConnectPrompt(app, onDecision) {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;

    backdrop.innerHTML = `
      <div class="gw-dialog ask-connect-prompt">
        <div class="dialog-header" style="background: rgba(0, 194, 255, 0.08);">
          <div class="dialog-title" style="color: var(--gw-accent);">
            <span>🛡️ CachyWire Firewall Alert</span>
          </div>
        </div>

        <div class="dialog-body">
          <div style="font-size: 14px; font-weight: 700; color: var(--gw-text-primary);">
            New application wants to connect to the Internet:
          </div>

          <div class="prompt-icon-area">
            <span class="app-vector-icon" style="width:36px;height:36px;display:inline-flex;">${getAppIconSvg(app.app_name, app.exe_path)}</span>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--gw-text-primary);">${app.app_name}</div>
              <div style="font-size: 11px; color: var(--gw-text-secondary);">${app.publisher || 'Unverified Publisher'}</div>
            </div>
          </div>

          <table class="meta-table">
            <tr>
              <td class="meta-label">Path</td>
              <td class="meta-val" style="font-size: 11px;">${app.exe_path}</td>
            </tr>
            <tr>
              <td class="meta-label">Digital Signature</td>
              <td class="meta-val">${app.is_signed ? '✓ Valid Authenticode' : '⚠️ Unverified'}</td>
            </tr>
          </table>
        </div>

        <div class="dialog-footer" style="padding: 16px;">
          <div class="prompt-actions">
            <button class="prompt-btn allow" id="btn-prompt-allow">
              ✓ Allow Connection
            </button>
            <button class="prompt-btn block" id="btn-prompt-block">
              ✕ Block Connection
            </button>
          </div>
        </div>
      </div>
    `;

    backdrop.classList.add('open');

    backdrop.querySelector('#btn-prompt-allow').addEventListener('click', () => {
      backdrop.classList.remove('open');
      onDecision(true);
    });

    backdrop.querySelector('#btn-prompt-block').addEventListener('click', () => {
      backdrop.classList.remove('open');
      onDecision(false);
    });
  }

  // --------------------------------------------------------------------------
  // SCR-10: Multi-Tab Settings Dialog
  // --------------------------------------------------------------------------
  showSettingsDialog() {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;

    backdrop.innerHTML = `
      <div class="gw-dialog settings-dialog">
        <div class="dialog-header">
          <div class="dialog-title">
            <span>⚙️</span>
            <span>CachyWire Settings</span>
          </div>
          <button class="dialog-close-btn" id="modal-close-x">✕</button>
        </div>

        <div class="settings-layout">
          <!-- Sidebar Tabs -->
          <div class="settings-tabs-sidebar">
            <button class="settings-tab-btn active" data-tab="general">General</button>
            <button class="settings-tab-btn" data-tab="security">Security Watchdogs</button>
            <button class="settings-tab-btn" data-tab="server">Server & Database</button>
            <button class="settings-tab-btn" data-tab="remote-server">Remote Server</button>
            <button class="settings-tab-btn" data-tab="remote-conns">Remote Connections</button>
            <button class="settings-tab-btn" data-tab="virustotal">VirusTotal</button>
          </div>

          <!-- Tab 1: General -->
          <div class="settings-tab-content active" id="tab-general">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Run on CachyOS Startup</span>
                <span class="setting-desc">Launch CachyWire automatically when logging into your Linux desktop session</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-startup" ${this.settings.runOnStartup ? 'checked' : ''} />
            </div>

            <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
              <div class="setting-info">
                <span class="setting-title">Interface Theme & Skins (Premium Unlocked)</span>
                <span class="setting-desc">Click any theme below to preview and apply immediately</span>
              </div>
              <div class="gw-pill-group" id="set-theme-group" data-value="${this.settings.theme || 'dark'}" style="display:flex;gap:8px;width:100%;flex-wrap:wrap;">
                <button type="button" class="pill-btn ${(!this.settings.theme || this.settings.theme === 'dark') ? 'active' : ''}" data-theme-val="dark">Dark Cyber (Default)</button>
                <button type="button" class="pill-btn ${this.settings.theme === 'light' ? 'active' : ''}" data-theme-val="light">Light Modern</button>
                <button type="button" class="pill-btn ${this.settings.theme === 'midnight' ? 'active' : ''}" data-theme-val="midnight">Midnight Blue</button>
                <button type="button" class="pill-btn ${this.settings.theme === 'cyberpunk' ? 'active' : ''}" data-theme-val="cyberpunk">Cyberpunk Neon</button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Hide Idle Applications</span>
                <span class="setting-desc">Hide applications with zero recent network throughput from tables</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-hide-idle" ${this.settings.hideIdleApps ? 'checked' : ''} />
            </div>
          </div>

          <!-- Tab 2: Security Watchdogs -->
          <div class="settings-tab-content" id="tab-security">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">ARP Spoofing Detection</span>
                <span class="setting-desc">Monitor Linux kernel ARP neighbor table (/proc/net/arp) for gateway MAC spoofing</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-wd-arp" ${this.settings.watchdogs.arpSpoofing ? 'checked' : ''} />
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Hosts File Modification Alert</span>
                <span class="setting-desc">Detect unauthorized DNS overrides or modifications to /etc/hosts</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-wd-hosts" ${this.settings.watchdogs.hostsFileModification ? 'checked' : ''} />
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">DNS Server Change Monitor</span>
                <span class="setting-desc">Notify if /etc/resolv.conf or NetworkManager DNS resolvers are hijacked</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-wd-dns" ${this.settings.watchdogs.dnsChange ? 'checked' : ''} />
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Wi-Fi Evil Twin Warning</span>
                <span class="setting-desc">Monitor Linux wireless interfaces (wlan0 / NetworkManager) for rogue SSIDs</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-wd-evil-twin" ${this.settings.watchdogs.wifiEvilTwin ? 'checked' : ''} />
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Application ELF Binary Hash Integrity (BR-02)</span>
                <span class="setting-desc">Verify SHA-256 of /usr/bin ELF binaries and alert on modification</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-wd-binary" ${this.settings.watchdogs.binaryIntegrityChange ? 'checked' : ''} />
            </div>
          </div>

          <!-- Tab 3: Server & Database -->
          <div class="settings-tab-content" id="tab-server">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">History Retention Period</span>
                <span class="setting-desc">Duration of time-series network activity stored on disk</span>
              </div>
              <div class="gw-pill-group" id="set-retention-group" data-value="${this.settings.server.historyRetentionDays || 30}" style="display:flex;gap:6px;">
                <button type="button" class="pill-btn ${this.settings.server.historyRetentionDays === 7 ? 'active' : ''}" data-ret-val="7">7d</button>
                <button type="button" class="pill-btn ${(!this.settings.server.historyRetentionDays || this.settings.server.historyRetentionDays === 30) ? 'active' : ''}" data-ret-val="30">30d</button>
                <button type="button" class="pill-btn ${this.settings.server.historyRetentionDays === 90 ? 'active' : ''}" data-ret-val="90">90d</button>
                <button type="button" class="pill-btn ${this.settings.server.historyRetentionDays === 365 ? 'active' : ''}" data-ret-val="365">1 Year</button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info" style="flex:1;margin-right:12px;">
                <span class="setting-title">Database Storage Path (CachyOS Linux)</span>
                <input type="text" class="gw-select" id="input-db-path" value="${this.settings.server.dbPath || '~/.local/share/cachywire/cachywire_db.json'}" style="width:100%;margin-top:4px;font-family:var(--gw-font-mono);font-size:11px;" />
              </div>
              <button class="pill-btn" id="btn-change-db-path">Apply Path</button>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Backup & Restore (Scenario 9)</span>
                <span class="setting-desc">Export or restore full CachyWire database snapshot</span>
              </div>
              <div style="display:flex;gap:6px;">
                <button class="pill-btn" id="btn-backup-db">Backup</button>
                <button class="pill-btn" id="btn-restore-db">Restore</button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Clear All Recorded Data & Reset to Zero</span>
                <span class="setting-desc">Wipe all recorded traffic, apps, and hosts to start recording fresh from 0 B</span>
              </div>
              <button class="pill-btn" style="border-color:var(--gw-danger);color:var(--gw-danger);font-weight:700;" id="btn-clear-history">🧹 Clear All Data Now</button>
            </div>
          </div>

          <!-- Tab 4: Remote Server -->
          <div class="settings-tab-content" id="tab-remote-server">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Allow Remote Connections</span>
                <span class="setting-desc">Listen on TCP port 7010 for remote CachyWire clients (FUNC-10)</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-allow-remote" ${this.settings.server.allowRemoteConnections ? 'checked' : ''} />
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Listening Port</span>
                <span class="setting-desc">Default is 7010 (requires TLS encapsulation)</span>
              </div>
              <input type="text" inputmode="numeric" class="gw-select" id="set-remote-port" value="${this.settings.server.listenPort}" style="width:100px;" />
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">IP Subnet Whitelist</span>
                <span class="setting-desc">Authorized IP ranges permitted to connect</span>
              </div>
              <input type="text" class="gw-select" id="set-remote-whitelist" value="${this.settings.server.allowedIpWhitelist}" style="width:200px;" />
            </div>
          </div>

          <!-- Tab 5: Remote Connections -->
          <div class="settings-tab-content" id="tab-remote-conns">
            <div style="font-size:12px;color:var(--gw-text-secondary);margin-bottom:8px;">
              Manage remote Linux servers monitored from this interface:
            </div>
            <div id="remote-servers-list" style="display:flex;flex-direction:column;gap:8px;">
              ${this.settings.remoteConnections.map(c => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--gw-bg-primary);border:1px solid var(--gw-border);border-radius:6px;">
                  <div>
                    <span style="font-weight:700;color:var(--gw-text-primary);">${c.name}</span>
                    <span style="font-size:11px;color:var(--gw-text-secondary);margin-left:8px;">${c.host}:${c.port}</span>
                  </div>
                  <span style="font-size:11px;color:var(--gw-safe);">${c.isCurrent ? '● Active' : 'Connect'}</span>
                </div>
              `).join('')}
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;align-items:center;">
              <input type="text" class="gw-select" id="input-remote-srv-name" placeholder="Server Name (e.g. CachyOS Node 2)" style="flex:1;" />
              <input type="text" class="gw-select" id="input-remote-srv-host" placeholder="IP / Host (e.g. 192.168.0.50)" style="width:160px;" />
              <button class="pill-btn active" id="btn-add-remote-server">+ Add</button>
            </div>
          </div>

          <!-- Tab 6: VirusTotal -->
          <div class="settings-tab-content" id="tab-virustotal">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">VirusTotal API Key</span>
                <span class="setting-desc">Enter free or commercial API key from virustotal.com</span>
              </div>
              <input type="text" class="gw-select" id="set-vt-key" value="${this.settings.virustotal.apiKey}" placeholder="Paste 64-char hex key" style="width:260px;font-family:var(--gw-font-mono);font-size:11px;" />
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Automatic Background Scan</span>
                <span class="setting-desc">Automatically inspect SHA-256 hash of every newly detected Linux binary</span>
              </div>
              <input type="checkbox" class="gw-checkbox" id="set-vt-autoscan" ${this.settings.virustotal.autoScanNewApps ? 'checked' : ''} />
            </div>

            <div style="font-size:11px;color:var(--gw-text-secondary);background:var(--gw-bg-primary);padding:10px;border-radius:6px;margin-top:12px;">
              By using VirusTotal with CachyWire, you agree to VirusTotal Terms of Service. File hashes are submitted to VirusTotal API v3 over TLS.
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="pill-btn" id="btn-settings-cancel">Cancel</button>
          <button class="pill-btn active" id="btn-settings-save">Save Changes</button>
        </div>
      </div>
    `;

    backdrop.classList.add('open');

    // Tab switching
    backdrop.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
        backdrop.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabName = btn.getAttribute('data-tab');
        backdrop.querySelector(`#tab-${tabName}`).classList.add('active');
      });
    });

    // Instant Theme Pill Switching (no native GTK dropdown popup freeze)
    const themeGroup = backdrop.querySelector('#set-theme-group');
    backdrop.querySelectorAll('[data-theme-val]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextTheme = btn.getAttribute('data-theme-val');
        themeGroup?.setAttribute('data-value', nextTheme);
        backdrop.querySelectorAll('[data-theme-val]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.theme = nextTheme;
        if (window.gwApp && window.gwApp.shell) {
          window.gwApp.shell.applyTheme(nextTheme);
        } else {
          document.body.className = `theme-${nextTheme}`;
        }
      });
    });

    // Retention Period Pill Switching
    const retGroup = backdrop.querySelector('#set-retention-group');
    backdrop.querySelectorAll('[data-ret-val]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-ret-val');
        retGroup?.setAttribute('data-value', val);
        backdrop.querySelectorAll('[data-ret-val]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const close = () => {
      backdrop.classList.remove('open');
      if (window.gwApp && window.gwApp.trafficView) {
        window.gwApp.trafficView.renderGraph();
        window.gwApp.trafficView.renderScrubber();
        window.gwApp.trafficView.refreshAppsList();
      }
    };
    backdrop.querySelector('#modal-close-x').addEventListener('click', close);
    backdrop.querySelector('#btn-settings-cancel').addEventListener('click', close);

    // Save Changes (Persists all 6 tabs to localStorage & applies immediately)
    backdrop.querySelector('#btn-settings-save').addEventListener('click', () => {
      const theme = themeGroup?.getAttribute('data-value') || this.settings.theme || 'dark';
      const startup = backdrop.querySelector('#set-startup').checked;
      const hideIdle = backdrop.querySelector('#set-hide-idle').checked;

      // Tab 2: Security Watchdogs
      this.settings.watchdogs.arpSpoofing = !!backdrop.querySelector('#set-wd-arp')?.checked;
      this.settings.watchdogs.hostsFileModification = !!backdrop.querySelector('#set-wd-hosts')?.checked;
      this.settings.watchdogs.dnsChange = !!backdrop.querySelector('#set-wd-dns')?.checked;
      this.settings.watchdogs.wifiEvilTwin = !!backdrop.querySelector('#set-wd-evil-twin')?.checked;
      this.settings.watchdogs.binaryIntegrityChange = !!backdrop.querySelector('#set-wd-binary')?.checked;

      // Tab 3: Server & Database
      const retentionDays = parseInt(retGroup?.getAttribute('data-value') || '30', 10);
      const customPath = backdrop.querySelector('#input-db-path')?.value?.trim();
      this.settings.server.historyRetentionDays = retentionDays;
      if (customPath) {
        this.settings.server.dbPath = customPath;
        this.exportService.db.dbPath = customPath;
      }

      // Tab 4: Remote Server
      this.settings.server.allowRemoteConnections = !!backdrop.querySelector('#set-allow-remote')?.checked;
      this.settings.server.listenPort = parseInt(backdrop.querySelector('#set-remote-port')?.value || '7010', 10);
      this.settings.server.allowedIpWhitelist = backdrop.querySelector('#set-remote-whitelist')?.value?.trim() || '127.0.0.1';

      // Tab 6: VirusTotal
      const vtKey = backdrop.querySelector('#set-vt-key').value;
      const vtAuto = backdrop.querySelector('#set-vt-autoscan').checked;

      this.settings.theme = theme;
      this.settings.runOnStartup = startup;
      this.settings.hideIdleApps = hideIdle;
      this.settings.virustotal.apiKey = vtKey;
      this.settings.virustotal.autoScanNewApps = vtAuto;
      this.virusTotalClient.setApiKey(vtKey);
      this.virusTotalClient.setAutoScan(vtAuto);

      fetch('/api/system/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: startup })
      }).catch(() => {});

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cachywire_cachyos_settings_v3', JSON.stringify(this.settings));
      }

      if (window.gwApp && window.gwApp.shell) {
        window.gwApp.shell.applyTheme(theme);
        window.gwApp.shell.showToast('✓ تم حفظ جميع الإعدادات وتطبيقها بنجاح', 'info');
      } else {
        document.body.className = '';
        if (theme !== 'light') {
          document.body.classList.add(`theme-${theme}`);
        }
      }

      this.onSettingsUpdated(this.settings);
      close();
    });

    // Apply DB Path inline
    backdrop.querySelector('#btn-change-db-path')?.addEventListener('click', () => {
      const nextPath = backdrop.querySelector('#input-db-path')?.value?.trim();
      if (nextPath) {
        this.settings.server.dbPath = nextPath;
        this.exportService.db.dbPath = nextPath;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cachywire_cachyos_settings_v3', JSON.stringify(this.settings));
        }
        if (window.gwApp && window.gwApp.shell) {
          window.gwApp.shell.showToast(`✓ تم تحديث مسار قاعدة البيانات: ${nextPath}`, 'info');
        }
      }
    });

    // Add Remote Server inline
    backdrop.querySelector('#btn-add-remote-server')?.addEventListener('click', () => {
      const nameInput = backdrop.querySelector('#input-remote-srv-name');
      const hostInput = backdrop.querySelector('#input-remote-srv-host');
      const name = (nameInput?.value || '').trim() || `CachyOS Node #${this.settings.remoteConnections.length + 1}`;
      const host = (hostInput?.value || '').trim() || '192.168.0.50';

      this.settings.remoteConnections.push({
        id: 'srv_' + Date.now(),
        name,
        host,
        port: 7010,
        isCurrent: false,
        status: 'Connected'
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cachywire_cachyos_settings_v3', JSON.stringify(this.settings));
      }
      this.showSettingsDialog();
      const tabBtn = backdrop.querySelector('.settings-tab-btn[data-tab="remote-conns"]');
      if (tabBtn) tabBtn.click();
    });

    // Clear All Data & History Button (No blocking confirm/alert)
    backdrop.querySelector('#btn-clear-history').addEventListener('click', async () => {
      if (window.gwApp && typeof window.gwApp.clearAllRecordedData === 'function') {
        await window.gwApp.clearAllRecordedData();
      } else {
        this.exportService.db.clearAllData();
      }
      close();
    });

    // Backup DB
    backdrop.querySelector('#btn-backup-db').addEventListener('click', () => {
      const backup = this.exportService.exportBackup();
      const blob = new Blob([backup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CachyWire_DB_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Restore DB
    backdrop.querySelector('#btn-restore-db').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            this.exportService.importBackup(event.target.result);
            if (window.gwApp && window.gwApp.shell) {
              window.gwApp.shell.showToast('✓ تم استعادة نسخة قاعدة البيانات الاحتياطية بنجاح', 'info');
            }
            close();
          } catch (err) {
            if (window.gwApp && window.gwApp.shell) {
              window.gwApp.shell.showToast('⚠️ ملف النسخة الاحتياطية غير صالح', 'critical');
            }
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // --------------------------------------------------------------------------
  // Data Plan Settings Modal
  // --------------------------------------------------------------------------
  showDataPlanModal(dataPlanMonitor, onSaved) {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;

    const cfg = dataPlanMonitor.config;
    const limitGb = Math.round(cfg.limitBytes / (1024 * 1024 * 1024));

    backdrop.innerHTML = `
      <div class="gw-dialog" style="width: 460px;">
        <div class="dialog-header">
          <div class="dialog-title">
            <span>📊</span>
            <span>Data Plan & Bandwidth Overuse</span>
          </div>
          <button class="dialog-close-btn" id="modal-close-x">✕</button>
        </div>

        <div class="dialog-body">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-title">Enable Data Plan Monitoring</span>
              <span class="setting-desc">Audit external data against billing cycle</span>
            </div>
            <input type="checkbox" id="dp-enable" ${cfg.enabled ? 'checked' : ''} />
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-title">Plan Limit (Gigabytes)</span>
              <span class="setting-desc">Monthly quota cap</span>
            </div>
            <div class="gw-stepper">
              <button type="button" class="gw-stepper-btn" id="dp-limit-minus">−</button>
              <input type="text" inputmode="numeric" id="dp-limit-gb" value="${limitGb}" />
              <button type="button" class="gw-stepper-btn" id="dp-limit-plus">+</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-title">Billing Day of Month</span>
              <span class="setting-desc">Day the plan resets (1 - 31)</span>
            </div>
            <div class="gw-stepper">
              <button type="button" class="gw-stepper-btn" id="dp-day-minus">−</button>
              <input type="text" inputmode="numeric" id="dp-bill-day" value="${cfg.billingDayOfMonth}" />
              <button type="button" class="gw-stepper-btn" id="dp-day-plus">+</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-title">Warning Alert Threshold</span>
              <span class="setting-desc">Alert percentage before quota exhaustion</span>
            </div>
            <select class="gw-select" id="dp-warn-pct">
              <option value="50" ${cfg.warnThresholdPercent === 50 ? 'selected' : ''}>50%</option>
              <option value="75" ${cfg.warnThresholdPercent === 75 ? 'selected' : ''}>75%</option>
              <option value="80" ${cfg.warnThresholdPercent === 80 ? 'selected' : ''}>80% (Default)</option>
              <option value="90" ${cfg.warnThresholdPercent === 90 ? 'selected' : ''}>90%</option>
            </select>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="pill-btn" id="modal-close-btn">Cancel</button>
          <button class="pill-btn active" id="btn-save-plan">Save Plan</button>
        </div>
      </div>
    `;

    backdrop.classList.add('open');

    const close = () => {
      backdrop.classList.remove('open');
      if (window.gwApp && window.gwApp.trafficView) {
        window.gwApp.trafficView.renderGraph();
        window.gwApp.trafficView.renderScrubber();
        window.gwApp.trafficView.refreshAppsList();
      }
    };
    backdrop.querySelector('#modal-close-x').addEventListener('click', close);
    backdrop.querySelector('#modal-close-btn').addEventListener('click', close);

    const limitInput = backdrop.querySelector('#dp-limit-gb');
    const dayInput = backdrop.querySelector('#dp-bill-day');

    backdrop.querySelector('#dp-limit-minus')?.addEventListener('click', () => {
      const curr = parseInt(limitInput.value, 10) || 100;
      limitInput.value = Math.max(1, curr - 10);
    });
    backdrop.querySelector('#dp-limit-plus')?.addEventListener('click', () => {
      const curr = parseInt(limitInput.value, 10) || 100;
      limitInput.value = Math.min(10000, curr + 10);
    });
    backdrop.querySelector('#dp-day-minus')?.addEventListener('click', () => {
      const curr = parseInt(dayInput.value, 10) || 1;
      dayInput.value = Math.max(1, curr - 1);
    });
    backdrop.querySelector('#dp-day-plus')?.addEventListener('click', () => {
      const curr = parseInt(dayInput.value, 10) || 1;
      dayInput.value = Math.min(31, curr + 1);
    });

    backdrop.querySelector('#btn-save-plan').addEventListener('click', () => {
      const enabled = backdrop.querySelector('#dp-enable').checked;
      const limitGbVal = parseFloat(backdrop.querySelector('#dp-limit-gb').value) || 100;
      const billingDay = parseInt(backdrop.querySelector('#dp-bill-day').value, 10) || 1;
      const warnPct = parseInt(backdrop.querySelector('#dp-warn-pct').value, 10) || 80;

      dataPlanMonitor.updateConfig({
        enabled,
        limitBytes: limitGbVal * 1024 * 1024 * 1024,
        billingDayOfMonth: billingDay,
        warnThresholdPercent: warnPct
      });

      onSaved();
      close();
    });
  }
}
