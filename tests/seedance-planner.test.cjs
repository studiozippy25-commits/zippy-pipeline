const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'seedance-planner.js'), 'utf8');
const storage = new Map();
const elements = new Map([
  ['seedancePlannerApp', { innerHTML: '' }],
]);
const shots = [
  { id: 'S01-A', scene: 1, frame: 'wide locked', desc: 'A enters the room', func: 'A notices the letter', char: ['A'], obj: ['letter'], duration: 12, pri: 'must' },
  { id: 'S01-B', scene: 1, frame: 'medium push-in', desc: 'A reads the letter', func: 'the hands stop and breath settles', char: ['A'], obj: ['letter'], duration: 10, pri: 'must' },
  { id: 'S02-A', scene: 2, frame: 'close locked', desc: 'A looks toward the door', func: 'A makes a decision', char: ['A'], obj: [], duration: 10, pri: 'must' },
];

const context = {
  console,
  TextEncoder,
  Uint8Array,
  Blob,
  URL,
  atob,
  setTimeout(fn) { fn(); return 1; },
  location: { href: 'https://example.test/pipeline/' },
  currentProjectKey: 'test-film',
  currentProject: {
    name: 'TEST FILM', defaultRatio: '16:9',
    defaultFaceRefs: { A: 'assets/a-face.png' },
    defaultCharRefs: { A: 'assets/a-sheet.png' },
    defaultCostumeAssetRefs: { A: { full: 'assets/a-costume.png' } },
  },
  SB_SHOTS: shots,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  },
  navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
  document: {
    addEventListener() {},
    getElementById(id) { return elements.get(id) || null; },
    createElement() { return { click() {}, remove() {}, style: {}, appendChild() {} }; },
    body: { appendChild() {} },
  },
  getSBRefsForShot(scene, shotId) {
    return [
      { inline_data: { mime_type: 'image/png', data: 'YQ==' }, _type: 'face', _label: 'A face' },
      { inline_data: { mime_type: 'image/png', data: 'Yg==' }, _type: 'costume', _label: 'A costume' },
      { inline_data: { mime_type: 'image/png', data: 'Yw==' }, _type: 'background', _label: `Scene ${scene} room` },
    ];
  },
  resolveShotLoc(shot) { return `Location ${shot.scene}`; },
  ZippyDirectorV3: {
    cameraAdvice(shot) { return { id: shot.frame.includes('push') ? 'dolly-in' : 'locked-static' }; },
    buildPrompt(shot) { return `IMAGE PROMPT ${shot.id}`; },
  },
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'seedance-planner.js' });

const api = context.ZippySeedancePlanner;
assert.ok(api, 'Seedance planner API should be exposed');
api.init();
api.autoFill();
assert.equal(api.state().totalSeconds, 22, 'auto-fill must stop before exceeding 30 seconds');
assert.deepEqual(Array.from(api.state().items, (item) => item.id), ['S01-A', 'S01-B']);

let prompt = api.buildPrompt();
assert.match(prompt, /exactly 22\.0 seconds/);
assert.match(prompt, /Stage 1 · 0\.0–12\.0s/);
assert.match(prompt, /Stage 2 · 12\.0–22\.0s/);
assert.match(prompt, /@Image 1/);
assert.match(prompt, /observable breath, gaze, hands, posture, and timing/);
assert.match(prompt, /Continuity Across Scenes/);

api.setDuration('S01-A', 15);
api.setDuration('S01-B', 15);
assert.equal(api.state().totalSeconds, 30);
api.addShot('S02-A');
assert.equal(api.state().items.length, 2, 'adding a scene beyond 30 seconds must be rejected');

const refs = api.collectReferences();
assert.ok(refs.some((ref) => ref.type === 'face' && ref.label === 'A face'));
assert.ok(refs.some((ref) => ref.type === 'character' && /캐릭터/.test(ref.label)));
assert.ok(refs.every((ref, index) => index < 30 ? ref.uploadIndex === index + 1 : ref.uploadIndex === null));
assert.match(elements.get('seedancePlannerApp').innerHTML, /레퍼런스 ZIP 한 번에 다운로드/);
assert.match(elements.get('seedancePlannerApp').innerHTML, /부족한 첫 프레임 모두 GTI 생성/);
assert.match(elements.get('seedancePlannerApp').innerHTML, /CHARACTER__A__FACE\.png/);
assert.match(elements.get('seedancePlannerApp').innerHTML, /CHARACTER__A__SHEET\.png/);
assert.match(elements.get('seedancePlannerApp').innerHTML, /COSTUME__A\.png/);

console.log('seedance-planner regression tests: ok');
