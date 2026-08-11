const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('director-v3.js', 'utf8');
const store = new Map();
const appendedNodes = [];
const shot = {
  id: 'LOVE-T01', scene: 1, loc: '한빛고 복도', char: ['이루리', '정이든'], obj: ['필름 카메라'],
  frame: 'MS, 50mm, locked', desc: '이루리가 카메라 셔터에 손을 얹고 말을 멈춘다.',
  func: '고백하려다 상대의 반응을 먼저 살핀다', light: 'frame-right window daylight'
};
const context = {
  console,
  currentProjectKey: 'love-film',
  currentProject: {name: '오늘은 왠지 LOVE', defaultRatio: '16:9', quality: 'legacy quality', negative: 'legacy negative'},
  SB_SHOTS: [shot],
  sbGenImages: {},
  sbSeqImages: {},
  assetLib: {char: [], 'space-a': [], obj: []},
  localStorage: {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value))
  },
  navigator: {clipboard: {writeText() { return Promise.resolve(); }}},
  document: {
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {},
    createElement() { return {id:'', className: '', innerHTML:'', textContent: '', addEventListener() {}, remove() {}}; },
    body: {appendChild(node) { appendedNodes.push(node); }}
  },
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

store.set('zippy_director_v3_love-film', JSON.stringify({version: 3, canon: '', setup: {}, assets: {}, logs: []}));
vm.runInContext(source, context);
const api = context.ZippyDirectorV3;
assert.equal(api.__engineVersion, '3.1.0');
assert.equal(api.state().version, 5);
assert.match(api.state().canon, /LOVE STORY & PERFORMANCE CANON/);
assert.equal(JSON.parse(store.get('zippy_director_v3_love-film')).version, 5);
assert.deepEqual(Object.keys(api.state().faceAudits), []);
assert.deepEqual(Object.keys(api.state().regenerationPrompts), []);

const lovePrompt = api.buildPrompt(shot);
assert.equal((lovePrompt.match(/^\d{2} · /gm) || []).length, 15, 'image prompt must keep exactly 15 blocks');
assert.match(lovePrompt, /LOVE LIVE-ACTION NATURALISM/);
assert.match(lovePrompt, /Objective:/);
assert.match(lovePrompt, /Beat change:/);
assert.doesNotMatch(lovePrompt, /Photoreal\. NON-IP\. .*NO CGI/);

const once = api.composeImagePrompt(shot, 'LEGACY SHOT PROMPT');
const twice = api.composeImagePrompt(shot, once);
assert.equal((twice.match(/ZIPPY_DIRECTOR_V3_BEGIN/g) || []).length, 1, 'director layer must be idempotent');
assert.equal((twice.match(/LEGACY SHOT PROMPT/g) || []).length, 1, 'legacy prompt must survive once');
assert.equal((twice.match(/PROJECT CANON COMPATIBILITY/g) || []).length, 1, 'compatibility footer must not duplicate');

const loveState = api.state();
loveState.shotLights[shot.id] = {
  light: 'frame-right classroom window', lightAzimuth: '45° camera right', lightHeight: 'above eyeline',
  lightTemp: '5600K daylight-balanced', lightIntensity: '90% key', lightDiffusion: 'very soft broad source',
  fillRatio: 'passive bounce at 15% · about 6:1', backgroundExposure: 'separated below subject', atmosphere: 'clean air'
};
store.set('zippy_director_v3_love-film', JSON.stringify(loveState));
const litPrompt = api.buildPrompt(shot);
assert.match(litPrompt, /PRIMARY MOTIVATED SOURCE: frame-right classroom window/);
assert.match(litPrompt, /45° camera right/);
assert.match(litPrompt, /passive bounce at 15%/);
assert.match(api.buildSeedancePrompt(shot), /LIGHT PLOT:/);
assert.match(api.cardControls(shot), /LIGHT LOCK/);
assert.equal(typeof api.openLightPlot, 'function');
assert.equal(typeof api.resetLightPlot, 'function');
assert.equal(typeof api.runFaceAudit, 'function');
assert.equal(typeof api.regenerateFromAudit, 'function');
assert.match(source, /setTimeout\(function\(\)\{delete faceAuditBusy\[id\];performFaceAudit\(id\);\},100\)/, 'face audit must leave the click event before vision work');
assert.match(api.buildRegenerationPromptById(shot.id), /FACE IDENTITY IS THE PRIMARY ACCEPTANCE TARGET/);

shot.desc = '이루리가 정이든을 바라보고 숨을 멈춘다. 두 사람의 얼굴과 눈빛이 선명하게 보인다.';
context.sbGenImages[shot.id] = 'x'.repeat(512);
const pendingFaceReport = api.analyze(shot);
assert.equal(pendingFaceReport.faceStatus, 'pending');
assert.ok(pendingFaceReport.strictScore <= 60, 'generated faces without identity audit must cap the strict score');
const auditedState = api.state();
auditedState.faceAudits[shot.id] = {
  signature: '512:' + 'x'.repeat(24) + ':' + 'x'.repeat(24),
  score: 95,
  status: 'pass',
  characters: [{label:'이루리', score:95, status:'pass', mismatches:[]}]
};
store.set('zippy_director_v3_love-film', JSON.stringify(auditedState));
const auditedFaceReport = api.analyze(shot);
assert.equal(auditedFaceReport.faceScore, 95);
assert.equal(auditedFaceReport.faceStatus, 'pass');
auditedState.faceAudits[shot.id].score = 89;
auditedState.faceAudits[shot.id].status = 'hold';
store.set('zippy_director_v3_love-film', JSON.stringify(auditedState));
assert.ok(api.analyze(shot).strictScore <= 89, 'face identity must cap the total strict score');
auditedState.faceAudits[shot.id].score = 95;
auditedState.faceAudits[shot.id].status = 'pass';
store.set('zippy_director_v3_love-film', JSON.stringify(auditedState));
context.getSBRefsForShot = () => [{_type:'face', _label:'이루리 승인 얼굴', b64:'r'.repeat(512), mime:'image/png'}];
api.openShot(shot.id);
const modalMarkup = appendedNodes[appendedNodes.length - 1].innerHTML;
assert.match(modalMarkup, /FACE IDENTITY · 최우선 평가/);
assert.match(modalMarkup, /AI 감독 재생성 프롬프트/);
assert.match(modalMarkup, /AI 감독 프롬프트로 바로 재생성/);

context.currentProjectKey = 'cloudrider';
context.currentProject = {name: 'CLOUDRIDER', defaultRatio: '16:9', quality: 'legacy animation quality', negative: 'legacy animation negative'};
const cloudPrompt = api.buildPrompt({...shot, id: 'CR-T01', char: ['하나'], desc: '하나가 하온의 패널을 조인다.'});
assert.match(cloudPrompt, /CLOUDRIDER 2\.5D TEXTURE CONSTITUTION/);
assert.match(cloudPrompt, /Premium cinematic 2\.5D animation/);
assert.match(cloudPrompt, /No live-action, photoreal human skin, glossy PBR, or plastic 3D/);
assert.doesNotMatch(cloudPrompt, /Photoreal\. NON-IP/);
assert.doesNotMatch(cloudPrompt, /SFX only\. NO CGI/);

const originalApi = context.ZippyDirectorV3;
vm.runInContext(source, context);
assert.strictEqual(context.ZippyDirectorV3, originalApi, 'same Director engine must not install twice');

console.log('PASS director-v3 migration, idempotence, LOVE and CloudRider constitutions');
