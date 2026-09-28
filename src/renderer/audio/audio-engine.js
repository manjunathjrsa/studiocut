/**
 * StudioCut — Audio Engine
 * Web Audio API mixing, playback synchronization, volume/gain control, audio scrubbing, and waveform extraction
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterVolume = 1;
    this.trackGains = new Map(); // trackId -> GainNode
    this.activeSources = new Map(); // clipId -> { source, gainNode }
    this.audioBufferCache = new Map(); // path -> AudioBuffer
    this.initialized = false;
    this._lastScrubTime = 0;
  }

  init() {
    this._initContext();
    this._bindStoreEvents();
    this._bindUserInteractionUnlock();
    this._preloadTracksAudio();
  }

  _initContext() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (err) {
      console.warn('[AudioEngine] Web Audio API not supported or blocked:', err);
    }
  }

  _bindUserInteractionUnlock() {
    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('mousedown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  _bindStoreEvents() {
    store.on('playback.playing', (playing) => {
      if (!this.initialized) this._initContext();
      if (this.ctx?.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      if (playing) {
        this.startPlayback(store.get('playback.currentTime'));
      } else {
        this.stopPlayback();
      }
    });

    let lastTime = 0;
    store.on('playback.currentTime', (time) => {
      if (store.get('playback.playing')) {
        // While playing: if time jumped (> 0.25s e.g. clicked timeline while playing), re-sync all
        if (Math.abs(time - lastTime) > 0.25) {
          this.startPlayback(time);
        } else {
          this.syncPlayback(time);
        }
        lastTime = time;
      } else {
        // Moving / scrubbing in timeline while stopped
        if (Math.abs(time - lastTime) > 0.005) {
          this.scrubAudio(time);
        }
        lastTime = time;
      }
    });

    store.on('tracks', () => {
      this._preloadTracksAudio();
      if (store.get('playback.playing')) {
        this.syncPlayback(store.get('playback.currentTime'));
      }
    });
  }

  _preloadTracksAudio() {
    const tracks = store.get('tracks') || [];
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.sourcePath && (clip.mediaType === 'audio' || clip.mediaType === 'video')) {
          if (!this.audioBufferCache.has(clip.sourcePath)) {
            this.loadAudioBuffer(clip.sourcePath).catch(() => {});
          }
        }
      }
    }
  }

  /**
   * Start playback of all active audio clips at currentTime
   */
  startPlayback(currentTime) {
    if (!this.ctx) this._initContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.stopPlayback();

    const tracks = store.get('tracks') || [];
    for (const track of tracks) {
      if (track.muted || !track.visible) continue;

      for (const clip of track.clips) {
        if (clip.mediaType !== 'audio') continue; // Video audio handled natively in compositor
        if (currentTime >= clip.startTime && currentTime < (clip.startTime + clip.duration)) {
          this._playClipAudio(clip, track, currentTime);
        }
      }
    }
  }

  /**
   * Dynamically synchronizes active audio clips as playhead moves through timeline
   */
  syncPlayback(currentTime) {
    if (!this.ctx) return;
    const tracks = store.get('tracks') || [];

    // 1. Check for newly entered clips that should start
    for (const track of tracks) {
      if (track.muted || !track.visible) continue;

      for (const clip of track.clips) {
        if (clip.mediaType !== 'audio') continue;
        const isWithin = currentTime >= clip.startTime && currentTime < (clip.startTime + clip.duration);
        const isPlaying = this.activeSources.has(clip.id);

        if (isWithin && !isPlaying) {
          this._playClipAudio(clip, track, currentTime);
        } else if (!isWithin && isPlaying) {
          this.stopClipAudio(clip.id);
        }
      }
    }

    // 2. Stop clips that left playhead or are on newly muted tracks
    for (const [clipId, item] of this.activeSources.entries()) {
      if (clipId.startsWith('scrub_')) continue;
      let stillActive = false;
      for (const track of tracks) {
        if (track.muted || !track.visible) continue;
        const c = track.clips.find(clip => clip.id === clipId);
        if (c && currentTime >= c.startTime && currentTime < (c.startTime + c.duration)) {
          stillActive = true;
          break;
        }
      }
      if (!stillActive) {
        this.stopClipAudio(clipId);
      }
    }

    // 3. Auto-Ducking: Duck music tracks when dialogue / voice audio is active
    if (store.get('audio.autoDuckingEnabled')) {
      this._applyAutoDucking(currentTime, tracks);
    }
  }

  /**
   * Evaluates active voice clips and ramps down music tracks by -12dB
   */
  _applyAutoDucking(currentTime, tracks) {
    if (!this.ctx) return;
    let hasVoice = false;

    for (const track of tracks) {
      if (track.muted || !track.visible) continue;
      const isVoiceTrack = track.name.toLowerCase().includes('voice') ||
                           track.name.toLowerCase().includes('dialogue') ||
                           track.type === 'video' ||
                           track === tracks.find(t => t.type === 'audio');

      if (isVoiceTrack) {
        for (const clip of track.clips) {
          if (currentTime >= clip.startTime && currentTime < (clip.startTime + clip.duration)) {
            hasVoice = true;
            break;
          }
        }
      }
      if (hasVoice) break;
    }

    for (const track of tracks) {
      if (track.type !== 'audio') continue;
      const isMusicTrack = track.name.toLowerCase().includes('music') ||
                           track.name.toLowerCase().includes('bgm') ||
                           track !== tracks.find(t => t.type === 'audio');

      if (isMusicTrack) {
        const trackGain = this.trackGains.get(track.id);
        if (trackGain) {
          const baseVol = track.volume !== undefined ? track.volume : 1;
          const targetVol = hasVoice ? baseVol * 0.25 : baseVol;
          const now = this.ctx.currentTime;
          trackGain.gain.setTargetAtTime(targetVol, now, 0.05);
        }
      }
    }
  }

  /**
   * Audio scrubbing: plays short slice when scrubbing / moving in timeline
   */
  scrubAudio(time) {
    if (!this.initialized) this._initContext();
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.ctx) return;

    const now = performance.now();
    if (now - this._lastScrubTime < 30) return; // 30ms responsive throttle
    this._lastScrubTime = now;

    // Clean up previous scrub slices
    for (const [id, item] of this.activeSources.entries()) {
      if (id.startsWith('scrub_')) {
        try {
          item.source.stop();
          item.source.disconnect();
        } catch (e) {}
        this.activeSources.delete(id);
      }
    }

    const tracks = store.get('tracks') || [];
    const scrubDuration = 0.075; // 75ms responsive audio slice

    for (const track of tracks) {
      if (track.muted || !track.visible) continue;

      for (const clip of track.clips) {
        if (time >= clip.startTime && time < (clip.startTime + clip.duration)) {
          this._playScrubSlice(clip, track, time, scrubDuration);
        }
      }
    }
  }

  async _playScrubSlice(clip, track, time, scrubDuration) {
    if (!clip.sourcePath) return;

    try {
      let buffer = this.audioBufferCache.get(clip.sourcePath);
      if (!buffer) {
        buffer = await this.loadAudioBuffer(clip.sourcePath);
      }
      if (!buffer || !this.ctx) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = clip.speed || 1;

      // Track gain
      let trackGain = this.trackGains.get(track.id);
      if (!trackGain) {
        trackGain = this.ctx.createGain();
        trackGain.connect(this.masterGain);
        this.trackGains.set(track.id, trackGain);
      }
      const trackVol = track.volume !== undefined ? track.volume : 1;
      trackGain.gain.setValueAtTime(trackVol, this.ctx.currentTime);

      // Clip gain with anti-click envelope
      const clipGain = this.ctx.createGain();
      const clipVol = (clip.volume !== undefined ? clip.volume : 1);
      const audioTime = this.ctx.currentTime;
      const offsetInClip = time - clip.startTime;
      const sourceOffset = Math.max(0, (clip.sourceStartTime || 0) + offsetInClip * (clip.speed || 1));

      if (sourceOffset >= buffer.duration) return;

      // Quick smooth envelope (6ms attack, 25ms decay)
      clipGain.gain.setValueAtTime(0.001, audioTime);
      clipGain.gain.linearRampToValueAtTime(clipVol * 0.9, audioTime + 0.006);
      clipGain.gain.setValueAtTime(clipVol * 0.9, audioTime + scrubDuration - 0.025);
      clipGain.gain.linearRampToValueAtTime(0.001, audioTime + scrubDuration);

      source.connect(clipGain);
      clipGain.connect(trackGain);

      const scrubKey = `scrub_${clip.id}_${Math.random()}`;
      source.start(audioTime, sourceOffset, scrubDuration);
      this.activeSources.set(scrubKey, { source, gainNode: clipGain });

      source.onended = () => {
        this.activeSources.delete(scrubKey);
      };
    } catch (err) {
      // Ignore scrub error
    }
  }

  stopPlayback() {
    for (const [clipId, item] of this.activeSources.entries()) {
      try {
        item.source.stop();
        item.source.disconnect();
      } catch (e) {}
    }
    this.activeSources.clear();
  }

  stopClipAudio(clipId) {
    const item = this.activeSources.get(clipId);
    if (item) {
      try {
        item.source.stop();
        item.source.disconnect();
      } catch (e) {}
      this.activeSources.delete(clipId);
    }
  }

  async _playClipAudio(clip, track, currentTime) {
    if (!clip.sourcePath) return;

    try {
      const buffer = await this.loadAudioBuffer(clip.sourcePath);
      if (!buffer || !this.ctx) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = clip.speed || 1;

      // Track gain
      let trackGain = this.trackGains.get(track.id);
      if (!trackGain) {
        trackGain = this.ctx.createGain();
        trackGain.connect(this.masterGain);
        this.trackGains.set(track.id, trackGain);
      }
      const trackVol = track.volume !== undefined ? track.volume : 1;
      trackGain.gain.setValueAtTime(trackVol, this.ctx.currentTime);

      // Clip gain
      const clipGain = this.ctx.createGain();
      const clipVol = clip.volume !== undefined ? clip.volume : 1;
      const now = this.ctx.currentTime;
      const offsetInClip = currentTime - clip.startTime;
      const sourceOffset = (clip.sourceStartTime || 0) + offsetInClip * (clip.speed || 1);
      const remainingDuration = (clip.duration - offsetInClip) / (clip.speed || 1);

      // Handle Fade In / Fade Out automation
      if (clip.fadeOut && clip.duration > clip.fadeOut && offsetInClip >= (clip.duration - clip.fadeOut)) {
        // Starting inside the fade-out region
        const fadeOutStartTime = clip.duration - clip.fadeOut;
        const fadeProgress = (offsetInClip - fadeOutStartTime) / clip.fadeOut;
        const currentGain = Math.max(0, (1 - fadeProgress) * clipVol);
        clipGain.gain.setValueAtTime(currentGain, now);
        clipGain.gain.linearRampToValueAtTime(0, now + remainingDuration);
      } else if (clip.fadeIn && offsetInClip < clip.fadeIn) {
        // Starting inside the fade-in region
        const initialGain = (offsetInClip / clip.fadeIn) * clipVol;
        clipGain.gain.setValueAtTime(initialGain, now);
        clipGain.gain.linearRampToValueAtTime(clipVol, now + (clip.fadeIn - offsetInClip));
        
        if (clip.fadeOut && clip.duration > clip.fadeOut) {
          const fadeOutStartTime = clip.duration - clip.fadeOut;
          clipGain.gain.setValueAtTime(clipVol, now + (fadeOutStartTime - offsetInClip));
          clipGain.gain.linearRampToValueAtTime(0, now + remainingDuration);
        }
      } else {
        // Starting in the middle (normal volume)
        clipGain.gain.setValueAtTime(clipVol, now);
        
        if (clip.fadeOut && clip.duration > clip.fadeOut) {
          const fadeOutStartTime = clip.duration - clip.fadeOut;
          clipGain.gain.setValueAtTime(clipVol, now + (fadeOutStartTime - offsetInClip));
          clipGain.gain.linearRampToValueAtTime(0, now + remainingDuration);
        }
      }

      // Handle 4-Band Parametric EQ (Custom or Preset)
      let audioNodeChain = source;
      if (clip.eq && clip.eq.enabled !== false) {
        const eq = window.audioEffectsManager?.create4BandEQ(clip.eq);
        if (eq) {
          audioNodeChain.connect(eq.input);
          audioNodeChain = eq.output;
        }
      } else if (clip.eqPreset && clip.eqPreset !== 'none' && clip.eqPreset !== 'flat') {
        const presets = window.audioEffectsManager?.getEQPresets() || {};
        const presetVals = presets[clip.eqPreset] || {};
        const eq = window.audioEffectsManager?.create4BandEQ(presetVals);
        if (eq) {
          audioNodeChain.connect(eq.input);
          audioNodeChain = eq.output;
        }
      }

      // Handle Dynamics Compression (Limiter / Leveler)
      const compConfig = clip.compressor;
      const isCompEnabled = compConfig && (typeof compConfig === 'object' ? compConfig.enabled !== false : compConfig === true);
      if (isCompEnabled || clip.eqPreset === 'podcast' || clip.eqPreset === 'podcast-pro') {
        const cSettings = typeof compConfig === 'object' ? compConfig : {};
        const compressor = window.audioEffectsManager?.createCompressor(
          cSettings.threshold ?? -24,
          cSettings.ratio ?? 8,
          cSettings.attack ?? 0.003,
          cSettings.release ?? 0.25,
          cSettings.knee ?? 30
        );
        if (compressor) {
          audioNodeChain.connect(compressor);
          audioNodeChain = compressor;
        }
      }

      audioNodeChain.connect(clipGain);
      clipGain.connect(trackGain);

      if (sourceOffset < buffer.duration && remainingDuration > 0) {
        source.start(0, sourceOffset, remainingDuration);
        this.activeSources.set(clip.id, { source, gainNode: clipGain });

        source.onended = () => {
          this.activeSources.delete(clip.id);
        };
      }
    } catch (err) {
      console.warn('[AudioEngine] Play clip error:', err);
    }
  }

  /**
   * Load and cache audio buffer
   */
  async loadAudioBuffer(filePath) {
    if (!this.initialized) this._initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!filePath || !this.ctx) return null;

    if (this.audioBufferCache.has(filePath)) {
      return this.audioBufferCache.get(filePath);
    }

    try {
      let arrayBuffer = null;

      // 1. Direct Data URL base64 decode (instant in-memory, zero network/CORS issues)
      if (filePath.startsWith('data:')) {
        const base64Index = filePath.indexOf('base64,');
        if (base64Index !== -1) {
          const b64 = filePath.slice(base64Index + 7);
          const binStr = atob(b64);
          const len = binStr.length;
          const u8 = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            u8[i] = binStr.charCodeAt(i);
          }
          arrayBuffer = u8.buffer;
        }
      }

      // 2. Try Electron native file readBinary
      if (!arrayBuffer && window.studiocut?.file?.readBinary && !filePath.startsWith('blob:') && !filePath.startsWith('data:')) {
        try {
          const buf = await window.studiocut.file.readBinary(filePath);
          if (buf) {
            arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          }
        } catch (e) {
          console.warn('[AudioEngine] readBinary fallback to fetch:', e);
        }
      }

      // 3. Blob fallback with XHR for Electron
      if (!arrayBuffer && filePath.startsWith('blob:')) {
        try {
          const res = await fetch(filePath);
          arrayBuffer = await res.arrayBuffer();
        } catch (e) {
          try {
            arrayBuffer = await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('GET', filePath, true);
              xhr.responseType = 'arraybuffer';
              xhr.onload = () => resolve(xhr.response);
              xhr.onerror = () => reject(new Error('XHR blob failed'));
              xhr.send();
            });
          } catch (xhrErr) {
            console.warn('[AudioEngine] Blob XHR fetch error:', xhrErr);
          }
        }
      }

      // 4. File URL / HTTP fetch fallback
      if (!arrayBuffer) {
        let url = filePath;
        if (!filePath.startsWith('blob:') && !filePath.startsWith('data:') && !filePath.startsWith('http')) {
          const clean = filePath.replace(/\\/g, '/');
          url = clean.startsWith('/') ? `file://${clean}` : `file:///${clean}`;
        }
        const res = await fetch(url);
        arrayBuffer = await res.arrayBuffer();
      }

      if (!arrayBuffer || !this.ctx) return null;
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.audioBufferCache.set(filePath, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.warn('[AudioEngine] Failed to decode audio buffer:', filePath, err);
      return null;
    }
  }

  /**
   * Extract peak waveform data for rendering
   */
  async generateWaveform(filePath, samples = 200) {
    try {
      if (!this.initialized) this._initContext();
      const buffer = await this.loadAudioBuffer(filePath);
      if (!buffer) return null;

      const rawData = buffer.getChannelData(0); // Left channel
      const blockSize = Math.floor(rawData.length / samples);
      const peaks = [];

      for (let i = 0; i < samples; i++) {
        let blockStart = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[blockStart + j] || 0);
        }
        peaks.push(Math.min(1, sum / blockSize * 2));
      }

      return peaks;
    } catch (err) {
      return null;
    }
  }

  setMasterVolume(val) {
    this.masterVolume = MathUtils.clamp(val, 0, 1);
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }
}

window.audioEngine = new AudioEngine();
