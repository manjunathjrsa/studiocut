/**
 * StudioCut — Preview Compositor
 * Multi-layer compositor for video, image, text, and effects on the preview canvas
 */

class Compositor {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.mediaCache = new Map(); // path -> HTMLVideoElement or HTMLImageElement
    this.showGuides = false;
  }

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /**
   * Render frame at current project time
   * @param {number} currentTime
   * @param {Array} tracks
   * @param {object} settings - { width, height, backgroundColor }
   */
  renderFrame(currentTime, tracks, settings = { width: 1920, height: 1080, backgroundColor: '#000000' }) {
    if (!this.canvas || !this.ctx) return;

    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const pw = settings.width || 1920;
    const ph = settings.height || 1080;

    // Reset transform matrix to identity to prevent any transform stacking / DPR drift
    ctx.resetTransform();

    // Clear entire canvas buffer
    ctx.fillStyle = settings.backgroundColor || '#000000';
    ctx.fillRect(0, 0, cw, ch);

    // Calculate fit-to-canvas scale
    const scale = Math.min(cw / pw, ch / ph);
    const offsetX = (cw - pw * scale) / 2;
    const offsetY = (ch - ph * scale) / 2;

    ctx.save();
    // Offset and scale strictly to project coordinate space
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw project canvas background
    ctx.fillStyle = settings.backgroundColor || '#000000';
    ctx.fillRect(0, 0, pw, ph);

    // Clip strictly to project bounds
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();

    // Iterate tracks from bottom to top (or video tracks in order)
    const sortedTracks = [...(tracks || [])].reverse();
    for (const track of sortedTracks) {
      if (!track.visible) continue;

      const clipsToRender = (track.clips || []).filter(
        c => currentTime >= c.startTime && currentTime < c.startTime + c.duration
      );

      for (const clip of clipsToRender) {
        if (clip.mediaType === 'adjustment') {
          // Special Adjustment Layer Rendering
          // Apply effects to the composite underneath
          if (clip.colorWheels) {
             const resultCanvas = window.effectsEngine?.applyColorWheels(this.canvas, clip.colorWheels, pw, ph);
             if (resultCanvas) ctx.drawImage(resultCanvas, 0, 0, pw, ph);
          }
          if (clip.colorCurves && window.colorCurvesEngine) {
             const resultCanvas = window.colorCurvesEngine.applyToCanvas(this.canvas, clip.colorCurves);
             if (resultCanvas) ctx.drawImage(resultCanvas, 0, 0, pw, ph);
          }
        } else if (clip.mediaType === 'compound' && window.compoundClipsEngine) {
          window.compoundClipsEngine.renderCompoundClip(ctx, clip, currentTime, pw, ph);
        } else if (clip.mediaType === 'multicam' && window.multiCamEngine?.active) {
          window.multiCamEngine.renderQuadSplit(ctx, pw, ph, currentTime);
        } else if (clip.mediaType === 'multicam') {
          const angle = (clip.angles && clip.angles[clip.activeAngleIndex || 0])?.clip || clip;
          this._renderClipLayer(ctx, angle, currentTime, pw, ph);
        } else {
          this._renderClipLayer(ctx, clip, currentTime, pw, ph);
        }
      }
    }

    // Guides (title safe, action safe)
    if (this.showGuides) {
      this._renderGuides(ctx, pw, ph);
    }

    // Interactive Transform Gizmo for selected clip
    this._renderGizmo(ctx, currentTime, tracks, pw, ph);

    // Motion Tracking overlay
    if (window.motionTracker?.isTracking || window.motionTracker?.trackedTrajectory?.length > 0) {
      window.motionTracker.renderTrackingGizmo(ctx, pw, ph);
    }

    ctx.restore();

    // Video Scopes real-time analysis
    if (window.videoScopes?.visible) {
      window.videoScopes.analyzeAndDraw(this.canvas);
    }
  }

  _renderGizmo(ctx, currentTime, tracks, pw, ph) {
    const selectedIds = store.get('selection.clipIds') || [];
    if (selectedIds.length === 0) return;

    const primaryId = selectedIds[0];
    let activeClip = null;

    for (const track of tracks) {
      const found = track.clips?.find(c => c.id === primaryId);
      if (found && currentTime >= found.startTime && currentTime < found.startTime + found.duration) {
        activeClip = found;
        break;
      }
    }

    if (!activeClip) return;

    const clipTime = currentTime - activeClip.startTime;
    const baseTransform = activeClip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    const kfX = window.keyframeEngine?.getValueAtTime(activeClip.id, 'transform.x', clipTime, null);
    const kfY = window.keyframeEngine?.getValueAtTime(activeClip.id, 'transform.y', clipTime, null);
    const kfScaleX = window.keyframeEngine?.getValueAtTime(activeClip.id, 'transform.scaleX', clipTime, null);
    const kfScaleY = window.keyframeEngine?.getValueAtTime(activeClip.id, 'transform.scaleY', clipTime, null);
    const kfRot = window.keyframeEngine?.getValueAtTime(activeClip.id, 'transform.rotation', clipTime, null);

    const tx = kfX !== null ? kfX : (baseTransform.x || 0);
    const ty = kfY !== null ? kfY : (baseTransform.y || 0);
    const sx = kfScaleX !== null ? kfScaleX : (baseTransform.scaleX || 1);
    const sy = kfScaleY !== null ? kfScaleY : (baseTransform.scaleY || 1);
    const rot = kfRot !== null ? kfRot : (baseTransform.rotation || 0);

    const centerX = pw / 2 + tx;
    const centerY = ph / 2 + ty;

    ctx.save();
    ctx.translate(centerX, centerY);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sx, sy);

    const halfW = pw / 2;
    const halfH = ph / 2;

    // Outer Bounding Box
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = Math.max(1, 2 / Math.max(0.2, (sx + sy) / 2));
    ctx.strokeRect(-halfW, -halfH, pw, ph);

    // Corner Handles
    const handleSize = Math.max(6, 12 / Math.max(0.2, (sx + sy) / 2));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#00cec9';
    ctx.lineWidth = 1.5;

    const corners = [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH]
    ];

    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    }

    // Top Rotation Handle
    const rotStemY = -halfH - 24 / Math.max(0.2, sy);
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, rotStemY);
    ctx.strokeStyle = '#00f2fe';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, rotStemY, handleSize * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#00cec9';
    ctx.fill();
    ctx.stroke();

    // Draw Mask Gizmo if active
    if (activeClip.mask && activeClip.mask.enabled) {
      const mx = activeClip.mask.x || 0;
      const my = activeClip.mask.y || 0;
      const mw = activeClip.mask.width || pw / 2;
      const mh = activeClip.mask.height || ph / 2;
      
      ctx.strokeStyle = '#e17055';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (activeClip.mask.type === 'rectangle') {
        ctx.rect(mx - mw/2, my - mh/2, mw, mh);
      } else if (activeClip.mask.type === 'ellipse') {
        ctx.ellipse(mx, my, mw/2, mh/2, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Mask handle
      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.arc(mx, my, handleSize * 0.8, 0, Math.PI * 2);
      ctx.fill();
      
      // Mask edge handle (for sizing)
      ctx.beginPath();
      ctx.arc(mx + mw/2, my, handleSize * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // --- Luma Waveform Scopes ---
  renderWaveformScope(canvasEl, videoCanvas, pw, ph) {
    if (!canvasEl || !videoCanvas) return;
    const ctx = canvasEl.getContext('2d');
    const w = canvasEl.width;
    const h = canvasEl.height;
    
    // Subsample the video canvas for performance
    const sampleW = 256;
    const sampleH = 256;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sampleW;
    tempCanvas.height = sampleH;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(videoCanvas, 0, 0, sampleW, sampleH);
    
    const imgData = tCtx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    
    for (let x = 0; x < sampleW; x++) {
      for (let y = 0; y < sampleH; y++) {
        const i = (y * sampleW + x) * 4;
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // Map luma to height
        const plotY = h - (luma / 255) * h;
        const plotX = (x / sampleW) * w;
        
        ctx.fillRect(plotX, plotY, 1, 1);
      }
    }
  }

  _renderClipLayer(ctx, clip, currentTime, pw, ph) {
    ctx.save();

    if (clip.blendMode && clip.blendMode !== 'normal') {
      ctx.globalCompositeOperation = clip.blendMode;
    }

    const clipTime = currentTime - clip.startTime;

    // Keyframe or static Opacity
    const kfOpacity = window.keyframeEngine?.getValueAtTime(clip.id, 'opacity', clipTime, null);
    const opacity = kfOpacity !== null && kfOpacity !== undefined
      ? kfOpacity
      : (clip.opacity !== undefined ? clip.opacity : 1);
    ctx.globalAlpha = MathUtils.clamp(opacity, 0, 1);

    // Keyframe or static Transform
    const baseTransform = clip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    const kfX = window.keyframeEngine?.getValueAtTime(clip.id, 'transform.x', clipTime, null);
    const kfY = window.keyframeEngine?.getValueAtTime(clip.id, 'transform.y', clipTime, null);
    const kfScaleX = window.keyframeEngine?.getValueAtTime(clip.id, 'transform.scaleX', clipTime, null);
    const kfScaleY = window.keyframeEngine?.getValueAtTime(clip.id, 'transform.scaleY', clipTime, null);
    const kfRot = window.keyframeEngine?.getValueAtTime(clip.id, 'transform.rotation', clipTime, null);

    const tx = kfX !== null ? kfX : (baseTransform.x || 0);
    const ty = kfY !== null ? kfY : (baseTransform.y || 0);
    const sx = kfScaleX !== null ? kfScaleX : (baseTransform.scaleX || 1);
    const sy = kfScaleY !== null ? kfScaleY : (baseTransform.scaleY || 1);
    const rot = kfRot !== null ? kfRot : (baseTransform.rotation || 0);

    const hasMask = clip.mask?.enabled && clip.mask.type;

    if (hasMask) {
      if (!this.maskBuffer) {
        this.maskBuffer = document.createElement('canvas');
        this.maskCtx = this.maskBuffer.getContext('2d');
      }
      if (this.maskBuffer.width !== pw || this.maskBuffer.height !== ph) {
        this.maskBuffer.width = pw;
        this.maskBuffer.height = ph;
      }
      
      const mCtx = this.maskCtx;
      mCtx.clearRect(0, 0, pw, ph);
      
      // 1. Draw clip into buffer
      mCtx.save();
      mCtx.translate(pw / 2 + tx, ph / 2 + ty);
      if (rot) mCtx.rotate((rot * Math.PI) / 180);
      mCtx.scale(sx, sy);
      
      mCtx.globalAlpha = MathUtils.clamp(opacity, 0, 1);
      if (clip.filters) {
        const filters = [];
        if (clip.filters.brightness !== undefined) filters.push(`brightness(${clip.filters.brightness})`);
        if (clip.filters.contrast !== undefined) filters.push(`contrast(${clip.filters.contrast})`);
        if (clip.filters.saturation !== undefined) filters.push(`saturate(${clip.filters.saturation})`);
        if (clip.filters.blur) filters.push(`blur(${clip.filters.blur}px)`);
        if (clip.filters.hue) filters.push(`hue-rotate(${clip.filters.hue}deg)`);
        if (filters.length > 0) mCtx.filter = filters.join(' ');
      }
      
      this._drawClipContent(mCtx, clip, currentTime, pw, ph);
      mCtx.restore();
      
      // 2. Draw mask shape with composite operation
      mCtx.save();
      mCtx.globalCompositeOperation = clip.mask.invert ? 'destination-out' : 'destination-in';
      mCtx.translate(pw / 2 + tx, ph / 2 + ty); // Mask is relative to clip transform
      if (rot) mCtx.rotate((rot * Math.PI) / 180);
      mCtx.scale(sx, sy);
      
      if (clip.mask.feather > 0) {
        mCtx.filter = `blur(${clip.mask.feather}px)`;
      }
      
      mCtx.fillStyle = '#ffffff';
      mCtx.beginPath();
      
      const mx = clip.mask.x || 0;
      const my = clip.mask.y || 0;
      const mw = clip.mask.width || pw / 2;
      const mh = clip.mask.height || ph / 2;
      
      if (clip.mask.type === 'rectangle') {
        mCtx.rect(mx - mw / 2, my - mh / 2, mw, mh);
      } else if (clip.mask.type === 'ellipse') {
        mCtx.ellipse(mx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      }
      mCtx.fill();
      mCtx.restore();
      
      // 3. Draw buffer to main context
      ctx.drawImage(this.maskBuffer, 0, 0, pw, ph);
      
    } else {
      // Normal Render
      const centerX = pw / 2 + tx;
      const centerY = ph / 2 + ty;
      ctx.globalAlpha = MathUtils.clamp(opacity, 0, 1);
      ctx.translate(centerX, centerY);
      if (rot) {
        ctx.rotate((rot * Math.PI) / 180);
      }
      ctx.scale(sx, sy);
  
      if (clip.filters) {
        const filters = [];
        if (clip.filters.brightness !== undefined) filters.push(`brightness(${clip.filters.brightness})`);
        if (clip.filters.contrast !== undefined) filters.push(`contrast(${clip.filters.contrast})`);
        if (clip.filters.saturation !== undefined) filters.push(`saturate(${clip.filters.saturation})`);
        if (clip.filters.blur) filters.push(`blur(${clip.filters.blur}px)`);
        if (clip.filters.hue) filters.push(`hue-rotate(${clip.filters.hue}deg)`);
        if (filters.length > 0) ctx.filter = filters.join(' ');
      }
      
      if (clip.dropShadow?.enabled) {
        ctx.shadowColor = clip.dropShadow.color || 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = clip.dropShadow.blur || 10;
        ctx.shadowOffsetX = clip.dropShadow.offsetX || 5;
        ctx.shadowOffsetY = clip.dropShadow.offsetY || 5;
      }
  
      this._drawClipContent(ctx, clip, currentTime, pw, ph);
      
      // Draw Stroke
      if (clip.stroke?.enabled) {
        ctx.shadowColor = 'transparent'; // Disable shadow for stroke
        ctx.strokeStyle = clip.stroke.color || '#ffffff';
        ctx.lineWidth = clip.stroke.width || 5;
        ctx.strokeRect(-pw/2, -ph/2, pw, ph);
      }
    }

    ctx.restore();
  }

  _drawClipContent(ctx, clip, currentTime, pw, ph) {
    if (clip.mediaType === 'text') {
      this._renderTextClip(ctx, clip, pw, ph);
    } else if (clip.mediaType === 'color') {
      ctx.fillStyle = clip.color || '#ffffff';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    } else if (clip.sourcePath) {
      this._renderMediaClip(ctx, clip, currentTime, pw, ph);
    }
  }

  _renderMediaClip(ctx, clip, currentTime, pw, ph) {
    let mediaEl = this.mediaCache.get(clip.sourcePath);

    if (!mediaEl) {
      const toUrl = (p) => {
        if (!p) return '';
        if (p.startsWith('blob:') || p.startsWith('data:') || p.startsWith('http')) return p;
        const clean = p.replace(/\\/g, '/');
        return clean.startsWith('/') ? `file://${clean}` : `file:///${clean}`;
      };

      if (clip.mediaType === 'image') {
        mediaEl = new Image();
        mediaEl.onload = () => {
          if (window.previewEngine && !window.previewEngine.isPlaying) {
            window.previewEngine.updatePreview();
          }
        };
        mediaEl.src = toUrl(clip.sourcePath);
      } else {
        mediaEl = document.createElement('video');
        mediaEl.muted = true;
        mediaEl.preload = 'auto';
        mediaEl.playsInline = true;

        mediaEl.onloadedmetadata = () => {
          if (window.previewEngine && !window.previewEngine.isPlaying) {
            window.previewEngine.updatePreview();
          }
        };
        mediaEl.onloadeddata = () => {
          if (window.previewEngine && !window.previewEngine.isPlaying) {
            window.previewEngine.updatePreview();
          }
        };

        mediaEl.src = toUrl(clip.sourcePath);
      }
      this.mediaCache.set(clip.sourcePath, mediaEl);
    }

    // If video, synchronize seek position and native audio playback
    if (mediaEl instanceof HTMLVideoElement) {
      if ('preservesPitch' in mediaEl) {
        mediaEl.preservesPitch = (clip.preservePitch !== false);
      }
      const clipElapsed = currentTime - clip.startTime;
      const targetSourceTime = (clip.speedPoints && window.speedRampEngine)
        ? window.speedRampEngine.getSourceTimeAt(clip, clipElapsed)
        : ((clip.sourceStartTime || 0) + clipElapsed * (clip.speed || 1));

      // Attach seek listeners once for non-blocking smooth scrubbing
      if (!mediaEl._hasSeekListener) {
        mediaEl._hasSeekListener = true;
        mediaEl._isSeeking = false;
        mediaEl._pendingSeekTime = null;

        mediaEl.addEventListener('seeking', () => {
          mediaEl._isSeeking = true;
        });

        mediaEl.addEventListener('seeked', () => {
          mediaEl._isSeeking = false;
          if (mediaEl._pendingSeekTime !== null) {
            const nextTime = mediaEl._pendingSeekTime;
            mediaEl._pendingSeekTime = null;
            if (Math.abs(mediaEl.currentTime - nextTime) > 0.03) {
              if ('fastSeek' in mediaEl) {
                mediaEl.fastSeek(nextTime);
              } else {
                mediaEl.currentTime = nextTime;
              }
            }
          }
          if (window.previewEngine && !window.previewEngine.isPlaying) {
            window.previewEngine.updatePreview();
          }
        });
      }
      
      const isPlaying = window.previewEngine?.isPlaying;
      const track = (store.get('tracks') || []).find(t => t.clips && t.clips.some(c => c.id === clip.id));
      const isTrackMuted = track ? (track.muted || !track.visible) : false;
      
      if (isPlaying && clip.speed === 1) {
        // Native audio output while playing
        if (!isTrackMuted) {
          mediaEl.muted = false;
          const clipVol = clip.volume !== undefined ? clip.volume : 1;
          const masterVol = store.get('project.settings.masterVolume') ?? 1;
          mediaEl.volume = MathUtils.clamp(clipVol * masterVol, 0, 1);
        } else {
          mediaEl.muted = true;
        }

        if (mediaEl.paused) {
          mediaEl.play().catch(e => console.warn('Video play blocked:', e));
        }

        // Smooth drift management during playback
        const drift = mediaEl.currentTime - targetSourceTime;
        if (Math.abs(drift) > 0.8) {
          // Hard seek only on severe desync
          mediaEl.currentTime = targetSourceTime;
        } else if (Math.abs(drift) > 0.08) {
          // Subtle rate nudging to eliminate drift without any stutter or frame drop
          mediaEl.playbackRate = drift < 0 ? 1.05 : 0.95;
        } else {
          mediaEl.playbackRate = 1.0;
        }
      } else {
        mediaEl.muted = true;
        if (!mediaEl.paused) mediaEl.pause();

        // Non-blocking scrub seek: avoids choking the Chromium video decoder
        if (Math.abs(mediaEl.currentTime - targetSourceTime) > 0.03) {
          if (mediaEl._isSeeking) {
            mediaEl._pendingSeekTime = targetSourceTime;
          } else {
            mediaEl._pendingSeekTime = null;
            if ('fastSeek' in mediaEl) {
              mediaEl.fastSeek(targetSourceTime);
            } else {
              mediaEl.currentTime = targetSourceTime;
            }
          }
        }
      }
    }

    // Video is ready to paint if dimensions are known (videoWidth > 0) or metadata loaded (readyState >= 1)
    // The decoded video frame is retained in the GPU buffer even while a background seek is in-flight!
    const isVideo = mediaEl instanceof HTMLVideoElement;
    const isImage = mediaEl instanceof HTMLImageElement;
    const isReady = (isVideo && (mediaEl.videoWidth > 0 || mediaEl.readyState >= 1)) ||
                    (isImage && mediaEl.complete && mediaEl.naturalWidth > 0);

    if (!isReady) return;

    let renderTarget = mediaEl;

    // Proxy Engine downscaling
    if (window.proxyEngine?.proxyEnabled) {
      renderTarget = window.proxyEngine.getOrCreateProxy(clip.sourcePath, renderTarget);
    }

    // Optical Flow / Frame Blending for slow motion
    if (clip.opticalFlow && window.speedRampEngine) {
      renderTarget = window.speedRampEngine.applyOpticalFlow(renderTarget, clip, 0.45);
    }

    // Chroma Key Processing (Green Screen)
    if (clip.chromaKey?.enabled && window.effectsEngine?.isSupported) {
      renderTarget = window.effectsEngine.applyEffect('chroma-key', clip.chromaKey, renderTarget, currentTime);
    }

    // Primary Color Correction (3-Way Color Wheels)
    if (clip.colorWheels?.enabled && window.effectsEngine?.isSupported) {
      renderTarget = window.effectsEngine.applyEffect('color-wheels', clip.colorWheels, renderTarget, currentTime);
    }

    // Lumetri HSL Secondary Isolation & Correction
    if (clip.hslSecondary?.enabled && window.effectsEngine?.isSupported) {
      renderTarget = window.effectsEngine.applyEffect('hsl-secondary', clip.hslSecondary, renderTarget, currentTime);
    }

    // Color Curves (RGB & Luma Splines)
    if (clip.colorCurves && window.colorCurvesEngine) {
      renderTarget = window.colorCurvesEngine.applyToCanvas(renderTarget, clip.colorCurves);
    }

    // Shader Effects Chain Processing
    if (clip.effects && clip.effects.length > 0 && window.effectsEngine?.isSupported) {
      for (const ef of clip.effects) {
        renderTarget = window.effectsEngine.applyEffect(ef.type, ef.properties || {}, renderTarget, currentTime);
      }
    }

    ctx.drawImage(renderTarget, -pw / 2, -ph / 2, pw, ph);
  }

  _renderTextClip(ctx, clip, pw, ph) {
    // Dynamic Karaoke Subtitles
    if (clip.captionData && window.autoCaptionsEngine) {
      window.autoCaptionsEngine.renderKaraokeCaption(ctx, clip, currentTime, pw, ph);
      return;
    }

    const text = clip.text || clip.name || 'Text Title';
    const style = clip.textStyle || {};

    const fontSize = style.fontSize || 72;
    const fontFamily = style.fontFamily || 'Inter, sans-serif';
    const fontWeight = style.fontWeight || '700';
    const color = style.color || '#ffffff';

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = style.textAlign || 'center';
    ctx.textBaseline = 'middle';

    // Shadow
    if (style.shadow) {
      ctx.shadowColor = style.shadowColor || 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = style.shadowBlur || 12;
      ctx.shadowOffsetX = style.shadowOffsetX || 2;
      ctx.shadowOffsetY = style.shadowOffsetY || 4;
    }

    // Outline
    if (style.outlineWidth) {
      ctx.strokeStyle = style.outlineColor || '#000000';
      ctx.lineWidth = style.outlineWidth;
      ctx.strokeText(text, 0, 0);
    }

    // Fill
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
  }

  _renderGuides(ctx, pw, ph) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Action Safe (90%)
    ctx.strokeRect(pw * 0.05, ph * 0.05, pw * 0.9, ph * 0.9);

    // Title Safe (80%)
    ctx.strokeStyle = 'rgba(255, 118, 117, 0.4)';
    ctx.strokeRect(pw * 0.1, ph * 0.1, pw * 0.8, ph * 0.8);

    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(pw / 2 - 20, ph / 2);
    ctx.lineTo(pw / 2 + 20, ph / 2);
    ctx.moveTo(pw / 2, ph / 2 - 20);
    ctx.lineTo(pw / 2 + 20, ph / 2);
    ctx.stroke();

    ctx.restore();
  }

  pauseAllMedia() {
    for (const el of this.mediaCache.values()) {
      if (el instanceof HTMLVideoElement) {
        el.muted = true;
        if (!el.paused) el.pause();
      }
    }
  }
}

window.compositor = new Compositor();
