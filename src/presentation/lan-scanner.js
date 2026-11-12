/**
 * CachyWire 0.1.0-alpha - LAN Scanner "Things" View (SCR-05)
 * Network device discovery table, OUI manufacturer resolution,
 * real CachyOS /proc/net/arp neighbor discovery, and inline editable device naming.
 *
 * AUDIT FIXES:
 *  - Accurate active ARP sweep via /api/network/scan
 *  - Dynamic subnet detection (no hardcoded 192.168.1.0/24)
 *  - Zero fabricated devices — only real verified network nodes
 *  - Real-time online/offline state reflection
 *  - SEC-03: all dynamic strings rendered through esc()
 */
import { formatMacAddress, formatDate } from '../utils/formatters.js';
import { lookupMacVendor } from '../utils/oui-vendors.js';
import { esc } from '../utils/escape.js';

export class LanScannerView {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('view-network');
    this.devicesRepo = options.devicesRepo;
    this.alertsRepo = options.alertsRepo;
    this.isScanning = false;
    this.alertOnNewDevice = true;
    this.currentSsid = 'Local Subnet (Scanning...)';
  }

  mount() {
    this.container.innerHTML = `
    <div class="network-header-bar">
      <div class="network-title-group">
        <div class="network-badge-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
        </div>
        <div class="network-meta">
          <span class="network-ssid" id="net-ssid-text">${this.currentSsid}</span>
          <span class="network-subnet" id="net-count-text">Scanning subnet...</span>
        </div>
      </div>
      <div class="network-actions-group">
        <label class="device-alert-checkbox-label">
          <input type="checkbox" id="chk-alert-new-device" ${this.alertOnNewDevice ? 'checked' : ''}>
          <span>Alert me when a new unknown device joins</span>
        </label>
        <button class="btn-scan" id="btn-scan-network">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          <span id="scan-btn-label">Scan Network</span>
        </button>
      </div>
    </div>
    <div class="network-table-wrapper">
      <div class="network-table">
        <div class="table-header">
          <div class="th-cell net-th-status">Status</div>
          <div class="th-cell net-th-name">Device Name & Type</div>
          <div class="th-cell net-th-ip">IP Address</div>
          <div class="th-cell net-th-mac">MAC Address</div>
          <div class="th-cell net-th-vendor">Manufacturer (OUI)</div>
          <div class="th-cell net-th-seen">First / Last Seen</div>
        </div>
        <div class="table-body" id="net-table-body"></div>
      </div>
    </div>
    `;
    this._bindEvents();
    this._syncSystemArpTable(false);
    this.refresh();
  }

  _bindEvents() {
    const btnScan = this.container.querySelector('#btn-scan-network');
    btnScan.addEventListener('click', () => {
      this.triggerScan();
    });
    const chkAlert = this.container.querySelector('#chk-alert-new-device');
    chkAlert.addEventListener('change', (e) => {
      this.alertOnNewDevice = e.target.checked;
    });
  }

  async _syncSystemArpTable(forceScan = false) {
    try {
      const endpoint = forceScan ? '/api/network/scan' : '/api/network/arp';
      const resp = await fetch(endpoint, { method: forceScan ? 'POST' : 'GET' });
      if (!resp.ok) return;
      const data = await resp.json();
      const liveDevices = Array.isArray(data)
        ? data
        : (data && Array.isArray(data.devices) ? data.devices : []);

      const activeMacs = new Set();
      let detectedGateway = null;

      for (const d of liveDevices) {
        if (!d || !d.mac || d.mac === 'UNKNOWN' || d.mac === '00:00:00:00:00:00') continue;
        const cleanMac = d.mac.toUpperCase();
        activeMacs.add(cleanMac);

        const isGw = (d.ip || '').endsWith('.1');
        if (isGw) detectedGateway = d.ip;
        const isLocal = !!d.is_local;
        let devType = isGw ? 'router' : (isLocal ? 'desktop' : 'generic');
        const vendor = lookupMacVendor(cleanMac);

        if (devType === 'generic') {
          const vLc = vendor.toLowerCase();
          if (vLc.includes('xiaomi') || vLc.includes('mobile') || vLc.includes('apple') || vLc.includes('android') || vLc.includes('phone')) {
            devType = 'phone';
          } else if (vLc.includes('tv') || vLc.includes('samsung') || vLc.includes('lg')) {
            devType = 'tv';
          }
        }

        this.devicesRepo.upsert({
          mac_address: cleanMac,
          last_ip: d.ip,
          hostname: d.hostname || (isGw ? `Gateway Router (${d.ip})` : `Host-${d.ip}`),
          device_type: devType,
          vendor_name: vendor,
          is_online: 1
        });
      }

      // Mark devices not present in the current ARP table as offline
      // Clean up any historical ghost devices from other subnets (e.g. old test artifacts)
      const allKnown = this.devicesRepo.getAll();
      for (const dev of allKnown) {
        if (!dev.mac_address) continue;
        const cleanMac = dev.mac_address.toUpperCase();
        if (!activeMacs.has(cleanMac)) {
          const isWrongSubnet = detectedGateway && dev.last_ip && !dev.last_ip.startsWith(detectedGateway.substring(0, detectedGateway.lastIndexOf('.') + 1));
          const isFakeName = dev.hostname === 'Samsung-Smart-TV' || dev.hostname === 'Huawei-Router-5G';
          if (isWrongSubnet || isFakeName) {
            this.devicesRepo.delete(dev.device_id);
          } else {
            this.devicesRepo.update(dev.device_id, { is_online: 0 });
          }
        }
      }

      if (detectedGateway) {
        const subnetPrefix = detectedGateway.substring(0, detectedGateway.lastIndexOf('.'));
        this.currentSsid = `CachyOS-LAN (${subnetPrefix}.0/24)`;
        const ssidEl = this.container.querySelector('#net-ssid-text');
        if (ssidEl) ssidEl.textContent = this.currentSsid;
      }

      // Feed live kernel ARP data to the spoofing watchdog
      if (window.gwApp && window.gwApp.securityWatchdog) {
        window.gwApp.securityWatchdog.checkArpTable(liveDevices);
      }
      this.refresh();
    } catch {}
  }

  async triggerScan() {
    if (this.isScanning) return;
    this.isScanning = true;
    const btnScan = this.container.querySelector('#btn-scan-network');
    const btnLabel = this.container.querySelector('#scan-btn-label');
    if (btnScan) btnScan.classList.add('scanning');
    if (btnLabel) btnLabel.textContent = 'Scanning...';

    await this._syncSystemArpTable(true);

    this.isScanning = false;
    if (btnScan) btnScan.classList.remove('scanning');
    if (btnLabel) btnLabel.textContent = 'Scan Network';
    this.refresh();
  }

  refresh() {
    const tableBody = this.container.querySelector('#net-table-body');
    const countText = this.container.querySelector('#net-count-text');
    if (!tableBody) return;

    const devices = this.devicesRepo.getAll().sort((a, b) => {
      // 1. Online devices first
      const onlineA = a.is_online ? 1 : 0;
      const onlineB = b.is_online ? 1 : 0;
      if (onlineB !== onlineA) return onlineB - onlineA;

      // 2. Router at top
      if (a.device_type === 'router') return -1;
      if (b.device_type === 'router') return 1;

      // 3. This PC second
      if ((a.hostname || '').includes('This PC')) return -1;
      if ((b.hostname || '').includes('This PC')) return 1;

      // 4. IP order
      return (a.last_ip || '').localeCompare(b.last_ip || '', undefined, { numeric: true });
    });

    const onlineCount = devices.filter(d => d.is_online).length;
    if (countText) {
      countText.textContent = `${onlineCount} of ${devices.length} devices connected`;
    }

    tableBody.innerHTML = devices.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--gw-text-secondary);">No devices detected on local network</div>' : '';
    const deviceIcons = {
      router: '📡',
      desktop: '💻',
      phone: '📱',
      server: '🖧',
      tv: '📺',
      printer: '🖨️',
      generic: '🔌'
    };

    for (const dev of devices) {
      const icon = deviceIcons[dev.device_type] || '🔌';
      const displayName = dev.custom_name || dev.hostname || 'Device';
      const vendor = lookupMacVendor(dev.mac_address) || dev.vendor_name || 'Standard Manufacturer';
      const row = document.createElement('div');
      row.className = 'net-row';
      row.innerHTML = `
        <div class="net-th-status" style="display:flex;align-items:center;justify-content:center;">
          <span class="status-dot ${dev.is_online ? '' : 'offline'}" title="${dev.is_online ? 'Device Online' : 'Device Offline'}"></span>
        </div>
        <div class="device-name-container">
          <span class="device-type-icon">${icon}</span>
          <input type="text" class="device-name-input" value="${esc(displayName)}" title="Click to edit custom device name" />
        </div>
        <div class="net-ip">${esc(dev.last_ip)}</div>
        <div class="net-mac">${esc(formatMacAddress(dev.mac_address))}</div>
        <div class="net-vendor">${esc(vendor)}</div>
        <div class="net-seen">${esc(formatDate(dev.last_seen_ts))}</div>
      `;
      const input = row.querySelector('.device-name-input');
      input.addEventListener('change', (e) => {
        const newName = e.target.value.trim();
        this.devicesRepo.update(dev.device_id, { custom_name: newName });
      });
      tableBody.appendChild(row);
    }
  }
}
