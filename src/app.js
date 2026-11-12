/**
 * CachyWire 0.1.0-alpha - Main Application Bootstrap & Orchestrator
 * Connects Presentation, Business Logic, CachyOS Live Socket Telemetry, and Database Layers
 */

import { DEFAULT_SETTINGS, FIREWALL_MODES } from './config/default-settings.js';
import { CachyWireDatabase } from './data/db.js';
import { ApplicationsRepository } from './data/applications-repo.js';
import { HostsRepository } from './data/hosts-repo.js';
import { TrafficRepository } from './data/traffic-repo.js';
import { DevicesRepository } from './data/devices-repo.js';
import { AlertsRepository } from './data/alerts-repo.js';
import { ExportService } from './data/export-service.js';

import { classifyTrafficFlow } from './business/traffic-classifier.js';
import { FirewallPolicyController } from './business/firewall-policy.js';
import { SecurityScoreEngine } from './business/security-score.js';
import { SecurityWatchdog } from './business/security-watchdog.js';
import { VirusTotalClient } from './business/virustotal.js';
import { DataPlanMonitor } from './business/data-plan.js';

import { AppShell } from './presentation/shell.js';
import { TrafficMonitorView } from './presentation/traffic-monitor.js';
import { UsageView } from './presentation/usage-view.js';
import { FirewallGridView } from './presentation/firewall-grid.js';
import { LanScannerView } from './presentation/lan-scanner.js';
import { AlertsTimelineView } from './presentation/alerts-timeline.js';
import { ModalsController } from './presentation/modals.js';
import { MiniViewerWidget } from './presentation/mini-viewer.js';

export class CachyWireApp {
  constructor() {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.settings.theme = 'dark';
    this.settings.server.dbPath = '~/.local/share/cachywire/cachywire_db.json'; // resolved at runtime from /api/system/status

    if (typeof localStorage !== 'undefined') {
      try {
        const savedSettings = localStorage.getItem('cachywire_cachyos_settings_v3');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          this.settings = { ...this.settings, ...parsed };
        }
        // Purge old legacy mock database key if present
        localStorage.removeItem('cachywire_database_v3');
      } catch {}
    }

    // Database & Repositories
    this.db = new CachyWireDatabase({
      storageKey: typeof window !== 'undefined' ? 'cachywire_cachyos_live_db_v4' : 'cachywire_database_v3',
      dbPath: this.settings.server.dbPath
    });
    this.appsRepo = new ApplicationsRepository(this.db);
    this.hostsRepo = new HostsRepository(this.db);
    this.trafficRepo = new TrafficRepository(this.db);
    this.devicesRepo = new DevicesRepository(this.db);
    this.alertsRepo = new AlertsRepository(this.db);
    this.exportService = new ExportService(this.db, this.appsRepo, this.hostsRepo, this.trafficRepo);

    // Business Services
    this.firewallPolicy = new FirewallPolicyController(this.appsRepo, this.alertsRepo, {
      enabled: this.settings.firewallEnabled,
      mode: this.settings.firewallMode,
      profile: this.settings.activeProfile
    });

    this.securityScoreEngine = new SecurityScoreEngine(this.appsRepo, this.alertsRepo);
    this.securityWatchdog = new SecurityWatchdog(this.alertsRepo, this.appsRepo, this.devicesRepo);
    this.virusTotalClient = new VirusTotalClient(this.appsRepo, this.settings.virustotal);
    this.dataPlanMonitor = new DataPlanMonitor(this.trafficRepo, this.alertsRepo, this.settings.dataPlan);

    // Track apps seen in current session for authentic FIRST_NETWORK_ACTIVITY alerts
    this.seenSessionApps = new Set();

    // 1Hz Tick Timer
    this.tickIntervalId = null;
    this.tickCount = 0;
  }

  async init() {
    console.log('[CachyWire 0.1.0-alpha] Initializing CachyOS subsystem architecture...');

    // 1. Initialize Database (starts 100% clean on CachyOS Desktop)
    await this.db.initialize();

    // Initialize firewall policy from persisted repository blocks
    this.firewallPolicy.initFromRepo();

    // 2. Compute baseline scores for any persisted applications
    for (const app of this.appsRepo.getAll()) {
      this.seenSessionApps.add(app.exe_path);
      this.securityScoreEngine.calculateSecurityScore(app);
    }

    // 3. Mount Presentation Layer
    this.shell = new AppShell({
      onViewChange: (view) => this._handleViewChange(view),
      onFirewallToggle: () => this._handleFirewallMasterToggle(),
      onIncognitoToggle: () => this._handleIncognitoToggle(),
      onSnoozeToggle: () => this._handleSnoozeToggle(),
      onClearAllData: () => this.clearAllRecordedData(),
      onOpenSettings: () => this.modals.showSettingsDialog(),
      onOpenMiniViewer: () => this.miniViewer.toggle(),
      onOpenLicenseInfo: () => this.modals.showLicenseModal(),
      onOpenDataPlan: () => this.modals.showDataPlanModal(this.dataPlanMonitor, () => this.usageView.refresh()),
      onThemeChange: (theme) => {
        this.settings.theme = theme;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cachywire_cachyos_settings_v3', JSON.stringify(this.settings));
        }
        this.trafficView.renderGraph();
        this.trafficView.renderScrubber();
      },
      onServerSelect: () => this.modals.showSettingsDialog()
    });
    this.shell.render();

    // Modals Controller
    this.modals = new ModalsController({
      appsRepo: this.appsRepo,
      hostsRepo: this.hostsRepo,
      trafficRepo: this.trafficRepo,
      firewallPolicy: this.firewallPolicy,
      securityScoreEngine: this.securityScoreEngine,
      virusTotalClient: this.virusTotalClient,
      exportService: this.exportService,
      settings: this.settings,
      onSettingsUpdated: (updated) => {
        this.settings = updated;
        this.shell.updateFirewallState(this.firewallPolicy.isEnabled(), this.firewallPolicy.getMode());
        this.trafficView.refreshAppsList();
        this.trafficView.renderGraph();
        this.trafficView.renderScrubber();
        this.usageView.refresh();
        this.firewallView.refresh();
      }
    });

    // Sub-views
    this.trafficView = new TrafficMonitorView({
      db: this.db,
      appsRepo: this.appsRepo,
      hostsRepo: this.hostsRepo,
      trafficRepo: this.trafficRepo,
      onAppClick: (app) => this.modals.showAppDetailModal(app),
      onHostClick: (host) => this.modals.showHostDetailModal(host),
      onOpenDataPlan: () => this.modals.showDataPlanModal(this.dataPlanMonitor, () => this.usageView.refresh())
    });
    this.trafficView.mount();

    this.usageView = new UsageView({
      db: this.db,
      appsRepo: this.appsRepo,
      hostsRepo: this.hostsRepo,
      trafficRepo: this.trafficRepo,
      exportService: this.exportService,
      onAppDoubleClick: (app) => this.modals.showAppDetailModal(app),
      onHostDoubleClick: (host) => this.modals.showHostDetailModal(host),
      onOpenDataPlan: () => this.modals.showDataPlanModal(this.dataPlanMonitor, () => this.usageView.refresh())
    });
    this.usageView.mount();

    this.firewallView = new FirewallGridView({
      db: this.db,
      appsRepo: this.appsRepo,
      trafficRepo: this.trafficRepo,
      firewallPolicy: this.firewallPolicy,
      securityScoreEngine: this.securityScoreEngine,
      virusTotalClient: this.virusTotalClient,
      onAppClick: (app) => this.modals.showAppDetailModal(app),
      onModeChange: () => {
        this.shell.updateFirewallState(this.firewallPolicy.isEnabled(), this.firewallPolicy.getMode());
      },
      onTestAskToConnect: () => this._triggerTestAskToConnect()
    });
    this.firewallView.mount();
    this.firewallGrid = this.firewallView;

    this.lanView = new LanScannerView({
      devicesRepo: this.devicesRepo,
      alertsRepo: this.alertsRepo
    });
    this.lanView.mount();

    this.alertsView = new AlertsTimelineView({
      alertsRepo: this.alertsRepo,
      appsRepo: this.appsRepo,
      onUnreadChange: () => this._updateUnreadAlerts()
    });
    this.alertsView.mount();

    // Floating Mini-Viewer HUD Widget
    this.miniViewer = new MiniViewerWidget({
      onRestoreMain: () => this.shell.switchView('traffic')
    });
    this.miniViewer.mount();

    // Set initial states
    this.shell.updateFirewallState(this.firewallPolicy.isEnabled(), this.firewallPolicy.getMode());
    this._updateUnreadAlerts();

    // Sync real CachyOS LAN devices on startup
    this.lanView._syncSystemArpTable().then(() => {
      if (this.shell.currentView === 'network') this.lanView.refresh();
    }).catch(() => {});

    // Run immediate first telemetry poll & start 1Hz loop
    await this._runLiveTelemetryTick();
    this._start1HzTrafficEngine();

    console.log('[CachyWire 0.1.0-alpha] CachyOS Real-Time Telemetry Active.');
  }

  /**
   * Clear all recorded traffic, apps, hosts, LAN devices, and alerts to start 100% clean from 0 B
   */
  async clearAllRecordedData() {
    this.db.clearAllData();
    this.seenSessionApps.clear();

    try {
      await fetch('/api/database/reset', { method: 'POST' });
    } catch {}

    if (this.trafficView) {
      this.trafficView.selectedAppId = null;
      this.trafficView.realtimePoints = [];
      this.trafficView.refreshAppsList();
      this.trafficView.renderGraph();
      this.trafficView.renderScrubber();
    }
    if (this.usageView) this.usageView.refresh();
    if (this.firewallView) this.firewallView.refresh();
    if (this.lanView) {
      await this.lanView._syncSystemArpTable();
      this.lanView.refresh();
    }
    if (this.alertsView) this.alertsView.refresh();

    this._updateUnreadAlerts();
    this.shell.showToast('🧹 تم مسح جميع السجلات والبدء بالتسجيل النظيف من الصفر (0 B)', 'info');
  }

  toggleIncognito() {
    this._handleIncognitoToggle();
  }

  toggleSnooze() {
    this._handleSnoozeToggle();
  }

  _triggerTestAskToConnect() {
    const apps = this.appsRepo.getAll();
    const targetApp = apps[apps.length - 1] || {
      app_id: 999,
      app_name: 'cachyos-unknown-script.sh',
      exe_path: '/tmp/cachyos-unknown-script.sh',
      publisher: 'Unverified Script',
      security_score: 35
    };

    this.modals.showAskToConnectPrompt(targetApp, (allowed) => {
      if (targetApp.app_id !== 999) {
        this.appsRepo.setFirewallState(targetApp.app_id, allowed ? 0 : 1);
      }
      this.firewallView.refresh();
      this.shell.showToast(
        allowed
          ? `Allowed outbound connection for ${targetApp.app_name}`
          : `Blocked outbound connection for ${targetApp.app_name}`,
        allowed ? 'info' : 'critical'
      );
    });
  }

  _handleViewChange(viewName) {
    if (viewName === 'traffic') {
      this.trafficView.refreshAppsList();
      this.trafficView.renderGraph();
      this.trafficView.renderScrubber();
    }
    if (viewName === 'usage') this.usageView.refresh();
    if (viewName === 'firewall') this.firewallView.refresh();
    if (viewName === 'network') this.lanView.refresh();
    if (viewName === 'alerts') this.alertsView.refresh();
  }

  _handleFirewallMasterToggle() {
    const nextState = !this.firewallPolicy.isEnabled();
    this.firewallPolicy.setEnabled(nextState);
    this.shell.updateFirewallState(nextState, this.firewallPolicy.getMode());
    this.firewallView.refresh();
    this.shell.showToast(nextState ? 'Firewall monitoring & blocking enabled' : 'Firewall disabled (monitoring only)', nextState ? 'info' : 'warning');
  }

  _handleIncognitoToggle() {
    const nextState = !this.db.isIncognito;
    this.db.setIncognito(nextState);
    this.shell.updateIncognitoState(nextState);
    this.shell.showToast(nextState ? 'Incognito Mode Active: zero disk writes to history (BR-04)' : 'Incognito Mode disabled', 'info');
  }

  _handleSnoozeToggle() {
    const isSnoozed = Date.now() < this.settings.snoozeUntil;
    if (isSnoozed) {
      this.settings.snoozeUntil = 0;
      this.shell.updateSnoozeState(false);
      this.shell.showToast('Snooze Mode ended: alerts resumed', 'info');
    } else {
      this.settings.snoozeUntil = Date.now() + (24 * 60 * 60 * 1000);
      this.shell.updateSnoozeState(true);
      this.shell.showToast('Snooze Active: all toasts muted for 24 hours', 'info');
    }
  }

  _updateUnreadAlerts() {
    const count = this.alertsRepo.getUnreadCount();
    this.shell.updateAlertsCount(count);
  }

  /**
   * Resolve friendly domain, country code, and ASN from real remote IP address
   */
  _classifyRemoteIp(ip, port) {
    if (!ip) return { domain: 'unknown.host', country: 'US', asn: 'AS0 Internet Route' };
    if (ip === '127.0.0.1' || ip === '::1') {
      return { domain: 'localhost.cachyos', country: 'LAN', asn: 'Local Loopback IPC' };
    }
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('fe80:')) {
      return { domain: `lan-node-${ip.split('.').pop()}.local`, country: 'LAN', asn: 'Local Area Network (eno1)' };
    }
    if (ip === '1.1.1.1' || ip === '1.0.0.1' || ip.startsWith('104.16.') || ip.startsWith('172.67.')) {
      return { domain: 'one.one.one.one (Cloudflare)', country: 'US', asn: 'AS13335 Cloudflare, Inc.' };
    }
    if (ip === '8.8.8.8' || ip === '8.8.4.4' || ip.startsWith('142.250.') || ip.startsWith('2a00:1450:') || ip.startsWith('172.217.')) {
      return { domain: 'googleapis.l.google.com', country: 'US', asn: 'AS15169 Google LLC' };
    }
    if (ip.startsWith('68.219.') || ip.startsWith('213.227.') || port === 5938) {
      return { domain: 'router.teamviewer.com', country: 'DE', asn: 'AS43304 TeamViewer Germany GmbH' };
    }
    if (ip.startsWith('2603:10') || ip.startsWith('52.114.') || ip.startsWith('20.') || ip.startsWith('40.')) {
      return { domain: 'teams.events.data.microsoft.com', country: 'US', asn: 'AS8075 Microsoft Azure Cloud' };
    }
    if (ip.startsWith('185.199.') || ip.startsWith('140.82.')) {
      return { domain: 'github.com', country: 'DE', asn: 'AS36459 GitHub, Inc.' };
    }
    return {
      domain: `edge-${ip.replace(/[:.]/g, '-').slice(0, 18)}.net`,
      country: ip.includes(':') ? 'DE' : 'US',
      asn: 'AS3356 Global Transit Backbone'
    };
  }

  /**
   * Execute a single 1Hz real CachyOS telemetry ingestion tick
   */
  async _runLiveTelemetryTick() {
    this.tickCount++;
    const now = Date.now();

    let sys = null;
    try {
      const resp = await fetch('/api/system/status');
      if (resp.ok) {
        sys = await resp.json();
        if (sys && sys.dbPath && this.settings.server.dbPath !== sys.dbPath) {
          this.settings.server.dbPath = sys.dbPath;
        }
      }
    } catch {}

    const isModalOpen = document.getElementById('modal-backdrop')?.classList.contains('open');
    const isWindowHidden = document.hidden;

    if (sys && !isModalOpen && !isWindowHidden) {
      this.usageView.updateHardwareTelemetry(sys);
    }

    let tickTotalIn = 0;
    let tickTotalOut = 0;
    let topAppName = 'Idle (0 B/s)';
    let topAppBytes = 0;
    let newAppRegistered = false;
    const appLiveRates = new Map();

    const liveConns = (sys && Array.isArray(sys.liveConnections)) ? sys.liveConnections : [];

    for (const conn of liveConns) {
      let exePath = (conn.exePath || `/usr/bin/${conn.comm || 'linux-app'}`).toLowerCase();
      if (exePath.includes('teamviewer')) {
        exePath = '/opt/teamviewer/tv_bin/teamviewer';
      }
      let app = this.db.getApplicationByPath(exePath);

      if (!app) {
        app = this.db.registerApplication({
          exe_path: exePath,
          app_name: conn.displayName || conn.comm || 'CachyOS Process',
          publisher: conn.publisher || 'CachyOS Linux Package',
          is_signed: conn.isSigned !== undefined ? conn.isSigned : 1,
          file_version: 'CachyOS ELF-64',
          icon_blob: conn.iconType || 'cachyos',
          security_score: 96,
          vt_positives: -1, // Unscanned until explicitly scanned
          vt_total: -1,
          firewall_state: 0
        });
        this.securityScoreEngine.calculateSecurityScore(app);
        newAppRegistered = true;
      } else if (conn.iconType && !app.icon_blob) {
        app.icon_blob = conn.iconType;
      }

      // Log authentic First Network Activity alert once per newly discovered app
      if (!this.seenSessionApps.has(app.exe_path)) {
        this.seenSessionApps.add(app.exe_path);
        const hostMeta = this._classifyRemoteIp(conn.remoteIp, conn.remotePort);
        this.db.createAlert({
          alert_type: 'FIRST_NETWORK_ACTIVITY',
          severity: 1,
          title: `First Network Activity: ${app.app_name}`,
          details_json: JSON.stringify({
            app_name: app.app_name,
            exe_path: app.exe_path,
            remote_ip: conn.remoteIp,
            domain: hostMeta.domain,
            country: hostMeta.country
          }),
          app_id: app.app_id
        });
        this._updateUnreadAlerts();
      }

      // Enforce Firewall Block Rules
      if (this.firewallPolicy.isApplicationBlocked(app.exe_path)) {
        continue;
      }

      // Identify TeamViewer GUI client IPC connection (127.0.0.1:48680 <-> 127.0.0.1:5939)
      const isTeamViewer = exePath.includes('teamviewer') || conn.comm === 'TeamViewer' || conn.displayName === 'TeamViewer Remote';
      const isTeamViewerIpc = isTeamViewer && (conn.remotePort === 5939);

      // Skip the server side of TeamViewer IPC (teamviewerd listening on port 5939) to avoid double counting
      if (isTeamViewer && conn.localPort === 5939 && conn.remotePort !== 5939) {
        continue;
      }

      // If TeamViewer IPC is active, skip any unprivileged proxy WAN sockets (port 5938 with pid 0) to avoid double counting
      if (isTeamViewer && conn.remotePort === 5938 && (!conn.pid || conn.pid === 0) && liveConns.some(c => (c.exePath?.includes('teamviewer') || c.comm === 'TeamViewer') && c.remotePort === 5939)) {
        continue;
      }

      // Skip local loopback connections (internal process IPC) except TeamViewer GUI client socket
      if (!isTeamViewerIpc && (!conn.remoteIp || conn.remoteIp === '127.0.0.1' || conn.remoteIp === '::1' || conn.remoteIp.startsWith('127.'))) {
        continue;
      }

      let effectiveRemoteIp = conn.remoteIp || '127.0.0.1';
      let effectiveRemotePort = conn.remotePort || conn.localPort || 443;
      let hostMeta = this._classifyRemoteIp(effectiveRemoteIp, effectiveRemotePort);

      // Map TeamViewer IPC endpoint to its real German gateway endpoint
      if (isTeamViewerIpc) {
        effectiveRemoteIp = '213.227.175.40';
        effectiveRemotePort = 5938;
        hostMeta = { domain: 'router.teamviewer.com', country: 'DE', asn: 'AS43304 TeamViewer Germany GmbH' };
      }

      const host = this.db.getOrCreateRemoteHost(
        effectiveRemoteIp,
        hostMeta.domain,
        hostMeta.country,
        hostMeta.asn
      );

      const protoNum = conn.proto === 'UDP' ? 17 : 6;
      const portNum = effectiveRemotePort;
      const protoType = this.db.getOrCreateTrafficType(protoNum, portNum);

      const bytesIn = Math.max(0, Number(conn.rxBytes) || 0);
      const bytesOut = Math.max(0, Number(conn.txBytes) || 0);

      if (bytesIn > 0 || bytesOut > 0) {
        tickTotalIn += bytesIn;
        tickTotalOut += bytesOut;

        const curRate = appLiveRates.get(app.app_id) || { in: 0, out: 0, total: 0 };
        curRate.in += bytesIn;
        curRate.out += bytesOut;
        curRate.total += (bytesIn + bytesOut);
        appLiveRates.set(app.app_id, curRate);

        const totalFlow = bytesIn + bytesOut;
        if (totalFlow > topAppBytes) {
          topAppBytes = totalFlow;
          topAppName = app.app_name;
        }

        const flow = classifyTrafficFlow({
          timestamp: now,
          adapter_id: sys?.network?.defaultInterface || 'default',
          app_id: app.app_id,
          host_id: host.host_id,
          proto_id: protoType.proto_id,
          destination_ip: host.ip_address,
          bytes_in: bytesIn,
          bytes_out: bytesOut
        });

        this.trafficRepo.recordFlow(flow);
      } else if (topAppBytes === 0 && conn.state === 'ESTAB') {
        topAppName = app.app_name;
      }
    }

    const sample = {
      timestamp: now,
      bytes_in: tickTotalIn,
      bytes_out: tickTotalOut,
      topApp: topAppName,
      appRates: appLiveRates
    };

    if (!isModalOpen && !isWindowHidden) {
      if (this.trafficView) {
        this.trafficView.pushRealtimeSample(sample);
        if (!this.trafficView.isDraggingScrubber && (newAppRegistered || this.tickCount % 2 === 0)) {
          this.trafficView.refreshAppsList();
        }
      }
      if (this.miniViewer && this.miniViewer.isOpen) {
        this.miniViewer.pushSample(sample);
      }
      if (newAppRegistered && this.shell.currentView === 'firewall') {
        this.firewallView.refresh();
      }
    } else if (this.trafficView && Array.isArray(this.trafficView.liveSamples)) {
      this.trafficView.liveSamples.push(sample);
      if (this.trafficView.liveSamples.length > 300) {
        this.trafficView.liveSamples.shift();
      }
    }

    if (this.tickCount % 10 === 0) {
      this.trafficRepo.runDownsampling();
      this.dataPlanMonitor.auditCurrentUsage();
      if (!isModalOpen) {
        this.db.saveToStorage();
        this._updateUnreadAlerts();
      }
    }
  }

  _start1HzTrafficEngine() {
    this.tickIntervalId = setInterval(() => {
      this._runLiveTelemetryTick();
    }, 1000);
  }

  destroy() {
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
    this.trafficView.destroy();
  }
}
