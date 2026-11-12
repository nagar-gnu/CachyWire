/**
 * CachyWire 0.1.0-alpha - Usage & Hardware Resources View (SCR-03)
 * Implements 3-column synchronized cross-filtering breakdown,
 * Total Bandwidth banner with download/upload gauge, CachyOS live hardware telemetry, and CSV Export.
 */

import { formatBytes } from '../utils/formatters.js';
import { getAppIconSvg } from '../utils/app-icons.js';
import { lookupGeoIp } from '../utils/geoip.js';

export class UsageView {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('view-usage');
    this.db = options.db;
    this.appsRepo = options.appsRepo;
    this.hostsRepo = options.hostsRepo;
    this.trafficRepo = options.trafficRepo;
    this.exportService = options.exportService;
    this.onAppDoubleClick = options.onAppDoubleClick || (() => {});
    this.onHostDoubleClick = options.onHostDoubleClick || (() => {});
    this.onOpenDataPlan = options.onOpenDataPlan || (() => {});

    this.selectedRange = 'Month'; // 'Today' | 'Week' | 'Month'
    this.trafficFilter = 'ALL';   // 'ALL' | 'EXTERNAL' | 'LOCAL'
    this.selectedAppId = null;    // For cross-filtering drill-down
    this.selectedCountryIso2 = null; // Filter hosts by country if selected
    this.selectedCountryName = null;
  }

  mount() {
    this.container.innerHTML = `
      <div class="usage-banner">
        <div class="banner-left">
          <div class="total-stat-box">
            <span class="total-stat-label">Total Bandwidth</span>
            <span class="total-stat-value mono-num" id="usage-total-stat">0 B</span>
          </div>

          <div class="usage-split-visual">
            <div class="split-labels">
              <span class="down"><span style="color:var(--gw-inbound);">↓</span> <span id="usage-down-stat">0 B</span></span>
              <span class="up"><span style="color:var(--gw-outbound);">↑</span> <span id="usage-up-stat">0 B</span></span>
            </div>
            <div class="split-bar-track">
              <div class="split-bar-inbound" id="usage-split-in" style="width: 50%;"></div>
              <div class="split-bar-outbound" id="usage-split-out" style="width: 50%;"></div>
            </div>
          </div>

          <!-- CachyOS Real-Time Hardware Telemetry Strip -->
          <div class="hw-telemetry-pills" id="hw-telemetry-pills" style="display:flex;align-items:center;gap:10px;margin-left:12px;">
            <div class="status-pill" title="Operating System & Kernel">
              <span>🐧</span>
              <span id="hw-os-kernel">CachyOS Linux</span>
            </div>
            <div class="status-pill" title="Live CPU Utilization">
              <span>⚡ CPU:</span>
              <span class="mono-num" id="hw-cpu-load">12%</span>
            </div>
            <div class="status-pill" title="Live Memory Utilization">
              <span>🧠 RAM:</span>
              <span class="mono-num" id="hw-ram-load">--</span>
            </div>
          </div>
        </div>

        <div class="banner-right">
          <select class="gw-select" id="select-usage-range">
            <option value="Today">Today</option>
            <option value="Week">This Week</option>
            <option value="Month" selected>This Month</option>
          </select>

          <select class="gw-select" id="select-usage-type">
            <option value="ALL">All Traffic</option>
            <option value="EXTERNAL">External / Internet Only</option>
            <option value="LOCAL">Local / LAN Only</option>
          </select>

          <button class="pill-btn" id="btn-export-csv" title="Export Usage Data to CSV (FUNC-02)">
            Export CSV
          </button>

          <button class="pill-btn active" id="btn-data-plan-modal" title="Configure Bandwidth Overuse & Data Plan (BR-06)">
            Data Plan
          </button>
        </div>
      </div>

      <div class="usage-columns-container" id="usage-columns-container">
        <!-- 1. Applications Column -->
        <div class="usage-column" id="usage-col-apps">
          <div class="usage-column-header">
            <span>Applications (Click to Filter)</span>
            <span class="mono-num" id="col-apps-total">0 B</span>
          </div>
          <div class="usage-column-list" id="col-apps-list"></div>
        </div>

        <!-- Splitter 1 -->
        <div class="usage-col-splitter" title="Drag to resize columns, double-click to reset"></div>

        <!-- 2. Countries Column (الدول) -->
        <div class="usage-column" id="usage-col-countries">
          <div class="usage-column-header">
            <span id="col-countries-title">Countries (الدول)</span>
            <span class="mono-num" id="col-countries-total">0 B</span>
          </div>
          <div class="usage-column-list" id="col-countries-list"></div>
        </div>

        <!-- Splitter 2 -->
        <div class="usage-col-splitter" title="Drag to resize columns, double-click to reset"></div>

        <!-- 3. Remote Hosts Column -->
        <div class="usage-column" id="usage-col-hosts">
          <div class="usage-column-header">
            <span id="col-hosts-title">Remote Hosts</span>
            <span class="mono-num" id="col-hosts-total">0 B</span>
          </div>
          <div class="usage-column-list" id="col-hosts-list"></div>
        </div>

        <!-- Splitter 3 -->
        <div class="usage-col-splitter" title="Drag to resize columns, double-click to reset"></div>

        <!-- 4. Traffic Types Column -->
        <div class="usage-column" id="usage-col-proto">
          <div class="usage-column-header">
            <span>Traffic Types</span>
            <span class="mono-num" id="col-proto-total">0 B</span>
          </div>
          <div class="usage-column-list" id="col-proto-list"></div>
        </div>
      </div>
    `;

    this._bindEvents();
    this._initColumnSplitters();
    this.refresh();
  }

  _bindEvents() {
    const selRange = this.container.querySelector('#select-usage-range');
    selRange.addEventListener('change', (e) => {
      this.selectedRange = e.target.value;
      this.refresh();
    });

    const selType = this.container.querySelector('#select-usage-type');
    selType.addEventListener('change', (e) => {
      this.trafficFilter = e.target.value;
      this.refresh();
    });

    const btnExport = this.container.querySelector('#btn-export-csv');
    btnExport.addEventListener('click', () => {
      const { startSec, endSec } = this._getRangeSeconds();
      const csv = this.exportService.generateUsageCsv(startSec, endSec, {
        isLocalLan: this.trafficFilter === 'LOCAL' ? 1 : this.trafficFilter === 'EXTERNAL' ? 0 : null
      });
      this.exportService.downloadCsv(csv, `CachyWire_Usage_${this.selectedRange}.csv`);
    });

    const btnDataPlan = this.container.querySelector('#btn-data-plan-modal');
    btnDataPlan.addEventListener('click', () => {
      this.onOpenDataPlan();
    });
  }

  _initColumnSplitters() {
    const container = this.container.querySelector('#usage-columns-container');
    if (!container) return;
    const splitters = container.querySelectorAll('.usage-col-splitter');
    const columns = container.querySelectorAll('.usage-column');

    // Restore saved widths if any
    try {
      const saved = localStorage.getItem('cachywire_usage_col_widths');
      if (saved) {
        const widths = JSON.parse(saved);
        if (Array.isArray(widths) && widths.length === columns.length) {
          columns.forEach((col, idx) => {
            if (widths[idx] >= 110) {
              col.style.flex = 'none';
              col.style.width = `${widths[idx]}px`;
            }
          });
        }
      }
    } catch (_) {}

    splitters.forEach((splitter, index) => {
      splitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const leftCol = columns[index];
        const rightCol = columns[index + 1];
        if (!leftCol || !rightCol) return;

        const startX = e.clientX;
        const startLeftW = leftCol.getBoundingClientRect().width;
        const startRightW = rightCol.getBoundingClientRect().width;

        splitter.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (moveEvt) => {
          const deltaX = moveEvt.clientX - startX;
          const minW = 120;
          let newLeftW = startLeftW + deltaX;
          let newRightW = startRightW - deltaX;

          if (newLeftW < minW) {
            newLeftW = minW;
            newRightW = startLeftW + startRightW - minW;
          } else if (newRightW < minW) {
            newRightW = minW;
            newLeftW = startLeftW + startRightW - minW;
          }

          leftCol.style.flex = 'none';
          leftCol.style.width = `${newLeftW}px`;
          rightCol.style.flex = 'none';
          rightCol.style.width = `${newRightW}px`;
        };

        const onMouseUp = () => {
          splitter.classList.remove('dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);

          try {
            const widths = Array.from(columns).map(col => Math.round(col.getBoundingClientRect().width));
            localStorage.setItem('cachywire_usage_col_widths', JSON.stringify(widths));
          } catch (_) {}
        };

        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('mouseup', onMouseUp);
      });

      // Double-click splitter to reset all columns to equal width
      splitter.addEventListener('dblclick', () => {
        columns.forEach(col => {
          col.style.flex = '1 1 0';
          col.style.width = '';
        });
        try {
          localStorage.removeItem('cachywire_usage_col_widths');
        } catch (_) {}
      });
    });
  }

  updateHardwareTelemetry(sysStatus) {
    if (!sysStatus) return;
    const osEl = this.container.querySelector('#hw-os-kernel');
    const cpuEl = this.container.querySelector('#hw-cpu-load');
    const ramEl = this.container.querySelector('#hw-ram-load');
    if (osEl) osEl.textContent = `${sysStatus.osName || 'CachyOS'} (${sysStatus.kernel || ''})`;
    if (cpuEl) cpuEl.textContent = `${sysStatus.cpuPercent || 0}%`;
    if (ramEl) {
      ramEl.textContent = `${formatBytes(sysStatus.memUsedBytes || 0)} / ${formatBytes(sysStatus.memTotalBytes || 0)} (${sysStatus.memPercent || 0}%)`;
    }
  }

  _getRangeSeconds() {
    const nowSec = Math.floor(Date.now() / 1000);
    let startSec = nowSec - 86400;

    if (this.selectedRange === 'Week') {
      startSec = nowSec - (7 * 86400);
    } else if (this.selectedRange === 'Month') {
      startSec = nowSec - (30 * 86400);
    }
    return { startSec, endSec: nowSec };
  }

  refresh() {
    const { startSec, endSec } = this._getRangeSeconds();
    const isLocalLan = this.trafficFilter === 'LOCAL' ? 1 : this.trafficFilter === 'EXTERNAL' ? 0 : null;

    const globalSummary = this.trafficRepo.getTotalsForRange(startSec, endSec, { isLocalLan });

    const statTotal = this.container.querySelector('#usage-total-stat');
    const statDown = this.container.querySelector('#usage-down-stat');
    const statUp = this.container.querySelector('#usage-up-stat');
    const splitIn = this.container.querySelector('#usage-split-in');
    const splitOut = this.container.querySelector('#usage-split-out');

    statTotal.textContent = formatBytes(globalSummary.totalBytes);
    statDown.textContent = formatBytes(globalSummary.totalIn);
    statUp.textContent = formatBytes(globalSummary.totalOut);

    const downPercent = globalSummary.totalBytes > 0 ? (globalSummary.totalIn / globalSummary.totalBytes) * 100 : 50;
    splitIn.style.width = `${downPercent}%`;
    splitOut.style.width = `${100 - downPercent}%`;

    const displaySummary = this.selectedAppId !== null
      ? this.trafficRepo.getTotalsForRange(startSec, endSec, { appId: this.selectedAppId, isLocalLan })
      : globalSummary;

    this.container.querySelector('#col-apps-total').textContent = formatBytes(globalSummary.totalBytes);
    this.container.querySelector('#col-hosts-total').textContent = formatBytes(displaySummary.totalBytes);
    this.container.querySelector('#col-proto-total').textContent = formatBytes(displaySummary.totalBytes);
    const colCountriesTotal = this.container.querySelector('#col-countries-total');
    if (colCountriesTotal) colCountriesTotal.textContent = formatBytes(displaySummary.totalBytes);

    const hostsTitle = this.container.querySelector('#col-hosts-title');
    if (this.selectedCountryName) {
      hostsTitle.textContent = `Hosts in ${this.selectedCountryName}`;
    } else if (this.selectedAppId !== null) {
      const activeApp = this.appsRepo.getById(this.selectedAppId);
      hostsTitle.textContent = `Hosts for ${activeApp?.app_name || 'Selected App'}`;
    } else {
      hostsTitle.textContent = 'Remote Hosts (Double-Click for Info)';
    }

    const countriesTitle = this.container.querySelector('#col-countries-title');
    if (countriesTitle) {
      if (this.selectedAppId !== null) {
        const activeApp = this.appsRepo.getById(this.selectedAppId);
        countriesTitle.textContent = `Countries for ${activeApp?.app_name || 'Selected App'}`;
      } else {
        countriesTitle.textContent = 'Countries (الدول)';
      }
    }

    // 1. Render Applications Column
    const appsList = this.container.querySelector('#col-apps-list');
    const sortedApps = Array.from(globalSummary.appBreakdown.entries()).sort((a, b) => b[1].total - a[1].total);
    appsList.innerHTML = sortedApps.length === 0 ? '<div style="padding:16px;color:var(--gw-text-secondary);text-align:center;">No network activity recorded for the selected period</div>' : '';

    const maxAppTotal = sortedApps.length > 0 ? sortedApps[0][1].total : 1;

    for (const [appId, data] of sortedApps) {
      const app = this.appsRepo.getById(appId);
      const isSelected = this.selectedAppId === appId;
      const progressPercent = Math.min(100, (data.total / maxAppTotal) * 100);

      const item = document.createElement('div');
      item.className = `usage-item-row ${isSelected ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="usage-item-main">
          <div class="usage-item-title-wrap">
            <span class="app-vector-icon" style="width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;">${getAppIconSvg(app?.app_name, app?.exe_path)}</span>
            <span class="usage-item-name" title="${app?.exe_path || ''}">${app?.app_name || `App #${appId}`}</span>
          </div>
          <span class="usage-item-bytes">${formatBytes(data.total)}</span>
        </div>
        <div class="usage-progress-bar">
          <div class="usage-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectedAppId = this.selectedAppId === appId ? null : appId;
        this.refresh();
      });

      item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (app) this.onAppDoubleClick(app);
      });

      appsList.appendChild(item);
    }

    // 2. Render Countries Column (الدول)
    const countriesList = this.container.querySelector('#col-countries-list');
    const countryBreakdown = new Map();
    for (const [hostId, data] of displaySummary.hostBreakdown.entries()) {
      const host = this.hostsRepo.getById(hostId);
      const ip = host ? host.ip_address : `142.250.185.${hostId}`;
      const geo = lookupGeoIp(ip);
      const key = geo.iso2 || 'GLOBAL';
      const curr = countryBreakdown.get(key) || {
        iso2: geo.iso2,
        country: geo.country,
        flag: geo.flag,
        down: 0,
        up: 0,
        total: 0
      };
      curr.down += (data.bytes_in || 0);
      curr.up += (data.bytes_out || 0);
      curr.total += data.total;
      countryBreakdown.set(key, curr);
    }

    const sortedCountries = Array.from(countryBreakdown.values()).sort((a, b) => b.total - a.total);
    countriesList.innerHTML = sortedCountries.length === 0 ? '<div style="padding:16px;color:var(--gw-text-secondary);text-align:center;">No country activity</div>' : '';

    const maxCountryTotal = sortedCountries.length > 0 ? sortedCountries[0].total : 1;

    for (const c of sortedCountries) {
      const isSelected = this.selectedCountryIso2 === c.iso2;
      const progressPercent = Math.min(100, (c.total / maxCountryTotal) * 100);

      const item = document.createElement('div');
      item.className = `usage-item-row ${isSelected ? 'selected' : ''}`;
      item.title = isSelected ? 'Click to clear country filter' : `Click to filter hosts by ${c.country}`;
      item.innerHTML = `
        <div class="usage-item-main">
          <div class="usage-item-title-wrap">
            <span class="country-flag-icon" style="font-size:15px;">${c.flag}</span>
            <span class="usage-item-name" title="${c.country} (${c.iso2})">${c.country}</span>
          </div>
          <span class="usage-item-bytes">${formatBytes(c.total)}</span>
        </div>
        <div class="usage-progress-bar">
          <div class="usage-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      `;

      item.addEventListener('click', () => {
        if (this.selectedCountryIso2 === c.iso2) {
          this.selectedCountryIso2 = null;
          this.selectedCountryName = null;
        } else {
          this.selectedCountryIso2 = c.iso2;
          this.selectedCountryName = c.country;
        }
        this.refresh();
      });

      countriesList.appendChild(item);
    }

    // 3. Render Hosts Column (with country flags & filtering)
    const hostsList = this.container.querySelector('#col-hosts-list');
    let hostEntries = Array.from(displaySummary.hostBreakdown.entries());
    if (this.selectedCountryIso2) {
      hostEntries = hostEntries.filter(([hostId]) => {
        const host = this.hostsRepo.getById(hostId);
        const ip = host ? host.ip_address : `142.250.185.${hostId}`;
        const geo = lookupGeoIp(ip);
        return geo.iso2 === this.selectedCountryIso2;
      });
    }
    const sortedHosts = hostEntries.sort((a, b) => b[1].total - a[1].total);
    hostsList.innerHTML = sortedHosts.length === 0 ? '<div style="padding:16px;color:var(--gw-text-secondary);text-align:center;">No host activity</div>' : '';

    const maxHostTotal = sortedHosts.length > 0 ? sortedHosts[0][1].total : 1;

    for (const [hostId, data] of sortedHosts) {
      const host = this.hostsRepo.getById(hostId);
      const ip = host ? host.ip_address : `142.250.185.${hostId}`;
      const domain = host?.domain_name || ip;
      const geo = lookupGeoIp(ip);
      const progressPercent = Math.min(100, (data.total / maxHostTotal) * 100);

      const item = document.createElement('div');
      item.className = 'usage-item-row';
      item.innerHTML = `
        <div class="usage-item-main">
          <div class="usage-item-title-wrap">
            <span class="country-flag-icon">${geo.flag}</span>
            <span class="usage-item-name" title="${ip} (${geo.country})">${domain}</span>
          </div>
          <span class="usage-item-bytes">${formatBytes(data.total)}</span>
        </div>
        <div class="usage-progress-bar">
          <div class="usage-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      `;

      item.addEventListener('dblclick', () => {
        if (host) this.onHostDoubleClick(host);
      });

      hostsList.appendChild(item);
    }

    // 4. Render Protocols / Traffic Types Column
    const protoList = this.container.querySelector('#col-proto-list');
    const sortedProtos = Array.from(displaySummary.protoBreakdown.entries()).sort((a, b) => b[1].total - a[1].total);
    protoList.innerHTML = sortedProtos.length === 0 ? '<div style="padding:16px;color:var(--gw-text-secondary);text-align:center;">No protocol activity</div>' : '';

    const maxProtoTotal = sortedProtos.length > 0 ? sortedProtos[0][1].total : 1;

    for (const [protoId, data] of sortedProtos) {
      const proto = this.db.tables.traffic_types.get(protoId);
      const name = proto ? proto.service_name : `Protocol #${protoId}`;
      const progressPercent = Math.min(100, (data.total / maxProtoTotal) * 100);

      const item = document.createElement('div');
      item.className = 'usage-item-row';
      item.innerHTML = `
        <div class="usage-item-main">
          <div class="usage-item-title-wrap">
            <span style="font-weight:700;color:var(--gw-accent);">#</span>
            <span class="usage-item-name">${name}</span>
          </div>
          <span class="usage-item-bytes">${formatBytes(data.total)}</span>
        </div>
        <div class="usage-progress-bar">
          <div class="usage-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      `;
      protoList.appendChild(item);
    }
  }
}
