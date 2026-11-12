/**
 * CachyWire 0.1.0-alpha - Offline GeoIP & Country Resolution
 * AUDIT DATA-01: the old deterministic pseudo-hash invented a country for any
 * unmapped IP (presented as fact). We now return an explicit UNKNOWN bucket
 * for anything outside the curated well-known prefix table. Honesty first.
 */
const CURATED_PREFIXES = [
  { prefix: '142.250.', iso2: 'US', name: 'United States' },
{ prefix: '172.217.', iso2: 'US', name: 'United States' },
{ prefix: '185.199.', iso2: 'DE', name: 'Germany' },
{ prefix: '52.',      iso2: 'US', name: 'United States' },
{ prefix: '54.',      iso2: 'US', name: 'United States' },
{ prefix: '13.',      iso2: 'US', name: 'United States' },
{ prefix: '104.',     iso2: 'US', name: 'United States' },
{ prefix: '151.101.', iso2: 'GB', name: 'United Kingdom' },
{ prefix: '162.158.', iso2: 'FR', name: 'France' },
{ prefix: '193.186.', iso2: 'EG', name: 'Egypt' },
{ prefix: '156.208.', iso2: 'EG', name: 'Egypt' },
{ prefix: '103.',     iso2: 'SG', name: 'Singapore' },
{ prefix: '114.119.', iso2: 'CN', name: 'China' },
{ prefix: '133.',     iso2: 'JP', name: 'Japan' },
{ prefix: '177.',     iso2: 'BR', name: 'Brazil' },
{ prefix: '139.162.', iso2: 'DE', name: 'Germany' },
{ prefix: '198.51.',  iso2: 'CA', name: 'Canada' },
{ prefix: '203.0.',   iso2: 'AU', name: 'Australia' }
];

const ISO_TO_FLAG = {
  US: '🇺🇸', DE: '🇩🇪', EG: '🇪🇬', GB: '🇬🇧', FR: '🇫🇷', SG: '🇸🇬',
  CN: '🇨🇳', JP: '🇯🇵', BR: '🇧🇷', CA: '🇨🇦', AU: '🇦🇺', NL: '🇳🇱',
  IN: '🇮', GLOBAL: '🌐'
};

export function lookupGeoIp(ipAddress) {
  if (!ipAddress) return { iso2: 'UNKNOWN', country: 'Unknown', flag: '🌐', known: false };
  // Loopback / LAN (BR-03 ranges)
  if (
    ipAddress.startsWith('127.') ||
    ipAddress.startsWith('10.') ||
    ipAddress.startsWith('192.168.') ||
    ipAddress.startsWith('169.254.') ||
    ipAddress === '::1' ||
    ipAddress.startsWith('fe80:')
  ) {
    return { iso2: 'LAN', country: 'Local Network', flag: '🏠', known: true };
  }
  for (const entry of CURATED_PREFIXES) {
    if (ipAddress.startsWith(entry.prefix)) {
      return { iso2: entry.iso2, country: entry.name, flag: ISO_TO_FLAG[entry.iso2] || '🌐', known: true };
    }
  }
  // AUDIT DATA-01: no fabrication. Unmapped IPs get an honest UNKNOWN bucket.
  return { iso2: 'UNKNOWN', country: 'Unknown (no offline GeoIP entry)', flag: '🌐', known: false };
}
