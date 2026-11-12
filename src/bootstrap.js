/**
 * CachyWire 0.1.0-alpha - Desktop Application Bootstrap
 * Strictly CSP-compliant external entry point (AUDIT SEC-03, WEB-02)
 */
import { CachyWireApp } from './app.js';

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const app = new CachyWireApp();
    window.gwApp = app;
    window.app = app;
    await app.init();
    console.log('[CachyWire] Desktop UI successfully initialized.');
  } catch (err) {
    console.error('[CachyWire Critical] Bootstrap failure:', err);
    const container = document.getElementById('app-shell');
    if (container) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#ef4444;font-family:sans-serif;text-align:center;padding:20px;">
          <h2>⚠️ CachyWire Startup Error</h2>
          <pre style="background:#1e1e2e;padding:15px;border-radius:8px;color:#f87171;max-width:800px;overflow:auto;">${err.stack || err.message || err}</pre>
          <button onclick="location.reload()" style="margin-top:15px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">Retry</button>
        </div>
      `;
    }
  }
});
