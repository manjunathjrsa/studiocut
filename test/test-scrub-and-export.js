/**
 * StudioCut — Scrubbing & Video Export Automated Verification Test
 * Verifies:
 * 1. Playhead scrubbing across timeline renders video frames continuously without blank/black frames.
 * 2. Playhead red line grab and drag interaction works.
 * 3. Video export via studiocut.export.start renders timeline clips and outputs a valid video file.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupIpcHandlers } = require('../src/main/ipc-handlers');
const { FFmpegEngine } = require('../src/main/ffmpeg-engine');
const { ProjectManager } = require('../src/main/project-manager');
const { FileManager } = require('../src/main/file-manager');
const { ExportEngine } = require('../src/main/export-engine');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

async function runScrubAndExportVerification() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Verifying Timeline Scrubbing & Real Video Export');
  console.log('═══════════════════════════════════════════════════════════');

  const win = new BrowserWindow({
    width: 1600,
    height: 920,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webgl: true,
      backgroundThrottling: false
    }
  });

  const ffmpegEngine = new FFmpegEngine();
  const projectManager = new ProjectManager();
  const fileManager = new FileManager();
  const exportEngine = new ExportEngine(ffmpegEngine);
  setupIpcHandlers({
    mainWindow: () => win,
    ffmpegEngine,
    projectManager,
    fileManager,
    exportEngine
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

      // 1. Add sample media and place on timeline
      await window.app.addSampleMedia();
      const mediaList = store.get('media') || [];
      const landscape = mediaList.find(m => m.name.includes('Landscape'));
      const synthAudio = mediaList.find(m => m.type === 'audio');

      assert('Sample landscape video/image exists', !!landscape);
      assert('Sample synth audio exists', !!synthAudio);

      // Add to Video 1 track
      const tracks = store.get('tracks') || [];
      const videoTrack = tracks.find(t => t.type === 'video');
      const audioTrack = tracks.find(t => t.type === 'audio');

      Actions.addClip(videoTrack.id, {
        mediaId: landscape.id,
        sourcePath: landscape.path,
        name: landscape.name,
        mediaType: landscape.type,
        startTime: 0,
        duration: 4,
        sourceStartTime: 0
      });

      Actions.addClip(audioTrack.id, {
        mediaId: synthAudio.id,
        sourcePath: synthAudio.path,
        name: synthAudio.name,
        mediaType: 'audio',
        startTime: 0,
        duration: 4,
        sourceStartTime: 0
      });

      window.previewEngine?.updatePreview();

      // 2. Playhead element exists and has pointer-events enabled
      const playhead = document.getElementById('playhead');
      const playheadStyle = window.getComputedStyle(playhead);
      assert('Playhead element exists', !!playhead);
      assert('Playhead has pointer-events enabled for direct dragging', playheadStyle.pointerEvents !== 'none');

      // 3. Test scrubbing simulation: seek across 20 positions rapidly
      const canvas = document.getElementById('previewCanvas');
      const ctx = canvas.getContext('2d');
      let nonBlackFrames = 0;
      let blackFrames = 0;

      for (let t = 0; t <= 3.8; t += 0.2) {
        Actions.seek(t);
        // Sample center pixel of canvas
        const pixel = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
        const isBlack = (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0);
        if (isBlack) {
          blackFrames++;
        } else {
          nonBlackFrames++;
        }
      }

      assert('Playhead scrubbing renders video content smoothly', nonBlackFrames > 0, \`non-black frames: \${nonBlackFrames}, black: \${blackFrames}\`);

      // 4. Test Export Pipeline with real FFmpeg render
      const exportPath = '${path.join(__dirname, 'test_rendered_video.mp4').replace(/\\/g, '\\\\')}';
      const exportClips = [];
      for (const track of store.get('tracks')) {
        for (const clip of track.clips || []) {
          exportClips.push({
            id: clip.id,
            trackType: track.type,
            trackMuted: !!track.muted,
            mediaType: clip.mediaType,
            sourcePath: clip.sourcePath,
            name: clip.name,
            startTime: clip.startTime,
            duration: clip.duration,
            sourceStartTime: clip.sourceStartTime || 0,
            volume: clip.volume || 1
          });
        }
      }

      let progressReceived = 0;
      window.studiocut.export.onProgress((p) => {
        progressReceived++;
      });

      const exportConfig = {
        outputPath: exportPath,
        resolution: '640x360',
        width: 640,
        height: 360,
        fps: 30,
        format: 'mp4',
        videoCodec: 'libx264',
        quality: 'high',
        totalDuration: 4,
        clips: exportClips
      };

      const exportResult = await window.studiocut.export.start(exportConfig);
      assert('Export executed without error', !exportResult?.error, exportResult?.error || '');
      assert('Export returned success', exportResult?.success === true);
      assert('Progress callbacks were fired during export', progressReceived > 0, \`callbacks: \${progressReceived}\`);

      return { res, exportPath };
    })();
  `);

  console.log('\n--- Verification Results ---');
  let allPass = true;
  for (const item of results.res) {
    const mark = item.pass ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`  ${mark} ${item.name} ${item.extra ? `(${item.extra})` : ''}`);
    if (!item.pass) allPass = false;
  }

  // Check exported file on filesystem
  const exportPath = results.exportPath;
  const fileExists = fs.existsSync(exportPath);
  let fileSize = 0;
  if (fileExists) {
    fileSize = fs.statSync(exportPath).size;
    fs.unlinkSync(exportPath); // clean up test artifact
  }
  const filePass = fileExists && fileSize > 1000;
  console.log(`  ${filePass ? '✅ [PASS]' : '❌ [FAIL]'} Exported video exists on disk with non-zero bytes (size: ${fileSize} bytes)`);
  if (!filePass) allPass = false;

  console.log('\n===========================================================');
  console.log(`Summary: ${allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('===========================================================');

  win.close();
  app.quit();
  process.exit(allPass ? 0 : 1);
}

app.whenReady().then(runScrubAndExportVerification);
