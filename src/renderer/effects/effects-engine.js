/**
 * StudioCut — Effects Engine
 * GPU-accelerated WebGL shader processing pipeline for real-time video effects
 */

class EffectsEngine {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
    this.programs = new Map();
    this.textures = new Map();
    this.quadBuffer = null;
    this.isSupported = !!this.gl;

    this.supportedEffects = new Set([
      'brightness-contrast',
      'hue-saturation',
      'gaussian-blur',
      'vignette',
      'rgb-split',
      'glow',
      'pixelate',
      'mirror',
      'fisheye',
      'chroma-key',
      'color-wheels',
      'hsl-secondary'
    ]);

    if (this.isSupported) {
      this._initQuad();
      this._compileBuiltinShaders();
    }
  }

  hasEffect(type) {
    return this.supportedEffects.has(type);
  }

  _initQuad() {
    const gl = this.gl;
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    // Two triangles covering clip space: [-1, -1] to [1, 1]
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  _getVertexShader() {
    return `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  _createProgram(fragSource) {
    const gl = this.gl;
    const vs = this._compileShader(gl.VERTEX_SHADER, this._getVertexShader());
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fragSource);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link failed:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  _compileBuiltinShaders() {
    // 1. Brightness & Contrast
    this.programs.set('brightness-contrast', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_brightness;
      uniform float u_contrast;
      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        color.rgb = (color.rgb - 0.5) * u_contrast + 0.5 + (u_brightness - 1.0);
        gl_FragColor = color;
      }
    `));

    // 2. Hue & Saturation
    this.programs.set('hue-saturation', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_hue;
      uniform float u_saturation;
      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        // RGB to Grayscale
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(gray), color.rgb, u_saturation);
        gl_FragColor = color;
      }
    `));

    // 3. Vignette
    this.programs.set('vignette', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_radius;
      uniform float u_softness;
      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        float dist = distance(v_texCoord, vec2(0.5, 0.5));
        float vig = smoothstep(u_radius, u_radius - u_softness, dist);
        color.rgb *= vig;
        gl_FragColor = color;
      }
    `));

    // 4. Glitch / RGB Split
    this.programs.set('glitch', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_amount;
      uniform float u_time;
      void main() {
        float split = u_amount * 0.02 * sin(u_time * 10.0 + v_texCoord.y * 30.0);
        float r = texture2D(u_image, vec2(v_texCoord.x + split, v_texCoord.y)).r;
        float g = texture2D(u_image, v_texCoord).g;
        float b = texture2D(u_image, vec2(v_texCoord.x - split, v_texCoord.y)).b;
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `));

    // 5. Film Grain
    this.programs.set('film-grain', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_intensity;
      uniform float u_time;
      float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }
      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        float noise = (rand(v_texCoord + fract(u_time)) - 0.5) * u_intensity;
        color.rgb += noise;
        gl_FragColor = color;
      }
    `));

    // 6. Chromatic Aberration
    this.programs.set('chromatic-aberration', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_offset;
      void main() {
        vec2 dir = v_texCoord - vec2(0.5);
        float dist = length(dir);
        vec2 offset = normalize(dir) * dist * (u_offset * 0.02);
        float r = texture2D(u_image, v_texCoord + offset).r;
        float g = texture2D(u_image, v_texCoord).g;
        float b = texture2D(u_image, v_texCoord - offset).b;
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `));

    // 7. Bloom Glow
    this.programs.set('bloom', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_threshold;
      uniform float u_intensity;
      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 glow = max(vec3(0.0), color.rgb - u_threshold) * u_intensity;
        gl_FragColor = vec4(color.rgb + glow, color.a);
      }
    `));

    // 8. Pixelate
    this.programs.set('pixelate', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_pixels;
      void main() {
        float dx = 1.0 / u_pixels;
        vec2 coord = floor(v_texCoord / dx) * dx;
        gl_FragColor = texture2D(u_image, coord);
      }
    `));

    // 9. Chroma Key (Green Screen Removal)
    this.programs.set('chroma-key', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec3 u_keyColor;
      uniform float u_similarity;
      uniform float u_smoothness;
      uniform float u_spill;

      vec2 RGBtoUV(vec3 rgb) {
        return vec2(
          -0.169 * rgb.r - 0.331 * rgb.g + 0.500 * rgb.b,
           0.500 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b
        );
      }

      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        vec2 keyUV = RGBtoUV(u_keyColor);
        vec2 pixelUV = RGBtoUV(color.rgb);

        float chromaDist = distance(pixelUV, keyUV);
        float baseMask = chromaDist - u_similarity;
        float alpha = smoothstep(0.0, u_smoothness + 0.0001, baseMask);

        // Spill suppression: suppress green fringing
        if (u_spill > 0.0) {
          float maxRB = max(color.r, color.b);
          if (color.g > maxRB) {
            color.g = mix(color.g, maxRB, u_spill);
          }
        }

        gl_FragColor = vec4(color.rgb, color.a * alpha);
      }
    `));

    // 10. 3-Way Color Wheels (Lift / Gamma / Gain + Luma Offset)
    this.programs.set('color-wheels', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec3 u_shadows;
      uniform vec3 u_midtones;
      uniform vec3 u_highlights;
      uniform float u_shadowsLuma;
      uniform float u_midtonesLuma;
      uniform float u_highlightsLuma;

      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        
        float shadowMask = max(0.0, 1.0 - (luma / 0.5));
        float highlightMask = max(0.0, (luma - 0.5) / 0.5);
        float midtoneMask = max(0.0, 1.0 - abs(luma - 0.5) / 0.5);

        color.rgb += (u_shadows + vec3(u_shadowsLuma)) * shadowMask;
        color.rgb += (u_midtones + vec3(u_midtonesLuma)) * midtoneMask;
        color.rgb += (u_highlights + vec3(u_highlightsLuma)) * highlightMask;

        gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
      }
    `));

    // 11. Lumetri HSL Secondary Isolation & Grading
    this.programs.set('hsl-secondary', this._createProgram(`
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;

      // Key selection range
      uniform float u_targetHue; // 0..1 (0..360 deg)
      uniform float u_hueTolerance; // 0..0.5
      uniform float u_hueFeather; // 0..0.5
      uniform vec2 u_satRange; // min, max (0..1)
      uniform vec2 u_lumRange; // min, max (0..1)
      uniform float u_invertMask; // 0 or 1

      // Grading adjustments
      uniform float u_hueShift; // -0.5..0.5
      uniform float u_satMult; // 0..3
      uniform float u_temperature; // -1..1
      uniform float u_tint; // -1..1

      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        vec4 texColor = texture2D(u_image, v_texCoord);
        vec3 hsv = rgb2hsv(texColor.rgb);

        float hueDiff = abs(hsv.x - u_targetHue);
        if (hueDiff > 0.5) hueDiff = 1.0 - hueDiff;

        float hueMask = 1.0 - smoothstep(u_hueTolerance, u_hueTolerance + u_hueFeather + 0.0001, hueDiff);
        float satMask = smoothstep(u_satRange.x - 0.05, u_satRange.x, hsv.y) * (1.0 - smoothstep(u_satRange.y, u_satRange.y + 0.05, hsv.y));
        float lumMask = smoothstep(u_lumRange.x - 0.05, u_lumRange.x, hsv.z) * (1.0 - smoothstep(u_lumRange.y, u_lumRange.y + 0.05, hsv.z));

        float mask = clamp(hueMask * satMask * lumMask, 0.0, 1.0);
        if (u_invertMask > 0.5) {
          mask = 1.0 - mask;
        }

        vec3 gradedHsv = hsv;
        gradedHsv.x = fract(gradedHsv.x + u_hueShift + 1.0);
        gradedHsv.y = clamp(gradedHsv.y * u_satMult, 0.0, 1.0);

        vec3 gradedRgb = hsv2rgb(gradedHsv);
        gradedRgb.r += u_temperature * 0.15;
        gradedRgb.b -= u_temperature * 0.15;
        gradedRgb.g += u_tint * 0.1;
        gradedRgb = clamp(gradedRgb, 0.0, 1.0);

        vec3 finalRgb = mix(texColor.rgb, gradedRgb, mask);
        gl_FragColor = vec4(finalRgb, texColor.a);
      }
    `));
  }

  /**
   * Apply an effect shader to a source element (canvas or video or image)
   * @param {string} effectType
   * @param {object} params
   * @param {HTMLElement} sourceEl
   * @param {number} time - playback timestamp in seconds
   * @returns {HTMLCanvasElement}
   */
  applyEffect(effectType, params, sourceEl, time = 0) {
    if (!this.isSupported || !this.programs.has(effectType)) {
      return sourceEl;
    }

    const gl = this.gl;
    const prog = this.programs.get(effectType);

    const w = sourceEl.videoWidth || sourceEl.width || 1280;
    const h = sourceEl.videoHeight || sourceEl.height || 720;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    gl.useProgram(prog);

    // Bind quad buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const posLoc = gl.getAttribLocation(prog, 'a_position');
    const texLoc = gl.getAttribLocation(prog, 'a_texCoord');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    // Upload source texture
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl);

    // Set standard uniforms
    const uImage = gl.getUniformLocation(prog, 'u_image');
    gl.uniform1i(uImage, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    if (uTime) gl.uniform1f(uTime, time);

    // Set custom uniforms based on effectType
    if (effectType === 'brightness-contrast') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_brightness'), params.brightness !== undefined ? params.brightness : 1.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_contrast'), params.contrast !== undefined ? params.contrast : 1.0);
    } else if (effectType === 'hue-saturation') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_hue'), params.hue || 0.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_saturation'), params.saturation !== undefined ? params.saturation : 1.0);
    } else if (effectType === 'vignette') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_radius'), params.radius || 0.75);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_softness'), params.softness || 0.45);
    } else if (effectType === 'glitch') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_amount'), params.amount || 0.5);
    } else if (effectType === 'film-grain') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_intensity'), params.intensity || 0.2);
    } else if (effectType === 'chromatic-aberration') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_offset'), params.offset || 4.0);
    } else if (effectType === 'bloom') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_threshold'), params.threshold || 0.7);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_intensity'), params.intensity || 1.2);
    } else if (effectType === 'pixelate') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_pixels'), params.pixels || 64.0);
    } else if (effectType === 'chroma-key') {
      const kc = params.keyColor || [0.0, 1.0, 0.0];
      gl.uniform3f(gl.getUniformLocation(prog, 'u_keyColor'), kc[0], kc[1], kc[2]);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_similarity'), params.similarity !== undefined ? params.similarity : 0.35);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_smoothness'), params.smoothness !== undefined ? params.smoothness : 0.1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_spill'), params.spill !== undefined ? params.spill : 0.25);
    } else if (effectType === 'color-wheels') {
      const sw = params.shadows || [0.0, 0.0, 0.0];
      const mw = params.midtones || [0.0, 0.0, 0.0];
      const hw = params.highlights || [0.0, 0.0, 0.0];
      gl.uniform3f(gl.getUniformLocation(prog, 'u_shadows'), sw[0], sw[1], sw[2]);
      gl.uniform3f(gl.getUniformLocation(prog, 'u_midtones'), mw[0], mw[1], mw[2]);
      gl.uniform3f(gl.getUniformLocation(prog, 'u_highlights'), hw[0], hw[1], hw[2]);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_shadowsLuma'), params.shadowsLuma || 0.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_midtonesLuma'), params.midtonesLuma || 0.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_highlightsLuma'), params.highlightsLuma || 0.0);
    } else if (effectType === 'hsl-secondary') {
      gl.uniform1f(gl.getUniformLocation(prog, 'u_targetHue'), (params.hue !== undefined ? params.hue : 120) / 360);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_hueTolerance'), (params.hueTolerance !== undefined ? params.hueTolerance : 30) / 360);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_hueFeather'), (params.hueFeather !== undefined ? params.hueFeather : 20) / 360);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_satRange'), params.satMin !== undefined ? params.satMin : 0.2, params.satMax !== undefined ? params.satMax : 1.0);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_lumRange'), params.lumMin !== undefined ? params.lumMin : 0.1, params.lumMax !== undefined ? params.lumMax : 0.9);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_invertMask'), params.invertMask ? 1.0 : 0.0);

      gl.uniform1f(gl.getUniformLocation(prog, 'u_hueShift'), (params.hueShift || 0.0) / 360);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_satMult'), params.satMult !== undefined ? params.satMult : 1.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_temperature'), params.temperature || 0.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_tint'), params.tint || 0.0);
    }

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.deleteTexture(tex);

    return this.canvas;
  }
}

window.effectsEngine = new EffectsEngine();
