/**
 * StudioCut — Media Browser Panel
 * Media management, grid/list view, drag-to-timeline, and tabs for Effects, Transitions, and Text
 */

class MediaBrowser {
  constructor() {
    this.container = document.getElementById('mediaBrowserContent');
    this.currentTab = 'media';
    this.viewMode = 'grid'; // 'grid' | 'list'
    this.searchQuery = '';
  }

  init() {
    this._bindTabs();
    this._bindToolbar();
    this._bindSearch();
    this._bindDropZone();
    this._bindStoreEvents();
    this.render();
  }

  _bindTabs() {
    const tabs = document.querySelectorAll('.media-browser__tab');
    const textEditorContainer = document.getElementById('textEditorContainer');
    const mediaContent = document.getElementById('mediaBrowserContent');
    const searchContainer = document.getElementById('mediaSearchContainer');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;

        if (this.currentTab === 'transcript') {
          if (textEditorContainer) textEditorContainer.style.display = 'block';
          if (mediaContent) mediaContent.style.display = 'none';
          if (searchContainer) searchContainer.style.display = 'none';
          if (window.textEditorPanel) window.textEditorPanel.render();
        } else {
          if (textEditorContainer) textEditorContainer.style.display = 'none';
          if (mediaContent) mediaContent.style.display = 'block';
          if (searchContainer) searchContainer.style.display = 'block';
          this.render();
        }
      });
    });
  }

  setTab(tabName) {
    const tabBtn = document.querySelector(`.media-browser__tab[data-tab="${tabName}"]`);
    if (tabBtn) {
      tabBtn.click();
    } else {
      this.currentTab = tabName;
      this.render();
    }
  }

  _bindToolbar() {
    const btnGrid = document.getElementById('btnMediaGrid');
    const btnList = document.getElementById('btnMediaList');

    btnGrid?.addEventListener('click', () => {
      this.viewMode = 'grid';
      btnGrid.classList.add('active');
      btnList?.classList.remove('active');
      this.render();
    });

    btnList?.addEventListener('click', () => {
      this.viewMode = 'list';
      btnList.classList.add('active');
      btnGrid?.classList.remove('active');
      this.render();
    });
  }

  _bindSearch() {
    const searchInput = document.getElementById('mediaSearch');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.render();
    });
  }

  _bindDropZone() {
    const dropZone = document.getElementById('mediaBrowser');
    if (!dropZone) return;

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
      if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove('drag-over');
      }
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const fileList = Array.from(e.dataTransfer.files);
        const filePaths = fileList.map(f => {
          if (window.studiocut?.file?.getPathForFile) {
            try { return window.studiocut.file.getPathForFile(f); } catch (err) {}
          }
          return f.path || '';
        }).filter(Boolean);

        if (filePaths.length > 0) {
          window.app?.importFiles(filePaths);
        } else {
          window.app?._handleBrowserFiles(fileList);
        }
      }
    });
  }

  _bindStoreEvents() {
    store.on('media', () => {
      if (this.currentTab === 'media') {
        this.render();
      }
    });
  }

  render() {
    if (!this.container) {
      this.container = document.getElementById('mediaBrowserContent');
    }
    if (!this.container) return;

    if (this.currentTab === 'media') {
      this._renderMediaTab();
    } else if (this.currentTab === 'effects') {
      this._renderEffectsTab();
    } else if (this.currentTab === 'transitions') {
      this._renderTransitionsTab();
    } else if (this.currentTab === 'text') {
      this._renderTextTab();
    }
  }

  addMediaToTimeline(media) {
    if (!media) return;
    const tracks = store.get('tracks') || [];
    const trackType = media.type === 'audio' ? 'audio' : 'video';
    let targetTrack = tracks.find(t => t.type === trackType && !t.locked) || tracks[0];

    if (!targetTrack) {
      targetTrack = Actions.addTrack(trackType);
    }

    if (targetTrack.locked) {
      window.app?.showToast('Target track is locked! Unlock it to add clips.', 'warning');
      return;
    }

    const playheadTime = store.get('playback.currentTime') || 0;

    Actions.addClip(targetTrack.id, {
      mediaId: media.id,
      sourcePath: media.path,
      name: media.name,
      mediaType: media.type || 'video',
      startTime: playheadTime,
      duration: media.duration || (media.type === 'image' ? 5 : 10),
      sourceDuration: media.duration || 10
    });

    window.previewEngine?.updatePreview();
    window.app?.showToast(`Added "${media.name}" to ${targetTrack.name}`);
  }

  _renderMediaTab() {
    let mediaList = store.get('media') || [];

    if (this.searchQuery) {
      mediaList = mediaList.filter(m => m.name.toLowerCase().includes(this.searchQuery));
    }

    if (mediaList.length === 0) {
      this.container.innerHTML = `
        <div class="drop-zone empty-state" id="mediaDropZone" style="cursor:pointer">
          <div class="empty-state__icon">📥</div>
          <div class="empty-state__title">Import Media</div>
          <div class="empty-state__text">Click to browse or drag & drop video, audio, or image files here</div>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button class="btn btn--primary btn--sm" id="btnDropBrowse">📂 Browse Files</button>
            <button class="btn btn--secondary btn--sm" id="btnDropSample">✨ Sample Media</button>
          </div>
        </div>
      `;

      document.getElementById('mediaDropZone')?.addEventListener('click', (e) => {
        if (e.target.closest('#btnDropSample')) {
          e.stopPropagation();
          window.app?.addSampleMedia();
        } else {
          window.app?.importMedia();
        }
      });
      return;
    }

    const isGrid = this.viewMode === 'grid';
    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px 8px; border-bottom:1px solid var(--border-subtle); margin-bottom:6px;">
        <span style="font-size:11px; font-weight:600; color:var(--text-secondary);">${mediaList.length} Asset${mediaList.length > 1 ? 's' : ''}</span>
        <div style="display:flex; gap:4px;">
          <button class="btn btn--primary btn--sm" id="btnMediaTabImport" style="font-size:10px; height:22px; padding:0 8px;">+ Import</button>
          <button class="btn btn--secondary btn--sm" id="btnMediaTabSample" style="font-size:10px; height:22px; padding:0 8px;">✨ Samples</button>
        </div>
      </div>
      <div class="${isGrid ? 'media-grid' : 'media-list'}">
    `;

    for (const item of mediaList) {
      // If video has no thumbnail yet, asynchronously extract it
      if (item.type === 'video' && !item.thumbnail && !item._fetchingThumb && window.app?.generateVideoThumbnail) {
        item._fetchingThumb = true;
        window.app.generateVideoThumbnail(item.path).then(thumb => {
          if (thumb) {
            item.thumbnail = thumb;
            this.render();
          }
        }).catch(() => {});
      }

      const durText = item.duration ? (
        item.duration >= 3600
          ? `${Math.floor(item.duration / 3600)}:${String(Math.floor((item.duration % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}`
          : `${String(Math.floor(item.duration / 60)).padStart(2, '0')}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}`
      ) : '';

      const resolutionText = (item.width && item.height) 
        ? `${item.height}p` 
        : (item.codec || (item.type ? item.type.toUpperCase() : 'MEDIA'));

      let thumbContent = '';
      if (item.thumbnail) {
        thumbContent = `<img src="${item.thumbnail}" class="media-item__thumbnail" alt="${item.name}" draggable="false">`;
      } else if (item.type === 'image' && item.path) {
        thumbContent = `<img src="${item.path}" class="media-item__thumbnail" alt="${item.name}" draggable="false">`;
      } else if (item.type === 'audio') {
        thumbContent = `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; color:var(--accent-secondary);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <span style="font-size:8px; font-weight:700; opacity:0.8; letter-spacing:0.5px;">AUDIO</span>
          </div>`;
      } else {
        thumbContent = `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; color:var(--accent-primary); opacity:0.8;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
            </svg>
            <span style="font-size:8px; font-weight:600;">VIDEO</span>
          </div>`;
      }

      html += `
        <div class="media-item ${isGrid ? '' : 'media-item--list'} card card--interactive"
             draggable="true"
             data-id="${item.id}"
             title="Double-click or drag to timeline: ${item.name}">
          <div class="media-item__thumb-container">
            ${thumbContent}
            <span class="media-item__badge-type">${item.type || 'video'}</span>
            ${durText ? `<span class="media-item__badge-dur">${durText}</span>` : ''}
          </div>
          <div class="media-item__details">
            <div class="media-item__title" title="${item.name}">${item.name}</div>
            <div class="media-item__footer">
              <span class="media-item__meta-tag">${resolutionText}</span>
              <button class="btn btn--primary btn--icon btn--sm btn-add-media media-item__btn-add" data-id="${item.id}" title="Add to timeline at playhead">+</button>
            </div>
          </div>
        </div>
      `;
    }

    html += `</div>`;
    this.container.innerHTML = html;

    // Attach Import & Sample buttons
    document.getElementById('btnMediaTabImport')?.addEventListener('click', () => window.app?.importMedia());
    document.getElementById('btnMediaTabSample')?.addEventListener('click', () => window.app?.addSampleMedia());

    // Attach dragstart, double-click, and click handlers
    const items = this.container.querySelectorAll('.media-item');
    items.forEach(el => {
      const id = el.dataset.id;
      const media = mediaList.find(m => m.id === id);

      el.addEventListener('dragstart', (e) => {
        if (media) {
          window._draggedMediaItem = media;
          e.dataTransfer.setData('text/plain', media.id);
          e.dataTransfer.setData('application/json', JSON.stringify(media));
          e.dataTransfer.effectAllowed = 'copy';
        }
      });

      el.addEventListener('dragend', () => {
        setTimeout(() => { window._draggedMediaItem = null; }, 400);
      });

      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (window.sourceMonitor) {
          window.sourceMonitor.loadMedia(media);
          window.app?.showToast(`Loaded "${media.name}" in Source Monitor`);
        } else {
          this.addMediaToTimeline(media);
        }
      });

      const btnAdd = el.querySelector('.btn-add-media');
      btnAdd?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addMediaToTimeline(media);
      });
    });
  }

  _renderEffectsTab() {
    const effects = [
      { id: 'vignette', name: 'Vignette', cat: 'Stylize', icon: '🌑', defaultProps: { radius: 0.6, softness: 0.4 } },
      { id: 'blur', name: 'Gaussian Blur', cat: 'Blur', icon: '🌫️', defaultProps: { radius: 10 } },
      { id: 'film-grain', name: 'Film Grain', cat: 'Stylize', icon: '🎞️', defaultProps: { intensity: 0.25 } },
      { id: 'glitch', name: 'Glitch / RGB Split', cat: 'Distort', icon: '⚡', defaultProps: { amount: 0.5 } },
      { id: 'bloom', name: 'Bloom Glow', cat: 'Glow', icon: '✨', defaultProps: { threshold: 0.7, intensity: 1.2 } },
      { id: 'chromatic-aberration', name: 'Chromatic Aberration', cat: 'Distort', icon: '🌈', defaultProps: { offset: 4 } },
      { id: 'brightness-contrast', name: 'Brightness & Contrast', cat: 'Color', icon: '☀️', defaultProps: { brightness: 1.1, contrast: 1.2 } },
      { id: 'hue-saturation', name: 'Hue & Saturation', cat: 'Color', icon: '🎨', defaultProps: { hue: 0, saturation: 1.3 } }
    ];

    let html = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:8px; padding:8px;">`;
    for (const fx of effects) {
      html += `
        <div class="card card--interactive effect-card" data-fx-id="${fx.id}" style="padding:10px; text-align:center; cursor:pointer; background:var(--bg-card); border-radius:6px; border:1px solid var(--border-subtle);">
          <div style="font-size:24px; margin-bottom:4px;">${fx.icon}</div>
          <div style="font-size:11px; font-weight:600;">${fx.name}</div>
          <div style="font-size:9px; color:var(--text-tertiary);">${fx.cat}</div>
          <button class="btn btn--primary btn--sm" style="margin-top:6px; width:100%; font-size:10px; height:22px;">Apply</button>
        </div>
      `;
    }
    html += `</div>`;
    this.container.innerHTML = html;

    this.container.querySelectorAll('.effect-card').forEach(el => {
      el.querySelector('button')?.addEventListener('click', () => {
        const fxId = el.dataset.fxId;
        const fx = effects.find(f => f.id === fxId);
        const selectedClips = store.get('selection.clipIds') || [];
        if (selectedClips.length > 0) {
          Actions.addEffectToClip(selectedClips[0], {
            type: fx.id,
            name: fx.name,
            properties: fx.defaultProps
          });
          window.app?.showToast(`Applied ${fx.name} to clip`);
        } else {
          window.app?.showToast('Select a clip first to apply this effect');
        }
      });
    });
  }

  _renderTransitionsTab() {
    const transitions = [
      { id: 'cross-dissolve', name: 'Cross Dissolve', cat: 'Dissolve', icon: '🔀' },
      { id: 'dip-black', name: 'Dip to Black', cat: 'Dissolve', icon: '⬛' },
      { id: 'dip-white', name: 'Dip to White', cat: 'Dissolve', icon: '⬜' },
      { id: 'film-burn', name: 'Film Burn', cat: 'Dissolve', icon: '🔥' },
      { id: 'slide-left', name: 'Slide Left', cat: 'Slide', icon: '⬅️' },
      { id: 'slide-right', name: 'Slide Right', cat: 'Slide', icon: '➡️' },
      { id: 'push-up', name: 'Push Up', cat: 'Slide', icon: '⬆️' },
      { id: 'push-down', name: 'Push Down', cat: 'Slide', icon: '⬇️' },
      { id: 'wipe-right', name: 'Linear Wipe', cat: 'Wipe', icon: '🧹' },
      { id: 'iris-wipe', name: 'Iris Circle', cat: 'Wipe', icon: '⭕' },
      { id: 'clock-wipe', name: 'Clock Wipe', cat: 'Wipe', icon: '⏱️' },
      { id: 'split-door', name: 'Split Door', cat: 'Wipe', icon: '🚪' },
      { id: 'zoom-in', name: 'Zoom In', cat: 'Motion', icon: '🔍' },
      { id: 'zoom-out', name: 'Zoom Out', cat: 'Motion', icon: '🔎' },
      { id: 'whip-pan', name: 'Whip Pan', cat: 'Motion', icon: '💨' },
      { id: 'spin-cw', name: 'Spin 360°', cat: 'Motion', icon: '🔄' },
      { id: 'glitch', name: 'Glitch Slice', cat: 'Stylize', icon: '⚡' }
    ];

    let html = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(105px, 1fr)); gap:8px; padding:8px;">`;
    for (const tr of transitions) {
      html += `
        <div class="card card--interactive transition-card" data-tr-id="${tr.id}" style="padding:8px 6px; text-align:center; cursor:pointer; background:var(--bg-card); border-radius:6px; border:1px solid var(--border-subtle);">
          <div style="font-size:20px; margin-bottom:2px;">${tr.icon}</div>
          <div style="font-size:11px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${tr.name}</div>
          <span style="font-size:8px; color:var(--text-tertiary); text-transform:uppercase;">${tr.cat}</span>
          <button class="btn btn--secondary btn--sm" style="margin-top:4px; width:100%; font-size:10px; height:20px; padding:0 4px;">Apply</button>
        </div>
      `;
    }
    html += `</div>`;
    this.container.innerHTML = html;

    this.container.querySelectorAll('.transition-card button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.transition-card');
        const trId = card.dataset.trId;
        const tr = transitions.find(t => t.id === trId);
        const selIds = store.get('selection.clipIds') || [];
        if (selIds.length > 0) {
          Actions.updateClip(selIds[0], { transition: { type: tr.id, duration: 1.0 } });
          window.app?.showToast(`Applied ${tr.name} to selected clip`);
        } else {
          window.app?.showToast(`Selected "${tr.name}" transition`);
        }
      });
    });
  }

  _renderTextTab() {
    const presets = textEngine.getPresets();
    const subPresets = window.autoCaptionsEngine?.getStylePresets() || [
      { id: 'tiktok-yellow', name: '⚡ CapCut TikTok Yellow' },
      { id: 'classic-cinema', name: '🎬 Classic Cinema' },
      { id: 'glow-neon', name: '✨ Cyber Neon Glow' },
      { id: 'minimal-box', name: '⚪ Minimalist Pill' }
    ];

    let html = `
      <div style="display:flex; flex-direction:column; gap:10px; padding:8px;">
        <!-- Auto-Captions Pro Banner -->
        <div class="card" style="background:linear-gradient(135deg, rgba(108,92,231,0.18), rgba(0,206,201,0.12)); border:1px solid rgba(108,92,231,0.35); border-radius:8px; padding:10px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
            <span style="font-size:16px;">🎙️</span>
            <span style="font-size:12px; font-weight:700; color:var(--text-accent);">Auto-Captions (Speech-to-Text)</span>
          </div>
          <p style="font-size:10px; color:var(--text-secondary); margin:0 0 8px 0; line-height:1.4;">
            Automatically transcribe audio dialogue into animated word-by-word karaoke subtitles.
          </p>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:10px; color:var(--text-secondary);">Subtitle Style Preset:
              <select id="selAutoCaptionStyle" class="select" style="width:100%; height:26px; font-size:11px; margin-top:2px;">
                ${subPresets.map(sp => `<option value="${sp.id}">${sp.name}</option>`).join('')}
              </select>
            </label>
            <button class="btn btn--primary btn--sm" id="btnGenerateAutoCaptions" style="width:100%; height:28px; font-size:11px; font-weight:600;">
              ✨ Generate Auto-Captions
            </button>
          </div>
        </div>

        <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-tertiary); margin-top:4px;">
          Title & Graphics Presets
        </div>
    `;

    for (const preset of presets) {
      html += `
        <div class="card card--interactive text-preset-card" data-preset-id="${preset.id}" style="padding:10px; display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); border-radius:6px; border:1px solid var(--border-subtle);">
          <div>
            <div style="font-size:12px; font-weight:600; color:var(--text-primary);">${preset.name}</div>
            <div style="font-size:10px; color:var(--text-secondary); margin-top:2px; font-family:${preset.style.fontFamily}; color:${preset.style.color};">${preset.text}</div>
          </div>
          <button class="btn btn--primary btn--sm btn-add-text" style="font-size:11px; height:24px;">+ Add</button>
        </div>
      `;
    }
    html += `</div>`;
    this.container.innerHTML = html;

    // Attach Auto-Captions Generator
    const btnGenCaptions = this.container.querySelector('#btnGenerateAutoCaptions');
    const selStyle = this.container.querySelector('#selAutoCaptionStyle');

    btnGenCaptions?.addEventListener('click', async () => {
      const styleId = selStyle?.value || 'tiktok-yellow';
      btnGenCaptions.disabled = true;
      btnGenCaptions.textContent = '⏳ Transcribing...';

      try {
        const state = store.getState();
        let targetClip = null;
        const selectedIds = state.selection?.clipIds || [];
        if (selectedIds.length > 0) {
          targetClip = Actions.getClip(selectedIds[0]);
        }
        if (!targetClip) {
          for (const track of state.tracks) {
            if (track.clips && track.clips.length > 0) {
              targetClip = track.clips[0];
              break;
            }
          }
        }

        if (!targetClip) {
          window.app?.showToast('⚠️ Please add media to timeline first');
          return;
        }

        window.autoCaptionsEngine?.setStylePreset(styleId);
        const captions = await window.autoCaptionsEngine?.transcribeClip(targetClip);
        const subTrack = window.autoCaptionsEngine?.createSubtitlesTrackOnTimeline(captions);

        window.app?.showToast(`✨ Generated ${captions.length} karaoke subtitle clips on Subtitles track!`);
        if (window.previewEngine) window.previewEngine.updatePreview();
      } catch (err) {
        console.error('Auto-caption generation error:', err);
        window.app?.showToast('Failed to generate captions');
      } finally {
        btnGenCaptions.disabled = false;
        btnGenCaptions.textContent = '✨ Generate Auto-Captions';
      }
    });

    this.container.querySelectorAll('.btn-add-text').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.text-preset-card');
        const presetId = card.dataset.presetId;
        textEngine.addTextClip(presetId);
        window.app?.showToast('Added title to timeline');
      });
    });
  }
}

window.mediaBrowser = new MediaBrowser();
