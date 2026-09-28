/**
 * StudioCut — Source Monitor Panel
 * Professional clip preview, In/Out point marking, J/K/L transport,
 * and 3-Point / 4-Point Insert (,) & Overwrite (.) editing.
 */

class SourceMonitor {
  constructor() {
    this.currentMedia = null;
    this.sourceIn = 0;
    this.sourceOut = 0;
    this.currentTime = 0;
    this.duration = 10;
    this.isPlaying = false;
    this.viewMode = 'program'; // 'program' | 'source' | 'dual'

    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.videoEl = null;
    this.imgEl = null;
    this.timecodeEl = null;
    this.durationEl = null;
    this.markedDurEl = null;
    this.scrubberEl = null;
    this.inMarkerEl = null;
    this.outMarkerEl = null;
    this.rangeEl = null;
    this.emptyStateEl = null;

    this.lastFrameTime = 0;
    this.animFrameId = null;
  }

  init() {
    this.container = document.getElementById('sourceMonitorView');
    this.canvas = document.getElementById('sourceCanvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    }
    this.videoEl = document.getElementById('sourceVideo');
    this.emptyStateEl = document.getElementById('sourceEmpty');
    this.timecodeEl = document.getElementById('sourceTimecode');
    this.durationEl = document.getElementById('sourceDuration');
    this.markedDurEl = document.getElementById('sourceMarkedDuration');
    this.scrubberEl = document.getElementById('sourceScrubber');
    this.inMarkerEl = document.getElementById('sourceInMarker');
    this.outMarkerEl = document.getElementById('sourceOutMarker');
    this.rangeEl = document.getElementById('sourceMarkedRange');

    this._bindControls();
    this._bindModeTabs();
    this._bindFocusTracking();
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());
  }

  _bindFocusTracking() {
    this.container?.addEventListener('mousedown', () => {
      window._activeMonitor = 'source';
      this.container.classList.add('focused-monitor');
      document.getElementById('programMonitorView')?.classList.remove('focused-monitor');
    });

    document.getElementById('programMonitorView')?.addEventListener('mousedown', () => {
      window._activeMonitor = 'program';
      document.getElementById('programMonitorView')?.classList.add('focused-monitor');
      this.container?.classList.remove('focused-monitor');
    });

    document.getElementById('timelinePanel')?.addEventListener('mousedown', () => {
      window._activeMonitor = 'timeline';
      this.container?.classList.remove('focused-monitor');
    });
  }

  _bindModeTabs() {
    const tabs = document.querySelectorAll('.monitor-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.monitor;
        this.setMode(mode);
      });
    });
  }

  setMode(mode) {
    this.viewMode = mode;
    const monitorsContainer = document.getElementById('monitorsWrapper');
    const sourceView = document.getElementById('sourceMonitorView');
    const programView = document.getElementById('programMonitorView');
    const tabs = document.querySelectorAll('.monitor-tab');

    tabs.forEach(t => t.classList.toggle('active', t.dataset.monitor === mode));

    if (!monitorsContainer || !sourceView || !programView) return;

    monitorsContainer.classList.remove('monitors-wrapper--program', 'monitors-wrapper--source', 'monitors-wrapper--dual');

    if (mode === 'dual') {
      monitorsContainer.classList.add('monitors-wrapper--dual');
      sourceView.style.display = 'flex';
      programView.style.display = 'flex';
    } else if (mode === 'source') {
      monitorsContainer.classList.add('monitors-wrapper--source');
      sourceView.style.display = 'flex';
      programView.style.display = 'none';
    } else {
      // Default: program
      monitorsContainer.classList.add('monitors-wrapper--program');
      sourceView.style.display = 'none';
      programView.style.display = 'flex';
    }

    this._handleResize();
    window.previewEngine?._handleResize();
  }

  _bindControls() {
    // Play/Pause
    const btnPlay = document.getElementById('btnSourcePlay');
    btnPlay?.addEventListener('click', () => this.togglePlay());

    // Step frames
    document.getElementById('btnSourcePrevFrame')?.addEventListener('click', () => this.stepFrame(-1));
    document.getElementById('btnSourceNextFrame')?.addEventListener('click', () => this.stepFrame(1));

    // Skip to In / Out / Start / End
    document.getElementById('btnSourceSkipIn')?.addEventListener('click', () => this.seek(this.sourceIn));
    document.getElementById('btnSourceSkipOut')?.addEventListener('click', () => this.seek(this.sourceOut));

    // In / Out Points
    document.getElementById('btnSourceMarkIn')?.addEventListener('click', () => this.setInPoint());
    document.getElementById('btnSourceMarkOut')?.addEventListener('click', () => this.setOutPoint());
    document.getElementById('btnSourceClearIO')?.addEventListener('click', () => this.clearInOut());

    // Insert & Overwrite Edits
    document.getElementById('btnSourceInsert')?.addEventListener('click', () => this.performInsert());
    document.getElementById('btnSourceOverwrite')?.addEventListener('click', () => this.performOverwrite());

    // Scrubber interaction
    if (this.scrubberEl) {
      const updateScrub = (e) => {
        const rect = this.scrubberEl.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.seek(ratio * this.duration);
      };

      let isScrubbing = false;
      this.scrubberEl.addEventListener('mousedown', (e) => {
        isScrubbing = true;
        updateScrub(e);
        const onMove = (me) => { if (isScrubbing) updateScrub(me); };
        const onUp = () => {
          isScrubbing = false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    // Drag Video Only & Drag Audio Only
    const dragVideo = document.getElementById('btnSourceDragVideo');
    dragVideo?.addEventListener('dragstart', (e) => {
      if (!this.currentMedia) return;
      const mediaItem = { ...this.currentMedia, type: 'video' };
      window._draggedMediaItem = mediaItem;
      e.dataTransfer.setData('text/plain', mediaItem.id);
      e.dataTransfer.setData('application/json', JSON.stringify({
        ...mediaItem,
        sourceIn: this.sourceIn,
        sourceOut: this.sourceOut,
        duration: Math.max(0.1, this.sourceOut - this.sourceIn)
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });

    const dragAudio = document.getElementById('btnSourceDragAudio');
    dragAudio?.addEventListener('dragstart', (e) => {
      if (!this.currentMedia) return;
      const mediaItem = { ...this.currentMedia, type: 'audio' };
      window._draggedMediaItem = mediaItem;
      e.dataTransfer.setData('text/plain', mediaItem.id);
      e.dataTransfer.setData('application/json', JSON.stringify({
        ...mediaItem,
        sourceIn: this.sourceIn,
        sourceOut: this.sourceOut,
        duration: Math.max(0.1, this.sourceOut - this.sourceIn)
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
  }

  loadMedia(media, seekTime = 0) {
    if (!media) return;
    window._activeMonitor = 'source';
    this.currentMedia = media;
    const reqSeek = seekTime !== undefined ? seekTime : 0;
    const baseDur = media.duration || (media.type === 'image' ? 5 : 10);
    this.duration = Math.max(baseDur, reqSeek);
    this.sourceIn = 0;
    this.sourceOut = this.duration;
    this.currentTime = Math.max(0, Math.min(this.duration, reqSeek));

    if (this.emptyStateEl) {
      this.emptyStateEl.style.display = 'none';
    }

    const titleEl = document.getElementById('sourceClipTitle');
    if (titleEl) {
      titleEl.textContent = media.name || 'Source Clip';
    }

    // If video, setup video element
    if (media.type === 'video' && media.path) {
      if (this.videoEl) {
        this.videoEl.src = media.path;
        this.videoEl.currentTime = this.currentTime;
      }
    } else if (media.type === 'image' && media.path) {
      this.imgEl = new Image();
      this.imgEl.onload = () => this.renderFrame();
      this.imgEl.src = media.path;
    }

    // Auto-switch to dual mode or source mode if currently on program
    if (this.viewMode === 'program') {
      this.setMode('dual');
    }

    this._updateUI();
    this.renderFrame();
  }

  loadMediaById(mediaId, seekTime = 0) {
    const mediaList = store.get('media') || [];
    const found = mediaList.find(m => m.id === mediaId);
    if (found) {
      this.loadMedia(found, seekTime);
    }
  }

  loadMediaFromClip(clip, seekTime = 0) {
    if (!clip) return;
    const mediaList = store.get('media') || [];
    const minDur = (seekTime !== undefined ? seekTime : (clip.sourceStartTime || 0)) + (clip.duration || 10);
    const calculatedDur = Math.max(clip.sourceDuration || 0, minDur);
    const media = mediaList.find(m => m.id === clip.mediaId) || {
      id: clip.mediaId || MathUtils.generateId(),
      name: clip.name,
      path: clip.sourcePath,
      type: clip.mediaType,
      duration: calculatedDur
    };
    if (media && media.duration < calculatedDur) {
      media.duration = calculatedDur;
    }
    this.loadMedia(media, seekTime !== undefined ? seekTime : (clip.sourceStartTime || 0));
  }

  seek(time) {
    this.currentTime = Math.max(0, Math.min(this.duration, time));
    if (this.videoEl && this.currentMedia?.type === 'video') {
      this.videoEl.currentTime = this.currentTime;
    }
    this._updateUI();
    this.renderFrame();
  }

  stepFrame(deltaFrames) {
    const fps = store.get('project.settings.fps') || 30;
    this.seek(this.currentTime + deltaFrames * (1 / fps));
  }

  setInPoint() {
    this.sourceIn = Math.min(this.currentTime, this.sourceOut);
    this._updateUI();
    window.app?.showToast(`Source In Point: ${TimeUtils.secondsToTimecode(this.sourceIn)}`);
  }

  setOutPoint() {
    this.sourceOut = Math.max(this.currentTime, this.sourceIn);
    this._updateUI();
    window.app?.showToast(`Source Out Point: ${TimeUtils.secondsToTimecode(this.sourceOut)}`);
  }

  clearInOut() {
    this.sourceIn = 0;
    this.sourceOut = this.duration;
    this._updateUI();
    window.app?.showToast('Cleared Source In/Out points');
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (!this.currentMedia) return;
    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    const btnPlay = document.getElementById('btnSourcePlay');
    if (btnPlay) {
      btnPlay.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    }

    if (this.videoEl && this.currentMedia.type === 'video') {
      this.videoEl.play().catch(() => {});
    }

    const loop = (now) => {
      if (!this.isPlaying) return;
      const deltaSec = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      let nextTime = this.currentTime + deltaSec;
      if (nextTime >= this.sourceOut) {
        nextTime = this.sourceIn;
      }
      this.currentTime = nextTime;
      this._updateUI();
      this.renderFrame();

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  pause() {
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    const btnPlay = document.getElementById('btnSourcePlay');
    if (btnPlay) {
      btnPlay.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    }
    if (this.videoEl && this.currentMedia?.type === 'video') {
      this.videoEl.pause();
    }
  }

  performInsert() {
    if (!this.currentMedia) {
      window.app?.showToast('No media loaded in Source Monitor', 'warning');
      return;
    }
    const dur = Math.max(0.05, this.sourceOut - this.sourceIn);
    Actions.insertEdit({
      media: this.currentMedia,
      sourceStartTime: this.sourceIn,
      duration: dur
    });
  }

  performOverwrite() {
    if (!this.currentMedia) {
      window.app?.showToast('No media loaded in Source Monitor', 'warning');
      return;
    }
    const dur = Math.max(0.05, this.sourceOut - this.sourceIn);
    Actions.overwriteEdit({
      media: this.currentMedia,
      sourceStartTime: this.sourceIn,
      duration: dur
    });
  }

  _updateUI() {
    const fps = store.get('project.settings.fps') || 30;
    if (this.timecodeEl) {
      this.timecodeEl.textContent = TimeUtils.secondsToTimecode(this.currentTime, fps);
    }
    if (this.durationEl) {
      this.durationEl.textContent = TimeUtils.secondsToTimecode(this.duration, fps);
    }
    if (this.markedDurEl) {
      const markedDur = Math.max(0, this.sourceOut - this.sourceIn);
      this.markedDurEl.textContent = `In/Out: ${TimeUtils.secondsToTimecode(markedDur, fps)}`;
    }

    // Scrubber playhead position
    const playheadEl = document.getElementById('sourcePlayhead');
    if (playheadEl && this.duration > 0) {
      const pct = (this.currentTime / this.duration) * 100;
      playheadEl.style.left = `${pct}%`;
    }

    // In / Out range highlight
    if (this.rangeEl && this.duration > 0) {
      const leftPct = (this.sourceIn / this.duration) * 100;
      const widthPct = ((this.sourceOut - this.sourceIn) / this.duration) * 100;
      this.rangeEl.style.left = `${leftPct}%`;
      this.rangeEl.style.width = `${widthPct}%`;
    }
  }

  renderFrame() {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) return;

    this.ctx.fillStyle = '#08080c';
    this.ctx.fillRect(0, 0, w, h);

    if (!this.currentMedia) return;

    if (this.currentMedia.type === 'video' && this.videoEl && this.videoEl.readyState >= 2) {
      const vw = this.videoEl.videoWidth || 1920;
      const vh = this.videoEl.videoHeight || 1080;
      const scale = Math.min(w / vw, h / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      this.ctx.drawImage(this.videoEl, dx, dy, dw, dh);
    } else if (this.currentMedia.type === 'image' && this.imgEl && this.imgEl.complete) {
      const iw = this.imgEl.naturalWidth || 1920;
      const ih = this.imgEl.naturalHeight || 1080;
      const scale = Math.min(w / iw, h / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      this.ctx.drawImage(this.imgEl, dx, dy, dw, dh);
    } else if (this.currentMedia.type === 'audio') {
      // Audio waveform visualizer placeholder
      this.ctx.fillStyle = '#6c5ce7';
      this.ctx.font = '14px Inter, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`🎵 Audio: ${this.currentMedia.name}`, w / 2, h / 2 - 10);
      this.ctx.fillStyle = '#888';
      this.ctx.font = '11px Inter, sans-serif';
      this.ctx.fillText(`${TimeUtils.secondsToTimecode(this.currentTime)} / ${TimeUtils.secondsToTimecode(this.duration)}`, w / 2, h / 2 + 16);
    }
  }

  _handleResize() {
    if (!this.canvas) return;
    const container = document.getElementById('sourceCanvasContainer');
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pad = 16;
    const availW = Math.max(80, rect.width - pad);
    const availH = Math.max(80, rect.height - pad);
    const aspect = 16 / 9;

    let displayW, displayH;
    if (availW / availH > aspect) {
      displayH = availH;
      displayW = displayH * aspect;
    } else {
      displayW = availW;
      displayH = displayW / aspect;
    }

    displayW = Math.round(displayW);
    displayH = Math.round(displayH);

    this.canvas.style.width = `${displayW}px`;
    this.canvas.style.height = `${displayH}px`;
    this.canvas.width = Math.round(displayW * dpr);
    this.canvas.height = Math.round(displayH * dpr);

    this.renderFrame();
  }
}

window.sourceMonitor = new SourceMonitor();
