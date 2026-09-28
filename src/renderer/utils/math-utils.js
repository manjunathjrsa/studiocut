/**
 * StudioCut — Math Utilities
 */

const MathUtils = {
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  inverseLerp(a, b, value) {
    if (a === b) return 0;
    return (value - a) / (b - a);
  },

  remap(value, fromMin, fromMax, toMin, toMax) {
    const t = MathUtils.inverseLerp(fromMin, fromMax, value);
    return MathUtils.lerp(toMin, toMax, t);
  },

  snap(value, step) {
    return Math.round(value / step) * step;
  },

  distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  },

  degToRad(degrees) {
    return degrees * (Math.PI / 180);
  },

  radToDeg(radians) {
    return radians * (180 / Math.PI);
  },

  // Cubic bezier evaluation for easing curves
  cubicBezier(t, p0, p1, p2, p3) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  },

  // Solve cubic bezier for x to find t
  solveCubicBezierX(x, x1, x2, epsilon = 0.0001) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentX = MathUtils.cubicBezier(t, 0, x1, x2, 1) - x;
      if (Math.abs(currentX) < epsilon) return t;
      const derivative = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(derivative) < 1e-6) break;
      t -= currentX / derivative;
    }
    return t;
  },

  // Create easing function from cubic bezier control points
  createEasing(x1, y1, x2, y2) {
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const solvedT = MathUtils.solveCubicBezierX(t, x1, x2);
      return MathUtils.cubicBezier(solvedT, 0, y1, y2, 1);
    };
  },

  // Common easing presets
  easings: {
    linear: (t) => t,
    easeIn: null,    // initialized below
    easeOut: null,
    easeInOut: null,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInBack: (t) => { const s = 1.70158; return t * t * ((s + 1) * t - s); },
    easeOutBack: (t) => { const s = 1.70158; return ((t -= 1) * t * ((s + 1) * t + s) + 1); },
    easeOutBounce: (t) => {
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
      if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    },
    easeOutElastic: (t) => {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
    }
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
};

// Initialize cubic bezier easings
MathUtils.easings.easeIn = MathUtils.createEasing(0.42, 0, 1, 1);
MathUtils.easings.easeOut = MathUtils.createEasing(0, 0, 0.58, 1);
MathUtils.easings.easeInOut = MathUtils.createEasing(0.42, 0, 0.58, 1);

// Make globally available
window.MathUtils = MathUtils;
