/**
 * StudioCut — Inspector Panel
 * Context-sensitive property editor for selected clips:
 * Transform & Keyframes, Chroma Key (Green Screen), LUT Color Grading, Filters, Audio Fade & EQ
 */

class Inspector {
  constructor() {
    this.container = null;
    this.currentClipId = null;
    this.activeCategory = 'all';
  }

  init() {
    this.container = document.getElementById('inspector');
    this._bindStoreEvents();
    this._bindCategoryTabs();
    this.render();
  }

  _bindCategoryTabs() {
    const tabsContainer = document.getElementById('inspectorHeaderTabs');
    if (!tabsContainer) return;
    tabsContainer.querySelectorAll('.inspector-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        tabsContainer.querySelectorAll('.inspector-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.dataset.subtab || 'all';
        this._applyCategoryFilter();
      });
    });
  }

  _applyCategoryFilter() {
    if (!this.container) return;
    const sections = this.container.querySelectorAll('.inspector-section');
    sections.forEach(sec => {
      const cat = sec.dataset.category;
      if (this.activeCategory === 'all' || !cat || cat === this.activeCategory) {
        sec.style.display = '';
      } else {
        sec.style.display = 'none';
      }
    });
  }

  _bindStoreEvents() {
    store.on('selection.clipIds', (ids) => {
      this.currentClipId = ids?.[0] || null;
      this.render();
    });

    store.on('tracks', () => {
      if (this.currentClipId) {
        this.render();
      }
    });

    store.on('keyframes', () => {
      if (this.currentClipId) {
        this.render();
      }
    });
  }

  _getSelectedClip() {
    if (!this.currentClipId) return null;
    const tracks = store.get('tracks') || [];
    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === this.currentClipId);
      if (clip) return { clip, track };
    }
    return null;
  }

  render() {
    if (!this.container) {
      this.container = document.getElementById('inspector');
    }
    if (!this.container) return;

    const data = this._getSelectedClip();
    if (!data) {
      this.container.innerHTML = `
        <div class="panel__body">
          <div class="empty-state">
            <div class="empty-state__icon">🎯</div>
            <div class="empty-state__title">No Selection</div>
            <div class="empty-state__text">Select a clip on the timeline to view and edit its properties</div>
          </div>
        </div>
      `;
      return;
    }

    const { clip, track } = data;
    const isText = clip.mediaType === 'text';
    const isAudio = clip.mediaType === 'audio';
    const transform = clip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    const opacity = clip.opacity !== undefined ? clip.opacity : 1;
    const volume = clip.volume !== undefined ? clip.volume : 1;
    const speed = clip.speed || 1;
    const filters = clip.filters || { brightness: 1, contrast: 1, saturation: 1, blur: 0 };
    const chroma = clip.chromaKey || { enabled: false, colorHex: '#00ff00', similarity: 0.35, smoothness: 0.1, spill: 0.25 };
    const lutPreset = clip.lutPreset || 'none';

    // Keyframe state helper
    const playhead = store.get('playback.currentTime');
    const clipOffset = Math.max(0, playhead - clip.startTime);
    const hasKf = (prop) => {
      const list = window.keyframeEngine?.getKeyframes(clip.id, prop) || [];
      return list.some(k => Math.abs(k.time - clipOffset) < 0.05);
    };

    let html = `
      <div class="panel__body" style="padding:12px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; height:100%;">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">
          <div>
            <input type="text" id="propClipName" value="${clip.name || ''}" class="input" style="font-weight:600; font-size:13px; width:170px;">
            <div style="font-size:10px; color:var(--text-tertiary); margin-top:2px;">Track: ${track.name} • ${clip.mediaType.toUpperCase()}</div>
          </div>
          <button class="btn btn--danger btn--sm btn--icon" id="btnDeleteSelectedClip" title="Delete Clip">🗑</button>
        </div>
    `;

    // 1. Text Properties (if text clip)
    if (isText) {
      const style = clip.textStyle || {};
      html += `
        <div class="inspector-section" data-category="video">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px;">Text Typography</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <label style="font-size:11px;">Text Content
              <textarea id="propTextContent" class="input" rows="2" style="width:100%; margin-top:4px; font-family:var(--font-mono); font-size:11px;">${clip.text || ''}</textarea>
            </label>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              <label style="font-size:11px;">Font Size (${style.fontSize || 64}px)
                <input type="range" id="propFontSize" min="16" max="180" value="${style.fontSize || 64}" class="slider" style="width:100%;">
              </label>
              <label style="font-size:11px;">Font Color
                <input type="color" id="propTextColor" value="${style.color || '#ffffff'}" style="width:100%; height:28px; background:none; border:1px solid var(--border-subtle); border-radius:4px; cursor:pointer;">
              </label>
            </div>
          </div>
        </div>
      `;
    }

    // 2. Transform & Keyframing (for visual clips)
    if (!isAudio) {
      html += `
        <div class="inspector-section" data-category="video">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>Transform & Align</span>
            <span style="font-size:9px; color:var(--text-tertiary); font-weight:normal;">Click ◆ to keyframe</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              <label style="font-size:11px; display:flex; align-items:center; justify-content:space-between;">
                <span>Pos X (${transform.x || 0}px)</span>
                <button class="btn btn--ghost btn--icon btn--sm btn-keyframe ${hasKf('transform.x') ? 'active' : ''}" data-prop="transform.x" title="Toggle Keyframe at Playhead" style="width:18px;height:18px;font-size:10px;">◆</button>
              </label>
              <label style="font-size:11px; display:flex; align-items:center; justify-content:space-between;">
                <span>Pos Y (${transform.y || 0}px)</span>
                <button class="btn btn--ghost btn--icon btn--sm btn-keyframe ${hasKf('transform.y') ? 'active' : ''}" data-prop="transform.y" title="Toggle Keyframe at Playhead" style="width:18px;height:18px;font-size:10px;">◆</button>
              </label>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              <input type="number" id="propPosX" value="${transform.x || 0}" class="input" style="width:100%;">
              <input type="number" id="propPosY" value="${transform.y || 0}" class="input" style="width:100%;">
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-size:11px;">Scale (${Math.round((transform.scaleX || 1) * 100)}%)</span>
                <button class="btn btn--ghost btn--icon btn--sm btn-keyframe ${hasKf('transform.scaleX') ? 'active' : ''}" data-prop="transform.scaleX" title="Toggle Keyframe at Playhead" style="width:18px;height:18px;font-size:10px;">◆</button>
              </div>
              <input type="range" id="propScale" min="0.1" max="3" step="0.05" value="${Math.abs(transform.scaleX || 1)}" class="slider" style="width:100%;">
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-size:11px;">Rotation (${transform.rotation || 0}°)</span>
                <button class="btn btn--ghost btn--icon btn--sm btn-keyframe ${hasKf('transform.rotation') ? 'active' : ''}" data-prop="transform.rotation" title="Toggle Keyframe at Playhead" style="width:18px;height:18px;font-size:10px;">◆</button>
              </div>
              <input type="range" id="propRotation" min="-180" max="180" value="${transform.rotation || 0}" class="slider" style="width:100%;">
            </div>

            <!-- Quick Align & Flip Controls -->
            <div style="display:flex; gap:4px; margin-top:4px;">
              <button class="btn btn--secondary btn--sm" id="btnFlipH" style="flex:1; font-size:10px; height:24px;" title="Flip Horizontal">⇄ Flip H</button>
              <button class="btn btn--secondary btn--sm" id="btnFlipV" style="flex:1; font-size:10px; height:24px;" title="Flip Vertical">⇅ Flip V</button>
              <button class="btn btn--secondary btn--sm" id="btnCenterPos" style="flex:1; font-size:10px; height:24px;" title="Center Position">🎯 Center</button>
              <button class="btn btn--ghost btn--sm" id="btnResetTransform" style="font-size:10px; height:24px;" title="Reset Transform">↺ Reset</button>
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-size:11px;">Opacity (${Math.round(opacity * 100)}%)</span>
                <button class="btn btn--ghost btn--icon btn--sm btn-keyframe ${hasKf('opacity') ? 'active' : ''}" data-prop="opacity" title="Toggle Keyframe at Playhead" style="width:18px;height:18px;font-size:10px;">◆</button>
              </div>
              <input type="range" id="propOpacity" min="0" max="1" step="0.02" value="${opacity}" class="slider" style="width:100%;">
            </div>
          </div>
        </div>

        <!-- 3. Chroma Key (Green Screen Removal) -->
        <div class="inspector-section" data-category="color">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>Chroma Key (Green Screen)</span>
            <input type="checkbox" id="propChromaEnabled" ${chroma.enabled ? 'checked' : ''} style="cursor:pointer;">
          </div>
          <div id="chromaControls" style="display:${chroma.enabled ? 'flex' : 'none'}; flex-direction:column; gap:8px;">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; align-items:center;">
              <label style="font-size:11px;">Key Color:
                <input type="color" id="propChromaColor" value="${chroma.colorHex || '#00ff00'}" style="width:100%; height:28px; background:none; border:1px solid var(--border-subtle); border-radius:4px; cursor:pointer;">
              </label>
              <label style="font-size:11px;">Similarity (${Math.round((chroma.similarity || 0.35) * 100)}%)
                <input type="range" id="propChromaSimilarity" min="0.05" max="0.8" step="0.02" value="${chroma.similarity || 0.35}" class="slider" style="width:100%;">
              </label>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              <label style="font-size:11px;">Smoothness (${Math.round((chroma.smoothness || 0.1) * 100)}%)
                <input type="range" id="propChromaSmoothness" min="0.01" max="0.5" step="0.01" value="${chroma.smoothness || 0.1}" class="slider" style="width:100%;">
              </label>
              <label style="font-size:11px;">Spill Reduction (${Math.round((chroma.spill || 0.25) * 100)}%)
                <input type="range" id="propChromaSpill" min="0.0" max="1.0" step="0.05" value="${chroma.spill || 0.25}" class="slider" style="width:100%;">
              </label>
            </div>
          </div>
        </div>

        <!-- 4. Lumetri 3-Way Color Wheels -->
        <div class="inspector-section" data-category="color">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>3-Way Color Wheels (Lift / Gamma / Gain)</span>
            <input type="checkbox" id="propColorWheelsEnabled" ${clip.colorWheels?.enabled ? 'checked' : ''} style="cursor:pointer;">
          </div>
          <div id="colorWheelsControls" style="display:${clip.colorWheels?.enabled ? 'flex' : 'none'}; flex-direction:column; gap:12px;">
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px; text-align:center;">
              <!-- Lift (Shadows) -->
              <div style="background:var(--bg-surface); padding:8px 4px; border-radius:6px; border:1px solid var(--border-subtle);">
                <div style="font-size:10px; font-weight:700; margin-bottom:4px; color:var(--text-secondary);">LIFT (Shadows)</div>
                <input type="color" id="propColorShadows" value="${clip.colorWheels?.shadowsHex || '#808080'}" style="width:100%; height:26px; background:none; border:1px solid var(--border-subtle); border-radius:4px; cursor:pointer;">
                <div style="margin-top:6px;">
                  <span style="font-size:9px; color:var(--text-tertiary);">Luma Offset</span>
                  <input type="range" id="propLumaShadows" min="-0.5" max="0.5" step="0.02" value="${clip.colorWheels?.shadowsLuma || 0}" class="slider" style="width:100%;">
                </div>
                <button class="btn btn--ghost btn--xs btn-reset-wheel" data-wheel="shadows" style="margin-top:4px; font-size:9px; height:18px; width:100%;">↺ Reset</button>
              </div>

              <!-- Gamma (Midtones) -->
              <div style="background:var(--bg-surface); padding:8px 4px; border-radius:6px; border:1px solid var(--border-subtle);">
                <div style="font-size:10px; font-weight:700; margin-bottom:4px; color:var(--text-secondary);">GAMMA (Midtones)</div>
                <input type="color" id="propColorMidtones" value="${clip.colorWheels?.midtonesHex || '#808080'}" style="width:100%; height:26px; background:none; border:1px solid var(--border-subtle); border-radius:4px; cursor:pointer;">
                <div style="margin-top:6px;">
                  <span style="font-size:9px; color:var(--text-tertiary);">Luma Offset</span>
                  <input type="range" id="propLumaMidtones" min="-0.5" max="0.5" step="0.02" value="${clip.colorWheels?.midtonesLuma || 0}" class="slider" style="width:100%;">
                </div>
                <button class="btn btn--ghost btn--xs btn-reset-wheel" data-wheel="midtones" style="margin-top:4px; font-size:9px; height:18px; width:100%;">↺ Reset</button>
              </div>

              <!-- Gain (Highlights) -->
              <div style="background:var(--bg-surface); padding:8px 4px; border-radius:6px; border:1px solid var(--border-subtle);">
                <div style="font-size:10px; font-weight:700; margin-bottom:4px; color:var(--text-secondary);">GAIN (Highlights)</div>
                <input type="color" id="propColorHighlights" value="${clip.colorWheels?.highlightsHex || '#808080'}" style="width:100%; height:26px; background:none; border:1px solid var(--border-subtle); border-radius:4px; cursor:pointer;">
                <div style="margin-top:6px;">
                  <span style="font-size:9px; color:var(--text-tertiary);">Luma Offset</span>
                  <input type="range" id="propLumaHighlights" min="-0.5" max="0.5" step="0.02" value="${clip.colorWheels?.highlightsLuma || 0}" class="slider" style="width:100%;">
                </div>
                <button class="btn btn--ghost btn--xs btn-reset-wheel" data-wheel="highlights" style="margin-top:4px; font-size:9px; height:18px; width:100%;">↺ Reset</button>
              </div>
            </div>
            <div style="font-size:9px; color:var(--text-tertiary); text-align:center;">(Center Gray #808080 = Neutral. Adjust Luma slider for exposure offset)</div>
          </div>
        </div>

        <!-- 4.1. Lumetri HSL Secondary (Color Isolation & Grading) -->
        <div class="inspector-section" data-category="color">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>HSL Secondary (Color Isolate)</span>
            <input type="checkbox" id="propHslEnabled" ${clip.hslSecondary?.enabled ? 'checked' : ''} style="cursor:pointer;">
          </div>
          <div id="hslControls" style="display:${clip.hslSecondary?.enabled ? 'flex' : 'none'}; flex-direction:column; gap:10px;">
            <div style="background:var(--bg-surface); padding:8px; border-radius:4px; display:flex; flex-direction:column; gap:8px;">
              <span style="font-size:10px; font-weight:700; color:var(--text-secondary);">1. KEY / ISOLATE COLOR</span>
              <div>
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                  <span>Target Hue (${clip.hslSecondary?.hue !== undefined ? clip.hslSecondary.hue : 120}°)</span>
                  <span id="hslColorPreview" style="display:inline-block; width:16px; height:16px; border-radius:50%; background:hsl(${clip.hslSecondary?.hue !== undefined ? clip.hslSecondary.hue : 120}, 80%, 50%); border:1px solid #fff;"></span>
                </div>
                <input type="range" id="propHslHue" min="0" max="360" value="${clip.hslSecondary?.hue !== undefined ? clip.hslSecondary.hue : 120}" class="slider" style="width:100%; background:linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);">
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <label style="font-size:10px;">Hue Range (±${clip.hslSecondary?.hueTolerance || 30}°)
                  <input type="range" id="propHslTolerance" min="5" max="90" value="${clip.hslSecondary?.hueTolerance || 30}" class="slider" style="width:100%;">
                </label>
                <label style="font-size:10px;">Feather / Soft (${clip.hslSecondary?.hueFeather || 20}°)
                  <input type="range" id="propHslFeather" min="0" max="60" value="${clip.hslSecondary?.hueFeather || 20}" class="slider" style="width:100%;">
                </label>
              </div>
              <div style="display:flex; align-items:center; gap:6px; font-size:10px;">
                <input type="checkbox" id="propHslInvert" ${clip.hslSecondary?.invertMask ? 'checked' : ''}>
                <label for="propHslInvert" style="cursor:pointer;">Invert Key Mask (Apply outside color)</label>
              </div>
            </div>

            <div style="background:var(--bg-surface); padding:8px; border-radius:4px; display:flex; flex-direction:column; gap:8px;">
              <span style="font-size:10px; font-weight:700; color:var(--text-secondary);">2. SECONDARY CORRECTION</span>
              <div>
                <span style="font-size:10px;">Hue Shift (${clip.hslSecondary?.hueShift || 0}°)</span>
                <input type="range" id="propHslHueShift" min="-180" max="180" value="${clip.hslSecondary?.hueShift || 0}" class="slider" style="width:100%;">
              </div>
              <div>
                <span style="font-size:10px;">Saturation (${Math.round((clip.hslSecondary?.satMult !== undefined ? clip.hslSecondary.satMult : 1) * 100)}%)</span>
                <input type="range" id="propHslSatMult" min="0" max="3" step="0.05" value="${clip.hslSecondary?.satMult !== undefined ? clip.hslSecondary.satMult : 1}" class="slider" style="width:100%;">
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <label style="font-size:10px;">Temperature (Cool ↔ Warm)
                  <input type="range" id="propHslTemp" min="-1" max="1" step="0.05" value="${clip.hslSecondary?.temperature || 0}" class="slider" style="width:100%;">
                </label>
                <label style="font-size:10px;">Tint (Green ↔ Magenta)
                  <input type="range" id="propHslTint" min="-1" max="1" step="0.05" value="${clip.hslSecondary?.tint || 0}" class="slider" style="width:100%;">
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 4.5. LUT Color Grading -->
        <div class="inspector-section" data-category="color">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px;">LUT Color Grading</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <label style="font-size:11px;">LUT Preset Look:
              <select id="propLutPreset" class="select" style="width:100%; height:26px; font-size:11px; margin-top:4px;">
                <option value="none" ${lutPreset === 'none' ? 'selected' : ''}>None (Original Colors)</option>
                <option value="teal-orange" ${lutPreset === 'teal-orange' ? 'selected' : ''}>🎬 Cinematic Teal & Orange</option>
                <option value="kodak-film" ${lutPreset === 'kodak-film' ? 'selected' : ''}>🎞️ Kodak Portra 400 Film</option>
                <option value="cyberpunk" ${lutPreset === 'cyberpunk' ? 'selected' : ''}>⚡ Cyberpunk Neon</option>
                <option value="vintage-noir" ${lutPreset === 'vintage-noir' ? 'selected' : ''}>📽️ Film Noir Contrast B&W</option>
                <option value="golden-hour" ${lutPreset === 'golden-hour' ? 'selected' : ''}>🌅 Golden Hour Warmth</option>
              </select>
            </label>
          </div>
        </div>

        <!-- 4.6. Color Curves Spline Editor -->
        <div class="inspector-section" data-category="color">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>Color Curves (RGB & Luma)</span>
            <input type="checkbox" id="propColorCurvesEnabled" ${clip.colorCurves ? 'checked' : ''} style="cursor:pointer;">
          </div>
          <div id="colorCurvesContainer" style="display:${clip.colorCurves ? 'block' : 'none'};">
            <div id="curvesWidgetMount" style="margin-top:6px;"></div>
          </div>
        </div>

        <!-- 4.7. Smart AI & Tracking Tools -->
        <div class="inspector-section" data-category="video">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px;">
            <span>Smart Tools (AI & Tracking)</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <!-- Auto-Reframe -->
            <div style="background:var(--bg-surface); padding:8px; border-radius:4px;">
              <div style="font-size:11px; font-weight:600; margin-bottom:4px;">📱 Smart Auto-Reframe (Social)</div>
              <div style="display:flex; gap:4px; margin-bottom:6px;">
                <button class="btn btn--secondary btn--xs" id="btnReframe916" style="flex:1;">9:16 Reels</button>
                <button class="btn btn--secondary btn--xs" id="btnReframe11" style="flex:1;">1:1 Square</button>
                <button class="btn btn--secondary btn--xs" id="btnReframe45" style="flex:1;">4:5 Post</button>
              </div>
              <div id="reframeStatus" style="font-size:10px; color:var(--text-tertiary);">Saliency face-tracking with smooth camera physics.</div>
            </div>

            <!-- Motion Tracking -->
            <div style="background:var(--bg-surface); padding:8px; border-radius:4px;">
              <div style="font-size:11px; font-weight:600; margin-bottom:4px;">🎯 Optical Motion Tracking</div>
              <div style="display:flex; gap:4px; margin-bottom:4px;">
                <button class="btn btn--secondary btn--xs" id="btnTrackForward" style="flex:1;">Track Point</button>
                <button class="btn btn--primary btn--xs" id="btnAttachOverlay" style="flex:1;">Attach Selected</button>
              </div>
              <div id="trackStatus" style="font-size:10px; color:var(--text-tertiary);">Track subject motion and attach text/stickers.</div>
            </div>

            <!-- Scene Edit Detection -->
            <div style="background:var(--bg-surface); padding:8px; border-radius:4px;">
              <div style="font-size:11px; font-weight:600; margin-bottom:4px;">✂ Scene Cut Detection</div>
              <button class="btn btn--secondary btn--xs" id="btnDetectSceneCuts" style="width:100%; margin-bottom:4px;">Detect Camera Cuts & Slice</button>
              <div id="sceneDetectStatus" style="font-size:10px; color:var(--text-tertiary);">Analyze color histograms & edges to slice clip.</div>
            </div>

            <!-- Compound Clips -->
            <div style="background:var(--bg-surface); padding:8px; border-radius:4px;">
              <div style="font-size:11px; font-weight:600; margin-bottom:4px;">📦 Nested Sequences (Compound)</div>
              <div style="display:flex; gap:4px;">
                <button class="btn btn--secondary btn--xs" id="btnCreateCompound" style="flex:1;">Create Compound</button>
                ${clip.mediaType === 'compound' ? '<button class="btn btn--danger btn--xs" id="btnUnpackCompound" style="flex:1;">Unpack</button>' : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Color & Adjustments -->
        <div class="inspector-section" data-category="color">
          <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px;">Color & Filters</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <label style="font-size:11px;">Brightness (${Math.round(filters.brightness * 100)}%)
              <input type="range" id="propBrightness" min="0.2" max="2" step="0.05" value="${filters.brightness}" class="slider" style="width:100%;">
            </label>
            <label style="font-size:11px;">Contrast (${Math.round(filters.contrast * 100)}%)
              <input type="range" id="propContrast" min="0.2" max="2" step="0.05" value="${filters.contrast}" class="slider" style="width:100%;">
            </label>
            <label style="font-size:11px;">Saturation (${Math.round(filters.saturation * 100)}%)
              <input type="range" id="propSaturation" min="0" max="2.5" step="0.05" value="${filters.saturation}" class="slider" style="width:100%;">
            </label>
            <label style="font-size:11px;">Blur (${filters.blur}px)
              <input type="range" id="propBlur" min="0" max="30" step="1" value="${filters.blur}" class="slider" style="width:100%;">
            </label>
          </div>
        </div>
      `;
    }

    // 6. Audio Section
    const eq = clip.eq || {
      enabled: !!(clip.eqPreset && clip.eqPreset !== 'none'),
      low: 0,
      lowMid: 0,
      highMid: 0,
      high: 0,
      lowFreq: 100,
      lowMidFreq: 500,
      highMidFreq: 2500,
      highFreq: 10000
    };

    const comp = (clip.compressor && typeof clip.compressor === 'object') ? clip.compressor : {
      enabled: !!clip.compressor,
      threshold: -24,
      ratio: 8,
      knee: 30,
      attack: 0.003,
      release: 0.25
    };

    const speedPreset = clip.speedPreset || 'none';

    html += `
      <!-- 6. Audio Section -->
      <div class="inspector-section" data-category="audio">
        <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px;">Audio Controls</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <label style="font-size:11px;">Volume (${Math.round(volume * 100)}%)
            <input type="range" id="propVolume" min="0" max="2" step="0.05" value="${volume}" class="slider" style="width:100%;">
          </label>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <label style="font-size:11px;">Fade In (${clip.fadeIn || 0}s)
              <input type="range" id="propFadeIn" min="0" max="5" step="0.1" value="${clip.fadeIn || 0}" class="slider" style="width:100%;">
            </label>
            <label style="font-size:11px;">Fade Out (${clip.fadeOut || 0}s)
              <input type="range" id="propFadeOut" min="0" max="5" step="0.1" value="${clip.fadeOut || 0}" class="slider" style="width:100%;">
            </label>
          </div>
          <label style="font-size:11px; display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="checkbox" id="propAudioDucking" ${clip.audioDucking ? 'checked' : ''}> Auto-Ducking (-12dB when dialogue is present)
          </label>

          <!-- 4-Band Parametric Equalizer -->
          <div style="background:var(--bg-surface); padding:8px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:11px; font-weight:700; color:var(--text-accent);">🎚️ 4-Band Parametric EQ</span>
              <label style="font-size:10px; display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="propEqEnabled" ${eq.enabled ? 'checked' : ''}> Enable
              </label>
            </div>

            <div id="eqControlsContainer" style="display:${eq.enabled ? 'block' : 'none'};">
              <label style="font-size:10px; display:block; margin-bottom:6px;">EQ Preset:
                <select id="propEqPreset" class="select" style="width:100%; height:24px; font-size:10px;">
                  <option value="none" ${clip.eqPreset === 'none' ? 'selected' : ''}>Custom</option>
                  <option value="flat" ${clip.eqPreset === 'flat' ? 'selected' : ''}>Flat / Bypass</option>
                  <option value="bass-boost" ${clip.eqPreset === 'bass-boost' ? 'selected' : ''}>🎸 Bass Boost</option>
                  <option value="vocal-boost" ${clip.eqPreset === 'vocal-boost' ? 'selected' : ''}>🗣️ Vocal Warmth & Presence</option>
                  <option value="podcast-pro" ${clip.eqPreset === 'podcast-pro' ? 'selected' : ''}>🎙️ Podcast Pro Clarity</option>
                  <option value="broadcast-sheen" ${clip.eqPreset === 'broadcast-sheen' ? 'selected' : ''}>📻 Broadcast Sheen</option>
                  <option value="air-treble" ${clip.eqPreset === 'air-treble' ? 'selected' : ''}>✨ Air & Sparkle</option>
                </select>
              </label>

              <!-- Frequency Response Canvas -->
              <canvas id="eqCurveCanvas" width="280" height="85" style="width:100%; height:85px; border-radius:4px; margin-bottom:8px;"></canvas>

              <!-- 4-Band Sliders -->
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                <label style="font-size:10px; color:#e17055;">Low (${eq.low > 0 ? '+' : ''}${eq.low || 0}dB)
                  <input type="range" id="propEqLow" min="-15" max="15" step="1" value="${eq.low || 0}" class="slider" style="width:100%;">
                </label>
                <label style="font-size:10px; color:#fdcb6e;">Low-Mid (${eq.lowMid > 0 ? '+' : ''}${eq.lowMid || 0}dB)
                  <input type="range" id="propEqLowMid" min="-15" max="15" step="1" value="${eq.lowMid || 0}" class="slider" style="width:100%;">
                </label>
                <label style="font-size:10px; color:#00cec9;">High-Mid (${eq.highMid > 0 ? '+' : ''}${eq.highMid || 0}dB)
                  <input type="range" id="propEqHighMid" min="-15" max="15" step="1" value="${eq.highMid || 0}" class="slider" style="width:100%;">
                </label>
                <label style="font-size:10px; color:#a29bfe;">High (${eq.high > 0 ? '+' : ''}${eq.high || 0}dB)
                  <input type="range" id="propEqHigh" min="-15" max="15" step="1" value="${eq.high || 0}" class="slider" style="width:100%;">
                </label>
              </div>
            </div>
          </div>

          <!-- Dynamics Compressor (Limiter / Leveler) -->
          <div style="background:var(--bg-surface); padding:8px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:11px; font-weight:700; color:var(--text-accent);">📉 Dynamics Compressor</span>
              <label style="font-size:10px; display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="propCompEnabled" ${comp.enabled ? 'checked' : ''}> Enable
              </label>
            </div>

            <div id="compControlsContainer" style="display:${comp.enabled ? 'block' : 'none'};">
              <canvas id="compCurveCanvas" width="280" height="60" style="width:100%; height:60px; border-radius:4px; margin-bottom:8px;"></canvas>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
                <label style="font-size:10px;">Threshold (${comp.threshold || -24}dB)
                  <input type="range" id="propCompThreshold" min="-60" max="0" step="1" value="${comp.threshold || -24}" class="slider" style="width:100%;">
                </label>
                <label style="font-size:10px;">Ratio (${comp.ratio || 8}:1)
                  <input type="range" id="propCompRatio" min="1" max="20" step="0.5" value="${comp.ratio || 8}" class="slider" style="width:100%;">
                </label>
                <label style="font-size:10px;">Knee (${comp.knee || 30}dB)
                  <input type="range" id="propCompKnee" min="0" max="40" step="1" value="${comp.knee || 30}" class="slider" style="width:100%;">
                </label>
                <label style="font-size:10px;">Release (${Math.round((comp.release || 0.25) * 1000)}ms)
                  <input type="range" id="propCompRelease" min="0.02" max="1.0" step="0.02" value="${comp.release || 0.25}" class="slider" style="width:100%;">
                </label>
              </div>
            </div>
          </div>

          <!-- Audio AI & Vocal Isolation -->
          <div style="background:var(--bg-surface); padding:8px; border-radius:4px; margin-top:4px;">
            <div style="font-size:11px; font-weight:600; margin-bottom:6px; color:var(--text-accent);">🎙️ Audio AI & Vocal Isolation</div>
            <label style="font-size:10px; display:block; margin-bottom:4px;">Pro Voice Preset:
              <select id="propAudioAiPreset" class="select" style="width:100%; height:24px; font-size:10px;">
                <option value="flat">Flat / Bypass</option>
                <option value="podcast-pro">🎙️ Podcast Pro (Warmth & Clarity)</option>
                <option value="studio-broadcast">📻 Studio Broadcast Sheen</option>
                <option value="vocal-isolation">🗣️ Vocal Isolation (Room Suppression)</option>
                <option value="de-hum-denoise">⚡ De-Hum (60Hz Notch) & De-Noise</option>
                <option value="telephone">📞 Telephone / Walkie-Talkie</option>
              </select>
            </label>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-top:6px;">
              <label style="font-size:10px; display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="propDeHum" ${clip.audioAi?.deHum ? 'checked' : ''}> 60Hz De-Hum
              </label>
              <label style="font-size:10px; display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="propRumbleCut" ${clip.audioAi?.rumbleCut ? 'checked' : ''}> 80Hz Rumble
              </label>
            </div>
            <label style="font-size:10px; display:block; margin-top:6px;">Vocal Clarity (+${clip.audioAi?.clarity || 0}dB)
              <input type="range" id="propVocalClarity" min="0" max="12" step="1" value="${clip.audioAi?.clarity || 0}" class="slider" style="width:100%;">
            </label>
            <label style="font-size:10px; display:block; margin-top:4px;">De-Esser (${clip.audioAi?.deEsser || 0}dB)
              <input type="range" id="propDeEsser" min="0" max="15" step="1" value="${clip.audioAi?.deEsser || 0}" class="slider" style="width:100%;">
            </label>
          </div>
        </div>
      </div>

      <!-- Speed & Time Remapping Suite -->
      <div class="inspector-section" data-category="timing">
        <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px;">Speed & Time-Remapping</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <label style="font-size:11px;">Constant Speed (${speed}x)
            <input type="range" id="propSpeed" min="0.25" max="4" step="0.25" value="${speed}" class="slider" style="width:100%;">
          </label>

          <label style="font-size:10px; display:block; margin-top:2px;">Variable Speed Preset:
            <select id="propSpeedPreset" class="select" style="width:100%; height:24px; font-size:10px; margin-top:2px;">
              <option value="none" ${speedPreset === 'none' ? 'selected' : ''}>Uniform Speed (1.0x)</option>
              <option value="montage" ${speedPreset === 'montage' ? 'selected' : ''}>⚡ Fast Montage (4x -> 0.4x -> 1x)</option>
              <option value="hero" ${speedPreset === 'hero' ? 'selected' : ''}>🦸 Hero Moment (1.2x -> 0.2x -> 1.5x)</option>
              <option value="bullet" ${speedPreset === 'bullet' ? 'selected' : ''}>⏱️ Bullet Time (1x -> 0.1x -> 1x)</option>
              <option value="flash_in" ${speedPreset === 'flash_in' ? 'selected' : ''}>🚀 Flash In (6x -> 1x)</option>
              <option value="flash_out" ${speedPreset === 'flash_out' ? 'selected' : ''}>💨 Flash Out (1x -> 6x)</option>
              <option value="custom" ${speedPreset === 'custom' ? 'selected' : ''}>✏️ Custom Curve</option>
            </select>
          </label>

          <!-- Speed Curve Canvas -->
          <canvas id="speedCurveCanvas" width="280" height="90" style="width:100%; height:90px; border-radius:4px; margin-top:4px;"></canvas>

          <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
            <label style="font-size:11px; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="propOpticalFlow" ${clip.opticalFlow ? 'checked' : ''}>
              <span>Optical Flow (Motion Frame Blending)</span>
            </label>
            <label style="font-size:11px; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="propPreservePitch" ${clip.preservePitch !== false ? 'checked' : ''}>
              <span>Preserve Audio Pitch</span>
            </label>
            <label style="font-size:11px; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="propShowSpeedCurve" ${clip.showSpeedCurve !== false ? 'checked' : ''}>
              <span>Show Curve on Timeline Track</span>
            </label>
          </div>
        </div>
      </div>


      <!-- 6. Masking -->
      <div class="inspector-section" data-category="video">
        <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>Mask</span>
          <input type="checkbox" id="propMaskEnabled" ${clip.mask?.enabled ? 'checked' : ''} style="cursor:pointer;">
        </div>
        <div id="maskControls" style="display:${clip.mask?.enabled ? 'flex' : 'none'}; flex-direction:column; gap:12px;">
          <div style="display:flex; gap:8px;">
            <button id="btnMaskRect" class="btn btn-sm" style="flex:1; background:${clip.mask?.type === 'rectangle' ? 'var(--primary)' : 'var(--bg-tertiary)'}">Rect</button>
            <button id="btnMaskEllipse" class="btn btn-sm" style="flex:1; background:${clip.mask?.type === 'ellipse' ? 'var(--primary)' : 'var(--bg-tertiary)'}">Ellipse</button>
          </div>
          
          <label style="font-size:11px;">Feather
            <input type="range" id="propMaskFeather" min="0" max="100" step="1" value="${clip.mask?.feather || 0}" class="slider" style="width:100%;">
          </label>
          <label style="font-size:11px; display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="checkbox" id="propMaskInvert" ${clip.mask?.invert ? 'checked' : ''}> Invert Mask
          </label>
          <div style="font-size:10px; color:var(--text-tertiary); text-align:center; margin-top:4px;">
            Adjust mask shape directly on the Preview Canvas
          </div>
        </div>
      </div>
    `;

    // 7. Effects List
    const clipEffects = clip.effects || [];
    html += `
      <div class="inspector-section" data-category="video">
        <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px; display:flex; justify-content:space-between;">
          <span>Applied Effects (${clipEffects.length})</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${clipEffects.length === 0 ? '<div style="font-size:10px; color:var(--text-tertiary);">No effects added. Use the ✨ Effects tab to apply one.</div>' : ''}
          ${clipEffects.map((ef, idx) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface); padding:6px; border-radius:4px;">
              <span style="font-size:11px;">✨ ${ef.name || ef.type}</span>
              <button class="btn btn--ghost btn--icon btn--sm btn-remove-fx" data-index="${idx}" style="font-size:10px;">✕</button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;

    // 8. Notes / Comments Section
    html += `
      <div class="inspector-section" data-category="all">
        <div class="inspector-section__title" style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-accent); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>📝 Notes & Comments</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <textarea id="propClipNotes" class="input" rows="3"
            placeholder="Add production notes, reminders, or annotations..."
            style="width:100%; font-size:11px; resize:vertical; min-height:48px; font-family:var(--font-sans); background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:6px; padding:8px; color:var(--text-primary);"
          >${clip.notes || ''}</textarea>
          <div style="font-size:9px; color:var(--text-tertiary); text-align:right;">Notes are saved with the project</div>
        </div>
      </div>
    </div>`;

    this.container.innerHTML = html;
    this._applyCategoryFilter();
    this._bindPropertyInputs(clip);
  }

  _bindPropertyInputs(clip) {
    const update = (changes) => {
      Actions.updateClip(clip.id, changes);
      window.previewEngine?.updatePreview();
    };

    // Clip name & delete
    document.getElementById('propClipName')?.addEventListener('change', (e) => update({ name: e.target.value }));
    document.getElementById('btnDeleteSelectedClip')?.addEventListener('click', () => Actions.removeSelectedClips());

    // Notes
    const notesEl = document.getElementById('propClipNotes');
    if (notesEl) {
      let noteTimeout;
      notesEl.addEventListener('input', (e) => {
        clearTimeout(noteTimeout);
        noteTimeout = setTimeout(() => {
          Actions.setClipNote(clip.id, e.target.value);
        }, 400);
      });
    }

    // Text inputs
    document.getElementById('propTextContent')?.addEventListener('input', (e) => update({ text: e.target.value }));
    document.getElementById('propFontSize')?.addEventListener('input', (e) => {
      const style = clip.textStyle || {};
      style.fontSize = parseInt(e.target.value);
      update({ textStyle: style });
    });
    document.getElementById('propTextColor')?.addEventListener('input', (e) => {
      const style = clip.textStyle || {};
      style.color = e.target.value;
      update({ textStyle: style });
    });

    // Transform inputs
    const posX = document.getElementById('propPosX');
    posX?.addEventListener('input', (e) => {
      const transform = clip.transform || {};
      transform.x = parseFloat(e.target.value) || 0;
      update({ transform });
    });

    const posY = document.getElementById('propPosY');
    posY?.addEventListener('input', (e) => {
      const transform = clip.transform || {};
      transform.y = parseFloat(e.target.value) || 0;
      update({ transform });
    });

    const scale = document.getElementById('propScale');
    scale?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const transform = clip.transform || {};
      transform.scaleX = val;
      transform.scaleY = val;
      update({ transform });
    });

    const rotation = document.getElementById('propRotation');
    rotation?.addEventListener('input', (e) => {
      const transform = clip.transform || {};
      transform.rotation = parseFloat(e.target.value);
      update({ transform });
    });

    const opacity = document.getElementById('propOpacity');
    opacity?.addEventListener('input', (e) => update({ opacity: parseFloat(e.target.value) }));

    // Quick transform actions
    document.getElementById('btnFlipH')?.addEventListener('click', () => {
      const transform = { ...(clip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }) };
      transform.scaleX = -(transform.scaleX || 1);
      update({ transform });
      this.render();
    });

    document.getElementById('btnFlipV')?.addEventListener('click', () => {
      const transform = { ...(clip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }) };
      transform.scaleY = -(transform.scaleY || 1);
      update({ transform });
      this.render();
    });

    document.getElementById('btnCenterPos')?.addEventListener('click', () => {
      const transform = { ...(clip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }) };
      transform.x = 0;
      transform.y = 0;
      update({ transform });
      this.render();
    });

    document.getElementById('btnResetTransform')?.addEventListener('click', () => {
      const transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
      update({ transform });
      this.render();
    });

    // Keyframe buttons (◆)
    document.querySelectorAll('.btn-keyframe').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prop = btn.dataset.prop;
        const curTime = store.get('playback.currentTime');
        const clipOffset = Math.max(0, curTime - clip.startTime);

        let currentVal = 0;
        if (prop.startsWith('transform.')) {
          const key = prop.split('.')[1];
          currentVal = clip.transform?.[key] !== undefined ? clip.transform[key] : (key.startsWith('scale') ? 1 : 0);
        } else {
          currentVal = clip[prop] !== undefined ? clip[prop] : 1;
        }

        window.keyframeEngine?.addKeyframe(clip.id, prop, clipOffset, currentVal);
        window.app?.showToast(`Keyframe set for ${prop}`);
        this.render();
      });
    });

    // Chroma Key
    const chromaToggle = document.getElementById('propChromaEnabled');
    const chromaControls = document.getElementById('chromaControls');
    chromaToggle?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (chromaControls) chromaControls.style.display = enabled ? 'flex' : 'none';

      const chroma = clip.chromaKey || { colorHex: '#00ff00', similarity: 0.35, smoothness: 0.1, spill: 0.25 };
      chroma.enabled = enabled;
      const rgb = ColorUtils.hexToRgb(chroma.colorHex || '#00ff00');
      chroma.keyColor = [rgb.r / 255, rgb.g / 255, rgb.b / 255];

      update({ chromaKey: chroma });
    });

    const updateChromaProp = (key, val) => {
      const chroma = clip.chromaKey || { enabled: true, colorHex: '#00ff00', similarity: 0.35, smoothness: 0.1, spill: 0.25 };
      chroma[key] = val;
      if (key === 'colorHex') {
        const rgb = ColorUtils.hexToRgb(val);
        chroma.keyColor = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
      }
      update({ chromaKey: chroma });
    };

    document.getElementById('propChromaColor')?.addEventListener('input', (e) => updateChromaProp('colorHex', e.target.value));
    document.getElementById('propChromaSimilarity')?.addEventListener('input', (e) => updateChromaProp('similarity', parseFloat(e.target.value)));
    document.getElementById('propChromaSmoothness')?.addEventListener('input', (e) => updateChromaProp('smoothness', parseFloat(e.target.value)));
    document.getElementById('propChromaSpill')?.addEventListener('input', (e) => updateChromaProp('spill', parseFloat(e.target.value)));

    // Color Wheels
    const cwToggle = document.getElementById('propColorWheelsEnabled');
    const cwControls = document.getElementById('colorWheelsControls');
    
    const parseColorToOffset = (hex) => {
      const rgb = ColorUtils.hexToRgb(hex);
      // Map 0-255 to -1.0 to 1.0 (128 is center/no offset)
      return [
        (rgb.r - 128) / 128,
        (rgb.g - 128) / 128,
        (rgb.b - 128) / 128
      ];
    };

    cwToggle?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (cwControls) cwControls.style.display = enabled ? 'flex' : 'none';
      const wheels = clip.colorWheels || { shadowsHex: '#808080', midtonesHex: '#808080', highlightsHex: '#808080' };
      wheels.enabled = enabled;
      update({ colorWheels: wheels });
    });

    const updateColorWheel = (key, hexValue) => {
      const wheels = clip.colorWheels || { enabled: true, shadowsHex: '#808080', midtonesHex: '#808080', highlightsHex: '#808080' };
      wheels[key] = hexValue;
      wheels.shadows = parseColorToOffset(wheels.shadowsHex);
      wheels.midtones = parseColorToOffset(wheels.midtonesHex);
      wheels.highlights = parseColorToOffset(wheels.highlightsHex);
      update({ colorWheels: wheels });
    };

    document.getElementById('propColorShadows')?.addEventListener('input', (e) => updateColorWheel('shadowsHex', e.target.value));
    document.getElementById('propColorMidtones')?.addEventListener('input', (e) => updateColorWheel('midtonesHex', e.target.value));
    document.getElementById('propColorHighlights')?.addEventListener('input', (e) => updateColorWheel('highlightsHex', e.target.value));

    // Luma sliders
    const updateLuma = (key, val) => {
      const wheels = clip.colorWheels || { enabled: true, shadowsHex: '#808080', midtonesHex: '#808080', highlightsHex: '#808080' };
      wheels[key] = parseFloat(val);
      update({ colorWheels: wheels });
    };
    document.getElementById('propLumaShadows')?.addEventListener('input', (e) => updateLuma('shadowsLuma', e.target.value));
    document.getElementById('propLumaMidtones')?.addEventListener('input', (e) => updateLuma('midtonesLuma', e.target.value));
    document.getElementById('propLumaHighlights')?.addEventListener('input', (e) => updateLuma('highlightsLuma', e.target.value));

    // Reset Wheel buttons
    this.container.querySelectorAll('.btn-reset-wheel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const wheel = e.currentTarget.dataset.wheel;
        const wheels = clip.colorWheels || { enabled: true };
        if (wheel === 'shadows') {
          wheels.shadowsHex = '#808080';
          wheels.shadowsLuma = 0;
        } else if (wheel === 'midtones') {
          wheels.midtonesHex = '#808080';
          wheels.midtonesLuma = 0;
        } else if (wheel === 'highlights') {
          wheels.highlightsHex = '#808080';
          wheels.highlightsLuma = 0;
        }
        wheels.shadows = parseColorToOffset(wheels.shadowsHex || '#808080');
        wheels.midtones = parseColorToOffset(wheels.midtonesHex || '#808080');
        wheels.highlights = parseColorToOffset(wheels.highlightsHex || '#808080');
        update({ colorWheels: wheels });
        this.render();
      });
    });

    // Lumetri HSL Secondary Event Bindings
    const hslToggle = document.getElementById('propHslEnabled');
    const hslControls = document.getElementById('hslControls');
    const hslPreview = document.getElementById('hslColorPreview');

    const updateHsl = (patch) => {
      const hsl = {
        enabled: true,
        hue: 120,
        hueTolerance: 30,
        hueFeather: 20,
        satMin: 0.2,
        satMax: 1.0,
        lumMin: 0.1,
        lumMax: 0.9,
        invertMask: false,
        hueShift: 0,
        satMult: 1.0,
        temperature: 0,
        tint: 0,
        ...(clip.hslSecondary || {}),
        ...patch
      };
      if (hslPreview && patch.hue !== undefined) {
        hslPreview.style.background = `hsl(${patch.hue}, 80%, 50%)`;
      }
      update({ hslSecondary: hsl });
    };

    hslToggle?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (hslControls) hslControls.style.display = enabled ? 'flex' : 'none';
      updateHsl({ enabled });
    });

    document.getElementById('propHslHue')?.addEventListener('input', (e) => updateHsl({ hue: parseFloat(e.target.value) }));
    document.getElementById('propHslTolerance')?.addEventListener('input', (e) => updateHsl({ hueTolerance: parseFloat(e.target.value) }));
    document.getElementById('propHslFeather')?.addEventListener('input', (e) => updateHsl({ hueFeather: parseFloat(e.target.value) }));
    document.getElementById('propHslInvert')?.addEventListener('change', (e) => updateHsl({ invertMask: e.target.checked }));
    document.getElementById('propHslHueShift')?.addEventListener('input', (e) => updateHsl({ hueShift: parseFloat(e.target.value) }));
    document.getElementById('propHslSatMult')?.addEventListener('input', (e) => updateHsl({ satMult: parseFloat(e.target.value) }));
    document.getElementById('propHslTemp')?.addEventListener('input', (e) => updateHsl({ temperature: parseFloat(e.target.value) }));
    document.getElementById('propHslTint')?.addEventListener('input', (e) => updateHsl({ tint: parseFloat(e.target.value) }));

    // LUT Preset
    document.getElementById('propLutPreset')?.addEventListener('change', (e) => {
      update({ lutPreset: e.target.value });
    });

    // Filters
    const updateFilters = (key, val) => {
      const filters = clip.filters || { brightness: 1, contrast: 1, saturation: 1, blur: 0 };
      filters[key] = val;
      update({ filters });
    };

    document.getElementById('propBrightness')?.addEventListener('input', (e) => updateFilters('brightness', parseFloat(e.target.value)));
    document.getElementById('propContrast')?.addEventListener('input', (e) => updateFilters('contrast', parseFloat(e.target.value)));
    document.getElementById('propSaturation')?.addEventListener('input', (e) => updateFilters('saturation', parseFloat(e.target.value)));
    document.getElementById('propBlur')?.addEventListener('input', (e) => updateFilters('blur', parseFloat(e.target.value)));

    // Audio Core Controls
    document.getElementById('propVolume')?.addEventListener('input', (e) => update({ volume: parseFloat(e.target.value) }));
    document.getElementById('propFadeIn')?.addEventListener('input', (e) => update({ fadeIn: parseFloat(e.target.value) }));
    document.getElementById('propFadeOut')?.addEventListener('input', (e) => update({ fadeOut: parseFloat(e.target.value) }));
    document.getElementById('propAudioDucking')?.addEventListener('change', (e) => update({ audioDucking: e.target.checked }));

    // 4-Band Parametric EQ Controls & Visualizer
    const eqToggle = document.getElementById('propEqEnabled');
    const eqContainer = document.getElementById('eqControlsContainer');
    const eqCanvas = document.getElementById('eqCurveCanvas');
    const eqPresetSelect = document.getElementById('propEqPreset');

    const redrawEQ = () => {
      if (eqCanvas && window.audioEffectsManager) {
        window.audioEffectsManager.renderEQCurve(eqCanvas, clip.eq || {});
      }
    };
    redrawEQ();

    const updateEQProp = (patch) => {
      const currentEQ = {
        enabled: true,
        low: 0,
        lowMid: 0,
        highMid: 0,
        high: 0,
        lowFreq: 100,
        lowMidFreq: 500,
        highMidFreq: 2500,
        highFreq: 10000,
        ...(clip.eq || {}),
        ...patch
      };
      clip.eq = currentEQ;
      update({ eq: currentEQ });
      redrawEQ();
    };

    eqToggle?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (eqContainer) eqContainer.style.display = enabled ? 'block' : 'none';
      updateEQProp({ enabled });
      redrawEQ();
    });

    eqPresetSelect?.addEventListener('change', (e) => {
      const presetId = e.target.value;
      const presets = window.audioEffectsManager?.getEQPresets() || {};
      const p = presets[presetId] || { low: 0, lowMid: 0, highMid: 0, high: 0 };

      // Update slider inputs in DOM
      const inLow = document.getElementById('propEqLow');
      const inLowMid = document.getElementById('propEqLowMid');
      const inHighMid = document.getElementById('propEqHighMid');
      const inHigh = document.getElementById('propEqHigh');
      if (inLow) inLow.value = p.low;
      if (inLowMid) inLowMid.value = p.lowMid;
      if (inHighMid) inHighMid.value = p.highMid;
      if (inHigh) inHigh.value = p.high;

      update({ eqPreset: presetId });
      updateEQProp({ low: p.low, lowMid: p.lowMid, highMid: p.highMid, high: p.high });
    });

    document.getElementById('propEqLow')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (eqPresetSelect) eqPresetSelect.value = 'none';
      updateEQProp({ low: val });
    });
    document.getElementById('propEqLowMid')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (eqPresetSelect) eqPresetSelect.value = 'none';
      updateEQProp({ lowMid: val });
    });
    document.getElementById('propEqHighMid')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (eqPresetSelect) eqPresetSelect.value = 'none';
      updateEQProp({ highMid: val });
    });
    document.getElementById('propEqHigh')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (eqPresetSelect) eqPresetSelect.value = 'none';
      updateEQProp({ high: val });
    });

    // Dynamics Compressor Controls & Visualizer
    const compToggle = document.getElementById('propCompEnabled');
    const compContainer = document.getElementById('compControlsContainer');
    const compCanvas = document.getElementById('compCurveCanvas');

    const redrawComp = () => {
      if (compCanvas && window.audioEffectsManager) {
        window.audioEffectsManager.renderCompressorCurve(compCanvas, clip.compressor || {});
      }
    };
    redrawComp();

    const updateCompProp = (patch) => {
      const currentComp = {
        enabled: true,
        threshold: -24,
        ratio: 8,
        knee: 30,
        attack: 0.003,
        release: 0.25,
        ...(clip.compressor && typeof clip.compressor === 'object' ? clip.compressor : {}),
        ...patch
      };
      clip.compressor = currentComp;
      update({ compressor: currentComp });
      redrawComp();
    };

    compToggle?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (compContainer) compContainer.style.display = enabled ? 'block' : 'none';
      updateCompProp({ enabled });
      redrawComp();
    });

    document.getElementById('propCompThreshold')?.addEventListener('input', (e) => updateCompProp({ threshold: parseFloat(e.target.value) }));
    document.getElementById('propCompRatio')?.addEventListener('input', (e) => updateCompProp({ ratio: parseFloat(e.target.value) }));
    document.getElementById('propCompKnee')?.addEventListener('input', (e) => updateCompProp({ knee: parseFloat(e.target.value) }));
    document.getElementById('propCompRelease')?.addEventListener('input', (e) => updateCompProp({ release: parseFloat(e.target.value) }));

    // Speed Ramping & Optical Flow Controls
    const speedCanvas = document.getElementById('speedCurveCanvas');
    const redrawSpeed = () => {
      if (speedCanvas && window.speedRampEngine) {
        const points = clip.speedPoints || window.speedRampEngine.getPresetPoints(clip.speedPreset || 'none', clip.duration || 10);
        window.speedRampEngine.renderSpeedCurve(speedCanvas, points, clip.duration || 10);
      }
    };
    redrawSpeed();

    document.getElementById('propSpeed')?.addEventListener('input', (e) => {
      const spd = parseFloat(e.target.value);
      update({ speed: spd });
      redrawSpeed();
    });

    document.getElementById('propSpeedPreset')?.addEventListener('change', (e) => {
      const presetId = e.target.value;
      if (window.speedRampEngine) {
        const points = window.speedRampEngine.getPresetPoints(presetId, clip.duration || 10);
        clip.speedPreset = presetId;
        clip.speedPoints = points;
        update({ speedPreset: presetId, speedPoints: points });
        redrawSpeed();
      }
    });

    document.getElementById('propOpticalFlow')?.addEventListener('change', (e) => {
      update({ opticalFlow: e.target.checked });
      window.app?.showToast(e.target.checked ? 'Enabled Optical Flow motion frame blending' : 'Disabled Optical Flow');
    });

    document.getElementById('propPreservePitch')?.addEventListener('change', (e) => {
      update({ preservePitch: e.target.checked });
    });

    document.getElementById('propShowSpeedCurve')?.addEventListener('change', (e) => {
      update({ showSpeedCurve: e.target.checked });
    });


    // Masking
    const maskToggle = document.getElementById('propMaskEnabled');
    const maskControls = document.getElementById('maskControls');
    
    const updateMaskProp = (key, val) => {
      const currentMask = clip.mask || { enabled: true, type: 'rectangle', feather: 0, invert: false };
      currentMask[key] = val;
      update({ mask: currentMask });
    };

    maskToggle?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (maskControls) maskControls.style.display = enabled ? 'flex' : 'none';
      updateMaskProp('enabled', enabled);
    });

    document.getElementById('btnMaskRect')?.addEventListener('click', () => updateMaskProp('type', 'rectangle'));
    document.getElementById('btnMaskEllipse')?.addEventListener('click', () => updateMaskProp('type', 'ellipse'));
    document.getElementById('propMaskFeather')?.addEventListener('input', (e) => updateMaskProp('feather', parseInt(e.target.value, 10)));
    document.getElementById('propMaskInvert')?.addEventListener('change', (e) => updateMaskProp('invert', e.target.checked));

    // Color Curves
    const curvesToggle = document.getElementById('propColorCurvesEnabled');
    const curvesContainer = document.getElementById('colorCurvesContainer');
    const curvesMount = document.getElementById('curvesWidgetMount');

    if (curvesMount && clip.colorCurves && window.colorCurvesEngine && window.ColorCurvesWidget) {
      window.colorCurvesEngine.deserialize(clip.colorCurves);
      new window.ColorCurvesWidget(curvesMount, window.colorCurvesEngine, (curvesData) => {
        update({ colorCurves: curvesData });
      });
    }

    curvesToggle?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      if (curvesContainer) curvesContainer.style.display = enabled ? 'block' : 'none';
      if (enabled) {
        if (!clip.colorCurves && window.colorCurvesEngine) {
          window.colorCurvesEngine.resetAll();
          clip.colorCurves = window.colorCurvesEngine.serialize();
        }
        update({ colorCurves: clip.colorCurves });
        this.render();
      } else {
        update({ colorCurves: null });
      }
    });

    // Auto-Reframe
    const reframeStatus = document.getElementById('reframeStatus');
    const runReframe = async (ratio) => {
      const videoEl = window.compositor?.mediaCache?.get(clip.sourcePath);
      if (!videoEl || !(videoEl instanceof HTMLVideoElement)) {
        alert('Please select a valid video clip to reframe.');
        return;
      }
      if (reframeStatus) reframeStatus.textContent = 'Analyzing and reframing...';
      await window.autoReframeEngine.reframeClip(clip, videoEl, ratio, 'smooth', (pct, msg) => {
        if (reframeStatus) reframeStatus.textContent = `${msg} (${pct}%)`;
      });
      if (reframeStatus) reframeStatus.textContent = `Reframed to ${ratio}!`;
      this.render();
      window.previewEngine?.updatePreview();
    };

    document.getElementById('btnReframe916')?.addEventListener('click', () => runReframe('9:16'));
    document.getElementById('btnReframe11')?.addEventListener('click', () => runReframe('1:1'));
    document.getElementById('btnReframe45')?.addEventListener('click', () => runReframe('4:5'));

    // Motion Tracking
    const trackStatus = document.getElementById('trackStatus');
    document.getElementById('btnTrackForward')?.addEventListener('click', async () => {
      const videoEl = window.compositor?.mediaCache?.get(clip.sourcePath);
      if (!videoEl || !(videoEl instanceof HTMLVideoElement)) {
        alert('Please select a video clip to track.');
        return;
      }
      if (trackStatus) trackStatus.textContent = 'Tracking subject motion...';
      await window.motionTracker.trackForward(clip, videoEl, 0, clip.duration, (pct, msg) => {
        if (trackStatus) trackStatus.textContent = msg;
      });
      if (trackStatus) trackStatus.textContent = `Tracking complete (${window.motionTracker.trackedTrajectory.length} pts). Select overlay and click Attach.`;
      window.previewEngine?.updatePreview();
    });

    document.getElementById('btnAttachOverlay')?.addEventListener('click', () => {
      const allSelected = store.get('selection.clipIds') || [];
      if (allSelected.length < 2) {
        // Attach current clip
        window.motionTracker.attachClipToTrack(clip.id, 0, -60);
        window.app?.showToast('Attached to tracking path!');
      } else {
        const overlayId = allSelected.find(id => id !== clip.id);
        if (overlayId) {
          window.motionTracker.attachClipToTrack(overlayId, 0, -60);
          window.app?.showToast('Overlay attached to motion track!');
        }
      }
      this.render();
    });

    // Scene Edit Detection
    const sceneStatus = document.getElementById('sceneDetectStatus');
    document.getElementById('btnDetectSceneCuts')?.addEventListener('click', async () => {
      const videoEl = window.compositor?.mediaCache?.get(clip.sourcePath);
      if (!videoEl || !(videoEl instanceof HTMLVideoElement)) {
        alert('Select a video clip for scene cut detection.');
        return;
      }
      if (sceneStatus) sceneStatus.textContent = 'Scanning frames for camera cuts...';
      const cuts = await window.sceneEditDetector.detectCuts(clip, videoEl, (pct, msg) => {
        if (sceneStatus) sceneStatus.textContent = msg;
      });
      if (cuts.length > 0) {
        if (confirm(`Detected ${cuts.length} camera cuts. Automatically slice clip into shots on the timeline?`)) {
          window.sceneEditDetector.sliceClipAtCuts(clip.id);
          window.app?.showToast(`Sliced clip into ${cuts.length + 1} shots!`);
        }
      } else {
        alert('No camera cuts detected (continuous shot).');
      }
    });

    // Compound Clips
    document.getElementById('btnCreateCompound')?.addEventListener('click', () => {
      const name = prompt('Enter Compound Clip Name:', 'Compound Sequence 1');
      if (name) {
        window.compoundClipsEngine.createCompoundClipFromSelection(name);
        window.app?.showToast('Compound clip created!');
      }
    });

    document.getElementById('btnUnpackCompound')?.addEventListener('click', () => {
      if (confirm('Unpack this compound clip back into master timeline tracks?')) {
        window.compoundClipsEngine.unpackCompoundClip(clip.id);
        window.app?.showToast('Compound clip unpacked!');
      }
    });

    // Audio AI & Vocal Isolation
    const updateAudioAi = (key, val) => {
      const audioAi = clip.audioAi || { deHum: false, rumbleCut: false, clarity: 0, deEsser: 0, preset: 'flat' };
      audioAi[key] = val;
      update({ audioAi });
    };

    document.getElementById('propAudioAiPreset')?.addEventListener('change', (e) => {
      const preset = e.target.value;
      const audioAi = clip.audioAi || {};
      audioAi.preset = preset;
      if (preset === 'podcast-pro') {
        audioAi.deHum = true;
        audioAi.rumbleCut = true;
        audioAi.clarity = 4;
        audioAi.deEsser = 5;
      } else if (preset === 'vocal-isolation') {
        audioAi.deHum = true;
        audioAi.rumbleCut = true;
        audioAi.clarity = 7;
        audioAi.deEsser = 4;
      } else if (preset === 'de-hum-denoise') {
        audioAi.deHum = true;
        audioAi.rumbleCut = true;
      }
      update({ audioAi });
      this.render();
    });

    document.getElementById('propDeHum')?.addEventListener('change', (e) => updateAudioAi('deHum', e.target.checked));
    document.getElementById('propRumbleCut')?.addEventListener('change', (e) => updateAudioAi('rumbleCut', e.target.checked));
    document.getElementById('propVocalClarity')?.addEventListener('input', (e) => updateAudioAi('clarity', parseInt(e.target.value, 10)));
    document.getElementById('propDeEsser')?.addEventListener('input', (e) => updateAudioAi('deEsser', parseInt(e.target.value, 10)));

    // Effect removal
    document.querySelectorAll('.btn-remove-fx').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const effects = [...(clip.effects || [])];
        effects.splice(idx, 1);
        update({ effects });
        this.render();
      });
    });
  }
}

window.inspector = new Inspector();
