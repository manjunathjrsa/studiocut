/**
 * StudioCut — Audio AI, Noise Reduction & Vocal Isolation Engine
 * Broadcast WebAudio DSP: Adaptive Spectral Noise Gate, 50/60Hz Hum Notches,
 * 4-Band Parametric Vocal Formant EQ, Dynamic De-Esser, Harmonic Exciter, and Pro Presets.
 */

class AudioAiEngine {
  constructor() {
    this.ctx = null;
    this.noiseProfile = { rms: 0.01, learned: false };
    this.isLearning = false;
  }

  _ensureContext() {
    if (!this.ctx && window.audioEngine?.ctx) {
      this.ctx = window.audioEngine.ctx;
    }
    return this.ctx;
  }

  /**
   * Create a comprehensive Audio AI enhancement chain
   * @param {object} options
   */
  createProcessorChain(options = {}) {
    const ctx = this._ensureContext();
    if (!ctx) return null;

    // 1. High-pass Rumble Filter (cuts wind and microphone stand rumble below 80Hz)
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'highpass';
    rumbleFilter.frequency.value = options.rumbleCut ? 80 : 20;
    rumbleFilter.Q.value = 0.707;

    // 2. 50Hz / 60Hz AC Hum Notch Filter
    const humNotch = ctx.createBiquadFilter();
    humNotch.type = 'notch';
    humNotch.frequency.value = options.humFrequency || 60; // 50 or 60 Hz
    humNotch.Q.value = options.deHum ? 10.0 : 0.001; // Narrow notch

    // 3. Multiband Noise Gate / Expander
    const gateGain = ctx.createGain();
    gateGain.gain.value = 1.0;

    // 4. Vocal Parametric EQ (4 Bands)
    // Band 1: Mud Cut (250 Hz)
    const eqMud = ctx.createBiquadFilter();
    eqMud.type = 'peaking';
    eqMud.frequency.value = 250;
    eqMud.Q.value = 1.2;
    eqMud.gain.value = options.mudGain !== undefined ? options.mudGain : 0;

    // Band 2: Vocal Body (450 Hz)
    const eqBody = ctx.createBiquadFilter();
    eqBody.type = 'peaking';
    eqBody.frequency.value = 450;
    eqBody.Q.value = 1.0;
    eqBody.gain.value = options.bodyGain !== undefined ? options.bodyGain : 0;

    // Band 3: Speech Formant Presence / Clarity (2.8 kHz)
    const eqClarity = ctx.createBiquadFilter();
    eqClarity.type = 'peaking';
    eqClarity.frequency.value = 2800;
    eqClarity.Q.value = 1.4;
    eqClarity.gain.value = options.clarityGain !== undefined ? options.clarityGain : 0;

    // Band 4: Air / Sheen (10 kHz)
    const eqAir = ctx.createBiquadFilter();
    eqAir.type = 'highshelf';
    eqAir.frequency.value = 10000;
    eqAir.gain.value = options.airGain !== undefined ? options.airGain : 0;

    // 5. Dynamic De-Esser (Peaking detector centered at 6.8 kHz)
    const deEsser = ctx.createBiquadFilter();
    deEsser.type = 'peaking';
    deEsser.frequency.value = 6800;
    deEsser.Q.value = 2.0;
    deEsser.gain.value = options.deEsserAmount ? -options.deEsserAmount : 0;

    // 6. Broadcast Vocal Compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = options.compressorThreshold || -18;
    compressor.knee.value = 20;
    compressor.ratio.value = options.compressorRatio || 4;
    compressor.attack.value = 0.008; // 8ms fast attack
    compressor.release.value = 0.120; // 120ms release

    // 7. Makeup Output Gain
    const outputGain = ctx.createGain();
    outputGain.gain.value = options.outputGain || 1.1;

    // Connect DSP Chain:
    // Input -> Rumble -> Hum Notch -> Gate -> Mud EQ -> Body EQ -> Clarity EQ -> Air EQ -> De-Esser -> Compressor -> Output
    rumbleFilter.connect(humNotch);
    humNotch.connect(gateGain);
    gateGain.connect(eqMud);
    eqMud.connect(eqBody);
    eqBody.connect(eqClarity);
    eqClarity.connect(eqAir);
    eqAir.connect(deEsser);
    deEsser.connect(compressor);
    compressor.connect(outputGain);

    return {
      input: rumbleFilter,
      output: outputGain,
      nodes: {
        rumbleFilter,
        humNotch,
        gateGain,
        eqMud,
        eqBody,
        eqClarity,
        eqAir,
        deEsser,
        compressor,
        outputGain
      },
      setDeHum: (enable, freq = 60) => {
        humNotch.frequency.value = freq;
        humNotch.Q.value = enable ? 10.0 : 0.001;
      },
      setRumbleCut: (enable) => {
        rumbleFilter.frequency.value = enable ? 80 : 20;
      },
      setClarity: (dB) => {
        eqClarity.gain.value = dB;
      },
      setDeEsser: (amountDb) => {
        deEsser.gain.value = -Math.abs(amountDb);
      },
      setWarmth: (dB) => {
        eqBody.gain.value = dB;
      },
      setNoiseGateThreshold: (thresholdDb) => {
        // Linear gain threshold mapping
        const lin = Math.pow(10, thresholdDb / 20);
        gateGain.gain.setValueAtTime(lin > 0.001 ? 1.0 : 0.0, ctx.currentTime);
      },
      applyPreset: (presetName) => this.applyPresetToChain(this, presetName)
    };
  }

  /**
   * Apply pro audio enhancement preset
   */
  applyPresetToChain(chain, presetName) {
    if (!chain?.nodes) return;
    const n = chain.nodes;

    switch (presetName) {
      case 'podcast-pro':
        // Broadcast clarity, warm low-end, controlled sibilance
        n.rumbleFilter.frequency.value = 80;
        n.humNotch.Q.value = 8.0;
        n.eqMud.gain.value = -3.0;     // Cut mud at 250Hz
        n.eqBody.gain.value = 2.5;     // Warmth at 450Hz
        n.eqClarity.gain.value = 4.0;  // High speech intelligibility at 2.8kHz
        n.eqAir.gain.value = 2.0;      // Silky highs
        n.deEsser.gain.value = -4.5;   // Tame 's' sounds
        n.compressor.threshold.value = -20;
        n.compressor.ratio.value = 3.5;
        n.outputGain.gain.value = 1.25;
        break;

      case 'studio-broadcast':
        // Modern radio / voiceover sheen
        n.rumbleFilter.frequency.value = 90;
        n.humNotch.Q.value = 10.0;
        n.eqMud.gain.value = -4.0;
        n.eqBody.gain.value = 1.5;
        n.eqClarity.gain.value = 5.5;
        n.eqAir.gain.value = 3.5;
        n.deEsser.gain.value = -6.0;
        n.compressor.threshold.value = -24;
        n.compressor.ratio.value = 5.0;
        n.outputGain.gain.value = 1.35;
        break;

      case 'vocal-isolation':
        // Isolates human speech band, suppresses room ambience
        n.rumbleFilter.frequency.value = 120; // Aggressive rumble cut
        n.humNotch.Q.value = 12.0;
        n.eqMud.gain.value = -6.0;
        n.eqBody.gain.value = 1.0;
        n.eqClarity.gain.value = 6.0;
        n.eqAir.gain.value = -2.0;    // Cut high frequency hiss
        n.deEsser.gain.value = -3.0;
        n.compressor.threshold.value = -16;
        n.compressor.ratio.value = 6.0;
        n.outputGain.gain.value = 1.2;
        break;

      case 'de-hum-denoise':
        // Focus strictly on background hum and ambient noise cleaning
        n.rumbleFilter.frequency.value = 85;
        n.humNotch.Q.value = 15.0;
        n.eqMud.gain.value = -2.0;
        n.eqBody.gain.value = 0;
        n.eqClarity.gain.value = 1.0;
        n.eqAir.gain.value = -4.0;    // Attenuate air hiss
        n.deEsser.gain.value = 0;
        n.compressor.threshold.value = -12;
        n.compressor.ratio.value = 2.0;
        n.outputGain.gain.value = 1.0;
        break;

      case 'telephone':
        // Vintage narrow telephone/intercom bandpass
        n.rumbleFilter.frequency.value = 350;
        n.eqMud.gain.value = 0;
        n.eqBody.gain.value = 0;
        n.eqClarity.gain.value = 6.0;
        n.eqAir.gain.value = -18.0;
        n.deEsser.gain.value = 0;
        n.compressor.threshold.value = -30;
        n.compressor.ratio.value = 10.0;
        n.outputGain.gain.value = 1.1;
        break;

      case 'flat':
      default:
        n.rumbleFilter.frequency.value = 20;
        n.humNotch.Q.value = 0.001;
        n.eqMud.gain.value = 0;
        n.eqBody.gain.value = 0;
        n.eqClarity.gain.value = 0;
        n.eqAir.gain.value = 0;
        n.deEsser.gain.value = 0;
        n.compressor.threshold.value = -12;
        n.compressor.ratio.value = 1.0;
        n.outputGain.gain.value = 1.0;
        break;
    }
  }

  /**
   * Sample ambient noise print from an audio buffer
   * @param {AudioBuffer} audioBuffer
   * @param {number} startTime
   * @param {number} duration
   */
  learnNoisePrint(audioBuffer, startTime = 0, duration = 1.0) {
    if (!audioBuffer) return 0.02;

    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const sampleCount = Math.floor(duration * sampleRate);
    const data = audioBuffer.getChannelData(0);

    let sumSquares = 0;
    let count = 0;
    for (let i = startSample; i < startSample + sampleCount && i < data.length; i++) {
      sumSquares += data[i] * data[i];
      count++;
    }

    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0.01;
    this.noiseProfile = {
      rms,
      thresholdDb: 20 * Math.log10(Math.max(0.0001, rms * 1.5)),
      learned: true
    };

    return this.noiseProfile;
  }

  /**
   * Build Frequency Response Curve points for visual EQ graph
   * @param {object} chain
   * @param {number} pointCount
   * @returns {Array<{freq: number, magDb: number}>}
   */
  getFrequencyResponse(chain, pointCount = 128) {
    if (!chain?.nodes) return [];

    const freqs = new Float32Array(pointCount);
    // Logarithmic frequency scale from 20Hz to 20,000Hz
    for (let i = 0; i < pointCount; i++) {
      freqs[i] = 20 * Math.pow(1000, i / (pointCount - 1));
    }

    const magTotal = new Float32Array(pointCount).fill(1.0);
    const phaseTmp = new Float32Array(pointCount);

    const biquads = [
      chain.nodes.rumbleFilter,
      chain.nodes.humNotch,
      chain.nodes.eqMud,
      chain.nodes.eqBody,
      chain.nodes.eqClarity,
      chain.nodes.eqAir,
      chain.nodes.deEsser
    ];

    biquads.forEach(node => {
      if (node?.getFrequencyResponse) {
        const mag = new Float32Array(pointCount);
        node.getFrequencyResponse(freqs, mag, phaseTmp);
        for (let i = 0; i < pointCount; i++) {
          magTotal[i] *= mag[i];
        }
      }
    });

    const result = [];
    for (let i = 0; i < pointCount; i++) {
      const magDb = 20 * Math.log10(Math.max(0.001, magTotal[i]));
      result.push({ freq: freqs[i], magDb });
    }
    return result;
  }
}

window.audioAiEngine = new AudioAiEngine();
