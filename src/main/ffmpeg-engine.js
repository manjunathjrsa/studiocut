/**
 * StudioCut — FFmpeg Engine
 * Handles all FFmpeg operations: probing, thumbnails, frame extraction, proxy generation
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

class FFmpegEngine {
  constructor() {
    this.ffmpegPath = null;
    this.ffprobePath = null;
    this.activeProcesses = new Map();
    this._initializePaths();
  }

  /**
   * Initialize FFmpeg/FFprobe binary paths
   * Uses @ffmpeg-installer and @ffprobe-installer packages
   */
  _initializePaths() {
    try {
      this.ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
      this.ffprobePath = require('@ffprobe-installer/ffprobe').path;
      console.log('[FFmpeg] Binary found:', this.ffmpegPath);
      console.log('[FFprobe] Binary found:', this.ffprobePath);
    } catch (error) {
      console.error('[FFmpeg] Failed to locate binaries:', error.message);
      // Fallback: try system PATH
      this.ffmpegPath = 'ffmpeg';
      this.ffprobePath = 'ffprobe';
    }
  }

  /**
   * Probe a media file and return its metadata
   */
  async probe(filePath) {
    return new Promise((resolve) => {
      const ext = path.extname(filePath).toLowerCase();
      const isImg = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'].includes(ext);
      const isAud = ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.wma', '.m4a'].includes(ext);

      const fallbackResult = {
        filePath,
        fileName: path.basename(filePath),
        fileSize: 0,
        mediaType: isImg ? 'image' : isAud ? 'audio' : 'video',
        duration: isImg ? 5 : 10,
        bitrate: 0,
        formatName: ext.replace('.', ''),
        formatLongName: ext.toUpperCase(),
        video: {
          codec: ext.toUpperCase(),
          width: 1920,
          height: 1080,
          fps: 30
        }
      };

      let settled = false;
      let proc = null;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (proc) {
            try { proc.kill(); } catch (e) {}
          }
          console.warn(`[FFprobe] Timed out for "${filePath}", using fallback metadata`);
          resolve(fallbackResult);
        }
      }, 3000);

      try {
        const args = [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          filePath
        ];

        proc = spawn(this.ffprobePath, args);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
          if (settled) return;
          clearTimeout(timer);
          settled = true;

          if (code !== 0) {
            console.warn(`[FFprobe] Non-zero exit (${code}) for "${filePath}":`, stderr);
            resolve(fallbackResult);
            return;
          }

          try {
            const data = JSON.parse(stdout);
            const result = this._parseProbeData(data, filePath);
            resolve(result);
          } catch (e) {
            console.warn(`[FFprobe] JSON parse failure for "${filePath}":`, e.message);
            resolve(fallbackResult);
          }
        });

        proc.on('error', (err) => {
          if (settled) return;
          clearTimeout(timer);
          settled = true;
          console.warn(`[FFprobe] Process start error for "${filePath}":`, err.message);
          resolve(fallbackResult);
        });
      } catch (err) {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          resolve(fallbackResult);
        }
      }
    });
  }

  /**
   * Parse FFprobe JSON output into a clean metadata object
   */
  _parseProbeData(data, filePath) {
    const format = data.format || {};
    const streams = data.streams || [];

    const videoStream = streams.find(s => s.codec_type === 'video');
    const audioStream = streams.find(s => s.codec_type === 'audio');

    const ext = path.extname(filePath).toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'];
    const audioExtensions = ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.wma', '.m4a'];

    let mediaType = 'video';
    if (imageExtensions.includes(ext)) mediaType = 'image';
    else if (audioExtensions.includes(ext) || (!videoStream && audioStream)) mediaType = 'audio';

    const result = {
      filePath,
      fileName: path.basename(filePath),
      fileSize: parseInt(format.size) || 0,
      mediaType,
      duration: parseFloat(format.duration) || 0,
      bitrate: parseInt(format.bit_rate) || 0,
      formatName: format.format_name || 'unknown',
      formatLongName: format.format_long_name || 'unknown'
    };

    if (videoStream) {
      result.video = {
        codec: videoStream.codec_name,
        codecLongName: videoStream.codec_long_name,
        width: videoStream.width,
        height: videoStream.height,
        fps: this._parseFps(videoStream.r_frame_rate || videoStream.avg_frame_rate),
        pixelFormat: videoStream.pix_fmt,
        bitrate: parseInt(videoStream.bit_rate) || 0,
        rotation: this._getRotation(videoStream)
      };
    }

    if (audioStream) {
      result.audio = {
        codec: audioStream.codec_name,
        codecLongName: audioStream.codec_long_name,
        sampleRate: parseInt(audioStream.sample_rate) || 0,
        channels: audioStream.channels,
        channelLayout: audioStream.channel_layout,
        bitrate: parseInt(audioStream.bit_rate) || 0
      };
    }

    return result;
  }

  _parseFps(fpsString) {
    if (!fpsString) return 30;
    const parts = fpsString.split('/');
    if (parts.length === 2) {
      return Math.round((parseInt(parts[0]) / parseInt(parts[1])) * 100) / 100;
    }
    return parseFloat(fpsString) || 30;
  }

  _getRotation(stream) {
    if (stream.tags && stream.tags.rotate) {
      return parseInt(stream.tags.rotate);
    }
    // Check side_data for rotation
    if (stream.side_data_list) {
      const rotData = stream.side_data_list.find(d => d.rotation !== undefined);
      if (rotData) return Math.abs(rotData.rotation);
    }
    return 0;
  }

  /**
   * Generate thumbnails for a video file
   */
  async generateThumbnails(filePath, count = 10, outputDir) {
    if (!outputDir) {
      const cacheDir = this._getCacheDir();
      const fileHash = this._hashString(filePath);
      outputDir = path.join(cacheDir, 'thumbnails', fileHash);
    }

    await fs.promises.mkdir(outputDir, { recursive: true });

    // First probe to get duration
    const metadata = await this.probe(filePath);
    const duration = metadata.duration;
    if (duration <= 0) return [];

    const interval = duration / (count + 1);
    const thumbnails = [];

    for (let i = 1; i <= count; i++) {
      const timestamp = interval * i;
      const outputPath = path.join(outputDir, `thumb_${String(i).padStart(4, '0')}.jpg`);

      try {
        await this._extractSingleFrame(filePath, timestamp, outputPath, 160, 90);
        thumbnails.push({
          index: i - 1,
          timestamp,
          path: outputPath
        });
      } catch (err) {
        console.warn(`[FFmpeg] Failed to extract thumbnail ${i}:`, err.message);
      }
    }

    return thumbnails;
  }

  /**
   * Extract a single frame from a video
   */
  async extractFrame(filePath, timestamp, outputPath) {
    await this._extractSingleFrame(filePath, timestamp, outputPath);
    return { success: true, path: outputPath };
  }

  async _extractSingleFrame(filePath, timestamp, outputPath, width, height) {
    return new Promise((resolve, reject) => {
      const args = [
        '-ss', String(timestamp),
        '-i', filePath,
        '-vframes', '1',
        '-q:v', '3'
      ];

      if (width && height) {
        args.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease`);
      }

      args.push('-y', outputPath);

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Frame extraction failed: ${stderr}`));
        } else {
          resolve(outputPath);
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Generate waveform data for an audio/video file
   */
  async generateWaveformData(filePath, outputPath) {
    if (!outputPath) {
      const cacheDir = this._getCacheDir();
      const fileHash = this._hashString(filePath);
      outputPath = path.join(cacheDir, 'waveforms', `${fileHash}.json`);
    }

    const dir = path.dirname(outputPath);
    await fs.promises.mkdir(dir, { recursive: true });

    return new Promise((resolve, reject) => {
      // Generate raw PCM data and sample it
      const args = [
        '-i', filePath,
        '-ac', '1',           // mono
        '-ar', '8000',        // 8kHz sample rate (enough for waveform visualization)
        '-f', 's16le',        // signed 16-bit little-endian
        '-acodec', 'pcm_s16le',
        'pipe:1'
      ];

      const proc = spawn(this.ffmpegPath, args);
      const chunks = [];
      let stderr = '';

      proc.stdout.on('data', (data) => { chunks.push(data); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`Waveform generation failed: ${stderr}`));
          return;
        }

        try {
          const buffer = Buffer.concat(chunks);
          const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

          // Downsample to ~500 points for visualization
          const targetPoints = 500;
          const samplesPerPoint = Math.max(1, Math.floor(samples.length / targetPoints));
          const waveformData = [];

          for (let i = 0; i < samples.length; i += samplesPerPoint) {
            let min = 32767;
            let max = -32768;
            const end = Math.min(i + samplesPerPoint, samples.length);

            for (let j = i; j < end; j++) {
              if (samples[j] < min) min = samples[j];
              if (samples[j] > max) max = samples[j];
            }

            waveformData.push({
              min: min / 32768,
              max: max / 32768
            });
          }

          const result = { sampleRate: 8000, points: waveformData };
          await fs.promises.writeFile(outputPath, JSON.stringify(result));
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to process waveform data: ${e.message}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Create a lower-resolution proxy file for smooth editing
   */
  async createProxy(filePath, outputPath) {
    if (!outputPath) {
      const cacheDir = this._getCacheDir();
      const fileHash = this._hashString(filePath);
      outputPath = path.join(cacheDir, 'proxies', `${fileHash}_proxy.mp4`);
    }

    const dir = path.dirname(outputPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Check if proxy already exists
    try {
      await fs.promises.access(outputPath);
      return { success: true, path: outputPath, cached: true };
    } catch {
      // doesn't exist, generate it
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-i', filePath,
        '-vf', 'scale=854:480:force_original_aspect_ratio=decrease',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-y',
        outputPath
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Proxy creation failed: ${stderr}`));
        } else {
          resolve({ success: true, path: outputPath, cached: false });
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Build an FFmpeg command for final export
   */
  buildExportCommand(config) {
    const args = [];

    // Input files
    for (const input of config.inputs) {
      if (input.argsBefore && Array.isArray(input.argsBefore)) {
        args.push(...input.argsBefore);
      }
      if (input.startTime !== undefined && input.startTime > 0) {
        args.push('-ss', String(input.startTime));
      }
      if (input.duration !== undefined && input.duration > 0) {
        args.push('-t', String(input.duration));
      }
      args.push('-i', input.path);
    }

    // Complex filter graph
    if (config.filterComplex) {
      args.push('-filter_complex', config.filterComplex);
    }

    // Map outputs
    if (config.maps) {
      for (const map of config.maps) {
        args.push('-map', map);
      }
    }

    // Video codec
    if (config.videoCodec) {
      args.push('-c:v', config.videoCodec);

      if (config.videoBitrate) args.push('-b:v', config.videoBitrate);
      if (config.crf !== undefined) args.push('-crf', String(config.crf));
      if (config.preset) args.push('-preset', config.preset);
      if (config.pixelFormat) args.push('-pix_fmt', config.pixelFormat);
    }

    // Audio codec
    if (config.audioCodec) {
      args.push('-c:a', config.audioCodec);
      if (config.audioBitrate) args.push('-b:a', config.audioBitrate);
      if (config.audioSampleRate) args.push('-ar', String(config.audioSampleRate));
    }

    // Resolution (if not already handled in filter graph)
    if (config.resolution && !config.filterComplex) {
      args.push('-s', config.resolution);
    }

    // FPS (if not already handled in filter graph)
    if (config.fps && !config.filterComplex) {
      args.push('-r', String(config.fps));
    }

    // Additional flags
    if (config.flags) {
      args.push(...config.flags);
    }

    // Overwrite output
    args.push('-y', config.outputPath);

    return { command: this.ffmpegPath, args };
  }

  /**
   * Run an FFmpeg export with progress reporting
   */
  async runExport(config, onProgress) {
    const { command, args } = this.buildExportCommand(config);
    const totalDuration = config.totalDuration || 0;

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      const processId = Date.now().toString();
      this.activeProcesses.set(processId, proc);

      let stderr = '';

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Parse progress from FFmpeg output
        const timeMatch = chunk.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch && onProgress && totalDuration > 0) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseInt(timeMatch[3]);
          const centiseconds = parseInt(timeMatch[4]);
          const currentTime = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
          const progress = Math.min(currentTime / totalDuration, 1);
          const percent = Math.round(progress * 100);

          onProgress({
            progress,
            percent,
            currentTime,
            totalDuration,
            percentage: percent
          });
        }
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(processId);
        if (code !== 0) {
          reject(new Error(`Export failed (code ${code}): ${stderr.slice(-500)}`));
        } else {
          if (onProgress) {
            onProgress({ progress: 1, percent: 100, percentage: 100, totalDuration, currentTime: totalDuration });
          }
          resolve({ success: true, outputPath: config.outputPath });
        }
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(processId);
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Cancel all active FFmpeg processes
   */
  cancelAll() {
    for (const [id, proc] of this.activeProcesses) {
      proc.kill('SIGTERM');
      this.activeProcesses.delete(id);
    }
  }

  _getCacheDir() {
    try {
      const { app } = require('electron');
      if (app && app.getPath) {
        return path.join(app.getPath('userData'), 'cache');
      }
    } catch {}
    return path.join(__dirname, '..', '..', 'cache');
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}

module.exports = { FFmpegEngine };
