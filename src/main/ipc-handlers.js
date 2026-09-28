/**
 * StudioCut — IPC Handlers
 * Bridge between Main Process (Node.js) and Renderer Process (Chromium)
 */

const { ipcMain, dialog, app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let engines = {};

function setupIpcHandlers(engineRefs) {
  engines = engineRefs;

  // ═══════════════════════════════════════════
  // Window Controls (frameless window)
  // ═══════════════════════════════════════════
  ipcMain.on('window:minimize', () => {
    const win = engines.mainWindow();
    if (win) win.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = engines.mainWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    const win = engines.mainWindow();
    if (win) win.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    const win = engines.mainWindow();
    return win ? win.isMaximized() : false;
  });

  // ═══════════════════════════════════════════
  // File Dialogs
  // ═══════════════════════════════════════════
  ipcMain.handle('dialog:open-media', async () => {
    try {
      const win = engines.mainWindow ? engines.mainWindow() : null;
      const options = {
        title: 'Import Media',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'All Supported Media',
            extensions: [
              'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts',
              'mp3', 'wav', 'aac', 'ogg', 'flac', 'wma', 'm4a',
              'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico'
            ]
          },
          { name: 'Video Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts'] },
          { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'ogg', 'flac', 'wma', 'm4a'] },
          { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      };
      const result = (win && !win.isDestroyed()) ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      if (!result || result.canceled) return [];
      return result.filePaths || [];
    } catch (err) {
      console.error('[Dialog] dialog:open-media error:', err);
      return [];
    }
  });

  ipcMain.handle('dialog:open-project', async () => {
    const win = engines.mainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Open Project',
      properties: ['openFile'],
      filters: [
        { name: 'StudioCut Project', extensions: ['studiocut'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:save-project', async (event, defaultPath) => {
    const win = engines.mainWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Project',
      defaultPath: defaultPath || 'Untitled.studiocut',
      filters: [
        { name: 'StudioCut Project', extensions: ['studiocut'] }
      ]
    });

    if (result.canceled) return null;
    return result.filePath;
  });

  ipcMain.handle('dialog:save-export', async (event, defaultName) => {
    const win = engines.mainWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Video',
      defaultPath: defaultName || 'export.mp4',
      filters: [
        { name: 'MP4 Video', extensions: ['mp4'] },
        { name: 'WebM Video', extensions: ['webm'] },
        { name: 'MOV Video', extensions: ['mov'] },
        { name: 'AVI Video', extensions: ['avi'] },
        { name: 'GIF Animation', extensions: ['gif'] }
      ]
    });

    if (result.canceled) return null;
    return result.filePath;
  });

  ipcMain.handle('dialog:open-lut', async () => {
    const win = engines.mainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Import LUT',
      properties: ['openFile'],
      filters: [
        { name: 'LUT Files', extensions: ['cube', '3dl', 'lut'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:select-folder', async (event, title) => {
    const win = engines.mainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: title || 'Select Folder',
      properties: ['openDirectory']
    });

    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // ═══════════════════════════════════════════
  // FFmpeg Operations
  // ═══════════════════════════════════════════
  ipcMain.handle('ffmpeg:probe', async (event, filePath) => {
    try {
      return await engines.ffmpegEngine.probe(filePath);
    } catch (error) {
      console.error('FFmpeg probe error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:generate-thumbnails', async (event, filePath, count, outputDir) => {
    try {
      return await engines.ffmpegEngine.generateThumbnails(filePath, count, outputDir);
    } catch (error) {
      console.error('FFmpeg thumbnail error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:extract-frame', async (event, filePath, timestamp, outputPath) => {
    try {
      return await engines.ffmpegEngine.extractFrame(filePath, timestamp, outputPath);
    } catch (error) {
      console.error('FFmpeg frame extract error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:generate-waveform', async (event, filePath, outputPath) => {
    try {
      return await engines.ffmpegEngine.generateWaveformData(filePath, outputPath);
    } catch (error) {
      console.error('FFmpeg waveform error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('ffmpeg:create-proxy', async (event, filePath, outputPath) => {
    try {
      return await engines.ffmpegEngine.createProxy(filePath, outputPath);
    } catch (error) {
      console.error('FFmpeg proxy error:', error);
      return { error: error.message };
    }
  });

  // ═══════════════════════════════════════════
  // Project Management
  // ═══════════════════════════════════════════
  ipcMain.handle('project:new', async () => {
    return engines.projectManager.createNew();
  });

  ipcMain.handle('project:save', async (event, projectData, filePath) => {
    try {
      return await engines.projectManager.save(projectData, filePath);
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('project:load', async (event, filePath) => {
    try {
      return await engines.projectManager.load(filePath);
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('project:get-recent', () => {
    return engines.projectManager.getRecentProjects();
  });

  // ═══════════════════════════════════════════
  // File Management
  // ═══════════════════════════════════════════
  ipcMain.handle('file:import-media', async (event, filePaths) => {
    try {
      const results = [];
      for (const filePath of filePaths) {
        const mediaInfo = await engines.fileManager.importMedia(filePath, engines.ffmpegEngine);
        results.push(mediaInfo);
      }
      return results;
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('file:get-cache-dir', () => {
    return engines.fileManager.getCacheDir();
  });

  ipcMain.handle('file:read-text', async (event, filePath) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('file:read-binary', async (event, filePath) => {
    try {
      const buffer = await fs.promises.readFile(filePath);
      return buffer;
    } catch (error) {
      console.error('[IPC] file:read-binary error:', error);
      return null;
    }
  });

  ipcMain.handle('file:exists', async (event, filePath) => {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // ═══════════════════════════════════════════
  // Export
  // ═══════════════════════════════════════════
  ipcMain.handle('export:start', async (event, exportConfig) => {
    try {
      const win = engines.mainWindow();
      return await engines.exportEngine.startExport(exportConfig, (progress) => {
        if (win) win.webContents.send('export:progress', progress);
      });
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('export:cancel', () => {
    engines.exportEngine.cancelExport();
    return { success: true };
  });

  // ═══════════════════════════════════════════
  // Shell Operations
  // ═══════════════════════════════════════════
  ipcMain.handle('shell:open-path', async (event, filePath) => {
    return shell.openPath(filePath);
  });

  ipcMain.handle('shell:show-in-folder', (event, filePath) => {
    shell.showItemInFolder(filePath);
  });

  // ═══════════════════════════════════════════
  // App Info
  // ═══════════════════════════════════════════
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-path', (event, name) => app.getPath(name));
}

module.exports = { setupIpcHandlers };
