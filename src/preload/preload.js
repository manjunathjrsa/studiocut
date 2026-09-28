/**
 * StudioCut — Preload Script
 * Secure bridge between Renderer (Chromium) and Main (Node.js) processes
 * Exposes a safe API via contextBridge
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('studiocut', {
  // ═══════════════════════════════════════════
  // Window Controls
  // ═══════════════════════════════════════════
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized')
  },

  // ═══════════════════════════════════════════
  // File Dialogs
  // ═══════════════════════════════════════════
  dialog: {
    openMedia: () => ipcRenderer.invoke('dialog:open-media'),
    openProject: () => ipcRenderer.invoke('dialog:open-project'),
    saveProject: (defaultPath) => ipcRenderer.invoke('dialog:save-project', defaultPath),
    saveExport: (defaultName) => ipcRenderer.invoke('dialog:save-export', defaultName),
    openLut: () => ipcRenderer.invoke('dialog:open-lut'),
    selectFolder: (title) => ipcRenderer.invoke('dialog:select-folder', title)
  },

  // ═══════════════════════════════════════════
  // FFmpeg Operations
  // ═══════════════════════════════════════════
  ffmpeg: {
    probe: (filePath) => ipcRenderer.invoke('ffmpeg:probe', filePath),
    generateThumbnails: (filePath, count, outputDir) =>
      ipcRenderer.invoke('ffmpeg:generate-thumbnails', filePath, count, outputDir),
    extractFrame: (filePath, timestamp, outputPath) =>
      ipcRenderer.invoke('ffmpeg:extract-frame', filePath, timestamp, outputPath),
    generateWaveform: (filePath, outputPath) =>
      ipcRenderer.invoke('ffmpeg:generate-waveform', filePath, outputPath),
    createProxy: (filePath, outputPath) =>
      ipcRenderer.invoke('ffmpeg:create-proxy', filePath, outputPath)
  },

  // ═══════════════════════════════════════════
  // Project Management
  // ═══════════════════════════════════════════
  project: {
    new: () => ipcRenderer.invoke('project:new'),
    save: (projectData, filePath) => ipcRenderer.invoke('project:save', projectData, filePath),
    load: (filePath) => ipcRenderer.invoke('project:load', filePath),
    getRecent: () => ipcRenderer.invoke('project:get-recent')
  },

  // ═══════════════════════════════════════════
  // File Operations
  // ═══════════════════════════════════════════
  file: {
    getPathForFile: (file) => {
      try {
        return webUtils ? webUtils.getPathForFile(file) : (file.path || '');
      } catch (e) {
        return file?.path || '';
      }
    },
    importMedia: (filePaths) => ipcRenderer.invoke('file:import-media', filePaths),
    getCacheDir: () => ipcRenderer.invoke('file:get-cache-dir'),
    readText: (filePath) => ipcRenderer.invoke('file:read-text', filePath),
    readBinary: (filePath) => ipcRenderer.invoke('file:read-binary', filePath),
    exists: (filePath) => ipcRenderer.invoke('file:exists', filePath)
  },

  // ═══════════════════════════════════════════
  // Export
  // ═══════════════════════════════════════════
  export: {
    start: (config) => ipcRenderer.invoke('export:start', config),
    cancel: () => ipcRenderer.invoke('export:cancel'),
    onProgress: (callback) => {
      ipcRenderer.on('export:progress', (event, progress) => callback(progress));
    }
  },

  // ═══════════════════════════════════════════
  // Shell Operations
  // ═══════════════════════════════════════════
  shell: {
    openPath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),
    showInFolder: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath)
  },

  // ═══════════════════════════════════════════
  // App Info
  // ═══════════════════════════════════════════
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPath: (name) => ipcRenderer.invoke('app:get-path', name)
  },

  // ═══════════════════════════════════════════
  // Event Listeners (Main → Renderer)
  // ═══════════════════════════════════════════
  on: (channel, callback) => {
    const validChannels = [
      'menu:new-project',
      'menu:open-project',
      'menu:save-project',
      'menu:save-project-as',
      'menu:import-media',
      'menu:export',
      'menu:undo',
      'menu:redo',
      'menu:cut',
      'menu:copy',
      'menu:paste',
      'menu:delete',
      'menu:select-all',
      'menu:deselect-all',
      'menu:toggle-fullscreen',
      'menu:zoom-in',
      'menu:zoom-out',
      'menu:zoom-fit',
      'menu:show-shortcuts',
      'open-project-file',
      'export:progress'
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
