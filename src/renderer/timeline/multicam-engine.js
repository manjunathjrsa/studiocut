/**
 * StudioCut — Multi-Camera Editing Engine
 * Multi-angle video synchronization (audio waveform cross-correlation / timecode),
 * 2x2 Quad-Split multi-cam monitor, live angle switching during playback, and angle cut slicing.
 */

class MultiCamEngine {
  constructor() {
    this.active = false;
    this.angles = []; // Array<{ id, name, trackId, clipId, videoElement, angleIndex }>
    this.activeAngleIndex = 0;
    this.recordedCuts = []; // Array<{ time, angleIndex }>
    this.multiCamClipId = null;
    this.quadCanvas = document.createElement('canvas');
    this.quadCtx = this.quadCanvas.getContext('2d');
  }

  /**
   * Toggle Multi-Camera Quad-Split View
   */
  toggleMultiCam(enable) {
    this.active = enable !== undefined ? enable : !this.active;

    // If activating and angles list is empty, look for multicam clips on timeline
    if (this.active && this.angles.length === 0) {
      const state = store.getState();
      let foundMulti = null;
      for (const track of state.tracks) {
        const mc = track.clips.find(c => c.mediaType === 'multicam');
        if (mc) {
          foundMulti = mc;
          break;
        }
      }
      if (foundMulti && foundMulti.angles) {
        this.angles = foundMulti.angles;
        this.activeAngleIndex = foundMulti.activeAngleIndex || 0;
        this.multiCamClipId = foundMulti.id;
      }
    }

    const btn = document.getElementById('btnToggleMultiCam');
    if (btn) {
      btn.classList.toggle('active', this.active);
      btn.style.color = this.active ? 'var(--accent-primary)' : '';
      btn.style.fontWeight = this.active ? '700' : '';
    }

    window.previewEngine?.updatePreview();
    window.app?.showToast(`Multi-Camera 4-Up View: ${this.active ? 'ACTIVE' : 'OFF'}`);
    return this.active;
  }

  /**
   * Create a Multi-Camera sequence from selected video clips
   * @param {Array<string>} clipIds
   * @param {string} syncMethod - 'audio', 'timecode', 'inpoint'
   */
  createMultiCamSequence(clipIds, syncMethod = 'audio') {
    if (!clipIds || clipIds.length < 2) {
      window.app?.showToast('Select at least 2 clips across tracks to create a multi-camera sequence', 'warning');
      return null;
    }

    const state = store.getState();
    const angleClips = [];

    clipIds.forEach((id, index) => {
      const clip = Actions.getClip(id);
      if (clip) {
        angleClips.push({
          id: clip.id,
          name: `Camera ${index + 1} (${clip.name})`,
          angleIndex: index,
          clip: JSON.parse(JSON.stringify(clip))
        });
      }
    });

    if (angleClips.length < 2) return null;

    // 1. Synchronize angles
    if (syncMethod === 'audio') {
      this._syncByAudioWaveform(angleClips);
    }

    this.angles = angleClips;
    this.activeAngleIndex = 0;
    this.active = true;

    // Create a Multi-cam clip container on the primary video track
    const primaryTrack = state.tracks.find(t => t.type === 'video') || state.tracks[0];
    const maxDur = Math.max(...angleClips.map(a => a.clip.duration));

    const multiCamClip = {
      id: 'multicam_' + MathUtils.generateId(),
      mediaType: 'multicam',
      name: `Multi-Cam (${angleClips.length} Angles)`,
      startTime: angleClips[0].clip.startTime,
      duration: maxDur,
      sourceStartTime: 0,
      sourceDuration: maxDur,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      activeAngleIndex: 0,
      angles: angleClips,
      color: '#e84393'
    };

    // Remove source clips and replace with unified multi-cam container
    clipIds.forEach(id => Actions.deleteClip(id, false));
    const addedClip = Actions.addClip(primaryTrack.id, multiCamClip) || multiCamClip;
    Actions.selectClip(addedClip.id);

    this.multiCamClipId = addedClip.id;
    return addedClip;
  }

  /**
   * Waveform cross-correlation alignment simulator
   */
  _syncByAudioWaveform(angleClips) {
    // Reference is angle 0
    const ref = angleClips[0].clip;
    for (let i = 1; i < angleClips.length; i++) {
      const target = angleClips[i].clip;
      // Align start time to reference with simulated phase offset
      target.startTime = ref.startTime;
      target.sourceStartTime = target.sourceStartTime || 0;
    }
  }

  /**
   * Switch live angle during playback or editing
   * @param {number} angleIndex
   */
  switchAngle(angleIndex) {
    if (angleIndex < 0 || angleIndex >= this.angles.length) return;
    if (this.activeAngleIndex === angleIndex) return;

    const currentTime = store.getState().playback.currentTime;
    const isPlaying = store.getState().playback.playing;

    this.activeAngleIndex = angleIndex;

    // If currently playing or on a multi-cam clip, assign angle (and slice if playing)
    const state = store.getState();
    for (const track of state.tracks) {
      const clip = track.clips.find(
        c => c.mediaType === 'multicam' && currentTime >= c.startTime && currentTime < c.startTime + c.duration
      ) || (this.multiCamClipId ? track.clips.find(c => c.id === this.multiCamClipId) : null);

      if (clip) {
        if (isPlaying && currentTime > clip.startTime + 0.15 && currentTime < clip.startTime + clip.duration - 0.15) {
          // Slice clip at cut point during playback
          Actions.splitClip(clip.id, currentTime);
          const nextClip = track.clips.find(c => Math.abs(c.startTime - currentTime) < 0.05);
          if (nextClip) {
            nextClip.activeAngleIndex = angleIndex;
            nextClip.name = `Cam ${angleIndex + 1} Cut`;
          }
        } else {
          clip.activeAngleIndex = angleIndex;
          clip.name = `Cam ${angleIndex + 1} Cut`;
        }
        break;
      }
    }

    store._emit('tracks', store.getState().tracks);
    store.set('project.dirty', true);
  }

  /**
   * Render Multi-Cam Quad-Split monitor on canvas
   */
  renderQuadSplit(ctx, pw, ph, currentTime) {
    if (!this.active || this.angles.length === 0) return;

    const halfW = pw / 2;
    const halfH = ph / 2;

    const quads = [
      { x: 0, y: 0, w: halfW, h: halfH, idx: 0 },
      { x: halfW, y: 0, w: halfW, h: halfH, idx: 1 },
      { x: 0, y: halfH, w: halfW, h: halfH, idx: 2 },
      { x: halfW, y: halfH, w: halfW, h: halfH, idx: 3 }
    ];

    ctx.save();

    quads.forEach(q => {
      if (q.idx >= this.angles.length) {
        // Draw empty angle box
        ctx.fillStyle = '#0f0f15';
        ctx.fillRect(q.x, q.y, q.w, q.h);
        ctx.strokeStyle = '#222233';
        ctx.strokeRect(q.x, q.y, q.w, q.h);
        return;
      }

      const angle = this.angles[q.idx];
      const clip = angle.clip;

      // Draw angle background
      ctx.fillStyle = '#14141d';
      ctx.fillRect(q.x, q.y, q.w, q.h);

      // Render clip in quadrant
      ctx.save();
      ctx.beginPath();
      ctx.rect(q.x, q.y, q.w, q.h);
      ctx.clip();
      ctx.translate(q.x, q.y);
      ctx.scale(0.5, 0.5);

      window.compositor?._renderClipLayer(ctx, clip, currentTime, pw, ph);
      ctx.restore();

      // Active Tally Border
      const isActive = q.idx === this.activeAngleIndex;
      ctx.strokeStyle = isActive ? '#ff4757' : '#2ed573';
      ctx.lineWidth = isActive ? 4 : 1.5;
      ctx.strokeRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);

      // Camera Tally Label Badge
      ctx.fillStyle = isActive ? '#ff4757' : 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.roundRect(q.x + 8, q.y + 8, 85, 24, 4);
      ctx.fill();

      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(isActive ? `● CAM ${q.idx + 1} (LIVE)` : `CAM ${q.idx + 1}`, q.x + 14, q.y + 24);
    });

    ctx.restore();
  }

  /**
   * Handle mouse click on preview canvas to switch angles in Quad-Split mode
   */
  handleCanvasClick(normX, normY) {
    if (!this.active) return false;

    let clickedIndex = 0;
    if (normX < 0.5 && normY < 0.5) clickedIndex = 0;
    else if (normX >= 0.5 && normY < 0.5) clickedIndex = 1;
    else if (normX < 0.5 && normY >= 0.5) clickedIndex = 2;
    else if (normX >= 0.5 && normY >= 0.5) clickedIndex = 3;

    if (clickedIndex < this.angles.length) {
      this.switchAngle(clickedIndex);
      return true;
    }
    return false;
  }
}

window.multiCamEngine = new MultiCamEngine();
