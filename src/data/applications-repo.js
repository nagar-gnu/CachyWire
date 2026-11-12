/**
 * CachyWire 0.1.0-alpha - Applications Repository
 */

export class ApplicationsRepository {
  constructor(db) {
    this.db = db;
  }

  register(data) {
    return this.db.registerApplication(data);
  }

  getById(appId) {
    return this.db.getApplication(appId);
  }

  getByPath(path) {
    return this.db.getApplicationByPath(path);
  }

  getAll() {
    return this.db.getAllApplications();
  }

  update(appId, fields) {
    return this.db.updateApplication(appId, fields);
  }

  setFirewallState(appId, state) {
    const res = this.db.updateApplication(appId, { firewall_state: state });
    if (this.db.saveToStorage) {
      this.db.saveToStorage();
    }
    return res;
  }

  setSecurityScore(appId, score) {
    return this.db.updateApplication(appId, { security_score: score });
  }

  setVirusTotalResult(appId, positives, total) {
    return this.db.updateApplication(appId, {
      vt_positives: positives,
      vt_total: total,
      vt_scan_date: Date.now()
    });
  }

  toggleAlertsMuted(appId) {
    const app = this.getById(appId);
    if (!app) return null;
    return this.db.updateApplication(appId, { alerts_muted: app.alerts_muted ? 0 : 1 });
  }
}
