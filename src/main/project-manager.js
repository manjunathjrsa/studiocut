/**
 * StudioCut — Project Manager
 * Handles .studiocut project file format, save/load, auto-save, and recent projects
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class ProjectManager {
  constructor() {
    this.currentProject = null;
    this.currentFilePath = null;
    this._unsavedChanges = false;
    this._autoSaveInterval = null;
    this._recentProjectsPath = path.join(app.getPath('userData'), 'recent-projects.json');
  }

  /**
   * Create a new empty project
   */
  createNew() {
    this.currentProject = {
      version: '1.0.0',
      name: 'Untitled Project',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      settings: {
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        backgroundColor: '#000000',
        audioSampleRate: 44100
      },
      media: [],       // Imported media files
      tracks: [
        { id: 'video-1', type: 'video', name: 'Video 1', clips: [], locked: false, visible: true, muted: false },
        { id: 'audio-1', type: 'audio', name: 'Audio 1', clips: [], locked: false, visible: true, muted: false }
      ],
      markers: [],
      effects: [],
      transitions: [],
      keyframes: {}
    };

    this.currentFilePath = null;
    this._unsavedChanges = false;
    this._startAutoSave();

    return JSON.parse(JSON.stringify(this.currentProject));
  }

  /**
   * Save project to file
   */
  async save(projectData, filePath) {
    const targetPath = filePath || this.currentFilePath;
    if (!targetPath) {
      throw new Error('No file path specified for save');
    }

    // Update metadata
    projectData.modifiedAt = new Date().toISOString();
    projectData.version = '1.0.0';

    const projectJson = JSON.stringify(projectData, null, 2);

    // Ensure directory exists
    const dir = path.dirname(targetPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Write to temp file first, then rename (atomic write)
    const tempPath = targetPath + '.tmp';
    await fs.promises.writeFile(tempPath, projectJson, 'utf-8');
    await fs.promises.rename(tempPath, targetPath);

    this.currentProject = projectData;
    this.currentFilePath = targetPath;
    this._unsavedChanges = false;

    // Update recent projects
    this._addToRecent(targetPath, projectData.name);

    return { success: true, filePath: targetPath };
  }

  /**
   * Load project from file
   */
  async load(filePath) {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const projectData = JSON.parse(content);

    // Validate project format
    if (!projectData.version || !projectData.tracks) {
      throw new Error('Invalid StudioCut project file');
    }

    // Verify media files still exist
    if (projectData.media) {
      for (const media of projectData.media) {
        try {
          await fs.promises.access(media.filePath);
          media.missing = false;
        } catch {
          media.missing = true;
          console.warn(`[Project] Missing media: ${media.filePath}`);
        }
      }
    }

    this.currentProject = projectData;
    this.currentFilePath = filePath;
    this._unsavedChanges = false;
    this._startAutoSave();

    // Update recent projects
    this._addToRecent(filePath, projectData.name);

    return projectData;
  }

  /**
   * Mark project as having unsaved changes
   */
  markDirty() {
    this._unsavedChanges = true;
  }

  hasUnsavedChanges() {
    return this._unsavedChanges;
  }

  /**
   * Get list of recent projects
   */
  getRecentProjects() {
    try {
      if (fs.existsSync(this._recentProjectsPath)) {
        const data = fs.readFileSync(this._recentProjectsPath, 'utf-8');
        const projects = JSON.parse(data);

        // Filter out projects whose files no longer exist
        return projects.filter(p => {
          try {
            fs.accessSync(p.path);
            return true;
          } catch {
            return false;
          }
        });
      }
    } catch (error) {
      console.error('[Project] Failed to read recent projects:', error.message);
    }
    return [];
  }

  /**
   * Add a project to the recent list
   */
  _addToRecent(filePath, name) {
    let recent = this.getRecentProjects();

    // Remove if already exists
    recent = recent.filter(p => p.path !== filePath);

    // Add to front
    recent.unshift({
      path: filePath,
      name: name || path.basename(filePath, '.studiocut'),
      lastOpened: new Date().toISOString()
    });

    // Keep only last 10
    recent = recent.slice(0, 10);

    try {
      const dir = path.dirname(this._recentProjectsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._recentProjectsPath, JSON.stringify(recent, null, 2));
    } catch (error) {
      console.error('[Project] Failed to save recent projects:', error.message);
    }
  }

  /**
   * Start auto-save interval (every 60 seconds)
   */
  _startAutoSave() {
    this._stopAutoSave();
    this._autoSaveInterval = setInterval(async () => {
      if (this._unsavedChanges && this.currentFilePath && this.currentProject) {
        try {
          const autoSavePath = this.currentFilePath + '.autosave';
          const projectJson = JSON.stringify(this.currentProject, null, 2);
          await fs.promises.writeFile(autoSavePath, projectJson, 'utf-8');
          console.log('[Project] Auto-saved to:', autoSavePath);
        } catch (error) {
          console.error('[Project] Auto-save failed:', error.message);
        }
      }
    }, 60000); // 60 seconds
  }

  _stopAutoSave() {
    if (this._autoSaveInterval) {
      clearInterval(this._autoSaveInterval);
      this._autoSaveInterval = null;
    }
  }
}

module.exports = { ProjectManager };
