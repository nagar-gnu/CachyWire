/**
 * CachyWire 0.1.0-alpha - Firewall Policy Controller
 * Implements:
 * - BR-01: Applications keyed by normalized lowercase full path
 * - BR-05: Critical system exemptions in BLOCK_ALL (DHCP UDP 67/68, Loopback 127.0.0.1)
 * - Modes: CLICK_TO_BLOCK, ASK_TO_CONNECT, BLOCK_ALL
 * - Profiles: Default, Public Wi-Fi, Work
 *
 * AUDIT FIXES (Batch #2):
 *  - FUNC-03: setProfile() now pushes changed rules to the kernel via the daemon,
 *    instead of only updating the UI state.
 *  - FUNC-07: enforcement failures are reported through onEnforceError
 *    (wired to a critical toast in app.js — Batch #3) instead of being swallowed.
 */
import { FIREWALL_MODES } from '../config/default-settings.js';
import { isLocalLanAddress } from './traffic-classifier.js';

export class FirewallPolicyController {
  constructor(appsRepo, alertsRepo, options = {}) {
    this.appsRepo = appsRepo;
    this.alertsRepo = alertsRepo;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.mode = options.mode || FIREWALL_MODES.CLICK_TO_BLOCK;
    this.activeProfile = options.profile || 'default';
    this.onEnforceError = options.onEnforceError || null;
    // Pending connection requests for ASK_TO_CONNECT mode
    this.pendingConnections = new Map(); // key: exe_path -> { app, resolve, reject, timestamp }
    // Multi-profile state storage: profileId -> Set of blocked exe_paths
    this.profileRules = {
      default: new Set(),
        public_wifi: new Set(),
          work: new Set()
    };
  }

  /** Central enforce call with failure reporting (AUDIT FUNC-07) */
  _enforce(payload) {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    fetch('/api/firewall/enforce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {
      if (this.onEnforceError) this.onEnforceError();
    });
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) {
      this._enforce({ unblockAll: true });
    } else {
      for (const app of this.appsRepo.getAll()) {
        if (app.firewall_state === 1) {
          this._enforce({ exePath: app.exe_path, blocked: true });
        }
      }
    }
  }

  isEnabled() {
    return this.enabled;
  }

  setMode(mode) {
    if (Object.values(FIREWALL_MODES).includes(mode)) {
      this.mode = mode;
      return true;
    }
    return false;
  }

  getMode() {
    return this.mode;
  }

  setProfile(profileId) {
    if (this.profileRules[profileId]) {
      this.activeProfile = profileId;
      // Sync applications firewall_state to match current profile
      const blockedSet = this.profileRules[profileId];
      const apps = this.appsRepo.getAll();
      for (const app of apps) {
        const isBlocked = blockedSet.has(app.exe_path);
        const changed = (app.firewall_state === 1) !== isBlocked;
        this.appsRepo.setFirewallState(app.app_id, isBlocked ? 1 : 0);
        // AUDIT FUNC-03: profile switch must reach the kernel, not just the UI
        if (changed) {
          this._enforce({ exePath: app.exe_path, blocked: isBlocked && this.enabled });
        }
      }
      return true;
    }
    return false;
  }

  getProfile() {
    return this.activeProfile;
  }

  initFromRepo() {
    const blockedSet = this.profileRules[this.activeProfile];
    for (const app of this.appsRepo.getAll()) {
      if (app.firewall_state === 1) {
        blockedSet.add(app.exe_path);
        if (this.enabled) {
          this._enforce({ exePath: app.exe_path, blocked: true });
        }
      }
    }
  }

  isApplicationBlocked(exePath, portNumber = 0, ipProtocol = 6, destinationIp = '') {
    // If master firewall is turned off, all apps are allowed
    if (!this.enabled) return false;
    // BR-05: Exemption for critical system networking in BLOCK_ALL
    if (this.mode === FIREWALL_MODES.BLOCK_ALL) {
      // Local / loopback / link-local traffic is never blocked
      if (destinationIp && isLocalLanAddress(String(destinationIp))) return false;
      // DHCP (UDP 67/68) is exempt
      if (ipProtocol === 17 && (portNumber === 67 || portNumber === 68)) return false;
      // All other traffic is blocked in BLOCK_ALL
      return true;
    }
    // Check specific application rule by normalized lowercase path (BR-01)
    const normalizedPath = exePath ? String(exePath).trim().toLowerCase() : '';
    const app = this.appsRepo.getByPath(normalizedPath);
    if (!app) return false;
    return app.firewall_state === 1; // 1 = Blocked
  }

  toggleBlock(appId) {
    const app = this.appsRepo.getById(appId);
    if (!app) return null;
    const newState = app.firewall_state === 1 ? 0 : 1;
    this.appsRepo.setFirewallState(appId, newState);
    // Save to current profile set
    const blockedSet = this.profileRules[this.activeProfile];
    if (newState === 1) {
      blockedSet.add(app.exe_path);
    } else {
      blockedSet.delete(app.exe_path);
    }
    // Enforce live OS network & process block in Rust backend
    this._enforce({ exePath: app.exe_path, blocked: newState === 1 && this.enabled });
    return newState;
  }

  /**
   * Handle incoming connection attempt from an application.
   * If in ASK_TO_CONNECT mode and app is unknown/unapproved, holds the request and triggers a prompt.
   */
  async evaluateConnection(appInfo, connectionInfo) {
    if (!this.enabled) return { allowed: true };
    if (!appInfo || typeof appInfo !== 'object') {
      return { allowed: false, reason: 'INVALID_APPLICATION_INFO' };
    }
    const exePath = typeof appInfo.exe_path === 'string' ? appInfo.exe_path.trim() : '';
    if (!exePath) {
      return { allowed: false, reason: 'INVALID_EXE_PATH' };
    }
    const normalizedPath = exePath.toLowerCase();
    let app = this.appsRepo.getByPath(normalizedPath);
    // If application is newly seen
    const isFirstTime = !app;
    if (!app) {
      app = this.appsRepo.register({ ...appInfo, exe_path: exePath });
      this.alertsRepo.create({
        alert_type: 'FIRST_NETWORK_ACTIVITY',
        severity: 1, // Info
        app_id: app.app_id,
        title: `First network activity for ${app.app_name}`,
        details_json: { path: app.exe_path, destination: connectionInfo && connectionInfo.destination_ip }
      });
    }
    // BLOCK_ALL check with BR-05 exemptions
    if (this.mode === FIREWALL_MODES.BLOCK_ALL) {
      const isExempt = (connectionInfo.ip_protocol === 17 && (connectionInfo.port === 67 || connectionInfo.port === 68)) ||
      (connectionInfo.destination_ip && connectionInfo.destination_ip.startsWith('127.'));
      if (!isExempt) {
        return { allowed: false, reason: 'BLOCK_ALL_LOCKDOWN' };
      }
      return { allowed: true };
    }
    // If app already blocked in database
    if (app.firewall_state === 1) {
      return { allowed: false, reason: 'EXPLICITLY_BLOCKED' };
    }
    // ASK_TO_CONNECT Mode
    if (this.mode === FIREWALL_MODES.ASK_TO_CONNECT && isFirstTime) {
      // Mark as pending ask
      this.appsRepo.setFirewallState(app.app_id, 2);
      return new Promise((resolve) => {
        this.pendingConnections.set(normalizedPath, {
          app,
          connectionInfo,
          resolve,
          timestamp: Date.now()
        });
      });
    }
    return { allowed: true };
  }

  resolvePendingConnection(exePath, allow) {
    const normalizedPath = exePath.trim().toLowerCase();
    const pending = this.pendingConnections.get(normalizedPath);
    if (!pending) return false;
    const newState = allow ? 0 : 1;
    this.appsRepo.setFirewallState(pending.app.app_id, newState);
    const blockedSet = this.profileRules[this.activeProfile];
    if (newState === 1) {
      blockedSet.add(normalizedPath);
    } else {
      blockedSet.delete(normalizedPath);
    }
    this.pendingConnections.delete(normalizedPath);
    pending.resolve({ allowed: allow, userDecision: true });
    return true;
  }

  getPendingConnections() {
    return Array.from(this.pendingConnections.values());
  }
}
