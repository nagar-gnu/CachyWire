/**
 * CachyWire 0.1.0-alpha - Remote Hosts Repository
 */

export class HostsRepository {
  constructor(db) {
    this.db = db;
  }

  getOrCreate(ip, domain = '', countryIso2 = 'GLOBAL', asn = '') {
    return this.db.getOrCreateRemoteHost(ip, domain, countryIso2, asn);
  }

  getById(hostId) {
    return this.db.getRemoteHost(hostId);
  }

  getAll() {
    return this.db.getAllRemoteHosts();
  }
}
