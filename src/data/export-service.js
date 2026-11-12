/**
 * CachyWire 0.1.0-alpha - Export & Backup Service
 * Implements CSV Export for Usage statistics (FUNC-02, Scenario 3)
 * and full Database Backup / Restore (Scenario 9).
 */

import { formatBytes } from '../utils/formatters.js';

export class ExportService {
  constructor(db, appsRepo, hostsRepo, trafficRepo) {
    this.db = db;
    this.appsRepo = appsRepo;
    this.hostsRepo = hostsRepo;
    this.trafficRepo = trafficRepo;
  }

  generateUsageCsv(startTimeSec, endTimeSec, options = {}) {
    const summary = this.trafficRepo.getTotalsForRange(startTimeSec, endTimeSec, options);
    const rows = [];

    // Header
    rows.push(['Category', 'Name / Identifier', 'Detail', 'Inbound Bytes', 'Outbound Bytes', 'Total Bytes', 'Formatted Total']);

    // Applications breakdown
    for (const [appId, data] of summary.appBreakdown.entries()) {
      const app = this.appsRepo.getById(appId);
      const name = app ? app.app_name : `App #${appId}`;
      const path = app ? app.exe_path : '';
      rows.push(['Application', name, path, data.bytes_in, data.bytes_out, data.total, formatBytes(data.total)]);
    }

    // Remote Hosts breakdown
    for (const [hostId, data] of summary.hostBreakdown.entries()) {
      const host = this.hostsRepo.getById(hostId);
      const ip = host ? host.ip_address : `Host #${hostId}`;
      const domain = host ? (host.domain_name || host.country_iso2) : '';
      rows.push(['Remote Host', ip, domain, data.bytes_in, data.bytes_out, data.total, formatBytes(data.total)]);
    }

    // Protocol breakdown
    for (const [protoId, data] of summary.protoBreakdown.entries()) {
      const proto = this.db.tables.traffic_types.get(protoId);
      const name = proto ? proto.service_name : `Proto #${protoId}`;
      rows.push(['Protocol', name, `Port ${proto ? proto.port_number : ''}`, data.bytes_in, data.bytes_out, data.total, formatBytes(data.total)]);
    }

    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    return csvContent;
  }

  downloadCsv(csvContent, filename = `CachyWire_Usage_${new Date().toISOString().slice(0, 10)}.csv`) {
    if (typeof window === 'undefined') return csvContent;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  exportBackup() {
    return this.db.exportDatabaseSnapshot();
  }

  importBackup(backupJson) {
    return this.db.importDatabaseSnapshot(backupJson);
  }
}
