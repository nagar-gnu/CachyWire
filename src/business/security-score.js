/**
 * CachyWire 0.1.0-alpha - Security Score & Statistical Anomaly Detector
 * Implements the hybrid local evaluation engine documented in Section 7.7 & FUNC-05
 */

export class SecurityScoreEngine {
  constructor(appsRepo, alertsRepo) {
    this.appsRepo = appsRepo;
    this.alertsRepo = alertsRepo;

    // Moving statistics cache for Anomaly Detection: appId -> { samples: number[], mean: number, stdDev: number }
    this.trafficHistory = new Map();
  }

  calculateSecurityScore(app) {
    let score = 50; // Neutral baseline

    // 1. Digital Signature Check (+40 pts)
    if (app.is_signed) {
      score += 40;
    } else {
      score -= 20; // Unverified publisher penalty
    }

    // 2. Protected OS / System Directory Check (+20 pts)
    const normalized = (app.exe_path || '').toLowerCase();
    if (
      normalized.startsWith('/usr/bin/') ||
      normalized.startsWith('/usr/lib/') ||
      normalized.startsWith('/usr/sbin/') ||
      normalized.startsWith('/bin/') ||
      normalized.startsWith('/sbin/') ||
      normalized.startsWith('/opt/')
    ) {
      score += 20;
    } else if (normalized.includes('/tmp/') || normalized.startsWith('/tmp/') || normalized.includes('/downloads/')) {
      score -= 25; // High-risk execution location penalty
    }

    // 3. VirusTotal Result Check (+30 pts for clean, penalty for positives)
    if (app.vt_total > 0) {
      if (app.vt_positives === 0) {
        score += 30;
      } else {
        score -= (app.vt_positives * 15);
      }
    }

    // Clamp score strictly between 0 and 100
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    this.appsRepo.setSecurityScore(app.app_id, finalScore);
    return finalScore;
  }

  getScoreRating(score) {
    if (score >= 80) return { label: 'Safe', color: '#2ED573', cssClass: 'score-safe' };
    if (score >= 50) return { label: 'Moderate', color: '#FFA502', cssClass: 'score-warning' };
    return { label: 'Low / Suspicious', color: '#FF4757', cssClass: 'score-danger' };
  }

  /**
   * Evaluates real-time traffic volume against historical baseline for anomalies (Z-Score > 3)
   */
  checkTrafficAnomaly(appId, currentRateBytesPerSec) {
    const app = this.appsRepo.getById(appId);
    if (!app) return { isAnomaly: false };

    let hist = this.trafficHistory.get(appId);
    if (!hist) {
      hist = { samples: [], sum: 0, sumSq: 0 };
      this.trafficHistory.set(appId, hist);
    }

    hist.samples.push(currentRateBytesPerSec);
    hist.sum += currentRateBytesPerSec;
    hist.sumSq += (currentRateBytesPerSec * currentRateBytesPerSec);

    // Keep window of last 60 samples (1 minute at 1Hz)
    if (hist.samples.length > 60) {
      const removed = hist.samples.shift();
      hist.sum -= removed;
      hist.sumSq -= (removed * removed);
    }

    // Need at least 10 baseline samples before flagging anomalies
    if (hist.samples.length < 10) {
      return { isAnomaly: false };
    }

    const n = hist.samples.length;
    const mean = hist.sum / n;
    const variance = Math.max(0, (hist.sumSq / n) - (mean * mean));
    const stdDev = Math.sqrt(variance);

    // Flag anomaly if rate exceeds mean + 3 * stdDev and is an absolute surge (> 100KB/s)
    const threshold = mean + (3 * stdDev);
    if (currentRateBytesPerSec > threshold && currentRateBytesPerSec > 100 * 1024) {
      const zScore = stdDev > 0 ? ((currentRateBytesPerSec - mean) / stdDev).toFixed(1) : '3.0+';

      // Log security alert for anomaly
      this.alertsRepo.create({
        alert_type: 'NETWORK_ANOMALY',
        severity: 2, // Warning
        app_id: appId,
        title: `Unusual network activity detected for ${app.app_name}`,
        details_json: {
          rate: currentRateBytesPerSec,
          baselineMean: Math.round(mean),
          zScore: zScore
        }
      });

      return {
        isAnomaly: true,
        zScore,
        rate: currentRateBytesPerSec,
        threshold
      };
    }

    return { isAnomaly: false };
  }
}
