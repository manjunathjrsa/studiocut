/**
 * StudioCut — Main Process Entry Point
 * Handles Electron app lifecycle, window management, and global shortcuts
 */

const { app, BrowserWindow, Menu, globalShortcut, nativeTheme, dialog, ipcMain } = require('electron');
const path = require('path');
const { setupIpcHandlers } = require('./ipc-handlers');
const { FFmpegEngine } = require('./ffmpeg-engine');
const { ProjectManager } = require('./project-manager');
const { FileManager } = require('./file-manager');
const { ExportEngine } = require('./export-engine');

// Enforce single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let ffmpegEngine = null;
let projectManager = null;
let fileManager = null;
let exportEngine = null;

// Force dark mode
nativeTheme.themeSource = 'dark';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webgl: true,
      backgroundThrottling: false // Keep rendering when not focused
    },
    icon: process.platform === 'win32'
      ? path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.ico')
      : path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png'),
    show: false
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] [${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Prevent actual close — ask for save
  mainWindow.on('close', async (e) => {
    if (projectManager && projectManager.hasUnsavedChanges()) {
      e.preventDefault();
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Save & Quit', 'Quit Without Saving', 'Cancel'],
        defaultId: 0,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Do you want to save before quitting?'
      });

      if (response === 0) {
        await projectManager.save();
        mainWindow.destroy();
      } else if (response === 1) {
        mainWindow.destroy();
      }
      // response === 2 → Cancel, do nothing
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createApplicationMenu() {
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-project')
        },
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-project')
        },
        { type: 'separator' },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save-project')
        },
        {
          label: 'Save Project As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu:save-project-as')
        },
        { type: 'separator' },
        {
          label: 'Import Media...',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow?.webContents.send('menu:import-media')
        },
        {
          label: 'Export Video...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu:export')
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow?.webContents.send('menu:undo')
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => mainWindow?.webContents.send('menu:redo')
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          click: () => mainWindow?.webContents.send('menu:cut')
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          click: () => mainWindow?.webContents.send('menu:copy')
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          click: () => mainWindow?.webContents.send('menu:paste')
        },
        {
          label: 'Delete',
          accelerator: 'Delete',
          click: () => mainWindow?.webContents.send('menu:delete')
        },
        { type: 'separator' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          click: () => mainWindow?.webContents.send('menu:select-all')
        },
        {
          label: 'Deselect All',
          accelerator: 'CmdOrCtrl+D',
          click: () => mainWindow?.webContents.send('menu:deselect-all')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Fullscreen Preview',
          accelerator: 'F11',
          click: () => mainWindow?.webContents.send('menu:toggle-fullscreen')
        },
        { type: 'separator' },
        {
          label: 'Zoom In Timeline',
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow?.webContents.send('menu:zoom-in')
        },
        {
          label: 'Zoom Out Timeline',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow?.webContents.send('menu:zoom-out')
        },
        {
          label: 'Fit Timeline',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.send('menu:zoom-fit')
        },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => mainWindow?.webContents.send('menu:show-shortcuts')
        },
        {
          label: `About StudioCut v${app.getVersion()}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About StudioCut',
              message: 'StudioCut Video Editor',
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nChromium: ${process.versions.chrome}\nNode.js: ${process.versions.node}\n\nFree & Open Source Video Editor`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

function initializeEngines() {
  ffmpegEngine = new FFmpegEngine();
  projectManager = new ProjectManager();
  fileManager = new FileManager();
  exportEngine = new ExportEngine(ffmpegEngine);

  // Setup IPC handlers with engine references
  setupIpcHandlers({
    mainWindow: () => mainWindow,
    ffmpegEngine,
    projectManager,
    fileManager,
    exportEngine
  });
}

// App lifecycle
app.whenReady().then(() => {
  initializeEngines();
  createApplicationMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Clean up temp files
  if (fileManager) {
    fileManager.cleanup();
  }
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Handle second instance
app.on('second-instance', (event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    // Check if a project file was passed
    const projectFile = commandLine.find(arg => arg.endsWith('.studiocut'));
    if (projectFile) {
      mainWindow.webContents.send('open-project-file', projectFile);
    }
  }
});

// Handle file association
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('open-project-file', filePath);
  }
});
