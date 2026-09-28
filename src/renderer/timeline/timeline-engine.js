/**
 * StudioCut — Timeline Engine
 * Orchestrates canvas rendering, ruler drawing, track management, and toolbar controls
 */

class TimelineEngine {
  constructor() {
    this.rulerCanvas = null;
    this.tracksCanvas = null;
    this.rulerCtx = null;
    this.tracksCtx = null;

    this.rulerContainer = null;
    this.tracksContainer = null;
    this.playheadEl = null;

    this._renderScheduled = false;
  }

  init() {
    this.rulerCanvas = document.getElementById('rulerCanvas');
    this.tracksCanvas = document.getElementById('tracksCanvas');
    this.rulerContainer = document.getElementById('timelineRuler');
    this.tracksContainer = document.getElementById('timelineTracks');
    this.playheadEl = document.getElementById('playhead');

    if (!this.rulerCanvas || !this.tracksCanvas) return;

    this.rulerCtx = this.rulerCanvas.getContext('2d');
    this.tracksCtx = this.tracksCanvas.getContext('2d');

    // Initialize sub-modules
    trackRenderer.init();
    timelineInteractionHandler.init(this);

    this._bindToolbar();
    this._bindStoreEvents();
    this._handleResize();

    window.addEventListener('resize', () => this._handleResize());

    this.requestRender();
  }

  _bindToolbar() {
    const btnToolSelect = document.getElementById('btnToolSelect');
    const btnToolRazor = document.getElementById('btnToolRazor');
    const btnToolHand = document.getElementById('btnToolHand');

    const updateToolButtons = (tool) => {
      btnToolSelect?.classList.toggle('active', tool === 'select');
      btnToolRazor?.classList.toggle('active', tool === 'razor');
      btnToolHand?.classList.toggle('active', tool === 'hand');
    };

    btnToolSelect?.addEventListener('click', () => store.set('timeline.tool', 'select'));
    btnToolRazor?.addEventListener('click', () => store.set('timeline.tool', 'razor'));
    btnToolHand?.addEventListener('click', () => store.set('timeline.tool', 'hand'));

    store.on('timeline.tool', (tool) => updateToolButtons(tool));

    // Split & Delete
    document.getElementById('btnSplit')?.addEventListener('click', () => Actions.splitAtPlayhead());
    document.getElementById('btnDeleteClip')?.addEventListener('click', () => Actions.removeSelectedClips());

    // Snapping & Markers
    const btnSnap = document.getElementById('btnSnap');
    btnSnap?.addEventListener('click', () => {
      const snap = !store.get('timeline.snapEnabled');
      store.set('timeline.snapEnabled', snap);
      btnSnap.classList.toggle('active', snap);
    });

    document.getElementById('btnAddMarker')?.addEventListener('click', () => {
      Actions.addMarker(store.get('playback.currentTime'), 'Marker');
    });

    // Zoom controls
    const zoomSlider = document.getElementById('timelineZoom');
    const zoomDisplay = document.getElementById('timelineZoomDisplay');

    if (zoomSlider) {
      zoomSlider.value = store.get('timeline.zoom');
      zoomSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        store.set('timeline.zoom', val);
        if (zoomDisplay) zoomDisplay.textContent = `${Math.round(val * 2)}%`;
      });
    }

    document.getElementById('btnZoomIn')?.addEventListener('click', () => Actions.zoomTimeline(1.3));
    document.getElementById('btnZoomOut')?.addEventListener('click', () => Actions.zoomTimeline(0.77));
    document.getElementById('btnZoomFit')?.addEventListener('click', () => Actions.fitTimeline());
  }

  _bindStoreEvents() {
    store.on('tracks', () => {
      trackRenderer.updateHeaders();
      this.requestRender();
    });

    store.on('playback.currentTime', (time) => {
      this._updatePlayhead(time);
    });

    store.on('timeline.zoom', (zoom) => {
      const slider = document.getElementById('timelineZoom');
      const display = document.getElementById('timelineZoomDisplay');
      if (slider) slider.value = zoom;
      if (display) display.textContent = `${Math.round(zoom * 2)}%`;
      this.requestRender();
    });

    store.on('timeline.scrollX', () => {
      this._updatePlayhead(store.get('playback.currentTime'));
      this.requestRender();
    });

    store.on('timeline.scrollY', () => {
      this.requestRender();
    });

    store.on('selection.clipIds', () => {
      this.requestRender();
    });

    store.on('markers', () => {
      this.requestRender();
    });
  }

  _handleResize() {
    if (!this.rulerContainer || !this.tracksContainer) return;

    const dpr = window.devicePixelRatio || 1;

    // Size ruler canvas
    const rWidth = this.rulerContainer.clientWidth;
    const rHeight = this.rulerContainer.clientHeight || 24;
    this.rulerCanvas.width = rWidth * dpr;
    this.rulerCanvas.height = rHeight * dpr;
    this.rulerCtx.resetTransform();
    this.rulerCtx.scale(dpr, dpr);

    // Size tracks canvas
    const tWidth = this.tracksContainer.clientWidth;
    const tHeight = this.tracksContainer.clientHeight;
    this.tracksCanvas.width = tWidth * dpr;
    this.tracksCanvas.height = tHeight * dpr;
    this.tracksCtx.resetTransform();
    this.tracksCtx.scale(dpr, dpr);

    this.requestRender();
  }

  requestRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    requestAnimationFrame(() => {
      this._renderScheduled = false;
      this.render();
    });
  }

  render() {
    this._renderRuler();
    this._renderTracks();
    this._updatePlayhead(store.get('playback.currentTime'));
  }

  // ═══════════════════════════════════════════
  // Ruler Rendering
  // ═══════════════════════════════════════════
  _renderRuler() {
    const ctx = this.rulerCtx;
    if (!ctx) return;

    const width = this.rulerContainer.clientWidth;
    const height = this.rulerContainer.clientHeight || 24;
    const zoom = store.get('timeline.zoom');
    const scrollX = store.get('timeline.scrollX');
    const fps = store.get('project.settings.fps') || 30;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#161922';
    ctx.fillRect(0, 0, width, height);

    const interval = TimeUtils.getRulerInterval(zoom);
    const startTime = Math.floor(scrollX / zoom / interval.major) * interval.major;
    const endTime = (scrollX + width) / zoom;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';

    // Draw major and minor ticks
    for (let t = startTime; t <= endTime; t += interval.minor) {
      const x = t * zoom - scrollX;
      const isMajor = Math.abs(t % interval.major) < 0.0001;

      ctx.beginPath();
      if (isMajor) {
        ctx.moveTo(x, height - 12);
        ctx.lineTo(x, height);
        ctx.stroke();

        const timecode = TimeUtils.secondsToTimecode(t, fps);
        ctx.fillText(timecode, x + 4, 3);
      } else {
        ctx.moveTo(x, height - 6);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Draw markers on ruler
    const markers = store.get('markers') || [];
    for (const marker of markers) {
      const mx = marker.time * zoom - scrollX;
      if (mx >= 0 && mx <= width) {
        ctx.fillStyle = marker.color || '#ff7675';
        ctx.beginPath();
        ctx.moveTo(mx - 5, 0);
        ctx.lineTo(mx + 5, 0);
        ctx.lineTo(mx + 5, 10);
        ctx.lineTo(mx, 15);
        ctx.lineTo(mx - 5, 10);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // ═══════════════════════════════════════════
  // Tracks Canvas Rendering
  // ═══════════════════════════════════════════
  _renderTracks() {
    const ctx = this.tracksCtx;
    if (!ctx) return;

    const width = this.tracksContainer.clientWidth;
    const height = this.tracksContainer.clientHeight;
    const zoom = store.get('timeline.zoom');
    const scrollX = store.get('timeline.scrollX');
    const scrollY = store.get('timeline.scrollY');

    const tracks = store.get('tracks') || [];
    const selectedClipIds = new Set(store.get('selection.clipIds') || []);

    ctx.clearRect(0, 0, width, height);

    // 1. Draw track lanes & locked overlays
    trackRenderer.renderTrackLanes(ctx, tracks, width, scrollY);

    // 2. Draw vertical time grid lines
    const interval = TimeUtils.getRulerInterval(zoom);
    const startTime = Math.floor(scrollX / zoom / interval.major) * interval.major;
    const endTime = (scrollX + width) / zoom;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let t = startTime; t <= endTime; t += interval.major) {
      const x = t * zoom - scrollX;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 3. Draw clips
    let currentY = -scrollY;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (track.visible) {
        for (const clip of track.clips) {
          const isSelected = selectedClipIds.has(clip.id);
          clipRenderer.renderClip(ctx, clip, track, currentY, zoom, scrollX, isSelected);
        }
      }
      currentY += track.height;
    }
  }

  // ═══════════════════════════════════════════
  // Playhead Position
  // ═══════════════════════════════════════════
  _updatePlayhead(time) {
    if (!this.playheadEl) return;
    const zoom = store.get('timeline.zoom');
    const scrollX = store.get('timeline.scrollX');
    const px = time * zoom - scrollX;

    this.playheadEl.style.transform = `translateX(${px}px)`;

    // Auto-scroll if playing and playhead passes right edge
    if (store.get('playback.playing') && this.tracksContainer) {
      const containerWidth = this.tracksContainer.clientWidth;
      if (px > containerWidth - 40) {
        store.set('timeline.scrollX', scrollX + containerWidth * 0.7);
      }
    }
  }
}

window.timelineEngine = new TimelineEngine();
