/**
 * StudioCut — Preview Engine
 * Real-time playback loop, transport controls, and preview synchronization
 */

class PreviewEngine {
  constructor() {
    this.canvas = null;
    this.emptyState = null;
    this.timecodeEl = null;
    this.durationEl = null;
    this.btnPlay = null;

    this.isPlaying = false;
    this.lastFrameTime = 0;
    this.animFrameId = null;
  }

  init() {
    this.canvas = document.getElementById('previewCanvas');
    this.emptyState = document.getElementById('previewEmpty');
    this.timecodeEl = document.getElementById('currentTimecode');
    this.durationEl = document.getElementById('totalDuration');
    this.btnPlay = document.getElementById('btnPlayPause');

    if (this.canvas) {
      compositor.init(this.canvas);
      this._handleResize();
      window.addEventListener('resize', () => this._handleResize());

      const container = document.getElementById('previewContainer');
      if (container && window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => {
          this._handleResize();
        });
        this.resizeObserver.observe(container);
      }
    }

    this._bindControls();
    this._bindCanvasGizmo();
    this._bindStoreEvents();
    this._checkEmptyState();
    this.updatePreview();
  }

  play() {
    store.set('playback.playing', true);
  }

  pause() {
    store.set('playback.playing', false);
    compositor.pauseAllMedia();
  }

  togglePlay() {
    const playing = store.get('playback.playing');
    store.set('playback.playing', !playing);
  }

  get showGuides() {
    return compositor.showGuides;
  }

  _bindControls() {
    // Play/Pause
    this.btnPlay?.addEventListener('click', () => {
      this.togglePlay();
    });

    // Step frames
    document.getElementById('btnPrevFrame')?.addEventListener('click', () => Actions.stepFrame(-1));
    document.getElementById('btnNextFrame')?.addEventListener('click', () => Actions.stepFrame(1));

    // Jump start/end
    document.getElementById('btnSkipStart')?.addEventListener('click', () => Actions.seek(0));
    document.getElementById('btnSkipEnd')?.addEventListener('click', () => {
      Actions.seek(store.get('playback.duration'));
    });

    // Speed
    const speedSelect = document.getElementById('playbackSpeed');
    speedSelect?.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      store.set('playback.speed', val);
    });

    // Aspect Ratio switcher
    const ratioSelect = document.getElementById('previewAspectRatio');
    ratioSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      let w = 1920, h = 1080;
      if (val === '9:16') { w = 1080; h = 1920; }
      else if (val === '1:1') { w = 1080; h = 1080; }
      else if (val === '4:3') { w = 1440; h = 1080; }
      else if (val === '21:9') { w = 2560; h = 1080; }

      store.set('project.aspectRatio', val);
      store.set('project.settings.width', w);
      store.set('project.settings.height', h);
      this._handleResize();
      this.updatePreview();
      window.app?.showToast(`Aspect Ratio: ${val} (${w}x${h})`);
    });

    // Safe Zone Guides
    document.getElementById('btnToggleGuides')?.addEventListener('click', (e) => {
      compositor.showGuides = !compositor.showGuides;
      e.currentTarget.classList.toggle('active', compositor.showGuides);
      this.updatePreview();
      window.app?.showToast(`Safe Margins: ${compositor.showGuides ? 'ON' : 'OFF'}`);
    });

    // Capture Snapshot
    document.getElementById('btnCaptureSnapshot')?.addEventListener('click', () => {
      if (!this.canvas) return;
      try {
        const dataUrl = this.canvas.toDataURL('image/png');
        const a = document.createElement('a');
        const curTime = store.get('playback.currentTime') || 0;
        const fps = store.get('project.settings.fps') || 30;
        const tc = TimeUtils.secondsToTimecode(curTime, fps).replace(/:/g, '-');
        a.href = dataUrl;
        a.download = `snapshot_${tc}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.app?.showToast(`Snapshot exported (${TimeUtils.secondsToTimecode(curTime, fps)})`);
      } catch (err) {
        console.warn('Snapshot export error:', err);
      }
    });

    // Fullscreen
    document.getElementById('btnFullscreen')?.addEventListener('click', () => {
      const container = document.getElementById('previewPanel');
      if (!document.fullscreenElement) {
        container?.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    // Video Scopes Toggle
    document.getElementById('btnToggleScopes')?.addEventListener('click', (e) => {
      window.videoScopes?.toggle();
      e.currentTarget.classList.toggle('active', window.videoScopes?.visible);
    });

    // Proxy Mode Toggle
    document.getElementById('btnToggleProxy')?.addEventListener('click', (e) => {
      const active = window.proxyEngine?.toggleProxyMode();
      e.currentTarget.classList.toggle('active', active);
      window.app?.showToast(`Proxy Mode: ${active ? 'ACTIVE (540p 60fps)' : 'OFF (Raw Source)'}`);
    });

    // Keyframe Bezier Graph Editor Toggle
    document.getElementById('btnToggleGraphEditor')?.addEventListener('click', (e) => {
      window.keyframeGraphEditor?.toggle();
      e.currentTarget.classList.toggle('active', window.keyframeGraphEditor?.container?.style.display === 'block');
    });
  }

  _bindCanvasGizmo() {
    if (!this.canvas) return;

    let gizmoMode = 'idle'; // 'move', 'scale-tl', 'scale-tr', 'scale-br', 'scale-bl', 'rotate'
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;
    let initialScaleX = 1, initialScaleY = 1;
    let initialRot = 0;
    let activeClip = null;

    const getActiveClip = () => {
      const selectedIds = store.get('selection.clipIds') || [];
      if (selectedIds.length === 0) return null;
      const tracks = store.get('tracks') || [];
      const curTime = store.get('playback.currentTime') || 0;
      for (const t of tracks) {
        const c = t.clips?.find(clip => clip.id === selectedIds[0]);
        if (c && curTime >= c.startTime && curTime < c.startTime + c.duration) return c;
      }
      return null;
    };

    const getCanvasToProject = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const pw = store.get('project.settings.width') || 1920;
      const ph = store.get('project.settings.height') || 1080;
      const scale = Math.min(rect.width / pw, rect.height / ph);
      const offsetX = (rect.width - pw * scale) / 2;
      const offsetY = (rect.height - ph * scale) / 2;

      const px = (clientX - rect.left - offsetX) / scale;
      const py = (clientY - rect.top - offsetY) / scale;
      return { px, py, scale, pw, ph };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      activeClip = getActiveClip();
      if (!activeClip) return;

      const { px, py, pw, ph } = getCanvasToProject(e.clientX, e.clientY);
      const curTransform = activeClip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
      const centerX = pw / 2 + (curTransform.x || 0);
      const centerY = ph / 2 + (curTransform.y || 0);
      const sx = curTransform.scaleX || 1;
      const sy = curTransform.scaleY || 1;
      const rot = (curTransform.rotation || 0) * Math.PI / 180;

      const dx = px - centerX;
      const dy = py - centerY;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const localX = (dx * cos - dy * sin) / sx;
      const localY = (dx * sin + dy * cos) / sy;

      const halfW = pw / 2;
      const halfH = ph / 2;
      const threshold = 20 / Math.max(0.2, (sx + sy) / 2);

      const rotY = -halfH - 24 / sy;
      
      // Mask gizmo hit test
      if (activeClip.mask && activeClip.mask.enabled) {
        const mx = activeClip.mask.x || 0;
        const my = activeClip.mask.y || 0;
        const mw = activeClip.mask.width || pw / 2;
        
        if (Math.hypot(localX - (mx + mw/2), localY - my) <= threshold) {
          gizmoMode = 'mask-size';
        } else if (Math.hypot(localX - mx, localY - my) <= threshold) {
          gizmoMode = 'mask-move';
        }
      }

      if (gizmoMode === 'idle') {
        if (Math.hypot(localX, localY - rotY) <= threshold) {
          gizmoMode = 'rotate';
        } else if (Math.abs(localX - (-halfW)) <= threshold && Math.abs(localY - (-halfH)) <= threshold) {
          gizmoMode = 'scale-tl';
        } else if (Math.abs(localX - halfW) <= threshold && Math.abs(localY - (-halfH)) <= threshold) {
          gizmoMode = 'scale-tr';
        } else if (Math.abs(localX - halfW) <= threshold && Math.abs(localY - halfH) <= threshold) {
          gizmoMode = 'scale-br';
        } else if (Math.abs(localX - (-halfW)) <= threshold && Math.abs(localY - halfH) <= threshold) {
          gizmoMode = 'scale-bl';
        } else if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
          gizmoMode = 'move';
        } else {
          return;
        }
      }

      startX = e.clientX;
      startY = e.clientY;
      initialX = curTransform.x || 0;
      initialY = curTransform.y || 0;
      initialScaleX = sx;
      initialScaleY = sy;
      initialRot = curTransform.rotation || 0;
      
      const initialMaskX = activeClip.mask?.x || 0;
      const initialMaskY = activeClip.mask?.y || 0;
      const initialMaskW = activeClip.mask?.width || pw / 2;
      const initialMaskH = activeClip.mask?.height || ph / 2;

      const onMouseMove = (moveEvent) => {
        if (gizmoMode === 'idle' || !activeClip) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleFactor = Math.min(rect.width / pw, rect.height / ph);

        if (gizmoMode === 'move') {
          const dScreenX = (moveEvent.clientX - startX) / scaleFactor;
          const dScreenY = (moveEvent.clientY - startY) / scaleFactor;
          activeClip.transform = {
            ...activeClip.transform,
            x: Math.round(initialX + dScreenX),
            y: Math.round(initialY + dScreenY)
          };
        } else if (gizmoMode.startsWith('scale')) {
          const dScreenX = (moveEvent.clientX - startX) / scaleFactor;
          const deltaScale = (dScreenX / (pw / 2)) * (gizmoMode === 'scale-tl' || gizmoMode === 'scale-bl' ? -1 : 1);
          const newScale = Math.max(0.05, Math.min(10, initialScaleX + deltaScale));
          activeClip.transform = {
            ...activeClip.transform,
            scaleX: Math.round(newScale * 100) / 100,
            scaleY: Math.round(newScale * 100) / 100
          };
        } else if (gizmoMode === 'rotate') {
          const curPoint = getCanvasToProject(moveEvent.clientX, moveEvent.clientY);
          const rad = Math.atan2(curPoint.py - centerY, curPoint.px - centerX);
          let deg = (rad * 180 / Math.PI) + 90;
          if (deg > 180) deg -= 360;
          activeClip.transform = {
            ...activeClip.transform,
            rotation: Math.round(deg)
          };
        } else if (gizmoMode.startsWith('mask')) {
          const dScreenX = (moveEvent.clientX - startX) / scaleFactor / sx;
          const dScreenY = (moveEvent.clientY - startY) / scaleFactor / sy;
          // Apply inverse rotation
          const ldx = dScreenX * cos - dScreenY * sin;
          const ldy = dScreenX * sin + dScreenY * cos;
          
          if (gizmoMode === 'mask-move') {
             activeClip.mask.x = initialMaskX + ldx;
             activeClip.mask.y = initialMaskY + ldy;
          } else if (gizmoMode === 'mask-size') {
             activeClip.mask.width = Math.max(10, initialMaskW + ldx * 2);
             activeClip.mask.height = Math.max(10, initialMaskH + (ldx * 2) * (initialMaskH/initialMaskW)); // Maintain aspect ratio roughly for now
          }
        }

        this.updatePreview();
        window.inspector?.render();
      };

      const onMouseUp = () => {
        if (activeClip) {
          if (gizmoMode.startsWith('mask')) {
             Actions.updateClipProperties(activeClip.id, { mask: activeClip.mask });
          } else if (gizmoMode !== 'idle') {
             Actions.updateClipProperties(activeClip.id, { transform: activeClip.transform });
          }
        }
        gizmoMode = 'idle';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  _bindStoreEvents() {
    store.on('playback.playing', (playing) => {
      this.isPlaying = !!playing;
      if (this.btnPlay) {
        this.btnPlay.innerHTML = this.isPlaying
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-left:2px"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        this.btnPlay.classList.toggle('active', this.isPlaying);
      }

      if (this.isPlaying) {
        this.lastFrameTime = performance.now();
        this._startLoop();
      } else {
        this._stopLoop();
      }
    });

    store.on('playback.currentTime', (time) => {
      if (this.timecodeEl) {
        const fps = store.get('project.settings.fps') || 30;
        this.timecodeEl.textContent = TimeUtils.secondsToTimecode(time, fps);
      }
      if (!this.isPlaying) {
        this.updatePreview();
      }
    });

    store.on('playback.duration', (dur) => {
      if (this.durationEl) {
        const fps = store.get('project.settings.fps') || 30;
        this.durationEl.textContent = TimeUtils.secondsToTimecode(dur, fps);
      }
    });

    store.on('tracks', () => {
      this._checkEmptyState();
      if (!this.isPlaying) {
        this.updatePreview();
      }
    });
  }

  _handleResize() {
    if (!this.canvas) return;
    const container = document.getElementById('previewContainer');
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pad = 24; // 12px breathing margin around monitor
    const availW = Math.max(100, rect.width - pad);
    const availH = Math.max(100, rect.height - pad);

    const pw = store.get('project.settings.width') || 1920;
    const ph = store.get('project.settings.height') || 1080;
    const aspect = pw / ph;

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

    const badge = document.getElementById('previewBadgeResolution');
    if (badge) {
      const fps = store.get('project.settings.fps') || 30;
      const ratio = store.get('project.aspectRatio') || '16:9';
      badge.textContent = `${ratio} · ${pw}×${ph} · ${fps}fps`;
    }

    this.updatePreview();
  }

  _checkEmptyState() {
    const tracks = store.get('tracks') || [];
    const hasClips = tracks.some(t => t.clips && t.clips.length > 0);

    if (this.emptyState) {
      this.emptyState.style.display = hasClips ? 'none' : 'flex';
    }
  }

  _startLoop() {
    const loop = (now) => {
      if (!this.isPlaying) return;

      const deltaMs = now - this.lastFrameTime;
      this.lastFrameTime = now;

      const speed = store.get('playback.speed') || 1;
      const deltaSec = (deltaMs / 1000) * speed;
      const curTime = store.get('playback.currentTime');
      const duration = store.get('playback.duration');

      let nextTime = curTime + deltaSec;

      if (duration > 0 && nextTime >= duration) {
        if (store.get('playback.loop')) {
          nextTime = 0;
        } else {
          nextTime = duration;
          store.set('playback.playing', false);
          store.set('playback.currentTime', nextTime);
          this.updatePreview();
          return;
        }
      }

      store.set('playback.currentTime', nextTime);
      this.updatePreview();

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    compositor.pauseAllMedia();
  }

  updatePreview() {
    const time = store.get('playback.currentTime');
    const tracks = store.get('tracks') || [];
    const settings = store.get('project.settings');

    compositor.renderFrame(time, tracks, settings);
  }
}

window.previewEngine = new PreviewEngine();
