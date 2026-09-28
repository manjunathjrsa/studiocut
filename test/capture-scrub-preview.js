/**
 * StudioCut — Capture screenshot of verified timeline scrub & preview
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

async function captureScreen() {
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
  await new Promise(r => setTimeout(r, 2000));

  await win.webContents.executeJavaScript(`
    (async function() {
      document.getElementById('splashScreen')?.remove();

      await window.app.addSampleMedia();
      const mediaList = store.get('media') || [];
      const landscape = mediaList.find(m => m.name.includes('Landscape'));
      const synthAudio = mediaList.find(m => m.type === 'audio');

      const tracks = store.get('tracks') || [];
      const vTrack = tracks.find(t => t.type === 'video');
      const aTrack = tracks.find(t => t.type === 'audio');

      if (landscape) {
        Actions.addClip(vTrack.id, {
          mediaId: landscape.id,
          sourcePath: landscape.path,
          name: landscape.name,
          mediaType: landscape.type,
          startTime: 0,
          duration: 4,
          sourceStartTime: 0
        });
      }

      if (synthAudio) {
        Actions.addClip(aTrack.id, {
          mediaId: synthAudio.id,
          sourcePath: synthAudio.path,
          name: synthAudio.name,
          mediaType: 'audio',
          startTime: 0,
          duration: 6,
          sourceStartTime: 0
        });
      }

      Actions.seek(1.5);
      window.previewEngine?.updatePreview();
    })();
  `);

  await new Promise(r => setTimeout(r, 1500));

  const image = await win.webContents.capturePage();
  const artifactDir = 'C:\\Users\\Home\\.gemini\\antigravity-ide\\brain\\d037d638-d3b4-4c95-9252-8eb434781662';
  const outPath = path.join(artifactDir, 'studiocut_scrub_export_verified.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('Saved screenshot to:', outPath);

  win.close();
  app.quit();
}

app.whenReady().then(captureScreen);
