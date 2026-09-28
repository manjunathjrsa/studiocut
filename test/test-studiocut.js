/**
 * StudioCut — Comprehensive Automated E2E Test Suite
 * Validates initialization, media import, timeline operations, gizmo manipulation,
 * chroma key, LUTs, layouts, inspector, and audio/video playback.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable GPU acceleration and sandboxing for reliable automated CI/test execution
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Starting StudioCut Automated E2E Verification Suite');
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

  // Wait for App to bootstrap and splash to clear
  await new Promise(r => setTimeout(r, 1500));

  // Run test suite inside the renderer
  const testResults = await win.webContents.executeJavaScript(`
    (async function() {
      // Dismiss splash immediately
      document.getElementById('splashScreen')?.remove();

      const results = [];
      const assert = (desc, condition) => {
        if (condition) {
          results.push({ name: desc, status: 'PASS' });
        } else {
          results.push({ name: desc, status: 'FAIL' });
        }
      };

      try {
        // Test 1: DOM Structure & Core Panels
        assert('Media Panel exists', !!document.getElementById('mediaPanel'));
        assert('Preview Panel & Canvas exist', !!document.getElementById('previewPanel') && !!document.getElementById('previewCanvas'));
        assert('Timeline Panel exists', !!document.getElementById('timelinePanel'));
        assert('Inspector Panel exists', !!document.getElementById('inspectorPanel'));
        assert('Resizers (Left, Right, Bottom) exist', !!document.getElementById('resizerLeft') && !!document.getElementById('resizerRight') && !!document.getElementById('resizerBottom'));

        // Test 2: Layout Preset Switching
        assert('Layout buttons exist', document.querySelectorAll('.layout-preset-btn').length >= 5);
        window.app.setLayout('edit');
        const wsEdit = document.getElementById('workspace');
        assert('Edit layout sets expanded inspector', wsEdit.style.gridTemplateColumns.includes('380px'));

        window.app.setLayout('media');
        assert('Media layout sets expanded media browser', wsEdit.style.gridTemplateColumns.includes('480px'));

        window.app.setLayout('default');
        assert('Default layout restored', wsEdit.style.gridTemplateColumns.includes('340px') || wsEdit.style.gridTemplateColumns.includes('320px'));

        // Test 3: Sample Media Generation
        await window.app.addSampleMedia();
        const mediaList = store.get('media') || [];
        assert('Sample media items generated (>=3)', mediaList.length >= 3);
        const hasLandscape = mediaList.some(m => m.name.includes('Landscape'));
        const hasChroma = mediaList.some(m => m.name.toLowerCase().includes('green') || m.name.toLowerCase().includes('chroma'));
        const hasAudio = mediaList.some(m => m.type === 'audio');
        assert('Landscape demo exists', hasLandscape);
        assert('Chroma Key demo exists', hasChroma);
        assert('Synth Audio demo exists', hasAudio);

        // Test 4: Add Media to Timeline via Media Browser
        const landscapeMedia = mediaList.find(m => m.name.includes('Landscape'));
        const chromaMedia = mediaList.find(m => m.name.toLowerCase().includes('green'));
        const audioMedia = mediaList.find(m => m.type === 'audio');

        window.mediaBrowser.addMediaToTimeline(landscapeMedia);
        let tracks = store.get('tracks') || [];
        let videoTrack = tracks.find(t => t.type === 'video');
        assert('Video track received clip 1', videoTrack && videoTrack.clips.length === 1);

        window.mediaBrowser.addMediaToTimeline(audioMedia);
        tracks = store.get('tracks') || [];
        let audioTrack = tracks.find(t => t.type === 'audio');
        assert('Audio track received audio clip', audioTrack && audioTrack.clips.length === 1);

        // Test 5: Selection and Inspector
        const clip1 = videoTrack.clips[0];
        Actions.selectClips([clip1.id]);
        await new Promise(r => setTimeout(r, 50));

        const propNameInput = document.getElementById('propClipName');
        assert('Inspector shows selected clip name', propNameInput && propNameInput.value === clip1.name);

        // Test Transform Buttons: Flip H, Flip V, Center, Reset
        const btnFlipH = document.getElementById('btnFlipH');
        assert('Flip H button exists', !!btnFlipH);
        btnFlipH.click();
        let updatedClip = store.get('tracks').find(t => t.id === videoTrack.id).clips.find(c => c.id === clip1.id);
        assert('Flip H toggled scaleX negative', updatedClip.transform.scaleX < 0);

        const btnReset = document.getElementById('btnResetTransform');
        btnReset.click();
        updatedClip = store.get('tracks').find(t => t.id === videoTrack.id).clips.find(c => c.id === clip1.id);
        assert('Reset Transform restores scaleX to 1 and position to 0', updatedClip.transform.scaleX === 1 && updatedClip.transform.x === 0);

        // Test 6: Inspector Category Tabs
        const videoTab = document.querySelector('.inspector-tab-btn[data-subtab="video"]');
        const audioTab = document.querySelector('.inspector-tab-btn[data-subtab="audio"]');
        const colorTab = document.querySelector('.inspector-tab-btn[data-subtab="color"]');
        const allTab = document.querySelector('.inspector-tab-btn[data-subtab="all"]');
        assert('Inspector category tabs exist', !!videoTab && !!audioTab && !!colorTab && !!allTab);

        audioTab.click();
        const videoSec = document.querySelector('.inspector-section[data-category="video"]');
        const audioSec = document.querySelector('.inspector-section[data-category="audio"]');
        assert('Audio tab hides video sections', videoSec.style.display === 'none');
        assert('Audio tab displays audio sections', audioSec.style.display !== 'none');

        allTab.click();
        assert('All tab reveals all sections', videoSec.style.display !== 'none');

        // Test 7: Chroma Key and LUT Controls
        const chromaCheck = document.getElementById('propChromaEnabled');
        assert('Chroma Key checkbox exists', !!chromaCheck);
        chromaCheck.checked = true;
        chromaCheck.dispatchEvent(new Event('change'));
        updatedClip = store.get('tracks').find(t => t.id === videoTrack.id).clips.find(c => c.id === clip1.id);
        assert('Chroma key enabled in clip state', updatedClip.chromaKey.enabled === true);

        const lutSelect = document.getElementById('propLutPreset');
        assert('LUT preset selector exists', !!lutSelect);
        lutSelect.value = 'teal-orange';
        lutSelect.dispatchEvent(new Event('change'));
        updatedClip = store.get('tracks').find(t => t.id === videoTrack.id).clips.find(c => c.id === clip1.id);
        assert('LUT preset applied in clip state', updatedClip.lutPreset === 'teal-orange');

        // Test 8: Timeline Razor Tool & Split
        Actions.seek(2.0);
        Actions.splitClipAtPlayhead();
        tracks = store.get('tracks') || [];
        videoTrack = tracks.find(t => t.type === 'video');
        assert('Split at playhead created 2 clips', videoTrack.clips.length === 2);

        // Test 9: Playback Engine
        window.previewEngine.play();
        assert('Playback engine started playing', store.get('playback.playing') === true);
        window.previewEngine.pause();
        assert('Playback engine paused', store.get('playback.playing') === false);

        // Test 10: Aspect Ratio & Guides
        const aspectSelect = document.getElementById('previewAspectRatio');
        assert('Aspect ratio selector exists', !!aspectSelect);
        aspectSelect.value = '9:16';
        aspectSelect.dispatchEvent(new Event('change'));
        assert('Aspect ratio switched to 9:16 in store', store.get('project.aspectRatio') === '9:16');

        aspectSelect.value = '16:9';
        aspectSelect.dispatchEvent(new Event('change'));
        assert('Aspect ratio returned to 16:9', store.get('project.aspectRatio') === '16:9');

        const btnGuides = document.getElementById('btnToggleGuides');
        btnGuides.click();
        assert('Safe guides toggled ON', window.previewEngine.showGuides === true);
        btnGuides.click();
        assert('Safe guides toggled OFF', window.previewEngine.showGuides === false);

        // Test 11: Export, Settings & Help Modals
        const btnExport = document.getElementById('btnExport');
        assert('Export toolbar button exists', !!btnExport);
        btnExport.click();
        let exportModal = document.getElementById('exportModal');
        assert('Export modal opened via button', !!exportModal);
        const btnCancelExport = document.getElementById('btnCancelExport');
        if (btnCancelExport) btnCancelExport.click();
        exportModal = document.getElementById('exportModal');
        assert('Export modal closed', !exportModal);

        const btnSettings = document.getElementById('btnProjectSettings');
        assert('Settings toolbar button exists', !!btnSettings);
        btnSettings.click();
        let settingsModal = document.getElementById('settingsModal');
        assert('Project Settings modal opened via button', !!settingsModal);
        const btnCancelSettings = document.getElementById('btnCancelSettings');
        if (btnCancelSettings) btnCancelSettings.click();
        settingsModal = document.getElementById('settingsModal');
        assert('Project Settings modal closed', !settingsModal);

        const btnHelp = document.getElementById('btnHelp');
        assert('Help toolbar button exists', !!btnHelp);
        btnHelp.click();
        let helpModal = document.getElementById('helpModal');
        assert('Help & FAQ modal opened via button', !!helpModal);
        const btnGotItHelp = document.getElementById('btnGotItHelp');
        if (btnGotItHelp) btnGotItHelp.click();
        helpModal = document.getElementById('helpModal');
        assert('Help & FAQ modal closed', !helpModal);

        const btnViewMenu = document.getElementById('btnViewMenu');
        const viewMenuDropdown = document.getElementById('viewMenuDropdown');
        assert('View Menu button and dropdown exist', !!btnViewMenu && !!viewMenuDropdown);
        btnViewMenu.click();
        assert('View Menu opened on click', viewMenuDropdown.style.display === 'block');
        btnViewMenu.click();
        assert('View Menu closed on toggle', viewMenuDropdown.style.display === 'none');

        // Test 12: Undo and Redo
        const preUndoCount = store.get('tracks').find(t => t.type === 'video').clips.length;
        store.undo();
        const postUndoCount = store.get('tracks').find(t => t.type === 'video').clips.length;
        assert('Undo reversed last action (clip count decreased)', postUndoCount < preUndoCount);
        store.redo();
        const postRedoCount = store.get('tracks').find(t => t.type === 'video').clips.length;
        assert('Redo restored state', postRedoCount === preUndoCount);

        // Test 13: Cut and Paste
        const initialCount = store.get('tracks').find(t => t.type === 'video').clips.length;
        const targetCutClip = store.get('tracks').find(t => t.type === 'video').clips[0];
        Actions.selectClips([targetCutClip.id]);
        const cutCount = Actions.cutSelectedClips();
        assert('Cut selected clips removed clip to clipboard', cutCount === 1);
        const postCutCount = store.get('tracks').find(t => t.type === 'video').clips.length;
        assert('Video track has 1 less clip after cut', postCutCount === initialCount - 1);
        const pasted = Actions.pasteClips();
        assert('Pasting restored the cut clip', pasted.length === 1);

        // Test 14: Panel Collapsing and Expanding
        const mediaPanelEl = document.getElementById('mediaPanel');
        window.app.togglePanel('media');
        assert('Media panel collapsed to hidden', mediaPanelEl.style.display === 'none');
        window.app.togglePanel('media');
        assert('Media panel restored to visible', mediaPanelEl.style.display !== 'none');

        const inspectorPanelEl = document.getElementById('inspectorPanel');
        window.app.togglePanel('inspector');
        assert('Inspector panel collapsed to hidden', inspectorPanelEl.style.display === 'none');
        window.app.togglePanel('inspector');
        assert('Inspector panel restored to visible', inspectorPanelEl.style.display !== 'none');

        // Test 15: Audio Mixer Toggle
        const mixerEl = document.getElementById('audioMixerPanel');
        assert('Audio mixer panel exists', !!mixerEl);
        window.app.toggleAudioMixer();
        assert('Audio mixer toggled to visible', window.audioMixerPanel?.visible === true);
        window.app.toggleAudioMixer();
        assert('Audio mixer toggled to hidden', window.audioMixerPanel?.visible === false);

        // Test 16: Freeze Frame
        const vTrackForFreeze = store.get('tracks').find(t => t.type === 'video');
        if (vTrackForFreeze && vTrackForFreeze.clips.length > 0) {
          const cToFreeze = vTrackForFreeze.clips[0];
          Actions.seek(cToFreeze.startTime + cToFreeze.duration / 2);
          const preFreezeCount = vTrackForFreeze.clips.length;
          Actions.freezeFrame(cToFreeze.id, 2);
          const postFreezeClips = store.get('tracks').find(t => t.type === 'video').clips;
          assert('Freeze frame created hold clip', postFreezeClips.length > preFreezeCount);
        }

        return { success: true, results };
      } catch (err) {
        return { success: false, error: err.stack || err.message, results };
      }
    })();
  `);

  console.log('\n--- Test Execution Results ---');
  let passCount = 0;
  let failCount = 0;

  for (const res of testResults.results) {
    if (res.status === 'PASS') {
      console.log(`  ✅ [PASS] ${res.name}`);
      passCount++;
    } else {
      console.log(`  ❌ [FAIL] ${res.name}`);
      failCount++;
    }
  }

  if (!testResults.success) {
    console.error('\n🚨 Error during test execution:', testResults.error);
  }

  if (consoleLogs.length > 0) {
    console.log('\n--- Renderer Console Logs ---');
    consoleLogs.forEach(l => console.log(' ', l));
  }

  console.log('\n===========================================================');
  console.log(`Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('===========================================================');

  // Ensure splash screen is removed, toasts cleared, and workspace fully rendered
  await win.webContents.executeJavaScript(`
    const splash = document.getElementById('splashScreen');
    if (splash) splash.remove();
    const toasts = document.getElementById('toastContainer');
    if (toasts) toasts.innerHTML = '';
    window.previewEngine?.updatePreview();
    window.timelineEngine?.render();
  `);
  await new Promise(r => setTimeout(r, 600));

  // Capture screenshot of the running UI
  const screenshotPath = path.join(__dirname, '..', 'artifacts', 'studiocut_verified_ui.png');
  const dir = path.dirname(screenshotPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const image = await win.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`📸 UI screenshot captured at: ${screenshotPath}`);

  win.destroy();
  app.quit();

  if (failCount > 0 || !testResults.success) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

app.whenReady().then(runTests);
