/**
 * StudioCut — Broadcast Video Scopes Suite
 * Professional broadcast-grade scopes inspired by Adobe Premiere Pro Lumetri & DaVinci Resolve:
 * - Luma Waveform with 0-100 IRE Graticules and phosphor persistence simulation
 * - RGB Parade with calibrated individual color channel monitors
 * - Vectorscope with polar saturation rings, SMPTE 75% color targets, and calibrated Skin Tone I-Bar
 * - Broadcast RGB & Luminance Histogram with gradient area fills
 */

class VideoScopes {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.mode = 'waveform'; // 'waveform', 'parade', 'vectorscope', 'histogram'
    this.intensity = 0.7;   // Trace brightness/exposure gain
    this.visible = false;
    this.sampleStep = 2;    // Optimized downsampling factor for smooth 60fps
    this.container = null;
    this.panel = null;

    // Off-screen scratch canvas for reading pixels
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Initialize scopes attached to a DOM container
   */
  init(container) {
    this.container = container;
    this._buildUI();
    this._initDraggable();
  }

  _buildUI() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="video-scopes-panel" id="videoScopesPanel">
        <!-- Pro Header Toolbar -->
        <div class="scopes-header" id="scopesHeader">
          <div class="scopes-header__drag" title="Drag to reposition Scopes HUD">
            <svg class="scopes-header__icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12h5l3 8 4-16 3 8h5"/>
            </svg>
            <span class="scopes-title">BROADCAST SCOPES</span>
          </div>

          <!-- Segmented Pill Mode Switcher -->
          <div class="scopes-mode-selector">
            <button class="scopes-btn active" data-mode="waveform" title="Luma Waveform (0–100 IRE)">Waveform</button>
            <button class="scopes-btn" data-mode="parade" title="RGB Parade (Red, Green, Blue Channels)">Parade</button>
            <button class="scopes-btn" data-mode="vectorscope" title="Vectorscope UV (Hue, Saturation & Skin Tone)">Vector</button>
            <button class="scopes-btn" data-mode="histogram" title="RGB & Luminance Histogram">Hist</button>
          </div>

          <!-- Trace Controls & Close -->
          <div class="scopes-controls">
            <div class="scopes-gain-group" title="Trace Brightness Gain">
              <span class="scopes-gain-label">GAIN</span>
              <input type="range" class="scopes-slider" id="scopesGain" min="0.2" max="1.8" step="0.05" value="0.7">
              <span class="scopes-gain-val" id="scopesGainVal">70%</span>
            </div>
            <button class="scopes-close-btn" id="scopesCloseBtn" title="Close Scopes">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Scope Canvas Container -->
        <div class="scopes-canvas-container" id="scopesCanvasContainer">
          <canvas class="scopes-canvas" width="460" height="260" id="scopesCanvas"></canvas>
        </div>
      </div>
    `;

    this.panel = this.container.querySelector('#videoScopesPanel');
    this.canvas = this.container.querySelector('#scopesCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Handle high-DPI retina display
    const dpr = window.devicePixelRatio || 1;
    if (dpr > 1) {
      const logicalW = 460;
      const logicalH = 260;
      this.canvas.width = logicalW * dpr;
      this.canvas.height = logicalH * dpr;
      this.canvas.style.width = `${logicalW}px`;
      this.canvas.style.height = `${logicalH}px`;
      this.ctx.scale(dpr, dpr);
    }

    // Mode buttons
    const modeBtns = this.container.querySelectorAll('.scopes-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.dataset.mode;
        this.renderCurrentFrame();
      });
    });

    // Gain slider
    const gainSlider = this.container.querySelector('#scopesGain');
    const gainVal = this.container.querySelector('#scopesGainVal');
    gainSlider?.addEventListener('input', (e) => {
      this.intensity = parseFloat(e.target.value);
      if (gainVal) gainVal.textContent = `${Math.round(this.intensity * 100)}%`;
      this.renderCurrentFrame();
    });

    // Close button
    const closeBtn = this.container.querySelector('#scopesCloseBtn');
    closeBtn?.addEventListener('click', () => {
      this.hide();
    });
  }

  _initDraggable() {
    const header = this.container?.querySelector('#scopesHeader');
    if (!header || !this.container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.scopes-mode-selector') || e.target.closest('.scopes-controls')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.container.getBoundingClientRect();
      const parentRect = this.container.parentElement?.getBoundingClientRect() || { left: 0, top: 0 };
      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;

      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
      this.container.style.left = `${initialLeft}px`;
      this.container.style.top = `${initialTop}px`;

      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.container.style.left = `${Math.max(0, initialLeft + dx)}px`;
      this.container.style.top = `${Math.max(0, initialTop + dy)}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) isDragging = false;
    });
  }

  show() {
    this.visible = true;
    if (this.container) this.container.style.display = 'block';
    const toggleBtn = document.getElementById('btnToggleScopes');
    toggleBtn?.classList.add('active');
    this.renderCurrentFrame();
  }

  hide() {
    this.visible = false;
    if (this.container) this.container.style.display = 'none';
    const toggleBtn = document.getElementById('btnToggleScopes');
    toggleBtn?.classList.remove('active');
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  renderCurrentFrame() {
    if (!this.visible || !this.canvas || !window.compositor?.canvas) return;
    this.analyzeAndDraw(window.compositor.canvas);
  }

  /**
   * Main analysis and rendering loop
   * @param {HTMLCanvasElement} sourceCanvas
   */
  analyzeAndDraw(sourceCanvas) {
    if (!this.visible || !this.canvas || !this.ctx) return;

    const sw = Math.min(320, sourceCanvas.width || 320);
    const sh = Math.min(180, sourceCanvas.height || 180);

    if (this.sampleCanvas.width !== sw || this.sampleCanvas.height !== sh) {
      this.sampleCanvas.width = sw;
      this.sampleCanvas.height = sh;
    }

    // Downscale source frame for 60fps real-time analysis
    this.sampleCtx.drawImage(sourceCanvas, 0, 0, sw, sh);
    const imgData = this.sampleCtx.getImageData(0, 0, sw, sh);

    const dpr = window.devicePixelRatio || 1;
    const w = dpr > 1 ? this.canvas.width / dpr : this.canvas.width;
    const h = dpr > 1 ? this.canvas.height / dpr : this.canvas.height;
    const ctx = this.ctx;

    // Reset background with sleek deep studio vignette
    ctx.save();
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, w, h);

    // Subtle graticule baseline box
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    switch (this.mode) {
      case 'waveform':
        this._drawLumaWaveform(imgData, w, h);
        break;
      case 'parade':
        this._drawRGBParade(imgData, w, h);
        break;
      case 'vectorscope':
        this._drawVectorscope(imgData, w, h);
        break;
      case 'histogram':
        this._drawHistogram(imgData, w, h);
        break;
    }

    ctx.restore();
  }

  /**
   * 1. Luma Waveform Monitor with 0-100 IRE Graticules
   */
  _drawLumaWaveform(imgData, w, h) {
    const ctx = this.ctx;
    const { width: sw, height: sh, data } = imgData;

    // Draw IRE Graticule lines
    this._drawIREGraticules(ctx, w, h);

    // Accumulation buffer for CRT phosphor trace simulation
    const acc = new Float32Array(w * h);
    const step = this.sampleStep;

    const plotXOffset = 42;
    const plotW = w - plotXOffset - 6;

    for (let sy = 0; sy < sh; sy += step) {
      for (let sx = 0; sx < sw; sx += step) {
        const idx = (sy * sw + sx) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Rec. 709 Broadcast Luma standard
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        const targetX = Math.floor(plotXOffset + (sx / sw) * plotW);
        // Invert Y: 100 IRE at top, 0 IRE at bottom
        const targetY = Math.floor(h - 16 - (luma / 255.0) * (h - 32));

        if (targetX >= plotXOffset && targetX < w && targetY >= 0 && targetY < h) {
          acc[targetY * w + targetX] += this.intensity;
        }
      }
    }

    // Render phosphor trace with cyan/green glowing intensity
    const outImg = ctx.getImageData(0, 0, w, h);
    const outData = outImg.data;

    for (let y = 0; y < h; y++) {
      for (let x = plotXOffset; x < w; x++) {
        const val = acc[y * w + x];
        if (val > 0) {
          const pIdx = (y * w + x) * 4;
          const green = Math.min(255, val * 190);
          const cyan = Math.min(240, val * 140);
          const white = Math.min(255, Math.max(0, (val - 1.1) * 160));

          outData[pIdx] = Math.min(255, outData[pIdx] + white + cyan * 0.2);
          outData[pIdx + 1] = Math.min(255, outData[pIdx + 1] + green + white);
          outData[pIdx + 2] = Math.min(255, outData[pIdx + 2] + cyan + white);
        }
      }
    }

    ctx.putImageData(outImg, 0, 0);
  }

  /**
   * 2. RGB Parade (Red, Green, Blue individual channel monitors)
   */
  _drawRGBParade(imgData, w, h) {
    const ctx = this.ctx;
    const { width: sw, height: sh, data } = imgData;

    const channelWidth = Math.floor(w / 3);

    // Channel Graticules & Labels
    [
      { idx: 0, label: 'RED', color: '#ff4757', border: '#3a181e' },
      { idx: 1, label: 'GREEN', color: '#2ed573', border: '#143822' },
      { idx: 2, label: 'BLUE', color: '#1e90ff', border: '#142844' }
    ].forEach(ch => {
      const startX = ch.idx * channelWidth;
      const endX = startX + channelWidth - 1;

      // Channel background tint
      ctx.fillStyle = ch.border + '33';
      ctx.fillRect(startX, 0, channelWidth, h);

      // Divider line
      if (ch.idx > 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, h);
        ctx.stroke();
      }

      // 100 IRE and 0 IRE guidelines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(startX + 4, 18);
      ctx.lineTo(endX - 4, 18);
      ctx.moveTo(startX + 4, h - 16);
      ctx.lineTo(endX - 4, h - 16);
      ctx.stroke();
      ctx.setLineDash([]);

      // Channel Header Badge
      ctx.font = '600 10px Inter, -apple-system, sans-serif';
      ctx.fillStyle = ch.color;
      ctx.fillText(ch.label, startX + 8, 14);
    });

    const outImg = ctx.getImageData(0, 0, w, h);
    const outData = outImg.data;
    const step = this.sampleStep;

    for (let sy = 0; sy < sh; sy += step) {
      for (let sx = 0; sx < sw; sx += step) {
        const idx = (sy * sw + sx) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const relX = (sx / sw) * (channelWidth - 6);

        // Red trace
        const ry = Math.floor(h - 16 - (r / 255.0) * (h - 34));
        const rx = Math.floor(relX + 3);
        if (rx >= 0 && rx < channelWidth && ry >= 0 && ry < h) {
          const p = (ry * w + rx) * 4;
          outData[p] = Math.min(255, outData[p] + 190 * this.intensity);
          outData[p + 1] = Math.min(255, outData[p + 1] + 35 * this.intensity);
          outData[p + 2] = Math.min(255, outData[p + 2] + 40 * this.intensity);
        }

        // Green trace
        const gy = Math.floor(h - 16 - (g / 255.0) * (h - 34));
        const gx = Math.floor(channelWidth + relX + 3);
        if (gx >= channelWidth && gx < channelWidth * 2 && gy >= 0 && gy < h) {
          const p = (gy * w + gx) * 4;
          outData[p] = Math.min(255, outData[p] + 35 * this.intensity);
          outData[p + 1] = Math.min(255, outData[p + 1] + 200 * this.intensity);
          outData[p + 2] = Math.min(255, outData[p + 2] + 45 * this.intensity);
        }

        // Blue trace
        const by = Math.floor(h - 16 - (b / 255.0) * (h - 34));
        const bx = Math.floor(channelWidth * 2 + relX + 3);
        if (bx >= channelWidth * 2 && bx < w && by >= 0 && by < h) {
          const p = (by * w + bx) * 4;
          outData[p] = Math.min(255, outData[p] + 40 * this.intensity);
          outData[p + 1] = Math.min(255, outData[p + 1] + 70 * this.intensity);
          outData[p + 2] = Math.min(255, outData[p + 2] + 220 * this.intensity);
        }
      }
    }

    ctx.putImageData(outImg, 0, 0);
  }

  /**
   * 3. Vectorscope (Polar UV Chromaticity with SMPTE Color Targets & Skin Tone Line)
   */
  _drawVectorscope(imgData, w, h) {
    const ctx = this.ctx;
    const { width: sw, height: sh, data } = imgData;

    const centerX = Math.floor(w / 2);
    const centerY = Math.floor(h / 2);
    const maxRadius = Math.min(centerX, centerY) - 18;

    // Reticle concentric saturation circles: 25%, 50%, 75%, 100%
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1.0].forEach(factor => {
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius * factor, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(centerX - maxRadius - 6, centerY);
    ctx.lineTo(centerX + maxRadius + 6, centerY);
    ctx.moveTo(centerX, centerY - maxRadius - 6);
    ctx.lineTo(centerX, centerY + maxRadius + 6);
    ctx.stroke();

    // 75% SMPTE Broadcast Color Target Boxes: [R, Mg, B, Cy, G, Yl]
    const targets = [
      { name: 'R', angle: 104 * (Math.PI / 180), color: '#ff4757' },
      { name: 'Mg', angle: 61 * (Math.PI / 180), color: '#e056fd' },
      { name: 'B', angle: 347 * (Math.PI / 180), color: '#1e90ff' },
      { name: 'Cy', angle: 284 * (Math.PI / 180), color: '#00cec9' },
      { name: 'G', angle: 241 * (Math.PI / 180), color: '#2ed573' },
      { name: 'Yl', angle: 167 * (Math.PI / 180), color: '#f9ca24' }
    ];

    ctx.font = '700 9px JetBrains Mono, monospace';
    targets.forEach(t => {
      const tx = centerX + Math.cos(t.angle) * (maxRadius * 0.75);
      const ty = centerY - Math.sin(t.angle) * (maxRadius * 0.75);

      // Target bounding box
      ctx.strokeStyle = t.color + 'aa';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx - 4, ty - 4, 8, 8);

      // Inner target cross
      ctx.fillStyle = t.color;
      ctx.fillText(t.name, tx + 6, ty + 3);
    });

    // Broadcast Skin Tone Line (I-Bar at 57° from Q axis, ~123° polar)
    const skinAngle = 123 * (Math.PI / 180);
    const skinEndX = centerX + Math.cos(skinAngle) * (maxRadius * 1.05);
    const skinEndY = centerY - Math.sin(skinAngle) * (maxRadius * 1.05);

    ctx.save();
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(skinEndX, skinEndY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f39c12';
    ctx.font = '600 8px Inter, -apple-system, sans-serif';
    ctx.fillText('SKIN TONE', skinEndX - 42, skinEndY - 4);
    ctx.restore();

    // Accumulate UV chrominance trace
    const acc = new Float32Array(w * h);
    const step = this.sampleStep;

    for (let sy = 0; sy < sh; sy += step) {
      for (let sx = 0; sx < sw; sx += step) {
        const idx = (sy * sw + sx) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Rec. 709 U and V color difference conversion
        const u = -0.09991 * r - 0.33609 * g + 0.436 * b;
        const v = 0.615 * r - 0.55861 * g - 0.05639 * b;

        const targetX = Math.floor(centerX + (u / 128.0) * maxRadius);
        const targetY = Math.floor(centerY - (v / 128.0) * maxRadius);

        if (targetX >= 0 && targetX < w && targetY >= 0 && targetY < h) {
          acc[targetY * w + targetX] += this.intensity;
        }
      }
    }

    // Render chromatic trace
    const outImg = ctx.getImageData(0, 0, w, h);
    const outData = outImg.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const val = acc[y * w + x];
        if (val > 0) {
          const p = (y * w + x) * 4;
          const green = Math.min(255, val * 180);
          const cyan = Math.min(240, val * 130);
          const white = Math.min(255, Math.max(0, (val - 1.2) * 180));

          outData[p] = Math.min(255, outData[p] + white);
          outData[p + 1] = Math.min(255, outData[p + 1] + green + white);
          outData[p + 2] = Math.min(255, outData[p + 2] + cyan + white);
        }
      }
    }

    ctx.putImageData(outImg, 0, 0);
  }

  /**
   * 4. RGB & Luminance Broadcast Histogram
   */
  _drawHistogram(imgData, w, h) {
    const ctx = this.ctx;
    const { data } = imgData;

    const histR = new Uint32Array(256);
    const histG = new Uint32Array(256);
    const histB = new Uint32Array(256);
    const histL = new Uint32Array(256);

    let maxCount = 0;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

      histR[r]++;
      histG[g]++;
      histB[b]++;
      histL[l]++;

      if (histR[r] > maxCount) maxCount = histR[r];
      if (histG[g] > maxCount) maxCount = histG[g];
      if (histB[b] > maxCount) maxCount = histB[b];
    }

    if (maxCount === 0) return;

    // Background horizontal baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 24);
    ctx.lineTo(w, h - 24);
    ctx.stroke();

    // Smoothed area fill helper
    const drawFilledHist = (hist, strokeColor, fillColor) => {
      ctx.beginPath();
      ctx.moveTo(0, h - 24);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255.0) * w;
        const barH = (hist[i] / maxCount) * (h - 48);
        const y = h - 24 - barH;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h - 24);
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    };

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawFilledHist(histR, 'rgba(255, 71, 87, 0.85)', 'rgba(255, 71, 87, 0.25)');
    drawFilledHist(histG, 'rgba(46, 213, 115, 0.85)', 'rgba(46, 213, 115, 0.25)');
    drawFilledHist(histB, 'rgba(30, 144, 255, 0.85)', 'rgba(30, 144, 255, 0.25)');
    drawFilledHist(histL, 'rgba(255, 255, 255, 0.65)', 'rgba(255, 255, 255, 0.12)');
    ctx.restore();

    // Footer readouts
    ctx.font = '600 9px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('0 (SHADOWS)', 8, h - 8);
    ctx.fillText('128 (MIDTONES)', w / 2 - 38, h - 8);
    ctx.fillText('255 (HIGHLIGHTS)', w - 96, h - 8);
  }

  _drawIREGraticules(ctx, w, h) {
    const ires = [
      { ire: 100, label: '100 IRE', y: 16, color: '#ff4757', dash: false },
      { ire: 80, label: '80', y: 16 + (h - 34) * 0.2, color: 'rgba(255,255,255,0.18)', dash: true },
      { ire: 60, label: '60', y: 16 + (h - 34) * 0.4, color: 'rgba(255,255,255,0.18)', dash: true },
      { ire: 40, label: '40', y: 16 + (h - 34) * 0.6, color: 'rgba(255,255,255,0.18)', dash: true },
      { ire: 20, label: '20', y: 16 + (h - 34) * 0.8, color: 'rgba(255,255,255,0.18)', dash: true },
      { ire: 0, label: '0 IRE', y: h - 18, color: '#2ed573', dash: false }
    ];

    ctx.font = '600 9px JetBrains Mono, monospace';
    ires.forEach(line => {
      ctx.save();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.dash ? 0.8 : 1.2;
      if (line.dash) ctx.setLineDash([3, 4]);

      ctx.beginPath();
      ctx.moveTo(42, line.y);
      ctx.lineTo(w - 4, line.y);
      ctx.stroke();

      ctx.fillStyle = line.color.startsWith('#') ? line.color : 'rgba(255,255,255,0.45)';
      ctx.fillText(line.label, 4, line.y + 3);
      ctx.restore();
    });
  }
}

window.videoScopes = new VideoScopes();
