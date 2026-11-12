/**
 * CachyWire 0.1.0-alpha - Alerts Center View (SCR-06)
 * AUDIT FIXES (SEC-03): alert titles & details are now HTML-escaped,
 * because alert content can contain process-controlled strings.
 */
import { formatDateTime } from '../utils/formatters.js';
import { esc } from '../utils/escape.js';

export class AlertsTimelineView {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('view-alerts');
    this.alertsRepo = options.alertsRepo;
    this.appsRepo = options.appsRepo;
    this.onAlertClick = options.onAlertClick || (() => {});
    this.onUnreadChange = options.onUnreadChange || (() => {});
    this.activeCategory = 'ALL'; // 'ALL' | 'SECURITY' | 'SYSTEM' | 'NETWORK' | 'DATA_PLAN'
  }

  mount() {
    this.container.innerHTML = `
    <div class="alerts-header-bar">
    <div class="alerts-filter-chips">
    <button class="filter-chip active" data-category="ALL">All</button>
    <button class="filter-chip" data-category="SECURITY">Security</button>
    <button class="filter-chip" data-category="SYSTEM">System</button>
    <button class="filter-chip" data-category="NETWORK">Network</button>
    <button class="filter-chip" data-category="DATA_PLAN">Data Plan</button>
    </div>
    <div class="alerts-actions">
    <button class="pill-btn" id="btn-mark-all-read">Mark all as read</button>
    <button class="pill-btn" id="btn-clear-alerts">Clear</button>
    </div>
    </div>
    <div class="alerts-timeline-container" id="alerts-timeline-feed"></div>
    `;
    this._bindEvents();
    this.refresh();
  }

  _bindEvents() {
    this.container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeCategory = chip.getAttribute('data-category');
        this.refresh();
      });
    });
    const btnMarkAll = this.container.querySelector('#btn-mark-all-read');
    btnMarkAll.addEventListener('click', () => {
      this.alertsRepo.markAllAsRead();
      this.refresh();
      this.onUnreadChange();
    });
    const btnClear = this.container.querySelector('#btn-clear-alerts');
    btnClear.addEventListener('click', () => {
      this.alertsRepo.clear();
      this.refresh();
      this.onUnreadChange();
    });
  }

  refresh() {
    const feed = this.container.querySelector('#alerts-timeline-feed');
    if (!feed) return;
    const alerts = this.alertsRepo.getAll(this.activeCategory);
    feed.innerHTML = alerts.length === 0
    ? '<div style="padding:48px;text-align:center;color:var(--gw-text-secondary);font-size:14px;">No alerts recorded yet</div>'
    : '';
    const iconMap = {
      FIRST_NETWORK_ACTIVITY: '🌐',
      APP_CHANGED: '⚠️',
      ARP_SPOOF: '🚨',
      WIFI_EVIL_TWIN: '📡',
      HOSTS_CHANGED: '📝',
      DNS_CHANGED: '🔄',
      RDP_CONNECTION: '🖥️',
      PROXY_SETTINGS_CHANGED: '🛡️',
      INTERNET_LOST: '❌',
      INTERNET_RESTORED: '✅',
      NETWORK_ANOMALY: '📈',
      DATA_PLAN_WARNING: '📊',
      DATA_PLAN_EXCEEDED: '🛑',
      NEW_DEVICE_ON_NETWORK: '🔌'
    };
    for (const alert of alerts) {
      const isUnread = alert.is_read === 0;
      const icon = iconMap[alert.alert_type] || '🔔';
      let details = {};
      try {
        details = JSON.parse(alert.details_json);
      } catch (e) {
        details = { raw: alert.details_json };
      }
      const card = document.createElement('div');
      card.className = `alert-card severity-${alert.severity} ${isUnread ? 'unread' : ''}`;
      card.innerHTML = `
      <div class="alert-card-left">
      <div class="alert-type-icon">${icon}</div>
      <div class="alert-content">
      <span class="alert-title">${esc(alert.title)}</span>
      <span class="alert-description">${esc(this._formatDetailsDescription(details))}</span>
      </div>
      </div>
      <div class="alert-card-right">
      <span class="alert-timestamp">${formatDateTime(alert.created_ts)}</span>
      ${alert.app_id ? `<button class="pill-btn" style="font-size:10px;padding:2px 6px;" title="Mute future alerts from this app">Mute App</button>` : ''}
      </div>
      `;
      card.addEventListener('click', () => {
        if (isUnread) {
          this.alertsRepo.markAsRead(alert.alert_id);
          card.classList.remove('unread');
          this.onUnreadChange();
        }
      });
      const muteBtn = card.querySelector('button');
      if (muteBtn && alert.app_id) {
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.appsRepo.toggleAlertsMuted(alert.app_id);
          muteBtn.textContent = 'Muted';
        });
      }
      feed.appendChild(card);
    }
  }

  _formatDetailsDescription(details) {
    if (!details) return '';
    const items = [];
    if (details.path) items.push(`Path: ${details.path}`);
    if (details.destination) items.push(`Destination: ${details.destination}`);
    if (details.gatewayIp) items.push(`Gateway: ${details.gatewayIp} (Spoofed MAC: ${details.spoofedMac})`);
    if (details.ssid) items.push(`SSID: ${details.ssid} (Fake BSSID: ${details.fakeBssid})`);
    if (details.formattedUsed) items.push(`Used: ${details.formattedUsed} / Limit: ${details.formattedLimit}`);
    if (details.rate) items.push(`Current Rate: ${(details.rate / 1024).toFixed(1)} KB/s (Z-Score: ${details.zScore})`);
    if (details.description) items.push(details.description);
    return items.length > 0 ? items.join(' | ') : JSON.stringify(details);
  }
}
