/**
 * StudioCut — Track Renderer
 * Handles track background rendering on canvas and track header DOM controls
 */

class TrackRenderer {
  constructor() {
    this.container = null;
  }

  init() {
    this.container = document.getElementById('trackHeaders');
    this._bindEvents();
    this.updateHeaders();
  }

  _bindEvents() {
    if (!this.container) return;

    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.track-header__btn');
      const header = e.target.closest('.track-header');
      if (!header) return;

      const trackId = header.dataset.trackId;
      if (!trackId) return;

      if (btn) {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'mute') Actions.toggleTrackMute(trackId);
        else if (action === 'solo') Actions.toggleTrackSolo(trackId);
        else if (action === 'lock') Actions.toggleTrackLock(trackId);
        else if (action === 'visible') Actions.toggleTrackVisibility(trackId);
        else if (action === 'delete') Actions.removeTrack(trackId);
        else if (action === 'target') {
          const track = (store.get('tracks') || []).find(t => t.id === trackId);
          if (track) {
            Actions.setTargetTrack(track.type, trackId);
            window.app?.showToast(`Targeted ${track.name} for edits`);
          }
        }
        return;
      }

      // Track height resize handle
      const resizer = e.target.closest('.track-header__resizer');
      if (resizer) {
        e.stopPropagation();
        const tracks = store.get('tracks') || [];
        const track = tracks.find(t => t.id === trackId);
        if (!track) return;
        const startY = e.clientY;
        const initialHeight = track.height || 64;
        const onMouseMove = (moveEvent) => {
          const delta = moveEvent.clientY - startY;
          Actions.setTrackHeight(trackId, initialHeight + delta);
        };
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          window.timelineEngine?.requestRender();
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return;
      }

      // Selecting track
      store.set('selection.trackId', trackId);
      this.updateHeaders();
    });
  }

  /**
   * Render track headers in the DOM
   */
  updateHeaders() {
    if (!this.container) {
      this.container = document.getElementById('trackHeaders');
    }
    if (!this.container) return;
    const tracks = store.get('tracks') || [];
    const selectedTrackId = store.get('selection.trackId');

    let html = '';
    for (const track of tracks) {
      const isSelected = track.id === selectedTrackId;
      const typeClass = `track-header__color--${track.type}`;

      const targetVideoId = store.get('timeline.targetVideoTrack');
      const targetAudioId = store.get('timeline.targetAudioTrack');
      const isTargeted = track.type === 'video'
        ? (targetVideoId ? targetVideoId === track.id : track === tracks.find(t => t.type === 'video'))
        : (targetAudioId ? targetAudioId === track.id : track === tracks.find(t => t.type === 'audio'));

      html += `
        <div class="track-header ${isSelected ? 'selected' : ''}"
             data-track-id="${track.id}"
             style="height:${track.height}px; position:relative;">
          <div class="track-header__color ${typeClass}" style="${track.color ? `background:${track.color}` : ''}"></div>
          <button class="track-header__btn track-header__target-btn ${isTargeted ? 'active' : ''}"
                  data-action="target"
                  title="Target track for 3-Point Insert/Overwrite (${track.type.toUpperCase()})"
                  style="font-size:9px; font-weight:800; width:20px; height:20px; padding:0; margin-right:4px; ${isTargeted ? 'background:var(--accent-primary); color:#fff; border-color:var(--accent-primary);' : 'opacity:0.6;'}">
            ${track.type === 'video' ? 'V' : 'A'}
          </button>
          <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; overflow:hidden;">
            <span class="track-header__name" title="${track.name}">${track.name}</span>
            <span style="font-size:9px; color:var(--text-tertiary);">${track.clips ? track.clips.length : 0} clip(s)</span>
          </div>
          <div class="track-header__controls">
            <button class="track-header__btn ${track.visible ? 'active' : ''}"
                    data-action="visible"
                    title="${track.visible ? 'Hide track' : 'Show track'}">
              ${track.visible ? '👁' : '🚫'}
            </button>
            <button class="track-header__btn ${track.solo ? 'active' : ''}"
                    data-action="solo"
                    title="${track.solo ? 'Unsolo track' : 'Solo track'}"
                    style="${track.solo ? 'background:var(--accent-warning); color:#000; font-weight:700;' : ''}">
              S
            </button>
            <button class="track-header__btn ${track.muted ? 'muted' : ''}"
                    data-action="mute"
                    title="${track.muted ? 'Unmute' : 'Mute'}">
              ${track.muted ? '🔇' : '🔊'}
            </button>
            <button class="track-header__btn ${track.locked ? 'locked' : ''}"
                    data-action="lock"
                    title="${track.locked ? 'Unlock' : 'Lock'}"
                    style="${track.locked ? 'color:var(--accent-danger);' : ''}">
              ${track.locked ? '🔒' : '🔓'}
            </button>
          </div>
          <div class="track-header__resizer" data-track-id="${track.id}" style="position:absolute; bottom:0; left:0; right:0; height:5px; cursor:row-resize; z-index:5;" title="Drag to resize track height"></div>
        </div>
      `;
    }

    // Add Track button at bottom
    html += `
      <div style="padding: 8px; display: flex; gap: 4px;">
        <button class="btn btn--ghost btn--sm" id="btnAddVideoTrack" style="flex:1; font-size:10px;" title="Add Video Track">+ Video</button>
        <button class="btn btn--ghost btn--sm" id="btnAddAudioTrack" style="flex:1; font-size:10px;" title="Add Audio Track">+ Audio</button>
      </div>
    `;

    this.container.innerHTML = html;

    // Attach listeners for add buttons
    const btnAddVideo = document.getElementById('btnAddVideoTrack');
    const btnAddAudio = document.getElementById('btnAddAudioTrack');
    if (btnAddVideo) btnAddVideo.onclick = () => Actions.addTrack('video');
    if (btnAddAudio) btnAddAudio.onclick = () => Actions.addTrack('audio');
  }

  /**
   * Render background lanes and separators for all tracks on canvas
   */
  renderTrackLanes(ctx, tracks, width, scrollY) {
    let currentY = -scrollY;

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const h = track.height;

      // Track alternating row background
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, currentY, width, h);

      // Track bottom border separator
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, currentY + h - 1, width, 1);

      // Locked overlay
      if (track.locked) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, currentY, width, h);
        // Diagonal stripes for locked track
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 2;
        for (let x = -h; x < width; x += 16) {
          ctx.beginPath();
          ctx.moveTo(x, currentY);
          ctx.lineTo(x + h, currentY + h);
          ctx.stroke();
        }
        ctx.restore();
      }

      currentY += h;
    }
  }

  /**
   * Get track info from Y coordinate (accounting for scrollY)
   */
  getTrackAtY(py, tracks, scrollY) {
    let currentY = -scrollY;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (py >= currentY && py < currentY + track.height) {
        return { track, index: i, trackY: currentY };
      }
      currentY += track.height;
    }
    return null;
  }

  /**
   * Get track top Y position
   */
  getTrackY(trackIndex, tracks, scrollY) {
    let y = -scrollY;
    for (let i = 0; i < trackIndex && i < tracks.length; i++) {
      y += tracks[i].height;
    }
    return y;
  }

  /**
   * Get total height of all tracks
   */
  getTotalHeight(tracks) {
    return tracks.reduce((sum, t) => sum + t.height, 0);
  }
}

window.trackRenderer = new TrackRenderer();
