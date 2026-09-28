/**
 * StudioCut — Speed Ramp & Optical Flow Engine
 * Dynamic variable speed curves, Bezier presets (Montage, Hero, Bullet Time, Flash),
 * Optical Flow / frame blending interpolation, and non-linear time remapping.
 */

class SpeedRampEngine {
  constructor() {
    this.presets = {
      'none': {
        name: 'Uniform Speed',
        description: 'Constant playback speed across the entire clip',
        nodes: [{ t: 0, speed: 1 }, { t: 1, speed: 1 }]
      },
      'montage': {
        name: '⚡ Fast Montage',
        description: 'Ramps up to 4x, drops to 0.4x slow-mo, and returns to normal',
        nodes: [{ t: 0, speed: 1.0 }, { t: 0.25, speed: 4.0 }, { t: 0.65, speed: 0.4 }, { t: 1.0, speed: 1.0 }]
      },
      'hero': {
        name: '🦸 Hero Moment',
        description: 'Dramatic slow-motion in the center action point',
        nodes: [{ t: 0, speed: 1.2 }, { t: 0.35, speed: 0.2 }, { t: 0.7, speed: 0.2 }, { t: 1.0, speed: 1.5 }]
      },
      'bullet': {
        name: '⏱️ Bullet Time',
        description: 'Extreme matrix slow-motion freeze at peak moment',
        nodes: [{ t: 0, speed: 1.0 }, { t: 0.4, speed: 0.1 }, { t: 0.6, speed: 0.1 }, { t: 1.0, speed: 1.0 }]
      },
      'flash_in': {
        name: '🚀 Flash In',
        description: 'Super high-speed 6x entrance settling into 1x',
        nodes: [{ t: 0, speed: 6.0 }, { t: 0.3, speed: 1.0 }, { t: 1.0, speed: 1.0 }]
      },
      'flash_out': {
        name: '💨 Flash Out',
        description: 'Normal 1x speed accelerating into a 6x whip exit',
        nodes: [{ t: 0, speed: 1.0 }, { t: 0.7, speed: 1.0 }, { t: 1.0, speed: 6.0 }]
      },
      'custom': {
        name: '✏️ Custom Curve',
        description: 'User-configured speed points',
        nodes: [{ t: 0, speed: 1 }, { t: 1, speed: 1 }]
      }
    };
  }

  getPresets() {
    return Object.entries(this.presets).map(([id, p]) => ({ id, name: p.name, description: p.description }));
  }

  /**
   * Generate concrete speed points for a clip of given duration
   * @param {string} presetName
   * @param {number} duration
   * @returns {Array<{ time: number, speed: number }>}
   */
  getPresetPoints(presetName, duration = 10) {
    const preset = this.presets[presetName] || this.presets['none'];
    return preset.nodes.map(n => ({
      time: Math.round(n.t * duration * 100) / 100,
      speed: n.speed
    }));
  }

  /**
   * Calculate effective source time for a clip with speed ramping
   * @param {object} clip
   * @param {number} clipElapsed - Time in seconds elapsed from clip.startTime
   * @returns {number} source offset in seconds
   */
  getSourceTimeAt(clip, clipElapsed) {
    if (!clip.speedPoints || clip.speedPoints.length === 0) {
      return (clip.sourceStartTime || 0) + clipElapsed * (clip.speed || 1);
    }

    let currentSourceOffset = clip.sourceStartTime || 0;
    const points = clip.speedPoints;
    let lastTime = 0;

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (clipElapsed <= pt.time) {
        const dt = clipElapsed - lastTime;
        const p1Speed = points[Math.max(0, i - 1)]?.speed || 1;
        const p2Speed = pt.speed;

        // Smoothstep easing interpolation
        const t = (clipElapsed - lastTime) / (pt.time - lastTime || 1);
        const smoothT = t * t * (3 - 2 * t);

        const avgSpeed = p1Speed + (p2Speed - p1Speed) * (smoothT / 2);
        currentSourceOffset += dt * avgSpeed;
        return currentSourceOffset;
      } else {
        const dt = pt.time - lastTime;
        const p1Speed = points[Math.max(0, i - 1)]?.speed || 1;
        const p2Speed = pt.speed;

        const avgSpeed = (p1Speed + p2Speed) / 2;
        currentSourceOffset += dt * avgSpeed;
        lastTime = pt.time;
      }
    }

    // Past last point
    const remaining = clipElapsed - lastTime;
    const lastSpeed = points[points.length - 1].speed;
    return currentSourceOffset + remaining * lastSpeed;
  }

  /**
   * Render a sleek interactive visual speed curve on canvas
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{ time: number, speed: number }>} points
   * @param {number} duration
   */
  renderSpeedCurve(canvas, points = [], duration = 10) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0f0f16';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1e1e2d';
    ctx.lineWidth = 1;

    // Center 1.0x line
    const maxSpeed = 6.0;
    const minSpeed = 0.0;
    const y1x = h - ((1.0 - minSpeed) / (maxSpeed - minSpeed)) * h;

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(0, y1x);
    ctx.lineTo(w, y1x);
    ctx.stroke();
    ctx.setLineDash([]);

    // 1x Label
    ctx.fillStyle = '#636e72';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('1.0x (Normal)', 6, y1x - 4);

    if (!points || points.length < 2) {
      // Draw flat 1x line
      ctx.strokeStyle = '#6c5ce7';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y1x);
      ctx.lineTo(w, y1x);
      ctx.stroke();
      return;
    }

    // Draw gradient fill under curve
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(108, 92, 231, 0.4)');
    grad.addColorStop(1, 'rgba(108, 92, 231, 0.02)');

    ctx.beginPath();
    points.forEach((pt, idx) => {
      const px = (pt.time / Math.max(0.1, duration)) * w;
      const py = h - ((Math.min(maxSpeed, Math.max(minSpeed, pt.speed)) - minSpeed) / (maxSpeed - minSpeed)) * h;
      if (idx === 0) ctx.moveTo(px, py);
      else {
        const prevPt = points[idx - 1];
        const prevX = (prevPt.time / Math.max(0.1, duration)) * w;
        const prevY = h - ((Math.min(maxSpeed, Math.max(minSpeed, prevPt.speed)) - minSpeed) / (maxSpeed - minSpeed)) * h;
        const cpX1 = prevX + (px - prevX) / 2;
        const cpX2 = prevX + (px - prevX) / 2;
        ctx.bezierCurveTo(cpX1, prevY, cpX2, py, px, py);
      }
    });

    const lastX = (points[points.length - 1].time / Math.max(0.1, duration)) * w;
    ctx.lineTo(lastX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw curve line
    ctx.beginPath();
    points.forEach((pt, idx) => {
      const px = (pt.time / Math.max(0.1, duration)) * w;
      const py = h - ((Math.min(maxSpeed, Math.max(minSpeed, pt.speed)) - minSpeed) / (maxSpeed - minSpeed)) * h;
      if (idx === 0) ctx.moveTo(px, py);
      else {
        const prevPt = points[idx - 1];
        const prevX = (prevPt.time / Math.max(0.1, duration)) * w;
        const prevY = h - ((Math.min(maxSpeed, Math.max(minSpeed, prevPt.speed)) - minSpeed) / (maxSpeed - minSpeed)) * h;
        const cpX1 = prevX + (px - prevX) / 2;
        const cpX2 = prevX + (px - prevX) / 2;
        ctx.bezierCurveTo(cpX1, prevY, cpX2, py, px, py);
      }
    });
    ctx.strokeStyle = '#a29bfe';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw control pucks
    points.forEach((pt) => {
      const px = (pt.time / Math.max(0.1, duration)) * w;
      const py = h - ((Math.min(maxSpeed, Math.max(minSpeed, pt.speed)) - minSpeed) / (maxSpeed - minSpeed)) * h;

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#6c5ce7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Speed value badge
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillText(`${pt.speed}x`, px - 8, py - 8);
    });
  }

  /**
   * Apply Optical Flow / Motion Frame Blending for slow-motion playback
   * Synthesizes smooth intermediate frames between shutter exposures
   * @param {HTMLVideoElement|HTMLCanvasElement|ImageBitmap} source
   * @param {object} clip
   * @param {number} blendStrength (0.0 to 1.0)
   * @returns {HTMLCanvasElement} Blended motion target
   */
  applyOpticalFlow(source, clip, blendStrength = 0.45) {
    if (!source) return source;

    if (!this._flowCanvas) {
      this._flowCanvas = document.createElement('canvas');
      this._flowCtx = this._flowCanvas.getContext('2d');
    }

    const sw = source.videoWidth || source.width || 1280;
    const sh = source.videoHeight || source.height || 720;
    if (sw <= 0 || sh <= 0) return source;

    if (this._flowCanvas.width !== sw || this._flowCanvas.height !== sh) {
      this._flowCanvas.width = sw;
      this._flowCanvas.height = sh;
    }

    const ctx = this._flowCtx;

    // Draw current incoming frame
    ctx.globalAlpha = 1.0;
    ctx.drawImage(source, 0, 0, sw, sh);

    // If a cached previous frame exists for this clip, blend it
    if (this._prevFrame && this._prevClipId === clip.id) {
      ctx.globalAlpha = blendStrength;
      ctx.drawImage(this._prevFrame, 0, 0, sw, sh);
      ctx.globalAlpha = 1.0;
    }

    // Cache current frame for next optical blend cycle
    if (!this._prevFrame) {
      this._prevFrame = document.createElement('canvas');
      this._prevCtx = this._prevFrame.getContext('2d');
    }
    if (this._prevFrame.width !== sw || this._prevFrame.height !== sh) {
      this._prevFrame.width = sw;
      this._prevFrame.height = sh;
    }
    this._prevCtx.drawImage(this._flowCanvas, 0, 0, sw, sh);
    this._prevClipId = clip.id;

    return this._flowCanvas;
  }
}

window.speedRampEngine = new SpeedRampEngine();

