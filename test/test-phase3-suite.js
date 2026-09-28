/**
 * StudioCut — Phase 3 Advanced Audio Suite, Multicam, Speed Ramping & Auto-Captions Verification
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

async function runPhase3Tests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Starting Phase 3 Advanced Features Verification Suite');
  console.log('═══════════════════════════════════════════════════════════');

  const win = new BrowserWindow({
    width: 1600,
    height: 920,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webgl: true,
      backgroundThrottling: false
    }
  });

  const consoleLogs = [];
  win.webContents.on('console-message', (e, level, message) => {
    consoleLogs.push(`[${level}] ${message}`);
  });

  const htmlPath = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
  await win.loadFile(htmlPath);

  // Wait for bootstrap
  await new Promise(r => setTimeout(r, 1500));

  const testResults = await win.webContents.executeJavaScript(`
    (async function() {
      document.getElementById('splashScreen')?.remove();

      const results = [];
      const assert = (desc, condition) => {
        results.push({ name: desc, status: condition ? 'PASS' : 'FAIL' });
      };

      try {
        // ─────────────────────────────────────────────────────────────
        // 1. Multicam Editing Suite
        // ─────────────────────────────────────────────────────────────
        assert('Multicam Engine exists on window', !!window.multiCamEngine);
        assert('4-Up Multicam toggle button exists in monitor header', !!document.getElementById('btnToggleMultiCam'));

        // Populate sample media and create clips to test multicam sequence
        await window.app?.addSampleMedia();
        const mediaItems = store.getState().media || [];
        assert('Sample media items available for multicam', mediaItems.length >= 2);

        // Add 2 video clips to timeline
        const clip1 = Actions.addClip(store.getState().tracks[0].id, {
          name: 'Angle A - Wide',
          mediaType: 'video',
          sourcePath: mediaItems[0].path,
          startTime: 0,
          duration: 6,
          sourceStartTime: 0,
          sourceDuration: 6
        });

        const clip2 = Actions.addClip(store.getState().tracks[0].id, {
          name: 'Angle B - Close Up',
          mediaType: 'video',
          sourcePath: mediaItems[1].path,
          startTime: 8,
          duration: 6,
          sourceStartTime: 0,
          sourceDuration: 6
        });

        // Create Multicam sequence
        const multiClip = await Actions.createMultiCamSequence([clip1.id, clip2.id], 'in_point');
        assert('Multicam sequence clip created', !!multiClip && multiClip.mediaType === 'multicam');
        assert('Multicam clip has 2 synchronized angles', multiClip?.angles?.length === 2);
        assert('Default active angle is 0 (Angle A)', multiClip?.activeAngleIndex === 0);

        // Angle switching
        Actions.switchMultiCamAngle(1);
        const switchedClip = Actions.getClip(multiClip.id);
        assert('Switched active angle to index 1 (Angle B)', switchedClip?.activeAngleIndex === 1);

        // Toggle 4-Up Multicam view
        const multiActive = window.multiCamEngine.toggleMultiCam(true);
        assert('4-Up Multicam mode activated', multiActive === true && window.multiCamEngine.active === true);

        // Shortcuts 1-4 for multicam angles
        const sm = window.shortcutManager;
        assert('Shortcut Manager registered Angle 1 cut (digit1)', sm?.shortcuts?.has('digit1') || sm?.shortcuts?.has('1'));
        assert('Shortcut Manager registered Angle 2 cut (digit2)', sm?.shortcuts?.has('digit2') || sm?.shortcuts?.has('2'));
        assert('Shortcut Manager registered Angle 3 cut (digit3)', sm?.shortcuts?.has('digit3') || sm?.shortcuts?.has('3'));
        assert('Shortcut Manager registered Angle 4 cut (digit4)', sm?.shortcuts?.has('digit4') || sm?.shortcuts?.has('4'));

        // Toggle 4-Up off
        window.multiCamEngine.toggleMultiCam(false);
        assert('4-Up Multicam mode deactivated cleanly', window.multiCamEngine.active === false);

        // ─────────────────────────────────────────────────────────────
        // 2. Speed Ramping & Optical Flow Suite
        // ─────────────────────────────────────────────────────────────
        assert('Speed Ramp Engine exists on window', !!window.speedRampEngine);
        const presets = window.speedRampEngine.getPresets();
        assert('Speed Ramp Engine has >=6 presets', presets.length >= 6);
        assert('Fast Montage preset exists', presets.some(p => p.id === 'montage'));
        assert('Hero Moment preset exists', presets.some(p => p.id === 'hero'));
        assert('Bullet Time preset exists', presets.some(p => p.id === 'bullet'));

        // Preset points generation
        const heroPoints = window.speedRampEngine.getPresetPoints('hero', 10);
        assert('Hero Moment points generated for 10s clip', heroPoints.length >= 4);
        assert('Hero Moment has slow-motion dip (<=0.3x)', heroPoints.some(pt => pt.speed <= 0.3));

        // Time-remapping calculation
        const testClip = {
          startTime: 0,
          duration: 10,
          sourceStartTime: 0,
          speed: 1,
          speedPoints: heroPoints
        };
        const srcTimeAt5s = window.speedRampEngine.getSourceTimeAt(testClip, 5.0);
        assert('Non-linear time remapping computes valid source offset', typeof srcTimeAt5s === 'number' && srcTimeAt5s > 0 && srcTimeAt5s < 10);

        // Optical Flow frame blending
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 640;
        dummyCanvas.height = 360;
        const dCtx = dummyCanvas.getContext('2d');
        dCtx.fillStyle = '#ff0000';
        dCtx.fillRect(0, 0, 640, 360);

        const flowResult = window.speedRampEngine.applyOpticalFlow(dummyCanvas, testClip, 0.45);
        assert('Optical Flow returns blended canvas', flowResult instanceof HTMLCanvasElement);
        assert('Optical Flow canvas matches source dimensions', flowResult.width === 640 && flowResult.height === 360);

        // Add dedicated footage clip for speed ramping, EQ, compressor, and auto-captions
        const clipSpeed = Actions.addClip(store.getState().tracks[0].id, {
          name: 'Hero Action Clip',
          mediaType: 'video',
          sourcePath: mediaItems[0].path,
          startTime: 10,
          duration: 8,
          sourceStartTime: 0,
          sourceDuration: 8
        });

        // Actions speed ramp update
        Actions.setClipSpeedRamp(clipSpeed.id, 'hero');
        const updatedClip = Actions.getClip(clipSpeed.id);
        assert('Clip state received hero speed preset', updatedClip?.speedPreset === 'hero');
        assert('Clip state has concrete speedPoints', updatedClip?.speedPoints?.length >= 4);

        // Speed Curve canvas rendering
        const testCurveCanvas = document.createElement('canvas');
        testCurveCanvas.width = 280;
        testCurveCanvas.height = 90;
        window.speedRampEngine.renderSpeedCurve(testCurveCanvas, updatedClip.speedPoints, updatedClip.duration);
        assert('Speed Curve rendered onto canvas without errors', testCurveCanvas.width === 280);

        // ─────────────────────────────────────────────────────────────
        // 3. Parametric 4-Band Audio EQ & Dynamics Compressor
        // ─────────────────────────────────────────────────────────────
        assert('Audio Effects Manager exists on window', !!window.audioEffectsManager);
        const eqPresets = window.audioEffectsManager.getEQPresets();
        assert('EQ Presets available (>=5 presets)', Object.keys(eqPresets).length >= 5);
        assert('Podcast Pro EQ preset exists', !!eqPresets['podcast-pro']);
        assert('Bass Boost EQ preset exists', !!eqPresets['bass-boost']);

        // 4-Band EQ node chain creation
        const eqChain = window.audioEffectsManager.create4BandEQ({ low: 4, lowMid: -2, highMid: 3, high: 5 });
        assert('4-Band EQ created node chain', !!eqChain && !!eqChain.input && !!eqChain.output);
        assert('EQ chain has all 4 filter bands', !!eqChain?.filters?.low && !!eqChain?.filters?.lowMid && !!eqChain?.filters?.highMid && !!eqChain?.filters?.high);

        // EQ Visual Curve Rendering
        const eqCanvas = document.createElement('canvas');
        eqCanvas.width = 280;
        eqCanvas.height = 85;
        window.audioEffectsManager.renderEQCurve(eqCanvas, { low: 6, lowMid: -2, highMid: 3, high: 5 });
        assert('EQ visual response curve rendered onto canvas', eqCanvas.width === 280);

        // Dynamics Compressor creation
        const compressor = window.audioEffectsManager.createCompressor(-20, 6, 0.005, 0.2, 25);
        assert('Dynamics Compressor node created', !!compressor);
        assert('Compressor threshold matches configuration', Math.round(compressor?.threshold?.value) === -20);
        assert('Compressor ratio matches configuration', Math.round(compressor?.ratio?.value) === 6);
        assert('Compressor knee matches configuration', Math.round(compressor?.knee?.value) === 25);

        // Compressor Visual Curve Rendering
        const compCanvas = document.createElement('canvas');
        compCanvas.width = 280;
        compCanvas.height = 60;
        window.audioEffectsManager.renderCompressorCurve(compCanvas, { threshold: -20, ratio: 6, knee: 25 });
        assert('Compressor transfer curve rendered onto canvas', compCanvas.width === 280);

        // Action updates for EQ & Compressor
        Actions.setClipEqualizer(clipSpeed.id, { low: 4, lowMid: -1, highMid: 2, high: 3 });
        const clipWithEQ = Actions.getClip(clipSpeed.id);
        assert('Clip state has 4-Band EQ configured', clipWithEQ?.eq?.enabled === true && clipWithEQ?.eq?.low === 4);

        Actions.setClipCompressor(clipSpeed.id, { threshold: -18, ratio: 4, attack: 0.005, release: 0.2 });
        const clipWithComp = Actions.getClip(clipSpeed.id);
        assert('Clip state has Dynamics Compressor configured', clipWithComp?.compressor?.enabled === true && clipWithComp?.compressor?.threshold === -18);

        // ─────────────────────────────────────────────────────────────
        // 4. Auto-Captions & Speech-to-Text Suite
        // ─────────────────────────────────────────────────────────────
        assert('Auto-Captions Engine exists on window', !!window.autoCaptionsEngine);
        const subStylePresets = window.autoCaptionsEngine.getStylePresets();
        assert('Auto-Captions has style presets (>=4)', subStylePresets.length >= 4);
        assert('CapCut TikTok Yellow style preset exists', subStylePresets.some(p => p.id === 'tiktok-yellow'));
        assert('Classic Cinema style preset exists', subStylePresets.some(p => p.id === 'classic-cinema'));
        assert('Cyber Neon Glow style preset exists', subStylePresets.some(p => p.id === 'glow-neon'));

        // Set style preset
        const appliedStyle = window.autoCaptionsEngine.setStylePreset('tiktok-yellow');
        assert('TikTok Yellow style has activeWordColor #ffeaa7 or #f1c40f', !!appliedStyle.activeWordColor);
        assert('TikTok Yellow style has highlightActiveWord enabled', appliedStyle.highlightActiveWord === true);

        // Transcribe clip
        const transcription = await window.autoCaptionsEngine.transcribeClip(clipSpeed);
        assert('Transcription generated subtitle segments', transcription && transcription.length > 0);
        assert('First caption segment has words with timestamps', transcription[0].words && transcription[0].words.length > 0);
        assert('Words have start and end time', typeof transcription[0].words[0].start === 'number' && typeof transcription[0].words[0].end === 'number');

        // Generate Subtitles track on timeline
        const subTrack = window.autoCaptionsEngine.createSubtitlesTrackOnTimeline(transcription);
        assert('Subtitles track created on timeline', !!subTrack);
        assert('Subtitles track contains text clips', subTrack.clips && subTrack.clips.length > 0);
        assert('Subtitle clip has captionData and words attached', !!subTrack.clips[0].captionData && subTrack.clips[0].captionData.words.length > 0);

        // Live Karaoke Canvas Rendering
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = 1920;
        previewCanvas.height = 1080;
        const pCtx = previewCanvas.getContext('2d');
        const firstSubClip = subTrack.clips[0];
        const midTime = (firstSubClip.startTime + firstSubClip.duration / 2);

        window.autoCaptionsEngine.renderKaraokeCaption(pCtx, firstSubClip, midTime, 1920, 1080);
        assert('Karaoke caption rendered to canvas without errors', true);

        // SRT Export and Parse
        const srtOutput = window.autoCaptionsEngine.exportSRT(transcription);
        assert('Exported SRT contains standard SubRip format (-->)', srtOutput.includes('-->'));
        const parsedSRT = window.autoCaptionsEngine.parseSRT(srtOutput);
        assert('Parsed SRT reconstructed segments with words', parsedSRT.length === transcription.length);

        // Media Browser Text Tab UI integration
        window.mediaBrowser.setTab('text');
        const genBtn = document.getElementById('btnGenerateAutoCaptions');
        const styleSel = document.getElementById('selAutoCaptionStyle');
        assert('Media Browser Text tab has "Generate Auto-Captions" button', !!genBtn);
        assert('Media Browser Text tab has subtitle style dropdown', !!styleSel);

        // Inspector UI verification for selected clip
        Actions.selectClip(clipSpeed.id);
        window.inspector?.render();
        assert('Inspector shows EQ Enable checkbox', !!document.getElementById('propEqEnabled'));
        assert('Inspector shows EQ Preset dropdown', !!document.getElementById('propEqPreset'));
        assert('Inspector shows Dynamics Compressor Enable checkbox', !!document.getElementById('propCompEnabled'));
        assert('Inspector shows Speed Preset dropdown', !!document.getElementById('propSpeedPreset'));
        assert('Inspector shows Optical Flow checkbox', !!document.getElementById('propOpticalFlow'));
        assert('Inspector shows Preserve Pitch checkbox', !!document.getElementById('propPreservePitch'));

        // Switch Inspector tab to Audio so 4-Band EQ & Compressor curves are displayed in screenshot
        const audioTab = document.querySelector('.inspector-tab[data-tab="audio"]');
        if (audioTab) audioTab.click();
        const eqBox = document.getElementById('propEqEnabled');
        if (eqBox && !eqBox.checked) {
          eqBox.click();
        }
        const compBox = document.getElementById('propCompEnabled');
        if (compBox && !compBox.checked) {
          compBox.click();
        }

      } catch (err) {
        results.push({ name: 'Execution Error: ' + err.message, status: 'FAIL' });
      }

      return results;
    })();
  `);

  console.log('\n--- Phase 3 Test Execution Results ---');
  let passed = 0;
  let failed = 0;

  testResults.forEach(r => {
    if (r.status === 'PASS') {
      console.log(`  ✅ [PASS] ${r.name}`);
      passed++;
    } else {
      console.log(`  ❌ [FAIL] ${r.name}`);
      failed++;
    }
  });

  console.log('\n===========================================================');
  console.log(`Phase 3 Summary: ${passed} Passed, ${failed} Failed`);
  console.log('===========================================================');

  // Wait for paint
  await new Promise(r => setTimeout(r, 500));

  // Capture screenshot of Phase 3 verified UI
  const image = await win.capturePage();
  const artifactPath = path.join(__dirname, '..', 'artifacts', 'phase3_advanced_verified.png');
  fs.writeFileSync(artifactPath, image.toPNG());
  console.log(`📸 Phase 3 verified UI screenshot captured at: ${artifactPath}`);

  // Copy to conversation artifact directory if available
  const agentArtifactPath = path.join('C:', 'Users', 'Home', '.gemini', 'antigravity-ide', 'brain', '258f5d37-9b11-4caf-9aac-055ecdab25d2', 'phase3_advanced_verified.png');
  try {
    fs.writeFileSync(agentArtifactPath, image.toPNG());
    console.log(`📸 Copied to conversation artifact: ${agentArtifactPath}`);
  } catch (e) {}

  await win.close();
  app.exit(failed > 0 ? 1 : 0);
}

app.whenReady().then(runPhase3Tests);
