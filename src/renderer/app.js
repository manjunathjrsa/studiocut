/**
 * StudioCut — Main Application Controller
 * Bootstraps engines, handles IPC events, window controls, modals, and file workflows
 */

class App {
  constructor() {
    this.version = '1.0.0';
  }

  async init() {
    console.log('🚀 Initializing StudioCut Video Editor...');

    // 1. Initialize core engines
    audioEngine.init();
    timelineEngine.init();
    previewEngine.init();
    mediaBrowser.init();
    inspector.init();

    // Initialize Video Scopes, Graph Editor, and Text-Based Editor
    const scopesContainer = document.getElementById('videoScopesContainer');
    if (scopesContainer && window.videoScopes) {
      window.videoScopes.init(scopesContainer);
    }

    const graphContainer = document.getElementById('graphEditorContainer');
    if (graphContainer && window.keyframeGraphEditor) {
      window.keyframeGraphEditor.init(graphContainer);
    }

    const textEditorContainer = document.getElementById('textEditorContainer');
    if (textEditorContainer && window.textEditorPanel) {
      window.textEditorPanel.init(textEditorContainer);
    }

    this._initProShortcuts();

    // 2. Setup window controls and titlebar
    this._initTitlebar();

    // 2b. Setup Menu Bar
    this._initMenuBar();

    // 3. Setup toolbar
    this._initToolbar();

    // 3b. Setup Preview Drawer, Audio Mixer & Source Monitor
    this._initPreviewDrawer();
    this._initAudioMixer();
    this._initSourceMonitor();

    // 4. Setup IPC menu listener events
    this._initIpcListeners();

    // 5. Setup store subscriptions for project metadata
    this._initStoreWatchers();

    // 6. Setup Layout & Resizers
    this._initLayout();

    // 7. Setup file drag-and-drop & file picker triggers
    this._initFileInput();
    this._initGlobalDragDrop();

    // 6. Dismiss splash screen with smooth fade
    setTimeout(() => {
      const splash = document.getElementById('splashScreen');
      if (splash) {
        splash.style.opacity = '0';
        splash.style.pointerEvents = 'none';
        setTimeout(() => splash.remove(), 400);
      }
    }, 600);

    this.showToast('Welcome to StudioCut!');
  }

  _initTitlebar() {
    const btnMin = document.getElementById('btnMinimize');
    const btnMax = document.getElementById('btnMaximize');
    const btnClose = document.getElementById('btnClose');

    btnMin?.addEventListener('click', () => window.studiocut?.window.minimize());
    btnMax?.addEventListener('click', () => window.studiocut?.window.maximize());
    btnClose?.addEventListener('click', () => window.studiocut?.window.close());
  }

  _initToolbar() {
    document.getElementById('btnNewProject')?.addEventListener('click', () => this.newProject());
    document.getElementById('btnOpenProject')?.addEventListener('click', () => this.openProject());
    document.getElementById('btnSaveProject')?.addEventListener('click', () => this.saveProject());
    document.getElementById('btnImportMedia')?.addEventListener('click', () => this.importMedia());
    document.getElementById('btnUndo')?.addEventListener('click', () => store.undo());
    document.getElementById('btnRedo')?.addEventListener('click', () => store.redo());

    const btnSelect = document.getElementById('btnSelectTool');
    const btnRazor = document.getElementById('btnRazorTool');

    btnSelect?.addEventListener('click', () => {
      store.set('timeline.tool', 'select');
      btnSelect.classList.add('active');
      btnRazor?.classList.remove('active');
    });

    btnRazor?.addEventListener('click', () => {
      store.set('timeline.tool', 'razor');
      btnRazor.classList.add('active');
      btnSelect?.classList.remove('active');
    });

    document.getElementById('btnExport')?.addEventListener('click', () => this.openExportModal());

    // Clear In/Out Points button
    document.getElementById('btnClearIO')?.addEventListener('click', () => {
      Actions.clearInOutPoints();
      this.showToast('In/Out points cleared');
      this._updateInOutDisplay();
    });

    // Edit Mode Indicator click cycles through modes
    document.getElementById('editModeIndicator')?.addEventListener('click', () => {
      const modes = ['overwrite', 'insert', 'ripple'];
      const labels = { overwrite: 'Overwrite', insert: 'Insert', ripple: 'Ripple' };
      const current = store.get('timeline.editMode') || 'overwrite';
      const idx = modes.indexOf(current);
      const next = modes[(idx + 1) % modes.length];
      store.set('timeline.editMode', next);
      this.showToast(`Edit Mode: ${labels[next]}`);
      this._updateEditModeIndicator();
    });

    // View Menu interactions
    const btnViewMenu = document.getElementById('btnViewMenu');
    const viewMenuDropdown = document.getElementById('viewMenuDropdown');
    
    if (btnViewMenu && viewMenuDropdown) {
      btnViewMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = viewMenuDropdown.style.display === 'block';
        viewMenuDropdown.style.display = isVisible ? 'none' : 'block';
      });

      document.addEventListener('click', () => {
        viewMenuDropdown.style.display = 'none';
      });

      document.getElementById('toggleMediaPanel')?.addEventListener('click', (e) => { e.stopPropagation(); this.togglePanel('media'); });
      document.getElementById('togglePreviewPanel')?.addEventListener('click', (e) => { e.stopPropagation(); this.togglePanel('preview'); });
      document.getElementById('toggleInspectorPanel')?.addEventListener('click', (e) => { e.stopPropagation(); this.togglePanel('inspector'); });
      document.getElementById('toggleTimelinePanel')?.addEventListener('click', (e) => { e.stopPropagation(); this.togglePanel('timeline'); });
    }

    document.getElementById('btnResetLayout')?.addEventListener('click', () => {
      this.setLayout('default');
    });

    document.getElementById('btnProjectSettings')?.addEventListener('click', () => {
      this.openProjectSettingsModal();
    });

    document.getElementById('btnHelp')?.addEventListener('click', () => {
      this.openHelpModal();
    });
  }

  _initIpcListeners() {
    if (!window.studiocut?.on) return;

    window.studiocut.on('menu:new-project', () => this.newProject());
    window.studiocut.on('menu:open-project', () => this.openProject());
    window.studiocut.on('menu:save-project', () => this.saveProject());
    window.studiocut.on('menu:import-media', () => this.importMedia());
    window.studiocut.on('menu:export', () => this.openExportModal());
    window.studiocut.on('menu:undo', () => store.undo());
    window.studiocut.on('menu:redo', () => store.redo());
  }

  _initProShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
      }

      // Proxy toggle: 'P' or 'p'
      if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
        window.proxyEngine?.toggleProxyMode();
        this.showToast(`Proxy Mode: ${window.proxyEngine?.proxyEnabled ? 'ACTIVE (540p 60fps)' : 'OFF (Raw Source)'}`);
      }

      // Multi-Cam angle live switching: keys '1', '2', '3', '4'
      if (['1', '2', '3', '4'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (window.multiCamEngine?.active) {
          const angleIdx = parseInt(e.key, 10) - 1;
          window.multiCamEngine.switchAngle(angleIdx);
          this.showToast(`Switched to Camera ${angleIdx + 1}`);
        }
      }

      // In/Out Point Marking
      if (e.key === 'i' || e.key === 'I') {
        if (!e.ctrlKey && !e.metaKey) {
          Actions.setInPoint();
          const t = store.get('playback.inPoint');
          this.showToast(`In Point: ${TimeUtils.secondsToTimecode(t || 0)}`);
          this._updateInOutDisplay();
        }
      }

      if (e.key === 'o' || e.key === 'O') {
        if (!e.ctrlKey && !e.metaKey) {
          Actions.setOutPoint();
          const t = store.get('playback.outPoint');
          this.showToast(`Out Point: ${TimeUtils.secondsToTimecode(t || 0)}`);
          this._updateInOutDisplay();
        }
      }

      // Clear In/Out: Alt+X
      if (e.key === 'x' && e.altKey) {
        Actions.clearInOutPoints();
        this.showToast('In/Out points cleared');
        this._updateInOutDisplay();
      }

      // Edit Mode Cycling: Tab
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const modes = ['overwrite', 'insert', 'ripple'];
        const labels = { overwrite: 'Overwrite', insert: 'Insert', ripple: 'Ripple' };
        const current = store.get('timeline.editMode') || 'overwrite';
        const idx = modes.indexOf(current);
        const next = modes[(idx + 1) % modes.length];
        store.set('timeline.editMode', next);
        this.showToast(`Edit Mode: ${labels[next]}`);
        this._updateEditModeIndicator();
      }
    });
  }

  _updateInOutDisplay() {
    const inEl = document.getElementById('inPointDisplay');
    const outEl = document.getElementById('outPointDisplay');
    const inTime = store.get('playback.inPoint');
    const outTime = store.get('playback.outPoint');

    if (inEl) {
      inEl.textContent = inTime !== null ? `I: ${TimeUtils.secondsToTimecode(inTime)}` : 'I: —';
      inEl.classList.toggle('active', inTime !== null);
    }
    if (outEl) {
      outEl.textContent = outTime !== null ? `O: ${TimeUtils.secondsToTimecode(outTime)}` : 'O: —';
      outEl.classList.toggle('active', outTime !== null);
    }
  }

  _updateEditModeIndicator() {
    const indicator = document.getElementById('editModeIndicator');
    if (!indicator) return;
    const mode = store.get('timeline.editMode') || 'overwrite';
    const icons = { overwrite: '⏏️', insert: '⤵️', ripple: '⚡' };
    const labels = { overwrite: 'OVR', insert: 'INS', ripple: 'RPL' };
    indicator.textContent = `${icons[mode]} ${labels[mode]}`;
    indicator.dataset.mode = mode;
  }

  _initStoreWatchers() {
    const projectNameEl = document.getElementById('projectName');
    const dirtyEl = document.getElementById('unsavedIndicator');

    store.on('project.name', (name) => {
      if (projectNameEl) projectNameEl.textContent = name || 'Untitled Project';
    });

    store.on('project.dirty', (isDirty) => {
      if (dirtyEl) dirtyEl.style.display = isDirty ? 'inline-block' : 'none';
    });
  }

  // ═══════════════════════════════════════════
  // Project Actions
  // ═══════════════════════════════════════════

  async newProject() {
    if (store.get('project.dirty')) {
      const confirmNew = confirm('You have unsaved changes. Start a new project anyway?');
      if (!confirmNew) return;
    }

    store.reset();
    this.showToast('New project created');
  }

  async openProject() {
    try {
      if (!window.studiocut?.dialog) {
        this.showToast('Desktop bridge not available', 'error');
        return;
      }

      const filePath = await window.studiocut.dialog.openProject();
      if (!filePath) return;

      const projectData = await window.studiocut.project.load(filePath);
      if (projectData) {
        const data = typeof projectData === 'string' ? JSON.parse(projectData) : projectData;
        store.loadProject(data);
        store.set('project.filePath', filePath);
        this.showToast(`Opened project: ${data.name || 'Untitled'}`);
      }
    } catch (err) {
      console.error('Failed to open project:', err);
      this.showToast(`Error opening project: ${err.message}`, 'error');
    }
  }

  async saveProject() {
    try {
      let filePath = store.get('project.filePath');

      if (!filePath && window.studiocut?.dialog) {
        const defaultName = `${store.get('project.name') || 'Untitled'}.studiocut`;
        filePath = await window.studiocut.dialog.saveProject(defaultName);
      }

      if (!filePath) return;

      const projectData = store.serialize();
      if (window.studiocut?.project) {
        await window.studiocut.project.save(projectData, filePath);
        store.set('project.filePath', filePath);
        store.set('project.dirty', false);
        this.showToast('Project saved successfully');
      } else {
        // Fallback browser download
        const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'project.studiocut';
        a.click();
        store.set('project.dirty', false);
        this.showToast('Project file downloaded');
      }
    } catch (err) {
      console.error('Save failed:', err);
      this.showToast(`Failed to save project: ${err.message}`, 'error');
    }
  }

  // ═══════════════════════════════════════════
  // Media Import & Management
  // ═══════════════════════════════════════════

  async importMedia() {
    // 1. Desktop native dialog
    if (window.studiocut?.dialog?.openMedia) {
      try {
        const filePaths = await window.studiocut.dialog.openMedia();
        if (filePaths && filePaths.length > 0) {
          await this.importFiles(filePaths);
          return;
        } else if (filePaths) {
          return; // Canceled by user
        }
      } catch (err) {
        console.warn('[Import] Desktop dialog failed, using input fallback:', err);
      }
    }

    // 2. Hidden input fallback
    const fileInput = document.getElementById('mediaFileInput');
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
      return;
    }

    // 3. Dynamic input fallback
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,audio/*,image/*';
    input.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this._handleBrowserFiles(Array.from(e.target.files));
      }
    };
    input.click();
  }

  /**
   * Generates a visual thumbnail frame (JPEG data URL) for a video file
   */
  async generateVideoThumbnail(filePathOrUrl) {
    if (!filePathOrUrl) return null;

    const toMediaUrl = (p) => {
      if (!p) return '';
      if (p.startsWith('blob:') || p.startsWith('data:') || p.startsWith('http://') || p.startsWith('https://')) {
        return p;
      }
      const clean = p.replace(/\\/g, '/');
      return clean.startsWith('/') ? `file://${clean}` : `file:///${clean}`;
    };

    const mediaUrl = toMediaUrl(filePathOrUrl);

    // 1. Try DOM video frame extraction
    const domThumb = await new Promise((resolve) => {
      try {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.crossOrigin = 'anonymous';

        let finished = false;
        const done = (result) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeoutId);
          video.onloadeddata = null;
          video.onseeked = null;
          video.onerror = null;
          video.pause();
          video.removeAttribute('src');
          video.load();
          resolve(result);
        };

        const timeoutId = setTimeout(() => done(null), 3500);

        video.onloadeddata = () => {
          const duration = video.duration || 5;
          const seekTime = Math.min(1.0, duration * 0.1);
          video.currentTime = seekTime;
        };

        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 360;
            const aspect = (vw > 0 && vh > 0) ? (vw / vh) : (16 / 9);
            canvas.width = 320;
            canvas.height = Math.round(320 / aspect);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            done(dataUrl);
          } catch (err) {
            console.warn('[Thumbnail] Canvas extraction warning:', err);
            done(null);
          }
        };

        video.onerror = () => done(null);
        video.src = mediaUrl;
      } catch (e) {
        console.warn('[Thumbnail] DOM video init error:', e);
        resolve(null);
      }
    });

    if (domThumb) return domThumb;

    // 2. Fallback: FFmpeg thumbnail if in Electron desktop
    if (window.studiocut?.ffmpeg?.generateThumbnails && !filePathOrUrl.startsWith('blob:') && !filePathOrUrl.startsWith('data:')) {
      try {
        const thumbs = await window.studiocut.ffmpeg.generateThumbnails(filePathOrUrl, 1);
        if (thumbs && thumbs.length > 0 && thumbs[0].path) {
          return toMediaUrl(thumbs[0].path);
        }
      } catch (err) {
        console.warn('[Thumbnail] FFmpeg thumbnail error:', err);
      }
    }

    return null;
  }

  async importFiles(filePaths) {
    if (!filePaths || filePaths.length === 0) return;

    this.showToast(`Importing ${filePaths.length} file(s)...`);

    for (const filePath of filePaths) {
      if (!filePath || typeof filePath !== 'string') continue;

      try {
        let meta = null;
        if (window.studiocut?.ffmpeg?.probe) {
          try {
            meta = await window.studiocut.ffmpeg.probe(filePath);
          } catch (e) {
            console.warn('[FFprobe] Probe warning:', e);
          }
        }

        const fileName = filePath.split(/[\\/]/).pop() || 'Media';
        const ext = fileName.split('.').pop().toLowerCase();

        let type = 'video';
        if (['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac'].includes(ext) || meta?.mediaType === 'audio') type = 'audio';
        else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext) || meta?.mediaType === 'image') type = 'image';

        const duration = (meta?.duration && meta.duration > 0) ? meta.duration : (type === 'image' ? 5 : 10);
        const width = meta?.video?.width || meta?.width || 1920;
        const height = meta?.video?.height || meta?.height || 1080;
        const fps = meta?.video?.fps || meta?.fps || 30;

        let thumbnail = null;
        if (type === 'image') {
          const clean = filePath.replace(/\\/g, '/');
          thumbnail = clean.startsWith('/') ? `file://${clean}` : `file:///${clean}`;
        } else if (type === 'video') {
          thumbnail = await this.generateVideoThumbnail(filePath);
        }

        const mediaItem = {
          id: MathUtils.generateId(),
          name: fileName,
          path: filePath,
          type,
          duration,
          width,
          height,
          fps,
          thumbnail,
          size: meta?.fileSize || meta?.size || 0,
          codec: meta?.video?.codec || meta?.codec || ext.toUpperCase(),
          importedAt: new Date().toISOString()
        };

        Actions.addMedia(mediaItem);
      } catch (err) {
        console.warn(`[Import] Failed to probe ${filePath}:`, err);
        const fileName = filePath.split(/[\\/]/).pop() || 'Media';
        const ext = fileName.split('.').pop().toLowerCase();
        let type = 'video';
        if (['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac'].includes(ext)) type = 'audio';
        else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) type = 'image';

        let thumbnail = null;
        if (type === 'image') {
          const clean = filePath.replace(/\\/g, '/');
          thumbnail = clean.startsWith('/') ? `file://${clean}` : `file:///${clean}`;
        } else if (type === 'video') {
          thumbnail = await this.generateVideoThumbnail(filePath);
        }

        Actions.addMedia({
          id: MathUtils.generateId(),
          name: fileName,
          path: filePath,
          type,
          duration: type === 'image' ? 5 : 10,
          width: 1920,
          height: 1080,
          fps: 30,
          thumbnail,
          size: 0,
          codec: ext.toUpperCase(),
          importedAt: new Date().toISOString()
        });
      }
    }

    this.showToast(`Imported ${filePaths.length} file(s)`);
  }

  async _handleBrowserFiles(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      const url = URL.createObjectURL(file);
      let type = 'video';
      if (file.type && file.type.startsWith('audio/')) type = 'audio';
      else if (file.type && file.type.startsWith('image/')) type = 'image';
      else {
        const ext = file.name.split('.').pop().toLowerCase();
        if (['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac'].includes(ext)) type = 'audio';
        else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) type = 'image';
      }

      let thumbnail = null;
      if (type === 'image') {
        thumbnail = url;
      } else if (type === 'video') {
        thumbnail = await this.generateVideoThumbnail(url);
      }

      const mediaItem = {
        id: MathUtils.generateId(),
        name: file.name,
        path: url,
        type,
        duration: type === 'image' ? 5 : 10,
        size: file.size || 0,
        width: 1920,
        height: 1080,
        fps: 30,
        thumbnail,
        importedAt: new Date().toISOString()
      };

      Actions.addMedia(mediaItem);
    }
    this.showToast(`Imported ${files.length} file(s)`);
  }

  /**
   * Add high-quality sample media for instant testing without local files
   */
  addSampleMedia() {
    // 1. Sample Landscape (Canvas gradient with sun & mountains)
    const canvasImg = document.createElement('canvas');
    canvasImg.width = 1920;
    canvasImg.height = 1080;
    const ctxI = canvasImg.getContext('2d');
    const grad = ctxI.createLinearGradient(0, 0, 1920, 1080);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(0.5, '#203a43');
    grad.addColorStop(1, '#2c5364');
    ctxI.fillStyle = grad;
    ctxI.fillRect(0, 0, 1920, 1080);
    // Glowing Sun
    ctxI.beginPath();
    ctxI.arc(960, 480, 160, 0, Math.PI * 2);
    ctxI.fillStyle = '#ff9900';
    ctxI.shadowColor = '#ff5500';
    ctxI.shadowBlur = 60;
    ctxI.fill();
    ctxI.shadowBlur = 0;
    // Mountains
    ctxI.fillStyle = '#0a151b';
    ctxI.beginPath();
    ctxI.moveTo(0, 1080);
    ctxI.lineTo(420, 580);
    ctxI.lineTo(840, 1080);
    ctxI.lineTo(1240, 520);
    ctxI.lineTo(1640, 960);
    ctxI.lineTo(1920, 680);
    ctxI.lineTo(1920, 1080);
    ctxI.closePath();
    ctxI.fill();
    const sampleImgUrl = canvasImg.toDataURL('image/png');

    // 2. Sample Green Screen (Chroma Key demo asset)
    const canvasChroma = document.createElement('canvas');
    canvasChroma.width = 1280;
    canvasChroma.height = 720;
    const ctxC = canvasChroma.getContext('2d');
    ctxC.fillStyle = '#00ff00'; // Pure Chroma Green
    ctxC.fillRect(0, 0, 1280, 720);
    ctxC.fillStyle = '#ffffff';
    ctxC.font = 'bold 52px Inter, sans-serif';
    ctxC.textAlign = 'center';
    ctxC.fillText('🎬 CHROMA KEY DEMO', 640, 320);
    ctxC.font = '28px Inter, sans-serif';
    ctxC.fillStyle = '#f1c40f';
    ctxC.fillText('(Green Screen Ready for 1-Click Keying)', 640, 380);
    const sampleChromaUrl = canvasChroma.toDataURL('image/png');

    // 3. Sample Synth Groove Audio (PCM WAV generator)
    const sampleAudioWav = this._generateSampleAudioWav();

    const sampleItems = [
      {
        id: MathUtils.generateId(),
        name: 'Cinematic Landscape.png',
        path: sampleImgUrl,
        thumbnail: sampleImgUrl,
        type: 'image',
        duration: 8,
        width: 1920,
        height: 1080,
        fps: 30,
        size: 154000,
        importedAt: new Date().toISOString()
      },
      {
        id: MathUtils.generateId(),
        name: 'Green Screen Demo.png',
        path: sampleChromaUrl,
        thumbnail: sampleChromaUrl,
        type: 'image',
        duration: 6,
        width: 1280,
        height: 720,
        fps: 30,
        size: 98000,
        importedAt: new Date().toISOString()
      },
      {
        id: MathUtils.generateId(),
        name: 'Cyberpunk Synth Groove.wav',
        path: sampleAudioWav,
        type: 'audio',
        duration: 10,
        width: 0,
        height: 0,
        fps: 0,
        size: 882000,
        importedAt: new Date().toISOString()
      }
    ];

    for (const item of sampleItems) {
      Actions.addMedia(item);
    }

    this.showToast('Added 3 sample media clips! Drag to timeline or click + to add.');
  }

  _generateSampleAudioWav() {
    const sampleRate = 22050;
    const duration = 8;
    const numSamples = sampleRate * duration;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const freq1 = 220;
      const freq2 = (t % 4 < 2) ? 261.63 : 293.66;
      const freq3 = (t % 2 < 1) ? 329.63 : 392.00;
      const tremolo = 0.8 + 0.2 * Math.sin(2 * Math.PI * 6 * t);
      const val = (Math.sin(2 * Math.PI * freq1 * t) * 0.4 +
                   Math.sin(2 * Math.PI * freq2 * t) * 0.3 +
                   Math.sin(2 * Math.PI * freq3 * t) * 0.3) * tremolo * 0.4;
      const sample = Math.max(-1, Math.min(1, val)) * 0x7FFF;
      view.setInt16(44 + i * 2, sample, true);
    }

    // Convert buffer to base64 Data URL for universal instant playback without blob fetch issues
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return 'data:audio/wav;base64,' + btoa(binary);
  }

  // ═══════════════════════════════════════════
  // Workspace Layout & Panel Resizers
  // ═══════════════════════════════════════════

  _initGlobalDragDrop() {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        if (!e.target.closest('#timelineTracks') && !e.target.closest('#mediaBrowser')) {
          const fileList = Array.from(e.dataTransfer.files);
          const filePaths = fileList.map(f => {
            if (window.studiocut?.file?.getPathForFile) {
              try { return window.studiocut.file.getPathForFile(f); } catch (e) {}
            }
            return f.path || '';
          }).filter(Boolean);

          if (filePaths.length > 0) {
            this.importFiles(filePaths);
          } else {
            this._handleBrowserFiles(fileList);
          }
        }
      }
    });
  }

  _initFileInput() {
    const fileInput = document.getElementById('mediaFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const fileList = Array.from(e.target.files);
          const filePaths = fileList.map(f => {
            if (window.studiocut?.file?.getPathForFile) {
              try { return window.studiocut.file.getPathForFile(f); } catch (err) {}
            }
            return f.path || '';
          }).filter(Boolean);

          if (filePaths.length > 0) {
            this.importFiles(filePaths);
          } else {
            this._handleBrowserFiles(fileList);
          }
        }
      });
    }

    document.getElementById('btnAddSampleMedia')?.addEventListener('click', () => {
      this.addSampleMedia();
    });

    document.getElementById('btnBrowseMedia')?.addEventListener('click', () => {
      this.importMedia();
    });
  }

  _initLayout() {
    const layoutBtns = document.querySelectorAll('.layout-preset-btn');
    layoutBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        layoutBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setLayout(btn.dataset.layout);
      });
    });

    // Set the initial layout
    this.setLayout('default');

    // Wire collapse and expand panel buttons
    document.getElementById('btnCollapseMedia')?.addEventListener('click', () => this.togglePanel('media'));
    document.getElementById('btnCollapseInspector')?.addEventListener('click', () => this.togglePanel('inspector'));
    document.getElementById('btnExpandMedia')?.addEventListener('click', () => this.togglePanel('media'));
    document.getElementById('btnExpandInspector')?.addEventListener('click', () => this.togglePanel('inspector'));

    this._initPanelResizers();
  }

  togglePanel(name) {
    const ws = document.getElementById('workspace');
    if (!ws) return;
    const cols = (ws.style.gridTemplateColumns || '340px 4px 1fr 4px 340px').split(' ');
    const rows = (ws.style.gridTemplateRows || '1fr 4px 280px').split(' ');

    let panelId, resizerId, colIdx, rowIdx, menuItemId, dropdownItemId;
    if (name === 'media') {
      panelId = 'mediaPanel'; resizerId = 'resizerLeft'; colIdx = 0; menuItemId = 'menuToggleMedia'; dropdownItemId = 'toggleMediaPanel';
    } else if (name === 'preview') {
      panelId = 'previewPanel'; resizerId = null; colIdx = 2; menuItemId = 'menuTogglePreview'; dropdownItemId = 'togglePreviewPanel';
    } else if (name === 'inspector') {
      panelId = 'inspectorPanel'; resizerId = 'resizerRight'; colIdx = 4; menuItemId = 'menuToggleInspector'; dropdownItemId = 'toggleInspectorPanel';
    } else if (name === 'timeline') {
      panelId = 'timelinePanel'; resizerId = 'resizerBottom'; rowIdx = 2; menuItemId = 'menuToggleTimeline'; dropdownItemId = 'toggleTimelinePanel';
    } else {
      return;
    }

    const panel = document.getElementById(panelId);
    const resizer = resizerId ? document.getElementById(resizerId) : null;
    const menuItem = menuItemId ? document.getElementById(menuItemId) : null;
    const dropdownItem = dropdownItemId ? document.getElementById(dropdownItemId) : null;
    if (!panel) return;

    const isHidden = panel.style.display === 'none';
    if (!isHidden) {
      // Hiding
      panel.style.display = 'none';
      if (resizer) resizer.style.display = 'none';
      if (menuItem) menuItem.innerHTML = menuItem.innerHTML.replace('✓ ', '');
      if (dropdownItem) dropdownItem.textContent = dropdownItem.textContent.replace('✓ ', '');

      if (colIdx !== undefined) {
        panel.dataset.prevWidth = cols[colIdx] !== '0px' ? cols[colIdx] : '340px';
        cols[colIdx] = '0px';
        if (resizerId === 'resizerLeft') cols[colIdx + 1] = '0px';
        if (resizerId === 'resizerRight') cols[colIdx - 1] = '0px';
        ws.style.gridTemplateColumns = cols.join(' ');
      } else if (rowIdx !== undefined) {
        panel.dataset.prevHeight = rows[rowIdx] !== '0px' ? rows[rowIdx] : '280px';
        rows[rowIdx] = '0px';
        if (resizerId === 'resizerBottom') rows[rowIdx - 1] = '0px';
        ws.style.gridTemplateRows = rows.join(' ');
      }
      if (name === 'media') {
        const tab = document.getElementById('btnExpandMedia');
        if (tab) tab.style.display = 'flex';
      } else if (name === 'inspector') {
        const tab = document.getElementById('btnExpandInspector');
        if (tab) tab.style.display = 'flex';
      }
      this.showToast(`Collapsed: ${name.toUpperCase()}`);
    } else {
      // Showing
      panel.style.display = '';
      if (resizer) resizer.style.display = '';
      if (menuItem && !menuItem.innerHTML.includes('✓')) menuItem.innerHTML = '<span>✓ ' + menuItem.innerText.trim() + '</span>';
      if (dropdownItem && !dropdownItem.textContent.includes('✓')) dropdownItem.textContent = '✓ ' + dropdownItem.textContent.trim();

      if (colIdx !== undefined) {
        cols[colIdx] = panel.dataset.prevWidth || (colIdx === 0 ? '340px' : '340px');
        if (resizerId === 'resizerLeft') cols[colIdx + 1] = '4px';
        if (resizerId === 'resizerRight') cols[colIdx - 1] = '4px';
        ws.style.gridTemplateColumns = cols.join(' ');
      } else if (rowIdx !== undefined) {
        rows[rowIdx] = panel.dataset.prevHeight || '280px';
        if (resizerId === 'resizerBottom') rows[rowIdx - 1] = '4px';
        ws.style.gridTemplateRows = rows.join(' ');
      }
      if (name === 'media') {
        const tab = document.getElementById('btnExpandMedia');
        if (tab) tab.style.display = 'none';
      } else if (name === 'inspector') {
        const tab = document.getElementById('btnExpandInspector');
        if (tab) tab.style.display = 'none';
      }
      this.showToast(`Expanded: ${name.toUpperCase()}`);
    }

    window.timelineEngine?.requestRender();
    window.previewEngine?._handleResize();
  }

  setLayout(layout = 'default') {
    const ws = document.getElementById('workspace');
    if (!ws) return;

    if (layout === 'edit') {
      ws.style.gridTemplateColumns = '220px 4px 1fr 4px 380px';
      ws.style.gridTemplateRows = '1fr 4px 260px';
    } else if (layout === 'media') {
      ws.style.gridTemplateColumns = '480px 4px 1fr 4px 240px';
      ws.style.gridTemplateRows = '1fr 4px 240px';
    } else if (layout === 'color') {
      ws.style.gridTemplateColumns = '180px 4px 1fr 4px 450px';
      ws.style.gridTemplateRows = '1fr 4px 230px';
    } else if (layout === 'audio') {
      ws.style.gridTemplateColumns = '240px 4px 1fr 4px 320px';
      ws.style.gridTemplateRows = '1fr 4px 380px';
    } else {
      // Default (Perfectly centered UI)
      ws.style.gridTemplateColumns = '340px 4px 1fr 4px 340px';
      ws.style.gridTemplateRows = '1fr 4px 280px';
    }

    window.timelineEngine?.requestRender();
    window.previewEngine?._handleResize();
    this.showToast(`Layout: ${layout.toUpperCase()}`);
  }

  _initPanelResizers() {
    const resizerLeft = document.getElementById('resizerLeft');
    const resizerRight = document.getElementById('resizerRight');
    const resizerBottom = document.getElementById('resizerBottom');
    const ws = document.getElementById('workspace');
    if (!ws) return;

    if (resizerLeft) {
      let isDragging = false;
      resizerLeft.addEventListener('mousedown', () => {
        isDragging = true;
        resizerLeft.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = ws.getBoundingClientRect();
        const cols = ws.style.gridTemplateColumns.split(' ');
        const rightCol = parseInt(cols[4]) || 340;
        const maxLeft = Math.max(160, rect.width - rightCol - 380);
        const newLeft = Math.max(160, Math.min(Math.min(600, maxLeft), e.clientX - rect.left));
        ws.style.gridTemplateColumns = `${newLeft}px 4px 1fr 4px ${cols[4] || '340px'}`;
        window.timelineEngine?.requestRender();
        window.previewEngine?._handleResize();
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          resizerLeft.classList.remove('dragging');
          document.body.style.cursor = 'default';
        }
      });
    }

    if (resizerRight) {
      let isDragging = false;
      resizerRight.addEventListener('mousedown', () => {
        isDragging = true;
        resizerRight.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = ws.getBoundingClientRect();
        const cols = ws.style.gridTemplateColumns.split(' ');
        const leftCol = parseInt(cols[0]) || 280;
        const maxRight = Math.max(200, rect.width - leftCol - 380);
        const newRight = Math.max(200, Math.min(Math.min(650, maxRight), rect.right - e.clientX));
        ws.style.gridTemplateColumns = `${cols[0] || '280px'} 4px 1fr 4px ${newRight}px`;
        window.timelineEngine?.requestRender();
        window.previewEngine?._handleResize();
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          resizerRight.classList.remove('dragging');
          document.body.style.cursor = 'default';
        }
      });
    }

    if (resizerBottom) {
      let isDragging = false;
      resizerBottom.addEventListener('mousedown', () => {
        isDragging = true;
        resizerBottom.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = ws.getBoundingClientRect();
        const newTimelineH = Math.max(160, Math.min(550, rect.bottom - e.clientY));
        ws.style.gridTemplateRows = `1fr 4px ${newTimelineH}px`;
        window.timelineEngine?.requestRender();
        window.previewEngine?._handleResize();
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          resizerBottom.classList.remove('dragging');
          document.body.style.cursor = 'default';
        }
      });
    }
  }

  // ═══════════════════════════════════════════
  // Project Settings Modal
  // ═══════════════════════════════════════════

  openProjectSettingsModal() {
    const existing = document.getElementById('settingsModal');
    if (existing) existing.remove();

    const currentW = store.get('project.settings.width') || 1920;
    const currentH = store.get('project.settings.height') || 1080;
    const currentFps = store.get('project.settings.fps') || 30;
    const projectName = store.get('project.name') || 'Untitled Project';

    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:480px;">
        <div class="modal__header">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <h2 class="modal__title">Project & Sequence Settings</h2>
          </div>
          <button class="modal__close" id="btnCloseSettingsModal" title="Close">✕</button>
        </div>

        <div class="modal__body" style="display:flex; flex-direction:column; gap:16px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Project Name</label>
            <input type="text" id="settingsProjectName" value="${projectName}" class="input" style="width:100%;">
          </div>

          <div>
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Aspect Ratio & Resolution Preset</label>
            <select id="settingsPreset" class="select" style="width:100%;">
              <option value="1920x1080" ${currentW === 1920 && currentH === 1080 ? 'selected' : ''}>16:9 Full HD (1920 × 1080) — YouTube / Video</option>
              <option value="3840x2160" ${currentW === 3840 && currentH === 2160 ? 'selected' : ''}>16:9 4K Ultra HD (3840 × 2160)</option>
              <option value="1080x1920" ${currentW === 1080 && currentH === 1920 ? 'selected' : ''}>9:16 Vertical (1080 × 1920) — TikTok / Reels / Shorts</option>
              <option value="1080x1080" ${currentW === 1080 && currentH === 1080 ? 'selected' : ''}>1:1 Square (1080 × 1080) — Instagram Post</option>
              <option value="2560x1080" ${currentW === 2560 && currentH === 1080 ? 'selected' : ''}>21:9 Ultrawide Cinema (2560 × 1080)</option>
              <option value="custom">Custom Resolution</option>
            </select>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Width (px)</label>
              <input type="number" id="settingsWidth" value="${currentW}" min="320" max="7680" class="input" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Height (px)</label>
              <input type="number" id="settingsHeight" value="${currentH}" min="240" max="4320" class="input" style="width:100%;">
            </div>
          </div>
          
          <div>
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Frame Rate (FPS)</label>
            <select id="settingsFps" class="select" style="width:100%;">
              <option value="24" ${currentFps === 24 ? 'selected' : ''}>24 FPS (Cinematic standard)</option>
              <option value="30" ${currentFps === 30 ? 'selected' : ''}>30 FPS (Standard broadcast)</option>
              <option value="60" ${currentFps === 60 ? 'selected' : ''}>60 FPS (Ultra smooth / gaming)</option>
            </select>
          </div>
        </div>

        <div class="modal__footer">
          <button class="btn btn--secondary" id="btnCancelSettings">Cancel</button>
          <button class="btn btn--primary" id="btnSaveSettings">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const presetSelect = document.getElementById('settingsPreset');
    const widthInput = document.getElementById('settingsWidth');
    const heightInput = document.getElementById('settingsHeight');

    presetSelect.addEventListener('change', (e) => {
      if (e.target.value !== 'custom') {
        const [w, h] = e.target.value.split('x').map(Number);
        widthInput.value = w;
        heightInput.value = h;
      }
    });

    const closeModal = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('btnCloseSettingsModal').onclick = closeModal;
    document.getElementById('btnCancelSettings').onclick = closeModal;

    document.getElementById('btnSaveSettings').onclick = () => {
      const name = document.getElementById('settingsProjectName').value.trim() || 'Untitled Project';
      const w = parseInt(widthInput.value) || 1920;
      const h = parseInt(heightInput.value) || 1080;
      const fps = parseInt(document.getElementById('settingsFps').value) || 30;

      let ratio = '16:9';
      const val = w / h;
      if (Math.abs(val - 9 / 16) < 0.05) ratio = '9:16';
      else if (Math.abs(val - 1) < 0.05) ratio = '1:1';
      else if (Math.abs(val - 4 / 3) < 0.05) ratio = '4:3';
      else if (Math.abs(val - 21 / 9) < 0.05) ratio = '21:9';
      else if (Math.abs(val - 16 / 9) < 0.05) ratio = '16:9';

      store.set('project.name', name);
      store.set('project.aspectRatio', ratio);
      store.set('project.settings.width', w);
      store.set('project.settings.height', h);
      store.set('project.settings.resolution', { width: w, height: h });
      store.set('project.settings.fps', fps);

      const ratioDropdown = document.getElementById('previewAspectRatio');
      if (ratioDropdown) ratioDropdown.value = ratio;

      window.previewEngine?._handleResize();
      window.previewEngine?.updatePreview();
      closeModal();
      this.showToast(`Sequence updated: ${w}×${h} (${fps}fps)`);
    };
  }

  // ═══════════════════════════════════════════
  // Help & FAQ Modal
  // ═══════════════════════════════════════════

  openHelpModal() {
    const existing = document.getElementById('helpModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'helpModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:580px;">
        <div class="modal__header">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <h2 class="modal__title">Help & Frequently Asked Questions</h2>
          </div>
          <button class="modal__close" id="btnCloseHelpModal" title="Close">✕</button>
        </div>

        <div class="modal__body" style="display:flex; flex-direction:column; gap:16px; max-height:460px; overflow-y:auto; padding-right:6px;">
          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:8px; padding:12px 14px;">
            <h3 style="color:var(--accent-primary); font-size:13px; font-weight:600; margin-bottom:4px;">📥 How do I import video, audio, or images?</h3>
            <p style="color:var(--text-secondary); font-size:12px; line-height:1.5;">Click the <strong>Import</strong> button in the top toolbar, click <strong>Browse Files</strong> in the Media Browser, or drag files directly from Windows Explorer into the Media Browser.</p>
          </div>

          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:8px; padding:12px 14px;">
            <h3 style="color:var(--accent-primary); font-size:13px; font-weight:600; margin-bottom:4px;">🟢 How do I use Chroma Key (Green Screen)?</h3>
            <p style="color:var(--text-secondary); font-size:12px; line-height:1.5;">Select any video or image clip on the timeline, open the <strong>Inspector</strong> panel on the right, switch to the <strong>Video</strong> tab, and toggle <strong>Chroma Key</strong>. You can adjust the key color, similarity, and smoothness in real-time.</p>
          </div>

          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:8px; padding:12px 14px;">
            <h3 style="color:var(--accent-primary); font-size:13px; font-weight:600; margin-bottom:6px;">⌨️ Keyboard Shortcuts Reference</h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:11px; color:var(--text-secondary);">
              <div><kbd style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); color:var(--text-primary); font-family:var(--font-mono);">Space</kbd> Play / Pause</div>
              <div><kbd style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); color:var(--text-primary); font-family:var(--font-mono);">V</kbd> Selection Tool</div>
              <div><kbd style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); color:var(--text-primary); font-family:var(--font-mono);">C</kbd> Razor / Cut Tool</div>
              <div><kbd style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); color:var(--text-primary); font-family:var(--font-mono);">Ctrl+B</kbd> Split at Playhead</div>
              <div><kbd style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); color:var(--text-primary); font-family:var(--font-mono);">Delete</kbd> Delete Selected</div>
              <div><kbd style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); color:var(--text-primary); font-family:var(--font-mono);">Ctrl+Z</kbd> Undo</div>
              <div><kbd style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); color:var(--text-primary); font-family:var(--font-mono);">Ctrl+Shift+Z</kbd> Redo</div>
              <div><kbd style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle); color:var(--text-primary); font-family:var(--font-mono);">Ctrl+E</kbd> Export Video</div>
            </div>
          </div>

          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:8px; padding:12px 14px;">
            <h3 style="color:var(--accent-primary); font-size:13px; font-weight:600; margin-bottom:4px;">📱 How do I switch to Vertical (9:16) format for Reels or TikTok?</h3>
            <p style="color:var(--text-secondary); font-size:12px; line-height:1.5;">Use the Aspect Ratio dropdown located at the bottom left of the Program Monitor, or click <strong>Settings</strong> in the top toolbar and choose <strong>9:16 Vertical</strong>.</p>
          </div>
        </div>

        <div class="modal__footer">
          <button class="btn btn--primary" id="btnGotItHelp">Got It</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('btnCloseHelpModal').onclick = closeModal;
    document.getElementById('btnGotItHelp').onclick = closeModal;
  }

  // ═══════════════════════════════════════════
  // Export Modal
  // ═══════════════════════════════════════════

  openExportModal() {
    const existing = document.getElementById('exportModal');
    if (existing) existing.remove();

    const duration = store.get('playback.duration') || 0;
    const currentW = store.get('project.settings.width') || 1920;
    const currentH = store.get('project.settings.height') || 1080;
    const currentFps = store.get('project.settings.fps') || 30;
    const projectName = store.get('project.name') || 'Untitled';
    const isTimelineEmpty = duration <= 0;

    const modal = document.createElement('div');
    modal.id = 'exportModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:520px;">
        <div class="modal__header">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <h2 class="modal__title">Export Video</h2>
          </div>
          <button class="modal__close" id="btnCloseExportModal" title="Close">✕</button>
        </div>

        <div class="modal__body" style="display:flex; flex-direction:column; gap:16px;">
          ${isTimelineEmpty ? `
            <div style="background:rgba(255, 107, 107, 0.12); border:1px solid rgba(255, 107, 107, 0.3); border-radius:6px; padding:10px 14px; display:flex; align-items:center; gap:10px; color:#ff8585; font-size:12px;">
              <span style="font-size:16px;">⚠️</span>
              <div>
                <strong>Timeline is currently empty.</strong>
                <div>Add clips to your sequence to enable rendering.</div>
              </div>
            </div>
          ` : `
            <div style="background:rgba(0, 242, 254, 0.08); border:1px solid rgba(0, 242, 254, 0.25); border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
              <span style="color:var(--text-secondary);">Sequence Duration:</span>
              <span style="color:var(--accent-primary); font-family:var(--font-mono); font-weight:700; font-size:13px;">${TimeUtils.secondsToTimecode(duration, currentFps)}</span>
            </div>
          `}

          <div>
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Output File Name</label>
            <input type="text" id="exportFileName" value="${projectName}" class="input" style="width:100%;">
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Resolution</label>
              <select id="exportResolution" class="select" style="width:100%;">
                <option value="${currentW}x${currentH}" selected>Project (${currentW}×${currentH})</option>
                <option value="1920x1080">1080p Full HD (1920×1080)</option>
                <option value="3840x2160">4K Ultra HD (3840×2160)</option>
                <option value="1280x720">720p HD (1280×720)</option>
                <option value="1080x1920">Vertical / TikTok (1080×1920)</option>
              </select>
            </div>

            <div>
              <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Format & Codec</label>
              <select id="exportFormat" class="select" style="width:100%;">
                <option value="mp4-h264" selected>MP4 (H.264 / AAC) — Universal</option>
                <option value="mp4-hevc">MP4 (HEVC / H.265) — High Quality</option>
                <option value="webm-vp9">WebM (VP9 / Opus) — Web Standard</option>
                <option value="webm-av1">WebM (AV1) — Next-Gen Web</option>
                <option value="mov-prores">MOV (ProRes) — Master / Pro</option>
                <option value="gif">Animated GIF — Web Meme</option>
              </select>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Frame Rate</label>
              <select id="exportFps" class="select" style="width:100%;">
                <option value="30" ${currentFps === 30 ? 'selected' : ''}>30 FPS</option>
                <option value="60" ${currentFps === 60 ? 'selected' : ''}>60 FPS</option>
                <option value="24" ${currentFps === 24 ? 'selected' : ''}>24 FPS (Cinematic)</option>
              </select>
            </div>

            <div>
              <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Bitrate / Quality</label>
              <select id="exportQuality" class="select" style="width:100%;">
                <option value="high" selected>High (15 Mbps recommended)</option>
                <option value="medium">Medium (8 Mbps smaller size)</option>
                <option value="ultra">Ultra (30 Mbps maximum detail)</option>
              </select>
            </div>
          </div>

          <div id="exportProgressSection" style="display:none; margin-top:4px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
              <span id="exportProgressLabel" style="font-size:12px; color:var(--text-secondary);">Encoding video...</span>
              <span id="exportProgressPercent" style="font-size:12px; font-weight:700; color:var(--accent-primary);">0%</span>
            </div>
            <div style="height:8px; background:var(--bg-elevated); border-radius:4px; overflow:hidden; border:1px solid var(--border-subtle);">
              <div id="exportProgressBar" style="width:0%; height:100%; background:linear-gradient(90deg, #6c5ce7, #00f2fe); transition:width 0.2s;"></div>
            </div>
          </div>
        </div>

        <div class="modal__footer">
          <button class="btn btn--secondary" id="btnCancelExport">Cancel</button>
          <button class="btn btn--primary" id="btnStartExport" ${isTimelineEmpty ? 'disabled title="Add clips to timeline first"' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Start Export</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('btnCloseExportModal').onclick = closeModal;
    document.getElementById('btnCancelExport').onclick = closeModal;

    document.getElementById('btnStartExport').onclick = async () => {
      const fileName = document.getElementById('exportFileName').value.trim() || 'Untitled';
      const resVal = document.getElementById('exportResolution').value.split('x');
      const formatVal = document.getElementById('exportFormat').value;
      const fps = parseInt(document.getElementById('exportFps').value);
      const quality = document.getElementById('exportQuality').value;

      let format = 'mp4';
      let codec = 'libx264';
      if (formatVal === 'mp4-hevc') { format = 'mp4'; codec = 'libx265'; }
      else if (formatVal === 'webm-vp9') { format = 'webm'; codec = 'libvpx-vp9'; }
      else if (formatVal === 'webm-av1') { format = 'webm'; codec = 'libaom-av1'; }
      else if (formatVal === 'mov-prores') { format = 'mov'; codec = 'prores'; }
      else if (formatVal === 'gif') { format = 'gif'; codec = 'gif'; }

      // Gather clips from tracks
      const tracks = store.get('tracks') || [];
      const exportClips = [];
      for (const track of tracks) {
        if (!track.visible && track.type === 'video') continue;
        const isMuted = !!track.muted;
        for (const clip of track.clips || []) {
          exportClips.push({
            id: clip.id,
            trackId: track.id,
            trackType: track.type,
            trackMuted: isMuted,
            mediaType: clip.mediaType || (track.type === 'audio' ? 'audio' : 'video'),
            sourcePath: clip.sourcePath,
            name: clip.name,
            startTime: clip.startTime,
            duration: clip.duration,
            sourceStartTime: clip.sourceStartTime || 0,
            volume: clip.volume !== undefined ? clip.volume : 1,
            opacity: clip.opacity !== undefined ? clip.opacity : 1,
            speed: clip.speed || 1,
            color: clip.color,
            text: clip.text
          });
        }
      }

      if (exportClips.length === 0) {
        this.showToast('No clips on timeline to export! Add media to timeline first.', 'warning');
        return;
      }

      let outputPath = null;
      if (window.studiocut?.dialog) {
        outputPath = await window.studiocut.dialog.saveExport(`${fileName}.${format}`);
        if (!outputPath) {
          // User clicked Cancel in save dialog
          return;
        }
      }

      const progressSection = document.getElementById('exportProgressSection');
      const progressBar = document.getElementById('exportProgressBar');
      const progressPercent = document.getElementById('exportProgressPercent');
      const progressLabel = document.getElementById('exportProgressLabel');
      const btnStart = document.getElementById('btnStartExport');
      const btnCancel = document.getElementById('btnCancelExport');

      progressSection.style.display = 'block';
      btnStart.disabled = true;

      // Allow cancelling active export
      let exportActive = true;
      btnCancel.onclick = () => {
        if (exportActive && window.studiocut?.export?.cancel) {
          window.studiocut.export.cancel();
        }
        closeModal();
      };

      const totalDuration = store.get('playback.duration') || 0;
      const exportConfig = {
        outputPath: outputPath || `exported-video.${format}`,
        resolution: `${resVal[0]}x${resVal[1]}`,
        width: parseInt(resVal[0]),
        height: parseInt(resVal[1]),
        fps,
        format,
        videoCodec: codec,
        quality,
        totalDuration,
        clips: exportClips,
        project: store.serialize()
      };

      if (window.studiocut?.export?.start) {
        window.studiocut.export.onProgress((p) => {
          const pct = Math.max(0, Math.min(100, Math.round(p.percent ?? p.percentage ?? 0)));
          progressBar.style.width = `${pct}%`;
          progressPercent.textContent = `${pct}%`;
          if (progressLabel) {
            progressLabel.textContent = pct >= 100 ? 'Finalizing video...' : `Encoding: ${pct}%`;
          }
        });

        try {
          const res = await window.studiocut.export.start(exportConfig);
          exportActive = false;

          if (res && res.error) {
            throw new Error(res.error);
          }

          if (res && res.cancelled) {
            this.showToast('Export cancelled by user', 'info');
          } else {
            this.showToast(`Video exported successfully!`, 'info', {
              label: '📂 Open Folder',
              onClick: () => {
                if (window.studiocut?.shell) {
                  window.studiocut.shell.showItemInFolder(outputPath);
                }
              }
            });
          }
          closeModal();
        } catch (err) {
          exportActive = false;
          console.error('[Export Error]:', err);
          this.showToast(`Export failed: ${err.message}`, 'error');
          progressSection.style.display = 'none';
          btnStart.disabled = false;
        }
      } else {
        // Fallback simulated export if outside Electron
        let progress = 0;
        const interval = setInterval(() => {
          progress += 5;
          progressBar.style.width = `${progress}%`;
          progressPercent.textContent = `${progress}%`;
          if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              this.showToast('Export complete (dev preview)');
              closeModal();
            }, 400);
          }
        }, 100);
      }
    };
  }

  // ═══════════════════════════════════════════
  // Toast Notifications
  // ═══════════════════════════════════════════

  showToast(message, type = 'info', action = null) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    while (container.children.length >= 2) {
      container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.style.padding = '8px 14px';
    toast.style.borderRadius = '6px';
    toast.style.background = type === 'error' ? 'var(--accent-danger)' : type === 'warning' ? 'var(--accent-warning)' : 'var(--bg-card)';
    toast.style.color = '#ffffff';
    toast.style.boxShadow = 'var(--shadow-lg)';
    toast.style.border = '1px solid var(--border-subtle)';
    toast.style.fontSize = '12px';
    toast.style.fontWeight = '500';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.animation = 'fadeIn 0.2s ease-out';

    const icon = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✨';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

    if (action && action.label && action.onClick) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'btn btn--secondary btn--sm';
      actionBtn.style.marginLeft = '8px';
      actionBtn.style.padding = '2px 8px';
      actionBtn.style.fontSize = '11px';
      actionBtn.textContent = action.label;
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        action.onClick();
      };
      toast.appendChild(actionBtn);
    }

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ═══════════════════════════════════════════
  // Menu Bar
  // ═══════════════════════════════════════════

  _initMenuBar() {
    const menubar = document.getElementById('menubar');
    if (!menubar) return;

    // Close any open dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menubar__item')) {
        document.querySelectorAll('.menubar__dropdown.active').forEach(d => d.classList.remove('active'));
      }
    });

    // Toggle dropdowns on click and hover
    menubar.querySelectorAll('.menubar__item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.menubar__dropdown-item')) {
          document.querySelectorAll('.menubar__dropdown.active').forEach(d => d.classList.remove('active'));
          return;
        }
        const dropdown = item.querySelector('.menubar__dropdown');
        if (!dropdown) return;
        const wasActive = dropdown.classList.contains('active');
        document.querySelectorAll('.menubar__dropdown.active').forEach(d => d.classList.remove('active'));
        if (!wasActive) {
          dropdown.classList.add('active');
        }
      });

      item.addEventListener('mouseenter', () => {
        const anyActive = document.querySelector('.menubar__dropdown.active');
        if (anyActive) {
          anyActive.classList.remove('active');
          item.querySelector('.menubar__dropdown')?.classList.add('active');
        }
      });
    });

    // Wire file menu items
    document.getElementById('menuNewProject')?.addEventListener('click', () => this.newProject());
    document.getElementById('menuOpenProject')?.addEventListener('click', () => this.openProject());
    document.getElementById('menuSaveProject')?.addEventListener('click', () => this.saveProject());
    document.getElementById('menuSaveAs')?.addEventListener('click', () => this.saveProjectAs());
    document.getElementById('menuImport')?.addEventListener('click', () => this.importMedia());
    document.getElementById('menuExport')?.addEventListener('click', () => this.openExportModal());
    document.getElementById('menuProjectSettings')?.addEventListener('click', () => this.openProjectSettingsModal());

    // Wire edit menu items
    document.getElementById('menuUndo')?.addEventListener('click', () => store.undo());
    document.getElementById('menuRedo')?.addEventListener('click', () => store.redo());
    document.getElementById('menuCut')?.addEventListener('click', () => {
      const c = Actions.cutSelectedClips();
      if (c > 0) this.showToast(`Cut ${c} clip(s)`);
    });
    document.getElementById('menuCopy')?.addEventListener('click', () => {
      const c = Actions.copySelectedClips();
      if (c > 0) this.showToast(`Copied ${c} clip(s)`);
    });
    document.getElementById('menuPaste')?.addEventListener('click', () => {
      const p = Actions.pasteClips();
      if (p.length > 0) this.showToast(`Pasted ${p.length} clip(s)`);
    });
    document.getElementById('menuDuplicate')?.addEventListener('click', () => {
      const d = Actions.duplicateSelectedClips();
      if (d.length > 0) this.showToast(`Duplicated ${d.length} clip(s)`);
    });
    document.getElementById('menuDelete')?.addEventListener('click', () => Actions.removeSelectedClips());
    document.getElementById('menuRippleDelete')?.addEventListener('click', () => {
      Actions.rippleDelete();
      this.showToast('Ripple deleted');
    });
    document.getElementById('menuSelectAll')?.addEventListener('click', () => Actions.selectAll());
    document.getElementById('menuDeselectAll')?.addEventListener('click', () => Actions.deselectAll());

    // Wire view menu items
    document.getElementById('menuToggleMedia')?.addEventListener('click', () => this.togglePanel('media'));
    document.getElementById('menuTogglePreview')?.addEventListener('click', () => this.togglePanel('preview'));
    document.getElementById('menuToggleInspector')?.addEventListener('click', () => this.togglePanel('inspector'));
    document.getElementById('menuToggleTimeline')?.addEventListener('click', () => this.togglePanel('timeline'));
    document.getElementById('menuToggleMixer')?.addEventListener('click', () => this.toggleAudioMixer());
    document.getElementById('menuToggleScopes')?.addEventListener('click', () => this.togglePreviewDrawer('scopes'));
    document.getElementById('menuToggleGraphEditor')?.addEventListener('click', () => this.togglePreviewDrawer('graph'));
    document.getElementById('menuToggleGuides')?.addEventListener('click', () => window.previewEngine?.toggleSafeMargins());
    document.getElementById('menuFullscreen')?.addEventListener('click', () => this.toggleFullscreenPreview());

    // Wire clip menu items
    document.getElementById('menuSplitClip')?.addEventListener('click', () => Actions.splitAtPlayhead());
    document.getElementById('menuFreezeFrame')?.addEventListener('click', () => {
      const selected = store.get('selection.clipIds');
      Actions.freezeFrame(selected?.[0]);
      this.showToast('Freeze frame inserted at playhead');
    });
    document.getElementById('menuInsert')?.addEventListener('click', () => {
      if (window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.performInsert();
      } else {
        Actions.insertEdit();
      }
    });
    document.getElementById('menuOverwrite')?.addEventListener('click', () => {
      if (window.sourceMonitor?.currentMedia) {
        window.sourceMonitor.performOverwrite();
      } else {
        Actions.overwriteEdit();
      }
    });
    document.getElementById('menuMatchFrame')?.addEventListener('click', () => {
      Actions.matchFrame();
    });
    document.getElementById('menuAddMarker')?.addEventListener('click', () => {
      const t = store.get('playback.currentTime');
      Actions.addMarker(t, 'Marker');
    });
    document.getElementById('menuViewDualMonitor')?.addEventListener('click', () => {
      const mode = window.sourceMonitor?.viewMode === 'dual' ? 'program' : 'dual';
      window.sourceMonitor?.setMode(mode);
      this.showToast(`Monitor Layout: ${mode.toUpperCase()}`);
    });

    // Wire help menu items
    document.getElementById('menuHelpFaq')?.addEventListener('click', () => this.openHelpModal());
    document.getElementById('menuShortcuts')?.addEventListener('click', () => this.openShortcutsModal());
    document.getElementById('menuAbout')?.addEventListener('click', () => this.openHelpModal());
  }

  async saveProjectAs() {
    try {
      if (!window.studiocut?.dialog) {
        this.showToast('Desktop bridge not available', 'error');
        return;
      }
      const defaultName = `${store.get('project.name') || 'Untitled'}_copy.studiocut`;
      const filePath = await window.studiocut.dialog.saveProject(defaultName);
      if (!filePath) return;

      const projectData = store.serialize();
      if (window.studiocut?.project) {
        await window.studiocut.project.save(projectData, filePath);
        store.set('project.filePath', filePath);
        store.set('project.dirty', false);
        this.showToast('Project saved as new file');
      }
    } catch (err) {
      console.error('Failed to save project as:', err);
      this.showToast(`Error saving project: ${err.message}`, 'error');
    }
  }

  // ═══════════════════════════════════════════
  // Preview Drawer (Scopes & Graph Editor)
  // ═══════════════════════════════════════════

  _initPreviewDrawer() {
    const btnScopes = document.getElementById('btnToggleScopes');
    const btnGraph = document.getElementById('btnToggleGraphEditor');
    const btnMultiCam = document.getElementById('btnToggleMultiCam');
    const btnClose = document.getElementById('drawerClose');
    const tabScopes = document.getElementById('drawerTabScopes');
    const tabGraph = document.getElementById('drawerTabGraph');

    btnScopes?.addEventListener('click', () => this.togglePreviewDrawer('scopes'));
    btnGraph?.addEventListener('click', () => this.togglePreviewDrawer('graph'));
    btnMultiCam?.addEventListener('click', () => window.multiCamEngine?.toggleMultiCam());
    btnClose?.addEventListener('click', () => this.closePreviewDrawer());

    // Drawer tab switches
    tabScopes?.addEventListener('click', () => this.togglePreviewDrawer('scopes'));
    tabGraph?.addEventListener('click', () => this.togglePreviewDrawer('graph'));
  }

  togglePreviewDrawer(view) {
    const drawer = document.getElementById('previewDrawer');
    const scopesContainer = document.getElementById('videoScopesContainer');
    const graphContainer = document.getElementById('graphEditorContainer');
    const tabScopes = document.getElementById('drawerTabScopes');
    const tabGraph = document.getElementById('drawerTabGraph');
    if (!drawer) return;

    // Toggle off if same view clicked again
    if (drawer.classList.contains('open') && this._currentDrawerView === view) {
      this.closePreviewDrawer();
      return;
    }

    drawer.classList.add('open');
    this._currentDrawerView = view;

    if (view === 'scopes') {
      if (scopesContainer) scopesContainer.style.display = 'flex';
      if (graphContainer) graphContainer.style.display = 'none';
      tabScopes?.classList.add('active');
      tabGraph?.classList.remove('active');
      window.videoScopes?.show?.();
      window.videoScopes?.render?.();
    } else {
      if (scopesContainer) scopesContainer.style.display = 'none';
      if (graphContainer) graphContainer.style.display = 'flex';
      tabGraph?.classList.add('active');
      tabScopes?.classList.remove('active');
      window.keyframeGraphEditor?.render?.();
    }

    window.previewEngine?._handleResize();
  }

  closePreviewDrawer() {
    const drawer = document.getElementById('previewDrawer');
    if (drawer) drawer.classList.remove('open');
    this._currentDrawerView = null;
    window.previewEngine?._handleResize();
  }

  // ═══════════════════════════════════════════
  // Audio Mixer Panel
  // ═══════════════════════════════════════════

  _initAudioMixer() {
    const mixerContainer = document.getElementById('audioMixerPanel');
    if (mixerContainer && window.AudioMixerPanel) {
      window.audioMixerPanel = new window.AudioMixerPanel();
      window.audioMixerPanel.init(mixerContainer);
    }

    const toggleBtn = document.getElementById('toggleAudioMixer');
    toggleBtn?.addEventListener('click', () => this.toggleAudioMixer());
  }

  toggleAudioMixer() {
    if (window.audioMixerPanel) {
      window.audioMixerPanel.toggle();
    }
  }

  // ═══════════════════════════════════════════
  // Source Monitor Panel
  // ═══════════════════════════════════════════

  _initSourceMonitor() {
    if (window.sourceMonitor) {
      window.sourceMonitor.init();
    }
  }

  setMonitorMode(mode) {
    if (window.sourceMonitor) {
      window.sourceMonitor.setMode(mode);
    }
  }

  toggleFullscreenPreview() {
    const container = document.getElementById('previewContainer');
    if (!document.fullscreenElement) {
      container?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
}

// Instantiate and start app on DOMContentLoaded
window.app = new App();
window.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
