/**
 * CachyWire 0.1.0-alpha - Traffic Time-Series Repository
 */

export class TrafficRepository {
  constructor(db) {
    this.db = db;
  }

  recordFlow(flow) {
    this.db.recordTrafficFlow(flow);
  }

  query(params) {
    return this.db.queryTrafficStats(params);
  }

  getTotalsForRange(startTimeSec, endTimeSec, options = {}) {
    const stats = this.db.queryTrafficStats({
      startTimeSec,
      endTimeSec,
      resolutionSec: options.resolutionSec !== undefined ? options.resolutionSec : null,
      appId: options.appId,
      hostId: options.hostId,
      adapterId: options.adapterId,
      isLocalLan: options.isLocalLan
    });

    let totalIn = 0;
    let totalOut = 0;
    const appBreakdown = new Map();
    const hostBreakdown = new Map();
    const protoBreakdown = new Map();

    for (const s of stats) {
      totalIn += s.bytes_in;
      totalOut += s.bytes_out;

      // App aggregation
      const appCurr = appBreakdown.get(s.app_id) || { bytes_in: 0, bytes_out: 0, total: 0 };
      appCurr.bytes_in += s.bytes_in;
      appCurr.bytes_out += s.bytes_out;
      appCurr.total += (s.bytes_in + s.bytes_out);
      appBreakdown.set(s.app_id, appCurr);

      // Host aggregation
      const hostCurr = hostBreakdown.get(s.host_id) || { bytes_in: 0, bytes_out: 0, total: 0 };
      hostCurr.bytes_in += s.bytes_in;
      hostCurr.bytes_out += s.bytes_out;
      hostCurr.total += (s.bytes_in + s.bytes_out);
      hostBreakdown.set(s.host_id, hostCurr);

      // Protocol aggregation
      const protoCurr = protoBreakdown.get(s.proto_id) || { bytes_in: 0, bytes_out: 0, total: 0 };
      protoCurr.bytes_in += s.bytes_in;
      protoCurr.bytes_out += s.bytes_out;
      protoCurr.total += (s.bytes_in + s.bytes_out);
      protoBreakdown.set(s.proto_id, protoCurr);
    }

    return {
      totalIn,
      totalOut,
      totalBytes: totalIn + totalOut,
      appBreakdown,
      hostBreakdown,
      protoBreakdown
    };
  }

  runDownsampling() {
    this.db.runDownsamplingRollup();
  }
}
