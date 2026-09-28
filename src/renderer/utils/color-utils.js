/**
 * StudioCut — Color Utilities
 * HSL/RGB/Hex conversions and color manipulation
 */

const ColorUtils = {
  hexToRgb(hex) {
    if (!hex) return { r: 0, g: 255, b: 0 };
    if (typeof hex !== 'string') {
      if (Array.isArray(hex)) return { r: hex[0] || 0, g: hex[1] || 0, b: hex[2] || 0 };
      if (typeof hex === 'object' && hex.r !== undefined) return hex;
      return { r: 0, g: 255, b: 0 };
    }
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16) || 0;
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  },

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(c =>
      Math.round(MathUtils.clamp(c, 0, 255)).toString(16).padStart(2, '0')
    ).join('');
  },

  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
  },

  hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;

    if (s === 0) {
      const val = Math.round(l * 255);
      return { r: val, g: val, b: val };
    }

    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return {
      r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1/3) * 255)
    };
  },

  // Track color palette (for auto-assigning track colors)
  trackColors: [
    '#6c5ce7', // Purple
    '#00cec9', // Teal
    '#fd79a8', // Pink
    '#fdcb6e', // Yellow
    '#00b894', // Green
    '#e17055', // Orange
    '#74b9ff', // Blue
    '#a29bfe', // Lavender
    '#55efc4', // Mint
    '#fab1a0', // Peach
  ],

  getTrackColor(index) {
    return ColorUtils.trackColors[index % ColorUtils.trackColors.length];
  },

  // Clip colors by media type
  clipColors: {
    video: { bg: 'rgba(108, 92, 231, 0.6)', border: '#6c5ce7', text: '#d4cfff' },
    audio: { bg: 'rgba(0, 206, 201, 0.6)', border: '#00cec9', text: '#b2f5ea' },
    image: { bg: 'rgba(253, 203, 110, 0.6)', border: '#fdcb6e', text: '#fff3cd' },
    text:  { bg: 'rgba(255, 107, 107, 0.6)', border: '#ff6b6b', text: '#ffd4d4' },
    effect:{ bg: 'rgba(116, 185, 255, 0.5)', border: '#74b9ff', text: '#d4e8ff' },
  },

  getClipColor(mediaType) {
    return ColorUtils.clipColors[mediaType] || ColorUtils.clipColors.video;
  },

  // Darken/Lighten
  adjustBrightness(hex, percent) {
    const rgb = ColorUtils.hexToRgb(hex);
    const factor = percent / 100;
    return ColorUtils.rgbToHex(
      rgb.r + (255 - rgb.r) * Math.max(0, factor) + rgb.r * Math.min(0, factor),
      rgb.g + (255 - rgb.g) * Math.max(0, factor) + rgb.g * Math.min(0, factor),
      rgb.b + (255 - rgb.b) * Math.max(0, factor) + rgb.b * Math.min(0, factor)
    );
  },

  withAlpha(hex, alpha) {
    const rgb = ColorUtils.hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }
};

window.ColorUtils = ColorUtils;
