/**
 * StudioCut — Keyframe Interpolation
 * Cubic Bezier, Linear, Step, and Easing curves for smooth property animations
 */

const Interpolation = {
  linear(p0, p1, t) {
    return p0 + (p1 - p0) * t;
  },

  step(p0, p1, t) {
    return t < 1.0 ? p0 : p1;
  },

  easeInQuad(t) {
    return t * t;
  },

  easeOutQuad(t) {
    return t * (2 - t);
  },

  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  },

  easeInCubic(t) {
    return t * t * t;
  },

  easeOutCubic(t) {
    return (--t) * t * t + 1;
  },

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },

  /**
   * Evaluate a cubic bezier curve: B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
   */
  cubicBezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    return uuu * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * p3;
  },

  interpolate(val0, val1, t, mode = 'linear') {
    const clampedT = Math.max(0, Math.min(1, t));

    switch (mode) {
      case 'step':
        return this.step(val0, val1, clampedT);
      case 'easeIn':
        return this.linear(val0, val1, this.easeInCubic(clampedT));
      case 'easeOut':
        return this.linear(val0, val1, this.easeOutCubic(clampedT));
      case 'easeInOut':
        return this.linear(val0, val1, this.easeInOutCubic(clampedT));
      case 'linear':
      default:
        return this.linear(val0, val1, clampedT);
    }
  }
};

window.Interpolation = Interpolation;
