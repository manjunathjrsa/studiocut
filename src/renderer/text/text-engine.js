/**
 * StudioCut — Text & Titles Engine
 * Title presets, font management, animations, and text styling
 */

class TextEngine {
  constructor() {
    this.presets = [
      {
        id: 'default',
        name: 'Default Title',
        text: 'Default Title',
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 64,
          fontWeight: '700',
          color: '#ffffff',
          shadow: true,
          shadowColor: 'rgba(0, 0, 0, 0.8)',
          shadowBlur: 8,
          shadowOffsetX: 0,
          shadowOffsetY: 4
        }
      },
      {
        id: 'bold-outline',
        name: 'Bold Outline',
        text: 'BOLD TITLE',
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 72,
          fontWeight: '900',
          color: '#ffff00',
          outlineWidth: 4,
          outlineColor: '#000000',
          shadow: true,
          shadowBlur: 10
        }
      },
      {
        id: 'cyberpunk-neon',
        name: 'Cyber Neon',
        text: 'CYBERPUNK',
        style: {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 68,
          fontWeight: '800',
          color: '#00f2fe',
          shadow: true,
          shadowColor: '#00f2fe',
          shadowBlur: 20,
          shadowOffsetX: 0,
          shadowOffsetY: 0
        }
      },
      {
        id: 'cinematic',
        name: 'Cinematic Minimal',
        text: 'A F I L M B Y',
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 36,
          fontWeight: '300',
          color: '#f5f5f7',
          letterSpacing: 8,
          shadow: false
        }
      },
      {
        id: 'vibrant-glow',
        name: 'Sunset Glow',
        text: 'GOLDEN HOUR',
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 64,
          fontWeight: '800',
          color: '#fd79a8',
          shadow: true,
          shadowColor: '#e84393',
          shadowBlur: 16
        }
      },
      {
        id: 'subtitle',
        name: 'Standard Subtitle',
        text: 'Subtitle text goes here',
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 32,
          fontWeight: '600',
          color: '#ffffff',
          outlineWidth: 2,
          outlineColor: 'rgba(0,0,0,0.85)',
          shadow: false
        }
      }
    ];
  }

  /**
   * Add a text clip to the timeline
   */
  addTextClip(presetId = 'default', targetTrackId = null, startTime = null) {
    const preset = this.presets.find(p => p.id === presetId) || this.presets[0];
    const tracks = store.get('tracks') || [];

    // Find or create a text / video track
    let track = tracks.find(t => t.id === targetTrackId);
    if (!track) {
      track = tracks.find(t => t.type === 'video' && !t.locked) || tracks[0];
    }

    if (!track) {
      track = Actions.addTrack('video', 'Text Track');
    }

    const playhead = store.get('playback.currentTime');
    const actualStartTime = startTime !== null ? startTime : playhead;

    return Actions.addClip(track.id, {
      name: preset.name,
      mediaType: 'text',
      text: preset.text,
      textStyle: JSON.parse(JSON.stringify(preset.style)),
      startTime: actualStartTime,
      duration: 4,
      sourceDuration: 4
    });
  }

  getPresets() {
    return this.presets;
  }
}

window.textEngine = new TextEngine();
