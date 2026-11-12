/**
 * CachyWire 0.1.0-alpha - Shell & Navigation Controller (SCR-01)
 * AUDIT FIXES: Snooze pill added to header (SCR-01), showToast now respects
 * Snooze mode + caps concurrent toasts at 3, keyboard shortcuts ignore inputs.
 */
export function postNativeDesktopMessage(action, payload = {}) {
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cachywire) {
      window.webkit.messageHandlers.cachywire.postMessage(typeof action === 'string' ? action : JSON.stringify({ action, ...payload }));
      return true;
    }
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage(action);
      return true;
    }
  } catch {}
  return false;
}

export class AppShell {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('app-shell');
    this.currentView = 'traffic';
    this.onViewChange = options.onViewChange || (() => {});
    this.onFirewallToggle = options.onFirewallToggle || (() => {});
    this.onIncognitoToggle = options.onIncognitoToggle || (() => {});
    this.onSnoozeToggle = options.onSnoozeToggle || (() => {});
    this.onClearAllData = options.onClearAllData || (() => {});
    this.onOpenSettings = options.onOpenSettings || (() => {});
    this.onOpenMiniViewer = options.onOpenMiniViewer || (() => {});
    this.onOpenLicenseInfo = options.onOpenLicenseInfo || (() => {});
    this.onOpenDataPlan = options.onOpenDataPlan || (() => {});
    this.onThemeChange = options.onThemeChange || (() => {});
    this.onServerSelect = options.onServerSelect || (() => {});
    const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('gw_cachyos_theme')) || 'dark';
    this.state = {
      theme: savedTheme,
      firewallEnabled: true,
      firewallMode: 'CLICK_TO_BLOCK',
      isIncognito: false,
      isSnoozed: false,
      unreadAlerts: 0,
      activeServer: 'Local CachyOS PC'
    };
  }

  render() {
    this.applyTheme(this.state.theme);
    this.container.innerHTML = `
    <header id="top-bar">
    <div class="header-left" style="position: relative;">
    <div class="gw-brand-combo" id="btn-gw-menu" title="CachyWire Open-Source Network Monitor & Firewall — Menu & Settings">
    <div class="gw-title-row">
    <div class="gw-logo-orb">
    <svg width="20" height="20" viewBox="0 0 32 32">
    <defs>
    <linearGradient id="gwLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#00D4B2"/>
    <stop offset="100%" stop-color="#FF9F43"/>
    </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="14" fill="rgba(0,212,178,0.14)" stroke="url(#gwLogoGrad)" stroke-width="2.5"/>
    <path d="M5 16 L11 16 L14 9 L18 23 L21 15 L27 15" fill="none" stroke="url(#gwLogoGrad)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    </div>
    <span class="gw-logo-text">CachyWire</span>
    <span class="gw-chevron">▾</span>
    </div>
    <div class="gw-sub-badge" style="color: #00D4B2;">★ RUST NATIVE</div>
    </div>
    <!-- Main Dropdown Menu -->
    <div class="gw-dropdown-menu" id="gw-brand-dropdown" style="display: none;">
    <div class="gw-menu-item" id="menu-clear-all-data" style="color: #FF5252; font-weight: 600;">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    <span>Clear All Recorded Data (Reset to 0 B)</span>
    </div>
    <div class="gw-menu-divider"></div>
    <div class="gw-menu-item" id="menu-open-settings">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33l-.06-.06a2 2 0 0 1-2.83 0l.06.06a2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    <span>Settings & Preferences...</span>
    </div>
    <div class="gw-menu-item" id="menu-open-dataplan">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
    <span>Data Plan & Bandwidth Quota...</span>
    </div>
    <div class="gw-menu-divider"></div>
    <div class="gw-menu-item" id="menu-toggle-incognito">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    <span id="menu-incognito-label">Incognito Mode: OFF</span>
    </div>
    <div class="gw-menu-item" id="menu-toggle-snooze">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    <span id="menu-snooze-label">Snooze Alerts (24h): OFF</span>
    </div>
    <div class="gw-menu-divider"></div>
    <div class="gw-menu-section-label">UI Theme / Appearance</div>
    <div class="gw-menu-item" data-theme="dark">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00D4B2" stroke-width="2.2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    <span>CachyWire Dark (Default)</span>
    </div>
    <div class="gw-menu-item" data-theme="light">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF9F43" stroke-width="2.2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/></svg>
    <span>Crystal Light Studio</span>
    </div>
    <div class="gw-menu-item" data-theme="midnight">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2.2"><circle cx="12" cy="12" r="9"/></svg>
    <span>Midnight Deep Ocean</span>
    </div>
    <div class="gw-menu-item" data-theme="cyberpunk">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    <span>Cyberpunk Neon</span>
    </div>
    <div class="gw-menu-divider"></div>
    <div class="gw-menu-item" id="menu-open-license">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00D4B2" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    <span>Open-Source Info & Rust Engine Status</span>
    </div>
    </div>
    </div>
    <div class="header-center-tabs">
    <div class="header-nav-tab active" data-view="traffic" id="tab-traffic" title="Real-Time Traffic Monitor (Alt+1)">
    <svg class="tab-icon" viewBox="0 0 24 24">
    <path d="M2 16 L7 10 L11 15 L16 6 L20 13 L22 11" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 20 L22 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-opacity="0.4" stroke-linecap="round"/>
    </svg>
    <span>Traffic Monitor</span>
    </div>
    <div class="header-nav-tab" data-view="firewall" id="tab-firewall" title="Personal Firewall & Click-to-Block (Alt+2)">
    <svg class="tab-icon" viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="currentColor" stroke-width="2.1"/>
    <polyline points="9 12 11 14 15 10" fill="none" stroke="#00D4B2" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>Firewall</span>
    </div>
    <div class="header-nav-tab" data-view="usage" id="tab-usage" title="Usage Analytics & Hardware Telemetry (Alt+3)">
    <svg class="tab-icon" viewBox="0 0 24 24">
    <rect x="3" y="12" width="4" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
    <rect x="10" y="7" width="4" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
    <rect x="17" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
    </svg>
    <span>Usage</span>
    </div>
    <div class="header-nav-tab" data-view="network" id="tab-network" title="LAN Network Devices Scanner (Alt+4)">
    <svg class="tab-icon" viewBox="0 0 24 24">
    <circle cx="12" cy="5" r="2.8" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="5" cy="18" r="2.8" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="19" cy="18" r="2.8" fill="none" stroke="currentColor" stroke-width="2"/>
    <line x1="10.5" y1="7.5" x2="6.5" y2="15.5" stroke="currentColor" stroke-width="1.8"/>
    <line x1="13.5" y1="7.5" x2="17.5" y2="15.5" stroke="currentColor" stroke-width="1.8"/>
    <line x1="7.8" y1="18" x2="16.2" y2="18" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>
    </svg>
    <span>Thing Monitor</span>
    </div>
    <div class="header-nav-tab" data-view="alerts" id="tab-alerts" title="Security Alerts & Log Timeline (Alt+5)">
    <div style="position:relative;display:inline-flex;align-items:center;">
    <svg class="tab-icon" viewBox="0 0 24 24">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span class="tab-badge" id="badge-alerts-count" style="display:none;">0</span>
    </div>
    <span>Alerts</span>
    </div>
    </div>
    <div class="header-right">
    <div class="status-pill active" id="pill-firewall-toggle" title="Click to toggle Firewall Protection ON/OFF">
    <span class="status-indicator-dot" id="dot-firewall"></span>
    <span id="text-firewall-status">Firewall: ON</span>
    </div>
    <button class="status-pill btn-clean-reset" id="btn-clear-all-data" title="Clear all recorded traffic & start clean from 0 B">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    <span>Clear Data</span>
    </button>
    <button class="status-pill" id="pill-incognito-toggle" title="Toggle Incognito Mode (Zero Disk Persistence)">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    <span id="text-incognito-status">Incognito</span>
    </button>
    <button class="status-pill" id="pill-snooze-toggle" title="Snooze all toast alerts for 24 hours">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    <span id="text-snooze-status">Snooze</span>
    </button>
    <button class="status-pill" id="btn-theme-toggle" title="Switch Dark / Light Theme">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
    <div class="window-controls">
    <button class="win-btn" id="win-min" title="Minimize Window">─</button>
    <button class="win-btn" id="win-max" title="Maximize / Restore Window">□</button>
    <button class="win-btn close" id="win-close" title="Hide to Background System Tray (Next to Clock)">✕</button>
    </div>
    </div>
    </header>
    <main id="viewport-main">
    <div class="view-container active" id="view-traffic"></div>
    <div class="view-container" id="view-firewall"></div>
    <div class="view-container" id="view-alerts"></div>
    <div class="view-container" id="view-network"></div>
    <div class="view-container" id="view-usage"></div>
    </main>
    <!-- Toast Notifications Container -->
    <div id="toast-container"></div>
    `;
    this._bindEvents();
    this._bindKeyboardShortcuts();
  }

  _bindEvents() {
    this.container.querySelectorAll('.header-nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const targetView = tab.getAttribute('data-view');
        this.switchView(targetView);
      });
    });
    const brandMenu = this.container.querySelector('#btn-gw-menu');
    const dropdown = this.container.querySelector('#gw-brand-dropdown');
    brandMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
    });
    document.addEventListener('click', () => {
      if (dropdown) dropdown.style.display = 'none';
    });
      this.container.querySelector('#menu-clear-all-data')?.addEventListener('click', () => this.onClearAllData());
      this.container.querySelector('#btn-clear-all-data')?.addEventListener('click', () => this.onClearAllData());
      this.container.querySelector('#menu-open-settings')?.addEventListener('click', () => this.onOpenSettings());
      this.container.querySelector('#menu-open-dataplan')?.addEventListener('click', () => this.onOpenDataPlan());
      this.container.querySelector('#menu-toggle-incognito')?.addEventListener('click', () => this.onIncognitoToggle());
      this.container.querySelector('#menu-toggle-snooze')?.addEventListener('click', () => this.onSnoozeToggle());
      this.container.querySelector('#menu-open-license')?.addEventListener('click', () => this.onOpenLicenseInfo());
      dropdown.querySelectorAll('[data-theme]').forEach(item => {
        item.addEventListener('click', () => {
          const theme = item.getAttribute('data-theme');
          this.applyTheme(theme);
          this.onThemeChange(theme);
        });
      });
      this.container.querySelector('#btn-theme-toggle')?.addEventListener('click', () => {
        const nextTheme = this.state.theme === 'light' ? 'dark' : 'light';
        this.applyTheme(nextTheme);
        this.onThemeChange(nextTheme);
      });
      this.container.querySelector('#pill-firewall-toggle')?.addEventListener('click', () => this.onFirewallToggle());
      this.container.querySelector('#pill-incognito-toggle')?.addEventListener('click', () => this.onIncognitoToggle());
      this.container.querySelector('#pill-snooze-toggle')?.addEventListener('click', () => this.onSnoozeToggle());
      this.container.querySelector('#win-min')?.addEventListener('click', () => {
        if (!postNativeDesktopMessage('minimize_window')) {
          this.showToast('Application minimized', 'info');
        }
      });
      this.container.querySelector('#win-max')?.addEventListener('click', () => {
        if (!postNativeDesktopMessage('maximize_window')) {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
      });
      this.container.querySelector('#win-close')?.addEventListener('click', () => {
        if (!postNativeDesktopMessage('minimize_to_tray')) {
          this.showToast('CachyWire continues monitoring in background System Tray', 'info');
        }
      });
  }

  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // AUDIT UX: don't hijack Alt+numbers while the user is typing in a field
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.altKey) {
        if (e.key === '1') { e.preventDefault(); this.switchView('traffic'); }
        if (e.key === '2') { e.preventDefault(); this.switchView('firewall'); }
        if (e.key === '3') { e.preventDefault(); this.switchView('usage'); }
        if (e.key === '4') { e.preventDefault(); this.switchView('network'); }
        if (e.key === '5') { e.preventDefault(); this.switchView('alerts'); }
      }
    });
  }

  applyTheme(theme) {
    this.state.theme = theme || 'dark';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gw_cachyos_theme', this.state.theme);
    }
    document.body.className = `theme-${this.state.theme}`;
  }

  switchTab(viewName) {
    this.switchView(viewName);
  }

  switchView(viewName) {
    if (this.currentView === viewName) return;
    this.currentView = viewName;
    this.container.querySelectorAll('.header-nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
    });
    this.container.querySelectorAll('.view-container').forEach(view => {
      const isTarget = view.id === `view-${viewName}`;
      view.classList.toggle('active', isTarget);
    });
    this.onViewChange(viewName);
  }

  updateFirewallState(enabled, mode) {
    this.state.firewallEnabled = enabled;
    this.state.firewallMode = mode;
    const pill = this.container.querySelector('#pill-firewall-toggle');
    const text = this.container.querySelector('#text-firewall-status');
    const dot = this.container.querySelector('#dot-firewall');
    if (pill && text && dot) {
      pill.classList.toggle('active', enabled);
      const modeShort = mode === 'BLOCK_ALL' ? ' (Lockdown)' : mode === 'ASK_TO_CONNECT' ? ' (Ask)' : '';
      text.textContent = enabled ? `Firewall: ON${modeShort}` : 'Firewall: OFF';
      dot.style.background = enabled ? 'var(--gw-safe, #10B981)' : 'var(--gw-danger, #EF4444)';
    }
  }

  updateIncognitoState(active) {
    this.state.isIncognito = !!active;
    const pill = this.container.querySelector('#pill-incognito-toggle');
    const text = this.container.querySelector('#text-incognito-status');
    const menuLabel = this.container.querySelector('#menu-incognito-label');
    if (pill) pill.classList.toggle('active', this.state.isIncognito);
    if (text) text.textContent = this.state.isIncognito ? 'Incognito: ON' : 'Incognito';
    if (menuLabel) menuLabel.textContent = `Incognito Mode: ${this.state.isIncognito ? 'ON' : 'OFF'}`;
  }

  updateSnoozeState(active) {
    this.state.isSnoozed = !!active;
    const pill = this.container.querySelector('#pill-snooze-toggle');
    const text = this.container.querySelector('#text-snooze-status');
    const menuLabel = this.container.querySelector('#menu-snooze-label');
    if (pill) pill.classList.toggle('active', this.state.isSnoozed);
    if (text) text.textContent = this.state.isSnoozed ? 'Snoozed (24h)' : 'Snooze';
    if (menuLabel) menuLabel.textContent = `Snooze Alerts (24h): ${this.state.isSnoozed ? 'ON' : 'OFF'}`;
  }

  updateAlertsCount(count) {
    this.state.unreadAlerts = count;
    const badge = this.container.querySelector('#badge-alerts-count');
    if (badge) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  showToast(message, type = 'info') {
    // AUDIT FUNC-09: respect Snooze mode (critical alerts still break through)
    if (this.state.isSnoozed && type !== 'critical') return;
    const container = document.getElementById('toast-container');
    if (!container) return;
    // AUDIT UX-06: cap concurrent toasts to avoid alert storms
    while (container.children.length >= 3) container.removeChild(container.firstChild);
    const toast = document.createElement('div');
    toast.className = `gw-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}
