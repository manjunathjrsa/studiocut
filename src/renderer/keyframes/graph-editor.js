/**
 * StudioCut — Keyframe Bezier Graph Editor
 * Visual cubic-bezier curve editor for keyframe interpolation, tangent handle manipulation,
 * velocity acceleration curves, and interactive graph canvas.
 */

class KeyframeGraphEditor {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.clipId = null;
    this.activeProperty = 'transform.x'; // 'transform.x', 'transform.y', 'transform.scaleX', 'opacity', etc.
    this.viewMode = 'value'; // 'value', 'velocity'

    // Viewport transform
    this.zoomX = 60; // Pixels per second
    this.zoomY = 1.0; // Pixels per value unit
    this.panX = 40;  // Pixel offset
    this.panY = 150; // Pixel offset (center line)

    this.selectedKeyframeIndex = -1;
    this.draggedHandle = null; // 'point', 'leftHandle', 'rightHandle'
    this.dragStart = null;
  }

  init(container) {
    this.container = container;
    this._buildUI();
    this._attachEvents();
  }

  _buildUI() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="graph-editor-panel" id="graphEditorPanel">
        <div class="graph-editor-toolbar">
          <div class="graph-editor-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/><path d="M6 18c4 0 4-12 12-12"/>
            </svg>
            <span>KEYFRAME CURVES</span>
          </div>

          <select class="graph-prop-select" id="graphPropSelect">
            <optgroup label="Transform">
              <option value="transform.x">Position X</option>
              <option value="transform.y">Position Y</option>
              <option value="transform.scaleX">Scale</option>
              <option value="transform.rotation">Rotation</option>
            </optgroup>
            <optgroup label="Compositing">
              <option value="opacity">Opacity</option>
              <option value="volume">Audio Volume</option>
            </optgroup>
          </select>

          <div class="graph-tangent-tools">
            <button class="graph-tangent-btn" data-tangent="linear" title="Linear Interpolation">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="21" x2="21" y2="3"/></svg>
              <span>Linear</span>
            </button>
            <button class="graph-tangent-btn active" data-tangent="bezier" title="Smooth Cubic Bezier">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 19c6 0 6-14 18-14"/></svg>
              <span>Bezier</span>
            </button>
            <button class="graph-tangent-btn" data-tangent="ease-in" title="Ease In (Smooth Acceleration)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 20c10 0 16-8 18-16"/></svg>
              <span>Ease In</span>
            </button>
            <button class="graph-tangent-btn" data-tangent="ease-out" title="Ease Out (Smooth Deceleration)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 20c2-8 8-16 18-16"/></svg>
              <span>Ease Out</span>
            </button>
            <button class="graph-tangent-btn" data-tangent="hold" title="Hold / Step Keyframe">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 20 12 20 12 4 21 4"/></svg>
              <span>Hold</span>
            </button>
          </div>

          <div class="graph-spacer"></div>
          <button class="graph-tangent-btn" id="graphFitViewBtn" title="Fit Curve to View (Ctrl+0)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            <span>Fit</span>
          </button>
          <button class="graph-editor-close" id="graphCloseBtn" title="Close Graph Editor">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="graph-canvas-container">
          <canvas class="graph-canvas" id="graphCanvas" width="640" height="280"></canvas>
        </div>
      </div>
    `;

    this.canvas = this.container.querySelector('#graphCanvas');
    this.ctx = this.canvas.getContext('2d');
  }

  _attachEvents() {
    const propSelect = this.container.querySelector('#graphPropSelect');
    propSelect?.addEventListener('change', (e) => {
      this.activeProperty = e.target.value;
      this.selectedKeyframeIndex = -1;
      this.render();
    });

    const tangentBtns = this.container.querySelectorAll('[data-tangent]');
    tangentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTangentForSelected(btn.dataset.tangent);
      });
    });

    const fitBtn = this.container.querySelector('#graphFitViewBtn');
    fitBtn?.addEventListener('click', () => {
      this.fitToView();
    });

    const closeBtn = this.container.querySelector('#graphCloseBtn');
    closeBtn?.addEventListener('click', () => {
      this.hide();
    });

    // Canvas Mouse Interactions (Dragging Points & Handles)
    this._attachCanvasInteractions();

    // Listen to selection changes in the application
    store.on('selection.clipIds', (ids) => {
      if (ids && ids.length > 0) {
        this.clipId = ids[0];
        this.render();
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (this.canvas && this.container) {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) {
          this.canvas.width = rect.width;
          this.canvas.height = rect.height;
          this.render();
        }
      }
    });
    if (this.canvas) resizeObserver.observe(this.canvas.parentElement);
  }

  _attachCanvasInteractions() {
    const canvas = this.canvas;

    const screenToGraph = (sx, sy) => {
      const time = (sx - this.panX) / this.zoomX;
      const value = (this.panY - sy) / this.zoomY;
      return { time, value };
    };

    const graphToScreen = (time, value) => {
      const sx = this.panX + time * this.zoomX;
      const sy = this.panY - value * this.zoomY;
      return { sx, sy };
    };

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const kfs = this._getKeyframes();
      if (!kfs || kfs.length === 0) return;

      // 1. Check if clicked a tangent handle of selected keyframe
      if (this.selectedKeyframeIndex !== -1 && kfs[this.selectedKeyframeIndex]) {
        const selKf = kfs[this.selectedKeyframeIndex];
        const pt = graphToScreen(selKf.time, selKf.value);

        // Left handle
        if (selKf.leftHandle) {
          const lh = graphToScreen(selKf.time + selKf.leftHandle.dx, selKf.value + selKf.leftHandle.dy);
          if (Math.hypot(mx - lh.sx, my - lh.sy) < 8) {
            this.draggedHandle = 'leftHandle';
            this.dragStart = { mx, my, orig: { ...selKf.leftHandle } };
            return;
          }
        }

        // Right handle
        if (selKf.rightHandle) {
          const rh = graphToScreen(selKf.time + selKf.rightHandle.dx, selKf.value + selKf.rightHandle.dy);
          if (Math.hypot(mx - rh.sx, my - rh.sy) < 8) {
            this.draggedHandle = 'rightHandle';
            this.dragStart = { mx, my, orig: { ...selKf.rightHandle } };
            return;
          }
        }
      }

      // 2. Check if clicked a keyframe point
      let foundIdx = -1;
      kfs.forEach((kf, idx) => {
        const scr = graphToScreen(kf.time, kf.value);
        if (Math.hypot(mx - scr.sx, my - scr.sy) < 10) {
          foundIdx = idx;
        }
      });

      if (foundIdx !== -1) {
        this.selectedKeyframeIndex = foundIdx;
        this.draggedHandle = 'point';
        this.dragStart = { mx, my, origTime: kfs[foundIdx].time, origValue: kfs[foundIdx].value };
        this.render();
        return;
      }

      // 3. Middle click or Alt+Drag to pan
      if (e.button === 1 || e.altKey) {
        this.draggedHandle = 'pan';
        this.dragStart = { mx, my, origPanX: this.panX, origPanY: this.panY };
        return;
      }

      // Clicked empty space: deselect
      this.selectedKeyframeIndex = -1;
      this.render();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.draggedHandle) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const kfs = this._getKeyframes();
      if (!kfs) return;

      if (this.draggedHandle === 'pan') {
        const dx = mx - this.dragStart.mx;
        const dy = my - this.dragStart.my;
        this.panX = this.dragStart.origPanX + dx;
        this.panY = this.dragStart.origPanY + dy;
        this.render();
        return;
      }

      const selKf = kfs[this.selectedKeyframeIndex];
      if (!selKf) return;

      if (this.draggedHandle === 'point') {
        const dTime = (mx - this.dragStart.mx) / this.zoomX;
        const dVal = -(my - this.dragStart.my) / this.zoomY;
        selKf.time = Math.max(0, this.dragStart.origTime + dTime);
        selKf.value = this.dragStart.origValue + dVal;
        kfs.sort((a, b) => a.time - b.time);
        this.selectedKeyframeIndex = kfs.findIndex(k => k === selKf);
        this.render();
        this._notifyKeyframeChange();
      } else if (this.draggedHandle === 'leftHandle') {
        const pt = graphToScreen(selKf.time, selKf.value);
        selKf.leftHandle = {
          dx: (mx - pt.sx) / this.zoomX,
          dy: -(my - pt.sy) / this.zoomY
        };
        // Symmetric smooth tangent
        if (selKf.tangentType === 'bezier') {
          selKf.rightHandle = { dx: -selKf.leftHandle.dx, dy: -selKf.leftHandle.dy };
        }
        this.render();
        this._notifyKeyframeChange();
      } else if (this.draggedHandle === 'rightHandle') {
        const pt = graphToScreen(selKf.time, selKf.value);
        selKf.rightHandle = {
          dx: (mx - pt.sx) / this.zoomX,
          dy: -(my - pt.sy) / this.zoomY
        };
        if (selKf.tangentType === 'bezier') {
          selKf.leftHandle = { dx: -selKf.rightHandle.dx, dy: -selKf.rightHandle.dy };
        }
        this.render();
        this._notifyKeyframeChange();
      }
    });

    window.addEventListener('mouseup', () => {
      this.draggedHandle = null;
    });

    // Zooming via mouse wheel
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

      if (e.shiftKey) {
        // Zoom Y
        this.zoomY = Math.max(0.05, Math.min(20, this.zoomY * zoomFactor));
      } else {
        // Zoom X
        this.zoomX = Math.max(10, Math.min(500, this.zoomX * zoomFactor));
      }
      this.render();
    });
  }

  show(clipId = null) {
    if (clipId) this.clipId = clipId;
    if (this.container) this.container.style.display = 'block';
    this.render();
  }

  hide() {
    if (this.container) this.container.style.display = 'none';
  }

  toggle(clipId = null) {
    if (this.container?.style.display === 'block') this.hide();
    else this.show(clipId);
  }

  /**
   * Set tangent interpolation for the selected keyframe
   */
  setTangentForSelected(type) {
    const kfs = this._getKeyframes();
    if (!kfs || this.selectedKeyframeIndex === -1) return;

    const kf = kfs[this.selectedKeyframeIndex];
    if (!kf) return;

    kf.tangentType = type;
    switch (type) {
      case 'linear':
        delete kf.leftHandle;
        delete kf.rightHandle;
        break;
      case 'bezier':
        kf.leftHandle = { dx: -0.3, dy: 0 };
        kf.rightHandle = { dx: 0.3, dy: 0 };
        break;
      case 'ease-in':
        kf.leftHandle = { dx: -0.4, dy: 0 };
        delete kf.rightHandle;
        break;
      case 'ease-out':
        delete kf.leftHandle;
        kf.rightHandle = { dx: 0.4, dy: 0 };
        break;
      case 'hold':
        delete kf.leftHandle;
        delete kf.rightHandle;
        break;
    }

    this.render();
    this._notifyKeyframeChange();
  }

  fitToView() {
    const kfs = this._getKeyframes();
    if (!kfs || kfs.length === 0) return;

    let minT = Infinity, maxT = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    kfs.forEach(k => {
      if (k.time < minT) minT = k.time;
      if (k.time > maxT) maxT = k.time;
      if (k.value < minV) minV = k.value;
      if (k.value > maxV) maxV = k.value;
    });

    const w = this.canvas.width;
    const h = this.canvas.height;

    const dt = Math.max(1.0, maxT - minT);
    const dv = Math.max(1.0, maxV - minV);

    this.zoomX = (w - 120) / dt;
    this.zoomY = (h - 100) / dv;
    this.panX = 60 - minT * this.zoomX;
    this.panY = h / 2 + ((maxV + minV) / 2) * this.zoomY;

    this.render();
  }

  _getKeyframes() {
    if (!this.clipId) {
      const selIds = store.get('selection.clipIds');
      if (selIds && selIds.length > 0) this.clipId = selIds[0];
    }
    if (!this.clipId) return null;

    const stateKeyframes = store.getState().keyframes || {};
    const clipKfs = stateKeyframes[this.clipId] || {};
    return clipKfs[this.activeProperty] || null;
  }

  _notifyKeyframeChange() {
    store._emit('keyframes', store.getState().keyframes);
    store.set('project.dirty', true);
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark grid background
    ctx.fillStyle = '#101017';
    ctx.fillRect(0, 0, w, h);

    // Coordinate grid lines
    ctx.strokeStyle = '#20202e';
    ctx.lineWidth = 1;

    // Zero-value axis line
    const zeroY = this.panY;
    ctx.strokeStyle = '#38384f';
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();

    // Time grids (every 1 second)
    const startSec = Math.floor((-this.panX) / this.zoomX);
    const endSec = Math.ceil((w - this.panX) / this.zoomX);

    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = '#636e72';

    for (let s = startSec; s <= endSec; s++) {
      const gx = this.panX + s * this.zoomX;
      ctx.strokeStyle = s === 0 ? '#485460' : '#1e1e2c';
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();

      if (s >= 0) {
        ctx.fillText(`${s}s`, gx + 4, h - 8);
      }
    }

    const kfs = this._getKeyframes();
    if (!kfs || kfs.length === 0) {
      ctx.fillStyle = '#636e72';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('No keyframes on this property. Add keyframes in the Inspector to edit curves.', 20, 40);
      return;
    }

    const graphToScreen = (time, value) => ({
      sx: this.panX + time * this.zoomX,
      sy: this.panY - value * this.zoomY
    });

    // 1. Draw smooth bezier curve through keyframes
    ctx.strokeStyle = '#00cec9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    for (let i = 0; i < kfs.length; i++) {
      const p1 = graphToScreen(kfs[i].time, kfs[i].value);

      if (i === 0) {
        ctx.moveTo(p1.sx, p1.sy);
      } else {
        const p0Kf = kfs[i - 1];
        const p1Kf = kfs[i];
        const p0 = graphToScreen(p0Kf.time, p0Kf.value);

        if (p0Kf.tangentType === 'hold') {
          // Hold / Step interpolation
          ctx.lineTo(p1.sx, p0.sy);
          ctx.lineTo(p1.sx, p1.sy);
        } else if (p0Kf.rightHandle || p1Kf.leftHandle) {
          // Cubic Bezier interpolation
          const cp1x = p0Kf.rightHandle ? p0.sx + p0Kf.rightHandle.dx * this.zoomX : p0.sx + (p1.sx - p0.sx) * 0.4;
          const cp1y = p0Kf.rightHandle ? p0.sy - p0Kf.rightHandle.dy * this.zoomY : p0.sy;
          const cp2x = p1Kf.leftHandle ? p1.sx + p1Kf.leftHandle.dx * this.zoomX : p1.sx - (p1.sx - p0.sx) * 0.4;
          const cp2y = p1Kf.leftHandle ? p1.sy - p1Kf.leftHandle.dy * this.zoomY : p1.sy;

          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p1.sx, p1.sy);
        } else {
          // Linear interpolation
          ctx.lineTo(p1.sx, p1.sy);
        }
      }
    }
    ctx.stroke();

    // 2. Draw Tangent Handles for selected keyframe
    if (this.selectedKeyframeIndex !== -1 && kfs[this.selectedKeyframeIndex]) {
      const selKf = kfs[this.selectedKeyframeIndex];
      const pt = graphToScreen(selKf.time, selKf.value);

      const drawHandle = (handle, isLeft) => {
        if (!handle) return;
        const hx = pt.sx + handle.dx * this.zoomX;
        const hy = pt.sy - handle.dy * this.zoomY;

        // Tangent arm
        ctx.strokeStyle = '#fdcb6e';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(pt.sx, pt.sy);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        // Tangent knob
        ctx.fillStyle = '#fdcb6e';
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      };

      drawHandle(selKf.leftHandle, true);
      drawHandle(selKf.rightHandle, false);
    }

    // 3. Draw keyframe diamonds
    kfs.forEach((kf, idx) => {
      const scr = graphToScreen(kf.time, kf.value);
      const isSelected = idx === this.selectedKeyframeIndex;

      ctx.fillStyle = isSelected ? '#ff7675' : '#00cec9';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;

      // Draw diamond shape
      const size = isSelected ? 6 : 5;
      ctx.beginPath();
      ctx.moveTo(scr.sx, scr.sy - size);
      ctx.lineTo(scr.sx + size, scr.sy);
      ctx.moveTo(scr.sx, scr.sy + size);
      ctx.lineTo(scr.sx - size, scr.sy);
      ctx.lineTo(scr.sx, scr.sy - size);
      ctx.lineTo(scr.sx + size, scr.sy);
      ctx.fill();
      ctx.stroke();

      // Value readout
      if (isSelected) {
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillStyle = '#ff7675';
        ctx.fillText(`t:${kf.time.toFixed(2)}s val:${kf.value.toFixed(1)}`, scr.sx + 8, scr.sy - 8);
      }
    });
  }
}

window.keyframeGraphEditor = new KeyframeGraphEditor();
