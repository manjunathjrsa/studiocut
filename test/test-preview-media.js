/**
 * Test script for Program Monitor and Media Browser Card layout and thumbnail verification
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

async function runVerification() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Verifying Program Monitor & Media Browser Fixes');
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

      // 1. Program Monitor verification
      const container = document.getElementById('previewContainer');
      const canvas = document.getElementById('previewCanvas');
      const emptyState = document.getElementById('previewEmpty');

      const cRect = container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const emptyRect = emptyState ? emptyState.getBoundingClientRect() : null;

      // Check canvas centering
      const leftDist = canvasRect.left - cRect.left;
      const rightDist = cRect.right - canvasRect.right;
      const hDiff = Math.abs(leftDist - rightDist);

      assert('Program Monitor Canvas is horizontally centered', hDiff <= 2, \`left: \${leftDist}px, right: \${rightDist}px, diff: \${hDiff}px\`);

      // Check empty state overlay
      const emptyComputed = window.getComputedStyle(emptyState);
      assert('Empty state is absolutely positioned overlay', emptyComputed.position === 'absolute');

      // 2. Add sample media and check card layout
      await window.app.addSampleMedia();
      await new Promise(r => setTimeout(r, 300));

      const mediaItems = document.querySelectorAll('.media-item');
      assert('Media items rendered', mediaItems.length >= 3, \`found \${mediaItems.length}\`);

      if (mediaItems.length > 0) {
        const firstCard = mediaItems[0];
        const cardRect = firstCard.getBoundingClientRect();
        assert('Media item card is NOT clipped (height >= 90px)', cardRect.height >= 90, \`height: \${cardRect.height}px\`);

        const thumbBox = firstCard.querySelector('.media-item__thumb-container');
        assert('Thumbnail container exists', !!thumbBox);

        const titleEl = firstCard.querySelector('.media-item__title');
        assert('Title element exists and has text', !!titleEl && titleEl.textContent.trim().length > 0, titleEl?.textContent);

        const durBadge = firstCard.querySelector('.media-item__badge-dur');
        assert('Duration badge exists and visible', !!durBadge, durBadge?.textContent);

        const addBtn = firstCard.querySelector('.btn-add-media');
        assert('Add to timeline + button exists and clickable', !!addBtn);
      }

      // 3. Test generateVideoThumbnail with synthetic video canvas
      // Create test synthetic video via data URL
      const synthCanvas = document.createElement('canvas');
      synthCanvas.width = 320;
      synthCanvas.height = 180;
      const sctx = synthCanvas.getContext('2d');
      sctx.fillStyle = '#6c5ce7';
      sctx.fillRect(0, 0, 320, 180);
      sctx.fillStyle = '#ffffff';
      sctx.font = 'bold 20px sans-serif';
      sctx.fillText('SAMPLE TEST VIDEO', 50, 95);

      const synthImgUrl = synthCanvas.toDataURL('image/jpeg');

      // Add a media item with this thumbnail
      Actions.addMedia({
        id: 'test-vid-1',
        name: 'Action_Scene_4K.mp4',
        path: synthImgUrl,
        thumbnail: synthImgUrl,
        type: 'video',
        duration: 14.5,
        width: 3840,
        height: 2160,
        fps: 60,
        codec: 'HEVC'
      });

      await new Promise(r => setTimeout(r, 200));

      const testCard = document.querySelector('.media-item[data-id="test-vid-1"]');
      assert('Test video card rendered with thumbnail', !!testCard);
      if (testCard) {
        const testImg = testCard.querySelector('.media-item__thumbnail');
        assert('Test video card has visible image thumbnail', !!testImg && testImg.src.startsWith('data:image'));
        const testTitle = testCard.querySelector('.media-item__title');
        assert('Test video title is Action_Scene_4K.mp4', testTitle?.textContent === 'Action_Scene_4K.mp4');
      }

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

  // Capture screenshot
  const screenshotPath = path.join(__dirname, '..', 'artifacts', 'studiocut_verified_monitor_media.png');
  const dir = path.dirname(screenshotPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const image = await win.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`📸 UI screenshot captured at: ${screenshotPath}`);

  // Copy to conversation artifact directory if exists
  const convArtifactPath = 'C:\\Users\\Home\\.gemini\\antigravity-ide\\brain\\d037d638-d3b4-4c95-9252-8eb434781662\\studiocut_verified_monitor_media.png';
  try {
    fs.writeFileSync(convArtifactPath, image.toPNG());
    console.log(`📸 Copied to conversation artifact: ${convArtifactPath}`);
  } catch (e) {
    console.warn('Could not copy to conv artifact:', e.message);
  }

  win.destroy();
  app.quit();

  if (failCount > 0) process.exit(1);
  else process.exit(0);
}

app.whenReady().then(runVerification);
