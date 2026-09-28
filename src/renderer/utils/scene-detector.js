/**
 * StudioCut — Scene Edit Detection Engine
 * Frame-by-frame color histogram distance, Edge Change Ratio (ECR) via Sobel edge gradient,
 * adaptive dynamic thresholding, and automated timeline clip slicing at camera cuts.
 */

class SceneEditDetector {
  constructor() {
    this.isAnalyzing = false;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.canvas.width = 160; // Fast downscaled analysis frame
    this.canvas.height = 90;
    this.detectedCuts = []; // Array<{ time, confidence, thumbnail }>
  }

  /**
   * Run scene edit detection on a video clip
   * @param {object} clip - Timeline clip
   * @param {HTMLVideoElement} videoElement
   * @param {Function} onProgress - (progress 0..100, statusText)
   * @returns {Promise<Array>} Detected cut points
   */
  async detectCuts(clip, videoElement, onProgress = () => {}) {
    if (!videoElement) {
      console.error('Video element required for scene detection.');
      return [];
    }

    this.isAnalyzing = true;
    this.detectedCuts = [];

    const duration = clip.duration || videoElement.duration || 10;
    const fps = 6; // Sample at 6 frames per second for ultra-fast and accurate cut detection
    const totalFrames = Math.floor(duration * fps);
    const timeStep = 1 / fps;

    let prevHist = null;
    let prevEdges = null;
    let prevLuma = -1;

    const diffHistory = [];

    onProgress(0, 'Initializing frame analysis...');

    for (let f = 0; f < totalFrames; f++) {
      if (!this.isAnalyzing) break;

      const seekTime = (clip.sourceStartTime || 0) + (f * timeStep);
      videoElement.currentTime = seekTime;

      // Wait for frame seek
      await new Promise(resolve => {
        const onSeeked = () => {
          videoElement.removeEventListener('seeked', onSeeked);
          resolve();
        };
        videoElement.addEventListener('seeked', onSeeked, { once: true });
        // Timeout fallback
        setTimeout(resolve, 80);
      });

      // Draw downscaled frame
      this.ctx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
      const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      const hist = this._computeColorHistogram(imgData);
      const edges = this._computeEdgeGradients(imgData);
      const luma = this._computeAverageLuminance(imgData);

      if (prevHist && prevEdges) {
        // 1. Color Histogram Chi-Square distance
        const histDiff = this._compareHistograms(prevHist, hist);

        // 2. Edge Change Ratio (ECR)
        const edgeDiff = this._compareEdges(prevEdges, edges);

        // 3. Luminance difference
        const lumaDelta = Math.abs(luma - prevLuma);

        // Composite difference score
        const combinedScore = (histDiff * 0.6) + (edgeDiff * 0.3) + (lumaDelta * 0.1);
        diffHistory.push(combinedScore);

        // Adaptive threshold based on rolling statistics
        const threshold = this._calculateDynamicThreshold(diffHistory);

        if (combinedScore > threshold && combinedScore > 0.38) {
          // Detected a hard cut
          const cutTimelineTime = (clip.startTime || 0) + (f * timeStep);

          // Avoid duplicate cuts within 0.4 seconds
          const lastCut = this.detectedCuts[this.detectedCuts.length - 1];
          if (!lastCut || cutTimelineTime - lastCut.time > 0.4) {
            // Generate small thumbnail for cut review
            const thumbnail = this.canvas.toDataURL('image/jpeg', 0.6);
            this.detectedCuts.push({
              time: cutTimelineTime,
              sourceTime: seekTime,
              score: combinedScore,
              thumbnail: thumbnail
            });
          }
        }
      }

      prevHist = hist;
      prevEdges = edges;
      prevLuma = luma;

      const progress = Math.round((f / totalFrames) * 100);
      onProgress(progress, `Scanning frame ${f}/${totalFrames} (${this.detectedCuts.length} cuts found)...`);
    }

    this.isAnalyzing = false;
    onProgress(100, `Done! Detected ${this.detectedCuts.length} cuts.`);
    return this.detectedCuts;
  }

  cancel() {
    this.isAnalyzing = false;
  }

  /**
   * Automatically slice the timeline clip at all detected cut points
   */
  sliceClipAtCuts(clipId) {
    if (this.detectedCuts.length === 0) {
      alert('No cuts detected to slice.');
      return;
    }

    // Sort cuts in descending order so splitting later points doesn't affect earlier IDs
    const cuts = [...this.detectedCuts].sort((a, b) => b.time - a.time);

    cuts.forEach(cut => {
      // Find clip containing cut time
      const state = store.getState();
      for (const track of state.tracks) {
        const target = track.clips.find(c => cut.time > c.startTime + 0.1 && cut.time < c.startTime + c.duration - 0.1);
        if (target) {
          Actions.splitClip(target.id, cut.time);
          break;
        }
      }
    });

    Actions._recalculateDuration();
  }

  /**
   * 3D RGB Color Histogram calculation (4 bins per channel = 64 total bins)
   */
  _computeColorHistogram(imgData) {
    const bins = new Float32Array(64);
    const data = imgData.data;
    const len = data.length;
    const totalPixels = len / 4;

    for (let i = 0; i < len; i += 4) {
      const r = Math.min(3, Math.floor(data[i] / 64));
      const g = Math.min(3, Math.floor(data[i + 1] / 64));
      const b = Math.min(3, Math.floor(data[i + 2] / 64));
      const binIdx = r * 16 + g * 4 + b;
      bins[binIdx]++;
    }

    // Normalize
    for (let i = 0; i < 64; i++) {
      bins[i] /= totalPixels;
    }

    return bins;
  }

  /**
   * Bhattacharyya distance between two normalized histograms
   */
  _compareHistograms(h1, h2) {
    let bc = 0;
    for (let i = 0; i < 64; i++) {
      bc += Math.sqrt(h1[i] * h2[i]);
    }
    return 1.0 - bc; // 0 = identical, 1 = completely disjoint
  }

  /**
   * Fast Sobel Edge gradient estimation
   */
  _computeEdgeGradients(imgData) {
    const w = imgData.width;
    const h = imgData.height;
    const data = imgData.data;
    const edges = new Uint8Array(w * h);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        // Luminance of 3x3 neighborhood
        const l00 = data[((y - 1) * w + (x - 1)) * 4];
        const l02 = data[((y - 1) * w + (x + 1)) * 4];
        const l10 = data[(y * w + (x - 1)) * 4];
        const l12 = data[(y * w + (x + 1)) * 4];
        const l20 = data[((y + 1) * w + (x - 1)) * 4];
        const l22 = data[((y + 1) * w + (x + 1)) * 4];

        // Horizontal Sobel
        const gx = -l00 + l02 - 2 * l10 + 2 * l12 - l20 + l22;
        // Vertical Sobel
        const gy = -l00 - 2 * data[((y - 1) * w + x) * 4] - l02 + l20 + 2 * data[((y + 1) * w + x) * 4] + l22;

        const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        edges[y * w + x] = mag > 45 ? 1 : 0;
      }
    }

    return edges;
  }

  _compareEdges(e1, e2) {
    let diff = 0;
    const len = e1.length;
    for (let i = 0; i < len; i++) {
      if (e1[i] !== e2[i]) diff++;
    }
    return diff / len;
  }

  _computeAverageLuminance(imgData) {
    const data = imgData.data;
    const len = data.length;
    let sum = 0;
    for (let i = 0; i < len; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return sum / (len / 4) / 255.0;
  }

  _calculateDynamicThreshold(diffHistory) {
    if (diffHistory.length < 5) return 0.45;
    const recent = diffHistory.slice(-20);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
    const stdDev = Math.sqrt(variance);

    // Adaptive 2.5 sigma threshold
    return Math.max(0.35, Math.min(0.75, mean + 2.5 * stdDev));
  }
}

window.sceneEditDetector = new SceneEditDetector();
