/**
 * StudioCut — Smart Auto-Reframe Engine
 * Intelligent social media reframing (16:9 widescreen to 9:16 vertical, 1:1 square, 4:5 portrait)
 * utilizing saliency & skin-tone subject tracking with critically damped spring camera smoothing.
 */

class AutoReframeEngine {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.canvas.width = 160;
    this.canvas.height = 90;
    this.isProcessing = false;
  }

  /**
   * Reframe a video clip to a target aspect ratio
   * @param {object} clip - Timeline clip
   * @param {HTMLVideoElement} videoElement
   * @param {string} targetRatio - '9:16', '1:1', '4:5'
   * @param {string} motionPreset - 'smooth', 'action', 'default'
   * @param {Function} onProgress - (progress 0..100)
   */
  async reframeClip(clip, videoElement, targetRatio = '9:16', motionPreset = 'smooth', onProgress = () => {}) {
    if (!clip || !videoElement) return;

    this.isProcessing = true;
    onProgress(5, 'Analyzing subject region of interest...');

    const clipDuration = clip.duration || 10;
    const fps = 8; // 8 samples per second for smooth panning trajectory
    const totalFrames = Math.floor(clipDuration * fps);
    const dt = 1 / fps;

    const rawCenters = []; // Array<{ time, xNormalized }>

    // 1. Frame analysis pass to track center of interest
    for (let f = 0; f < totalFrames; f++) {
      if (!this.isProcessing) break;

      const seekTime = (clip.sourceStartTime || 0) + (f * dt);
      videoElement.currentTime = seekTime;

      await new Promise(resolve => {
        videoElement.addEventListener('seeked', resolve, { once: true });
        setTimeout(resolve, 60);
      });

      this.ctx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
      const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      const center = this._detectSaliencyCenter(imgData);
      rawCenters.push({ time: f * dt, x: center.x });

      const pct = Math.round((f / totalFrames) * 60);
      onProgress(pct, `Tracking subject at ${seekTime.toFixed(1)}s...`);
    }

    if (rawCenters.length === 0) {
      this.isProcessing = false;
      return;
    }

    onProgress(70, 'Solving smooth camera physics trajectory...');

    // 2. Camera Solver: Critically Damped Spring Filter
    const smoothPositions = this._solveCameraTrajectory(rawCenters, motionPreset);

    onProgress(85, 'Baking transform keyframes...');

    // 3. Compute scale factor needed for target aspect ratio
    // 16:9 = 1.777. 9:16 = 0.5625. Scale required to fill vertical frame = 1.777 / 0.5625 = 3.16x
    let targetScale = 1.0;
    let maxOffsetPx = 0;

    switch (targetRatio) {
      case '9:16':
        targetScale = 1.78;
        maxOffsetPx = (1920 * targetScale - 1080) / 2;
        break;
      case '1:1':
        targetScale = 1.33;
        maxOffsetPx = (1920 * targetScale - 1080) / 2;
        break;
      case '4:5':
        targetScale = 1.42;
        maxOffsetPx = (1920 * targetScale - 1080) / 2;
        break;
      default:
        targetScale = 1.78;
        maxOffsetPx = (1920 * targetScale - 1080) / 2;
    }

    // Set clip base scale
    clip.transform = clip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    clip.transform.scaleX = targetScale;
    clip.transform.scaleY = targetScale;

    // Clear existing transform.x keyframes for this clip
    const state = store.getState();
    state.keyframes = state.keyframes || {};
    state.keyframes[clip.id] = state.keyframes[clip.id] || {};
    state.keyframes[clip.id]['transform.x'] = [];

    // Bake keyframes every ~0.5s or on major movement
    let lastBakeX = null;
    smoothPositions.forEach((pos, idx) => {
      // Map normalized center [0, 1] (0.5 is center) to pixel translation
      // If subject is on the right (x=0.8), camera must pan right by translating image left (negative X)
      const offsetFactor = (0.5 - pos.x);
      const pixelX = offsetFactor * maxOffsetPx * 1.5;

      if (lastBakeX === null || Math.abs(pixelX - lastBakeX) > 15 || idx === smoothPositions.length - 1) {
        state.keyframes[clip.id]['transform.x'].push({
          id: MathUtils.generateId(),
          time: pos.time,
          value: pixelX,
          tangentType: 'bezier',
          leftHandle: { dx: -0.2, dy: 0 },
          rightHandle: { dx: 0.2, dy: 0 }
        });
        lastBakeX = pixelX;
      }
    });

    onProgress(100, 'Auto-reframe complete!');
    this.isProcessing = false;

    store._emit('keyframes', state.keyframes);
    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
  }

  /**
   * Saliency detector: combines human skin tone detection, high contrast edges, and center weight
   */
  _detectSaliencyCenter(imgData) {
    const w = imgData.width;
    const h = imgData.height;
    const data = imgData.data;

    let weightedSumX = 0;
    let totalWeight = 0.001;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // 1. Skin tone heuristic in RGB space
        const isSkin = (r > 95 && g > 40 && b > 20 &&
                        (r - g) > 15 && (r - b) > 15 &&
                        r > g && r > b);

        // 2. High contrast / edge intensity
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const contrast = Math.abs(luma - 128) / 128.0;

        // 3. Gentle center bias (rule of thirds preference)
        const centerDist = Math.abs(x - w / 2) / (w / 2);
        const centerBias = 1.0 - centerDist * 0.3;

        let weight = contrast * centerBias;
        if (isSkin) weight += 3.5; // Strong weight on human faces/skin

        weightedSumX += x * weight;
        totalWeight += weight;
      }
    }

    const avgX = weightedSumX / totalWeight;
    return { x: avgX / w }; // Normalized [0, 1]
  }

  /**
   * Critically Damped Spring Smoothing Filter
   */
  _solveCameraTrajectory(rawPositions, preset) {
    let omega = 2.0; // Spring frequency
    if (preset === 'action') omega = 4.5;
    if (preset === 'smooth') omega = 1.2;

    const smoothed = [];
    let currentX = rawPositions[0].x;
    let velocityX = 0;

    for (let i = 0; i < rawPositions.length; i++) {
      const targetX = rawPositions[i].x;
      const dt = i === 0 ? 0.125 : (rawPositions[i].time - rawPositions[i - 1].time);

      // Critically damped spring simulation: F = -k*x - c*v
      const delta = targetX - currentX;
      const accel = (omega * omega * delta) - (2.0 * omega * velocityX);

      velocityX += accel * dt;
      currentX += velocityX * dt;

      smoothed.push({ time: rawPositions[i].time, x: currentX });
    }

    return smoothed;
  }
}

window.autoReframeEngine = new AutoReframeEngine();
