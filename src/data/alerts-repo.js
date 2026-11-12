/**
 * CachyWire 0.1.0-alpha - Security Alerts Repository
 */

export class AlertsRepository {
  constructor(db) {
    this.db = db;
  }

  create(alertData) {
    return this.db.createAlert(alertData);
  }

  getAll(category = 'ALL') {
    return this.db.getAllAlerts(category);
  }

  getUnreadCount() {
    return this.db.getUnreadAlertsCount();
  }

  markAsRead(alertId) {
    return this.db.markAlertAsRead(alertId);
  }

  markAllAsRead() {
    return this.db.markAllAlertsAsRead();
  }

  clear() {
    return this.db.clearAlerts();
  }
}
