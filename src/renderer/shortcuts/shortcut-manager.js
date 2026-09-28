/**
 * StudioCut — Shortcut Manager
 * Keyboard shortcut handling and customizable bindings
 */

class ShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;
    this._initDefaultShortcuts();
    this._bindEvents();
  }

  _initDefaultShortcuts() {
    // Playback
    this.register('Space', 'Play / Pause', () => {
      const playing = store.get('playback.playing');
      store.set('playback.playing', !playing);
    });

    this.register('ArrowRight', 'Next Frame', (e) => {
      if (e.shiftKey) {
        const t = store.get('playback.currentTime') + 1;
        Actions.seek(t);
      } else {
        Actions.stepFrame(1);
      }
    });

    this.register('ArrowLeft', 'Previous Frame', (e) => {
      if (e.shiftKey) {
        const t = Math.max(0, store.get('playback.currentTime') - 1);
        Actions.seek(t);
      } else {
        Actions.stepFrame(-1);
      }
    });

    this.register('Home', 'Go to Start', () => Actions.seek(0));
    this.register('End', 'Go to End', () => {
      const dur = store.get('playback.duration');
      Actions.seek(dur);
    });

    // Edit operations
    this.register('ctrl+b', 'Split at Playhead', () => Actions.splitAtPlayhead());
    this.register('ctrl+x', 'Cut Selected', () => {
      const count = Actions.cutSelectedClips();
      if (count > 0) window.app?.showToast(`Cut ${count} clip(s)`);
    });
    this.register('ctrl+c', 'Copy Selected', () => {
      const count = Actions.copySelectedClips();
      if (count > 0) window.app?.showToast(`Copied ${count} clip(s)`);
    });
    this.register('ctrl+v', 'Paste', () => {
      const pasted = Actions.pasteClips();
      if (pasted.length > 0) window.app?.showToast(`Pasted ${pasted.length} clip(s)`);
    });
    this.register('ctrl+d', 'Duplicate Selected', () => {
      const dups = Actions.duplicateSelectedClips();
      if (dups.length > 0) window.app?.showToast(`Duplicated ${dups.length} clip(s)`);
    });
    this.register('Delete', 'Delete Selected', () => Actions.removeSelectedClips());
    this.register('Backspace', 'Delete Selected', () => Actions.removeSelectedClips());
    this.register('shift+delete', 'Ripple Delete', () => {
      Actions.rippleDelete();
      window.app?.showToast('Ripple deleted');
    });
    this.register('shift+backspace', 'Ripple Delete', () => {
      Actions.rippleDelete();
      window.app?.showToast('Ripple deleted');
    });

    // 3-Point / 4-Point Insert & Overwrite & Match Frame
    this.register('Comma', 'Insert Edit', () => {
      if (window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.performInsert();
      } else {
        Actions.insertEdit();
      }
    });
    this.register('Period', 'Overwrite Edit', () => {
      if (window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.performOverwrite();
      } else {
        Actions.overwriteEdit();
      }
    });
    this.register('KeyF', 'Match Frame', () => {
      Actions.matchFrame();
    });

    // Multicam Angle Switching (Keys 1-4)
    for (let i = 1; i <= 4; i++) {
      const angleHandler = () => {
        if (window.multiCamEngine?.active || store.getState().tracks.some(t => t.clips.some(c => c.mediaType === 'multicam'))) {
          window.multiCamEngine?.switchAngle(i - 1);
        }
      };
      this.register(`${i}`, `Switch to Camera Angle ${i}`, angleHandler);
      this.register(`digit${i}`, `Switch to Camera Angle ${i}`, angleHandler);
    }

    // Shuttle Playback (J/K/L industry standard)
    this.register('KeyJ', 'Shuttle Reverse', () => {
      const playing = store.get('playback.playing');
      const rate = store.get('playback.playbackRate') || 1;
      if (playing && rate < 0) {
        store.set('playback.playbackRate', Math.max(-4, rate * 2));
      } else if (playing) {
        store.set('playback.playbackRate', -1);
      } else {
        Actions.seek(Math.max(0, store.get('playback.currentTime') - 1));
      }
    });

    this.register('KeyK', 'Pause Playback', () => {
      store.set('playback.playing', false);
      store.set('playback.playbackRate', 1);
    });

    this.register('KeyL', 'Shuttle Forward', () => {
      const playing = store.get('playback.playing');
      const rate = store.get('playback.playbackRate') || 1;
      if (playing && rate > 0) {
        store.set('playback.playbackRate', Math.min(8, rate * 2));
      } else {
        store.set('playback.playbackRate', 1);
        store.set('playback.playing', true);
      }
    });

    // In / Out Points
    this.register('KeyI', 'Mark In Point', () => {
      if ((window._activeMonitor === 'source' || window.sourceMonitor?.viewMode === 'source') && window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.setInPoint();
      } else {
        const time = store.get('playback.currentTime');
        store.set('playback.inPoint', time);
        window.app?.showToast(`Timeline In Point: ${TimeUtils.secondsToTimecode(time)}`);
      }
    });

    this.register('KeyO', 'Mark Out Point', () => {
      if ((window._activeMonitor === 'source' || window.sourceMonitor?.viewMode === 'source') && window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.setOutPoint();
      } else {
        const time = store.get('playback.currentTime');
        store.set('playback.outPoint', time);
        window.app?.showToast(`Timeline Out Point: ${TimeUtils.secondsToTimecode(time)}`);
      }
    });

    this.register('shift+i', 'Go to In Point', () => {
      if ((window._activeMonitor === 'source' || window.sourceMonitor?.viewMode === 'source') && window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.seek(window.sourceMonitor.sourceIn);
      } else {
        const inPt = store.get('playback.inPoint') || 0;
        Actions.seek(inPt);
        window.app?.showToast(`Jumped to In Point: ${TimeUtils.secondsToTimecode(inPt)}`);
      }
    });

    this.register('shift+o', 'Go to Out Point', () => {
      if ((window._activeMonitor === 'source' || window.sourceMonitor?.viewMode === 'source') && window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.seek(window.sourceMonitor.sourceOut);
      } else {
        const outPt = store.get('playback.outPoint');
        const targetTime = outPt !== null && outPt !== undefined ? outPt : store.get('playback.duration');
        Actions.seek(targetTime);
        window.app?.showToast(`Jumped to Out Point: ${TimeUtils.secondsToTimecode(targetTime)}`);
      }
    });

    this.register('alt+x', 'Clear In / Out Points', () => {
      if ((window._activeMonitor === 'source' || window.sourceMonitor?.viewMode === 'source') && window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.clearInOut();
      } else {
        store.set('playback.inPoint', null);
        store.set('playback.outPoint', null);
        window.app?.showToast('Cleared Timeline In/Out Points');
      }
    });

    // Undo / Redo
    this.register('ctrl+z', 'Undo', () => store.undo());
    this.register('ctrl+shift+z', 'Redo', () => store.redo());
    this.register('ctrl+y', 'Redo', () => store.redo());

    // Tools
    this.register('KeyV', 'Selection Tool', () => store.set('timeline.tool', 'select'));
    this.register('KeyC', 'Razor Tool', () => store.set('timeline.tool', 'razor'));
    this.register('KeyH', 'Hand Tool', () => store.set('timeline.tool', 'hand'));

    // Snapping & Markers
    this.register('KeyS', 'Toggle Snapping', (e) => {
      if (e.ctrlKey) return; // Don't intercept ctrl+s
      const current = store.get('timeline.snapEnabled');
      store.set('timeline.snapEnabled', !current);
    });

    this.register('KeyM', 'Add Marker', () => {
      const time = store.get('playback.currentTime');
      Actions.addMarker(time, 'Marker');
    });

    // Zoom
    this.register('ctrl+=', 'Zoom In', () => Actions.zoomTimeline(1.25));
    this.register('ctrl++', 'Zoom In', () => Actions.zoomTimeline(1.25));
    this.register('ctrl+-', 'Zoom Out', () => Actions.zoomTimeline(0.8));
    this.register('ctrl+0', 'Fit All', () => Actions.fitTimeline());

    // Select all
    this.register('ctrl+a', 'Select All Clips', () => {
      const tracks = store.get('tracks') || [];
      const allClipIds = [];
      for (const track of tracks) {
        for (const clip of track.clips) {
          allClipIds.push(clip.id);
        }
      }
      store.set('selection.clipIds', allClipIds);
    });

    // Project & File actions
    this.register('ctrl+s', 'Save Project', () => window.app?.saveProject());
    this.register('ctrl+o', 'Open Project', () => window.app?.openProject());
    this.register('ctrl+n', 'New Project', () => window.app?.newProject());
    this.register('ctrl+i', 'Import Media', () => window.app?.importMedia());
    this.register('ctrl+e', 'Export Video', () => window.app?.openExportModal());

    // View
    this.register('ctrl+f', 'Toggle Fullscreen Preview', () => {
      window.app?.toggleFullscreenPreview();
    });
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;

      // Ignore shortcuts when typing inside form inputs or contenteditable
      const target = e.target;
      const isInput = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.tagName === 'SELECT' ||
                      target.isContentEditable;

      // Exception: Escape should blur inputs
      if (e.key === 'Escape' && isInput) {
        target.blur();
        return;
      }

      if (isInput) return;

      const keyCombo = this._getKeyCombo(e);
      if (this.shortcuts.has(keyCombo)) {
        e.preventDefault();
        e.stopPropagation();
        const item = this.shortcuts.get(keyCombo);
        try {
          item.handler(e);
        } catch (err) {
          console.error(`Error in shortcut [${keyCombo}]:`, err);
        }
      }
    });
  }

  _getKeyCombo(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');

    // Normalize keys
    let key = e.key;
    if (key === ' ') key = 'space';
    else if (key === ',' || e.code === 'Comma') key = 'comma';
    else if (key === '.' || e.code === 'Period') key = 'period';
    else if (e.code && e.code.startsWith('Key') && !e.ctrlKey && !e.altKey) key = e.code;

    // Handle special key names
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      return '';
    }

    parts.push(key.toLowerCase());
    return parts.join('+');
  }

  register(combo, description, handler) {
    let normalized = combo.toLowerCase();
    if (normalized === ',') normalized = 'comma';
    if (normalized === '.') normalized = 'period';
    if (normalized === ' ') normalized = 'space';
    this.shortcuts.set(normalized, { combo, description, handler });
  }

  unregister(combo) {
    this.shortcuts.delete(combo.toLowerCase());
  }

  getShortcutList() {
    const list = [];
    for (const [key, item] of this.shortcuts.entries()) {
      list.push({ combo: item.combo, description: item.description });
    }
    return list;
  }
}

window.shortcutManager = new ShortcutManager();
