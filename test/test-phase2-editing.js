/**
 * StudioCut — Phase 2 Professional Editing Suite Automated Verification Suite
 * Validates Dual/Source Monitor, In/Out marking, 3-Point & 4-Point Insert/Overwrite editing,
 * Track Targeting, Match Frame, Lumetri 3-Way Color Wheels, HSL Secondary isolate,
 * 17 Transitions library, and Audio Auto-Ducking.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

async function runPhase2Tests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Starting Phase 2 Professional Editing Verification Suite');
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
        // 1. Source Monitor & Dual Monitor Modes
        // ─────────────────────────────────────────────────────────────
        assert('Source Monitor exists on window', !!window.sourceMonitor);
        assert('Source Monitor elements exist in DOM', 
          !!document.getElementById('sourceMonitorView') &&
          !!document.getElementById('sourceCanvas') &&
          !!document.getElementById('sourceScrubber') &&
          !!document.getElementById('monitorsWrapper')
        );

        // Test mode switching
        window.sourceMonitor.setMode('dual');
        const wrapper = document.getElementById('monitorsWrapper');
        const sourceView = document.getElementById('sourceMonitorView');
        const programView = document.getElementById('programMonitorView');
        assert('Dual mode displays both Source and Program monitors', 
          wrapper.classList.contains('monitors-wrapper--dual') &&
          sourceView.style.display === 'flex' &&
          programView.style.display === 'flex'
        );

        window.sourceMonitor.setMode('source');
        assert('Source mode hides Program monitor', 
          wrapper.classList.contains('monitors-wrapper--source') &&
          sourceView.style.display === 'flex' &&
          programView.style.display === 'none'
        );

        window.sourceMonitor.setMode('program');
        assert('Program mode hides Source monitor', 
          wrapper.classList.contains('monitors-wrapper--program') &&
          sourceView.style.display === 'none' &&
          programView.style.display === 'flex'
        );

        // Switch back to dual for testing
        window.sourceMonitor.setMode('dual');

        // Test loading media into Source Monitor
        const mediaList = store.get('media') || [];
        const sampleMedia = mediaList[0] || {
          id: 'test-media-1',
          name: 'Action_Footage.mp4',
          type: 'video',
          path: 'demo://sample.mp4',
          duration: 12.0
        };

        window.sourceMonitor.loadMedia(sampleMedia, 1.0);
        assert('Media loaded in Source Monitor with correct duration', 
          window.sourceMonitor.currentMedia?.name === sampleMedia.name &&
          window.sourceMonitor.duration === sampleMedia.duration
        );

        // In / Out point marking
        window.sourceMonitor.seek(2.5);
        window.sourceMonitor.setInPoint();
        assert('Source In point marked at 2.5s', Math.abs(window.sourceMonitor.sourceIn - 2.5) < 0.001);

        window.sourceMonitor.seek(6.0);
        window.sourceMonitor.setOutPoint();
        assert('Source Out point marked at 6.0s', Math.abs(window.sourceMonitor.sourceOut - 6.0) < 0.001);

        // Video / Audio only drag elements exist
        const dragVideoBtn = document.getElementById('btnSourceDragVideo');
        const dragAudioBtn = document.getElementById('btnSourceDragAudio');
        assert('Drag Video Only and Audio Only buttons exist', !!dragVideoBtn && !!dragAudioBtn);

        // Clear In/Out
        window.sourceMonitor.clearInOut();
        assert('Cleared In/Out resets to 0 and full duration', 
          window.sourceMonitor.sourceIn === 0 && 
          window.sourceMonitor.sourceOut === window.sourceMonitor.duration
        );

        // ─────────────────────────────────────────────────────────────
        // 2. Track Targeting (V1/V2, A1/A2)
        // ─────────────────────────────────────────────────────────────
        const tracks = store.get('tracks') || [];
        const vTrack = tracks.find(t => t.type === 'video');
        const aTrack = tracks.find(t => t.type === 'audio');
        assert('Video and Audio tracks exist for targeting', !!vTrack && !!aTrack);

        Actions.setTargetTrack('video', vTrack.id);
        assert('Target video track stored in state', store.get('timeline.targetVideoTrack') === vTrack.id);
        assert('Actions.getTargetTrack("video") returns targeted track', Actions.getTargetTrack('video')?.id === vTrack.id);

        Actions.setTargetTrack('audio', aTrack.id);
        assert('Target audio track stored in state', store.get('timeline.targetAudioTrack') === aTrack.id);
        assert('Actions.getTargetTrack("audio") returns targeted track', Actions.getTargetTrack('audio')?.id === aTrack.id);

        const targetBtns = document.querySelectorAll('.track-header__target-btn');
        assert('Track header target buttons rendered in DOM', targetBtns.length >= 2);

        // ─────────────────────────────────────────────────────────────
        // 3. 3-Point & 4-Point Editing Engine (Insert & Overwrite)
        // ─────────────────────────────────────────────────────────────
        // Prepare track clips for insert test
        vTrack.clips = [
          {
            id: 'base-clip-1',
            name: 'Base Clip 1',
            startTime: 0,
            duration: 4.0,
            sourceStartTime: 0,
            sourceDuration: 4.0,
            mediaType: 'video'
          },
          {
            id: 'base-clip-2',
            name: 'Base Clip 2',
            startTime: 4.0,
            duration: 6.0,
            sourceStartTime: 0,
            sourceDuration: 6.0,
            mediaType: 'video'
          }
        ];
        store.set('tracks', tracks);
        store._emit('tracks', tracks);

        // Set source in/out: 2s subclip
        window.sourceMonitor.sourceIn = 1.0;
        window.sourceMonitor.sourceOut = 3.0; // 2s duration

        // Perform Insert Edit at time = 2.0 (splits base-clip-1, ripples base-clip-2)
        store.set('playback.currentTime', 2.0);
        const inserted = Actions.insertEdit();
        assert('Insert Edit returned inserted clip', !!inserted);
        assert('Inserted clip starts at playhead time (2.0s)', Math.abs(inserted.startTime - 2.0) < 0.001);
        assert('Inserted clip duration is 2.0s', Math.abs(inserted.duration - 2.0) < 0.001);

        // Verify rippling: base-clip-2 originally started at 4.0, should now start at 6.0 (pushed by 2.0s)
        const updatedVTrack = store.get('tracks').find(t => t.id === vTrack.id);
        const clip2 = updatedVTrack.clips.find(c => c.id === 'base-clip-2');
        assert('Downstream clip was rippled forward by 2.0s', clip2 && Math.abs(clip2.startTime - 6.0) < 0.001);

        // Test Undo of Insert Edit
        store.undo();
        const uninsertedTrack = store.get('tracks').find(t => t.id === vTrack.id);
        const restoredClip2 = uninsertedTrack.clips.find(c => c.id === 'base-clip-2');
        assert('Undo restored downstream clip to original position (4.0s)', restoredClip2 && Math.abs(restoredClip2.startTime - 4.0) < 0.001);
        assert('Undo removed the inserted clip', !uninsertedTrack.clips.find(c => c.id === inserted.id));

        // Test Redo
        store.redo();
        const reinsertedTrack = store.get('tracks').find(t => t.id === vTrack.id);
        assert('Redo restored the inserted clip', !!reinsertedTrack.clips.find(c => c.id === inserted.id));

        // Test Overwrite Edit: Overwrite 2s at time = 1.0
        store.set('playback.currentTime', 1.0);
        const overwrote = Actions.overwriteEdit();
        assert('Overwrite Edit returned new clip', !!overwrote);
        assert('Overwrote clip starts at 1.0s with duration 2.0s', 
          Math.abs(overwrote.startTime - 1.0) < 0.001 &&
          Math.abs(overwrote.duration - 2.0) < 0.001
        );

        // Undo Overwrite
        store.undo();
        assert('Undo reversed overwrite edit', !store.get('tracks').find(t => t.id === vTrack.id).clips.find(c => c.id === overwrote.id));

        // ─────────────────────────────────────────────────────────────
        // 4. Match Frame (F Key)
        // ─────────────────────────────────────────────────────────────
        // Select clip and match frame
        const currentClips = store.get('tracks').find(t => t.id === vTrack.id).clips;
        const targetForMatch = currentClips[0];
        targetForMatch.sourcePath = 'demo://scene_01.mp4';
        targetForMatch.sourceStartTime = 5.0;
        store.set('selection.clipIds', [targetForMatch.id]);
        store.set('playback.currentTime', targetForMatch.startTime + 1.5); // 1.5s into clip

        const matchResult = Actions.matchFrame();
        assert('Match Frame located source clip and calculated frame offset', 
          !!matchResult &&
          matchResult.clip.id === targetForMatch.id &&
          Math.abs(matchResult.sourceFrameTime - 6.5) < 0.001
        );
        assert('Source Monitor loaded matched frame time', Math.abs(window.sourceMonitor.currentTime - 6.5) < 0.001);

        // ─────────────────────────────────────────────────────────────
        // 5. Lumetri 3-Way Color Wheels & HSL Secondary
        // ─────────────────────────────────────────────────────────────
        assert('EffectsEngine supports color-wheels shader', window.effectsEngine?.hasEffect('color-wheels') || window.effectsEngine?.programs.has('color-wheels'));
        assert('EffectsEngine supports hsl-secondary shader', window.effectsEngine?.hasEffect('hsl-secondary') || window.effectsEngine?.programs.has('hsl-secondary'));

        // Apply 3-Way Color Wheels to selected clip
        Actions.updateClip(targetForMatch.id, {
          colorWheels: {
            enabled: true,
            shadowsHex: '#708090',
            midtonesHex: '#908070',
            highlightsHex: '#809080',
            shadowsLuma: -0.1,
            midtonesLuma: 0.05,
            highlightsLuma: 0.15
          },
          hslSecondary: {
            enabled: true,
            hue: 120, // Green isolate
            hueTolerance: 25,
            hueFeather: 15,
            invertMask: false,
            hueShift: 30,
            satMult: 1.5,
            temperature: 0.2,
            tint: -0.1
          }
        });

        const gradedClip = store.get('tracks').find(t => t.id === vTrack.id).clips.find(c => c.id === targetForMatch.id);
        assert('Clip state has 3-Way Color Wheels configured', 
          gradedClip.colorWheels?.enabled === true &&
          gradedClip.colorWheels?.shadowsHex === '#708090' &&
          gradedClip.colorWheels?.highlightsLuma === 0.15
        );
        assert('Clip state has Lumetri HSL Secondary configured', 
          gradedClip.hslSecondary?.enabled === true &&
          gradedClip.hslSecondary?.hue === 120 &&
          gradedClip.hslSecondary?.hueShift === 30 &&
          gradedClip.hslSecondary?.satMult === 1.5
        );

        // ─────────────────────────────────────────────────────────────
        // 6. Expanded Transitions Library (17 Professional Transitions)
        // ─────────────────────────────────────────────────────────────
        assert('TransitionEngine exists on window', !!window.transitionEngine);
        const trTypes = window.transitionEngine.getTransitionTypes();
        assert('TransitionEngine has 17 transitions registered', trTypes.length >= 17);

        const expectedTransitions = [
          'cross-dissolve', 'dip-black', 'dip-white', 'slide-left', 'slide-right',
          'wipe-right', 'zoom-in', 'iris-wipe', 'clock-wipe', 'push-up',
          'push-down', 'zoom-out', 'whip-pan', 'glitch', 'film-burn',
          'split-door', 'spin-cw'
        ];

        let allFound = true;
        for (const trId of expectedTransitions) {
          if (!window.transitionEngine.transitions.has(trId)) {
            allFound = false;
            break;
          }
        }
        assert('All 17 professional transitions exist in engine', allFound);

        // Switch to transitions tab and verify cards rendered
        window.mediaBrowser?.setTab('transitions');
        const trCards = document.querySelectorAll('.transition-card');
        assert('Media Browser rendered 17 transition cards', trCards.length >= 17);

        // Test applying transition
        Actions.updateClip(targetForMatch.id, { transition: { type: 'iris-wipe', duration: 1.0 } });
        const trClip = store.get('tracks').find(t => t.id === vTrack.id).clips.find(c => c.id === targetForMatch.id);
        assert('Applied Iris Wipe transition to clip', trClip.transition?.type === 'iris-wipe');

        // ─────────────────────────────────────────────────────────────
        // 7. Audio Auto-Ducking
        // ─────────────────────────────────────────────────────────────
        store.set('audio.autoDuckingEnabled', true);
        assert('Auto-ducking enabled in store', store.get('audio.autoDuckingEnabled') === true);
        assert('AudioEngine has _applyAutoDucking method', typeof window.audioEngine?._applyAutoDucking === 'function');

        // Run _applyAutoDucking without exceptions
        let duckError = null;
        try {
          window.audioEngine._applyAutoDucking(1.0, store.get('tracks'));
        } catch (e) {
          duckError = e;
        }
        assert('AudioEngine._applyAutoDucking executes cleanly', duckError === null);

        // ─────────────────────────────────────────────────────────────
        // 8. Shortcuts Registration
        // ─────────────────────────────────────────────────────────────
        const sm = window.shortcutManager;
        assert('Shortcut Manager registered Insert Edit (comma)', sm.shortcuts.has('comma'));
        assert('Shortcut Manager registered Overwrite Edit (period)', sm.shortcuts.has('period'));
        assert('Shortcut Manager registered Match Frame (keyf)', sm.shortcuts.has('keyf'));
        assert('Shortcut Manager registered Mark In (keyi)', sm.shortcuts.has('keyi'));
        assert('Shortcut Manager registered Mark Out (keyo)', sm.shortcuts.has('keyo'));
        assert('Shortcut Manager registered Jump to In (shift+i)', sm.shortcuts.has('shift+i'));
        assert('Shortcut Manager registered Jump to Out (shift+o)', sm.shortcuts.has('shift+o'));
        assert('Shortcut Manager registered Clear In/Out (alt+x)', sm.shortcuts.has('alt+x'));
        assert('Shortcut Manager registered Fullscreen (ctrl+f)', sm.shortcuts.has('ctrl+f'));

        // Restore Dual Monitor mode with rendered media frame for verified screenshot
        window.sourceMonitor?.setMode('dual');
        window.sourceMonitor?.seek(2.5);
        window.sourceMonitor?.renderFrame();
        window.previewEngine?.updatePreview();

      } catch (err) {
        results.push({ name: 'Phase 2 Test Execution Exception: ' + err.message, status: 'FAIL' });
      }

      return results;
    })();
  `);

  console.log('\n--- Phase 2 Test Execution Results ---');
  let passCount = 0;
  let failCount = 0;

  for (const r of testResults) {
    if (r.status === 'PASS') {
      console.log(`  ✅ [PASS] ${r.name}`);
      passCount++;
    } else {
      console.log(`  ❌ [FAIL] ${r.name}`);
      failCount++;
    }
  }

  console.log('\n===========================================================');
  console.log(`Phase 2 Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('===========================================================');

  // Wait for layout and canvas paints to flush
  await new Promise(r => setTimeout(r, 600));

  // Capture UI screenshot of Dual Monitor mode
  const artifactDir = path.join(__dirname, '..', 'artifacts');
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
  const shotPath = path.join(artifactDir, 'phase2_dual_monitor_verified.png');
  const img = await win.capturePage();
  fs.writeFileSync(shotPath, img.toPNG());
  console.log(`📸 Dual Monitor screenshot captured at: ${shotPath}`);

  // Copy to conversation artifact
  const convoArtifactDir = path.join('C:', 'Users', 'Home', '.gemini', 'antigravity-ide', 'brain', '258f5d37-9b11-4caf-9aac-055ecdab25d2');
  if (fs.existsSync(convoArtifactDir)) {
    const convoShot = path.join(convoArtifactDir, 'phase2_dual_monitor_verified.png');
    fs.writeFileSync(convoShot, img.toPNG());
    console.log(`📸 Copied to conversation artifact: ${convoShot}`);
  }

  win.close();
  app.quit();

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

app.whenReady().then(runPhase2Tests);
