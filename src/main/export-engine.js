/**
 * StudioCut — Export Engine
 * Handles final video rendering/export with FFmpeg
 */

const path = require('path');
const fs = require('fs');

class ExportEngine {
  constructor(ffmpegEngine) {
    this.ffmpegEngine = ffmpegEngine;
    this._currentExport = null;
    this._cancelled = false;
    this._tempFiles = [];
  }

  /**
   * Start the export process
   * @param {Object} config - Export configuration
   * @param {Function} onProgress - Progress callback
   */
  async startExport(config, onProgress) {
    this._cancelled = false;
    const createdTempFiles = [];

    try {
      // Build FFmpeg export configuration based on user settings and resolved clips
      const ffmpegConfig = await this._buildFFmpegConfig(config, createdTempFiles);

      const result = await this.ffmpegEngine.runExport(ffmpegConfig, (progress) => {
        if (!this._cancelled && onProgress) {
          onProgress(progress);
        }
      });

      if (this._cancelled) {
        // Clean up partial file
        try {
          if (fs.existsSync(config.outputPath)) {
            await fs.promises.unlink(config.outputPath);
          }
        } catch {}
        return { cancelled: true };
      }

      // Verify output file exists and is not empty
      if (!fs.existsSync(config.outputPath)) {
        throw new Error(`Export finished but output file was not found at ${config.outputPath}`);
      }

      const stat = fs.statSync(config.outputPath);
      if (stat.size === 0) {
        throw new Error('Export produced an empty (0 bytes) file. Check codec settings.');
      }

      return { success: true, outputPath: config.outputPath, size: stat.size };
    } catch (error) {
      if (this._cancelled) {
        return { cancelled: true };
      }
      throw error;
    } finally {
      // Clean up temporary files created during this export session
      for (const f of createdTempFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch (e) {
          console.warn('[ExportEngine] Failed to delete temp file:', f, e.message);
        }
      }
    }
  }

  /**
   * Cancel the current export
   */
  cancelExport() {
    this._cancelled = true;
    this.ffmpegEngine.cancelAll();
  }

  /**
   * Temporary cache directory for export data assets
   */
  _getExportTempDir() {
    let baseDir;
    try {
      const { app } = require('electron');
      baseDir = app && app.getPath ? app.getPath('userData') : path.join(__dirname, '..', '..');
    } catch {
      baseDir = path.join(__dirname, '..', '..');
    }
    const tempDir = path.join(baseDir, 'cache', 'export_tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
  }

  /**
   * Resolve a clip's source path (handling data: URLs and file:/// protocol)
   */
  _resolveClipSource(clip, tempDir, createdTempFiles) {
    const p = clip.sourcePath || '';

    // Handle data: URLs (such as sample images or sample audio)
    if (p.startsWith('data:')) {
      const match = p.match(/^data:([^;]+);base64,(.*)$/);
      let ext = '.png';
      if (match) {
        const mime = match[1].toLowerCase();
        if (mime.includes('wav')) ext = '.wav';
        else if (mime.includes('mp3') || mime.includes('mpeg')) ext = '.mp3';
        else if (mime.includes('jpeg') || mime.includes('jpg')) ext = '.jpg';
        else if (mime.includes('webp')) ext = '.webp';
        else if (mime.includes('mp4')) ext = '.mp4';
      }

      const base64Data = match ? match[2] : p.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const tempPath = path.join(tempDir, `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`);
      fs.writeFileSync(tempPath, buffer);
      createdTempFiles.push(tempPath);
      return tempPath;
    }

    // Handle file:// URIs
    if (p.startsWith('file://')) {
      let clean = decodeURIComponent(p.replace(/^file:\/\/\/?/, ''));
      if (process.platform === 'win32' && /^[a-zA-Z]:/.test(clean)) {
        return clean.replace(/\//g, '\\');
      }
      return '/' + clean;
    }

    return p;
  }

  /**
   * Build FFmpeg configuration from export settings
   */
  async _buildFFmpegConfig(config, createdTempFiles) {
    let {
      clips = [],
      outputPath,
      format = 'mp4',
      resolution = '1920x1080',
      fps = 30,
      quality = 'high',
      videoCodec,
      audioCodec,
      videoBitrate,
      audioBitrate = '192k',
      totalDuration = 0,
      hwAccel = false
    } = config;

    // If project object was passed without separate clips, extract from tracks
    if ((!clips || clips.length === 0) && config.project?.tracks) {
      const prjTracks = config.project.tracks || [];
      clips = [];
      for (const t of prjTracks) {
        if (!t.visible && t.type === 'video') continue;
        for (const c of t.clips || []) {
          clips.push({
            ...c,
            trackType: t.type,
            trackMuted: !!t.muted
          });
        }
      }
    }

    const tempDir = this._getExportTempDir();

    // Resolve source paths for all clips
    for (const clip of clips) {
      clip._resolvedPath = this._resolveClipSource(clip, tempDir, createdTempFiles);
    }

    // Parse resolution
    let [width, height] = (resolution || '1920x1080').split('x').map(n => parseInt(n, 10));
    if (isNaN(width) || isNaN(height)) {
      width = 1920;
      height = 1080;
    }

    // Calculate duration
    const calculatedDuration = clips.reduce((max, c) => Math.max(max, (c.startTime || 0) + (c.duration || 0)), 0);
    const duration = Math.max(calculatedDuration, totalDuration || 0);

    if (duration <= 0) {
      throw new Error('Timeline is empty or has zero duration.');
    }

    // Classify clips
    const visualClips = clips.filter(c => c.mediaType === 'video' || c.mediaType === 'image');
    const audioClips = clips.filter(c => c.mediaType === 'audio' || (c.mediaType === 'video' && !c.trackMuted));

    // Determine codecs based on format
    let vCodec = videoCodec;
    let aCodec = audioCodec;

    if (!vCodec) {
      switch (format) {
        case 'mp4':
          vCodec = hwAccel ? 'h264_nvenc' : 'libx264';
          break;
        case 'webm':
          vCodec = 'libvpx-vp9';
          break;
        case 'mov':
          vCodec = 'libx264';
          break;
        case 'gif':
          vCodec = 'gif';
          break;
        default:
          vCodec = 'libx264';
      }
    }

    if (!aCodec) {
      switch (format) {
        case 'mp4':
        case 'mov':
          aCodec = 'aac';
          break;
        case 'webm':
          aCodec = 'libopus';
          break;
        default:
          aCodec = 'aac';
      }
    }

    // Quality presets
    let crf = 20;
    let preset = 'medium';

    switch (quality) {
      case 'ultra':
        crf = 16;
        preset = 'slow';
        break;
      case 'high':
        crf = 20;
        preset = 'medium';
        break;
      case 'medium':
        crf = 26;
        preset = 'fast';
        break;
      case 'low':
        crf = 32;
        preset = 'ultrafast';
        break;
    }

    const inputs = [];
    const filterParts = [];
    const maps = [];

    // Input 0: Base project canvas background
    inputs.push({
      argsBefore: ['-f', 'lavfi'],
      path: `color=c=black:s=${width}x${height}:r=${fps}:d=${duration}`
    });

    // Add visual inputs
    visualClips.forEach((vClip, idx) => {
      const inObj = {
        path: vClip._resolvedPath,
        duration: vClip.duration,
        argsBefore: []
      };

      if (vClip.mediaType === 'image') {
        inObj.argsBefore.push('-loop', '1');
      } else if (vClip.mediaType === 'video') {
        if (vClip.sourceStartTime && vClip.sourceStartTime > 0) {
          inObj.startTime = vClip.sourceStartTime;
        }
      }
      inputs.push(inObj);
    });

    // Build visual filter graph (scale, pad, and timeline overlay)
    let currentBg = '0:v';
    visualClips.forEach((vClip, idx) => {
      const inIdx = idx + 1;
      const vLabel = `v${idx}`;
      const nextBg = idx === visualClips.length - 1 ? 'outv' : `bg${idx + 1}`;
      const startTime = vClip.startTime || 0;
      const endTime = startTime + vClip.duration;

      filterParts.push(
        `[${inIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},setpts=PTS-STARTPTS+${startTime}/TB[${vLabel}]`
      );
      filterParts.push(
        `[${currentBg}][${vLabel}]overlay=0:0:enable='between(t,${startTime},${endTime})'[${nextBg}]`
      );
      currentBg = nextBg;
    });

    if (visualClips.length === 0) {
      filterParts.push(`[0:v]copy[outv]`);
    }

    // Audio inputs and filter graph
    const audioStreamLabels = [];

    // Check audio clips and probe for valid audio streams
    for (let i = 0; i < audioClips.length; i++) {
      const aClip = audioClips[i];

      // If it's a video clip, probe to see if it actually has an audio stream
      if (aClip.mediaType === 'video') {
        try {
          const probeRes = await this.ffmpegEngine.probe(aClip._resolvedPath);
          if (!probeRes || !probeRes.audio) {
            continue; // Skip video clips that have no audio track
          }
        } catch (e) {
          console.warn('[ExportEngine] Probe failed for audio check on clip:', aClip._resolvedPath);
          continue;
        }
      }

      // Add audio input
      const aInputIdx = inputs.length;
      const inObj = {
        path: aClip._resolvedPath,
        duration: aClip.duration
      };
      if (aClip.sourceStartTime && aClip.sourceStartTime > 0) {
        inObj.startTime = aClip.sourceStartTime;
      }
      inputs.push(inObj);

      const aLabel = `aud_${i}`;
      const delayMs = Math.max(0, Math.round((aClip.startTime || 0) * 1000));
      const vol = Math.max(0, aClip.volume !== undefined ? aClip.volume : 1);

      filterParts.push(
        `[${aInputIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${delayMs}|${delayMs},volume=${vol}[${aLabel}]`
      );
      audioStreamLabels.push(`[${aLabel}]`);
    }

    // Combine or generate audio streams
    if (format !== 'gif') {
      if (audioStreamLabels.length > 1) {
        filterParts.push(
          `${audioStreamLabels.join('')}amix=inputs=${audioStreamLabels.length}:dropout_transition=0:normalize=0[outa]`
        );
      } else if (audioStreamLabels.length === 1) {
        filterParts.push(`${audioStreamLabels[0]}aformat=sample_rates=44100:channel_layouts=stereo[outa]`);
      } else {
        // Fallback silent audio track for universal container playback
        filterParts.push(`anullsrc=r=44100:cl=stereo:d=${duration}[outa]`);
      }
    }

    maps.push('[outv]');
    if (format !== 'gif') {
      maps.push('[outa]');
    }

    // Additional flags
    const flags = [];
    if (format === 'mp4') {
      flags.push('-movflags', '+faststart'); // Enable web streaming
    }
    if (format === 'gif') {
      flags.push('-loop', '0');
    }
    flags.push('-t', String(duration));

    return {
      inputs,
      outputPath,
      filterComplex: filterParts.join(';'),
      maps,
      videoCodec: vCodec,
      audioCodec: format === 'gif' ? undefined : aCodec,
      crf: format === 'gif' ? undefined : crf,
      preset: format === 'gif' ? undefined : preset,
      videoBitrate: videoBitrate || undefined,
      audioBitrate: format === 'gif' ? undefined : audioBitrate,
      resolution: `${width}x${height}`,
      fps,
      pixelFormat: format === 'gif' ? undefined : 'yuv420p',
      flags,
      totalDuration: duration
    };
  }

  /**
   * Get available hardware encoders
   */
  async getAvailableEncoders() {
    const encoders = {
      'libx264': { name: 'H.264 (CPU)', available: true },
      'libx265': { name: 'H.265/HEVC (CPU)', available: true },
      'libvpx-vp9': { name: 'VP9 (CPU)', available: true }
    };

    // Check for hardware encoders
    try {
      const nvencResult = await this._checkEncoder('h264_nvenc');
      if (nvencResult) {
        encoders['h264_nvenc'] = { name: 'H.264 (NVIDIA NVENC)', available: true };
        encoders['hevc_nvenc'] = { name: 'H.265 (NVIDIA NVENC)', available: true };
      }
      const qsvResult = await this._checkEncoder('h264_qsv');
      if (qsvResult) {
        encoders['h264_qsv'] = { name: 'H.264 (Intel QSV)', available: true };
        encoders['hevc_qsv'] = { name: 'H.265 (Intel QSV)', available: true };
      }
      const amfResult = await this._checkEncoder('h264_amf');
      if (amfResult) {
        encoders['h264_amf'] = { name: 'H.264 (AMD AMF)', available: true };
        encoders['hevc_amf'] = { name: 'H.265 (AMD AMF)', available: true };
      }
    } catch {
      // Hardware encoders not available
    }

    return encoders;
  }

  async _checkEncoder(encoderName) {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const proc = spawn(this.ffmpegEngine.ffmpegPath, [
        '-f', 'lavfi', '-i', 'nullsrc=s=256x256:d=1',
        '-c:v', encoderName,
        '-f', 'null', '-'
      ]);

      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }
}

module.exports = { ExportEngine };
