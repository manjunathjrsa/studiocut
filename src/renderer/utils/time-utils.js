/**
 * StudioCut — Time Utilities
 * Timecode formatting, conversion, and frame calculations
 */

const TimeUtils = {
  /**
   * Convert seconds to timecode string (HH:MM:SS:FF)
   */
  secondsToTimecode(seconds, fps = 30) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;

    const totalFrames = Math.floor(seconds * fps);
    const frames = totalFrames % fps;
    const totalSeconds = Math.floor(seconds);
    const secs = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);

    return [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(secs).padStart(2, '0'),
      String(frames).padStart(2, '0')
    ].join(':');
  },

  /**
   * Convert timecode string to seconds
   */
  timecodeToSeconds(timecode, fps = 30) {
    const parts = timecode.split(':').map(Number);
    if (parts.length !== 4) return 0;

    const [hours, minutes, seconds, frames] = parts;
    return hours * 3600 + minutes * 60 + seconds + frames / fps;
  },

  /**
   * Convert seconds to a shorter display format (MM:SS)
   */
  secondsToShort(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  },

  /**
   * Convert seconds to human-readable duration
   */
  secondsToHuman(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  },

  /**
   * Snap time to nearest frame boundary
   */
  snapToFrame(seconds, fps = 30) {
    return Math.round(seconds * fps) / fps;
  },

  /**
   * Get frame number from seconds
   */
  secondsToFrames(seconds, fps = 30) {
    return Math.round(seconds * fps);
  },

  /**
   * Get seconds from frame number
   */
  framesToSeconds(frames, fps = 30) {
    return frames / fps;
  },

  /**
   * Format file size to human readable
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  },

  /**
   * Calculate the ruler mark intervals based on zoom level
   */
  getRulerInterval(pixelsPerSecond) {
    return this.getRulerIntervals(pixelsPerSecond);
  },

  getRulerIntervals(pixelsPerSecond) {
    const intervals = [
      { threshold: 500, major: 0.1, minor: 0.01 },
      { threshold: 200, major: 0.5, minor: 0.1 },
      { threshold: 100, major: 1, minor: 0.5 },
      { threshold: 50, major: 2, minor: 1 },
      { threshold: 20, major: 5, minor: 1 },
      { threshold: 10, major: 10, minor: 5 },
      { threshold: 5, major: 30, minor: 10 },
      { threshold: 2, major: 60, minor: 30 },
      { threshold: 0, major: 300, minor: 60 }
    ];

    for (const interval of intervals) {
      if (pixelsPerSecond >= interval.threshold) {
        return interval;
      }
    }
    return intervals[intervals.length - 1];
  }
};

window.TimeUtils = TimeUtils;
