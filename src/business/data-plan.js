/**
 * CachyWire 0.1.0-alpha - Data Plan & Bandwidth Overuse Monitor
 * Implements Rule BR-06:
 * - Only External/Internet traffic (is_local_lan = 0) is billed
 * - Calculates cycle usage from the configured billing day
 * - Triggers warning alert at warnThresholdPercent (80%)
 * - Triggers critical limit alert at 100%
 */

import { formatBytes } from '../utils/formatters.js';

export class DataPlanMonitor {
  constructor(trafficRepo, alertsRepo, config = {}) {
    this.trafficRepo = trafficRepo;
    this.alertsRepo = alertsRepo;
    this.config = {
      enabled: config.enabled !== undefined ? config.enabled : true,
      limitBytes: config.limitBytes || (100 * 1024 * 1024 * 1024), // 100 GB
      billingDayOfMonth: config.billingDayOfMonth || 1,
      warnThresholdPercent: config.warnThresholdPercent || 80,
      adapterId: config.adapterId || null,
      lastWarnFired: false,
      lastLimitFired: false
    };
  }

  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    // Reset alert flags if limit increased
    this.config.lastWarnFired = false;
    this.config.lastLimitFired = false;
  }

  getBillingCycleStartTimestamp() {
    const now = new Date();
    const cycleStart = new Date(now.getFullYear(), now.getMonth(), this.config.billingDayOfMonth, 0, 0, 0);
    // If today is before billing day in this month, cycle started previous month
    if (now.getDate() < this.config.billingDayOfMonth) {
      cycleStart.setMonth(cycleStart.getMonth() - 1);
    }
    return Math.floor(cycleStart.getTime() / 1000);
  }

  auditCurrentUsage() {
    if (!this.config.enabled) return null;

    const startTsSec = this.getBillingCycleStartTimestamp();
    const nowSec = Math.floor(Date.now() / 1000);

    // BR-06: Only count external Internet traffic (is_local_lan = 0)
    const summary = this.trafficRepo.getTotalsForRange(startTsSec, nowSec, {
      isLocalLan: 0,
      adapterId: this.config.adapterId
    });

    const usedBytes = summary.totalBytes;
    const limitBytes = this.config.limitBytes;
    const percentUsed = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;

    // Check warning threshold (80%)
    if (percentUsed >= this.config.warnThresholdPercent && !this.config.lastWarnFired) {
      this.config.lastWarnFired = true;
      this.alertsRepo.create({
        alert_type: 'DATA_PLAN_WARNING',
        severity: 2, // Warning
        title: `Data Plan Warning: ${percentUsed.toFixed(1)}% Reached`,
        details_json: {
          usedBytes,
          limitBytes,
          formattedUsed: formatBytes(usedBytes),
          formattedLimit: formatBytes(limitBytes),
          threshold: this.config.warnThresholdPercent
        }
      });
    }

    // Check critical limit exceeded (100%)
    if (percentUsed >= 100 && !this.config.lastLimitFired) {
      this.config.lastLimitFired = true;
      this.alertsRepo.create({
        alert_type: 'DATA_PLAN_EXCEEDED',
        severity: 3, // Critical
        title: 'Data Plan Limit Exceeded!',
        details_json: {
          usedBytes,
          limitBytes,
          formattedUsed: formatBytes(usedBytes),
          formattedLimit: formatBytes(limitBytes),
          exceededBy: formatBytes(usedBytes - limitBytes)
        }
      });
    }

    return {
      usedBytes,
      limitBytes,
      percentUsed: Math.min(100, percentUsed),
      rawPercent: percentUsed,
      isExceeded: percentUsed >= 100,
      isWarning: percentUsed >= this.config.warnThresholdPercent,
      formattedUsed: formatBytes(usedBytes),
      formattedLimit: formatBytes(limitBytes)
    };
  }
}
