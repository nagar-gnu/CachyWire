/**
 * CachyWire 0.1.0-alpha - Network Traffic Classifier
 * Implements Rule BR-03: Strict LAN vs Internet/External Segregation
 * RFC 1918, RFC 3927 (Link-Local), Loopback
 */

export function isLocalLanAddress(ip) {
  if (!ip) return false;
  const cleanIp = ip.trim().toLowerCase();

  // IPv6 Loopback / Link-local / IPv4-mapped loopback / private ranges
  if (cleanIp === '::1' || cleanIp.startsWith('::1%') || cleanIp.startsWith('fe80:') || cleanIp === '::ffff:127.0.0.1' || cleanIp.startsWith('::ffff:127.')) {
    return true;
  }

  // IPv4 Loopback (127.0.0.0/8)
  if (cleanIp.startsWith('127.')) {
    return true;
  }

  // RFC 1918 Class A: 10.0.0.0/8
  if (cleanIp.startsWith('10.')) {
    return true;
  }
  if (cleanIp.startsWith('::ffff:10.')) {
    return true;
  }

  // RFC 1918 Class B: 172.16.0.0 - 172.31.255.255
  if (cleanIp.startsWith('172.')) {
    const parts = cleanIp.split('.');
    if (parts.length >= 2) {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }

  // RFC 1918 Class C: 192.168.0.0/16
  if (cleanIp.startsWith('192.168.')) {
    return true;
  }
  if (cleanIp.startsWith('::ffff:192.168.')) {
    return true;
  }

  // Link-Local: 169.254.0.0/16
  if (cleanIp.startsWith('169.254.')) {
    return true;
  }
  if (cleanIp.startsWith('::ffff:169.254.')) {
    return true;
  }

  // Otherwise, public Internet traffic
  return false;
}

export function classifyTrafficFlow(flow) {
  const isLan = isLocalLanAddress(flow.destination_ip);
  return {
    ...flow,
    is_local_lan: isLan ? 1 : 0
  };
}
