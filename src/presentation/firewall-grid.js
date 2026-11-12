/**
 * CachyWire 0.1.0-alpha - Firewall Grid View (SCR-04)
 * Comprehensive Security Table matching Section 3.2 (Screen 4) & Figure 2-4
 * Provides 1-click instant blocking (< 200ms), mode switching, Ask-to-Connect prompt test, search, and sorting.
 */

import { formatBytes } from '../utils/formatters.js';
import { FIREWALL_MODES, FIREWALL_PROFILES } from '../config/default-settings.js';
import { getAppIconSvg } from '../utils/app-icons.js';

export class FirewallGridView {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('view-firewall');
    this.db = options.db;
    this.appsRepo = options.appsRepo;
    this.trafficRepo = options.trafficRepo;
    this.firewallPolicy = options.firewallPolicy;
    this.securityScoreEngine = options.securityScoreEngine;
    this.virusTotalClient = options.virusTotalClient;
    this.onAppClick = options.onAppClick || (() => {});
    this.onModeChange = options.onModeChange || (() => {});
    this.onTestAskToConnect = options.onTestAskToConnect || (() => {});

    this.searchQuery = '';
    this.sortBy = 'traffic'; // 'name' | 'state' | 'score' | 'traffic'
    this.sortOrder = 'desc'; // 'asc' | 'desc'
  }

  mount() {
    this.container.innerHTML = `
      <div class="firewall-control-bar">
        <div class="firewall-controls-left">
          <div class="master-toggle-group">
            <span class="master-toggle-label">Firewall:</span>
            <div class="toggle-capsule active" id="fw-master-toggle" title="Toggle Firewall Enforcement ON/OFF">
              <div class="toggle-handle"></div>
            </div>
          </div>

          <div class="firewall-select-group">
            <span class="select-label">Mode:</span>
            <select class="gw-select" id="select-fw-mode">
              <option value="${FIREWALL_MODES.CLICK_TO_BLOCK}">Click to block</option>
              <option value="${FIREWALL_MODES.ASK_TO_CONNECT}">Ask to connect</option>
              <option value="${FIREWALL_MODES.BLOCK_ALL}">Block all (Lockdown)</option>
            </select>
          </div>

          <div class="firewall-select-group">
            <span class="select-label">Profile:</span>
            <select class="gw-select" id="select-fw-profile">
              ${FIREWALL_PROFILES.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="firewall-controls-right">
          <div class="search-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" class="gw-search-box" id="fw-search-input" placeholder="Search applications...">
          </div>

          <button class="pill-btn" id="btn-test-ask-connect" title="Simulate New Outbound Connection Prompt (SCR-09)">
            🛡️ Test Ask Prompt
          </button>

          <button class="pill-btn" id="btn-scan-all-vt" title="Run VirusTotal Inspection on all apps">
            Scan VT
          </button>
        </div>
      </div>

      <div class="firewall-table-wrapper">
        <div class="firewall-table">
          <div class="table-header">
            <div class="th-cell th-block" data-sort="state">Block</div>
            <div class="th-cell th-app" data-sort="name">Application & Publisher</div>
            <div class="th-cell th-score" data-sort="score">GW Score & Status</div>
            <div class="th-cell th-vt">VirusTotal</div>
            <div class="th-cell th-traffic" data-sort="traffic">Traffic ▾</div>
          </div>

          <div class="table-body" id="fw-table-body"></div>
        </div>
      </div>
    `;

    this._bindEvents();
    this.refresh();
  }

  _setMode(modeKey) {
    const map = {
      normal: FIREWALL_MODES.CLICK_TO_BLOCK,
      click_to_block: FIREWALL_MODES.CLICK_TO_BLOCK,
      CLICK_TO_BLOCK: FIREWALL_MODES.CLICK_TO_BLOCK,
      ask_to_connect: FIREWALL_MODES.ASK_TO_CONNECT,
      ASK_TO_CONNECT: FIREWALL_MODES.ASK_TO_CONNECT,
      block_all: FIREWALL_MODES.BLOCK_ALL,
      BLOCK_ALL: FIREWALL_MODES.BLOCK_ALL
    };
    const target = map[modeKey] || FIREWALL_MODES.CLICK_TO_BLOCK;
    this.firewallPolicy.setMode(target);
    const selMode = this.container.querySelector('#select-fw-mode');
    if (selMode) selMode.value = target;
    this.refresh();
    this.onModeChange();
  }

  _bindEvents() {
    const masterToggle = this.container.querySelector('#fw-master-toggle');
    masterToggle.addEventListener('click', () => {
      const isEnabled = this.firewallPolicy.isEnabled();
      this.firewallPolicy.setEnabled(!isEnabled);
      masterToggle.classList.toggle('active', !isEnabled);
      this.refresh();
      this.onModeChange();
    });

    const selMode = this.container.querySelector('#select-fw-mode');
    selMode.value = this.firewallPolicy.getMode();
    selMode.addEventListener('change', (e) => {
      this.firewallPolicy.setMode(e.target.value);
      this.refresh();
      this.onModeChange();
    });

    const selProfile = this.container.querySelector('#select-fw-profile');
    selProfile.value = this.firewallPolicy.getProfile();
    selProfile.addEventListener('change', (e) => {
      this.firewallPolicy.setProfile(e.target.value);
      this.refresh();
    });

    const searchInput = this.container.querySelector('#fw-search-input');
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.refresh();
      }, 150);
    });

    this.container.querySelectorAll('.th-cell[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (this.sortBy === field) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortBy = field;
          this.sortOrder = 'desc';
        }
        this.refresh();
      });
    });

    const btnTestAsk = this.container.querySelector('#btn-test-ask-connect');
    if (btnTestAsk) {
      btnTestAsk.addEventListener('click', () => {
        this.onTestAskToConnect();
      });
    }

    const btnScanAll = this.container.querySelector('#btn-scan-all-vt');
    btnScanAll.addEventListener('click', async () => {
      btnScanAll.textContent = 'Scanning...';
      const apps = this.appsRepo.getAll();
      for (const app of apps) {
        await this.virusTotalClient.scanApplication(app.app_id);
      }
      btnScanAll.textContent = 'Scan VT';
      this.refresh();
    });
  }

  refresh() {
    const tableBody = this.container.querySelector('#fw-table-body');
    if (!tableBody) return;

    const masterToggle = this.container.querySelector('#fw-master-toggle');
    if (masterToggle) {
      masterToggle.classList.toggle('active', this.firewallPolicy.isEnabled());
    }

    const selMode = this.container.querySelector('#select-fw-mode');
    if (selMode) {
      selMode.value = this.firewallPolicy.getMode();
    }

    let apps = this.appsRepo.getAll();

    if (this.searchQuery) {
      apps = apps.filter(a =>
        a.app_name.toLowerCase().includes(this.searchQuery) ||
        a.exe_path.toLowerCase().includes(this.searchQuery) ||
        (a.publisher && a.publisher.toLowerCase().includes(this.searchQuery))
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const summary = this.trafficRepo.getTotalsForRange(nowSec - (30 * 86400), nowSec);

    const appDataList = apps.map(app => {
      const traffic = summary.appBreakdown.get(app.app_id)?.total || 0;
      return { app, traffic };
    });

    appDataList.sort((a, b) => {
      // Hoist blocked applications to the very top for instant access
      const aBlocked = a.app.firewall_state === 1 ? 1 : 0;
      const bBlocked = b.app.firewall_state === 1 ? 1 : 0;
      if (aBlocked !== bBlocked) {
        return bBlocked - aBlocked;
      }
      let comparison = 0;
      if (this.sortBy === 'traffic') comparison = a.traffic - b.traffic;
      else if (this.sortBy === 'name') comparison = a.app.app_name.localeCompare(b.app.app_name);
      else if (this.sortBy === 'state') comparison = a.app.firewall_state - b.app.firewall_state;
      else if (this.sortBy === 'score') comparison = a.app.security_score - b.app.security_score;
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });

    tableBody.innerHTML = appDataList.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--gw-text-secondary);">No applications match the search criteria</div>' : '';

    const isFwEnabled = this.firewallPolicy.isEnabled();

    for (const { app, traffic } of appDataList) {
      const isBlocked = app.firewall_state === 1;
      const rating = this.securityScoreEngine.getScoreRating(app.security_score);

      let vtClass = 'unknown';
      let vtText = 'Scan';
      if (app.vt_total > 0) {
        vtText = `${app.vt_positives} / ${app.vt_total}`;
        vtClass = app.vt_positives === 0 ? 'clean' : 'infected';
      }

      const row = document.createElement('div');
      row.className = `table-row ${isBlocked ? 'blocked-row' : ''}`;
      row.innerHTML = `
        <div class="td-block">
          <button class="block-toggle-btn ${isBlocked ? 'blocked' : ''}" title="${isBlocked ? 'Unblock Application' : 'Block Application'}" ${!isFwEnabled ? 'disabled' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isBlocked ? '#FF4757' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </button>
        </div>

        <div class="td-app" title="Click to view full application details">
          <div class="app-vector-icon" style="width:22px;height:22px;flex-shrink:0;">${getAppIconSvg(app.app_name, app.exe_path)}</div>
          <div class="app-details-col">
            <span class="app-primary-name">${app.app_name}</span>
            <span class="app-publisher-name">${app.publisher || 'Unverified Publisher'} ${app.is_signed ? '✓' : ''}</span>
          </div>
        </div>

        <div class="td-score">
          <span class="score-badge ${rating.cssClass}">
            ${app.security_score}/100 ${rating.label}
          </span>
          ${app.security_score < 40 ? '<span class="anomaly-alert-tag">! ANOMALY DETECTED</span>' : ''}
        </div>

        <div class="td-vt">
          <span class="vt-pill ${vtClass}" title="Click to inspect on VirusTotal">
            ${vtText}
          </span>
        </div>

        <div class="td-traffic mono-num">
          ${formatBytes(traffic)}
        </div>
      `;

      const blockBtn = row.querySelector('.block-toggle-btn');
      blockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isFwEnabled) return;
        this.firewallPolicy.toggleBlock(app.app_id);
        this.refresh();
      });

      const appCol = row.querySelector('.td-app');
      appCol.addEventListener('click', () => {
        this.onAppClick(app);
      });

      const vtPill = row.querySelector('.vt-pill');
      vtPill.addEventListener('click', async (e) => {
        e.stopPropagation();
        vtPill.textContent = '...';
        await this.virusTotalClient.scanApplication(app.app_id);
        this.refresh();
      });

      tableBody.appendChild(row);
    }
  }
}
