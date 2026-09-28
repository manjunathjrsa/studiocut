/**
 * StudioCut — Snap Engine
 * Magnetic snapping calculations for playhead, clip boundaries, and markers
 */

class SnapEngine {
  constructor() {
    this.thresholdPixels = 10;
  }

  /**
   * Collect all snap points in the project
   * @param {string[]} excludeClipIds - clips currently being dragged/modified
   * @returns {Array<{ time: number, type: string, label: string }>}
   */
  getSnapPoints(excludeClipIds = []) {
    const points = [];
    const state = store.getState();
    const excludeSet = new Set(excludeClipIds);

    // 1. Timeline start (0)
    points.push({ time: 0, type: 'origin', label: '00:00:00:00' });

    // 2. Playhead
    const playheadTime = state.playback.currentTime;
    points.push({ time: playheadTime, type: 'playhead', label: 'Playhead' });

    // 3. Markers
    for (const marker of state.markers || []) {
      points.push({ time: marker.time, type: 'marker', label: marker.name || 'Marker' });
    }

    // 4. Clips boundaries (start & end)
    for (const track of state.tracks || []) {
      if (track.locked) continue;
      for (const clip of track.clips || []) {
        if (excludeSet.has(clip.id)) continue;
        points.push({ time: clip.startTime, type: 'clip-start', label: clip.name });
        points.push({ time: clip.startTime + clip.duration, type: 'clip-end', label: clip.name });
      }
    }

    return points;
  }

  /**
   * Find nearest snap target for a given target time (and optional clip duration)
   * @param {number} targetTime - Proposed start time
   * @param {number} clipDuration - Duration of the moving clip (checks both start and end)
   * @param {number} zoom - Pixels per second
   * @param {string[]} excludeClipIds - IDs to ignore
   * @returns {{ snappedTime: number, snapDelta: number, targetPoint: object } | null}
   */
  snap(targetTime, clipDuration = 0, zoom = 50, excludeClipIds = []) {
    if (!store.get('timeline.snapEnabled')) return null;

    const thresholdSeconds = this.thresholdPixels / Math.max(1, zoom);
    const snapPoints = this.getSnapPoints(excludeClipIds);

    let closest = null;
    let minDistance = thresholdSeconds;

    for (const pt of snapPoints) {
      // Check start edge snapping
      const distStart = Math.abs(targetTime - pt.time);
      if (distStart < minDistance) {
        minDistance = distStart;
        closest = {
          snappedTime: Math.max(0, pt.time),
          snapDelta: pt.time - targetTime,
          targetPoint: pt,
          edge: 'start'
        };
      }

      // If moving a clip with known duration, also check its end edge
      if (clipDuration > 0) {
        const proposedEnd = targetTime + clipDuration;
        const distEnd = Math.abs(proposedEnd - pt.time);
        if (distEnd < minDistance) {
          minDistance = distEnd;
          closest = {
            snappedTime: Math.max(0, pt.time - clipDuration),
            snapDelta: (pt.time - clipDuration) - targetTime,
            targetPoint: pt,
            edge: 'end'
          };
        }
      }
    }

    return closest;
  }

  // ═══════════════════════════════════════════
  // Visual Snap Line Indicator
  // ═══════════════════════════════════════════

  /**
   * Show a visual snap guide line on the timeline at a snapped position
   */
  showSnapIndicator(time, zoom, scrollX) {
    let indicator = document.getElementById('snapIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'snapIndicator';
      indicator.className = 'snap-indicator';
      const tracksContainer = document.getElementById('timelineTracks');
      if (tracksContainer) {
        tracksContainer.appendChild(indicator);
      } else {
        return;
      }
    }

    const pixelX = (time * zoom) - scrollX;
    indicator.style.left = `${pixelX}px`;
    indicator.style.display = 'block';
    indicator.style.opacity = '1';

    // Auto-hide after a short delay
    clearTimeout(this._snapTimeout);
    this._snapTimeout = setTimeout(() => this.hideSnapIndicator(), 600);
  }

  hideSnapIndicator() {
    const indicator = document.getElementById('snapIndicator');
    if (indicator) {
      indicator.style.opacity = '0';
      setTimeout(() => {
        if (indicator) indicator.style.display = 'none';
      }, 200);
    }
  }
}

window.snapEngine = new SnapEngine();
