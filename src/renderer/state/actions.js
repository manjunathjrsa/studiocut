/**
 * StudioCut — State Actions
 * All state mutations as undoable commands
 */

let _clipClipboard = [];

const Actions = {
  // ═══════════════════════════════════════════
  // Clip Operations
  // ═══════════════════════════════════════════

  /**
   * Add a clip to a track
   */
  addClip(trackId, clip) {
    const state = store.getState();
    const track = state.tracks.find(t => t.id === trackId);
    if (!track || track.locked) return null;

    const newClip = {
      id: MathUtils.generateId(),
      mediaId: clip.mediaId || null,
      sourcePath: clip.sourcePath || '',
      mediaType: clip.mediaType || 'video',
      name: clip.name || 'Clip',
      startTime: clip.startTime || 0,         // Position on timeline
      duration: clip.duration || 5,
      sourceStartTime: clip.sourceStartTime || 0,  // Start within source
      sourceDuration: clip.sourceDuration || clip.duration || 5,
      speed: clip.speed || 1,
      volume: clip.volume !== undefined ? clip.volume : 1,
      opacity: clip.opacity !== undefined ? clip.opacity : 1,
      transform: {
        x: 0, y: 0,
        scaleX: 1, scaleY: 1,
        rotation: 0,
        anchorX: 0.5, anchorY: 0.5
      },
      effects: [],
      thumbnails: clip.thumbnails || [],
      ...clip,
      id: MathUtils.generateId()
    };

    track.clips.push(newClip);
    track.clips.sort((a, b) => a.startTime - b.startTime);

    store._pushUndo({
      type: 'custom',
      description: `Add clip: ${newClip.name}`,
      undo: () => Actions._removeClipDirect(trackId, newClip.id),
      redo: () => Actions._addClipDirect(trackId, newClip)
    });

    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
    Actions._recalculateDuration();

    return newClip;
  },

  _addClipDirect(trackId, clip) {
    const track = store.getState().tracks.find(t => t.id === trackId);
    if (track) {
      track.clips.push(JSON.parse(JSON.stringify(clip)));
      track.clips.sort((a, b) => a.startTime - b.startTime);
      store._emit('tracks', store.getState().tracks);
    }
  },

  _removeClipDirect(trackId, clipId) {
    const track = store.getState().tracks.find(t => t.id === trackId);
    if (track) {
      track.clips = track.clips.filter(c => c.id !== clipId);
      store._emit('tracks', store.getState().tracks);
    }
  },

  /**
   * Select one or multiple clips
   */
  selectClips(clipIds) {
    store.set('selection.clipIds', Array.isArray(clipIds) ? clipIds : (clipIds ? [clipIds] : []));
  },

  /**
   * Remove selected clips
   */
  removeSelectedClips() {
    const state = store.getState();
    const selectedIds = [...state.selection.clipIds];
    if (selectedIds.length === 0) return;

    const removedClips = [];

    for (const track of state.tracks) {
      for (const clipId of selectedIds) {
        const clipIndex = track.clips.findIndex(c => c.id === clipId);
        if (clipIndex !== -1) {
          removedClips.push({
            trackId: track.id,
            clip: JSON.parse(JSON.stringify(track.clips[clipIndex])),
            index: clipIndex
          });
          track.clips.splice(clipIndex, 1);
        }
      }
    }

    store._pushUndo({
      type: 'custom',
      description: `Delete ${removedClips.length} clip(s)`,
      undo: () => {
        for (const { trackId, clip, index } of removedClips) {
          const track = store.getState().tracks.find(t => t.id === trackId);
          if (track) track.clips.splice(index, 0, JSON.parse(JSON.stringify(clip)));
        }
        store._emit('tracks', store.getState().tracks);
      },
      redo: () => {
        for (const { trackId, clip } of removedClips) {
          Actions._removeClipDirect(trackId, clip.id);
        }
      }
    });

    store.set('selection.clipIds', []);
    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
    Actions._recalculateDuration();
  },

  /**
   * Delete a specific clip by ID
   */
  deleteClip(clipId, pushUndo = true) {
    const state = store.getState();
    for (const track of state.tracks) {
      const idx = track.clips.findIndex(c => c.id === clipId);
      if (idx !== -1) {
        const removed = track.clips.splice(idx, 1)[0];
        if (pushUndo) {
          store._pushUndo({
            type: 'custom',
            description: `Delete clip: ${removed.name}`,
            undo: () => {
              const t = store.getState().tracks.find(tr => tr.id === track.id);
              if (t) t.clips.splice(idx, 0, JSON.parse(JSON.stringify(removed)));
              store._emit('tracks', store.getState().tracks);
            },
            redo: () => {
              Actions._removeClipDirect(track.id, clipId);
            }
          });
        }
        store._emit('tracks', state.tracks);
        store.set('project.dirty', true);
        Actions._recalculateDuration();
        return removed;
      }
    }
    return null;
  },

  /**
   * Copy selected clips to clipboard
   */
  copySelectedClips() {
    const state = store.getState();
    const selectedIds = state.selection.clipIds;
    if (!selectedIds || selectedIds.length === 0) return 0;

    _clipClipboard = [];
    let minStartTime = Infinity;

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (selectedIds.includes(clip.id)) {
          if (clip.startTime < minStartTime) {
            minStartTime = clip.startTime;
          }
          _clipClipboard.push({
            trackId: track.id,
            trackType: track.type,
            clip: JSON.parse(JSON.stringify(clip))
          });
        }
      }
    }

    for (const item of _clipClipboard) {
      item.relativeOffset = item.clip.startTime - minStartTime;
    }

    return _clipClipboard.length;
  },

  /**
   * Cut selected clips to clipboard and remove from timeline
   */
  cutSelectedClips() {
    const count = Actions.copySelectedClips();
    if (count > 0) {
      Actions.removeSelectedClips();
    }
    return count;
  },

  /**
   * Paste copied clips at playhead
   */
  pasteClips(targetTrackId = null) {
    if (!_clipClipboard || _clipClipboard.length === 0) return [];
    const state = store.getState();
    const playheadTime = state.playback.currentTime || 0;

    const pastedClips = [];
    const defaultVideoTrack = state.tracks.find(t => t.type === 'video' && !t.locked);
    const defaultAudioTrack = state.tracks.find(t => t.type === 'audio' && !t.locked);

    for (const item of _clipClipboard) {
      let track = null;
      if (targetTrackId) {
        track = state.tracks.find(t => t.id === targetTrackId && !t.locked);
      }
      if (!track) {
        track = item.trackType === 'audio' ? defaultAudioTrack : defaultVideoTrack;
      }
      if (!track) {
        track = state.tracks.find(t => !t.locked);
      }
      if (!track) continue;

      const newClip = JSON.parse(JSON.stringify(item.clip));
      newClip.id = MathUtils.generateId();
      newClip.startTime = playheadTime + (item.relativeOffset || 0);

      track.clips.push(newClip);
      track.clips.sort((a, b) => a.startTime - b.startTime);
      pastedClips.push({ trackId: track.id, clip: newClip });
    }

    if (pastedClips.length > 0) {
      store._pushUndo({
        type: 'custom',
        description: `Paste ${pastedClips.length} clip(s)`,
        undo: () => {
          for (const { trackId, clip } of pastedClips) {
            Actions._removeClipDirect(trackId, clip.id);
          }
        },
        redo: () => {
          for (const { trackId, clip } of pastedClips) {
            Actions._addClipDirect(trackId, clip);
          }
        }
      });

      store.set('selection.clipIds', pastedClips.map(p => p.clip.id));
      store._emit('tracks', state.tracks);
      store.set('project.dirty', true);
      Actions._recalculateDuration();
    }

    return pastedClips.map(p => p.clip);
  },

  /**
   * Duplicate selected clips immediately after their ends
   */
  duplicateSelectedClips() {
    const state = store.getState();
    const selectedIds = state.selection.clipIds;
    if (!selectedIds || selectedIds.length === 0) return [];

    const duplicated = [];
    for (const track of state.tracks) {
      if (track.locked) continue;
      for (const clip of track.clips) {
        if (selectedIds.includes(clip.id)) {
          const newClip = JSON.parse(JSON.stringify(clip));
          newClip.id = MathUtils.generateId();
          newClip.startTime = clip.startTime + clip.duration;
          track.clips.push(newClip);
          track.clips.sort((a, b) => a.startTime - b.startTime);
          duplicated.push({ trackId: track.id, clip: newClip });
        }
      }
    }

    if (duplicated.length > 0) {
      store._pushUndo({
        type: 'custom',
        description: `Duplicate ${duplicated.length} clip(s)`,
        undo: () => {
          for (const { trackId, clip } of duplicated) {
            Actions._removeClipDirect(trackId, clip.id);
          }
        },
        redo: () => {
          for (const { trackId, clip } of duplicated) {
            Actions._addClipDirect(trackId, clip);
          }
        }
      });

      store.set('selection.clipIds', duplicated.map(d => d.clip.id));
      store._emit('tracks', state.tracks);
      store.set('project.dirty', true);
      Actions._recalculateDuration();
    }

    return duplicated.map(d => d.clip);
  },

  /**
   * Ripple Delete selected clips and shift subsequent clips left
   */
  rippleDelete() {
    const state = store.getState();
    const selectedIds = [...state.selection.clipIds];
    if (selectedIds.length === 0) return;

    const originalTracks = JSON.parse(JSON.stringify(state.tracks));

    for (const track of state.tracks) {
      if (track.locked) continue;
      track.clips.sort((a, b) => a.startTime - b.startTime);

      const toDelete = track.clips.filter(c => selectedIds.includes(c.id));
      if (toDelete.length === 0) continue;

      for (const delClip of toDelete) {
        const delStart = delClip.startTime;
        const delDur = delClip.duration;
        track.clips = track.clips.filter(c => c.id !== delClip.id);
        for (const c of track.clips) {
          if (c.startTime >= delStart) {
            c.startTime = Math.max(0, c.startTime - delDur);
          }
        }
      }
    }

    const newTracks = JSON.parse(JSON.stringify(state.tracks));

    store._pushUndo({
      type: 'custom',
      description: 'Ripple Delete',
      undo: () => {
        store.set('tracks', JSON.parse(JSON.stringify(originalTracks)));
        store._emit('tracks', store.getState().tracks);
      },
      redo: () => {
        store.set('tracks', JSON.parse(JSON.stringify(newTracks)));
        store._emit('tracks', store.getState().tracks);
      }
    });

    store.set('selection.clipIds', []);
    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
    Actions._recalculateDuration();
  },

  /**
   * Set targeted track for 3-point / 4-point editing
   */
  setTargetTrack(trackType, trackId) {
    if (trackType === 'video') {
      store.set('timeline.targetVideoTrack', trackId);
    } else {
      store.set('timeline.targetAudioTrack', trackId);
    }
    window.timelineEngine?.trackRenderer?.updateHeaders();
  },

  /**
   * Get targeted track or first available unlocked track
   */
  getTargetTrack(trackType) {
    const state = store.getState();
    const targetId = trackType === 'video' ? state.timeline?.targetVideoTrack : state.timeline?.targetAudioTrack;
    if (targetId) {
      const found = state.tracks.find(t => t.id === targetId && !t.locked);
      if (found) return found;
    }
    return state.tracks.find(t => t.type === trackType && !t.locked) || state.tracks[0];
  },

  /**
   * Match Frame: locates the source clip and seeks to matching source frame in Source Monitor
   */
  matchFrame() {
    const state = store.getState();
    const playheadTime = state.playback.currentTime || 0;
    const selectedIds = state.selection.clipIds || [];
    
    let targetClip = null;
    let targetTrack = null;

    if (selectedIds.length > 0) {
      for (const track of state.tracks) {
        const found = track.clips.find(c => c.id === selectedIds[0]);
        if (found) {
          targetClip = found;
          targetTrack = track;
          break;
        }
      }
    }

    if (!targetClip) {
      const targetVideoId = state.timeline?.targetVideoTrack;
      const vTrack = state.tracks.find(t => t.id === targetVideoId) || state.tracks.find(t => t.type === 'video');
      if (vTrack) {
        targetClip = vTrack.clips.find(c => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration);
        targetTrack = vTrack;
      }
    }

    if (!targetClip || !targetClip.sourcePath) {
      window.app?.showToast('No clip under playhead or selected to match frame', 'info');
      return null;
    }

    const clipOffset = Math.max(0, playheadTime - targetClip.startTime);
    const sourceFrameTime = (targetClip.sourceStartTime || 0) + clipOffset * (targetClip.speed || 1);

    if (window.sourceMonitor) {
      window.sourceMonitor.loadMediaFromClip(targetClip, sourceFrameTime);
      window.app?.showToast(`Match Frame: ${targetClip.name} @ ${TimeUtils.secondsToTimecode(sourceFrameTime)}`);
    }

    return { clip: targetClip, sourceFrameTime };
  },

  /**
   * 3-Point / 4-Point Insert Edit (Industry Standard `,` key)
   * Inserts marked source subclip into target track at playhead and ripples downstream clips forward
   */
  insertEdit(options = {}) {
    const state = store.getState();
    const media = options.media || window.sourceMonitor?.currentMedia;
    if (!media) {
      window.app?.showToast('No media loaded in Source Monitor to insert', 'warning');
      return null;
    }

    const trackType = media.type === 'audio' ? 'audio' : 'video';
    const targetTrack = options.targetTrackId
      ? state.tracks.find(t => t.id === options.targetTrackId)
      : Actions.getTargetTrack(trackType);

    if (!targetTrack || targetTrack.locked) {
      window.app?.showToast('Target track is locked or unavailable', 'warning');
      return null;
    }

    const insertTime = options.insertTime !== undefined ? options.insertTime : (state.playback.currentTime || 0);
    const sourceStart = options.sourceStartTime !== undefined
      ? options.sourceStartTime
      : (options.sourceIn !== undefined ? options.sourceIn : (window.sourceMonitor?.sourceIn || 0));

    let dur = options.duration;
    if (dur === undefined) {
      if (options.sourceOut !== undefined && options.sourceIn !== undefined) {
        dur = options.sourceOut - options.sourceIn;
      } else if (window.sourceMonitor?.currentMedia) {
        dur = window.sourceMonitor.sourceOut - window.sourceMonitor.sourceIn;
      } else {
        dur = media.duration || 5;
      }
    }
    dur = Math.max(0.05, dur);

    const originalTracks = JSON.parse(JSON.stringify(state.tracks));

    const newClips = [];
    for (const clip of targetTrack.clips) {
      if (clip.startTime + clip.duration <= insertTime) {
        newClips.push(clip);
      } else if (clip.startTime >= insertTime) {
        clip.startTime += dur;
        newClips.push(clip);
      } else {
        const leftDur = insertTime - clip.startTime;
        const rightDur = clip.duration - leftDur;

        clip.duration = leftDur;
        newClips.push(clip);

        const rightClip = JSON.parse(JSON.stringify(clip));
        rightClip.id = MathUtils.generateId();
        rightClip.startTime = insertTime + dur;
        rightClip.duration = rightDur;
        rightClip.sourceStartTime = (clip.sourceStartTime || 0) + leftDur * (clip.speed || 1);
        newClips.push(rightClip);
      }
    }

    const insertedClip = {
      id: MathUtils.generateId(),
      mediaId: media.id || null,
      sourcePath: media.path || '',
      mediaType: media.type || 'video',
      name: media.name || 'Inserted Clip',
      startTime: insertTime,
      duration: dur,
      sourceStartTime: sourceStart,
      sourceDuration: dur,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
      effects: [],
      thumbnails: media.thumbnail ? [media.thumbnail] : []
    };

    newClips.push(insertedClip);
    newClips.sort((a, b) => a.startTime - b.startTime);
    targetTrack.clips = newClips;

    const newTracks = JSON.parse(JSON.stringify(state.tracks));

    store._pushUndo({
      type: 'custom',
      description: `Insert: ${insertedClip.name}`,
      undo: () => {
        store.set('tracks', JSON.parse(JSON.stringify(originalTracks)));
        store._emit('tracks', store.getState().tracks);
        Actions._recalculateDuration();
      },
      redo: () => {
        store.set('tracks', JSON.parse(JSON.stringify(newTracks)));
        store._emit('tracks', store.getState().tracks);
        Actions._recalculateDuration();
      }
    });

    store.set('selection.clipIds', [insertedClip.id]);
    store.set('playback.currentTime', insertTime + dur);
    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
    Actions._recalculateDuration();
    window.previewEngine?.updatePreview();
    window.app?.showToast(`Inserted "${insertedClip.name}" into ${targetTrack.name}`);

    return insertedClip;
  },

  /**
   * 3-Point / 4-Point Overwrite Edit (Industry Standard `.` key)
   * Overwrites marked source subclip onto target track at playhead
   */
  overwriteEdit(options = {}) {
    const state = store.getState();
    const media = options.media || window.sourceMonitor?.currentMedia;
    if (!media) {
      window.app?.showToast('No media loaded in Source Monitor to overwrite', 'warning');
      return null;
    }

    const trackType = media.type === 'audio' ? 'audio' : 'video';
    const targetTrack = options.targetTrackId
      ? state.tracks.find(t => t.id === options.targetTrackId)
      : Actions.getTargetTrack(trackType);

    if (!targetTrack || targetTrack.locked) {
      window.app?.showToast('Target track is locked or unavailable', 'warning');
      return null;
    }

    const overwriteTime = options.overwriteTime !== undefined ? options.overwriteTime : (state.playback.currentTime || 0);
    const sourceStart = options.sourceStartTime !== undefined
      ? options.sourceStartTime
      : (options.sourceIn !== undefined ? options.sourceIn : (window.sourceMonitor?.sourceIn || 0));

    let dur = options.duration;
    if (dur === undefined) {
      if (options.sourceOut !== undefined && options.sourceIn !== undefined) {
        dur = options.sourceOut - options.sourceIn;
      } else if (window.sourceMonitor?.currentMedia) {
        dur = window.sourceMonitor.sourceOut - window.sourceMonitor.sourceIn;
      } else {
        dur = media.duration || 5;
      }
    }
    dur = Math.max(0.05, dur);
    const overwriteEnd = overwriteTime + dur;

    const originalTracks = JSON.parse(JSON.stringify(state.tracks));

    const newClips = [];
    for (const clip of targetTrack.clips) {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;

      if (clipEnd <= overwriteTime || clipStart >= overwriteEnd) {
        newClips.push(clip);
      } else if (clipStart >= overwriteTime && clipEnd <= overwriteEnd) {
        continue; // Completely covered
      } else if (clipStart < overwriteTime && clipEnd > overwriteEnd) {
        const leftDur = overwriteTime - clipStart;
        clip.duration = leftDur;
        newClips.push(clip);

        const rightClip = JSON.parse(JSON.stringify(clip));
        rightClip.id = MathUtils.generateId();
        rightClip.startTime = overwriteEnd;
        rightClip.duration = clipEnd - overwriteEnd;
        rightClip.sourceStartTime = (clip.sourceStartTime || 0) + (overwriteEnd - clipStart) * (clip.speed || 1);
        newClips.push(rightClip);
      } else if (clipStart < overwriteTime && clipEnd <= overwriteEnd) {
        clip.duration = overwriteTime - clipStart;
        newClips.push(clip);
      } else if (clipStart >= overwriteTime && clipEnd > overwriteEnd) {
        const cut = overwriteEnd - clipStart;
        clip.startTime = overwriteEnd;
        clip.duration -= cut;
        clip.sourceStartTime = (clip.sourceStartTime || 0) + cut * (clip.speed || 1);
        newClips.push(clip);
      }
    }

    const newClip = {
      id: MathUtils.generateId(),
      mediaId: media.id || null,
      sourcePath: media.path || '',
      mediaType: media.type || 'video',
      name: media.name || 'Overwrite Clip',
      startTime: overwriteTime,
      duration: dur,
      sourceStartTime: sourceStart,
      sourceDuration: dur,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
      effects: [],
      thumbnails: media.thumbnail ? [media.thumbnail] : []
    };

    newClips.push(newClip);
    newClips.sort((a, b) => a.startTime - b.startTime);
    targetTrack.clips = newClips;

    const newTracks = JSON.parse(JSON.stringify(state.tracks));

    store._pushUndo({
      type: 'custom',
      description: `Overwrite: ${newClip.name}`,
      undo: () => {
        store.set('tracks', JSON.parse(JSON.stringify(originalTracks)));
        store._emit('tracks', store.getState().tracks);
        Actions._recalculateDuration();
      },
      redo: () => {
        store.set('tracks', JSON.parse(JSON.stringify(newTracks)));
        store._emit('tracks', store.getState().tracks);
        Actions._recalculateDuration();
      }
    });

    store.set('selection.clipIds', [newClip.id]);
    store.set('playback.currentTime', overwriteEnd);
    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
    Actions._recalculateDuration();
    window.previewEngine?.updatePreview();
    window.app?.showToast(`Overwrote "${newClip.name}" into ${targetTrack.name}`);

    return newClip;
  },

  /**
   * Select all clips on a track
   */
  selectClipsOnTrack(trackId) {
    const state = store.getState();
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;
    store.set('selection.clipIds', track.clips.map(c => c.id));
    store.set('selection.trackId', trackId);
  },


  /**
   * Update clip properties (transform, effects, chromaKey, filters, audio, etc.)
   */
  updateClip(clipId, changes) {
    const state = store.getState();
    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        Object.assign(clip, changes);
        store._emit('tracks', state.tracks);
        store.set('project.dirty', true);
        return clip;
      }
    }
    return null;
  },

  updateClipProperties(clipId, changes) {
    return this.updateClip(clipId, changes);
  },

  /**
   * Move a clip to a new position/track
   */
  moveClip(clipId, newTrackId, newStartTime) {
    const state = store.getState();

    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (!clip) continue;

      const oldTrackId = track.id;
      const oldStartTime = clip.startTime;

      if (newTrackId === oldTrackId) {
        // Same track, just move
        clip.startTime = Math.max(0, newStartTime);
        track.clips.sort((a, b) => a.startTime - b.startTime);
      } else {
        // Move to different track
        const newTrack = state.tracks.find(t => t.id === newTrackId);
        if (!newTrack || newTrack.locked) return;

        track.clips = track.clips.filter(c => c.id !== clipId);
        clip.startTime = Math.max(0, newStartTime);
        newTrack.clips.push(clip);
        newTrack.clips.sort((a, b) => a.startTime - b.startTime);
      }

      store._pushUndo({
        type: 'custom',
        description: 'Move clip',
        undo: () => Actions.moveClip(clipId, oldTrackId, oldStartTime),
        redo: () => Actions.moveClip(clipId, newTrackId, newStartTime)
      });

      store._emit('tracks', state.tracks);
      store.set('project.dirty', true);
      Actions._recalculateDuration();
      return;
    }
  },

  /**
   * Split a clip at the playhead position
   */
  splitClipAtPlayhead() {
    return this.splitAtPlayhead();
  },

  splitAtPlayhead() {
    const state = store.getState();
    const currentTime = state.playback.currentTime;
    const selectedIds = state.selection.clipIds || [];
    const splits = [];

    for (const track of state.tracks) {
      if (track.locked) continue;

      for (let i = 0; i < track.clips.length; i++) {
        const clip = track.clips[i];
        if (selectedIds.length > 0 && !selectedIds.includes(clip.id)) {
          continue; // only split selected clips if selection exists
        }

        const clipEnd = clip.startTime + clip.duration;
        if (currentTime > clip.startTime && currentTime < clipEnd) {
          const splitPoint = currentTime - clip.startTime;

          const leftClip = {
            ...JSON.parse(JSON.stringify(clip)),
            duration: splitPoint,
          };

          const rightClip = {
            ...JSON.parse(JSON.stringify(clip)),
            id: MathUtils.generateId(),
            startTime: currentTime,
            sourceStartTime: (clip.sourceStartTime || 0) + splitPoint,
            duration: clip.duration - splitPoint,
          };

          splits.push({ track, originalClip: JSON.parse(JSON.stringify(clip)), leftClip, rightClip });
          break; // one split per track
        }
      }
    }

    if (splits.length === 0) return false;

    for (const s of splits) {
      const curIdx = s.track.clips.findIndex(c => c.id === s.originalClip.id);
      if (curIdx !== -1) {
        s.track.clips.splice(curIdx, 1, s.leftClip, s.rightClip);
      }
    }

    store._pushUndo({
      type: 'custom',
      description: `Split ${splits.length} clip(s)`,
      undo: () => {
        for (const s of splits) {
          const lIdx = s.track.clips.findIndex(c => c.id === s.leftClip.id);
          if (lIdx !== -1) {
            s.track.clips.splice(lIdx, 2, s.originalClip);
          }
        }
        store._emit('tracks', state.tracks);
      },
      redo: () => {
        for (const s of splits) {
          const oIdx = s.track.clips.findIndex(c => c.id === s.originalClip.id);
          if (oIdx !== -1) {
            s.track.clips.splice(oIdx, 1, s.leftClip, s.rightClip);
          }
        }
        store._emit('tracks', state.tracks);
      }
    });

    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
    return true;
  },

  /**
   * Split a specific clip at a specific timestamp
   */
  splitClip(clipId, splitTime) {
    const state = store.getState();

    for (const track of state.tracks) {
      if (track.locked) continue;
      const index = track.clips.findIndex(c => c.id === clipId);
      if (index === -1) continue;

      const clip = track.clips[index];
      const clipEnd = clip.startTime + clip.duration;

      if (splitTime <= clip.startTime || splitTime >= clipEnd) return false;

      const splitPoint = splitTime - clip.startTime;

      const leftClip = {
        ...JSON.parse(JSON.stringify(clip)),
        duration: splitPoint,
      };

      const rightClip = {
        ...JSON.parse(JSON.stringify(clip)),
        id: MathUtils.generateId(),
        startTime: splitTime,
        sourceStartTime: (clip.sourceStartTime || 0) + splitPoint,
        duration: clip.duration - splitPoint,
      };

      track.clips.splice(index, 1, leftClip, rightClip);

      store._pushUndo({
        type: 'custom',
        description: `Split clip: ${clip.name}`,
        undo: () => {
          const lIdx = track.clips.findIndex(c => c.id === leftClip.id);
          if (lIdx !== -1) {
            track.clips.splice(lIdx, 2, JSON.parse(JSON.stringify(clip)));
            store._emit('tracks', state.tracks);
          }
        },
        redo: () => {
          const origIdx = track.clips.findIndex(c => c.id === clip.id);
          if (origIdx !== -1) {
            track.clips.splice(origIdx, 1, JSON.parse(JSON.stringify(leftClip)), JSON.parse(JSON.stringify(rightClip)));
            store._emit('tracks', state.tracks);
          }
        }
      });

      store._emit('tracks', state.tracks);
      store.set('project.dirty', true);
      return true;
    }
    return false;
  },

  /**
   * Trim a clip from left or right edge, or pass an updated timing object
   */
  trimClip(clipId, edgeOrParams, newTime) {
    const state = store.getState();

    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (!clip) continue;

      const oldStartTime = clip.startTime;
      const oldDuration = clip.duration;
      const oldSourceStart = clip.sourceStartTime || 0;

      if (typeof edgeOrParams === 'object' && edgeOrParams !== null) {
        if (edgeOrParams.startTime !== undefined) clip.startTime = Math.max(0, edgeOrParams.startTime);
        if (edgeOrParams.duration !== undefined) clip.duration = Math.max(0.1, edgeOrParams.duration);
        if (edgeOrParams.sourceStartTime !== undefined) clip.sourceStartTime = Math.max(0, edgeOrParams.sourceStartTime);
      } else if (edgeOrParams === 'left' || edgeOrParams === 'trim-left') {
        const delta = newTime - clip.startTime;
        clip.startTime = Math.max(0, newTime);
        clip.sourceStartTime = Math.max(0, (clip.sourceStartTime || 0) + delta);
        clip.duration = Math.max(0.1, oldDuration - delta);
      } else {
        clip.duration = Math.max(0.1, newTime - clip.startTime);
      }

      store._pushUndo({
        type: 'custom',
        description: `Trim clip: ${clip.name}`,
        undo: () => {
          clip.startTime = oldStartTime;
          clip.duration = oldDuration;
          clip.sourceStartTime = oldSourceStart;
          store._emit('tracks', state.tracks);
        },
        redo: () => {
          Actions.trimClip(clipId, edgeOrParams, newTime);
        }
      });

      store._emit('tracks', state.tracks);
      store.set('project.dirty', true);
      Actions._recalculateDuration();
      return;
    }
  },

  rippleDeleteClip(clipId) {
    const state = store.getState();
    for (const track of state.tracks) {
      const index = track.clips.findIndex(c => c.id === clipId);
      if (index !== -1) {
        const deletedDuration = track.clips[index].duration;
        track.clips.splice(index, 1);
        for (let i = index; i < track.clips.length; i++) {
          track.clips[i].startTime = Math.max(0, track.clips[i].startTime - deletedDuration);
        }
        store._emit('tracks', state.tracks);
        store.set('project.dirty', true);
        Actions._recalculateDuration();
        return;
      }
    }
  },

  slipClip(clipId, deltaSeconds) {
    const clip = this.getClip(clipId);
    if (!clip) return;
    clip.sourceStartTime = Math.max(0, (clip.sourceStartTime || 0) + deltaSeconds);
    store._emit('tracks', store.getState().tracks);
    store.set('project.dirty', true);
  },

  rollEdit(leftClipId, rightClipId, deltaSeconds) {
    const leftClip = this.getClip(leftClipId);
    const rightClip = this.getClip(rightClipId);
    if (!leftClip || !rightClip) return;
    
    const finalDelta = Math.max(-leftClip.duration + 0.1, Math.min(rightClip.duration - 0.1, deltaSeconds));
    
    leftClip.duration += finalDelta;
    rightClip.startTime += finalDelta;
    rightClip.sourceStartTime += finalDelta;
    rightClip.duration -= finalDelta;
    
    store._emit('tracks', store.getState().tracks);
    store.set('project.dirty', true);
  },
  
  slideEdit(clipId, deltaSeconds) {
    const clip = this.getClip(clipId);
    if (!clip) return;
    const track = this.findClipTrack(clipId);
    const index = track.clips.findIndex(c => c.id === clipId);
    
    const leftClip = index > 0 ? track.clips[index - 1] : null;
    const rightClip = index < track.clips.length - 1 ? track.clips[index + 1] : null;
    
    clip.startTime += deltaSeconds;
    
    if (leftClip) leftClip.duration = Math.max(0.1, leftClip.duration + deltaSeconds);
    if (rightClip) {
      rightClip.startTime += deltaSeconds;
      rightClip.sourceStartTime = Math.max(0, rightClip.sourceStartTime + deltaSeconds);
      rightClip.duration = Math.max(0.1, rightClip.duration - deltaSeconds);
    }
    
    store._emit('tracks', store.getState().tracks);
    store.set('project.dirty', true);
  },

  // ═══════════════════════════════════════════
  // Track Operations
  // ═══════════════════════════════════════════

  addTrack(type = 'video', name) {
    const state = store.getState();
    const count = state.tracks.filter(t => t.type === type).length + 1;

    const track = {
      id: MathUtils.generateId(),
      type,
      name: name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${count}`,
      clips: [],
      locked: false,
      visible: true,
      muted: false,
      height: 60,
      color: type === 'video' ? '#6c5ce7' : type === 'audio' ? '#00cec9' : '#fdcb6e'
    };

    state.tracks.push(track);

    store._pushUndo({
      type: 'custom',
      description: `Add ${type} track`,
      undo: () => {
        const idx = state.tracks.findIndex(t => t.id === track.id);
        if (idx !== -1) state.tracks.splice(idx, 1);
        store._emit('tracks', state.tracks);
      },
      redo: () => {
        state.tracks.push(JSON.parse(JSON.stringify(track)));
        store._emit('tracks', state.tracks);
      }
    });

    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
    return track;
  },

  removeTrack(trackId) {
    const state = store.getState();
    if (state.tracks.length <= 1) return; // Keep at least one track

    const index = state.tracks.findIndex(t => t.id === trackId);
    if (index === -1) return;

    const removed = state.tracks.splice(index, 1)[0];

    store._pushUndo({
      type: 'custom',
      description: `Remove track: ${removed.name}`,
      undo: () => {
        state.tracks.splice(index, 0, JSON.parse(JSON.stringify(removed)));
        store._emit('tracks', state.tracks);
      },
      redo: () => {
        const idx = state.tracks.findIndex(t => t.id === removed.id);
        if (idx !== -1) state.tracks.splice(idx, 1);
        store._emit('tracks', state.tracks);
      }
    });

    store._emit('tracks', state.tracks);
    store.set('project.dirty', true);
  },

  toggleTrackMute(trackId) {
    const track = store.getState().tracks.find(t => t.id === trackId);
    if (track) {
      track.muted = !track.muted;
      store._emit('tracks', store.getState().tracks);
    }
  },

  toggleTrackVisibility(trackId) {
    const track = store.getState().tracks.find(t => t.id === trackId);
    if (track) {
      track.visible = !track.visible;
      store._emit('tracks', store.getState().tracks);
    }
  },

  toggleTrackLock(trackId) {
    const track = store.getState().tracks.find(t => t.id === trackId);
    if (track) {
      track.locked = !track.locked;
      store._emit('tracks', store.getState().tracks);
    }
  },

  toggleTrackSolo(trackId) {
    const state = store.getState();
    const track = state.tracks.find(t => t.id === trackId);
    if (track) {
      track.solo = !track.solo;
      store._emit('tracks', state.tracks);
    }
  },

  setTrackHeight(trackId, height) {
    const state = store.getState();
    const track = state.tracks.find(t => t.id === trackId);
    if (track) {
      track.height = Math.max(36, Math.min(200, height));
      store._emit('tracks', state.tracks);
    }
  },

  // ═══════════════════════════════════════════
  // Selection
  // ═══════════════════════════════════════════

  selectClip(clipId, addToSelection = false) {
    const state = store.getState();
    if (addToSelection) {
      const ids = [...state.selection.clipIds];
      const idx = ids.indexOf(clipId);
      if (idx === -1) ids.push(clipId);
      else ids.splice(idx, 1);
      store.set('selection.clipIds', ids);
    } else {
      store.set('selection.clipIds', [clipId]);
    }
  },

  deselectAll() {
    store.set('selection.clipIds', []);
    store.set('selection.trackId', null);
  },

  selectAll() {
    const state = store.getState();
    const allIds = [];
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        allIds.push(clip.id);
      }
    }
    store.set('selection.clipIds', allIds);
  },

  // ═══════════════════════════════════════════
  // Playback
  // ═══════════════════════════════════════════

  setCurrentTime(time) {
    store.set('playback.currentTime', Math.max(0, time));
  },

  togglePlayback() {
    const state = store.getState();
    store.set('playback.playing', !state.playback.playing);
  },

  stopPlayback() {
    store.set('playback.playing', false);
  },

  setPlaybackSpeed(speed) {
    store.set('playback.speed', speed);
  },

  // ═══════════════════════════════════════════
  // Media Library
  // ═══════════════════════════════════════════

  addMedia(mediaInfo) {
    store.push('media', mediaInfo);
    store.set('project.dirty', true);
  },

  removeMedia(mediaId) {
    store.remove('media', m => m.id === mediaId);
    store.set('project.dirty', true);
  },

  // ═══════════════════════════════════════════
  // Markers
  // ═══════════════════════════════════════════

  addMarker(time, label, color = 'default') {
    const marker = {
      id: MathUtils.generateId(),
      time,
      label: label || `Marker ${store.getState().markers.length + 1}`,
      color
    };
    store.push('markers', marker, { undoable: true, description: 'Add marker' });
    return marker;
  },

  removeMarker(markerId) {
    store.remove('markers', m => m.id === markerId, { undoable: true, description: 'Remove marker' });
  },

  // ═══════════════════════════════════════════
  // Timeline View
  // ═══════════════════════════════════════════

  setZoom(zoom) {
    store.set('timeline.zoom', MathUtils.clamp(zoom, 1, 200));
  },

  setTool(tool) {
    store.set('timeline.tool', tool);
  },

  toggleSnap() {
    const state = store.getState();
    store.set('timeline.snapEnabled', !state.timeline.snapEnabled);
  },

  zoomTimeline(factor) {
    const curZoom = store.get('timeline.zoom') || 50;
    const newZoom = MathUtils.clamp(curZoom * factor, 1, 500);
    store.set('timeline.zoom', newZoom);
  },

  fitTimeline() {
    const state = store.getState();
    const duration = state.playback.duration || 10;
    const container = document.getElementById('timelineTracks');
    const width = container ? container.clientWidth - 60 : 800;
    const targetZoom = MathUtils.clamp(width / Math.max(1, duration), 5, 200);
    store.set('timeline.zoom', targetZoom);
    store.set('timeline.scrollX', 0);
  },

  seek(time) {
    const clampedTime = Math.max(0, time);
    store.set('playback.currentTime', clampedTime);
  },

  stepFrame(frames = 1) {
    const fps = store.get('project.settings.fps') || 30;
    const dt = frames / fps;
    const cur = store.get('playback.currentTime');
    this.seek(Math.max(0, cur + dt));
  },

  addEffectToClip(clipId, effect) {
    const clip = this.getClip(clipId);
    if (!clip) return;
    if (!clip.effects) clip.effects = [];
    clip.effects.push(effect);
    store._emit('tracks', store.getState().tracks);
    store.set('project.dirty', true);
  },

  // ═══════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════

  _recalculateDuration() {
    const state = store.getState();
    let maxEnd = 0;

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }

    store.set('playback.duration', maxEnd);
  },

  /**
   * Find which track a clip belongs to
   */
  findClipTrack(clipId) {
    const state = store.getState();
    for (const track of state.tracks) {
      if (track.clips.find(c => c.id === clipId)) {
        return track;
      }
    }
    return null;
  },

  /**
   * Get a clip by ID
   */
  getClip(clipId) {
    const state = store.getState();
    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) return clip;
    }
    return null;
  },

  /**
   * Get clips at a specific time on a specific track
   */
  /**
   * Get clips at a specific time on a specific track
   */
  getClipsAtTime(time, trackId) {
    const state = store.getState();
    const tracks = trackId
      ? [state.tracks.find(t => t.id === trackId)]
      : state.tracks;

    const clips = [];
    for (const track of tracks) {
      if (!track) continue;
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          clips.push({ clip, track });
        }
      }
    }
    return clips;
  },

  // ═══════════════════════════════════════════
  // Freeze Frame
  // ═══════════════════════════════════════════

  /**
   * Insert a freeze frame hold at the current playhead position on the selected clip
   */
  freezeFrame(clipId, duration = 2) {
    const state = store.getState();
    const currentTime = state.playback.currentTime;

    for (const track of state.tracks) {
      if (track.locked) continue;
      const clip = track.clips.find(c => c.id === (clipId || state.selection.clipIds?.[0]));
      if (!clip) continue;

      const clipEnd = clip.startTime + clip.duration;
      if (currentTime <= clip.startTime || currentTime >= clipEnd) continue;

      const freezePoint = currentTime - clip.startTime;
      const originalClip = JSON.parse(JSON.stringify(clip));

      // Create freeze frame clip (image-like still)
      const freezeClip = {
        id: MathUtils.generateId(),
        mediaId: clip.mediaId,
        sourcePath: clip.sourcePath,
        mediaType: 'freeze',
        name: `${clip.name} [Freeze]`,
        startTime: currentTime,
        duration: duration,
        sourceStartTime: (clip.sourceStartTime || 0) + freezePoint,
        sourceDuration: 0, // 0 = still frame
        speed: 0,
        volume: 0,
        opacity: clip.opacity !== undefined ? clip.opacity : 1,
        transform: clip.transform ? JSON.parse(JSON.stringify(clip.transform)) : { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
        effects: clip.effects ? JSON.parse(JSON.stringify(clip.effects)) : [],
        colorLabel: clip.colorLabel || null,
        isFreezeFrame: true
      };

      // Right portion continues after freeze
      const rightClip = {
        ...JSON.parse(JSON.stringify(clip)),
        id: MathUtils.generateId(),
        startTime: currentTime + duration,
        sourceStartTime: (clip.sourceStartTime || 0) + freezePoint,
        duration: clip.duration - freezePoint,
      };

      // Left portion ends at freeze point
      clip.duration = freezePoint;

      const idx = track.clips.findIndex(c => c.id === clip.id);
      track.clips.splice(idx + 1, 0, freezeClip, rightClip);

      store._pushUndo({
        type: 'custom',
        description: `Freeze frame: ${clip.name}`,
        undo: () => {
          const t = store.getState().tracks.find(tr => tr.id === track.id);
          if (!t) return;
          t.clips = t.clips.filter(c => c.id !== freezeClip.id && c.id !== rightClip.id);
          const orig = t.clips.find(c => c.id === originalClip.id);
          if (orig) Object.assign(orig, originalClip);
          store._emit('tracks', store.getState().tracks);
        },
        redo: () => {
          // Re-apply freeze
          Actions.freezeFrame(clipId, duration);
        }
      });

      store._emit('tracks', state.tracks);
      store.set('project.dirty', true);
      Actions._recalculateDuration();
      return freezeClip;
    }
    return null;
  },

  // ═══════════════════════════════════════════
  // Clip Color Labels
  // ═══════════════════════════════════════════

  /**
   * Set a color label on a clip for organizational purposes
   */
  setClipColor(clipId, color) {
    const clip = Actions.getClip(clipId);
    if (!clip) return;

    const oldColor = clip.colorLabel || null;
    clip.colorLabel = color;

    store._pushUndo({
      type: 'custom',
      description: `Set clip color: ${color || 'none'}`,
      undo: () => {
        const c = Actions.getClip(clipId);
        if (c) c.colorLabel = oldColor;
        store._emit('tracks', store.getState().tracks);
      },
      redo: () => {
        const c = Actions.getClip(clipId);
        if (c) c.colorLabel = color;
        store._emit('tracks', store.getState().tracks);
      }
    });

    store._emit('tracks', store.getState().tracks);
    store.set('project.dirty', true);
  },

  // ═══════════════════════════════════════════
  // Fit to Fill (Speed Adjustment)
  // ═══════════════════════════════════════════

  /**
   * Adjust clip speed to fit a target duration
   */
  fitToFill(clipId, targetDuration) {
    const clip = Actions.getClip(clipId);
    if (!clip || !targetDuration || targetDuration <= 0) return;

    const oldSpeed = clip.speed || 1;
    const oldDuration = clip.duration;
    const sourceDuration = clip.sourceDuration || clip.duration;

    // New speed = source duration / target duration
    const newSpeed = (sourceDuration * oldSpeed) / targetDuration;
    clip.speed = Math.max(0.1, Math.min(16, newSpeed));
    clip.duration = targetDuration;

    store._pushUndo({
      type: 'custom',
      description: `Fit to fill: ${clip.name}`,
      undo: () => {
        const c = Actions.getClip(clipId);
        if (c) {
          c.speed = oldSpeed;
          c.duration = oldDuration;
        }
        store._emit('tracks', store.getState().tracks);
      },
      redo: () => {
        const c = Actions.getClip(clipId);
        if (c) {
          c.speed = newSpeed;
          c.duration = targetDuration;
        }
        store._emit('tracks', store.getState().tracks);
      }
    });

    store._emit('tracks', store.getState().tracks);
    store.set('project.dirty', true);
    Actions._recalculateDuration();
  },

  // ═══════════════════════════════════════════
  // Clip Notes / Comments
  // ═══════════════════════════════════════════

  /**
   * Set a production note on a clip
   */
  setClipNote(clipId, note) {
    const clip = Actions.getClip(clipId);
    if (!clip) return;

    const oldNote = clip.notes || '';
    clip.notes = note;

    store._pushUndo({
      type: 'custom',
      description: 'Update clip note',
      undo: () => {
        const c = Actions.getClip(clipId);
        if (c) c.notes = oldNote;
        store._emit('tracks', store.getState().tracks);
      },
      redo: () => {
        const c = Actions.getClip(clipId);
        if (c) c.notes = note;
        store._emit('tracks', store.getState().tracks);
      }
    });

    store._emit('tracks', store.getState().tracks);
    store.set('project.dirty', true);
  },

  // ═══════════════════════════════════════════
  // In/Out Point Marking
  // ═══════════════════════════════════════════

  setInPoint() {
    const time = store.get('playback.currentTime') || 0;
    const outPoint = store.get('playback.outPoint');
    // In point must be before out point
    if (outPoint !== null && time >= outPoint) return;
    store.set('playback.inPoint', time);
  },

  setOutPoint() {
    const time = store.get('playback.currentTime') || 0;
    const inPoint = store.get('playback.inPoint');
    // Out point must be after in point
    if (inPoint !== null && time <= inPoint) return;
    store.set('playback.outPoint', time);
  },

  clearInOutPoints() {
    store.set('playback.inPoint', null);
    store.set('playback.outPoint', null);
  },

  // ═══════════════════════════════════════════
  // Multi-Camera Editing Actions
  // ═══════════════════════════════════════════

  createMultiCamSequence(clipIds, syncMethod = 'audio') {
    const ids = clipIds || store.getState().selection.clipIds;
    return window.multiCamEngine?.createMultiCamSequence(ids, syncMethod);
  },

  toggleMultiCam(enable) {
    return window.multiCamEngine?.toggleMultiCam(enable);
  },

  switchMultiCamAngle(angleIndex) {
    window.multiCamEngine?.switchAngle(angleIndex);
  },

  // ═══════════════════════════════════════════
  // Phase 3 — Speed Ramping, EQ & Auto-Captions Actions
  // ═══════════════════════════════════════════

  setClipSpeedRamp(clipId, presetId = 'none', points = null) {
    const clip = this.getClip(clipId);
    if (!clip) return null;
    const dur = clip.duration || 10;
    const speedPoints = points || window.speedRampEngine?.getPresetPoints(presetId, dur) || [];
    return this.updateClip(clipId, {
      speedPreset: presetId,
      speedPoints: speedPoints
    });
  },

  setClipEqualizer(clipId, eqSettings) {
    return this.updateClip(clipId, {
      eq: {
        enabled: true,
        low: 0,
        lowMid: 0,
        highMid: 0,
        high: 0,
        lowFreq: 100,
        lowMidFreq: 500,
        highMidFreq: 2500,
        highFreq: 10000,
        ...eqSettings
      }
    });
  },

  setClipCompressor(clipId, compSettings) {
    return this.updateClip(clipId, {
      compressor: {
        enabled: true,
        threshold: -24,
        ratio: 8,
        knee: 30,
        attack: 0.003,
        release: 0.25,
        ...compSettings
      }
    });
  },

  async generateAutoCaptions(clipId = null, stylePreset = 'tiktok-yellow') {
    const targetClip = clipId ? this.getClip(clipId) : (store.getState().tracks.flatMap(t => t.clips)[0]);
    if (!targetClip || !window.autoCaptionsEngine) return null;
    window.autoCaptionsEngine.setStylePreset(stylePreset);
    const captions = await window.autoCaptionsEngine.transcribeClip(targetClip);
    const track = window.autoCaptionsEngine.createSubtitlesTrackOnTimeline(captions);
    return { captions, track };
  }
};


window.Actions = Actions;
