/**
 * StudioCut — Audio Effects & Equalizer
 * Web Audio 3-band EQ, synthetic reverb, delay/echo, and real-time frequency spectrum analyzer
 */

class AudioEffectsManager {
  constructor() {
    this.audioContext = null;
  }

  _ensureContext() {
    if (!this.audioContext && window.audioEngine?.ctx) {
      this.audioContext = window.audioEngine.ctx;
    }
    return this.audioContext;
  }

  /**
   * Create a 3-band EQ node chain (legacy support)
   */
  createEqualizer(bassGain = 0, midGain = 0, trebleGain = 0) {
    return this.create4BandEQ({
      low: bassGain,
      lowMid: midGain,
      highMid: 0,
      high: trebleGain
    });
  }

  /**
   * Create a professional 4-Band Parametric Equalizer chain:
   * Band 1: Low Shelf (80-250Hz, default 100Hz)
   * Band 2: Low-Mid Peaking (250-1500Hz, default 500Hz)
   * Band 3: High-Mid Peaking (1.5k-6kHz, default 2500Hz)
   * Band 4: High Shelf (6k-16kHz, default 10000Hz)
   */
  create4BandEQ(settings = {}) {
    const ctx = this._ensureContext();
    if (!ctx) return null;

    const lowGain = settings.lowGain ?? settings.low ?? 0;
    const lowMidGain = settings.lowMidGain ?? settings.lowMid ?? 0;
    const highMidGain = settings.highMidGain ?? settings.highMid ?? 0;
    const highGain = settings.highGain ?? settings.high ?? 0;

    const lowFreq = settings.lowFreq || 100;
    const lowMidFreq = settings.lowMidFreq || 500;
    const highMidFreq = settings.highMidFreq || 2500;
    const highFreq = settings.highFreq || 10000;

    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = lowFreq;
    low.gain.value = lowGain;

    const lowMid = ctx.createBiquadFilter();
    lowMid.type = 'peaking';
    lowMid.frequency.value = lowMidFreq;
    lowMid.Q.value = settings.lowMidQ || 1.0;
    lowMid.gain.value = lowMidGain;

    const highMid = ctx.createBiquadFilter();
    highMid.type = 'peaking';
    highMid.frequency.value = highMidFreq;
    highMid.Q.value = settings.highMidQ || 1.0;
    highMid.gain.value = highMidGain;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = highFreq;
    high.gain.value = highGain;

    low.connect(lowMid);
    lowMid.connect(highMid);
    highMid.connect(high);

    return {
      input: low,
      output: high,
      filters: { low, lowMid, highMid, high },
      setLow: (g) => { low.gain.value = g; },
      setLowMid: (g) => { lowMid.gain.value = g; },
      setHighMid: (g) => { highMid.gain.value = g; },
      setHigh: (g) => { high.gain.value = g; },
      setBass: (g) => { low.gain.value = g; },
      setMid: (g) => { lowMid.gain.value = g; highMid.gain.value = g; },
      setTreble: (g) => { high.gain.value = g; }
    };
  }

  /**
   * Return preset values for 4-Band Parametric EQ
   */
  getEQPresets() {
    return {
      'flat': { name: 'Flat / Bypass', low: 0, lowMid: 0, highMid: 0, high: 0 },
      'bass-boost': { name: '🎸 Bass Boost', low: 6, lowMid: -1, highMid: 0, high: 1 },
      'vocal-boost': { name: '🗣️ Vocal Warmth & Presence', low: -2, lowMid: 4, highMid: 3, high: 2 },
      'podcast-pro': { name: '🎙️ Podcast Pro Clarity', low: -3, lowMid: 5, highMid: 2, high: 1 },
      'broadcast-sheen': { name: '📻 Broadcast Sheen', low: 2, lowMid: -2, highMid: 3, high: 5 },
      'air-treble': { name: '✨ Air & Sparkle', low: 0, lowMid: 0, highMid: 2, high: 6 }
    };
  }

  /**
   * Render high-precision frequency response curve on Canvas
   * @param {HTMLCanvasElement} canvas
   * @param {object} eqSettings - { low, lowMid, highMid, high, lowFreq, lowMidFreq, highMidFreq, highFreq }
   */
  renderEQCurve(canvas, eqSettings = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, w, h);

    const minFreq = 20;
    const maxFreq = 20000;
    const minDb = -18;
    const maxDb = 18;

    // Helper functions
    const freqToX = (f) => (Math.log10(f / minFreq) / Math.log10(maxFreq / minFreq)) * w;
    const dbToY = (db) => h / 2 - (db / (maxDb - minDb)) * h;

    // Grid lines - Frequency (Logarithmic)
    const gridFreqs = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
    ctx.strokeStyle = '#1a1a26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    gridFreqs.forEach(f => {
      const x = freqToX(f);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    });
    ctx.stroke();

    // Grid lines - Decibels
    const gridDbs = [-12, -6, 0, 6, 12];
    ctx.beginPath();
    gridDbs.forEach(db => {
      const y = dbToY(db);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    });
    ctx.stroke();

    // 0dB Center Reference Line
    ctx.strokeStyle = '#2d2d42';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grid labels
    ctx.fillStyle = '#55556a';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText('100Hz', freqToX(100) + 2, h - 4);
    ctx.fillText('1kHz', freqToX(1000) + 2, h - 4);
    ctx.fillText('10kHz', freqToX(10000) + 2, h - 4);
    ctx.fillText('0dB', 4, h / 2 - 3);
    ctx.fillText('+12dB', 4, dbToY(12) + 10);
    ctx.fillText('-12dB', 4, dbToY(-12) - 3);

    // Calculate response curve points
    const lowGain = eqSettings.low || 0;
    const lowMidGain = eqSettings.lowMid || 0;
    const highMidGain = eqSettings.highMid || 0;
    const highGain = eqSettings.high || 0;

    const lowF = eqSettings.lowFreq || 100;
    const lowMidF = eqSettings.lowMidFreq || 500;
    const highMidF = eqSettings.highMidFreq || 2500;
    const highF = eqSettings.highFreq || 10000;

    const samples = 120;
    const points = [];

    for (let i = 0; i <= samples; i++) {
      const logRatio = i / samples;
      const freq = minFreq * Math.pow(maxFreq / minFreq, logRatio);

      // Low Shelf influence
      const lowInf = lowGain / (1 + Math.pow(freq / lowF, 2));

      // Low-Mid Peak influence (Bell)
      const qLM = 1.0;
      const bwLM = Math.pow(Math.log2(freq / lowMidF) * qLM, 2);
      const lowMidInf = lowMidGain / (1 + bwLM * 4);

      // High-Mid Peak influence (Bell)
      const qHM = 1.0;
      const bwHM = Math.pow(Math.log2(freq / highMidF) * qHM, 2);
      const highMidInf = highMidGain / (1 + bwHM * 4);

      // High Shelf influence
      const highInf = highGain * (Math.pow(freq / highF, 2) / (1 + Math.pow(freq / highF, 2)));

      const totalDb = lowInf + lowMidInf + highMidInf + highInf;
      const clampedDb = Math.max(minDb, Math.min(maxDb, totalDb));

      points.push({ x: freqToX(freq), y: dbToY(clampedDb) });
    }

    // Fill under curve
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(108, 92, 231, 0.35)');
    grad.addColorStop(0.5, 'rgba(108, 92, 231, 0.08)');
    grad.addColorStop(1, 'rgba(108, 92, 231, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, h / 2);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(w, h / 2);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke curve
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw control pucks for the 4 bands
    const bands = [
      { name: 'L', freq: lowF, gain: lowGain, color: '#e17055' },
      { name: 'LM', freq: lowMidF, gain: lowMidGain, color: '#fdcb6e' },
      { name: 'HM', freq: highMidF, gain: highMidGain, color: '#00cec9' },
      { name: 'H', freq: highF, gain: highGain, color: '#a29bfe' }
    ];

    bands.forEach(b => {
      const bx = freqToX(b.freq);
      const by = dbToY(Math.max(minDb, Math.min(maxDb, b.gain)));

      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Band Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillText(b.name, bx - 6, by - 8);
    });
  }

  /**
   * Render Dynamics Compressor Transfer Curve
   * @param {HTMLCanvasElement} canvas
   * @param {object} compSettings - { threshold, ratio, knee, attack, release }
   */
  renderCompressorCurve(canvas, compSettings = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, w, h);

    const threshold = compSettings.threshold ?? -24;
    const ratio = Math.max(1, compSettings.ratio ?? 8);
    const knee = compSettings.knee ?? 30;

    // dB range: -60dB to 0dB
    const minDb = -60;
    const maxDb = 0;
    const toCoord = (db) => ((db - minDb) / (maxDb - minDb));
    const toX = (db) => toCoord(db) * w;
    const toY = (db) => h - toCoord(db) * h;

    // Grid lines
    ctx.strokeStyle = '#1a1a26';
    ctx.lineWidth = 1;
    [-48, -36, -24, -12].forEach(db => {
      ctx.beginPath();
      ctx.moveTo(toX(db), 0);
      ctx.lineTo(toX(db), h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, toY(db));
      ctx.lineTo(w, toY(db));
      ctx.stroke();
    });

    // 1:1 Unity Line (dashed)
    ctx.strokeStyle = '#2d2d42';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Compressor characteristic curve
    ctx.beginPath();
    for (let xDb = minDb; xDb <= maxDb; xDb += 1) {
      let yDb = xDb;
      if (xDb > threshold + knee / 2) {
        yDb = threshold + (xDb - threshold) / ratio;
      } else if (xDb > threshold - knee / 2) {
        // Soft knee quadratic interpolation
        const k = (xDb - threshold + knee / 2) / knee;
        yDb = xDb + ((1 / ratio - 1) * Math.pow(xDb - threshold + knee / 2, 2)) / (2 * knee);
      }

      const px = toX(xDb);
      const py = toY(yDb);
      if (xDb === minDb) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw Threshold Marker Puck
    const thX = toX(threshold);
    const thY = toY(threshold);
    ctx.beginPath();
    ctx.arc(thX, thY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00f2fe';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText(`${threshold}dB`, thX - 12, thY - 8);
    ctx.fillStyle = '#00cec9';
    ctx.fillText(`${ratio}:1`, w - 24, toY(threshold + (0 - threshold) / ratio) - 6);
  }

  /**
   * Create an algorithmic reverb node
   */
  createReverb(duration = 2.0, decay = 2.0) {
    const ctx = this._ensureContext();
    if (!ctx) return null;

    const convolver = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = (length - i) / length;
      left[i] = (Math.random() * 2 - 1) * Math.pow(n, decay);
      right[i] = (Math.random() * 2 - 1) * Math.pow(n, decay);
    }

    convolver.buffer = impulse;
    return convolver;
  }

  /**
   * Create a dynamic range compressor (Limiter/Compressor)
   */
  createCompressor(threshold = -24, ratio = 12, attack = 0.003, release = 0.25, knee = 30) {
    const ctx = this._ensureContext();
    if (!ctx) return null;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = threshold;
    compressor.knee.value = knee;
    compressor.ratio.value = ratio;
    compressor.attack.value = attack;
    compressor.release.value = release;

    return compressor;
  }

  /**
   * Create a spectrum analyzer for visualizer
   */
  createAnalyzer(fftSize = 64) {
    const ctx = this._ensureContext();
    if (!ctx) return null;

    const analyzer = ctx.createAnalyser();
    analyzer.fftSize = fftSize;
    return analyzer;
  }
}

window.audioEffectsManager = new AudioEffectsManager();

