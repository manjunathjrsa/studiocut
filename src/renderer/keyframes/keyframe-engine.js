/**
 * StudioCut — Keyframe Engine
 * Multi-property keyframe sequencing, evaluation, and easing curve animation
 */

class KeyframeEngine {
  constructor() {}

  /**
   * Add or update a keyframe for a clip property
   */
  addKeyframe(clipId, property, time, value, mode = 'linear') {
    const keyframesMap = store.get('keyframes') || {};
    if (!keyframesMap[clipId]) keyframesMap[clipId] = {};
    if (!keyframesMap[clipId][property]) keyframesMap[clipId][property] = [];

    const list = keyframesMap[clipId][property];
    const existingIndex = list.findIndex(kf => Math.abs(kf.time - time) < 0.001);

    const kf = {
      id: MathUtils.generateId(),
      time,
      value,
      mode
    };

    if (existingIndex !== -1) {
      list[existingIndex] = kf;
    } else {
      list.push(kf);
      list.sort((a, b) => a.time - b.time);
    }

    store.set('keyframes', keyframesMap, { undoable: true, description: `Keyframe ${property}` });
    return kf;
  }

  /**
   * Remove a keyframe
   */
  removeKeyframe(clipId, property, keyframeId) {
    const keyframesMap = store.get('keyframes') || {};
    if (!keyframesMap[clipId]?.[property]) return;

    keyframesMap[clipId][property] = keyframesMap[clipId][property].filter(kf => kf.id !== keyframeId);
    store.set('keyframes', keyframesMap, { undoable: true, description: `Remove Keyframe` });
  }

  /**
   * Get all keyframes for a clip property
   */
  getKeyframes(clipId, property) {
    const keyframesMap = store.get('keyframes') || {};
    return keyframesMap[clipId]?.[property] || [];
  }

  /**
   * Evaluate property value at a specific time
   */
  getValueAtTime(clipId, property, time, defaultValue) {
    const keyframes = this.getKeyframes(clipId, property);
    if (!keyframes || keyframes.length === 0) {
      return defaultValue;
    }

    // Before first keyframe
    if (time <= keyframes[0].time) {
      return keyframes[0].value;
    }

    // After last keyframe
    if (time >= keyframes[keyframes.length - 1].time) {
      return keyframes[keyframes.length - 1].value;
    }

    // Find bounding keyframes
    for (let i = 0; i < keyframes.length - 1; i++) {
      const kfA = keyframes[i];
      const kfB = keyframes[i + 1];

      if (time >= kfA.time && time <= kfB.time) {
        const span = kfB.time - kfA.time;
        const t = span > 0 ? (time - kfA.time) / span : 0;
        return Interpolation.interpolate(kfA.value, kfB.value, t, kfA.mode || 'linear');
      }
    }

    return defaultValue;
  }
}

window.keyframeEngine = new KeyframeEngine();
