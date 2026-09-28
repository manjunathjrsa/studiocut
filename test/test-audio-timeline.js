/**
 * StudioCut — Audio Scrubbing & Playback Verification Test
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

async function runAudioVerification() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Verifying Timeline Audio Scrubbing & Playback Movement');
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

  const htmlPath = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
  await win.loadFile(htmlPath);
  await new Promise(r => setTimeout(r, 1500));

  const results = await win.webContents.executeJavaScript(`
    (async function() {
      document.getElementById('splashScreen')?.remove();
      const res = [];
      const assert = (name, pass, extra = '') => {
        res.push({ name, pass, extra });
      };

      // 1. AudioEngine initialized check
      assert('AudioEngine initialized at startup', !!window.audioEngine && window.audioEngine.initialized === true);
      assert('AudioContext exists', !!window.audioEngine?.ctx);

      // 2. Add sample media
      await window.app.addSampleMedia();
      const mediaList = store.get('media') || [];
      const synthAudio = mediaList.find(m => m.type === 'audio');
      assert('Synth audio demo exists', !!synthAudio);

      // 3. Add audio clip to timeline at 1.0s
      let tracks = store.get('tracks') || [];
      let audioTrack = tracks.find(t => t.type === 'audio');
      if (!audioTrack) {
        audioTrack = Actions.addTrack('audio');
      }

      Actions.addClip(audioTrack.id, {
        mediaId: synthAudio.id,
        sourcePath: synthAudio.path,
        name: synthAudio.name,
        mediaType: 'audio',
        startTime: 1.0,
        duration: 8.0,
        sourceDuration: 8.0
      });

      await new Promise(r => setTimeout(r, 200));

      // 4. Verify buffer preloaded into cache
      const hasBuffer = window.audioEngine.audioBufferCache.has(synthAudio.path);
      assert('Audio buffer preloaded into cache on track addition', hasBuffer);

      // 5. Test audio scrubbing while moving in timeline
      let scrubTriggered = false;
      const originalPlayScrub = window.audioEngine._playScrubSlice;
      window.audioEngine._playScrubSlice = function(clip, track, time, dur) {
        scrubTriggered = true;
        return originalPlayScrub.call(this, clip, track, time, dur);
      };

      // Move playhead across the timeline over the clip (at 2.5s)
      Actions.seek(2.5);
      await new Promise(r => setTimeout(r, 100));
      assert('Audio scrubbing triggered while moving in timeline at 2.5s', scrubTriggered);

      // Move playhead again to 4.0s
      scrubTriggered = false;
      Actions.seek(4.0);
      await new Promise(r => setTimeout(r, 100));
      assert('Audio scrubbing triggered while moving in timeline at 4.0s', scrubTriggered);

      // Restore original method
      window.audioEngine._playScrubSlice = originalPlayScrub;

      // 6. Test playback movement and dynamic audio synchronization
      Actions.seek(0.0);
      window.previewEngine.play();
      await new Promise(r => setTimeout(r, 100));
      assert('Playback is playing', store.get('playback.playing') === true);

      // Seek playhead while playing to 2.0s (inside audio clip)
      Actions.seek(2.0);
      await new Promise(r => setTimeout(r, 150));
      const activeClipsCount = window.audioEngine.activeSources.size;
      assert('Active audio source playing at 2.0s', activeClipsCount > 0, \`active sources: \${activeClipsCount}\`);

      // Pause playback
      window.previewEngine.pause();
      await new Promise(r => setTimeout(r, 100));
      assert('Playback paused', store.get('playback.playing') === false);
      assert('Active audio sources stopped on pause', window.audioEngine.activeSources.size === 0);

      // 7. Test master volume adjustment
      window.audioEngine.setMasterVolume(0.8);
      assert('Master volume updated to 0.8', Math.abs(window.audioEngine.masterGain.gain.value - 0.8) < 0.01);

      return res;
    })();
  `);

  console.log('\n--- Verification Results ---');
  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    if (r.pass) {
      console.log(`  ✅ [PASS] ${r.name} ${r.extra ? '(' + r.extra + ')' : ''}`);
      passCount++;
    } else {
      console.log(`  ❌ [FAIL] ${r.name} ${r.extra ? '(' + r.extra + ')' : ''}`);
      failCount++;
    }
  }

  console.log('\n===========================================================');
  console.log(`Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('===========================================================');

  win.destroy();
  app.quit();

  if (failCount > 0) process.exit(1);
  else process.exit(0);
}

app.whenReady().then(runAudioVerification);
