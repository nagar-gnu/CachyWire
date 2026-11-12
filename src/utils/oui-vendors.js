/**
 * CachyWire 0.1.0-alpha - MAC OUI Vendor Database Lookup
 * Resolves MAC prefixes to device hardware manufacturers (FUNC-06, MOD-SVC-05)
 */

const OUI_TABLE = {
  '10:3C:59': 'ZTE Corporation (Router)',
  '68:C4:4C': 'Xiaomi Communications',
  '00:1A:2B': 'Cisco Systems',
  '00:50:56': 'VMware, Inc.',
  '00:0C:29': 'VMware, Inc.',
  '08:00:27': 'Oracle VirtualBox',
  'B8:27:EB': 'Raspberry Pi Foundation',
  'DC:A6:32': 'Raspberry Pi Foundation',
  'F0:18:98': 'Apple, Inc.',
  '3C:06:30': 'Apple, Inc.',
  '70:4F:57': 'Huawei Technologies',
  '48:8A:D2': 'Huawei Technologies',
  'AC:D1:B8': 'Samsung Electronics',
  '18:65:90': 'Samsung Electronics',
  'FC:EC:DA': 'Ubiquiti Networks',
  '24:A4:3C': 'Ubiquiti Networks',
  '00:15:5D': 'Microsoft Corporation',
  'E4:5F:01': 'Raspberry Pi Foundation',
  'D8:3A:DD': 'Intel Corporate',
  '00:E0:4C': 'Realtek Semiconductor',
  '50:C7:BF': 'TP-Link Technologies',
  'E8:48:B8': 'TP-Link Technologies',
  'B0:95:75': 'TP-Link Technologies'
};

export function lookupMacVendor(macAddress) {
  if (!macAddress) return 'Unknown Hardware';
  const cleanMac = macAddress.toUpperCase().replace(/[^A-F0-9]/g, '');
  if (cleanMac.length < 6) return 'Generic Device';
  
  const prefix = `${cleanMac.substring(0, 2)}:${cleanMac.substring(2, 4)}:${cleanMac.substring(4, 6)}`;
  if (OUI_TABLE[prefix]) {
    return OUI_TABLE[prefix];
  }

  // Check IEEE 802 Locally Administered / Private Wi-Fi MAC bit
  // Mobile devices (Android, iOS) randomize MAC with bit 1 of first byte set
  const firstByte = parseInt(cleanMac.substring(0, 2), 16);
  if (!isNaN(firstByte) && (firstByte & 2) !== 0) {
    return 'Mobile Device (Private Wi-Fi Address)';
  }

  return 'Local Network Device';
}
