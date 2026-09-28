/**
 * StudioCut — State Store
 * Centralized reactive state with undo/redo support
 */

class Store {
  constructor() {
    this._state = this._createDefaultState();
    this._listeners = new Map();
    this._undoStack = [];
    this._redoStack = [];
    this._maxHistorySize = 100;
    this._batchMode = false;
    this._batchChanges = [];
  }

  _createDefaultState() {
    return {
      // Project
      project: {
        name: 'Untitled Project',
        filePath: null,
        dirty: false,
        settings: {
          width: 1920,
          height: 1080,
          resolution: { width: 1920, height: 1080 },
          fps: 30,
          backgroundColor: '#000000',
          audioSampleRate: 44100
        }
      },

      // Media library
      media: [],

      // Timeline tracks
      tracks: [
        {
          id: MathUtils.generateId(),
          type: 'video',
          name: 'Video 1',
          clips: [],
          locked: false,
          visible: true,
          muted: false,
          height: 60,
          color: '#6c5ce7'
        },
        {
          id: MathUtils.generateId(),
          type: 'audio',
          name: 'Audio 1',
          clips: [],
          locked: false,
          visible: true,
          muted: false,
          height: 60,
          color: '#00cec9'
        }
      ],

      // Playback
      playback: {
        currentTime: 0,
        duration: 0,
        playing: false,
        speed: 1,
        loop: false,
        inPoint: null,
        outPoint: null
      },

      // Selection
      selection: {
        clipIds: [],
        trackId: null
      },

      // Timeline view
      timeline: {
        zoom: 50,              // pixels per second
        scrollX: 0,
        scrollY: 0,
        snapEnabled: true,
        tool: 'select',        // 'select', 'razor', 'hand'
        editMode: 'overwrite'  // 'overwrite', 'insert', 'ripple'
      },

      // Markers
      markers: [],

      // Effects on clips
      effects: {},

      // Transitions between clips
      transitions: [],

      // Keyframes
      keyframes: {},

      // Audio mixer state
      audio: {
        masterVolume: 1.0,
        autoDuckingEnabled: false
      },

      // UI state
      ui: {
        activePanel: 'media',
        inspectorTab: 'properties',
        mediaViewMode: 'grid',
        showShortcutsModal: false,
        showExportModal: false,
        exportProgress: null
      }
    };
  }

  /**
   * Get current state (read-only)
   */
  getState() {
    return this._state;
  }

  /**
   * Get a specific state path (dot notation)
   */
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  }

  /**
   * Set state with optional undo history
   */
  set(path, value, { undoable = false, description = '' } = {}) {
    const keys = path.split('.');
    const oldValue = this.get(path);

    // Don't trigger if value hasn't changed
    if (oldValue === value) return;

    if (undoable) {
      this._pushUndo({ type: 'set', path, oldValue, newValue: value, description });
    }

    // Set the value
    let obj = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;

    // Notify listeners
    this._emit(path, value, oldValue);
  }

  /**
   * Update a nested object (merge)
   */
  update(path, changes, { undoable = false, description = '' } = {}) {
    const current = this.get(path);
    if (typeof current !== 'object' || current === null) return;

    const oldState = JSON.parse(JSON.stringify(current));

    Object.assign(current, changes);

    if (undoable) {
      this._pushUndo({
        type: 'update',
        path,
        oldValue: oldState,
        newValue: JSON.parse(JSON.stringify(current)),
        description
      });
    }

    this._emit(path, current, oldState);
  }

  /**
   * Push an item to an array in state
   */
  push(path, item, { undoable = false, description = '' } = {}) {
    const arr = this.get(path);
    if (!Array.isArray(arr)) return;

    arr.push(item);

    if (undoable) {
      this._pushUndo({ type: 'push', path, item: JSON.parse(JSON.stringify(item)), description });
    }

    this._emit(path, arr);
  }

  /**
   * Remove an item from an array by predicate
   */
  remove(path, predicate, { undoable = false, description = '' } = {}) {
    const arr = this.get(path);
    if (!Array.isArray(arr)) return;

    const index = arr.findIndex(predicate);
    if (index === -1) return;

    const removed = arr.splice(index, 1)[0];

    if (undoable) {
      this._pushUndo({
        type: 'remove',
        path,
        item: JSON.parse(JSON.stringify(removed)),
        index,
        description
      });
    }

    this._emit(path, arr);
    return removed;
  }

  /**
   * Subscribe to state changes
   */
  on(path, callback) {
    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Set());
    }
    this._listeners.get(path).add(callback);

    // Return unsubscribe function
    return () => {
      this._listeners.get(path)?.delete(callback);
    };
  }

  /**
   * Alias for on() — for compatibility
   */
  subscribe(path, callback) {
    return this.on(path, callback);
  }

  /**
   * Emit change notifications
   */
  _emit(path, newValue, oldValue) {
    // Exact match listeners
    this._listeners.get(path)?.forEach(cb => cb(newValue, oldValue, path));

    // Wildcard / parent path listeners
    const parts = path.split('.');
    for (let i = parts.length - 1; i >= 0; i--) {
      const parentPath = parts.slice(0, i).join('.');
      if (parentPath) {
        this._listeners.get(parentPath)?.forEach(cb => cb(this.get(parentPath), null, path));
      }
    }

    // Global listeners
    this._listeners.get('*')?.forEach(cb => cb(this._state, null, path));
  }

  // ═══════════════════════════════════════════
  // Undo/Redo
  // ═══════════════════════════════════════════

  _pushUndo(action) {
    this._undoStack.push(action);
    if (this._undoStack.length > this._maxHistorySize) {
      this._undoStack.shift();
    }
    this._redoStack = []; // Clear redo on new action
    this.set('project.dirty', true);
  }

  undo() {
    const action = this._undoStack.pop();
    if (!action) return false;

    this._applyUndoAction(action);
    this._redoStack.push(action);
    this._emit('undo', action);
    return true;
  }

  redo() {
    const action = this._redoStack.pop();
    if (!action) return false;

    this._applyRedoAction(action);
    this._undoStack.push(action);
    this._emit('redo', action);
    return true;
  }

  _applyUndoAction(action) {
    switch (action.type) {
      case 'set':
        this.set(action.path, action.oldValue);
        break;
      case 'update': {
        const keys = action.path.split('.');
        let obj = this._state;
        for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
        obj[keys[keys.length - 1]] = JSON.parse(JSON.stringify(action.oldValue));
        this._emit(action.path, action.oldValue);
        break;
      }
      case 'push': {
        const arr = this.get(action.path);
        arr.pop();
        this._emit(action.path, arr);
        break;
      }
      case 'remove': {
        const arr = this.get(action.path);
        arr.splice(action.index, 0, JSON.parse(JSON.stringify(action.item)));
        this._emit(action.path, arr);
        break;
      }
      case 'batch':
        // Undo batch in reverse order
        for (let i = action.actions.length - 1; i >= 0; i--) {
          this._applyUndoAction(action.actions[i]);
        }
        break;
      case 'custom':
        if (typeof action.undo === 'function') {
          action.undo();
        }
        break;
    }
  }

  _applyRedoAction(action) {
    switch (action.type) {
      case 'set':
        this.set(action.path, action.newValue);
        break;
      case 'update': {
        const keys = action.path.split('.');
        let obj = this._state;
        for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
        obj[keys[keys.length - 1]] = JSON.parse(JSON.stringify(action.newValue));
        this._emit(action.path, action.newValue);
        break;
      }
      case 'push': {
        const arr = this.get(action.path);
        arr.push(JSON.parse(JSON.stringify(action.item)));
        this._emit(action.path, arr);
        break;
      }
      case 'remove': {
        const arr = this.get(action.path);
        arr.splice(action.index, 1);
        this._emit(action.path, arr);
        break;
      }
      case 'batch':
        for (const a of action.actions) {
          this._applyRedoAction(a);
        }
        break;
      case 'custom':
        if (typeof action.redo === 'function') {
          action.redo();
        }
        break;
    }
  }

  canUndo() {
    return this._undoStack.length > 0;
  }

  canRedo() {
    return this._redoStack.length > 0;
  }

  /**
   * Serialize state for project save
   */
  serialize() {
    const state = this._state;
    return {
      version: '1.0.0',
      name: state.project.name,
      settings: state.project.settings,
      media: state.media,
      tracks: state.tracks,
      markers: state.markers,
      effects: state.effects,
      transitions: state.transitions,
      keyframes: state.keyframes
    };
  }

  /**
   * Load state from project data
   */
  deserialize(data) {
    if (!data) return;
    if (data.settings) {
      const s = { ...data.settings };
      if (!s.width && s.resolution) {
        s.width = s.resolution.width;
        s.height = s.resolution.height;
      } else if (!s.resolution && s.width) {
        s.resolution = { width: s.width, height: s.height };
      }
      this.set('project.settings', s);
    }
    if (data.name) this.set('project.name', data.name);
    if (data.media) this.set('media', data.media);
    if (data.tracks) this.set('tracks', data.tracks);
    if (data.markers) this.set('markers', data.markers);
    if (data.effects) this.set('effects', data.effects);
    if (data.transitions) this.set('transitions', data.transitions);
    if (data.keyframes) this.set('keyframes', data.keyframes);
    this.set('project.dirty', false);
    this._undoStack = [];
    this._redoStack = [];
  }

  /**
   * Load project (alias for deserialize)
   */
  loadProject(data) {
    if (data && data.project) {
      data = data.project;
    }
    this.deserialize(data);
  }

  /**
   * Reset to default state
   */
  reset() {
    this._state = this._createDefaultState();
    this._undoStack = [];
    this._redoStack = [];
    this._emit('*', this._state);
  }
}

// Global store instance
window.store = new Store();
