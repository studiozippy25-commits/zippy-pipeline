const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');

function sourceBetween(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing source range: ${start}`);
  return html.slice(from, to);
}

const loveSource = sourceBetween(
  'function isLoveFilmStoryboardProject()',
  'function storyboardCoverageEnabled()'
);
const loveContext = {
  currentProjectKey: 'love-film',
  currentProject: {name: '오늘은 왠지 LOVE (20부작 리뉴얼)'}
};
vm.createContext(loveContext);
vm.runInContext(loveSource, loveContext);

const s03 = {
  id: 'LOVE-EP01-S03',
  frame: 'INS / low angle / LOCKED',
  desc: 'Insert shot, a white milk carton suspended mid-air, film camera shutter pressing, freeze-frame feeling',
  sourceScript: '우유팩이 공중에 붕. 루리의 셔터가 올라간다. 찰칵.',
  char: ['이루리']
};
const s03Phases = loveContext.buildLoveDenseSequencePhases(s03);
assert.equal(s03Phases.length, 3);
assert.match(s03Phases[0], /TACTILE SETUP INSERT/);
assert.match(s03Phases[0], /never show a whole person/);
assert.doesNotMatch(s03Phases[0], /wider low-angle setup/);

const twoPerson = loveContext.buildLoveShotTypeLock({
  frame: 'MCU / eye-level / LOCKED',
  desc: '이루리가 답하고 한소담이 옆에서 눈을 굴리는 대화 리액션',
  char: ['이루리', '한소담']
});
assert.match(twoPerson, /TWO-PERSON DIALOGUE/);
assert.match(twoPerson, /이루리 \+ 한소담/);
assert.match(twoPerson, /never average or merge/);

const faceCloseUp = loveContext.buildLoveShotTypeLock({
  frame: 'CU / profile / LOCKED',
  desc: '이루리의 측면 얼굴과 조용한 미소 리액션',
  char: ['이루리']
});
assert.match(faceCloseUp, /SINGLE-PERSON FACE CLOSE-UP/);
assert.match(faceCloseUp, /approved face reference outranks beauty/);

const transitionWide = loveContext.buildLoveShotTypeLock({
  frame: 'WS / eye-level / LOCKED',
  desc: '학교 앞 횡단보도 줄이 무대 조명처럼 켜지며 현실이 뮤지컬 상상으로 전환된다',
  char: []
});
assert.match(transitionWide, /LOCATION WIDE/);
assert.match(transitionWide, /REALITY → MUSICAL IMAGINATION/);
assert.match(transitionWide, /Never jump immediately/);

const cameraSource = sourceBetween(
  'function recommendCameraMoveForShot(shot)',
  'function buildSBVideoPromptBase(shot)'
);
const cameraContext = {};
vm.createContext(cameraContext);
vm.runInContext(cameraSource, cameraContext);
assert.equal(cameraContext.recommendCameraMoveForShot({
  frame: 'CU / eye-level / LOCKED',
  desc: '빠르게 달리던 소녀가 친구에게 답한다',
  func: '대화 리액션'
}), 'locked-static', 'declared LOCKED camera must override action keyword heuristics');

assert.match(html, /SEQUENCE FRAME ACTION REPLACEMENT — HIGHEST PRIORITY/);
assert.match(html, /original shot ACTION and FUNCTION above are source context only and are CANCELLED/);
assert.match(html, /Object\.assign\(\{\}, shot, \{char:loveS03ObjectOnlyPhase/);
assert.match(html, /composeImagePrompt\(directorShot, _finalPrompt\)/);
assert.match(html, /LOVE TEMPORAL COVERAGE — OBJECT-ONLY FRAME/);
assert.match(html, /imgInputs = imgInputs\.filter\(function\(input\)\{ return input && input\._type === 'background'; \}\)/);
assert.match(html, /char:loveS03ObjectOnlyPhase \? \[\] : shot\.char/);

console.log('PASS LOVE shot-type guards, S03 tactile continuity, and LOCKED camera priority');
