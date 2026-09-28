/**
 * StudioCut — Compound Clips & Nested Sequences Engine
 * Group multiple clips and tracks into unified nested containers, step in/out of sub-timelines,
 * and recursively composite nested tracks.
 */

class CompoundClipsEngine {
  constructor() {
    this.sequenceStack = []; // Breadcrumbs stack for nested navigation
    this.activeSequenceId = null; // null = Master sequence
  }

  /**
   * Create a compound clip from currently selected clips
   * @param {string} name
   * @returns {object|null} The created compound clip
   */
  createCompoundClipFromSelection(name = 'Compound Clip') {
    const state = store.getState();
    const selectedIds = state.selection.clipIds;
    if (!selectedIds || selectedIds.length === 0) {
      console.warn('No clips selected to create compound clip.');
      return null;
    }

    // Gather selected clips with their track information
    const selectedClipsData = [];
    let minStartTime = Infinity;
    let maxEndTime = -Infinity;
    let targetTrackId = null;

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (selectedIds.includes(clip.id)) {
          selectedClipsData.push({ clip: JSON.parse(JSON.stringify(clip)), trackType: track.type, trackId: track.id });
          if (clip.startTime < minStartTime) minStartTime = clip.startTime;
          const end = clip.startTime + clip.duration;
          if (end > maxEndTime) maxEndTime = end;
          if (!targetTrackId && track.type === 'video') targetTrackId = track.id;
        }
      }
    }

    if (selectedClipsData.length === 0) return null;
    if (!targetTrackId) targetTrackId = state.tracks[0].id;

    const compoundDuration = maxEndTime - minStartTime;

    // Build internal virtual tracks for the compound container
    const internalVideoTrack = {
      id: 'sub_v1_' + MathUtils.generateId(),
      type: 'video',
      name: 'Nested Video 1',
      clips: [],
      visible: true,
      muted: false
    };

    const internalAudioTrack = {
      id: 'sub_a1_' + MathUtils.generateId(),
      type: 'audio',
      name: 'Nested Audio 1',
      clips: [],
      visible: true,
      muted: false
    };

    // Normalize clip timings relative to compound start (0s)
    selectedClipsData.forEach(item => {
      const c = item.clip;
      c.startTime = c.startTime - minStartTime; // Relative time
      if (item.trackType === 'video' || c.mediaType === 'video' || c.mediaType === 'image' || c.mediaType === 'text') {
        internalVideoTrack.clips.push(c);
      } else {
        internalAudioTrack.clips.push(c);
      }
    });

    // Remove original clips from the timeline
    selectedIds.forEach(id => {
      Actions.deleteClip(id, false);
    });

    // Create the compound container clip
    const compoundClip = {
      id: 'compound_' + MathUtils.generateId(),
      mediaType: 'compound',
      name: name,
      startTime: minStartTime,
      duration: compoundDuration,
      sourceStartTime: 0,
      sourceDuration: compoundDuration,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
      internalTracks: [internalVideoTrack, internalAudioTrack],
      color: '#a29bfe'
    };

    // Insert the compound clip into the primary track
    Actions.addClip(targetTrackId, compoundClip);
    Actions.selectClip(compoundClip.id);

    return compoundClip;
  }

  /**
   * Decompose (unpack) a compound clip back into master timeline tracks
   * @param {string} compoundClipId
   */
  unpackCompoundClip(compoundClipId) {
    const state = store.getState();
    let foundClip = null;
    let parentTrack = null;

    for (const track of state.tracks) {
      const c = track.clips.find(clip => clip.id === compoundClipId);
      if (c && c.mediaType === 'compound') {
        foundClip = c;
        parentTrack = track;
        break;
      }
    }

    if (!foundClip || !foundClip.internalTracks) return false;

    const baseStartTime = foundClip.startTime;

    // Delete compound clip
    Actions.deleteClip(foundClip.id, false);

    // Re-insert internal clips at offset
    foundClip.internalTracks.forEach(subTrack => {
      let targetTrack = state.tracks.find(t => t.type === subTrack.type);
      if (!targetTrack) targetTrack = state.tracks[0];

      subTrack.clips.forEach(subClip => {
        const restored = JSON.parse(JSON.stringify(subClip));
        restored.id = MathUtils.generateId();
        restored.startTime = baseStartTime + restored.startTime;
        Actions.addClip(targetTrack.id, restored);
      });
    });

    return true;
  }

  /**
   * Step inside a compound clip to edit its internal tracks
   * @param {string} compoundClipId
   */
  stepIntoCompoundClip(compoundClipId) {
    const clip = Actions.getClip(compoundClipId);
    if (!clip || clip.mediaType !== 'compound') return false;

    // Push current master state into sequence stack
    this.sequenceStack.push({
      id: this.activeSequenceId || 'master',
      name: this.activeSequenceId ? 'Sub-Sequence' : 'Master Timeline',
      tracks: JSON.parse(JSON.stringify(store.getState().tracks)),
      currentTime: store.getState().playback.currentTime,
      compoundClipId: compoundClipId
    });

    this.activeSequenceId = compoundClipId;

    // Replace store tracks with internal compound tracks
    store.set('tracks', JSON.parse(JSON.stringify(clip.internalTracks)));
    store.set('playback.currentTime', 0);
    store.set('playback.duration', clip.duration);
    store.set('selection.clipIds', []);

    this._renderBreadcrumbs();
    return true;
  }

  /**
   * Step out to parent sequence
   */
  stepOutToParent() {
    if (this.sequenceStack.length === 0) return false;

    const parent = this.sequenceStack.pop();

    // Save changes back to compound clip in parent tracks
    const currentSubTracks = JSON.parse(JSON.stringify(store.getState().tracks));
    for (const track of parent.tracks) {
      const c = track.clips.find(clip => clip.id === parent.compoundClipId);
      if (c && c.mediaType === 'compound') {
        c.internalTracks = currentSubTracks;
        // Recalculate duration
        let maxEnd = 0;
        currentSubTracks.forEach(st => {
          st.clips.forEach(sc => {
            const end = sc.startTime + sc.duration;
            if (end > maxEnd) maxEnd = end;
          });
        });
        c.duration = maxEnd;
        c.sourceDuration = maxEnd;
        break;
      }
    }

    this.activeSequenceId = parent.id === 'master' ? null : parent.id;
    store.set('tracks', parent.tracks);
    store.set('playback.currentTime', parent.currentTime);
    Actions._recalculateDuration();

    this._renderBreadcrumbs();
    return true;
  }

  _renderBreadcrumbs() {
    let container = document.getElementById('sequenceBreadcrumbs');
    if (!container) {
      const timelineHeader = document.querySelector('.timeline__toolbar');
      if (!timelineHeader) return;
      container = document.createElement('div');
      container.id = 'sequenceBreadcrumbs';
      container.className = 'sequence-breadcrumbs';
      timelineHeader.prepend(container);
    }

    if (this.sequenceStack.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    container.innerHTML = `
      <span class="breadcrumb-item breadcrumb-item--link" id="breadcrumbMaster">Master Sequence</span>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-item active">Compound Clip</span>
      <button class="btn btn--ghost btn--xs" id="breadcrumbStepOut" title="Back to Master">↑ Step Out</button>
    `;

    container.querySelector('#breadcrumbMaster')?.addEventListener('click', () => {
      while (this.sequenceStack.length > 0) {
        this.stepOutToParent();
      }
    });

    container.querySelector('#breadcrumbStepOut')?.addEventListener('click', () => {
      this.stepOutToParent();
    });
  }

  /**
   * Render compound clip during compositor pass
   */
  renderCompoundClip(ctx, compoundClip, currentTime, pw, ph) {
    if (!compoundClip.internalTracks) return;

    // Calculate time within the nested compound clip
    const subTime = (currentTime - compoundClip.startTime) * (compoundClip.speed || 1);
    if (subTime < 0 || subTime > compoundClip.duration) return;

    ctx.save();

    // Apply compound clip transform
    const t = compoundClip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    ctx.translate(pw / 2 + (t.x || 0), ph / 2 + (t.y || 0));
    ctx.rotate(((t.rotation || 0) * Math.PI) / 180);
    ctx.scale(t.scaleX !== undefined ? t.scaleX : 1, t.scaleY !== undefined ? t.scaleY : 1);
    ctx.globalAlpha = (compoundClip.opacity !== undefined ? compoundClip.opacity : 1);
    ctx.translate(-pw / 2, -ph / 2);

    // Recursively render internal tracks from bottom to top
    const internalSorted = [...compoundClip.internalTracks].reverse();
    for (const subTrack of internalSorted) {
      if (!subTrack.visible) continue;
      const subClips = (subTrack.clips || []).filter(
        sc => subTime >= sc.startTime && subTime < sc.startTime + sc.duration
      );
      for (const sc of subClips) {
        window.compositor?._renderClipLayer(ctx, sc, subTime, pw, ph);
      }
    }

    ctx.restore();
  }
}

window.compoundClipsEngine = new CompoundClipsEngine();
