/**
 * StudioCut — Transition Engine
 * Real-time transition processing between overlapping or adjacent clips
 */

class TransitionEngine {
  constructor() {
    this.transitions = new Map();
    this._initTransitions();
  }

  _initTransitions() {
    // 1. Cross Dissolve / Fade
    this.transitions.set('cross-dissolve', {
      name: 'Cross Dissolve',
      render: (ctx, clipA, clipB, progress, w, h) => {
        // Draw clip A
        ctx.save();
        ctx.globalAlpha = 1.0 - progress;
        if (clipA) ctx.drawImage(clipA, 0, 0, w, h);
        ctx.restore();

        // Draw clip B
        ctx.save();
        ctx.globalAlpha = progress;
        if (clipB) ctx.drawImage(clipB, 0, 0, w, h);
        ctx.restore();
      }
    });

    // 2. Dip to Black
    this.transitions.set('dip-black', {
      name: 'Dip to Black',
      render: (ctx, clipA, clipB, progress, w, h) => {
        if (progress < 0.5) {
          const fade = (0.5 - progress) * 2;
          ctx.save();
          ctx.globalAlpha = fade;
          if (clipA) ctx.drawImage(clipA, 0, 0, w, h);
          ctx.restore();
        } else {
          const fade = (progress - 0.5) * 2;
          ctx.save();
          ctx.globalAlpha = fade;
          if (clipB) ctx.drawImage(clipB, 0, 0, w, h);
          ctx.restore();
        }
      }
    });

    // 3. Dip to White
    this.transitions.set('dip-white', {
      name: 'Dip to White',
      render: (ctx, clipA, clipB, progress, w, h) => {
        if (progress < 0.5) {
          const fade = (0.5 - progress) * 2;
          ctx.save();
          if (clipA) ctx.drawImage(clipA, 0, 0, w, h);
          ctx.fillStyle = `rgba(255, 255, 255, ${1.0 - fade})`;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        } else {
          const fade = (progress - 0.5) * 2;
          ctx.save();
          if (clipB) ctx.drawImage(clipB, 0, 0, w, h);
          ctx.fillStyle = `rgba(255, 255, 255, ${1.0 - fade})`;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }
    });

    // 4. Slide Left
    this.transitions.set('slide-left', {
      name: 'Slide Left',
      render: (ctx, clipA, clipB, progress, w, h) => {
        const offset = progress * w;
        ctx.save();
        if (clipA) ctx.drawImage(clipA, -offset, 0, w, h);
        if (clipB) ctx.drawImage(clipB, w - offset, 0, w, h);
        ctx.restore();
      }
    });

    // 5. Slide Right
    this.transitions.set('slide-right', {
      name: 'Slide Right',
      render: (ctx, clipA, clipB, progress, w, h) => {
        const offset = progress * w;
        ctx.save();
        if (clipA) ctx.drawImage(clipA, offset, 0, w, h);
        if (clipB) ctx.drawImage(clipB, -w + offset, 0, w, h);
        ctx.restore();
      }
    });

    // 6. Wipe Left-to-Right
    this.transitions.set('wipe-right', {
      name: 'Wipe',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        if (clipA) ctx.drawImage(clipA, 0, 0, w, h);

        ctx.beginPath();
        ctx.rect(0, 0, w * progress, h);
        ctx.clip();
        if (clipB) ctx.drawImage(clipB, 0, 0, w, h);
        ctx.restore();
      }
    });

    // 7. Zoom In
    this.transitions.set('zoom-in', {
      name: 'Zoom In',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        if (clipA) {
          const scaleA = 1.0 + progress * 0.5;
          ctx.save();
          ctx.globalAlpha = 1.0 - progress;
          ctx.translate(w / 2, h / 2);
          ctx.scale(scaleA, scaleA);
          ctx.drawImage(clipA, -w / 2, -h / 2, w, h);
          ctx.restore();
        }

        if (clipB) {
          const scaleB = 0.5 + progress * 0.5;
          ctx.save();
          ctx.globalAlpha = progress;
          ctx.translate(w / 2, h / 2);
          ctx.scale(scaleB, scaleB);
          ctx.drawImage(clipB, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        ctx.restore();
      }
    });

    // 8. Iris Wipe (Expanding Circle)
    this.transitions.set('iris-wipe', {
      name: 'Iris Wipe (Circle)',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        if (clipA) ctx.drawImage(clipA, 0, 0, w, h);
        if (clipB) {
          const maxRadius = Math.hypot(w / 2, h / 2);
          const currentRadius = maxRadius * progress;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, currentRadius, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(clipB, 0, 0, w, h);
        }
        ctx.restore();
      }
    });

    // 9. Clock Wipe (Radial 360° Sweep)
    this.transitions.set('clock-wipe', {
      name: 'Clock Wipe',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        if (clipA) ctx.drawImage(clipA, 0, 0, w, h);
        if (clipB) {
          const maxRadius = Math.hypot(w, h);
          const angle = -Math.PI / 2 + progress * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(w / 2, h / 2);
          ctx.arc(w / 2, h / 2, maxRadius, -Math.PI / 2, angle, false);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(clipB, 0, 0, w, h);
        }
        ctx.restore();
      }
    });

    // 10. Push Up (Vertical Slide)
    this.transitions.set('push-up', {
      name: 'Push Up',
      render: (ctx, clipA, clipB, progress, w, h) => {
        const offset = progress * h;
        ctx.save();
        if (clipA) ctx.drawImage(clipA, 0, -offset, w, h);
        if (clipB) ctx.drawImage(clipB, 0, h - offset, w, h);
        ctx.restore();
      }
    });

    // 11. Push Down
    this.transitions.set('push-down', {
      name: 'Push Down',
      render: (ctx, clipA, clipB, progress, w, h) => {
        const offset = progress * h;
        ctx.save();
        if (clipA) ctx.drawImage(clipA, 0, offset, w, h);
        if (clipB) ctx.drawImage(clipB, 0, -h + offset, w, h);
        ctx.restore();
      }
    });

    // 12. Zoom Out
    this.transitions.set('zoom-out', {
      name: 'Zoom Out',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        if (clipA) {
          const scaleA = Math.max(0.01, 1.0 - progress * 0.6);
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1.0 - progress * 1.2);
          ctx.translate(w / 2, h / 2);
          ctx.scale(scaleA, scaleA);
          ctx.drawImage(clipA, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        if (clipB) {
          const scaleB = 1.4 - progress * 0.4;
          ctx.save();
          ctx.globalAlpha = Math.min(1, progress * 1.2);
          ctx.translate(w / 2, h / 2);
          ctx.scale(scaleB, scaleB);
          ctx.drawImage(clipB, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        ctx.restore();
      }
    });

    // 13. Whip Pan (High-speed Motion Blur)
    this.transitions.set('whip-pan', {
      name: 'Whip Pan',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        const easeProgress = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const offset = easeProgress * w;
        const blurPasses = 3;

        // Draw Clip A with directional stretch
        if (clipA && progress < 0.8) {
          for (let i = 0; i < blurPasses; i++) {
            const spread = (i - 1) * 8 * Math.sin(progress * Math.PI);
            ctx.globalAlpha = (1.0 - progress) / blurPasses;
            ctx.drawImage(clipA, -offset + spread, 0, w, h);
          }
        }

        // Draw Clip B with directional stretch
        if (clipB && progress > 0.2) {
          for (let i = 0; i < blurPasses; i++) {
            const spread = (i - 1) * 8 * Math.sin(progress * Math.PI);
            ctx.globalAlpha = progress / blurPasses;
            ctx.drawImage(clipB, w - offset + spread, 0, w, h);
          }
        }

        // White flare flash at peak velocity
        const flashIntensity = Math.sin(progress * Math.PI) * 0.35;
        if (flashIntensity > 0.05) {
          ctx.globalAlpha = flashIntensity;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.restore();
      }
    });

    // 14. Glitch / RGB Displacement Slice
    this.transitions.set('glitch', {
      name: 'Glitch / RGB Slice',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        const activeClip = progress < 0.5 ? clipA : clipB;
        const otherClip = progress < 0.5 ? clipB : clipA;

        if (activeClip) ctx.drawImage(activeClip, 0, 0, w, h);

        // Horizontal displacement slices
        const numSlices = 8;
        const sliceH = h / numSlices;
        for (let i = 0; i < numSlices; i++) {
          if (Math.sin(i * 13 + progress * 20) > 0.1) {
            const shiftX = Math.sin(i * 7 + progress * 30) * 40 * Math.sin(progress * Math.PI);
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, i * sliceH, w, sliceH);
            ctx.clip();
            if (otherClip && Math.random() > 0.4) {
              ctx.globalAlpha = 0.7;
              ctx.drawImage(otherClip, shiftX, 0, w, h);
            } else if (activeClip) {
              ctx.drawImage(activeClip, shiftX, 0, w, h);
            }
            ctx.restore();
          }
        }

        // Color flash
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(108, 92, 231, ${Math.sin(progress * Math.PI) * 0.3})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    });

    // 15. Film Burn / Light Leak
    this.transitions.set('film-burn', {
      name: 'Film Burn / Light Leak',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        // Crossfade clips
        ctx.globalAlpha = 1.0 - progress;
        if (clipA) ctx.drawImage(clipA, 0, 0, w, h);
        ctx.globalAlpha = progress;
        if (clipB) ctx.drawImage(clipB, 0, 0, w, h);

        // Warm organic light leak flare
        const flareAlpha = Math.sin(progress * Math.PI) * 0.85;
        if (flareAlpha > 0.01) {
          ctx.globalAlpha = flareAlpha;
          ctx.globalCompositeOperation = 'screen';

          const grad = ctx.createRadialGradient(
            w * (0.3 + progress * 0.4), h * 0.4, 10,
            w * (0.3 + progress * 0.4), h * 0.4, Math.max(w, h) * 0.8
          );
          grad.addColorStop(0, 'rgba(255, 230, 160, 0.95)');
          grad.addColorStop(0.3, 'rgba(255, 120, 40, 0.7)');
          grad.addColorStop(0.6, 'rgba(255, 60, 120, 0.4)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.restore();
      }
    });

    // 16. Split Door (Doors Opening)
    this.transitions.set('split-door', {
      name: 'Split Door',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        // Background: Clip B
        if (clipB) ctx.drawImage(clipB, 0, 0, w, h);

        // Foreground: Clip A splits left and right
        if (clipA) {
          const shift = progress * (w / 2);
          // Left half
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w / 2, h);
          ctx.clip();
          ctx.drawImage(clipA, -shift, 0, w, h);
          ctx.restore();

          // Right half
          ctx.save();
          ctx.beginPath();
          ctx.rect(w / 2, 0, w / 2, h);
          ctx.clip();
          ctx.drawImage(clipA, shift, 0, w, h);
          ctx.restore();
        }
        ctx.restore();
      }
    });

    // 17. Spin / 360° Rotate
    this.transitions.set('spin-cw', {
      name: 'Spin Clockwise',
      render: (ctx, clipA, clipB, progress, w, h) => {
        ctx.save();
        if (progress < 0.5) {
          const p = progress * 2;
          const rot = p * Math.PI;
          const scale = 1.0 - p * 0.5;
          ctx.save();
          ctx.globalAlpha = 1.0 - p;
          ctx.translate(w / 2, h / 2);
          ctx.rotate(rot);
          ctx.scale(scale, scale);
          if (clipA) ctx.drawImage(clipA, -w / 2, -h / 2, w, h);
          ctx.restore();
        } else {
          const p = (progress - 0.5) * 2;
          const rot = (p - 1.0) * Math.PI;
          const scale = 0.5 + p * 0.5;
          ctx.save();
          ctx.globalAlpha = p;
          ctx.translate(w / 2, h / 2);
          ctx.rotate(rot);
          ctx.scale(scale, scale);
          if (clipB) ctx.drawImage(clipB, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        ctx.restore();
      }
    });
  }

  /**
   * Render a transition between two rendered frames
   */
  renderTransition(ctx, type, sourceFrameA, sourceFrameB, progress, width, height) {
    const tr = this.transitions.get(type) || this.transitions.get('cross-dissolve');
    tr.render(ctx, sourceFrameA, sourceFrameB, progress, width, height);
  }

  getTransitionTypes() {
    return Array.from(this.transitions.entries()).map(([id, t]) => ({ id, name: t.name }));
  }
}

window.transitionEngine = new TransitionEngine();
