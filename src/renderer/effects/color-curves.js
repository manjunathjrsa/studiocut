/**
 * StudioCut — Color Curves Engine & Spline Editor
 * Professional RGB & Master (Luma) tone curve processor with spline interpolation,
 * 256-entry lookup table (LUT) generation, and interactive canvas curve widget.
 */

class SplineCurve {
  /**
   * @param {Array<{x: number, y: number}>} points - Normalized [0, 1] control points
   */
  constructor(points = [{ x: 0, y: 0 }, { x: 1, y: 1 }]) {
    this.points = points.slice().sort((a, b) => a.x - b.x);
    this.lut = new Uint8Array(256);
    this.updateLut();
  }

  /**
   * Add or update a control point
   */
  setPoint(x, y) {
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    const existingIndex = this.points.findIndex(p => Math.abs(p.x - x) < 0.02);
    if (existingIndex !== -1) {
      if (existingIndex === 0) {
        this.points[0] = { x: 0, y };
      } else if (existingIndex === this.points.length - 1) {
        this.points[this.points.length - 1] = { x: 1, y };
      } else {
        this.points[existingIndex] = { x, y };
      }
    } else {
      this.points.push({ x, y });
      this.points.sort((a, b) => a.x - b.x);
    }
    this.updateLut();
  }

  /**
   * Remove a point (endpoints x=0 and x=1 cannot be removed)
   */
  removePoint(index) {
    if (index > 0 && index < this.points.length - 1) {
      this.points.splice(index, 1);
      this.updateLut();
      return true;
    }
    return false;
  }

  /**
   * Reset curve to linear identity [ (0,0), (1,1) ]
   */
  reset() {
    this.points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    this.updateLut();
  }

  /**
   * Monotone cubic spline interpolation (Fritsch-Carlson method)
   * Prevents overshoots and preserves monotonicity
   */
  updateLut() {
    const n = this.points.length;
    if (n < 2) {
      for (let i = 0; i < 256; i++) this.lut[i] = i;
      return;
    }

    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);

    // Consecutive secants
    const dxs = [];
    const dys = [];
    const ms = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = xs[i + 1] - xs[i];
      const dy = ys[i + 1] - ys[i];
      dxs.push(dx);
      dys.push(dy);
      ms.push(dx === 0 ? 0 : dy / dx);
    }

    // Tangents
    const tangents = [ms[0]];
    for (let i = 0; i < n - 2; i++) {
      const m0 = ms[i];
      const m1 = ms[i + 1];
      if (m0 * m1 <= 0) {
        tangents.push(0);
      } else {
        const dx0 = dxs[i];
        const dx1 = dxs[i + 1];
        tangents.push(3 * (dx0 + dx1) / ((2 * dx1 + dx0) / m0 + (dx1 + 2 * dx0) / m1));
      }
    }
    tangents.push(ms[n - 2]);

    // Rescale tangents to satisfy Fritsch-Carlson monotonicity
    for (let i = 0; i < n - 1; i++) {
      const m = ms[i];
      if (m === 0) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
      } else {
        const a = tangents[i] / m;
        const b = tangents[i + 1] / m;
        const s = a * a + b * b;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          tangents[i] = t * a * m;
          tangents[i + 1] = t * b * m;
        }
      }
    }

    // Generate 256-entry lookup table
    let seg = 0;
    for (let i = 0; i < 256; i++) {
      const x = i / 255.0;

      // Find appropriate segment
      while (seg < n - 2 && x > xs[seg + 1]) {
        seg++;
      }

      const x0 = xs[seg];
      const x1 = xs[seg + 1];
      const y0 = ys[seg];
      const y1 = ys[seg + 1];
      const h = x1 - x0;
      const t = h === 0 ? 0 : (x - x0) / h;
      const t2 = t * t;
      const t3 = t2 * t;

      // Hermite basis functions
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      const val = h00 * y0 + h10 * h * tangents[seg] + h01 * y1 + h11 * h * tangents[seg + 1];
      const clamped = Math.max(0, Math.min(1, val));
      this.lut[i] = Math.round(clamped * 255);
    }
  }

  /**
   * Evaluate curve at normalized point x [0, 1]
   */
  evaluate(x) {
    const idx = Math.max(0, Math.min(255, Math.round(x * 255)));
    return this.lut[idx] / 255.0;
  }
}

class ColorCurvesEngine {
  constructor() {
    this.channels = {
      master: new SplineCurve(),
      red: new SplineCurve(),
      green: new SplineCurve(),
      blue: new SplineCurve()
    };

    // Off-screen canvas for LUT pixel application
    this.bufferCanvas = document.createElement('canvas');
    this.bufferCtx = this.bufferCanvas.getContext('2d');
  }

  /**
   * Reset all curves
   */
  resetAll() {
    this.channels.master.reset();
    this.channels.red.reset();
    this.channels.green.reset();
    this.channels.blue.reset();
  }

  /**
   * Check if any curve is non-linear
   */
  isActive() {
    const isChannelActive = (curve) => {
      if (curve.points.length !== 2) return true;
      return (
        curve.points[0].x !== 0 || curve.points[0].y !== 0 ||
        curve.points[1].x !== 1 || curve.points[1].y !== 1
      );
    };
    return (
      isChannelActive(this.channels.master) ||
      isChannelActive(this.channels.red) ||
      isChannelActive(this.channels.green) ||
      isChannelActive(this.channels.blue)
    );
  }

  /**
   * Apply curve presets
   */
  applyPreset(presetName) {
    this.resetAll();
    switch (presetName) {
      case 's-curve':
        // High contrast S-Curve
        this.channels.master.points = [
          { x: 0, y: 0 },
          { x: 0.25, y: 0.18 },
          { x: 0.75, y: 0.82 },
          { x: 1, y: 1 }
        ];
        this.channels.master.updateLut();
        break;

      case 'cross-process':
        // Modern cinematic cross-process: warm highlights, cool teal shadows
        this.channels.red.points = [
          { x: 0, y: 0.05 },
          { x: 0.5, y: 0.52 },
          { x: 1, y: 0.95 }
        ];
        this.channels.green.points = [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.48 },
          { x: 1, y: 1 }
        ];
        this.channels.blue.points = [
          { x: 0, y: 0.12 },
          { x: 0.5, y: 0.45 },
          { x: 1, y: 0.88 }
        ];
        this.channels.red.updateLut();
        this.channels.green.updateLut();
        this.channels.blue.updateLut();
        break;

      case 'matte-black':
        // Lifted shadows / vintage film look
        this.channels.master.points = [
          { x: 0, y: 0.12 },
          { x: 0.3, y: 0.28 },
          { x: 1, y: 0.96 }
        ];
        this.channels.master.updateLut();
        break;

      case 'warm-highlights':
        this.channels.red.points = [
          { x: 0, y: 0 },
          { x: 0.7, y: 0.75 },
          { x: 1, y: 1 }
        ];
        this.channels.blue.points = [
          { x: 0, y: 0 },
          { x: 0.7, y: 0.65 },
          { x: 1, y: 0.92 }
        ];
        this.channels.red.updateLut();
        this.channels.blue.updateLut();
        break;

      case 'cool-shadows':
        this.channels.blue.points = [
          { x: 0, y: 0.1 },
          { x: 0.3, y: 0.35 },
          { x: 1, y: 1 }
        ];
        this.channels.red.points = [
          { x: 0, y: 0 },
          { x: 0.3, y: 0.25 },
          { x: 1, y: 1 }
        ];
        this.channels.blue.updateLut();
        this.channels.red.updateLut();
        break;

      case 'linear':
      default:
        this.resetAll();
        break;
    }
  }

  /**
   * Apply curve LUT directly to ImageData
   */
  applyToImageData(imageData, curvesState = null) {
    const data = imageData.data;
    const len = data.length;

    const mLut = curvesState?.master?.lut || this.channels.master.lut;
    const rLut = curvesState?.red?.lut || this.channels.red.lut;
    const gLut = curvesState?.green?.lut || this.channels.green.lut;
    const bLut = curvesState?.blue?.lut || this.channels.blue.lut;

    for (let i = 0; i < len; i += 4) {
      // Apply RGB individual channels first, then master luma tone curve
      let r = rLut[data[i]];
      let g = gLut[data[i + 1]];
      let b = bLut[data[i + 2]];

      data[i] = mLut[r];
      data[i + 1] = mLut[g];
      data[i + 2] = mLut[b];
      // alpha channel data[i+3] unchanged
    }

    return imageData;
  }

  /**
   * Apply curves to a canvas or video element and return processed canvas
   */
  applyToCanvas(sourceCanvas, curvesState = null) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    if (this.bufferCanvas.width !== w || this.bufferCanvas.height !== h) {
      this.bufferCanvas.width = w;
      this.bufferCanvas.height = h;
    }

    this.bufferCtx.drawImage(sourceCanvas, 0, 0);
    const imgData = this.bufferCtx.getImageData(0, 0, w, h);
    this.applyToImageData(imgData, curvesState);
    this.bufferCtx.putImageData(imgData, 0, 0);

    return this.bufferCanvas;
  }

  /**
   * Export curves data to JSON serializable object
   */
  serialize() {
    return {
      master: this.channels.master.points.map(p => ({ ...p })),
      red: this.channels.red.points.map(p => ({ ...p })),
      green: this.channels.green.points.map(p => ({ ...p })),
      blue: this.channels.blue.points.map(p => ({ ...p }))
    };
  }

  /**
   * Restore from serialized curves data
   */
  deserialize(data) {
    if (!data) return;
    if (data.master) {
      this.channels.master.points = data.master.map(p => ({ ...p }));
      this.channels.master.updateLut();
    }
    if (data.red) {
      this.channels.red.points = data.red.map(p => ({ ...p }));
      this.channels.red.updateLut();
    }
    if (data.green) {
      this.channels.green.points = data.green.map(p => ({ ...p }));
      this.channels.green.updateLut();
    }
    if (data.blue) {
      this.channels.blue.points = data.blue.map(p => ({ ...p }));
      this.channels.blue.updateLut();
    }
  }
}

/**
 * Interactive Color Curves Widget UI Component
 */
class ColorCurvesWidget {
  /**
   * @param {HTMLElement} container
   * @param {ColorCurvesEngine} curvesEngine
   * @param {Function} onChange
   */
  constructor(container, curvesEngine, onChange = () => {}) {
    this.container = container;
    this.engine = curvesEngine;
    this.onChange = onChange;
    this.activeChannel = 'master';
    this.draggedPointIndex = -1;
    this.hoveredPointIndex = -1;

    this._buildUI();
    this._attachEvents();
    this.render();
  }

  _buildUI() {
    this.container.innerHTML = `
      <div class="color-curves-widget">
        <div class="curves-channel-bar">
          <button class="curves-tab active" data-channel="master" title="Master (Luma)">RGB</button>
          <button class="curves-tab curves-tab--red" data-channel="red" title="Red Channel">Red</button>
          <button class="curves-tab curves-tab--green" data-channel="green" title="Green Channel">Green</button>
          <button class="curves-tab curves-tab--blue" data-channel="blue" title="Blue Channel">Blue</button>
          <div class="curves-spacer"></div>
          <select class="curves-preset-select" id="curvesPresetSelect">
            <option value="">Presets...</option>
            <option value="s-curve">High Contrast (S-Curve)</option>
            <option value="cross-process">Cinematic Cross-Process</option>
            <option value="matte-black">Matte Black (Film)</option>
            <option value="warm-highlights">Warm Highlights</option>
            <option value="cool-shadows">Cool Shadows</option>
            <option value="linear">Reset Linear</option>
          </select>
          <button class="btn btn--ghost btn--xs" id="curvesResetBtn" title="Reset Current Channel">↺</button>
        </div>
        <div class="curves-canvas-wrapper">
          <canvas class="curves-canvas" width="260" height="260"></canvas>
        </div>
      </div>
    `;

    this.canvas = this.container.querySelector('.curves-canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  _attachEvents() {
    const tabs = this.container.querySelectorAll('.curves-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeChannel = tab.dataset.channel;
        this.render();
      });
    });

    const presetSelect = this.container.querySelector('#curvesPresetSelect');
    presetSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        this.engine.applyPreset(e.target.value);
        this.render();
        this.onChange(this.engine.serialize());
        e.target.value = '';
      }
    });

    const resetBtn = this.container.querySelector('#curvesResetBtn');
    resetBtn.addEventListener('click', () => {
      this.engine.channels[this.activeChannel].reset();
      this.render();
      this.onChange(this.engine.serialize());
    });

    // Canvas interactions
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      const pos = getPos(e);
      const curve = this.engine.channels[this.activeChannel];

      // Check if clicking near existing point
      const clickedIdx = curve.points.findIndex(p => {
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        return Math.sqrt(dx * dx + dy * dy) < 0.06;
      });

      if (e.button === 2) {
        // Right click: delete point
        if (clickedIdx > 0 && clickedIdx < curve.points.length - 1) {
          curve.removePoint(clickedIdx);
          this.render();
          this.onChange(this.engine.serialize());
        }
        return;
      }

      if (clickedIdx !== -1) {
        this.draggedPointIndex = clickedIdx;
      } else {
        // Insert point
        curve.setPoint(pos.x, pos.y);
        this.draggedPointIndex = curve.points.findIndex(p => Math.abs(p.x - pos.x) < 0.02);
        this.onChange(this.engine.serialize());
      }
      this.render();
    });

    window.addEventListener('mousemove', (e) => {
      if (this.draggedPointIndex === -1) {
        // Hover detection
        const rect = this.canvas.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const pos = getPos(e);
          const curve = this.engine.channels[this.activeChannel];
          this.hoveredPointIndex = curve.points.findIndex(p => {
            const dx = p.x - pos.x;
            const dy = p.y - pos.y;
            return Math.sqrt(dx * dx + dy * dy) < 0.06;
          });
          this.render();
        }
        return;
      }

      const pos = getPos(e);
      const curve = this.engine.channels[this.activeChannel];
      const idx = this.draggedPointIndex;

      if (idx === 0) {
        curve.points[0].y = pos.y;
      } else if (idx === curve.points.length - 1) {
        curve.points[curve.points.length - 1].y = pos.y;
      } else {
        curve.points[idx].x = pos.x;
        curve.points[idx].y = pos.y;
        curve.points.sort((a, b) => a.x - b.x);
        this.draggedPointIndex = curve.points.findIndex(p => Math.abs(p.x - pos.x) < 0.01);
      }

      curve.updateLut();
      this.render();
      this.onChange(this.engine.serialize());
    });

    window.addEventListener('mouseup', () => {
      if (this.draggedPointIndex !== -1) {
        this.draggedPointIndex = -1;
        this.render();
      }
    });

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark grid background
    ctx.fillStyle = '#141419';
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = '#282834';
    ctx.lineWidth = 1;
    const steps = 4;
    for (let i = 1; i < steps; i++) {
      const pos = (i / steps) * w;
      // Vertical line
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, h);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(w, pos);
      ctx.stroke();
    }

    // Diagonal reference line
    ctx.strokeStyle = '#323242';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Channel color map
    const channelColors = {
      master: '#ffffff',
      red: '#ff4757',
      green: '#2ed573',
      blue: '#1e90ff'
    };

    // Draw inactive curves softly in background
    Object.keys(this.engine.channels).forEach(ch => {
      if (ch === this.activeChannel) return;
      const curve = this.engine.channels[ch];
      ctx.strokeStyle = channelColors[ch] + '40'; // 25% opacity
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * w;
        const y = h - (curve.lut[i] / 255) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // Draw active channel curve
    const activeCurve = this.engine.channels[this.activeChannel];
    const activeColor = channelColors[this.activeChannel];

    // Curve area gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, activeColor + '30');
    grad.addColorStop(1, activeColor + '05');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = h - (activeCurve.lut[i] / 255) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Active curve stroke
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = h - (activeCurve.lut[i] / 255) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw control points
    activeCurve.points.forEach((p, idx) => {
      const px = p.x * w;
      const py = h - p.y * h;
      const isHovered = idx === this.hoveredPointIndex;
      const isDragged = idx === this.draggedPointIndex;

      // Glow effect
      if (isHovered || isDragged) {
        ctx.fillStyle = activeColor + '44';
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = activeColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, isDragged ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
}

// Global instance
window.colorCurvesEngine = new ColorCurvesEngine();
window.ColorCurvesWidget = ColorCurvesWidget;
