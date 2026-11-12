/**
 * CachyWire 0.1.0-alpha - LAN Devices Repository
 */

export class DevicesRepository {
  constructor(db) {
    this.db = db;
  }

  upsert(device) {
    return this.db.upsertLanDevice(device);
  }

  getAll() {
    return this.db.getAllLanDevices();
  }

  update(deviceId, fields) {
    return this.db.updateLanDevice(deviceId, fields);
  }

  delete(deviceId) {
    return this.db.deleteLanDevice(deviceId);
  }
}
