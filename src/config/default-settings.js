/**
 * CachyWire 0.1.0-alpha - Default Settings & Initial Configuration
 * AUDIT changes: fake LICENSE_TIER removed (OSS product), dead TIME_PERIODS
 * removed, runOnStartup now defaults to false (explicit user consent).
 */
export const FIREWALL_MODES = {
  CLICK_TO_BLOCK: 'CLICK_TO_BLOCK',   // Default: apps connect freely unless clicked to block
  ASK_TO_CONNECT: 'ASK_TO_CONNECT',   // Holds connection until user approves in modal
  BLOCK_ALL: 'BLOCK_ALL'              // Lockdown: blocks all external apps, exempts DHCP/Loopback
};

export const FIREWALL_PROFILES = [
  { id: 'default', name: 'Default', description: 'Standard desktop profile' },
{ id: 'public_wifi', name: 'Public Wi-Fi', description: 'Strict profile for untrusted wireless networks' },
{ id: 'work', name: 'Work', description: 'Corporate VPN and domain profile' }
];

export const THEMES = [
  { id: 'dark', name: 'Dark Cyber-Analytics (Default)' },
  { id: 'light', name: 'Light Modern' },
{ id: 'midnight', name: 'Midnight Deep Blue' },
{ id: 'cyberpunk', name: 'Cyberpunk Neon' }
];

export const DEFAULT_SETTINGS = {
  theme: 'dark', // 'dark' | 'light' | 'midnight' | 'cyberpunk'
  language: 'en',
  runOnStartup: false, // AUDIT: autostart requires explicit user consent
  hideIdleApps: false,
  firewallEnabled: true,
  firewallMode: FIREWALL_MODES.CLICK_TO_BLOCK,
  activeProfile: 'default',
  incognito: false,
  snoozeUntil: 0, // timestamp in ms; if > now, snooze active
  dataPlan: {
    enabled: true,
    limitBytes: 100 * 1024 * 1024 * 1024, // 100 GB default
    billingDayOfMonth: 1,
    warnThresholdPercent: 80, // Warn at 80%
    alertOnExceeded: true,
    lastWarnFired: false,   // runtime flag, reset on limit increase
    lastLimitFired: false
  },
  server: {
    historyRetentionDays: 30,
    dbPath: '~/.local/share/cachywire/cachywire_db.json',
    allowRemoteConnections: false,
    listenPort: 7010,
    serverPasswordHash: '', // PBKDF2 / SHA256 hashed
    allowedIpWhitelist: '127.0.0.1, 192.168.1.0/24'
  },
  remoteConnections: [
    { id: 'local', name: 'CachyOS Local Host', host: '127.0.0.1', port: 7010, isCurrent: true, status: 'Connected' }
  ],
  virustotal: {
    apiKey: '', // AUDIT SEC-09: moved out of localStorage in Batch 4 (daemon-side store)
    autoScanNewApps: false,
    hasAgreedToTerms: false
  },
  watchdogs: {
    arpSpoofing: true,
    dnsChange: true,
    hostsFileModification: true,
    binaryIntegrityChange: true,
    wifiEvilTwin: true,
    rdpIncomingConnection: true,
    proxySettingsChanged: true,
    internetOutage: true,
    newDeviceOnLan: true
  }
};
