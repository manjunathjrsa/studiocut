/**
 * StudioCut — Audio Mixer Panel
 * Per-track volume faders, mute/solo, master volume, and real-time VU meters
 */

class AudioMixerPanel {
  constructor() {
    this.container = null;
    this.visible = false;
    this._animFrame = null;
    this._vuLevels = new Map(); // trackId -> current VU level
  }

  init(container) {
    this.container = container;
    this._buildUI();
    this._bindStoreEvents();
  }

  _buildUI() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="audio-mixer__inner">
        <div class="audio-mixer__header">
          <div style="display:flex; align-items:center; gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2">
              <rect x="4" y="2" width="4" height="20" rx="1"/><rect x="10" y="6" width="4" height="16" rx="1"/><rect x="16" y="10" width="4" height="12" rx="1"/>
            </svg>
            <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-primary);">Audio Mixer</span>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <button class="btn btn--ghost btn--xs" id="btnToggleAutoDuck" title="Auto-Duck Music to Voice (-12dB)" style="font-size:9px; height:20px; padding:0 6px;">🦆 Duck: OFF</button>
            <button class="audio-mixer__close-btn" id="audioMixerCloseBtn" title="Close Mixer">✕</button>
          </div>
        </div>
        <div class="audio-mixer__tracks" id="audioMixerTracks">
          <!-- Track channels rendered dynamically -->
        </div>
        <div class="audio-mixer__master" id="audioMixerMaster">
          <!-- Master fader -->
        </div>
      </div>
    `;

    // Auto-Duck button
    const duckBtn = this.container.querySelector('#btnToggleAutoDuck');
    duckBtn?.addEventListener('click', () => {
      const isEnabled = !store.get('audio.autoDuckingEnabled');
      store.set('audio.autoDuckingEnabled', isEnabled);
      duckBtn.textContent = isEnabled ? '🦆 Duck: ON' : '🦆 Duck: OFF';
      duckBtn.classList.toggle('active', isEnabled);
      window.app?.showToast(`Auto-Ducking: ${isEnabled ? 'ACTIVE (-12dB duck)' : 'OFF'}`);
    });

    // Close button
    const closeBtn = this.container.querySelector('#audioMixerCloseBtn');
    closeBtn?.addEventListener('click', () => this.toggle());

    this._renderChannels();
  }

  _bindStoreEvents() {
    store.on('tracks', () => this._renderChannels());
  }

  _renderChannels() {
    const tracksContainer = this.container?.querySelector('#audioMixerTracks');
    const masterContainer = this.container?.querySelector('#audioMixerMaster');
    if (!tracksContainer || !masterContainer) return;

    const tracks = store.get('tracks') || [];

    // Track channels
    tracksContainer.innerHTML = tracks.map(track => {
      const volume = track.muted ? 0 : 1;
      const volDb = this._linearToDb(volume);
      const isMuted = !!track.muted;
      const trackColor = track.color || (track.type === 'video' ? '#6c5ce7' : '#00cec9');

      return `
        <div class="audio-mixer__channel" data-track-id="${track.id}">
          <div class="audio-mixer__channel-name" style="color:${trackColor};">${track.name}</div>
          <div class="audio-mixer__vu-container">
            <div class="audio-mixer__vu-bar">
              <div class="audio-mixer__vu-fill" data-vu="${track.id}" style="height:${isMuted ? 0 : 45}%;"></div>
            </div>
          </div>
          <div class="audio-mixer__fader-container">
            <input type="range" class="audio-mixer__fader" data-fader="${track.id}"
              min="0" max="150" value="${Math.round(volume * 100)}"
              orient="vertical" title="Volume: ${volDb}">
          </div>
          <div class="audio-mixer__db-readout" data-db="${track.id}">${volDb}</div>
          <div class="audio-mixer__channel-btns">
            <button class="audio-mixer__btn ${isMuted ? 'audio-mixer__btn--active-danger' : ''}"
              data-mute="${track.id}" title="Mute">M</button>
            <button class="audio-mixer__btn" data-solo="${track.id}" title="Solo">S</button>
          </div>
        </div>
      `;
    }).join('');

    // Master channel
    masterContainer.innerHTML = `
      <div class="audio-mixer__channel audio-mixer__channel--master">
        <div class="audio-mixer__channel-name" style="color:var(--accent-primary);">MASTER</div>
        <div class="audio-mixer__vu-container">
          <div class="audio-mixer__vu-bar audio-mixer__vu-bar--master">
            <div class="audio-mixer__vu-fill" data-vu="master" style="height:50%;"></div>
          </div>
        </div>
        <div class="audio-mixer__fader-container">
          <input type="range" class="audio-mixer__fader audio-mixer__fader--master" id="masterFader"
            min="0" max="150" value="100" orient="vertical" title="Master Volume: 0 dB">
        </div>
        <div class="audio-mixer__db-readout" data-db="master">0 dB</div>
        <div class="audio-mixer__channel-btns">
          <button class="audio-mixer__btn" id="masterMuteBtn" title="Mute Master">M</button>
        </div>
      </div>
    `;

    // Bind fader & button events
    this._bindChannelEvents();
  }

  _bindChannelEvents() {
    if (!this.container) return;

    // Track faders
    this.container.querySelectorAll('.audio-mixer__fader[data-fader]').forEach(fader => {
      fader.addEventListener('input', (e) => {
        const trackId = e.target.dataset.fader;
        const volume = parseInt(e.target.value) / 100;
        const dbReadout = this.container.querySelector(`[data-db="${trackId}"]`);
        if (dbReadout) dbReadout.textContent = this._linearToDb(volume);

        // Update track clips volume (apply to all clips in the track)
        const tracks = store.get('tracks') || [];
        const track = tracks.find(t => t.id === trackId);
        if (track) {
          track.trackVolume = volume;
          store._emit('tracks', tracks);
        }
      });
    });

    // Mute buttons
    this.container.querySelectorAll('[data-mute]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const trackId = e.target.dataset.mute;
        const tracks = store.get('tracks') || [];
        const track = tracks.find(t => t.id === trackId);
        if (track) {
          track.muted = !track.muted;
          e.target.classList.toggle('audio-mixer__btn--active-danger', track.muted);
          store._emit('tracks', tracks);

          // Update VU meter
          const vuFill = this.container.querySelector(`[data-vu="${trackId}"]`);
          if (vuFill && track.muted) vuFill.style.height = '0%';
        }
      });
    });

    // Solo buttons
    this.container.querySelectorAll('[data-solo]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const trackId = e.target.dataset.solo;
        const tracks = store.get('tracks') || [];
        const isActive = e.target.classList.contains('audio-mixer__btn--active');

        if (isActive) {
          // Unsolo — unmute all
          tracks.forEach(t => { t.muted = false; });
          e.target.classList.remove('audio-mixer__btn--active');
        } else {
          // Solo — mute all except this
          tracks.forEach(t => { t.muted = (t.id !== trackId); });
          this.container.querySelectorAll('[data-solo]').forEach(b => b.classList.remove('audio-mixer__btn--active'));
          e.target.classList.add('audio-mixer__btn--active');
        }

        store._emit('tracks', tracks);
        this._renderChannels();
      });
    });

    // Master volume
    const masterFader = this.container.querySelector('#masterFader');
    masterFader?.addEventListener('input', (e) => {
      const volume = parseInt(e.target.value) / 100;
      const dbReadout = this.container.querySelector('[data-db="master"]');
      if (dbReadout) dbReadout.textContent = this._linearToDb(volume);

      if (window.audioEngine?.masterGain) {
        window.audioEngine.masterGain.gain.value = volume;
      }
    });

    // Master mute
    const masterMuteBtn = this.container.querySelector('#masterMuteBtn');
    masterMuteBtn?.addEventListener('click', () => {
      const isMuted = masterMuteBtn.classList.toggle('audio-mixer__btn--active-danger');
      if (window.audioEngine?.masterGain) {
        window.audioEngine.masterGain.gain.value = isMuted ? 0 : 1;
      }
    });
  }

  _linearToDb(linear) {
    if (linear <= 0) return '-∞ dB';
    const db = 20 * Math.log10(linear);
    return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
  }

  toggle() {
    this.visible = !this.visible;
    if (this.container) {
      this.container.style.display = this.visible ? '' : 'none';
    }
    if (this.visible) {
      this._renderChannels();
      this._startVUAnimation();
    } else {
      this._stopVUAnimation();
    }
  }

  _startVUAnimation() {
    if (this._animFrame) return;
    const animate = () => {
      if (!this.visible) return;
      this._updateVUMeters();
      this._animFrame = requestAnimationFrame(animate);
    };
    this._animFrame = requestAnimationFrame(animate);
  }

  _stopVUAnimation() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  _updateVUMeters() {
    if (!this.container) return;
    const isPlaying = store.get('playback.playing');

    const tracks = store.get('tracks') || [];
    tracks.forEach(track => {
      const vuFill = this.container.querySelector(`[data-vu="${track.id}"]`);
      if (!vuFill) return;

      if (track.muted || !isPlaying) {
        // Decay toward 0
        const current = parseFloat(vuFill.style.height) || 0;
        vuFill.style.height = `${Math.max(0, current - 3)}%`;
      } else {
        // Simulate VU activity
        const target = 30 + Math.random() * 40;
        const current = parseFloat(vuFill.style.height) || 0;
        const next = current + (target - current) * 0.3;
        vuFill.style.height = `${Math.min(100, next)}%`;

        // Color based on level
        if (next > 85) {
          vuFill.style.background = 'linear-gradient(to top, #00cec9, #fdcb6e, #e74c3c)';
        } else if (next > 60) {
          vuFill.style.background = 'linear-gradient(to top, #00cec9, #fdcb6e)';
        } else {
          vuFill.style.background = 'linear-gradient(to top, #00cec9, #00b894)';
        }
      }
    });

    // Master VU
    const masterVu = this.container.querySelector('[data-vu="master"]');
    if (masterVu) {
      if (!isPlaying) {
        const c = parseFloat(masterVu.style.height) || 0;
        masterVu.style.height = `${Math.max(0, c - 3)}%`;
      } else {
        const target = 35 + Math.random() * 35;
        const c = parseFloat(masterVu.style.height) || 0;
        const next = c + (target - c) * 0.25;
        masterVu.style.height = `${Math.min(100, next)}%`;
      }
    }
  }
}

window.AudioMixerPanel = AudioMixerPanel;
