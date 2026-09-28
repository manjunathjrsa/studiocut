/**
 * StudioCut — File Manager
 * Handles media import, validation, cache management, and temp file cleanup
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const crypto = require('crypto');

class FileManager {
  constructor() {
    this._cacheDir = path.join(app.getPath('userData'), 'cache');
    this._tempDir = path.join(app.getPath('temp'), 'studiocut');
    this._ensureDirs();
  }

  async _ensureDirs() {
    const dirs = [
      this._cacheDir,
      path.join(this._cacheDir, 'thumbnails'),
      path.join(this._cacheDir, 'waveforms'),
      path.join(this._cacheDir, 'proxies'),
      this._tempDir
    ];

    for (const dir of dirs) {
      await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
    }
  }

  /**
   * Import a media file and generate its metadata, thumbnails, etc.
   */
  async importMedia(filePath, ffmpegEngine) {
    // Validate file exists
    try {
      await fs.promises.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = await fs.promises.stat(filePath);
    const fileHash = this._hashFilePath(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Determine media type
    const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp', '.ts'];
    const audioExts = ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.wma', '.m4a'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'];

    let mediaType = 'unknown';
    if (videoExts.includes(ext)) mediaType = 'video';
    else if (audioExts.includes(ext)) mediaType = 'audio';
    else if (imageExts.includes(ext)) mediaType = 'image';

    // Build media info
    const mediaInfo = {
      id: fileHash + '_' + Date.now().toString(36),
      filePath: filePath,
      fileName: path.basename(filePath),
      fileSize: stat.size,
      mediaType: mediaType,
      extension: ext,
      importedAt: new Date().toISOString(),
      thumbnailPath: null,
      waveformPath: null,
      proxyPath: null,
      metadata: null
    };

    // Probe the file for detailed metadata
    try {
      const metadata = await ffmpegEngine.probe(filePath);
      mediaInfo.metadata = metadata;
      mediaInfo.duration = metadata.duration || 0;
      mediaInfo.mediaType = metadata.mediaType || mediaType;

      if (metadata.video) {
        mediaInfo.width = metadata.video.width;
        mediaInfo.height = metadata.video.height;
        mediaInfo.fps = metadata.video.fps;
      }
    } catch (err) {
      console.warn(`[FileManager] Could not probe ${filePath}:`, err.message);
    }

    // Generate thumbnail for video/image
    if (mediaInfo.mediaType === 'video') {
      try {
        const thumbDir = path.join(this._cacheDir, 'thumbnails', fileHash);
        const thumbnails = await ffmpegEngine.generateThumbnails(filePath, 1, thumbDir);
        if (thumbnails.length > 0) {
          mediaInfo.thumbnailPath = thumbnails[0].path;
        }
      } catch (err) {
        console.warn(`[FileManager] Could not generate thumbnail for ${filePath}:`, err.message);
      }
    } else if (mediaInfo.mediaType === 'image') {
      mediaInfo.thumbnailPath = filePath; // Use the image itself as thumbnail
    }

    return mediaInfo;
  }

  getCacheDir() {
    return this._cacheDir;
  }

  getTempDir() {
    return this._tempDir;
  }

  /**
   * Clean up temporary files
   */
  async cleanup() {
    try {
      // Remove temp directory
      await fs.promises.rm(this._tempDir, { recursive: true, force: true });
      console.log('[FileManager] Cleaned up temp files');
    } catch (err) {
      console.error('[FileManager] Cleanup error:', err.message);
    }
  }

  /**
   * Clear all cached data (thumbnails, waveforms, proxies)
   */
  async clearCache() {
    try {
      await fs.promises.rm(this._cacheDir, { recursive: true, force: true });
      await this._ensureDirs();
      console.log('[FileManager] Cache cleared');
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get total cache size in bytes
   */
  async getCacheSize() {
    let totalSize = 0;

    async function dirSize(dirPath) {
      try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            await dirSize(fullPath);
          } else {
            const stat = await fs.promises.stat(fullPath);
            totalSize += stat.size;
          }
        }
      } catch {
        // ignore errors
      }
    }

    await dirSize(this._cacheDir);
    return totalSize;
  }

  _hashFilePath(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 12);
  }
}

module.exports = { FileManager };
