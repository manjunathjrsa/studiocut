/**
 * StudioCut — Clip Renderer
 * Renders clips onto the timeline canvas with thumbnails, waveforms, and trim handles
 */

class ClipRenderer {
  constructor() {
    this.trimHandleWidth = 8;
    this._thumbCache = new Map();
  }

  /**
   * Render a single clip onto the canvas context
   */
  renderClip(ctx, clip, track, trackY, zoom, scrollX, isSelected = false) {
    const x = clip.startTime * zoom - scrollX;
    const width = clip.duration * zoom;
    const y = trackY + 2;
    const height = track.height - 4;

    // Skip if offscreen
    if (x + width < 0 || x > ctx.canvas.width) return;

    ctx.save();

    // Determine colors
    const baseColor = clip.color || ColorUtils.getClipColor(clip.mediaType || track.type);
    const isAudio = (clip.mediaType === 'audio' || track.type === 'audio');

    // 1. Clip background with rounded corners
    const radius = 4;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(width, 2), height, radius);

    // Gradient fill
    const grad = ctx.createLinearGradient(x, y, x, y + height);
    grad.addColorStop(0, ColorUtils.adjustBrightness(baseColor, 15));
    grad.addColorStop(1, ColorUtils.adjustBrightness(baseColor, -15));
    ctx.fillStyle = grad;
    ctx.fill();

    // Clip clipping area for content
    ctx.clip();

    // 2. Thumbnails filmstrip (for video/image)
    if (!isAudio && ((clip.thumbnails && clip.thumbnails.length > 0) || clip.thumbnail)) {
      this._renderThumbnails(ctx, clip, x, y, width, height);
    }

    // 3. Audio waveform (for audio clips or video with audio)
    if (clip.waveform || isAudio) {
      this._renderWaveform(ctx, clip, x, y, width, height);
    }

    // 4. Header banner for text label
    const headerHeight = Math.min(20, height * 0.4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x, y, width, headerHeight);

    // 5. Clip title & duration
    if (width > 24) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px Inter, sans-serif';
      ctx.textBaseline = 'middle';

      // Truncate name to fit
      const icon = this._getMediaIcon(clip.mediaType || track.type);
      const title = `${icon} ${clip.name || 'Clip'}`;
      let text = title;
      const maxTextWidth = width - 16;
      if (ctx.measureText(text).width > maxTextWidth) {
        while (text.length > 4 && ctx.measureText(text + '…').width > maxTextWidth) {
          text = text.slice(0, -1);
        }
        text += '…';
      }
      ctx.fillText(text, x + 6, y + headerHeight / 2);

      // Duration label if there's enough room
      if (width > 120) {
        const durText = TimeUtils.secondsToTimecode(clip.duration);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px "JetBrains Mono", monospace';
        const durWidth = ctx.measureText(durText).width;
        ctx.fillText(durText, x + width - durWidth - 8, y + headerHeight / 2);
      }
    }

    // 6. Badges (speed, effects, chroma, lut)
    let badgeX = x + width - 36;
    if (clip.speed && clip.speed !== 1 && width > 50) {
      this._renderBadge(ctx, `${clip.speed}x`, badgeX, y + height - 16, '#ff7675');
      badgeX -= 34;
    }
    if (clip.chromaKey?.enabled && width > 80) {
      this._renderBadge(ctx, 'GS', badgeX, y + height - 16, '#00b894');
      badgeX -= 28;
    }
    if (clip.lutPreset && clip.lutPreset !== 'none' && width > 110) {
      this._renderBadge(ctx, 'LUT', badgeX, y + height - 16, '#0984e3');
    }

    // Speed Curve Overlay (if toggled or has points)
    if (clip.speedPoints && clip.speedPoints.length > 0 && clip.showSpeedCurve !== false) {
      this._renderSpeedCurve(ctx, clip, x, y, width, height, zoom);
    }

    // Audio Fade Curves
    if (clip.fadeIn > 0 && isAudio && width > 10) {
      const fadeWidth = Math.min(width, clip.fadeIn * zoom);
      ctx.save();
      ctx.fillStyle = 'rgba(0, 206, 201, 0.25)';
      ctx.beginPath();
      ctx.moveTo(x, y + height);
      ctx.lineTo(x + fadeWidth, y);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (clip.fadeOut > 0 && isAudio && width > 10) {
      const fadeWidth = Math.min(width, clip.fadeOut * zoom);
      ctx.save();
      ctx.fillStyle = 'rgba(0, 206, 201, 0.25)';
      ctx.beginPath();
      ctx.moveTo(x + width, y + height);
      ctx.lineTo(x + width - fadeWidth, y);
      ctx.lineTo(x + width, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Color Label Stripe
    if (clip.colorLabel) {
      ctx.save();
      ctx.fillStyle = clip.colorLabel;
      ctx.fillRect(x, y + height - 4, width, 4);
      ctx.restore();
    }

    // Freeze Frame Badge
    if (clip.isFreezeFrame && width > 30) {
      this._renderBadge(ctx, '❄ FREEZE', x + 6, y + height - 16, '#74b9ff');
    }

    // Notes Indicator
    if (clip.notes && clip.notes.trim() && width > 40) {
      ctx.save();
      ctx.fillStyle = '#fdcb6e';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('📝', x + width - 20, y + height - 6);
      ctx.restore();
    }

    // Locked track hatched pattern overlay
    if (track.locked) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      for (let hx = x - height; hx < x + width; hx += 14) {
        ctx.beginPath();
        ctx.moveTo(hx, y + height);
        ctx.lineTo(hx + height, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Restore clip context before drawing selection & trim borders
    ctx.restore();

    // 7. Selection border
    if (isSelected) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00f2fe';
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(width, 2), height, radius);
      ctx.stroke();

      // Trim handle indicators
      ctx.fillStyle = '#00f2fe';
      ctx.fillRect(x, y, 4, height);
      ctx.fillRect(x + width - 4, y, 4, height);
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(width, 2), height, radius);
      ctx.stroke();
    }
  }

  _renderBadge(ctx, text, bx, by, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, by, 30, 12, 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 15, by + 6);
    ctx.restore();
  }

  _renderThumbnails(ctx, clip, x, y, width, height) {
    const thumbWidth = height * (16 / 9);
    let curX = x;
    const endX = x + width;

    const thumbs = (clip.thumbnails && clip.thumbnails.length > 0)
      ? clip.thumbnails
      : (clip.thumbnail ? [clip.thumbnail] : []);

    let idx = 0;
    while (curX < endX && thumbs.length > 0) {
      const raw = thumbs[idx % thumbs.length];
      let img = null;

      if (raw instanceof Image) {
        img = raw;
      } else if (typeof raw === 'string') {
        if (!this._thumbCache.has(raw)) {
          const newImg = new Image();
          newImg.src = raw;
          newImg.onload = () => window.timelineEngine?.requestRender();
          this._thumbCache.set(raw, newImg);
        }
        img = this._thumbCache.get(raw);
      }

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.drawImage(img, curX, y, thumbWidth, height);
        ctx.restore();
      }

      curX += thumbWidth;
      idx++;
    }
  }

  _renderWaveform(ctx, clip, x, y, width, height) {
    const waveData = clip.waveform;
    const waveHeight = height * 0.55;
    const waveY = y + height - waveHeight - 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';

    if (waveData && waveData.length > 0) {
      const step = Math.max(1, waveData.length / width);
      for (let i = 0; i < width; i += 2) {
        const dataIdx = Math.floor(i * step);
        const amp = (waveData[dataIdx] || 0) * waveHeight;
        ctx.fillRect(x + i, waveY + (waveHeight - amp) / 2, 1.5, amp);
      }
    } else {
      // Procedural placeholder waveform
      for (let i = 4; i < width - 4; i += 3) {
        const pseudoAmp = (Math.sin(i * 0.08) * 0.35 + Math.cos(i * 0.03) * 0.25 + 0.4) * waveHeight;
        ctx.fillRect(x + i, waveY + (waveHeight - pseudoAmp) / 2, 1.5, Math.max(2, pseudoAmp));
      }
    }
  }

  _renderSpeedCurve(ctx, clip, x, y, width, height, zoom) {
    ctx.save();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, width, height);

    const minSpeed = 0;
    const maxSpeed = 4.0;
    
    const getYForSpeed = (speed) => {
      const normalized = Math.max(0, Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed)));
      return y + height - (normalized * height * 0.8 + height * 0.1);
    };

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const points = clip.speedPoints;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const px = x + (pt.time * zoom);
      const py = getYForSpeed(pt.speed);
      
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        const prevPt = points[i-1];
        const prevPx = x + (prevPt.time * zoom);
        const prevPy = getYForSpeed(prevPt.speed);
        
        const cpX1 = prevPx + (px - prevPx) * 0.5;
        const cpX2 = px - (px - prevPx) * 0.5;
        ctx.bezierCurveTo(cpX1, prevPy, cpX2, py, px, py);
      }
    }
    
    // Draw remainder line if points don't reach end of clip
    const lastPt = points[points.length - 1];
    if (lastPt.time < clip.duration) {
      const py = getYForSpeed(lastPt.speed);
      ctx.lineTo(x + width, py);
    }
    
    ctx.stroke();

    // Draw keyframe nodes
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const px = x + (pt.time * zoom);
      const py = getYForSpeed(pt.speed);
      
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    
    ctx.restore();
  }

  _getMediaIcon(type) {
    switch (type) {
      case 'audio': return '🎵';
      case 'text': return '𝐓';
      case 'effect': return '✨';
      default: return '🎬';
    }
  }

  /**
   * Hit test a click coordinate against a clip
   * @returns {'trim-left' | 'trim-right' | 'body' | null}
   */
  hitTestClip(px, py, clip, track, trackY, zoom, scrollX) {
    const x = clip.startTime * zoom - scrollX;
    const width = clip.duration * zoom;
    const y = trackY + 2;
    const height = track.height - 4;

    if (px < x || px > x + width || py < y || py > y + height) {
      return null;
    }

    if (px <= x + this.trimHandleWidth) {
      return 'trim-left';
    }
    if (px >= x + width - this.trimHandleWidth) {
      return 'trim-right';
    }
    return 'body';
  }
}

window.clipRenderer = new ClipRenderer();
