/**
 * CachyWire 0.1.0-alpha - Formatters & Display Helpers
 * Implements high-precision units, tabular numeric formatting, and date display
 */

export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0 || bytes === null || bytes === undefined || isNaN(bytes)) return '0 B';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${Math.round(bytes)} B`;
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(abs) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  const formatted = (bytes / Math.pow(k, safeI)).toFixed(dm);
  return `${formatted} ${sizes[safeI]}`;
}

export function formatSpeed(bytesPerSec, decimals = 1) {
  return `${formatBytes(bytesPerSec, decimals)}/s`;
}

export function formatBitsSpeed(bytesPerSec, decimals = 1) {
  if (!bytesPerSec || bytesPerSec === 0) return '0 bps';
  const bits = bytesPerSec * 8;
  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  const i = Math.floor(Math.log(bits) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  const formatted = (bits / Math.pow(k, safeI)).toFixed(dm);
  return `${formatted} ${sizes[safeI]}`;
}

export function formatTimestamp(tsMs) {
  if (!tsMs) return '--:--:--';
  const d = new Date(tsMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function formatDate(tsMs) {
  if (!tsMs) return 'Unknown';
  const d = new Date(tsMs);
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(tsMs) {
  if (!tsMs) return 'Unknown';
  const d = new Date(tsMs);
  return `${formatDate(tsMs)} ${formatTimestamp(tsMs)}`;
}

export function formatMacAddress(mac) {
  if (!mac) return '--:--:--:--:--:--';
  return mac.toUpperCase().replace(/[^A-F0-9]/g, '').replace(/(..)(?=.)/g, '$1:');
}
