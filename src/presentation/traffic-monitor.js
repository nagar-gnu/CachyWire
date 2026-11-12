/**
 * CachyWire 0.1.0-alpha - Traffic Monitor View (SCR-02)
 * Pixel-accurate implementation matching CachyWire 3.x reference
 * Features:
 * - Left column switchable between Apps, Traffic Types (Protocols), and Remote Hosts
 * - Right area graph with Wave (Bézier curves), Bar (grouped columns), and Geo (world breakdown) modes
 * - Interactive crosshair hover tooltip showing exact time, download/upload throughput, and active app
 * - Center summary banner with circular arc gauge, live download/upload speed meters, and WAN/LAN progress bar
 * - Dual-handled interactive timeline scrubber to freely select and zoom any duration
 */

import { formatBytes, formatSpeed } from '../utils/formatters.js';
import { getAppIconSvg } from '../utils/app-icons.js';
import { lookupGeoIp } from '../utils/geoip.js';
import { esc } from '../utils/escape.js';

export class TrafficMonitorView {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('view-traffic');
    this.db = options.db;
    this.appsRepo = options.appsRepo;
    this.hostsRepo = options.hostsRepo;
    this.trafficRepo = options.trafficRepo;
    this.onAppClick = options.onAppClick || (() => {});
    this.onHostClick = options.onHostClick || (() => {});
    this.onOpenDataPlan = options.onOpenDataPlan || (() => {});

    this.selectedPeriod = '5m';  // Default to 5m live real-time view on CachyOS
    this.selectedAdapter = 'all';
    this.sidebarType = 'apps';   // 'apps' | 'traffic' | 'hosts'
    this.selectedAppId = null;
    this.selectedProtoId = null;
    this.selectedHostId = null;
    this.viewMode = 'wave';      // 'wave' | 'bar' | 'geo'
    this.sortOrder = 'desc';     // 'desc' | 'asc'
    this.searchQuery = '';

    // Scrubber zoom window (0.0 to 1.0)
    this.zoomStart = 0.0;
    this.zoomEnd = 1.0;
    this.isDraggingScrubber = false;
    this.scrubberRafPending = false;
    this._cachedFilteredRecords = null;
    this._cachedFilterKey = '';

    this.lastBuckets = [];
    this.hoverBucketIndex = null;
    this.animFrameId = null;
  }

  mount() {
    this.container.innerHTML = `
      <div class="traffic-monitor-layout">
        <!-- LEFT COLUMN: Switchable Apps / Traffic Types / Hosts Table -->
        <aside class="traffic-apps-sidebar" id="traffic-apps-sidebar">
          <div class="apps-filter-bar">
            <select class="apps-dropdown-filter" id="select-filter-type" title="Switch Breakdown Dimension">
              <option value="apps">Apps ▾</option>
              <option value="traffic">Traffic Types ▾</option>
              <option value="hosts">Hosts ▾</option>
            </select>

            <select class="apps-dropdown-filter" id="select-filter-adapter" title="Filter Network Interface / Direction">
              <option value="all">WAN & LAN ▾</option>
              <option value="wan">External (WAN)</option>
              <option value="lan">Internal (LAN)</option>
              <option value="wifi">Wi-Fi / Wireless</option>
              <option value="eth">Ethernet (CachyOS)</option>
            </select>

            <button class="apps-icon-btn" id="btn-toggle-sort" title="Toggle Sort Order">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>
            </button>
            <button class="apps-icon-btn" id="btn-toggle-search" title="Search Applications, Protocols & Hosts">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </div>

          <div class="apps-search-row" id="apps-search-row" style="display: none;">
            <input type="text" id="apps-search-input" placeholder="Search..." />
            <button id="apps-search-clear">✕</button>
          </div>

          <div class="apps-table-header">
            <span class="col-name" id="sidebar-col-title">App</span>
            <span class="col-speed" title="Live Speed (↓ In / ↑ Out)">Speed</span>
            <span class="col-down" title="Total Inbound">↓</span>
            <span class="col-up" title="Total Outbound">↑</span>
          </div>

          <div class="apps-table-row master active" id="row-all-apps" title="Show All Traffic">
            <div class="app-info-cell">
              <span class="all-apps-icon">■</span>
              <span class="app-label" id="master-row-label">All apps</span>
            </div>
            <div class="col-speed mono-num" id="master-speed-cell">
              <span class="speed-sub-row speed-out"><span style="color:#FF9F43;font-size:9px;margin-right:2px;">↑</span><span id="master-speed-out">0 B/s</span></span>
              <span class="speed-sub-row speed-in"><span style="color:#00D4B2;font-size:9px;margin-right:2px;">↓</span><span id="master-speed-in">0 B/s</span></span>
            </div>
            <span class="col-down mono-num" id="total-down-bytes">0 B</span>
            <span class="col-up mono-num" id="total-up-bytes">0 B</span>
          </div>

          <div class="apps-table-body" id="apps-list-body"></div>
        </aside>

        <!-- Vertical Resizable Splitter Divider -->
        <div class="traffic-splitter" id="traffic-splitter" title="Drag to resize sidebar width"></div>

        <!-- RIGHT AREA: Main Graph + Banner + Scrubber -->
        <section class="traffic-main-area">
          <div class="graph-toolbar">
            <div class="graph-scale-indicator" id="btn-scale-menu" title="Dynamic Y-Axis Peak Scale">
              <span id="label-max-scale">10 MB</span>
              <span style="font-size: 10px; margin-left: 2px;">▾</span>
            </div>

            <div class="graph-controls-right">
              <div class="graph-mode-pill">
                <button class="mode-btn active" data-mode="wave" id="btn-mode-wave" title="Area Wave Curve">
                  <svg width="14" height="14" viewBox="0 0 24 24"><path d="M2 12 Q 6 4, 10 12 T 18 12 T 22 12" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>
                </button>
                <button class="mode-btn" data-mode="bar" id="btn-mode-bar" title="Column Bar Chart">
                  <svg width="14" height="14" viewBox="0 0 24 24"><line x1="6" y1="20" x2="6" y2="10" stroke="currentColor" stroke-width="2.5"/><line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" stroke-width="2.5"/><line x1="18" y1="20" x2="18" y2="14" stroke="currentColor" stroke-width="2.5"/></svg>
                </button>
                <button class="mode-btn" data-mode="geo" id="btn-mode-geo" title="Geo / Country Traffic Breakdown">
                  <svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                </button>
              </div>

              <select class="time-range-select" id="select-time-window">
                <option value="5m" selected>5 Minutes (Live)</option>
                <option value="1h">1 Hour</option>
                <option value="3h">3 Hours</option>
                <option value="12h">12 Hours</option>
                <option value="24h">24 Hours</option>
                <option value="week">1 Week</option>
                <option value="month">1 Month</option>
              </select>
            </div>
          </div>

          <div class="graph-canvas-container" id="graph-canvas-container">
            <canvas id="traffic-canvas"></canvas>
            <div id="canvas-tooltip" class="canvas-hover-tooltip" style="display: none;"></div>
          </div>

          <!-- Horizontal Resizer Splitter between Graph and Controls -->
          <div class="traffic-horizontal-splitter" id="traffic-h-splitter" title="Drag to adjust Graph and Summary/Timeline heights"></div>

          <!-- Middle Summary Banner -->
          <div class="traffic-summary-strip" id="traffic-summary-strip">
            <div class="metric-down">
              <span class="metric-val mono-num" id="banner-down-total">0 B</span>
              <span class="metric-speed mono-num" id="banner-down-speed"><span style="color: #00D4B2;">↓</span> 0.0 KB/s</span>
            </div>

            <div class="metric-center-gauge" id="metric-center-gauge" title="Click to configure Data Plan & Quota Alerts" style="cursor: pointer;">
              <div class="gauge-arc-wrap">
                <svg width="138" height="52" viewBox="0 0 138 52" class="gauge-svg">
                  <defs>
                    <linearGradient id="gwDownGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stop-color="#00A8E8"/>
                      <stop offset="100%" stop-color="#00D4B2"/>
                    </linearGradient>
                    <linearGradient id="gwUpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#FFB830"/>
                      <stop offset="100%" stop-color="#FF7A00"/>
                    </linearGradient>
                  </defs>
                  <!-- Subtle outer tick track: smooth semi-oval arc -->
                  <path d="M 12 46 A 57 36 0 0 1 126 46" fill="none" stroke="rgba(148,163,184,0.14)" stroke-width="7" stroke-linecap="round"/>
                  <!-- Dynamic Inbound (Teal) & Outbound (Amber) Arcs (pathLength=100) -->
                  <path id="gauge-arc-down" d="M 12 46 A 57 36 0 0 1 126 46" fill="none" stroke="url(#gwDownGrad)" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="50 100" stroke-dashoffset="0"/>
                  <path id="gauge-arc-up" d="M 12 46 A 57 36 0 0 1 126 46" fill="none" stroke="url(#gwUpGrad)" stroke-width="7" stroke-linecap="butt" pathLength="100" stroke-dasharray="50 100" stroke-dashoffset="-50"/>
                </svg>
                <div class="gauge-center-text">
                  <span class="gauge-main-val mono-num" id="banner-gauge-total">0 B</span>
                </div>
              </div>
              <div class="gauge-split-pill">
                <span class="split-down mono-num" id="gauge-pct-down">↓ 50%</span>
                <div class="split-track">
                  <div class="split-fill-down" id="gauge-bar-down" style="width: 50%;"></div>
                  <div class="split-fill-up" id="gauge-bar-up" style="width: 50%;"></div>
                </div>
                <span class="split-up mono-num" id="gauge-pct-up">50% ↑</span>
              </div>
              <div class="gauge-footer-slot">
                <div id="gauge-selected-badge" class="gauge-selected-badge" title="Click to clear filter and show all apps">
                  <span class="badge-dot">●</span>
                  <span class="badge-label">TOTAL TRAFFIC</span>
                  <span class="badge-clear" style="display: none;" title="Clear filter">✕</span>
                </div>
              </div>
            </div>

            <div class="metric-up">
              <span class="metric-val mono-num" id="banner-up-total">0 B</span>
              <span class="metric-speed mono-num" id="banner-up-speed"><span style="color: #FF9F43;">↑</span> 0.0 KB/s</span>
            </div>

            <div class="metric-wan-lan">
              <div class="wan-row">
                <span class="wan-label">WAN</span>
                <span class="mono-num wan-val" id="banner-wan-val">0 B</span>
                <div class="wan-bar"><div class="wan-bar-fill" id="banner-wan-bar" style="width: 98%;"></div></div>
              </div>
              <div class="lan-row">
                <span class="lan-label">LAN</span>
                <span class="mono-num lan-val" id="banner-lan-val">0 B</span>
                <span class="lan-dot"></span>
              </div>
            </div>
          </div>

          <!-- Dual-Handle Interactive Timeline Scrubber -->
          <div class="timeline-scrubber-wrapper" id="scrubber-wrapper">
            <div class="scrubber-track-area" id="scrubber-track-area">
              <canvas id="scrubber-canvas"></canvas>
              <div class="scrubber-window" id="scrubber-window">
                <div class="scrubber-handle left" id="handle-left" title="Drag to adjust start time"></div>
                <div class="scrubber-handle right" id="handle-right" title="Drag to adjust end time"></div>
              </div>
            </div>
            <div class="scrubber-time-ticks" id="scrubber-ticks"></div>
          </div>
        </section>
      </div>
    `;

    this._bindEvents();
    this._initCanvases();
    this.refreshAppsList(false);
    this.renderGraph();
    this.renderScrubber();
  }

  _bindEvents() {
    // Breakdown type selector (Apps / Traffic Types / Hosts)
    const selType = this.container.querySelector('#select-filter-type');
    if (selType) {
      selType.addEventListener('change', (e) => {
        this.sidebarType = e.target.value;
        this.selectedAppId = null;
        this.selectedProtoId = null;
        this.selectedHostId = null;

        const colTitle = this.container.querySelector('#sidebar-col-title');
        const masterLabel = this.container.querySelector('#master-row-label');
        if (this.sidebarType === 'apps') {
          if (colTitle) colTitle.textContent = 'App';
          if (masterLabel) masterLabel.textContent = 'All apps';
        } else if (this.sidebarType === 'traffic') {
          if (colTitle) colTitle.textContent = 'Protocol';
          if (masterLabel) masterLabel.textContent = 'All traffic';
        } else {
          if (colTitle) colTitle.textContent = 'Remote Host';
          if (masterLabel) masterLabel.textContent = 'All hosts';
        }

        this.container.querySelector('#row-all-apps')?.classList.add('active');
        this.refreshAppsList(false);
        this.renderGraph();
      });
    }

    // Adapter filter
    const selAdapter = this.container.querySelector('#select-filter-adapter');
    if (selAdapter) {
      selAdapter.addEventListener('change', (e) => {
        this.selectedAdapter = e.target.value;
        this.refreshAppsList(false);
        this.renderGraph();
      });
    }

    // Time window select
    const selTime = this.container.querySelector('#select-time-window');
    if (selTime) {
      selTime.addEventListener('change', (e) => {
        this.selectedPeriod = e.target.value;
        this.zoomStart = 0.0;
        this.zoomEnd = 1.0;
        this.updateScrubberWindowUI();
        this.refreshAppsList(false);
        this.renderGraph();
        this.renderScrubber();
      });
    }

    // View mode buttons
    this.container.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.viewMode = btn.getAttribute('data-mode');
        this.renderGraph();
      });
    });

    // Master row: click to show all
    const rowAll = this.container.querySelector('#row-all-apps');
    if (rowAll) {
      rowAll.addEventListener('click', () => {
        this.selectedAppId = null;
        this.selectedProtoId = null;
        this.selectedHostId = null;
        this.container.querySelectorAll('.apps-table-row').forEach(r => r.classList.remove('active'));
        rowAll.classList.add('active');
        this.refreshAppsList(false);
        this.renderGraph();
        this.renderScrubber();
      });
    }

    // Resizable Splitter interaction between Left Apps Sidebar and Right Graph
    const splitter = this.container.querySelector('#traffic-splitter');
    const sidebar = this.container.querySelector('#traffic-apps-sidebar');
    if (splitter && sidebar) {
      // Restore persisted sidebar width
      try {
        const savedW = localStorage.getItem('cachywire_sidebar_width');
        if (savedW) {
          const wNum = parseInt(savedW, 10);
          if (wNum >= 220 && wNum <= 650) {
            sidebar.style.width = `${wNum}px`;
            sidebar.style.minWidth = `${wNum}px`;
          }
        }
      } catch (_) {}

      let isDragging = false;
      let startX = 0;
      let startW = 0;

      const onSplitterMouseMove = (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        const newW = Math.max(220, Math.min(650, startW + deltaX));
        sidebar.style.width = `${newW}px`;
        sidebar.style.minWidth = `${newW}px`;
      };

      const onSplitterMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        splitter.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onSplitterMouseMove);
        window.removeEventListener('mouseup', onSplitterMouseUp);
        try {
          const finalW = parseInt(sidebar.style.width, 10);
          if (finalW) localStorage.setItem('cachywire_sidebar_width', finalW);
        } catch (_) {}
        this._resizeCanvases();
        this.renderGraph();
        this.renderScrubber();
      };

      splitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startW = sidebar.getBoundingClientRect().width;
        splitter.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onSplitterMouseMove, { passive: true });
        window.addEventListener('mouseup', onSplitterMouseUp);
      });
    }

    // Horizontal Resizer Splitter between Graph Canvas and Summary/Scrubber
    const hSplitter = this.container.querySelector('#traffic-h-splitter');
    const summaryStrip = this.container.querySelector('#traffic-summary-strip');
    if (hSplitter && summaryStrip) {
      try {
        const savedH = localStorage.getItem('cachywire_summary_height');
        if (savedH) {
          const hNum = parseInt(savedH, 10);
          if (hNum >= 68 && hNum <= 150) {
            summaryStrip.style.height = `${hNum}px`;
            summaryStrip.style.minHeight = `${hNum}px`;
          }
        }
      } catch (_) {}

      hSplitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = summaryStrip.getBoundingClientRect().height;
        hSplitter.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';

        const onHMouseMove = (moveEvt) => {
          const deltaY = startY - moveEvt.clientY; // dragging up expands summary
          const newH = Math.max(68, Math.min(160, startH + deltaY));
          summaryStrip.style.height = `${newH}px`;
          summaryStrip.style.minHeight = `${newH}px`;
          this._resizeCanvases();
          this.renderGraph();
          this.renderScrubber();
        };

        const onHMouseUp = () => {
          hSplitter.classList.remove('dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onHMouseMove);
          window.removeEventListener('mouseup', onHMouseUp);
          try {
            localStorage.setItem('cachywire_summary_height', parseInt(summaryStrip.style.height, 10));
          } catch (_) {}
        };

        window.addEventListener('mousemove', onHMouseMove, { passive: true });
        window.addEventListener('mouseup', onHMouseUp);
      });

      hSplitter.addEventListener('dblclick', () => {
        summaryStrip.style.height = '74px';
        summaryStrip.style.minHeight = '74px';
        try {
          localStorage.removeItem('cachywire_summary_height');
        } catch (_) {}
        this._resizeCanvases();
        this.renderGraph();
        this.renderScrubber();
      });
    }

    // Center gauge opens Data Plan modal
    this.container.querySelector('#metric-center-gauge')?.addEventListener('click', () => {
      this.onOpenDataPlan();
    });

    const badge = this.container.querySelector('#gauge-selected-badge');
    if (badge) {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedAppId = null;
        this.selectedProtoId = null;
        this.selectedHostId = null;
        this.container.querySelectorAll('.apps-table-row').forEach(r => r.classList.remove('active'));
        this.container.querySelector('#row-all-apps')?.classList.add('active');
        this.refreshAppsList(false);
        this.renderGraph();
        this.renderScrubber();
      });
    }

    // Toggle search row
    const btnSearch = this.container.querySelector('#btn-toggle-search');
    const searchRow = this.container.querySelector('#apps-search-row');
    const searchInput = this.container.querySelector('#apps-search-input');
    const searchClear = this.container.querySelector('#apps-search-clear');

    if (btnSearch && searchRow) {
      btnSearch.addEventListener('click', () => {
        const isHidden = searchRow.style.display === 'none';
        searchRow.style.display = isHidden ? 'flex' : 'none';
        btnSearch.classList.toggle('active', isHidden);
        if (isHidden) {
          searchInput.focus();
        } else {
          searchInput.value = '';
          this.searchQuery = '';
          this.refreshAppsList(false);
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.refreshAppsList(false);
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        this.refreshAppsList(false);
        searchInput.focus();
      });
    }

    // Toggle sort order
    const btnSort = this.container.querySelector('#btn-toggle-sort');
    if (btnSort) {
      btnSort.addEventListener('click', () => {
        this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
        this.refreshAppsList(false);
      });
    }

    // Scrubber drag handlers
    this._initScrubberInteractions();

    // Double-click on scrubber resets zoom to full 100% range
    this.container.querySelector('#scrubber-wrapper')?.addEventListener('dblclick', () => {
      this.zoomStart = 0.0;
      this.zoomEnd = 1.0;
      this.updateScrubberWindowUI();
      this.renderGraph();
      this.refreshAppsList(false);
    });
  }

  _initCanvases() {
    this.canvas = this.container.querySelector('#traffic-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.scrubberCanvas = this.container.querySelector('#scrubber-canvas');
    this.scrubberCtx = this.scrubberCanvas.getContext('2d');

    const resizeObserver = new ResizeObserver(() => {
      this._resizeCanvases();
      this.renderGraph();
      this.renderScrubber();
    });

    const graphContainer = this.container.querySelector('#graph-canvas-container');
    if (graphContainer) resizeObserver.observe(graphContainer);
    const scrubberTrack = this.container.querySelector('#scrubber-track-area') || this.container.querySelector('#scrubber-wrapper');
    if (scrubberTrack) resizeObserver.observe(scrubberTrack);

    // Interactive Crosshair Hover Tooltip on Main Graph Canvas
    const tooltip = this.container.querySelector('#canvas-tooltip');
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.viewMode === 'geo' || this.lastBuckets.length === 0) {
        if (tooltip) tooltip.style.display = 'none';
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const rulerW = 72;
      const mouseX = e.clientX - rect.left;
      if (mouseX < rulerW) {
        this.hoverBucketIndex = null;
        if (tooltip) tooltip.style.display = 'none';
        this.renderGraph();
        return;
      }
      const relX = Math.max(0, Math.min(1, (mouseX - rulerW) / Math.max(1, rect.width - rulerW)));
      const idx = Math.min(this.lastBuckets.length - 1, Math.max(0, Math.round(relX * (this.lastBuckets.length - 1))));
      this.hoverBucketIndex = idx;
      this.renderGraph();

      const b = this.lastBuckets[idx];
      if (b && tooltip) {
        const dt = new Date(b.time);
        const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let appHeaderHtml = '';
        if (this.selectedAppId !== null) {
          const selApp = this.appsRepo.getById(this.selectedAppId);
          if (selApp) {
            appHeaderHtml = `<div style="color:#00D4B2;font-size:10px;font-weight:700;margin-bottom:3px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">App: ${selApp.app_name}</div>`;
          }
        }
        tooltip.style.display = 'block';
        tooltip.innerHTML = `
          ${appHeaderHtml}
          <div style="font-weight:700;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:3px;">${timeStr}</div>
          <div style="display:flex;justify-content:space-between;gap:12px;color:#00D4B2;"><span>↓ Inbound:</span><span class="mono-num">${formatBytes(b.down)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:12px;color:#FF9F43;"><span>↑ Outbound:</span><span class="mono-num">${formatBytes(b.up)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:12px;color:#94A3B8;margin-top:2px;font-size:10px;"><span>Total:</span><span class="mono-num">${formatBytes(b.down + b.up)}</span></div>
        `;
        const leftPx = Math.min(rect.width - 175, Math.max(10, e.clientX - rect.left + 12));
        const topPx = Math.min(rect.height - 110, Math.max(10, e.clientY - rect.top - 20));
        tooltip.style.left = `${leftPx}px`;
        tooltip.style.top = `${topPx}px`;
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverBucketIndex = null;
      if (tooltip) tooltip.style.display = 'none';
      this.renderGraph();
    });

    // Interactive Smooth Wheel Zoom In / Out on Graph Canvas
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));

      const currentSpan = this.zoomEnd - this.zoomStart;
      const zoomFactor = e.deltaY < 0 ? 0.82 : 1.22;
      const newSpan = Math.max(0.015, Math.min(1.0, currentSpan * zoomFactor));

      const cursorRatio = this.zoomStart + relX * currentSpan;
      let newStart = cursorRatio - relX * newSpan;
      let newEnd = newStart + newSpan;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(1.0, newSpan);
      }
      if (newEnd > 1.0) {
        newEnd = 1.0;
        newStart = Math.max(0, 1.0 - newSpan);
      }

      this.zoomStart = newStart;
      this.zoomEnd = newEnd;
      this.updateScrubberWindowUI();
      this.renderGraph();
      this.refreshAppsList(false);
      this.renderScrubber();
    }, { passive: false });

    // Double-click on chart canvas resets zoom back to 100% full view
    this.canvas.addEventListener('dblclick', () => {
      this.zoomStart = 0.0;
      this.zoomEnd = 1.0;
      this.updateScrubberWindowUI();
      this.renderGraph();
      this.refreshAppsList(false);
      this.renderScrubber();
    });

    this._resizeCanvases();
  }

  _resizeCanvases() {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.width = this.canvas.parentElement.clientWidth || 800;
      this.canvas.height = this.canvas.parentElement.clientHeight || 340;
    }
    const trackArea = this.container.querySelector('#scrubber-track-area') || (this.scrubberCanvas ? this.scrubberCanvas.parentElement : null);
    if (this.scrubberCanvas && trackArea) {
      this.scrubberCanvas.width = trackArea.clientWidth || 800;
      this.scrubberCanvas.height = 44;
    }
    this.updateScrubberWindowUI();
  }

  _getPeriodWindowMs() {
    const now = Date.now();
    if (this.selectedPeriod === '5m') return { startMs: now - 5 * 60 * 1000, endMs: now };
    if (this.selectedPeriod === '1h') return { startMs: now - 1 * 3600 * 1000, endMs: now };
    if (this.selectedPeriod === '3h') return { startMs: now - 3 * 3600 * 1000, endMs: now };
    if (this.selectedPeriod === '12h') return { startMs: now - 12 * 3600 * 1000, endMs: now };
    if (this.selectedPeriod === 'week') return { startMs: now - 7 * 86400 * 1000, endMs: now };
    if (this.selectedPeriod === 'month') return { startMs: now - 30 * 86400 * 1000, endMs: now };
    return { startMs: now - 24 * 3600 * 1000, endMs: now }; // default 24h
  }

  _getFilteredRecords() {
    const mapSize = this.db.tables.traffic_stats ? this.db.tables.traffic_stats.size : 0;
    const nowBucket = Math.floor(Date.now() / 1000);
    const cacheKey = `${this.selectedPeriod}_${this.selectedAdapter}_${mapSize}_${this.isDraggingScrubber ? 'drag' : nowBucket}`;
    if (this._cachedFilteredRecords && this._cachedFilterKey === cacheKey) {
      return this._cachedFilteredRecords;
    }

    const { startMs, endMs } = this._getPeriodWindowMs();
    const results = [];
    if (this.db.tables.traffic_stats) {
      for (const r of this.db.tables.traffic_stats.values()) {
        const ts = r.timestamp || (r.bucket_ts * 1000);
        if (!Number.isFinite(ts)) continue;
        if (ts < startMs || ts > endMs + 5000) continue;
        if (this.selectedAdapter === 'wan' && r.is_local_lan !== 0) continue;
        if (this.selectedAdapter === 'lan' && r.is_local_lan !== 1) continue;
        results.push(r);
      }
    }

    this._cachedFilterKey = cacheKey;
    this._cachedFilteredRecords = results;
    return results;
  }

  _initScrubberInteractions() {
    const trackArea = this.container.querySelector('#scrubber-track-area') || this.container.querySelector('#scrubber-wrapper');
    const win = this.container.querySelector('#scrubber-window');
    const handleL = this.container.querySelector('#handle-left');
    const handleR = this.container.querySelector('#handle-right');

    if (!trackArea || !win || !handleL || !handleR) return;

    let dragType = null;
    let startX = 0;
    let initialZoomStart = 0;
    let initialZoomEnd = 0;

    const onMouseDown = (e, type) => {
      e.stopPropagation();
      e.preventDefault();
      dragType = type;
      this.isDraggingScrubber = true;
      startX = e.clientX;
      initialZoomStart = this.zoomStart;
      initialZoomEnd = this.zoomEnd;
      document.addEventListener('mousemove', onMouseMove, { passive: true });
      document.addEventListener('mouseup', onMouseUp);
      window.addEventListener('blur', onMouseUp);
    };

    handleL.addEventListener('mousedown', (e) => onMouseDown(e, 'left'));
    handleR.addEventListener('mousedown', (e) => onMouseDown(e, 'right'));
    win.addEventListener('mousedown', (e) => onMouseDown(e, 'window'));

    const onMouseMove = (e) => {
      if (!dragType) return;
      const rect = trackArea.getBoundingClientRect();
      const deltaX = (e.clientX - startX) / Math.max(1, rect.width);

      if (dragType === 'left') {
        this.zoomStart = Math.max(0, Math.min(initialZoomStart + deltaX, this.zoomEnd - 0.05));
      } else if (dragType === 'right') {
        this.zoomEnd = Math.min(1.0, Math.max(initialZoomEnd + deltaX, this.zoomStart + 0.05));
      } else if (dragType === 'window') {
        const windowSpan = Math.max(0.05, initialZoomEnd - initialZoomStart);
        let newStart = initialZoomStart + deltaX;
        let newEnd = newStart + windowSpan;
        if (newStart < 0) { newStart = 0; newEnd = windowSpan; }
        if (newEnd > 1.0) { newEnd = 1.0; newStart = Math.max(0, 1.0 - windowSpan); }
        this.zoomStart = newStart;
        this.zoomEnd = newEnd;
      }

      this.updateScrubberWindowUI();
      if (!this.scrubberRafPending) {
        this.scrubberRafPending = true;
        requestAnimationFrame(() => {
          this.scrubberRafPending = false;
          this.renderGraph();
        });
      }
    };

    const onMouseUp = () => {
      if (!dragType) return;
      dragType = null;
      this.isDraggingScrubber = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onMouseUp);
      this.renderGraph();
      this.refreshAppsList(false);
    };
  }

  updateScrubberWindowUI() {
    const win = this.container.querySelector('#scrubber-window');
    if (!win) return;
    const leftPercent = (this.zoomStart * 100).toFixed(2);
    const widthPercent = ((this.zoomEnd - this.zoomStart) * 100).toFixed(2);
    win.style.left = `${leftPercent}%`;
    win.style.width = `${widthPercent}%`;
  }

  refreshAppsList(isLiveUpdate = false) {
    const listBody = this.container.querySelector('#apps-list-body');
    if (!listBody) return;

    const filteredStats = this._getFilteredRecords();

    let totalDown = 0;
    let totalUp = 0;
    let wanTotal = 0;
    let lanTotal = 0;

    const appStats = new Map();
    const protoStats = new Map();
    const hostStats = new Map();

    filteredStats.forEach(r => {
      const bIn = r.bytes_in || 0;
      const bOut = r.bytes_out || 0;
      const bTot = bIn + bOut;

      totalDown += bIn;
      totalUp += bOut;
      if (r.is_local_lan) lanTotal += bTot;
      else wanTotal += bTot;

      const aCurr = appStats.get(r.app_id) || { down: 0, up: 0, total: 0 };
      aCurr.down += bIn; aCurr.up += bOut; aCurr.total += bTot;
      appStats.set(r.app_id, aCurr);

      const pCurr = protoStats.get(r.proto_id) || { down: 0, up: 0, total: 0 };
      pCurr.down += bIn; pCurr.up += bOut; pCurr.total += bTot;
      protoStats.set(r.proto_id, pCurr);

      const hCurr = hostStats.get(r.host_id) || { down: 0, up: 0, total: 0 };
      hCurr.down += bIn; hCurr.up += bOut; hCurr.total += bTot;
      hostStats.set(r.host_id, hCurr);
    });

    // Calculate display metrics for the middle summary banner & arc gauge
    // If an app, protocol, or host is selected, display ONLY that item's metrics!
    let displayDown = totalDown;
    let displayUp = totalUp;
    let displayWan = wanTotal;
    let displayLan = lanTotal;

    if (this.selectedAppId !== null) {
      const a = appStats.get(this.selectedAppId) || { down: 0, up: 0, total: 0 };
      displayDown = a.down;
      displayUp = a.up;
      let aWan = 0, aLan = 0;
      filteredStats.forEach(r => {
        if (r.app_id === this.selectedAppId) {
          const bTot = (r.bytes_in || 0) + (r.bytes_out || 0);
          if (r.is_local_lan) aLan += bTot;
          else aWan += bTot;
        }
      });
      displayWan = aWan;
      displayLan = aLan;
    } else if (this.selectedProtoId !== null) {
      const p = protoStats.get(this.selectedProtoId) || { down: 0, up: 0, total: 0 };
      displayDown = p.down;
      displayUp = p.up;
      let pWan = 0, pLan = 0;
      filteredStats.forEach(r => {
        if (r.proto_id === this.selectedProtoId) {
          const bTot = (r.bytes_in || 0) + (r.bytes_out || 0);
          if (r.is_local_lan) pLan += bTot;
          else pWan += bTot;
        }
      });
      displayWan = pWan;
      displayLan = pLan;
    } else if (this.selectedHostId !== null) {
      const h = hostStats.get(this.selectedHostId) || { down: 0, up: 0, total: 0 };
      displayDown = h.down;
      displayUp = h.up;
      displayWan = h.down + h.up;
      displayLan = 0;
    }

    // Update master row in sidebar
    const elTotalDown = this.container.querySelector('#total-down-bytes');
    const elTotalUp = this.container.querySelector('#total-up-bytes');
    if (elTotalDown) elTotalDown.textContent = formatBytes(totalDown);
    if (elTotalUp) elTotalUp.textContent = formatBytes(totalUp);

    const masterSpeedInEl = this.container.querySelector('#master-speed-in');
    const masterSpeedOutEl = this.container.querySelector('#master-speed-out');
    let totSpeedIn = 0, totSpeedOut = 0;
    if (this.appLiveRates && this.appLiveRates.size > 0) {
      for (const s of this.appLiveRates.values()) {
        totSpeedIn += s.in || 0;
        totSpeedOut += s.out || 0;
      }
    }
    if (totSpeedIn === 0 && this._lastSystemIn) totSpeedIn = this._lastSystemIn;
    if (totSpeedOut === 0 && this._lastSystemOut) totSpeedOut = this._lastSystemOut;
    if (masterSpeedInEl) masterSpeedInEl.textContent = formatSpeed(totSpeedIn);
    if (masterSpeedOutEl) masterSpeedOutEl.textContent = formatSpeed(totSpeedOut);

    const masterRow = this.container.querySelector('#row-all-apps');
    if (masterRow) {
      const isAllSelected = this.selectedAppId === null && this.selectedProtoId === null && this.selectedHostId === null;
      masterRow.classList.toggle('active', isAllSelected);
    }

    // Update gauge target badge in dedicated footer slot (stable position, no layout shifting)
    const gaugeTargetBadge = this.container.querySelector('#gauge-selected-badge');
    const badgeLabel = gaugeTargetBadge ? gaugeTargetBadge.querySelector('.badge-label') : null;
    const badgeClear = gaugeTargetBadge ? gaugeTargetBadge.querySelector('.badge-clear') : null;

    if (this.selectedAppId !== null) {
      const selApp = this.appsRepo.getById(this.selectedAppId);
      const appName = selApp ? selApp.app_name : 'Selected App';
      if (gaugeTargetBadge) {
        gaugeTargetBadge.classList.add('filtering');
        if (badgeLabel) { badgeLabel.textContent = appName; badgeLabel.title = appName; }
        if (badgeClear) badgeClear.style.display = 'inline-block';
      }
    } else if (this.selectedProtoId !== null) {
      const selProto = this.db.getTrafficTypeById(this.selectedProtoId);
      const protoName = selProto ? selProto.service_name : 'Protocol';
      if (gaugeTargetBadge) {
        gaugeTargetBadge.classList.add('filtering');
        if (badgeLabel) { badgeLabel.textContent = protoName; badgeLabel.title = protoName; }
        if (badgeClear) badgeClear.style.display = 'inline-block';
      }
    } else if (this.selectedHostId !== null) {
      const selHost = this.hostsRepo.getById(this.selectedHostId);
      const hostName = selHost ? (selHost.host_name || selHost.ip_address) : 'Host';
      if (gaugeTargetBadge) {
        gaugeTargetBadge.classList.add('filtering');
        if (badgeLabel) { badgeLabel.textContent = hostName; badgeLabel.title = hostName; }
        if (badgeClear) badgeClear.style.display = 'inline-block';
      }
    } else {
      if (gaugeTargetBadge) {
        gaugeTargetBadge.classList.remove('filtering');
        if (badgeLabel) { badgeLabel.textContent = 'TOTAL TRAFFIC'; badgeLabel.title = 'Total Traffic'; }
        if (badgeClear) badgeClear.style.display = 'none';
      }
    }

    // Update summary banner & semi-oval gauge with the filtered values
    const bDownTot = this.container.querySelector('#banner-down-total');
    const bUpTot = this.container.querySelector('#banner-up-total');
    const bGauge = this.container.querySelector('#banner-gauge-total');
    const bWan = this.container.querySelector('#banner-wan-val');
    const bLan = this.container.querySelector('#banner-lan-val');
    const bWanBar = this.container.querySelector('#banner-wan-bar');

    if (bDownTot) bDownTot.textContent = formatBytes(displayDown);
    if (bUpTot) bUpTot.textContent = formatBytes(displayUp);
    if (bGauge) bGauge.textContent = formatBytes(displayDown + displayUp);
    if (bWan) bWan.textContent = formatBytes(displayWan);
    if (bLan) bLan.textContent = formatBytes(displayLan);
    if (bWanBar) {
      const wanPct = (displayWan + displayLan) > 0 ? Math.max(5, Math.min(100, Math.round((displayWan / (displayWan + displayLan)) * 100))) : 98;
      bWanBar.style.width = `${wanPct}%`;
    }

    // Dynamically update semi-oval arc & dual split bar proportions
    const combinedBytes = displayDown + displayUp;
    const downRatio = combinedBytes > 0 ? Math.max(0.04, Math.min(0.96, displayDown / combinedBytes)) : 0.5;
    const downPct = Math.round(downRatio * 100);
    const upPct = 100 - downPct;

    const elArcDown = this.container.querySelector('#gauge-arc-down');
    const elArcUp = this.container.querySelector('#gauge-arc-up');
    const elPctDown = this.container.querySelector('#gauge-pct-down');
    const elPctUp = this.container.querySelector('#gauge-pct-up');
    const elBarDown = this.container.querySelector('#gauge-bar-down');
    const elBarUp = this.container.querySelector('#gauge-bar-up');

    if (elArcDown) {
      elArcDown.setAttribute('stroke-dasharray', `${downPct} 100`);
      elArcDown.setAttribute('stroke-dashoffset', '0');
    }
    if (elArcUp) {
      elArcUp.setAttribute('stroke-dasharray', `${upPct} 100`);
      elArcUp.setAttribute('stroke-dashoffset', `-${downPct}`);
    }
    if (elPctDown) elPctDown.textContent = `↓ ${downPct}%`;
    if (elPctUp) elPctUp.textContent = `${upPct}% ↑`;
    if (elBarDown) elBarDown.style.width = `${downPct}%`;
    if (elBarUp) elBarUp.style.width = `${upPct}%`;

    // When doing live 1Hz update, update existing rows in-place to PREVENT jitter & jumping!
    if (isLiveUpdate && listBody.children.length > 0) {
      if (this.sidebarType === 'apps') {
        const apps = this.appsRepo.getAll();
        apps.forEach(app => {
          const stat = appStats.get(app.app_id) || { down: 0, up: 0, total: 0 };
          const row = listBody.querySelector(`[data-app-id="${app.app_id}"]`);
          const rateInfo = this.appLiveRates ? this.appLiveRates.get(app.app_id) : null;
          const curIn = rateInfo ? rateInfo.in : 0;
          const curOut = rateInfo ? rateInfo.out : 0;
          const hasLive = (curIn > 0 || curOut > 0);

          if (row) {
            const speedEl = row.querySelector('.col-speed');
            const downEl = row.querySelector('.col-down');
            const upEl = row.querySelector('.col-up');
            if (speedEl) {
              speedEl.className = `col-speed mono-num ${hasLive ? 'live' : ''}`;
              speedEl.innerHTML = `
                <span class="speed-sub-row speed-out"><span style="color:#FF9F43;font-size:9px;margin-right:2px;">↑</span>${formatSpeed(curOut)}</span>
                <span class="speed-sub-row speed-in"><span style="color:#00D4B2;font-size:9px;margin-right:2px;">↓</span>${formatSpeed(curIn)}</span>
              `;
            }
            if (downEl) downEl.textContent = formatBytes(stat.down);
            if (upEl) upEl.textContent = formatBytes(stat.up);
          } else if (stat.total > 0 || hasLive) {
            const newRow = document.createElement('div');
            newRow.className = `apps-table-row ${this.selectedAppId === app.app_id ? 'active' : ''}`;
            newRow.setAttribute('data-app-id', String(app.app_id));
            const iconSvg = getAppIconSvg(app.app_name, app.exe_path);
            newRow.innerHTML = `
              <div class="app-info-cell">
                <div class="app-vector-icon">${iconSvg}</div>
                <span class="app-label" title="Click to filter chart | Double-click for details: ${esc(app.exe_path || '')}">${esc(app.app_name)}</span>
              </div>
              <div class="col-speed mono-num ${hasLive ? 'live' : ''}">
                <span class="speed-sub-row speed-out"><span style="color:#FF9F43;font-size:9px;margin-right:2px;">↑</span>${formatSpeed(curOut)}</span>
                <span class="speed-sub-row speed-in"><span style="color:#00D4B2;font-size:9px;margin-right:2px;">↓</span>${formatSpeed(curIn)}</span>
              </div>
              <span class="col-down mono-num">${formatBytes(stat.down)}</span>
              <span class="col-up mono-num">${formatBytes(stat.up)}</span>
            `;
            newRow.addEventListener('click', () => {
              this.selectedAppId = (this.selectedAppId === app.app_id) ? null : app.app_id;
              this.refreshAppsList(false);
              this.renderGraph();
              this.renderScrubber();
            });
            newRow.addEventListener('dblclick', (e) => {
              e.stopPropagation();
              this.onAppClick(app);
            });
            listBody.appendChild(newRow);
          }
        });
        return;
      }
    }

    listBody.innerHTML = '';

    if (this.sidebarType === 'apps') {
      let apps = this.appsRepo.getAll();
      if (window.gwApp && window.gwApp.settings && window.gwApp.settings.hideIdleApps) {
        apps = apps.filter(a => (appStats.get(a.app_id)?.total || 0) > 0);
      }
      apps.sort((a, b) => {
        const aBytes = appStats.get(a.app_id)?.total || 0;
        const bBytes = appStats.get(b.app_id)?.total || 0;
        return this.sortOrder === 'desc' ? bBytes - aBytes : aBytes - bBytes;
      });
      if (this.searchQuery) {
        apps = apps.filter(a => a.app_name.toLowerCase().includes(this.searchQuery));
      }

      apps.forEach(app => {
        const stat = appStats.get(app.app_id) || { down: 0, up: 0, total: 0 };
        const row = document.createElement('div');
        row.className = `apps-table-row ${this.selectedAppId === app.app_id ? 'active' : ''}`;
        row.setAttribute('data-app-id', String(app.app_id));
        const iconSvg = getAppIconSvg(app.app_name, app.exe_path);

        const rateInfo = this.appLiveRates ? this.appLiveRates.get(app.app_id) : null;
        const curIn = rateInfo ? rateInfo.in : 0;
        const curOut = rateInfo ? rateInfo.out : 0;
        const hasLive = (curIn > 0 || curOut > 0);

        row.innerHTML = `
          <div class="app-info-cell">
            <div class="app-vector-icon">${iconSvg}</div>
            <span class="app-label" title="Click to filter chart | Double-click for details: ${esc(app.exe_path || '')}">${esc(app.app_name)}</span>
          </div>
          <div class="col-speed mono-num ${hasLive ? 'live' : ''}">
            <span class="speed-sub-row speed-out"><span style="color:#FF9F43;font-size:9px;margin-right:2px;">↑</span>${formatSpeed(curOut)}</span>
            <span class="speed-sub-row speed-in"><span style="color:#00D4B2;font-size:9px;margin-right:2px;">↓</span>${formatSpeed(curIn)}</span>
          </div>
          <span class="col-down mono-num">${formatBytes(stat.down)}</span>
          <span class="col-up mono-num">${formatBytes(stat.up)}</span>
        `;

        row.addEventListener('click', () => {
          this.selectedAppId = (this.selectedAppId === app.app_id) ? null : app.app_id;
          this.refreshAppsList(false);
          this.renderGraph();
          this.renderScrubber();
        });

        row.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.onAppClick(app);
        });

        listBody.appendChild(row);
      });
    } else if (this.sidebarType === 'traffic') {
      let protos = this.db.getAllTrafficTypes();
      protos.sort((a, b) => {
        const aBytes = protoStats.get(a.proto_id)?.total || 0;
        const bBytes = protoStats.get(b.proto_id)?.total || 0;
        return this.sortOrder === 'desc' ? bBytes - aBytes : aBytes - bBytes;
      });
      if (this.searchQuery) {
        protos = protos.filter(p => p.service_name.toLowerCase().includes(this.searchQuery));
      }

      protos.forEach(proto => {
        const stat = protoStats.get(proto.proto_id) || { down: 0, up: 0, total: 0 };
        const row = document.createElement('div');
        row.className = `apps-table-row ${this.selectedProtoId === proto.proto_id ? 'active' : ''}`;
        row.innerHTML = `
          <div class="app-info-cell">
            <span style="font-weight:700;color:var(--gw-accent);width:20px;text-align:center;">#</span>
            <span class="app-label">${proto.service_name}</span>
          </div>
          <div class="col-speed mono-num">-</div>
          <span class="col-down mono-num">${formatBytes(stat.down)}</span>
          <span class="col-up mono-num">${formatBytes(stat.up)}</span>
        `;
        row.addEventListener('click', () => {
          this.selectedProtoId = (this.selectedProtoId === proto.proto_id) ? null : proto.proto_id;
          this.refreshAppsList(false);
          this.renderGraph();
          this.renderScrubber();
        });
        listBody.appendChild(row);
      });
    } else if (this.sidebarType === 'hosts') {
      let hosts = this.hostsRepo.getAll();
      hosts.sort((a, b) => {
        const aBytes = hostStats.get(a.host_id)?.total || 0;
        const bBytes = hostStats.get(b.host_id)?.total || 0;
        return this.sortOrder === 'desc' ? bBytes - aBytes : aBytes - bBytes;
      });
      if (this.searchQuery) {
        hosts = hosts.filter(h =>
          (h.domain_name && h.domain_name.toLowerCase().includes(this.searchQuery)) ||
          h.ip_address.includes(this.searchQuery)
        );
      }

      hosts.forEach(host => {
        const stat = hostStats.get(host.host_id) || { down: 0, up: 0, total: 0 };
        const geo = lookupGeoIp(host.ip_address);
        const row = document.createElement('div');
        row.className = `apps-table-row ${this.selectedHostId === host.host_id ? 'active' : ''}`;
        row.innerHTML = `
          <div class="app-info-cell">
            <span class="host-flag-icon">${geo.flag}</span>
            <span class="app-label" title="${host.ip_address}">${host.domain_name || host.ip_address}</span>
          </div>
          <div class="col-speed mono-num">-</div>
          <span class="col-down mono-num">${formatBytes(stat.down)}</span>
          <span class="col-up mono-num">${formatBytes(stat.up)}</span>
        `;
        row.addEventListener('click', () => {
          this.selectedHostId = (this.selectedHostId === host.host_id) ? null : host.host_id;
          this.refreshAppsList(false);
          this.renderGraph();
          this.renderScrubber();
        });
        row.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.onHostClick(host);
        });
        listBody.appendChild(row);
      });
    }
  }

  renderGraph() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    let records = this._getFilteredRecords();
    if (this.selectedAppId !== null) {
      records = records.filter(r => r.app_id === this.selectedAppId);
    }
    if (this.selectedProtoId !== null) {
      records = records.filter(r => r.proto_id === this.selectedProtoId);
    }
    if (this.selectedHostId !== null) {
      records = records.filter(r => r.host_id === this.selectedHostId);
    }

    // If Geo Mode is active, render Geographic Country Breakdown Canvas
    if (this.viewMode === 'geo') {
      this._renderGeoView(ctx, w, h, records);
      return;
    }

    records.sort((a, b) => (a.timestamp || a.bucket_ts * 1000) - (b.timestamp || b.bucket_ts * 1000));

    const { startMs: periodStart, endMs: periodEnd } = this._getPeriodWindowMs();
    const minTime = records.length > 0 ? Math.min(periodStart, records[0].timestamp || (records[0].bucket_ts * 1000)) : periodStart;
    const maxTime = records.length > 0 ? Math.max(periodEnd, records[records.length - 1].timestamp || (records[records.length - 1].bucket_ts * 1000)) : periodEnd;
    const totalTimeSpan = Math.max(maxTime - minTime, 60000);

    const visibleStart = minTime + (totalTimeSpan * this.zoomStart);
    const visibleEnd = minTime + (totalTimeSpan * this.zoomEnd);
    const visibleSpan = Math.max(visibleEnd - visibleStart, 10000);

    const visibleRecords = records.filter(r => {
      const ts = r.timestamp || (r.bucket_ts * 1000);
      return ts >= visibleStart && ts <= visibleEnd;
    });

    const numBuckets = 60;
    const bucketDuration = Math.max(1, visibleSpan / numBuckets);
    const buckets = new Array(numBuckets);
    for (let i = 0; i < numBuckets; i++) {
      const bStart = visibleStart + (i * bucketDuration);
      buckets[i] = { time: bStart + (bucketDuration / 2), down: 0, up: 0 };
    }

    for (let j = 0; j < visibleRecords.length; j++) {
      const r = visibleRecords[j];
      const ts = r.timestamp || (r.bucket_ts * 1000);
      const idx = Math.min(numBuckets - 1, Math.max(0, Math.floor((ts - visibleStart) / bucketDuration)));
      buckets[idx].down += (r.bytes_in || 0);
      buckets[idx].up += (r.bytes_out || 0);
    }

    this.lastBuckets = buckets;

    let maxBytes = 64 * 1024; // 64 KB minimum scale for crisp live sensitivity
    buckets.forEach(b => {
      if (b.down > maxBytes) maxBytes = b.down;
      if (b.up > maxBytes) maxBytes = b.up;
    });
    maxBytes = maxBytes * 1.25;

    const rulerW = 72;
    const bucketDurationSec = Math.max(0.1, bucketDuration / 1000);
    const peakRate = maxBytes / bucketDurationSec;

    const labelScale = this.container.querySelector('#label-max-scale');
    if (labelScale) labelScale.textContent = formatSpeed(peakRate);

    // 1. Draw subtle horizontal & vertical time gridlines
    const numGridLines = 5;
    const isDarkTheme = !document.body.classList.contains('theme-light');
    ctx.lineWidth = 1;
    ctx.font = '600 11px "JetBrains Mono", monospace';

    // Vertical time grid lines
    for (let g = 0; g <= numGridLines; g++) {
      const gx = rulerW + ((w - rulerW) / numGridLines) * g;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h - 26);
      ctx.strokeStyle = isDarkTheme ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.22)';
      ctx.stroke();

      const gTime = new Date(visibleStart + (visibleSpan / numGridLines) * g);
      const timeStr = gTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      ctx.fillStyle = isDarkTheme ? '#CBD5E1' : '#475569';
      ctx.fillText(`${timeStr}`, gx + 8, h - 9);
    }

    // 2. Speed Ruler on the Left Margin
    ctx.fillStyle = isDarkTheme ? 'rgba(15, 23, 42, 0.88)' : 'rgba(241, 245, 249, 0.92)';
    ctx.fillRect(0, 0, rulerW, h - 26);

    ctx.beginPath();
    ctx.moveTo(rulerW, 0);
    ctx.lineTo(rulerW, h - 26);
    ctx.strokeStyle = isDarkTheme ? 'rgba(148, 163, 184, 0.32)' : 'rgba(148, 163, 184, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const speedTicks = [
      { ratio: 1.0, y: 16 },
      { ratio: 0.75, y: 16 + (h - 42) * 0.25 },
      { ratio: 0.50, y: 16 + (h - 42) * 0.50 },
      { ratio: 0.25, y: 16 + (h - 42) * 0.75 },
      { ratio: 0.0, y: h - 26 }
    ];

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px "JetBrains Mono", monospace';

    for (const t of speedTicks) {
      const val = peakRate * t.ratio;
      const label = t.ratio === 0 ? '0 B/s' : formatSpeed(val);

      // Horizontal grid line extending across the chart
      ctx.beginPath();
      ctx.moveTo(rulerW, t.y);
      ctx.lineTo(w, t.y);
      ctx.strokeStyle = isDarkTheme ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Tick mark on the ruler
      ctx.beginPath();
      ctx.moveTo(rulerW - 6, t.y);
      ctx.lineTo(rulerW, t.y);
      ctx.strokeStyle = isDarkTheme ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Speed unit text
      ctx.fillStyle = t.ratio === 1.0 ? '#00D4B2' : (isDarkTheme ? '#94A3B8' : '#475569');
      ctx.fillText(label, rulerW - 8, t.y);
    }

    // Minor tick marks
    const minorRatios = [0.875, 0.625, 0.375, 0.125];
    for (const mr of minorRatios) {
      const my = 16 + (h - 42) * (1 - mr);
      ctx.beginPath();
      ctx.moveTo(rulerW - 3, my);
      ctx.lineTo(rulerW, my);
      ctx.strokeStyle = isDarkTheme ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (this.viewMode === 'bar') {
      const groupW = (w - rulerW) / buckets.length;
      const barW = Math.max(2, (groupW - 4) / 2);
      for (let i = 0; i < buckets.length; i++) {
        const gx = rulerW + i * groupW + 2;
        const downH = (buckets[i].down / maxBytes) * (h - 42);
        const upH = (buckets[i].up / maxBytes) * (h - 42);

        ctx.fillStyle = '#00D4B2';
        ctx.fillRect(gx, (h - 26) - downH, barW, downH);

        ctx.fillStyle = '#FF9F43';
        ctx.fillRect(gx + barW + 1, (h - 26) - upH, barW, upH);
      }
    } else {
      // Authentic CachyWire Wave Area Curve Mode (Turquoise-Teal Download + Warm Amber Upload)
      const downGradient = ctx.createLinearGradient(0, 0, 0, h - 26);
      downGradient.addColorStop(0, 'rgba(0, 212, 178, 0.54)');
      downGradient.addColorStop(0.65, 'rgba(0, 212, 178, 0.18)');
      downGradient.addColorStop(1, 'rgba(0, 212, 178, 0.01)');

      ctx.beginPath();
      ctx.moveTo(rulerW, h - 26);

      for (let i = 0; i < buckets.length; i++) {
        const bx = rulerW + (i / (buckets.length - 1)) * (w - rulerW);
        const by = (h - 26) - ((buckets[i].down / maxBytes) * (h - 42));

        if (i === 0) {
          ctx.lineTo(bx, by);
        } else {
          const prevX = rulerW + ((i - 1) / (buckets.length - 1)) * (w - rulerW);
          const prevY = (h - 26) - ((buckets[i - 1].down / maxBytes) * (h - 42));
          const cpx = (prevX + bx) / 2;
          ctx.bezierCurveTo(cpx, prevY, cpx, by, bx, by);
        }
      }

      ctx.lineTo(w, h - 26);
      ctx.lineTo(rulerW, h - 26);
      ctx.closePath();
      ctx.fillStyle = downGradient;
      ctx.fill();

      // Signature Turquoise-Teal top stroke for Download
      ctx.beginPath();
      for (let i = 0; i < buckets.length; i++) {
        const bx = rulerW + (i / (buckets.length - 1)) * (w - rulerW);
        const by = (h - 26) - ((buckets[i].down / maxBytes) * (h - 42));
        if (i === 0) ctx.moveTo(bx, by);
        else {
          const prevX = rulerW + ((i - 1) / (buckets.length - 1)) * (w - rulerW);
          const prevY = (h - 26) - ((buckets[i - 1].down / maxBytes) * (h - 42));
          const cpx = (prevX + bx) / 2;
          ctx.bezierCurveTo(cpx, prevY, cpx, by, bx, by);
        }
      }
      ctx.strokeStyle = '#00D4B2';
      ctx.lineWidth = 2.3;
      ctx.stroke();

      // Warm Amber-Orange Area + Stroke for Upload
      const upGradient = ctx.createLinearGradient(0, 0, 0, h - 26);
      upGradient.addColorStop(0, 'rgba(255, 159, 67, 0.50)');
      upGradient.addColorStop(0.7, 'rgba(255, 159, 67, 0.15)');
      upGradient.addColorStop(1, 'rgba(255, 159, 67, 0.01)');

      ctx.beginPath();
      ctx.moveTo(rulerW, h - 26);

      for (let i = 0; i < buckets.length; i++) {
        const bx = rulerW + (i / (buckets.length - 1)) * (w - rulerW);
        const by = (h - 26) - ((buckets[i].up / maxBytes) * (h - 42));

        if (i === 0) {
          ctx.lineTo(bx, by);
        } else {
          const prevX = rulerW + ((i - 1) / (buckets.length - 1)) * (w - rulerW);
          const prevY = (h - 26) - ((buckets[i - 1].up / maxBytes) * (h - 42));
          const cpx = (prevX + bx) / 2;
          ctx.bezierCurveTo(cpx, prevY, cpx, by, bx, by);
        }
      }

      ctx.lineTo(w, h - 26);
      ctx.lineTo(rulerW, h - 26);
      ctx.closePath();
      ctx.fillStyle = upGradient;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < buckets.length; i++) {
        const bx = rulerW + (i / (buckets.length - 1)) * (w - rulerW);
        const by = (h - 26) - ((buckets[i].up / maxBytes) * (h - 42));
        if (i === 0) ctx.moveTo(bx, by);
        else {
          const prevX = rulerW + ((i - 1) / (buckets.length - 1)) * (w - rulerW);
          const prevY = (h - 26) - ((buckets[i - 1].up / maxBytes) * (h - 42));
          const cpx = (prevX + bx) / 2;
          ctx.bezierCurveTo(cpx, prevY, cpx, by, bx, by);
        }
      }
      ctx.strokeStyle = '#FF9F43';
      ctx.lineWidth = 2.1;
      ctx.stroke();
    }

    // Draw interactive crosshair when hovering
    if (this.hoverBucketIndex !== null && buckets[this.hoverBucketIndex]) {
      const idx = this.hoverBucketIndex;
      const cx = rulerW + (idx / Math.max(1, buckets.length - 1)) * (w - rulerW);
      const downY = (h - 26) - ((buckets[idx].down / maxBytes) * (h - 42));
      const upY = (h - 26) - ((buckets[idx].up / maxBytes) * (h - 42));

      ctx.save();
      ctx.strokeStyle = '#00D4B2';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h - 26);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = '#00D4B2';
      ctx.beginPath();
      ctx.arc(cx, downY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FF9F43';
      ctx.beginPath();
      ctx.arc(cx, upY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _renderGeoView(ctx, w, h, records) {
    const isDarkTheme = !document.body.classList.contains('theme-light');
    const countryTotals = new Map();
    records.forEach(r => {
      const host = this.hostsRepo.getById(r.host_id);
      const geo = lookupGeoIp(host ? host.ip_address : '142.250.185.14');
      const key = geo.country;
      const curr = countryTotals.get(key) || { flag: geo.flag, iso2: geo.iso2, down: 0, up: 0, total: 0 };
      curr.down += (r.bytes_in || 0);
      curr.up += (r.bytes_out || 0);
      curr.total += ((r.bytes_in || 0) + (r.bytes_out || 0));
      countryTotals.set(key, curr);
    });

    const sorted = Array.from(countryTotals.entries()).sort((a, b) => b[1].total - a[1].total);
    const maxTotal = sorted.length > 0 ? Math.max(1, sorted[0][1].total) : 1;

    ctx.fillStyle = isDarkTheme ? '#94A3B8' : '#64748B';
    ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Global Network Traffic Distribution by Country (GeoIP)', 24, 32);

    let y = 62;
    for (const [country, data] of sorted.slice(0, 7)) {
      const barMaxW = Math.max(120, w - 340);
      const barW = Math.max(8, (data.total / maxTotal) * barMaxW);

      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = isDarkTheme ? '#F8FAFC' : '#1E293B';
      ctx.fillText(`${data.flag}  ${country} (${data.iso2})`, 24, y + 15);

      ctx.fillStyle = isDarkTheme ? 'rgba(148,163,184,0.12)' : '#E2E8F0';
      ctx.fillRect(220, y + 2, barMaxW, 18);

      const grad = ctx.createLinearGradient(220, 0, 220 + barW, 0);
      grad.addColorStop(0, '#00D4B2');
      grad.addColorStop(1, '#FF9F43');
      ctx.fillStyle = grad;
      ctx.fillRect(220, y + 2, barW, 18);

      ctx.fillStyle = isDarkTheme ? '#00D4B2' : '#00A88F';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillText(formatBytes(data.total), 230 + barMaxW, y + 15);

      y += 36;
    }
  }

  renderScrubber() {
    if (!this.scrubberCanvas || !this.scrubberCtx) return;
    const ctx = this.scrubberCtx;
    const w = this.scrubberCanvas.width;
    const h = this.scrubberCanvas.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    // Update scrubber time ticks dynamically
    const ticksEl = this.container.querySelector('#scrubber-ticks');
    if (ticksEl) {
      const { startMs, endMs } = this._getPeriodWindowMs();
      const span = endMs - startMs;
      const labels = [];
      for (let i = 0; i < 10; i++) {
        const dt = new Date(startMs + (span * (i / 9)));
        labels.push(`<span>${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`);
      }
      ticksEl.innerHTML = labels.join('');
    }

    let records = this._getFilteredRecords();
    if (this.selectedAppId !== null) {
      records = records.filter(r => r.app_id === this.selectedAppId);
    }
    if (this.selectedProtoId !== null) {
      records = records.filter(r => r.proto_id === this.selectedProtoId);
    }
    if (this.selectedHostId !== null) {
      records = records.filter(r => r.host_id === this.selectedHostId);
    }
    records.sort((a, b) => (a.timestamp || a.bucket_ts * 1000) - (b.timestamp || b.bucket_ts * 1000));
    if (records.length === 0) return;

    const numPoints = 72;
    const step = Math.max(1, Math.floor(records.length / numPoints));
    let maxVal = 64 * 1024;
    for (let i = 0; i < records.length; i += step) {
      const v = (records[i].bytes_in || 0) + (records[i].bytes_out || 0);
      if (v > maxVal) maxVal = v;
    }

    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let i = 0; i < records.length; i += step) {
      const x = (i / Math.max(1, records.length - 1)) * w;
      const y = h - (((records[i].bytes_in || 0) + (records[i].bytes_out || 0)) / maxVal * (h - 6));
      ctx.lineTo(x, y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 212, 178, 0.24)';
    ctx.fill();
    ctx.strokeStyle = '#00D4B2';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  pushRealtimeSample(sample) {
    if (sample && sample.appRates) {
      this.appLiveRates = sample.appRates;
    }
    this._lastSystemIn = sample ? (sample.bytes_in || 0) : 0;
    this._lastSystemOut = sample ? (sample.bytes_out || 0) : 0;

    const downSpeedEl = this.container.querySelector('#banner-down-speed');
    const upSpeedEl = this.container.querySelector('#banner-up-speed');

    let liveDown = sample ? (sample.bytes_in || 0) : 0;
    let liveUp = sample ? (sample.bytes_out || 0) : 0;

    if (this.selectedAppId !== null && this.appLiveRates) {
      const aRate = this.appLiveRates.get(this.selectedAppId);
      liveDown = aRate ? (aRate.in || 0) : 0;
      liveUp = aRate ? (aRate.out || 0) : 0;
    }

    if (downSpeedEl) {
      downSpeedEl.innerHTML = `<span style="color: #00D4B2;">↓</span> ${formatSpeed(liveDown)}`;
    }
    if (upSpeedEl) {
      upSpeedEl.innerHTML = `<span style="color: #FF9F43;">↑</span> ${formatSpeed(liveUp)}`;
    }

    // Do not interrupt active timeline scrubber dragging
    if (this.isDraggingScrubber) return;

    this.refreshAppsList(true);
    this.renderGraph();
    this.renderScrubber();
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }
}
