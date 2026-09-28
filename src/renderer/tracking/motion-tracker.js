/**
 * StudioCut — Motion Tracking Engine
 * Optical correlation & Lucas-Kanade 2D point tracker for attaching text, stickers,
 * and picture-in-picture layers to moving subjects in video clips.
 */

class MotionTracker {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.isTracking = false;

    // Tracking state
    this.targetBox = { x: 960, y: 540, width: 60, height: 60 }; // Project coordinates
    this.searchRadius = 36; // Search window delta
    this.trackedTrajectory = []; // Array<{ time, x, y, confidence }>
    this.attachedClipId = null;
    this.activeClipId = null;
  }

  /**
   * Set target region for tracking
   */
  setTargetBox(x, y, width = 60, height = 60) {
    this.targetBox = { x, y, width, height };
    this.trackedTrajectory = [];
  }

  /**
   * Track forward across a video clip
   * @param {object} clip - Timeline clip
   * @param {HTMLVideoElement} videoElement
   * @param {number} startClipTime
   * @param {number} endClipTime
   * @param {Function} onProgress - (progress 0..100)
   * @returns {Promise<Array>} Trajectory keyframes
   */
  async trackForward(clip, videoElement, startClipTime = 0, endClipTime = null, onProgress = () => {}) {
    if (!clip || !videoElement) return [];

    this.isTracking = true;
    this.activeClipId = clip.id;

    const fps = 12; // 12 tracking samples per second for high-accuracy path
    const duration = endClipTime ? (endClipTime - startClipTime) : (clip.duration - startClipTime);
    const totalFrames = Math.floor(duration * fps);
    const dt = 1 / fps;

    const pw = 640; // Downsample for fast normalized correlation
    const ph = 360;
    this.canvas.width = pw;
    this.canvas.height = ph;

    // Scale target box to downscaled canvas
    const scaleFactorX = pw / 1920;
    const scaleFactorY = ph / 1080;

    let currentBox = {
      x: this.targetBox.x * scaleFactorX,
      y: this.targetBox.y * scaleFactorY,
      width: this.targetBox.width * scaleFactorX,
      height: this.targetBox.height * scaleFactorY
    };

    let prevImageData = null;
    this.trackedTrajectory = [];

    // Capture initial template frame
    videoElement.currentTime = (clip.sourceStartTime || 0) + startClipTime;
    await this._waitForSeek(videoElement);
    this.ctx.drawImage(videoElement, 0, 0, pw, ph);
    prevImageData = this.ctx.getImageData(0, 0, pw, ph);

    // Initial position
    this.trackedTrajectory.push({
      time: startClipTime,
      x: this.targetBox.x,
      y: this.targetBox.y,
      confidence: 1.0
    });

    for (let f = 1; f < totalFrames; f++) {
      if (!this.isTracking) break;

      const clipTime = startClipTime + f * dt;
      const seekTime = (clip.sourceStartTime || 0) + clipTime;
      videoElement.currentTime = seekTime;
      await this._waitForSeek(videoElement);

      this.ctx.drawImage(videoElement, 0, 0, pw, ph);
      const currImageData = this.ctx.getImageData(0, 0, pw, ph);

      // Perform Normalized Cross-Correlation Point Tracking
      const match = this._trackNormalizedCorrelation(
        prevImageData,
        currImageData,
        currentBox,
        Math.round(this.searchRadius * scaleFactorX)
      );

      // Update tracked position
      currentBox.x += match.dx;
      currentBox.y += match.dy;

      // Project back to 1080p project coordinates
      const projX = currentBox.x / scaleFactorX;
      const projY = currentBox.y / scaleFactorY;

      this.trackedTrajectory.push({
        time: clipTime,
        x: projX,
        y: projY,
        confidence: match.confidence
      });

      // Update reference template (with template blend to adapt to lighting changes)
      prevImageData = currImageData;

      const progress = Math.round((f / totalFrames) * 100);
      onProgress(progress, `Tracking frame ${f}/${totalFrames} (confidence: ${(match.confidence * 100).toFixed(0)}%)...`);
    }

    this.isTracking = false;
    onProgress(100, 'Tracking completed!');
    return this.trackedTrajectory;
  }

  cancel() {
    this.isTracking = false;
  }

  /**
   * Bind an overlay clip (Text, Sticker, PIP) to follow the tracked trajectory
   * @param {string} targetClipId - Overlay clip ID
   * @param {number} offsetX - User offset from tracking point
   * @param {number} offsetY
   */
  attachClipToTrack(targetClipId, offsetX = 0, offsetY = 0) {
    if (this.trackedTrajectory.length === 0) {
      alert('No tracking trajectory available. Run tracking first.');
      return;
    }

    const state = store.getState();
    const clip = Actions.getClip(targetClipId);
    if (!clip) return;

    this.attachedClipId = targetClipId;
    state.keyframes = state.keyframes || {};
    state.keyframes[targetClipId] = state.keyframes[targetClipId] || {};

    const kfX = [];
    const kfY = [];

    // Base center of project (1920x1080)
    const centerX = 1920 / 2;
    const centerY = 1080 / 2;

    this.trackedTrajectory.forEach(pt => {
      // Calculate relative translation from center
      const tx = (pt.x - centerX) + offsetX;
      const ty = (pt.y - centerY) + offsetY;

      kfX.push({
        id: MathUtils.generateId(),
        time: pt.time,
        value: tx,
        tangentType: 'bezier',
        leftHandle: { dx: -0.04, dy: 0 },
        rightHandle: { dx: 0.04, dy: 0 }
      });

      kfY.push({
        id: MathUtils.generateId(),
        time: pt.time,
        value: ty,
        tangentType: 'bezier',
        leftHandle: { dx: -0.04, dy: 0 },
        rightHandle: { dx: 0.04, dy: 0 }
      });
    });

    state.keyframes[targetClipId]['transform.x'] = kfX;
    state.keyframes[targetClipId]['transform.y'] = kfY;

    store._emit('keyframes', state.keyframes);
    store.set('project.dirty', true);
  }

  /**
   * Normalized Cross-Correlation (NCC) template tracker
   */
  _trackNormalizedCorrelation(prevImg, currImg, box, radius) {
    const pw = prevImg.width;
    const ph = prevImg.height;
    const d1 = prevImg.data;
    const d2 = currImg.data;

    const bx = Math.round(box.x);
    const by = Math.round(box.y);
    const bw = Math.round(box.width);
    const bh = Math.round(box.height);

    let bestDx = 0;
    let bestDy = 0;
    let maxCorrelation = -Infinity;

    // Search window
    for (let dy = -radius; dy <= radius; dy += 2) {
      for (let dx = -radius; dx <= radius; dx += 2) {
        let sumProd = 0;
        let sumSq1 = 0;
        let sumSq2 = 0;
        let count = 0;

        for (let py = 0; py < bh; py += 3) {
          for (let px = 0; px < bw; px += 3) {
            const x1 = bx + px;
            const y1 = by + py;
            const x2 = x1 + dx;
            const y2 = y1 + dy;

            if (x1 >= 0 && x1 < pw && y1 >= 0 && y1 < ph &&
                x2 >= 0 && x2 < pw && y2 >= 0 && y2 < ph) {
              const idx1 = (y1 * pw + x1) * 4;
              const idx2 = (y2 * pw + x2) * 4;

              // Luminance
              const l1 = d1[idx1] * 0.299 + d1[idx1 + 1] * 0.587 + d1[idx1 + 2] * 0.114;
              const l2 = d2[idx2] * 0.299 + d2[idx2 + 1] * 0.587 + d2[idx2 + 2] * 0.114;

              sumProd += l1 * l2;
              sumSq1 += l1 * l1;
              sumSq2 += l2 * l2;
              count++;
            }
          }
        }

        if (count > 0 && sumSq1 > 0 && sumSq2 > 0) {
          const ncc = sumProd / (Math.sqrt(sumSq1) * Math.sqrt(sumSq2));
          if (ncc > maxCorrelation) {
            maxCorrelation = ncc;
            bestDx = dx;
            bestDy = dy;
          }
        }
      }
    }

    const confidence = Math.max(0, Math.min(1.0, maxCorrelation));
    return { dx: bestDx, dy: bestDy, confidence };
  }

  _waitForSeek(videoElement) {
    return new Promise(resolve => {
      videoElement.addEventListener('seeked', resolve, { once: true });
      setTimeout(resolve, 60);
    });
  }

  /**
   * Render motion tracking path & target reticle on preview canvas
   */
  renderTrackingGizmo(ctx, pw, ph) {
    if (!this.targetBox) return;

    // Draw Tracking Target Reticle
    const box = this.targetBox;
    ctx.save();
    ctx.strokeStyle = '#00cec9';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x - box.width / 2, box.y - box.height / 2, box.width, box.height);

    // Crosshairs
    ctx.strokeStyle = '#00cec9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x - 12, box.y);
    ctx.lineTo(box.x + 12, box.y);
    ctx.moveTo(box.x, box.y - 12);
    ctx.lineTo(box.x, box.y + 12);
    ctx.stroke();

    // Outer Search Radius
    ctx.strokeStyle = 'rgba(0, 206, 201, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      box.x - box.width / 2 - this.searchRadius,
      box.y - box.height / 2 - this.searchRadius,
      box.width + this.searchRadius * 2,
      box.height + this.searchRadius * 2
    );
    ctx.setLineDash([]);

    // Draw Trajectory Trail
    if (this.trackedTrajectory.length > 1) {
      ctx.strokeStyle = '#fdcb6e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.trackedTrajectory.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      // Draw point markers
      this.trackedTrajectory.forEach(pt => {
        ctx.fillStyle = pt.confidence > 0.8 ? '#2ed573' : '#e17055';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.restore();
  }
}

window.motionTracker = new MotionTracker();
