const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'director-v3.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sheetSource = fs.readFileSync(path.join(root, 'sheet-maker.js'), 'utf8');
const seedanceSource = fs.readFileSync(path.join(root, 'seedance-planner.js'), 'utf8');

const storage = new Map();
const elements = new Map([
  ['directorV3Mount', { innerHTML: '', scrollIntoView() {} }],
  ['directorV3AssetMount', { innerHTML: '' }],
]);
const bodyChildren = [];
const document = {
  addEventListener() {},
  getElementById(id) { return elements.get(id) || null; },
  querySelector() { return null; },
  createElement() {
    return {
      id: '', className: '', innerHTML: '', textContent: '', parentNode: null,
      addEventListener() {},
      remove() { this.removed = true; },
    };
  },
  body: {
    appendChild(el) { el.parentNode = this; bodyChildren.push(el); },
  },
};

const shot = {
  id: 'LOVE-EP01-S11', ep: 1, scene: 11, loc: 'old rehearsal room',
  char: ['A'], obj: ['pen'], frame: '85mm macro orbit shot',
  desc: 'the jaw sets and releases; breath exits once through the nose as A reads a Korean message and grips the pen',
  func: 'realizes the second song was written for her',
  dialogue: '왜 두 번째 곡이야?',
};

const context = {
  console,
  currentProjectKey: 'love',
  currentProject: {
    name: 'LOVE', defaultRatio: '16:9', characterNames: ['A'],
    defaultCharRefs: { A: 'char.png' },
    defaultSpaceRefs: { room: 'room.png' },
    defaultObjRefs: { pen: 'pen.png' },
  },
  SB_SHOTS: [shot],
  assetLib: { char: [], obj: [] },
  getSelectedSBCameraMoveId() { return 'orbit-clockwise'; },
  getSBRefsForShot() { return [{ _type: 'character' }, { _type: 'costume' }, { _type: 'background' }, { _type: 'prop' }]; },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  },
  document,
  navigator: { clipboard: { writeText() {} } },
  setTimeout(fn) { fn(); return 1; },
  clearTimeout() {},
  setInterval() { return 1; },
  Date,
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'director-v3.js' });

const api = context.ZippyDirectorV3;
assert.ok(api, 'Director API should be exposed');

const preview = api.analyze(shot);
assert.equal(preview.ok, true, 'preview mode must preserve the legacy generation path');
assert.ok(preview.warnings.some((item) => item.includes('본편 모드에서 차단')));
assert.match(preview.route, /gemini-image/);
assert.match(preview.route, /AE 텍스트 합성/);

const sceneKey = 'EP1-S11|old rehearsal room';
const productionState = api.state();
productionState.mode = 'production';
storage.set('zippy_director_v3_love', JSON.stringify(productionState));
const blocked = api.analyze(shot);
assert.equal(blocked.ok, false, 'production mode must enforce setup, locks and GEO');
assert.ok(blocked.errors.some((item) => item.includes('세계관')));
assert.ok(blocked.errors.some((item) => item.includes('씬 GEO')));

productionState.setup.world = '기억이 음악과 공간의 물리적 흔적으로 남는 현실 세계';
productionState.setup.stylePrefix = [
  'Style: Naturalistic live action', 'Cinematography: restrained observational cinema',
  'Lighting: one motivated source', 'Color: 60:30:10 natural palette',
  'Camera: physical cine optics', 'Skin: pore-level realism',
  'Acting: behavior before emotion labels', 'Physics: gravity and inertia respected',
  'Composition: deliberate negative space', 'Continuity: identity and wardrobe locked',
  'Technical: stable hands and faces', 'Audio: environmental SFX only, no music',
].join('\n');
for (const key of Object.keys(productionState.assets)) {
  productionState.assets[key] = { locked: true, evidence: key === 'character' || key === 'location' ? 10 : 1 };
}
productionState.scenes[sceneKey] = {
  space: 'old rehearsal room', material: 'aged wood and painted plaster, 8m wide',
  anchor: 'upright piano', anchorPosition: 'frame-RIGHT', origin: 'center rug',
  distance: '3', entry: 'door at frame-LEFT', axis: 'door side',
  light: 'one soft window source from frame-RIGHT',
};
storage.set('zippy_director_v3_love', JSON.stringify(productionState));
const passed = api.analyze(shot);
assert.equal(passed.ok, true, 'completed registry should pass production gates');
assert.equal(passed.camera.risk, 'HIGH');
assert.match(passed.camera.alternative, /slider-right/);
assert.equal(passed.routePlan.image, 'gemini-image');
assert.equal(passed.routePlan.video, 'existing-video-provider');
assert.equal(passed.routePlan.post, 'AE 텍스트 합성');

const prompt = api.buildPromptById(shot.id);
for (const heading of [
  '01 · SCENE CONTEXT', '02 · ACTIVE REFERENCES', '03 · LOCATION MAP',
  '04 · FIRST FRAME AND SPATIAL BLOCKING', '05 · FORMAT MODE', '06 · OPTICS',
  '07 · CAMERA', '08 · ACTION TIMING', '09 · PHYSICS', '10 · LIGHTING',
  '11 · AUDIO', '12 · CHARACTER ACTING', '13 · STYLE', '14 · QUALITY',
  '15 · POSITIVE CONSTRAINTS',
]) assert.match(prompt, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(prompt, /EXACT 1 CHARACTERS — NO DUPLICATES/);
assert.match(prompt, /180° AXIS/);
assert.match(prompt, /the jaw sets and releases/);
assert.match(api.composeImagePrompt(shot, 'LEGACY'), /DIRECTOR V3 CONTROL LAYER/);
assert.equal(api.composeVideoPrompt(shot, 'LEGACY'), 'LEGACY', 'existing video providers must keep their own prompt path');
const seedancePrompt = api.buildSeedancePromptById(shot.id);
for (const heading of ['[Generation Goal]', '[Reference Roles]', '[Subject Profiles]', '[Scene]', '[Stage 1]', '[Camera]', '[Visual Treatment]', '[Audio]', '[Maintain Consistency]']) {
  assert.match(seedancePrompt, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(seedancePrompt, /@Image 1 is the first frame/);
assert.match(seedancePrompt, /Initial state:/);
assert.match(seedancePrompt, /Primary event:/);
assert.match(seedancePrompt, /End state:/);
assert.match(seedancePrompt, /Dialogue language: Korean/);
assert.match(seedancePrompt, /\{왜 두 번째 곡이야\?\}/);
assert.match(seedancePrompt, /Never render a reference sheet or duplicate a subject/);
assert.doesNotMatch(seedancePrompt, /DIRECTOR V3 CONTROL LAYER|01 · SCENE CONTEXT/);
assert.equal(api.beforeGenerate(shot, { provider: 'test-image' }).ok, true);
api.afterGenerate(shot, { ok: true, provider: 'test-image', model: 'mock-model', cost: 0.125 });
let logged = api.state().logs;
assert.ok(logged.some((item) => item.event === 'attempt' && item.provider === 'test-image'));
assert.ok(logged.some((item) => item.event === 'success' && item.cost === '$0.1250'));

productionState.logs = Array.from({ length: 10 }, (_, i) => ({ event: 'attempt', shotId: shot.id, version: i + 1 }));
storage.set('zippy_director_v3_love', JSON.stringify(productionState));
assert.ok(api.analyze(shot).warnings.some((item) => item.includes('v10')));
productionState.logs = Array.from({ length: 15 }, (_, i) => ({ event: 'attempt', shotId: shot.id, version: i + 1 }));
storage.set('zippy_director_v3_love', JSON.stringify(productionState));
assert.ok(api.analyze(shot).errors.some((item) => item.includes('v15')));

api.render();
assert.match(elements.get('directorV3Mount').innerHTML, /AI 감독 준비/);
assert.match(elements.get('directorV3Mount').innerHTML, /자동으로 준비하기/);
assert.match(elements.get('directorV3Mount').innerHTML, /상세 설정 보기/);
assert.doesNotMatch(elements.get('directorV3Mount').innerHTML, /15-BLOCK PREVIEW/);
assert.match(elements.get('directorV3AssetMount').innerHTML, /에셋 최종 확인/);
assert.match(elements.get('directorV3AssetMount').innerHTML, /에셋 승인 확인/);
const quotedControl = api.cardControls({ ...shot, id: "SHOT-'A" });
assert.doesNotMatch(quotedControl, /openShot\('SHOT-'A'\)/);
assert.match(quotedControl, /SHOT-\\&#39;A/);

context.currentProjectKey = 'auto-project';
api.autoDirector();
const automated = api.state();
assert.equal(automated.setup.stylePrefix.split('\n').length, 12);
assert.ok(automated.setup.world);
assert.ok(automated.scenes[sceneKey]);
assert.ok(automated.scenes[sceneKey].axis);
assert.equal(automated.assets.character.locked, false, 'automatic preparation must not falsely approve assets');

context.currentProjectKey = 'other-project';
assert.equal(api.state().mode, 'preview', 'registry state must be isolated per project');

assert.match(html, /id="directorV3Mount"/);
assert.match(html, /id="directorV3AssetMount"/);
assert.match(html, /id="pSheet"/);
assert.match(html, /id="tabSheet"/);
assert.match(html, /id="pSeedance"/);
assert.match(html, /id="tabSeedance"/);
assert.match(html, /Seedance 프롬프트/);
assert.match(html, /캐릭터·배경 360° 시트 만들기/);
assert.match(html, /src="sheet-maker\.js"/);
assert.match(html, /href="sheet-maker\.css"/);
assert.match(html, /src="seedance-planner\.js"/);
assert.match(html, /href="seedance-planner\.css"/);
assert.match(sheetSource, /FOUR full-body views in one row/);
assert.match(sheetSource, /FRONT, 3\/4, SIDE PROFILE, BACK/);
assert.match(sheetSource, /one large face close-up inset/);
assert.match(sheetSource, /Never render a reference sheet or duplicate a subject/);
assert.match(sheetSource, /assetLib\[bucket\]\.push/);
assert.match(seedanceSource, /MAX_SECONDS=30/);
assert.match(seedanceSource, /MAX_IMAGE_REFS=30/);
assert.match(seedanceSource, /callGtiBridge/);
assert.match(seedanceSource, /zipStore/);
assert.match(seedanceSource, /CHARACTER__/);
assert.match(seedanceSource, /STORYBOARD__/);
assert.match(html, /href="director-v3\.css"/);
assert.match(html, /src="director-v3\.js"/);
assert.equal((html.match(/ZippyDirectorV3\.cardControls\(shot\)/g) || []).length, 2);
const cameraBlock = html.slice(html.indexOf('const CAMERA_MOVES = ['), html.indexOf('const CAMERA_MOVE_ALIASES'));
assert.equal((cameraBlock.match(/\{id:"/g) || []).length, 57, 'camera library should expose 57 movements');
for (const hook of ['beforeGenerate(shot', 'beforeBatch(remaining)', 'composeImagePrompt(directorShot, _finalPrompt)', 'composeVideoPrompt(shot, prompt)', 'afterGenerate(shot']) {
  assert.match(html, new RegExp(hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(source, /물리 헌법 7항/);
assert.match(source, /9프레임 QC/);

console.log('director-v3 regression tests: ok');
