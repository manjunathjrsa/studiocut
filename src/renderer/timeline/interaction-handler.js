/**
 * StudioCut — Timeline Interaction Handler
 * Mouse, drag, drop, trim, split, zoom, and scrub interactions
 */

class TimelineInteractionHandler {
  constructor() {
    this.tracksCanvas = null;
    this.rulerCanvas = null;
    this.tracksContainer = null;
    this.rulerContainer = null;

    // Interaction state
    this.mode = 'idle'; // 'scrub', 'drag-clip', 'trim-left', 'trim-right', 'pan', 'marquee'
    this.dragData = null;
    this.activeSnapLine = null;

    this.onRenderRequest = null;
  }

  init(timelineEngine) {
    this.engine = timelineEngine;
    this.tracksCanvas = document.getElementById('tracksCanvas');
    this.rulerCanvas = document.getElementById('rulerCanvas');
    this.tracksContainer = document.getElementById('timelineTracks');
    this.rulerContainer = document.getElementById('timelineRuler');

    this._bindRulerEvents();
    this._bindTracksEvents();
    this._bindDragDrop();
    this._createSnapLine();
    this._createMarqueeElement();
    this._createDropGhostElement();
  }

  _createSnapLine() {
    if (!this.tracksContainer) return;
    this.activeSnapLine = document.createElement('div');
    this.activeSnapLine.className = 'timeline__snap-line';
    this.tracksContainer.appendChild(this.activeSnapLine);
  }

  _createMarqueeElement() {
    if (!this.tracksContainer) return;
    this.marqueeEl = document.createElement('div');
    this.marqueeEl.className = 'timeline__marquee';
    this.marqueeEl.style.cssText = 'position:absolute; border:1px dashed #00f2fe; background:rgba(0, 242, 254, 0.15); pointer-events:none; z-index:60; display:none; border-radius:2px;';
    this.tracksContainer.appendChild(this.marqueeEl);
  }

  _createDropGhostElement() {
    if (!this.tracksContainer) return;
    this.dropGhostEl = document.createElement('div');
    this.dropGhostEl.className = 'timeline__drop-ghost';
    this.dropGhostEl.style.cssText = 'position:absolute; border:2px dashed #00cec9; background:rgba(0, 206, 201, 0.25); pointer-events:none; z-index:55; display:none; border-radius:4px;';
    this.tracksContainer.appendChild(this.dropGhostEl);
  }

  _showSnapLine(x) {
    if (!this.activeSnapLine) return;
    this.activeSnapLine.style.left = `${x}px`;
    this.activeSnapLine.classList.add('visible');
  }

  _hideSnapLine() {
    if (!this.activeSnapLine) return;
    this.activeSnapLine.classList.remove('visible');
  }

  // ═══════════════════════════════════════════
  // Ruler (Playhead Scrubbing)
  // ═══════════════════════════════════════════
  _bindRulerEvents() {
    if (!this.rulerContainer) return;

    const onRulerMove = (e) => {
      const rect = this.rulerContainer.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const zoom = store.get('timeline.zoom');
      const scrollX = store.get('timeline.scrollX');
      const time = Math.max(0, (clientX + scrollX) / zoom);
      Actions.seek(time);
    };

    const startScrub = (e) => {
      e.preventDefault();
      this.mode = 'scrub';
      onRulerMove(e);

      const onMouseMove = (moveEvent) => {
        if (this.mode === 'scrub') {
          onRulerMove(moveEvent);
        }
      };

      const onMouseUp = () => {
        this.mode = 'idle';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    this.rulerContainer.addEventListener('mousedown', startScrub);

    // Bind directly on playhead line so dragging the red line scrubs smoothly
    const playheadEl = document.getElementById('playhead');
    if (playheadEl) {
      playheadEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        startScrub(e);
      });
    }
  }

  // ═══════════════════════════════════════════
  // Tracks Canvas Interactions
  // ═══════════════════════════════════════════
  _bindTracksEvents() {
    if (!this.tracksCanvas || !this.tracksContainer) return;

    // Hover cursor updates
    this.tracksContainer.addEventListener('mousemove', (e) => {
      if (this.mode !== 'idle') return;
      this._updateCursor(e);
    });

    // Right-click context menu
    this.tracksContainer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = this.tracksContainer.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const zoom = store.get('timeline.zoom');
      const scrollX = store.get('timeline.scrollX');
      const scrollY = store.get('timeline.scrollY');
      const tracks = store.get('tracks') || [];

      const trackHit = trackRenderer.getTrackAtY(py, tracks, scrollY);
      if (!trackHit) return;

      const { track, trackY } = trackHit;
      for (let i = track.clips.length - 1; i >= 0; i--) {
        const clip = track.clips[i];
        const zone = clipRenderer.hitTestClip(px, py, clip, track, trackY, zoom, scrollX);
        if (zone) {
          // Select the clip
          store.set('selection.clipIds', [clip.id]);
          store.set('selection.trackId', track.id);
          this._showContextMenu(e, clip, track);
          return;
        }
      }
    });

    // Mousedown for select, drag, trim, razor, hand
    this.tracksContainer.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 1) return; // Only left or middle click

      const tool = store.get('timeline.tool') || 'select';

      // Middle click or hand tool -> Pan
      if (e.button === 1 || tool === 'hand') {
        this._startPan(e);
        return;
      }

      const rect = this.tracksContainer.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const zoom = store.get('timeline.zoom');
      const scrollX = store.get('timeline.scrollX');
      const scrollY = store.get('timeline.scrollY');
      const tracks = store.get('tracks') || [];

      // Find hit track
      const trackHit = trackRenderer.getTrackAtY(py, tracks, scrollY);
      if (!trackHit) {
        // Clicked outside tracks: clear selection
        store.set('selection.clipIds', []);
        return;
      }

      const { track, trackY } = trackHit;

      // Find hit clip
      let hitClip = null;
      let hitZone = null;
      let hitSpeedPointIdx = null;

      for (let i = track.clips.length - 1; i >= 0; i--) {
        const clip = track.clips[i];
        
        // Speed Point Hit Test
        if (clip.speedPoints && clip.showSpeedCurve !== false) {
          const cx = clip.startTime * zoom - scrollX;
          const cy = trackY + 2;
          const ch = track.height - 4;
          const minS = 0; const maxS = 4.0;
          for (let j = 0; j < clip.speedPoints.length; j++) {
            const pt = clip.speedPoints[j];
            const pX = cx + pt.time * zoom;
            const norm = Math.max(0, Math.min(1, (pt.speed - minS) / (maxS - minS)));
            const pY = cy + ch - (norm * ch * 0.8 + ch * 0.1);
            if (Math.abs(px - pX) < 6 && Math.abs(py - pY) < 6) {
              hitSpeedPointIdx = j;
              hitClip = clip;
              hitZone = 'speed-point';
              break;
            }
          }
        }
        
        if (hitZone) break;

        const zone = clipRenderer.hitTestClip(px, py, clip, track, trackY, zoom, scrollX);
        if (zone) {
          hitClip = clip;
          hitZone = zone;
          break;
        }
      }

      // Razor Tool
      if (tool === 'razor') {
        if (hitClip && hitZone !== 'speed-point') {
          const clickTime = (px + scrollX) / zoom;
          Actions.splitClip(hitClip.id, clickTime);
        }
        return;
      }

      // Selection Tool
      if (hitClip) {
        if (hitZone === 'speed-point') {
           this._startSpeedPointDrag(e, hitClip, hitSpeedPointIdx, trackY);
           return;
        }
        if (e.altKey && hitClip.showSpeedCurve !== false) {
          const clickTime = (px + scrollX) / zoom - hitClip.startTime;
          const points = [...(hitClip.speedPoints || [{ time: 0, speed: hitClip.speed || 1 }, { time: hitClip.duration, speed: hitClip.speed || 1 }])];
          points.push({ time: clickTime, speed: hitClip.speed || 1.0 });
          points.sort((a, b) => a.time - b.time);
          Actions.updateClip(hitClip.id, { speedPoints: points });
          window.app?.showToast('Speed Point Added');
          return;
        }
        
        const currentSelected = store.get('selection.clipIds') || [];
        const isShift = e.shiftKey;

        if (isShift) {
          // Toggle selection
          if (currentSelected.includes(hitClip.id)) {
            store.set('selection.clipIds', currentSelected.filter(id => id !== hitClip.id));
          } else {
            store.set('selection.clipIds', [...currentSelected, hitClip.id]);
          }
        } else {
          if (!currentSelected.includes(hitClip.id)) {
            store.set('selection.clipIds', [hitClip.id]);
          }
        }

        // Handle trim or drag
        if (hitZone === 'trim-left' || hitZone === 'trim-right') {
          this._startTrim(e, hitClip, track, hitZone);
        } else {
          this._startClipDrag(e, hitClip, track);
        }
      } else {
        // Empty space click -> start rubber-band marquee selection
        this._startMarqueeSelection(e, px, py);
      }
    });

    // Zoom and pan via wheel
    this.tracksContainer.addEventListener('wheel', (e) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom centered at mouse pointer
        const rect = this.tracksContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const oldZoom = store.get('timeline.zoom');
        const scrollX = store.get('timeline.scrollX');
        const pointerTime = (mouseX + scrollX) / oldZoom;

        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        const newZoom = MathUtils.clamp(oldZoom * factor, 1, 500);

        const newScrollX = Math.max(0, pointerTime * newZoom - mouseX);
        store.set('timeline.zoom', newZoom);
        store.set('timeline.scrollX', newScrollX);
      } else if (e.shiftKey) {
        // Horizontal scroll
        const scrollX = store.get('timeline.scrollX');
        store.set('timeline.scrollX', Math.max(0, scrollX + e.deltaY));
      } else {
        // Track vertical scroll
        const scrollY = store.get('timeline.scrollY');
        const tracks = store.get('tracks') || [];
        const maxScrollY = Math.max(0, trackRenderer.getTotalHeight(tracks) - this.tracksContainer.clientHeight + 40);
        store.set('timeline.scrollY', MathUtils.clamp(scrollY + e.deltaY, 0, maxScrollY));
      }

      this.engine?.requestRender();
    }, { passive: false });
  }

  // ═══════════════════════════════════════════
  // Rubber-Band Marquee Bulk Selection
  // ═══════════════════════════════════════════
  _startMarqueeSelection(e, startPx, startPy) {
    this.mode = 'marquee';
    const isShift = e.shiftKey;
    const initialSelected = isShift ? [...(store.get('selection.clipIds') || [])] : [];
    let hasMoved = false;

    if (this.marqueeEl) {
      this.marqueeEl.style.left = `${startPx}px`;
      this.marqueeEl.style.top = `${startPy}px`;
      this.marqueeEl.style.width = '0px';
      this.marqueeEl.style.height = '0px';
      this.marqueeEl.style.display = 'block';
    }

    const onMouseMove = (moveEvent) => {
      const rect = this.tracksContainer.getBoundingClientRect();
      const curPx = moveEvent.clientX - rect.left;
      const curPy = moveEvent.clientY - rect.top;

      if (Math.hypot(curPx - startPx, curPy - startPy) > 4) {
        hasMoved = true;
      }

      const left = Math.min(startPx, curPx);
      const top = Math.min(startPy, curPy);
      const width = Math.abs(curPx - startPx);
      const height = Math.abs(curPy - startPy);

      if (this.marqueeEl) {
        this.marqueeEl.style.left = `${left}px`;
        this.marqueeEl.style.top = `${top}px`;
        this.marqueeEl.style.width = `${width}px`;
        this.marqueeEl.style.height = `${height}px`;
      }

      // Check intersection with all clips across tracks
      const zoom = store.get('timeline.zoom');
      const scrollX = store.get('timeline.scrollX');
      const scrollY = store.get('timeline.scrollY');
      const tracks = store.get('tracks') || [];

      const matchedIds = new Set(initialSelected);

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (!track.visible) continue;
        const trackY = trackRenderer.getTrackY(i, tracks, scrollY);
        for (const clip of track.clips) {
          const cx = clip.startTime * zoom - scrollX;
          const cw = clip.duration * zoom;
          const cy = trackY + 2;
          const ch = track.height - 4;

          // AABB bounding box overlap check
          if (cx < left + width && cx + cw > left && cy < top + height && cy + ch > top) {
            matchedIds.add(clip.id);
          }
        }
      }

      store.set('selection.clipIds', Array.from(matchedIds));
    };

    const onMouseUp = () => {
      this.mode = 'idle';
      if (this.marqueeEl) {
        this.marqueeEl.style.display = 'none';
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      // If clicked without dragging, clear selection (if not shift) & seek playhead
      if (!hasMoved) {
        if (!isShift) store.set('selection.clipIds', []);
        const zoom = store.get('timeline.zoom');
        const scrollX = store.get('timeline.scrollX');
        const clickTime = Math.max(0, (startPx + scrollX) / zoom);
        Actions.seek(clickTime);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  _updateCursor(e) {
    const rect = this.tracksContainer.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const tool = store.get('timeline.tool');

    if (tool === 'razor') {
      this.tracksContainer.style.cursor = 'crosshair';
      return;
    }
    if (tool === 'hand') {
      this.tracksContainer.style.cursor = 'grab';
      return;
    }

    const zoom = store.get('timeline.zoom');
    const scrollX = store.get('timeline.scrollX');
    const scrollY = store.get('timeline.scrollY');
    const tracks = store.get('tracks') || [];

    const trackHit = trackRenderer.getTrackAtY(py, tracks, scrollY);
    if (!trackHit) {
      this.tracksContainer.style.cursor = 'default';
      return;
    }

    const { track, trackY } = trackHit;
    let hitZone = null;

    for (const clip of track.clips) {
      const zone = clipRenderer.hitTestClip(px, py, clip, track, trackY, zoom, scrollX);
      if (zone) {
        hitZone = zone;
        break;
      }
    }

    if (hitZone === 'trim-left' || hitZone === 'trim-right') {
      this.tracksContainer.style.cursor = 'ew-resize';
    } else if (hitZone === 'body') {
      this.tracksContainer.style.cursor = 'move';
    } else {
      this.tracksContainer.style.cursor = 'default';
    }
  }

  // ═══════════════════════════════════════════
  // Clip Dragging (Multi-Clip Group Drag + Snapping)
  // ═══════════════════════════════════════════
  _startClipDrag(e, primaryClip, sourceTrack) {
    this.mode = 'drag-clip';
    const startX = e.clientX;
    const initialStartTime = primaryClip.startTime;
    const clipDuration = primaryClip.duration;
    const primaryId = primaryClip.id;

    // Support group dragging if multiple clips are selected
    let selectedIds = store.get('selection.clipIds') || [primaryId];
    if (!selectedIds.includes(primaryId)) {
      selectedIds = [primaryId];
      store.set('selection.clipIds', selectedIds);
    }

    // Capture initial positions of all moving clips
    const movingClipsData = [];
    const tracks = store.get('tracks') || [];
    for (const tr of tracks) {
      for (const cl of tr.clips) {
        if (selectedIds.includes(cl.id)) {
          movingClipsData.push({
            clip: cl,
            trackId: tr.id,
            initialStartTime: cl.startTime
          });
        }
      }
    }

    let targetTrackId = sourceTrack.id;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const zoom = store.get('timeline.zoom');
      const deltaTime = dx / zoom;
      let proposedPrimaryTime = Math.max(0, initialStartTime + deltaTime);

      // Snap primary clip
      const snapResult = snapEngine.snap(proposedPrimaryTime, clipDuration, zoom, selectedIds);
      if (snapResult) {
        proposedPrimaryTime = snapResult.snappedTime;
        const scrollX = store.get('timeline.scrollX');
        this._showSnapLine(snapResult.targetPoint.time * zoom - scrollX);
      } else {
        this._hideSnapLine();
      }

      const effectiveDelta = proposedPrimaryTime - initialStartTime;

      // Update all selected clips in real time
      for (const item of movingClipsData) {
        item.clip.startTime = Math.max(0, item.initialStartTime + effectiveDelta);
      }

      // Check track change for primary clip
      const rect = this.tracksContainer.getBoundingClientRect();
      const py = moveEvent.clientY - rect.top;
      const scrollY = store.get('timeline.scrollY');
      const trackHit = trackRenderer.getTrackAtY(py, tracks, scrollY);
      if (trackHit && !trackHit.track.locked) {
        targetTrackId = trackHit.track.id;
      }

      this.engine?.requestRender();
    };

    const onMouseUp = () => {
      this.mode = 'idle';
      this._hideSnapLine();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      // Commit moves for all selected clips
      for (const item of movingClipsData) {
        const finalTrackId = (item.clip.id === primaryId) ? targetTrackId : item.trackId;
        Actions.moveClip(item.clip.id, finalTrackId, item.clip.startTime);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // ═══════════════════════════════════════════
  // Clip Trimming (Start or End)
  // ═══════════════════════════════════════════
  _startTrim(e, clip, track, handle) {
    this.mode = handle;
    const startX = e.clientX;
    const initialStartTime = clip.startTime;
    const initialDuration = clip.duration;
    const initialSourceStartTime = clip.sourceStartTime || 0;
    const zoom = store.get('timeline.zoom');

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const deltaTime = dx / zoom;

      if (handle === 'trim-left') {
        const newStart = Math.max(0, initialStartTime + deltaTime);
        const delta = newStart - initialStartTime;
        const newDuration = Math.max(0.1, initialDuration - delta);

        clip.startTime = newStart;
        clip.duration = newDuration;
        clip.sourceStartTime = Math.max(0, initialSourceStartTime + delta);
      } else {
        const newDuration = Math.max(0.1, initialDuration + deltaTime);
        clip.duration = newDuration;
      }

      this.engine?.requestRender();
    };

    const onMouseUp = () => {
      this.mode = 'idle';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      Actions.trimClip(clip.id, {
        startTime: clip.startTime,
        duration: clip.duration,
        sourceStartTime: clip.sourceStartTime
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // ═══════════════════════════════════════════
  // Pan Tool / Middle-click Pan
  // ═══════════════════════════════════════════
  _startPan(e) {
    this.mode = 'pan';
    const startX = e.clientX;
    const startY = e.clientY;
    const initialScrollX = store.get('timeline.scrollX');
    const initialScrollY = store.get('timeline.scrollY');
    this.tracksContainer.style.cursor = 'grabbing';

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      store.set('timeline.scrollX', Math.max(0, initialScrollX - dx));
      store.set('timeline.scrollY', Math.max(0, initialScrollY - dy));
      this.engine?.requestRender();
    };

    const onMouseUp = () => {
      this.mode = 'idle';
      this.tracksContainer.style.cursor = 'default';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // ═══════════════════════════════════════════
  // Drag and Drop from Media Browser & OS Files
  // ═══════════════════════════════════════════
  _bindDragDrop() {
    if (!this.tracksContainer) return;

    this.tracksContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      const rect = this.tracksContainer.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const zoom = store.get('timeline.zoom') || 50;
      const scrollX = store.get('timeline.scrollX') || 0;
      const scrollY = store.get('timeline.scrollY') || 0;
      const tracks = store.get('tracks') || [];

      const draggedMedia = window._draggedMediaItem;
      const clipDuration = draggedMedia?.duration || (draggedMedia?.type === 'image' ? 5 : 8);

      const trackHit = trackRenderer.getTrackAtY(py, tracks, scrollY);
      const targetTrack = trackHit ? trackHit.track : (tracks.find(t => t.type === (draggedMedia?.type === 'audio' ? 'audio' : 'video') && !t.locked) || tracks[0]);

      if (this.dropGhostEl && targetTrack) {
        const dropTime = Math.max(0, (px + scrollX) / zoom);
        const x = dropTime * zoom - scrollX;
        const w = Math.max(20, clipDuration * zoom);
        const targetTrackIndex = tracks.indexOf(targetTrack);
        const y = trackRenderer.getTrackY(targetTrackIndex, tracks, scrollY);

        this.dropGhostEl.style.left = `${x}px`;
        this.dropGhostEl.style.top = `${y + 2}px`;
        this.dropGhostEl.style.width = `${w}px`;
        this.dropGhostEl.style.height = `${targetTrack.height - 4}px`;
        this.dropGhostEl.style.display = 'block';
      }
    });

    this.tracksContainer.addEventListener('dragleave', (e) => {
      if (!this.tracksContainer.contains(e.relatedTarget)) {
        if (this.dropGhostEl) this.dropGhostEl.style.display = 'none';
      }
    });

    this.tracksContainer.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (this.dropGhostEl) this.dropGhostEl.style.display = 'none';

      const rect = this.tracksContainer.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const zoom = store.get('timeline.zoom') || 50;
      const scrollX = store.get('timeline.scrollX') || 0;
      const scrollY = store.get('timeline.scrollY') || 0;
      const tracks = store.get('tracks') || [];

      let dropTime = Math.max(0, (px + scrollX) / zoom);

      // 1. Check if native files dropped directly from OS
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const fileList = Array.from(e.dataTransfer.files);
        const filePaths = fileList.map(f => {
          if (window.studiocut?.file?.getPathForFile) {
            try { return window.studiocut.file.getPathForFile(f); } catch (err) {}
          }
          return f.path || '';
        }).filter(Boolean);

        if (filePaths.length > 0) {
          await window.app?.importFiles(filePaths);
        } else {
          window.app?._handleBrowserFiles(fileList);
        }

        // Place newly imported media on timeline at drop position
        const mediaList = store.get('media') || [];
        const addedMedia = mediaList[mediaList.length - 1];
        if (addedMedia) {
          const trackType = addedMedia.type === 'audio' ? 'audio' : 'video';
          const targetTrack = tracks.find(t => t.type === trackType && !t.locked) || tracks[0];
          if (targetTrack && !targetTrack.locked) {
            const snapResult = snapEngine.snap(dropTime, addedMedia.duration || 5, zoom);
            if (snapResult) dropTime = snapResult.snappedTime;

            const newClip = Actions.addClip(targetTrack.id, {
              mediaId: addedMedia.id,
              sourcePath: addedMedia.path,
              name: addedMedia.name,
              mediaType: addedMedia.type || 'video',
              startTime: dropTime,
              duration: addedMedia.duration || 5,
              sourceDuration: addedMedia.duration || 5
            });
            if (newClip) {
              store.set('selection.clipIds', [newClip.id]);
              Actions.seek(dropTime);
              window.previewEngine?.updatePreview();
              window.app?.showToast(`Added "${addedMedia.name}" to ${targetTrack.name}`);
            }
          }
        }
        return;
      }

      // 2. Resolve media from in-memory or dataTransfer
      let media = window._draggedMediaItem;

      if (!media) {
        const jsonStr = e.dataTransfer.getData('application/json');
        if (jsonStr) {
          try { media = JSON.parse(jsonStr); } catch (err) {}
        }
      }

      if (!media) {
        const mediaId = e.dataTransfer.getData('text/plain');
        if (mediaId) {
          const mediaList = store.get('media') || [];
          media = mediaList.find(m => m.id === mediaId);
        }
      }

      if (!media) return;

      // Snap calculation
      const snapResult = snapEngine.snap(dropTime, media.duration || 5, zoom);
      if (snapResult) dropTime = snapResult.snappedTime;

      // Determine target track
      const trackHit = trackRenderer.getTrackAtY(py, tracks, scrollY);
      const preferredTrackType = media.type === 'audio' ? 'audio' : 'video';
      let targetTrack = null;

      if (trackHit && !trackHit.track.locked) {
        targetTrack = trackHit.track;
      } else {
        targetTrack = tracks.find(t => t.type === preferredTrackType && !t.locked) || tracks.find(t => !t.locked);
      }

      if (!targetTrack) {
        targetTrack = Actions.addTrack(preferredTrackType);
      }

      if (targetTrack.locked) {
        window.app?.showToast(`Track "${targetTrack.name}" is locked!`, 'warning');
        return;
      }

      const newClip = Actions.addClip(targetTrack.id, {
        mediaId: media.id,
        sourcePath: media.path,
        name: media.name,
        mediaType: media.type || 'video',
        startTime: dropTime,
        duration: media.duration || (media.type === 'image' ? 5 : 8),
        sourceDuration: media.duration || 8,
        thumbnails: media.thumbnails || []
      });

      if (newClip) {
        store.set('selection.clipIds', [newClip.id]);
        Actions.seek(dropTime);
        window.previewEngine?.updatePreview();
        window.app?.showToast(`Added "${media.name}" to ${targetTrack.name}`);
      }

      window._draggedMediaItem = null;
    });
  }
  _startSpeedPointDrag(e, clip, pointIdx, trackY) {
    e.preventDefault();
    this.mode = 'drag-speed-point';
    
    const zoom = store.get('timeline.zoom');
    const scrollX = store.get('timeline.scrollX');
    const track = (store.get('tracks') || []).find(t => t.clips.some(c => c.id === clip.id));
    if (!track) return;
    
    const points = [...clip.speedPoints];
    
    const cy = trackY + 2;
    const ch = track.height - 4;
    const minS = 0; const maxS = 4.0;
    
    const onMouseMove = (moveEvent) => {
      if (this.mode !== 'drag-speed-point') return;
      const rect = this.tracksContainer.getBoundingClientRect();
      const px = moveEvent.clientX - rect.left;
      const py = moveEvent.clientY - rect.top;
      
      let newTime = (px + scrollX) / zoom - clip.startTime;
      if (pointIdx === 0) newTime = 0;
      else if (pointIdx === points.length - 1) newTime = clip.duration;
      else {
         const prevTime = points[pointIdx - 1].time;
         const nextTime = points[pointIdx + 1].time;
         newTime = MathUtils.clamp(newTime, prevTime + 0.05, nextTime - 0.05);
      }
      
      const norm = Math.max(0, Math.min(1, (cy + ch - py - ch * 0.1) / (ch * 0.8)));
      const newSpeed = Math.round((minS + norm * (maxS - minS)) * 100) / 100;
      
      points[pointIdx] = { time: newTime, speed: newSpeed };
      Actions.updateClip(clip.id, { speedPoints: points });
      this.engine?.requestRender();
    };

    const onMouseUp = () => {
      this.mode = 'idle';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // ═══════════════════════════════════════════
  // Enhanced Right-Click Context Menu
  // ═══════════════════════════════════════════

  _showContextMenu(e, clip, track) {
    e.preventDefault();
    const menu = document.getElementById('contextMenu');
    if (!menu) return;

    const colorLabels = [
      { name: 'Red', color: '#e74c3c' },
      { name: 'Orange', color: '#e67e22' },
      { name: 'Yellow', color: '#f1c40f' },
      { name: 'Green', color: '#2ecc71' },
      { name: 'Blue', color: '#3498db' },
      { name: 'Purple', color: '#9b59b6' },
      { name: 'Pink', color: '#e84393' },
      { name: 'None', color: '' }
    ];

    const speedOptions = [
      { label: '0.25x (Slow Mo)', speed: 0.25 },
      { label: '0.5x (Half)', speed: 0.5 },
      { label: '1x (Normal)', speed: 1 },
      { label: '1.5x', speed: 1.5 },
      { label: '2x (Double)', speed: 2 },
      { label: '4x (Fast)', speed: 4 }
    ];

    const currentSpeed = clip.speed || 1;

    menu.innerHTML = `
      <div class="ctx-menu">
        <button class="ctx-menu__item" data-action="cut"><span>✂️ Cut</span><span class="ctx-menu__shortcut">Ctrl+X</span></button>
        <button class="ctx-menu__item" data-action="copy"><span>📋 Copy</span><span class="ctx-menu__shortcut">Ctrl+C</span></button>
        <button class="ctx-menu__item" data-action="paste"><span>📎 Paste</span><span class="ctx-menu__shortcut">Ctrl+V</span></button>
        <button class="ctx-menu__item" data-action="duplicate"><span>🔁 Duplicate</span><span class="ctx-menu__shortcut">Ctrl+D</span></button>
        <div class="ctx-menu__separator"></div>
        <button class="ctx-menu__item" data-action="split"><span>🔪 Split at Playhead</span><span class="ctx-menu__shortcut">Ctrl+B</span></button>
        <button class="ctx-menu__item" data-action="delete"><span>🗑️ Delete</span><span class="ctx-menu__shortcut">Del</span></button>
        <button class="ctx-menu__item" data-action="ripple-delete"><span>⚡ Ripple Delete</span><span class="ctx-menu__shortcut">Shift+Del</span></button>
        <div class="ctx-menu__separator"></div>
        <button class="ctx-menu__item" data-action="freeze"><span>❄️ Freeze Frame</span></button>
        <button class="ctx-menu__item" data-action="fit-to-fill"><span>↔️ Fit to Fill...</span></button>
        <button class="ctx-menu__item" data-action="add-note"><span>📝 Add Note...</span></button>
        <div class="ctx-menu__separator"></div>
        <div class="ctx-menu__submenu-trigger">
          <span>🎨 Color Label</span>
          <span>▶</span>
          <div class="ctx-menu__submenu">
            ${colorLabels.map(c => `
              <button class="ctx-menu__item" data-action="color-label" data-color="${c.color}">
                <span style="display:flex; align-items:center; gap:6px;">
                  ${c.color ? `<span style="width:12px; height:12px; border-radius:50%; background:${c.color}; display:inline-block; border:1px solid rgba(255,255,255,0.2);"></span>` : '<span style="width:12px; height:12px; display:inline-block;">✕</span>'}
                  ${c.name}
                </span>
                ${clip.colorLabel === c.color ? '<span>✓</span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="ctx-menu__submenu-trigger">
          <span>⏩ Speed</span>
          <span>▶</span>
          <div class="ctx-menu__submenu">
            ${speedOptions.map(s => `
              <button class="ctx-menu__item" data-action="set-speed" data-speed="${s.speed}">
                <span>${s.label}</span>
                ${Math.abs(currentSpeed - s.speed) < 0.01 ? '<span>✓</span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="ctx-menu__separator"></div>
        <button class="ctx-menu__item" data-action="nest"><span>📦 Nest (Compound Clip)</span></button>
      </div>
    `;

    // Position
    menu.style.display = 'block';
    const menuRect = menu.getBoundingClientRect();
    let posX = e.clientX;
    let posY = e.clientY;
    if (posX + menuRect.width > window.innerWidth) posX = window.innerWidth - menuRect.width - 8;
    if (posY + menuRect.height > window.innerHeight) posY = window.innerHeight - menuRect.height - 8;
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    // Action handlers
    const handleAction = (action, target) => {
      menu.style.display = 'none';

      switch (action) {
        case 'cut':
          Actions.copySelectedClips();
          Actions.removeSelectedClips();
          break;
        case 'copy':
          Actions.copySelectedClips();
          break;
        case 'paste':
          Actions.pasteClips();
          break;
        case 'duplicate':
          Actions.duplicateSelectedClips();
          break;
        case 'split':
          Actions.splitAtPlayhead();
          break;
        case 'delete':
          Actions.removeSelectedClips();
          break;
        case 'ripple-delete':
          Actions.rippleDelete();
          break;
        case 'freeze':
          Actions.freezeFrame(clip.id);
          window.app?.showToast('Freeze frame inserted');
          break;
        case 'fit-to-fill': {
          const dur = prompt('Enter target duration (seconds):', clip.duration.toFixed(2));
          if (dur && !isNaN(parseFloat(dur))) {
            Actions.fitToFill(clip.id, parseFloat(dur));
            window.app?.showToast(`Speed adjusted to fit ${dur}s`);
          }
          break;
        }
        case 'add-note': {
          const note = prompt('Clip Note:', clip.notes || '');
          if (note !== null) {
            Actions.setClipNote(clip.id, note);
            window.app?.showToast('Note saved');
          }
          break;
        }
        case 'color-label': {
          const color = target.dataset.color || '';
          Actions.setClipColor(clip.id, color || null);
          break;
        }
        case 'set-speed': {
          const newSpeed = parseFloat(target.dataset.speed) || 1;
          const oldDuration = clip.duration;
          const newDuration = oldDuration * (clip.speed || 1) / newSpeed;
          Actions.updateClip(clip.id, { speed: newSpeed, duration: newDuration });
          window.app?.showToast(`Speed: ${newSpeed}x`);
          break;
        }
        case 'nest':
          if (window.compoundClipEngine) {
            window.compoundClipEngine.createCompoundClip();
            window.app?.showToast('Created compound clip');
          }
          break;
      }

      this.engine?.requestRender();
    };

    menu.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handleAction(btn.dataset.action, btn);
      });
    });

    // Close on outside click
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.style.display = 'none';
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 10);
  }
}

window.timelineInteractionHandler = new TimelineInteractionHandler();

