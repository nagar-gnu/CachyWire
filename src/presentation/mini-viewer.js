/**
 * CachyWire 0.1.0-alpha - Floating Mini Viewer Widget (SCR-11)
 * Compact Always-on-top HUD widget displaying live traffic curves and speed.
 */

import { formatSpeed } from '../utils/formatters.js';

export class MiniViewerWidget {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('mini-viewer-widget');
    this.onRestoreMain = options.onRestoreMain || (() => {});
    this.isOpen = false;
    this.opacity = 0.95;
    this.stayOnTop = true;

    this.samples = [];
    this.maxSamples = 40;
    this.animFrameId = null;
  }

  mount() {
    this.container.innerHTML = `
      <div class="mini-viewer-header" id="mini-drag-handle">
        <span style="display:flex;align-items:center;gap:4px;">
          <svg width="12" height="12" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="none" stroke="#00C2FF" stroke-width="3"/><path d="M6 16 L14 16 L17 10 L20 22 L23 16 L26 16" fill="none" stroke="#00D4B2" stroke-width="3"/></svg>
          CachyWire HUD
        </span>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="range" id="mini-opacity-slider" min="20" max="100" value="95" style="width:50px;height:4px;" title="Adjust Opacity" />
          <button style="background:transparent;border:none;color:var(--gw-text-secondary);cursor:pointer;" id="mini-close-btn">✕</button>
        </div>
      </div>

      <div class="mini-viewer-body">
        <canvas id="mini-canvas"></canvas>
        <div class="mini-speeds-overlay">
          <span class="mini-down">↓ <span id="mini-down-val">0 B/s</span></span>
          <span class="mini-up">↑ <span id="mini-up-val">0 B/s</span></span>
        </div>
      </div>
    `;

    this.canvas = this.container.querySelector('#mini-canvas');
    this.ctx = this.canvas.getContext('2d');

    this._bindEvents();
    this._initCanvasResize();
  }

  _bindEvents() {
    // Close button
    this.container.querySelector('#mini-close-btn').addEventListener('click', () => {
      this.close();
    });

    // Opacity slider
    const slider = this.container.querySelector('#mini-opacity-slider');
    slider.addEventListener('input', (e) => {
      this.opacity = parseInt(e.target.value, 10) / 100;
      this.container.style.opacity = this.opacity;
    });

    // Double click to restore main UI (FUNC-11, Section 2)
    this.container.addEventListener('dblclick', () => {
      this.onRestoreMain();
    });

    // Drag handle
    const handle = this.container.querySelector('#mini-drag-handle');
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      offsetX = e.clientX - this.container.offsetLeft;
      offsetY = e.clientY - this.container.offsetTop;
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      this.container.style.left = `${e.clientX - offsetX}px`;
      this.container.style.top = `${e.clientY - offsetY}px`;
      this.container.style.bottom = 'auto';
      this.container.style.right = 'auto';
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      document.body.style.userSelect = '';
    });
  }

  _initCanvasResize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || 260;
    this.canvas.height = rect.height || 100;
  }

  open() {
    this.isOpen = true;
    this.container.classList.add('open');
    this._startRenderLoop();
  }

  close() {
    this.isOpen = false;
    this.container.classList.remove('open');
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  pushSample(sample) {
    if (!this.isOpen) return;

    this.samples.push({
      bytes_in: sample.bytes_in || 0,
      bytes_out: sample.bytes_out || 0
    });

    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    const downVal = this.container.querySelector('#mini-down-val');
    const upVal = this.container.querySelector('#mini-up-val');
    if (downVal && upVal) {
      downVal.textContent = formatSpeed(sample.bytes_in || 0);
      upVal.textContent = formatSpeed(sample.bytes_out || 0);
    }
  }

  _startRenderLoop() {
    const render = () => {
      if (!this.isOpen) return;
      this._draw();
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  _draw() {
    if (!this.ctx || !this.canvas) return;
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);
    if (this.samples.length < 2) return;

    let maxVal = 50 * 1024;
    for (const s of this.samples) {
      if (s.bytes_in > maxVal) maxVal = s.bytes_in;
      if (s.bytes_out > maxVal) maxVal = s.bytes_out;
    }
    maxVal *= 1.2;

    const stepX = width / (this.maxSamples - 1);
    const startOffset = width - ((this.samples.length - 1) * stepX);

    // Inbound filled sparkline (#00D4B2)
    ctx.beginPath();
    ctx.moveTo(startOffset, height);
    for (let i = 0; i < this.samples.length; i++) {
      const x = startOffset + (i * stepX);
      const y = height - ((this.samples[i].bytes_in / maxVal) * (height - 15));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();

    ctx.fillStyle = 'rgba(0, 212, 178, 0.3)';
    ctx.fill();

    ctx.strokeStyle = '#00D4B2';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Outbound sparkline (#FF9F43)
    ctx.beginPath();
    for (let i = 0; i < this.samples.length; i++) {
      const x = startOffset + (i * stepX);
      const y = height - ((this.samples[i].bytes_out / maxVal) * (height - 15));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#FF9F43';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
