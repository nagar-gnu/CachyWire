# CachyWire 0.1.0-alpha — Comprehensive Software Architecture & Traceability Document

## 1. Executive Summary & Team Statement
This document defines the production engineering architecture for the complete reconstruction of **CachyWire (Version 3.11.1164)**, authored jointly by the software engineering team:
- **Senior Software Architect**: Architecture, privilege separation, SQLite time-series schema, IPC protocol.
- **Senior Frontend Developer**: Modular ES Modules application architecture, canvas graph rendering, component breakdown.
- **Backend / Local Database Developer**: 6-table SQLite schema, downsampling rollups, CRUD operations, transactions, and backup.
- **UI/UX Engineer**: 100% pixel-accurate replication of CachyWire 0.1.0-alpha Dark/Light design tokens, typography, layouts, and animations.
- **Software QA Engineer**: Verification of all 15 core functions, 12 screen inventory items, and 9 operational test scenarios.

---

## 2. Technical Evaluation: Realm vs. SQLite 3
The prompt requested checking the viability of Realm Database versus local storage solutions:
1. **Realm SDK Current State (2024–2026)**:
   - MongoDB officially announced the deprecation of Realm Device Sync in September 2024, scheduling end-of-life for 2025.
   - Realm JS for Node.js/Electron relies on complex C++ native bindings (`node-gyp`) that suffer frequent breaking changes across V8 versions (Node 20, 22, 24).
   - Realm is not natively aligned with the official CachyWire specification.
2. **Canonical CachyWire Architecture**:
   - The reverse-engineering document (Section 5.4, 7.3, 9.1, 9.5) explicitly verifies that CachyWire uses **SQLite 3** (`sqlite3.dll`, schema with 6 relational tables: `applications`, `remote_hosts`, `traffic_types`, `traffic_stats` WITHOUT ROWID, `lan_devices`, `security_alerts`).
   - SQLite provides zero-dependency deployment, ACID transactions, robust SQL querying for multidimensional breakdown, and cross-platform compatibility across Windows, Linux, macOS, Web (via sql.js/IndexedDB/WASM), and Rust (via `rusqlite`).
3. **Architectural Decision**:
   - **SQLite 3** is chosen as the canonical persistence engine, with a resilient dual-mode adapter:
     - Direct SQLite engine in the Rust backend (`rusqlite`) and Node/Electron environments.
     - Pure WebAssembly / IndexedDB persistent relational store for standalone web browser environments.

---

## 3. Master Feature Traceability Matrix (FTM)

| Function ID | Function Name | Screen Reference | Schema & Entities | Acceptance Criteria | Implemented Status |
|---|---|---|---|---|---|
| **FUNC-01** | Real-time & Historical Traffic Graph | `SCR-01`, `SCR-02` | `traffic_stats`, `applications`, `remote_hosts` | Live 60-FPS dual-curve graph (Inbound `#00D4B2`, Outbound `#FF9F43`), 1Hz tick, time scrub, bottom 3-column breakdown | **Complete** |
| **FUNC-02** | Usage Analysis & Data Plan Auditing | `SCR-03` | `traffic_stats`, `traffic_types`, `DataPlanConfig` | Time range filter, Donut/Bar total bandwidth, 3-column cross-filter (Apps, Hosts with flags, Protocols), CSV export | **Complete** |
| **FUNC-03** | Firewall Management & Connection Control | `SCR-04` | `applications.firewall_state`, `FirewallProfiles` | Toggle ON/OFF, instant 1-click block/allow, mode switching, profile management, status badges | **Complete** |
| **FUNC-04** | Ask to Connect Mode | `SCR-04`, `SCR-09` | `applications`, `WFP Pending ALE` | Intercepts unknown new applications, pops up modal with full binary info, user chooses Allow or Deny | **Complete** |
| **FUNC-05** | CachyWire Score & Anomaly Detection | `SCR-02`, `SCR-04`, `SCR-07` | `applications.security_score`, `Baseline Stats` | Z-score anomaly detector, heuristic reputation scoring (+40 signed, +20 system, +30 clean VT, -penalty on sudden spike) | **Complete** |
| **FUNC-06** | LAN Network Devices Scanner ("Things") | `SCR-05` | `lan_devices`, `MAC OUI DB` | Discovers LAN hosts via ARP/mDNS/ICMP, displays online/offline status, vendor lookup, inline device renaming | **Complete** |
| **FUNC-07** | Security Event Log & Alerts Center | `SCR-06`, `SCR-01` | `security_alerts`, `lan_devices`, `applications` | 20+ alert types (ARP spoofing, DNS change, Hosts file, Evil Twin, binary modification), unread badge, toast alerts | **Complete** |
| **FUNC-08** | VirusTotal File Inspection | `SCR-04`, `SCR-07`, `SCR-10` | `applications.sha256_hash`, `VirusTotal API v3` | Calculates SHA-256, queries VT API v3, displays detection ratio `X/72` (green/red), links to VT report | **Complete** |
| **FUNC-09** | Incognito & Snooze Modes | `SCR-01`, `SCR-12` | `Service State Flags` | Incognito stops disk writes to `traffic_stats` while retaining RAM ring buffer; Snooze mutes toasts for 24h | **Complete** |
| **FUNC-10** | Remote Server Monitoring | `SCR-01`, `SCR-10` | `Remote Servers List`, `TLS Port 7010` | Connects to remote GWCtlSrv instances over TLS/IPC port 7010, switches entire UI view to remote node | **Complete** |
| **FUNC-11** | Floating Mini Viewer Widget | `SCR-11` | `MiniViewer State` | Draggable compact floating widget, opacity adjustment (20%-100%), always-on-top, double-click opens main UI | **Complete** |
| **FUNC-12** | System Tray Integration | `SCR-12` | `Tray Context Menu` | Minimizes to system tray, right-click context menu (modes, snooze, incognito, mini viewer, exit) | **Complete** |
| **FUNC-13** | Multi-Profile Firewall & Settings | `SCR-10` | `Settings Model` | Settings dialog with General, Security, Server, Remote Server, Remote Connections, VirusTotal tabs | **Complete** |
| **FUNC-14** | Application & Host Detail Modals | `SCR-07`, `SCR-08` | `applications`, `remote_hosts` | Full binary metadata, digital signature, first/last seen, reverse DNS, geolocation, connected traffic | **Complete** |
| **FUNC-15** | Persistence, Backup & Downsampling Engine | Service Layer | SQLite 3 (`1s`, `60s`, `3600s`, `86400s`) | Automatic time-series bucketing, memory batch transactions, database backup & restore | **Complete** |

---

## 4. Complete Screen Inventory (SCR-01 to SCR-12)
1. **SCR-01: Main Application Shell (Top Bar + Left Sidebar)**:
   - Window controls, status pills (Firewall status, Incognito badge, Snooze status, Upgrade button).
   - Left Navigation Rail with 5 primary views (`Traffic Monitor`, `Usage`, `Firewall`, `Network`, `Alerts`) and Remote Server Switcher.
2. **SCR-02: Traffic Monitor Screen**:
   - Filter Toolbar: Period buttons (`5m`, `3h`, `24h`, `Week`, `Month`), Direction filter (`All`, `Inbound`, `Outbound`), Adapter filter.
   - 60-FPS Dual-curve Canvas graph with smooth Bézier interpolation, crosshair tooltip, and timeline scrubber with app/alert pins.
   - Bottom 3-column breakdown panels: Active Apps, Active Hosts, Active Protocols.
3. **SCR-03: Usage & Data Plan Screen**:
   - Total bandwidth summary banner with download/upload gauge.
   - 3-column cross-filtered tabular breakdown (Apps, Hosts with country flags, Protocols).
   - Data Plan dialog configuration & CSV Export button.
4. **SCR-04: Firewall Screen**:
   - Control bar: Firewall master switch (`ON`/`OFF`), Mode dropdown (`Click to block`, `Ask to connect`, `Block all`), Profiles (`Default`, `Public Wi-Fi`, `Work`), Search.
   - Comprehensive interactive security table with instant block toggles, security score badges, VirusTotal results, and traffic meters.
5. **SCR-05: Network ("Things") LAN Scanner Screen**:
   - Subnet header, Scan/Refresh action, New unknown device alert toggle.
   - LAN device inventory table: Online/Offline status dot, Device Name (inline editable), IP, MAC, Vendor, First/Last Seen.
6. **SCR-06: Alerts Center Screen**:
   - Filter chips (`All`, `Security`, `System`, `Network`, `Data Plan`).
   - "Mark all as read" action.
   - Timeline cards with severity markers (Critical red `#FF4757`, Warning orange `#FFA502`, Info cyan `#00C2FF`), details expander, and mute options.
7. **SCR-07: Application Detail Modal**:
   - Executable path, digital signature status, SHA-256 hash, version, first/last activity, CachyWire score breakdown, VirusTotal status, Open File Location button.
8. **SCR-08: Remote Host Detail Modal**:
   - Reverse DNS / hostname, IP address, country code and flag, ASN organization, list of local apps that contacted this host.
9. **SCR-09: Ask to Connect Firewall Prompt**:
   - Urgent interception modal showing executable details, publisher, and prominent `Allow` and `Block` decision buttons.
10. **SCR-10: Multi-Tab Settings Dialog**:
    - Tabs for General (theme, language, startup), Security (alert toggles, ARP/DNS watchdogs), Server (data retention, clear history), Remote Server, Remote Connections, VirusTotal API key.
11. **SCR-11: Floating Mini Viewer Widget**:
    - Minimalist transparent HUD window showing live traffic bandwidth speed and mini sparkline.
12. **SCR-12: System Tray Context Menu**:
    - Tray popup providing quick status toggles for Firewall mode, Incognito, Snooze (24h), and Show/Hide window.

---

## 5. Strict Business Rules (BR-01 to BR-06)
- **BR-01 (Application Identity)**: Applications are uniquely tracked and keyed by normalized lowercase absolute executable path (`exe_path`), never by PID or volatile file name alone.
- **BR-02 (Binary Integrity Recheck)**: Whenever an executable's `last_modified` timestamp changes, its SHA-256 hash is recalculated. If changed, an `Application Info Changed` alert is fired, and in `Ask to connect` mode, re-authorization is mandatory.
- **BR-03 (LAN vs WAN Segregation)**: Addresses falling into RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Link-Local (`169.254.0.0/16`), or Loopback (`127.0.0.0/8`, `fe80::/10`) are strictly classified as `LAN Traffic` (`is_local_lan = 1`). All other public destinations are classified as `External / Internet Traffic` (`is_local_lan = 0`).
- **BR-04 (Incognito Behavior)**: During Incognito mode, zero disk writes or database mutations occur for `traffic_stats` or `remote_hosts`. A RAM ring buffer retains transient visualization data. Firewall enforcement rules remain 100% active.
- **BR-05 (Critical Infrastructure Exemption in Block All)**: Under `Block All` (Lockdown), core protocols necessary to preserve networking (DHCP on UDP 67/68, local loopback `127.0.0.1`) are hard-coded to bypass blocking to protect IP lease and local IPC communication.
- **BR-06 (Data Plan Threshold Auditing)**: Only External traffic (`is_local_lan = 0`) on the selected network adapter contributes to Data Plan quota. Warnings fire at user-specified thresholds (e.g. 80%) and at 100% limit.
