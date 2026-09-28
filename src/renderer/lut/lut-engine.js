/**
 * StudioCut — LUT (Look-Up Table) Engine
 * Parser for .cube LUT files, bundled cinematic presets, and color transformation
 */

class LutEngine {
  constructor() {
    this.lutCache = new Map();
    this.bundledPresets = [
      {
        id: 'teal-orange',
        name: 'Teal & Orange',
        category: 'Cinematic',
        transform: (r, g, b) => {
          // Shadows pushed to teal (r low, b/g high), highlights to orange
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luma < 128) {
            // Shadow -> Teal
            const f = (128 - luma) / 128;
            return [
              Math.max(0, r - 25 * f),
              Math.min(255, g + 10 * f),
              Math.min(255, b + 35 * f)
            ];
          } else {
            // Highlight -> Warm Orange
            const f = (luma - 128) / 127;
            return [
              Math.min(255, r + 35 * f),
              Math.min(255, g + 12 * f),
              Math.max(0, b - 20 * f)
            ];
          }
        }
      },
      {
        id: 'kodak-film',
        name: 'Kodak Portra',
        category: 'Film Emulation',
        transform: (r, g, b) => {
          // Warm midtones, lifted matte blacks, soft highlight rolloff
          const nr = Math.min(255, r * 1.05 + 8);
          const ng = Math.min(255, g * 1.02 + 4);
          const nb = Math.max(10, b * 0.95 + 6); // Lifted blacks
          return [nr, ng, nb];
        }
      },
      {
        id: 'cyberpunk',
        name: 'Cyberpunk Neon',
        category: 'Creative',
        transform: (r, g, b) => {
          // Deep darks, neon magenta highlights, cyan midtones
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          return [
            Math.min(255, r * 1.25),
            Math.max(0, g * 0.85),
            Math.min(255, b * 1.35 + (luma < 100 ? 20 : 0))
          ];
        }
      },
      {
        id: 'vintage-noir',
        name: 'Vintage Film Noir',
        category: 'Cinematic',
        transform: (r, g, b) => {
          // High contrast black & white with grain crush
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const contrastGray = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
          return [contrastGray, contrastGray, contrastGray];
        }
      },
      {
        id: 'golden-hour',
        name: 'Golden Hour',
        category: 'Stylize',
        transform: (r, g, b) => {
          // Sunset golden warmth
          return [
            Math.min(255, r * 1.2 + 15),
            Math.min(255, g * 1.05 + 8),
            Math.max(0, b * 0.85 - 10)
          ];
        }
      }
    ];
  }

  getPresets() {
    return this.bundledPresets;
  }

  /**
   * Parse a standard .cube 3D LUT file content
   */
  parseCubeLUT(content) {
    const lines = content.split('\n');
    let size = 0;
    const table = [];

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('LUT_3D_SIZE')) {
        size = parseInt(line.split(/\s+/)[1]);
        continue;
      }

      const parts = line.split(/\s+/).map(Number);
      if (parts.length === 3 && !isNaN(parts[0])) {
        table.push(parts); // [r, g, b] normalized 0.0 - 1.0
      }
    }

    return { size, table };
  }

  /**
   * Apply a preset or custom LUT to pixel data on a canvas
   */
  applyLutToImageData(imageData, presetId, intensity = 1.0) {
    const preset = this.bundledPresets.find(p => p.id === presetId);
    if (!preset) return imageData;

    const d = imageData.data;
    const len = d.length;
    const transform = preset.transform;

    for (let i = 0; i < len; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];

      const [tr, tg, tb] = transform(r, g, b);

      d[i] = Math.round(r + (tr - r) * intensity);
      d[i + 1] = Math.round(g + (tg - g) * intensity);
      d[i + 2] = Math.round(b + (tb - b) * intensity);
    }

    return imageData;
  }
}

window.lutEngine = new LutEngine();
