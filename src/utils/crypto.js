/**
 * CachyWire 0.1.0-alpha - Cryptography & Binary Hashing
 * AUDIT CRYPTO-01: the old "pure JS fallback" was a non-cryptographic hashCode
 * padded with 'a'. A security product must NEVER silently degrade to a fake
 * hash — we now fail loudly instead.
 */
export async function computeSha256(input) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = typeof input === 'string' ? encoder.encode(input) : input;
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js / CLI environment
  const cryptoModule = await import('crypto');
  if (cryptoModule && cryptoModule.createHash) {
    return cryptoModule.createHash('sha256').update(input).digest('hex');
  }
  throw new Error('computeSha256: no secure SHA-256 provider available in this environment');
}

export function generateRandomToken(bytesLen = 16) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(bytesLen);
    window.crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('generateRandomToken: window.crypto.getRandomValues unavailable');
}
