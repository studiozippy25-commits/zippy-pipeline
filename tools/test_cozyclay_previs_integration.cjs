const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('// ═══ COZYCLAY 3D PREVIS');
const end = html.indexOf('// ═══ NAV', start);
assert.ok(start >= 0 && end > start, 'CozyClay Previs runtime block must exist');
assert.match(html, /id="tabPrevis"/);
assert.match(html, /id="pPrevis"/);
assert.match(html, /studiozippy-cozyclay-transfer\/v1/);
assert.match(html, /COZYCLAY .*SCENE GEO/i);
assert.match(html, /LOVE_EP01_V5_PREVIS_TRANSFER\.json/);

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { id, value: '', textContent: '', innerHTML: '', style: {}, click() {} });
  return elements.get(id);
}

const storage = new Map();
const storyboardShots = [
  { id: 'LOVE-EP01-S01', frame: 'WS / eye-level / LOCKED' },
  { id: 'LOVE-EP01-S02', frame: 'CU / eye-level / LOCKED' },
  { id: 'LOVE-EP02-S01', frame: 'MS / eye-level / LOCKED' },
];

const context = vm.createContext({
  console,
  URL,
  Blob,
  AbortSignal,
  setTimeout,
  clearTimeout,
  document: {
    getElementById: element,
    createElement() { return { click() {}, style: {} }; },
  },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  },
  SB_SHOTS: storyboardShots,
  currentProjectKey: 'love-film',
  alert(message) { throw new Error(`unexpected alert: ${message}`); },
  directorEnsureShot15(shot) { shot.__directorRebuilt = true; },
  directorRecordLog() {},
});

vm.runInContext(html.slice(start, end), context, { filename: 'previs-runtime.js' });

const transfer = {
  schema: 'studiozippy-cozyclay-transfer/v1',
  sourceApp: 'cozyclay',
  projectVersion: 2,
  name: '오늘은 왠지 LOVE EP01 — test',
  assetCount: 3,
  scenes: [{
    id: 'scene-1',
    name: 'SC01 test',
    objects: [],
    stage: {
      sensorId: 'fullFrame',
      shotAspect: '16:9',
      environment: '한빛고 교문',
      characters: [{
        id: 'ruri', subject: '이루리', x: -1, y: 0, z: 1, rot: 180, scale: 1,
        layer: { waypoints: [{ frame: 0, x: -1, z: 1 }, { frame: 119, x: -1, z: -2 }], promptClips: [] },
      }],
    },
    shotDocument: {
      frameCount: 240,
      shots: [{
        id: 'cozy-shot-1', name: '교문 트래킹', startFrame: 0, endFrame: 119,
        cameraKeys: [
          { frame: 0, framing: { pos: { x: 0, y: 1.6, z: 5 }, yaw: 0, pitch: 0, fovDeg: 22.9 } },
          { frame: 119, framing: { pos: { x: 0, y: 1.6, z: 3 }, yaw: 0, pitch: 0, fovDeg: 22.9 } },
        ],
      }],
    },
  }],
};

(async () => {
  await vm.runInContext(`previsLoadProjectText(${JSON.stringify(JSON.stringify(transfer))}, 'LOVE_EP01_PREVIS_TRANSFER.json')`, context);
  assert.equal(element('previsSceneCount').textContent, 1);
  assert.equal(element('previsShotCount').textContent, 1);
  assert.equal(element('previsAssetCount').textContent, 3);
  assert.match(element('previsTargetShot').innerHTML, /LOVE-EP01-S01/);
  assert.doesNotMatch(element('previsTargetShot').innerHTML, /LOVE-EP02-S01/);

  const summary = vm.runInContext('previsShotSummary(previsScene(), previsShot())', context);
  assert.equal(summary.sceneName, 'SC01 test');
  assert.equal(summary.cameraMove, 'tracking-forward');
  assert.equal(summary.startCamera.lensMm, 50);
  assert.match(summary.screenDirection, /deeper into scene/);

  element('previsTargetShot').value = 'LOVE-EP01-S01';
  vm.runInContext('previsLinkToStoryboard()', context);
  assert.equal(storyboardShots[0].__directorRebuilt, true);
  assert.equal(storyboardShots[0].previs.shotId, 'cozy-shot-1');
  assert.match(storyboardShots[0].previs.sceneGeo, /ruri/);
  assert.match(storage.get('zippy_previs_links_v1_love-film'), /cozy-shot-1/);

  console.log('CozyClay Previs integration tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
