import fs from 'node:fs';
import path from 'node:path';

const inputPath = path.resolve(process.argv[2]);
const outputPath = path.resolve(process.argv[3] || process.argv[2]);
let html = fs.readFileSync(inputPath, 'utf8');

function locateProject(source, key) {
  const markerAt = source.indexOf(`  "${key}": `);
  if (markerAt < 0) throw new Error(`Missing project: ${key}`);
  const start = source.indexOf('{', markerAt);
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return { start, end: i + 1, value: JSON.parse(source.slice(start, i + 1)) };
  }
  throw new Error(`Unterminated project: ${key}`);
}

function replaceExact(needle, replacement, expected, label) {
  const count = html.split(needle).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected}, found ${count}`);
  html = html.split(needle).join(replacement);
}

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const clone = value => JSON.parse(JSON.stringify(value));
function ensureObjects(shot, keys) {
  shot.obj = Array.from(new Set([...(Array.isArray(shot.obj) ? shot.obj : []), ...keys]));
}

function make15(shot, project) {
  const chars = Array.isArray(shot.char) ? shot.char.join(', ') : '';
  const objects = Array.isArray(shot.obj) ? shot.obj.join(', ') : '';
  const emotion = shot.emotionBeat || {};
  const direction = shot.screenMotion || {};
  const locked = /LOCKED|고정/i.test([shot.frame, shot.camera, shot.moving].join(' '));
  const move = locked ? 'locked-static' : (shot.director15?.recommendedCameraMove || (/CU|ECU|감정|표정|눈|시선/i.test(shot.frame + ' ' + shot.desc) ? 'dolly-in' : 'tracking-shot'));
  const risk = locked || move === 'locked-static' ? 'low' : (/(?:whip|orbit|chase|first-person|360|dolly-zoom)/i.test(move) ? 'high' : 'medium');
  const safer = risk === 'low' ? move : (/CU|ECU/i.test(shot.frame) ? 'dolly-in' : 'locked-static');
  const blocks = [
    ['01 FORMAT / WORLD', `${project.name} · ${project.defaultRatio || '16:9'} · cinematic narrative`],
    ['02 STORY FUNCTION', clean(shot.func || shot.sceneName || 'story progression')],
    ['03 SUBJECT / IDENTITY', chars || 'no named visible character; environment, anonymous extra, or prop is the subject'],
    ['04 WARDROBE / STATE', clean(shot.costume || shot.costumeMode || 'approved project wardrobe and current continuity state')],
    ['05 SCENE GEO', clean(`${shot.loc || ''}; anchor/distance/180-axis/eyeline remain continuous`)],
    ['06 TIME / LIGHT', clean(`${shot.time || ''}; ${shot.light || 'approved scene lighting continuity'}`)],
    ['07 COMPOSITION', clean(shot.frame || 'storyboard-defined frame')],
    ['08 CAMERA / LENS', clean(`${shot.camera || shot.lens || 'project camera DNA'}; recommended move ${move}`)],
    ['09 BLOCKING / SCREEN DIRECTION', clean(direction.travel ? `${direction.travel}; enter ${direction.entryEdge || 'continuity edge'} / exit ${direction.exitEdge || 'continuity edge'}` : 'preserve blocking, 180-axis and match-on-action direction')],
    ['10 EMOTIONAL PERFORMANCE', emotion.focalCharacter ? `${emotion.focalCharacter}: ${emotion.entryState} -> ${emotion.trigger}; private ${emotion.privateIntent}; mask ${emotion.publicMask}; micro ${emotion.microActing}; exit ${emotion.exitState}, intensity ${emotion.intensity}/5` : 'one readable motivated micro-behavior; anonymous frozen faces hold one interrupted intention; no generic emoting'],
    ['11 ACTION / TIMING', clean(`${shot.desc || ''}; ${shot.durationSec || ''}s; one atomic beat only`)],
    ['12 CONTINUITY HANDOFF', clean(`${shot.continuityFromShotId || emotion.continuityFromShotId || 'current canon'} -> ${shot.id}; inherit validated state, never generation drift`)],
    ['13 PROPS / PHYSICS / TEXT', clean(`${objects || 'no key prop'}; exact prop geometry, causal action, gravity, contact and physical text surfaces must remain correct`)],
    ['14 QUALITY / NEGATIVE', clean(`${shot.negativePrompt || project.negative || ''}; no identity drift, prop redesign, wardrobe drift, space drift, axis flip, action reversal, collage or invented text`)],
    ['15 OUTPUT / ROUTE / QC', `storyboard still -> video; ${risk} camera risk; safer alternative ${safer}; face/costume/space/prop/action gate each 10/10; 9-frame QC >=90; v10 warning / v15 redesign`]
  ];
  return { schema: 'studioZIPPY-director-15/v4', serializedAt: '2026-08-12', recommendedCameraMove: move, cameraRisk: risk, saferCameraAlternative: safer, blocks: blocks.map(([name, value], i) => ({ index: i + 1, name, value })) };
}

const located = locateProject(html, 'love-film');
const love = located.value;
if (love.projectFamily !== 'love-film-260711') throw new Error('love-film lineage missing');

const originalShotCount = love.storyboardShots.length;
const byId = id => love.storyboardShots.find(shot => shot.id === id);
const s04 = byId('LOVE-EP01-S04');
if (!s04) throw new Error('LOVE-EP01-S04 missing');
s04.char = [];
s04.costumeVariants = {};
delete s04.emotionBeat;
s04.startSec = 14;
s04.endSec = 14.8;
s04.durationSec = 0.8;
s04.frame = 'EWS / eye-level / LOCKED';
s04.desc = 'A large-scale high-school musical cold-open master of the same Seoul school street at the exact shutter freeze. A dense readable field of Korean students, a connected bicycle and rider, worn coat hems, the same airborne white milk carton and droplets are all physically frozen mid-action. The street geography, crowd layers and vanishing point dominate. No centered heroine and no isolated full-body hero pose; Iru-ri is not the subject and may be absent. Soft golden morning light, cinematic 16:9.';
s04.func = '14.0–14.8초 · 대규모 공간 와이드로 셔터가 도시 전체의 시간을 붙잡았음을 한 번에 선언한다. 다음 3개 얼굴 CU와 물리 ECU의 지리 기준.';
s04.negativePrompt = clean(`${s04.negativePrompt || ''}, centered Iru-ri, isolated heroine, empty street, detached floating coat, detached clothing, bottle instead of milk carton, moved crowd, full-body portrait`);
ensureObjects(s04, ['obj-bike']);
s04.openingRevision = '260812-freeze-face-montage-v1';

const openingInserts = [
  {
    id: 'LOVE-EP01-S04C', startSec: 14.8, endSec: 15.35, frame: 'CU / eye-level / LOCKED',
    desc: 'Close-up of an anonymous Korean high-school girl frozen mid-laugh inside the established street crowd. Her eyes still point toward her friend off screen; one cheek is lifted and the unfinished breath is visible in parted lips, but nothing moves. Her school clothing remains fully worn and physically connected to her body. Golden morning edge light, shallow background preserving the street geography, cinematic 16:9.',
    func: '14.8–15.35초 · 멈춘 세계를 첫 얼굴로 체감한다. 웃음이 끝나지 못한 감정의 중간값.',
    negativePrompt: 'named main actor, Iru-ri, detached clothing, full body, wide shot, moving lips, exaggerated grin, looking into filming lens'
  },
  {
    id: 'LOVE-EP01-S04D', startSec: 15.35, endSec: 15.9, frame: 'CU / slight low / LOCKED',
    desc: 'Close-up of the anonymous Korean schoolboy who released the milk carton, frozen at the end of his upward arm swing. Toast remains held by his mouth, his eyes are fixed upward toward the carton, and his face holds the tiny alarm of realizing he lost it. His hand and sleeve remain attached and anatomically coherent; no object lies on the ground. Cinematic Korean teen musical, 16:9.',
    func: '15.35–15.9초 · 우유팩을 놓친 원인의 얼굴 반응을 정지시켜 물리와 감정을 연결.',
    negativePrompt: 'named main actor, milk carton on pavement, falling carton, detached hand, extra finger, full body, wide shot, looking into filming lens'
  },
  {
    id: 'LOVE-EP01-S04E', startSec: 15.9, endSec: 16.45, frame: 'CU / profile / LOCKED',
    desc: 'Profile close-up of another anonymous Korean high-school girl frozen as a morning gust catches only the hem of the coat she is still wearing. Her brow has just begun to react and one loose hair is suspended, but her face and body do not move. The coat is fully connected at shoulders, sleeves and torso; never a detached floating garment. Same school street and golden light, cinematic 16:9.',
    func: '15.9–16.45초 · 바람과 표정이 멈춘 찰나. 분리된 옷이 아닌 착용 상태의 물리 정지.',
    negativePrompt: 'named main actor, detached coat, floating empty garment, full body, wide shot, face morph, looking into filming lens'
  },
  {
    id: 'LOVE-EP01-S04F', startSec: 16.45, endSec: 17, frame: 'ECU / low macro / LOCKED',
    desc: 'Extreme physical-detail montage insert at street level: the same bicycle chain and pedal stopped under load, one tied shoelace flexed above the pavement, and the same milk droplets suspended in a clear upward dotted trajectory. Every object is connected to its owner or source; no detached coat, no bottle substitution, no ground impact. Hard tactile detail under warm morning light, cinematic 16:9.',
    func: '16.45–17초 · 얼굴 몽타주를 물리 ECU로 닫아 정지 세계의 규칙을 확인하고 루리의 첫 움직임으로 컷.',
    negativePrompt: 'detached bicycle, broken chain, milk carton on ground, downward droplets, detached coat, bottle, full body portrait, moving object'
  }
].map(item => ({
  ep: 1, scene: 2, sceneName: s04.sceneName, pri: 'must', char: [], costumeVariant: 'uniform', costumeVariants: {}, loc: s04.loc, time: s04.time, mv: false,
  sourcePrompt: item.desc, sourceScript: item.func, sourceShotId: item.id.replace('LOVE-EP01-', ''), durationSec: Number((item.endSec - item.startSec).toFixed(2)),
  sourceRevision: '260812-freeze-face-montage-v1', editBeat: 'freeze-emotion-detail-montage', openingRevision: '260812-freeze-face-montage-v1', ...item
}));

const s04Index = love.storyboardShots.findIndex(shot => shot.id === s04.id);
love.storyboardShots.splice(s04Index + 1, 0, ...openingInserts);

function isNamedFaceClose(shot) {
  return Array.isArray(shot.char) && shot.char.length && /(?:^|\/)\s*(?:CU|ECU)\b/i.test(shot.frame || '') && !/rear|back|등\s*뒤/i.test(shot.frame || '');
}

function faceCandidateScore(shot) {
  if (!shot.emotionBeat?.focalCharacter || !Array.isArray(shot.char) || !shot.char.includes(shot.emotionBeat.focalCharacter)) return -Infinity;
  if (isNamedFaceClose(shot) || /INS|INSERT|EWS|macro|title|back|rear/i.test(shot.frame || '')) return -Infinity;
  if (shot.coverageAlternative || /-FC\d+$/.test(shot.id || '')) return -Infinity;
  const intensity = Number(shot.emotionBeat.intensity || 0);
  const phase = shot.emotionBeat.episodePhase || '';
  const phaseBoost = ({ hook: 1, approach: 2, pressure: 4, choice: 5, aftertaste: 3 })[phase] || 0;
  return intensity * 20 + phaseBoost + Number(shot.startSec || 0) / 200;
}

function makeFaceCoverage(parent, seq) {
  const focal = parent.emotionBeat.focalCharacter;
  const intensity = Number(parent.emotionBeat.intensity || 1);
  const frame = intensity >= 4 ? 'ECU / established eyeline / LOCKED' : 'CU / established eyeline / LOCKED';
  const start = Number(parent.endSec || 0) - Math.min(1.2, Number(parent.durationSec || 1.2));
  const id = `${parent.id}-FC${seq}`;
  const obj = Array.isArray(parent.obj) ? [...parent.obj] : [];
  const desc = `${frame.startsWith('ECU') ? 'Extreme close-up' : 'Close-up'} emotional coverage of ${focal} at the exact aftermath of ${parent.id}. Use the approved face sheet as the sole identity authority and preserve exact eyes, nose, lips, jaw, skull, hairline, age and natural asymmetry. Established eyeline stays toward the scene partner or story object, never into the filming lens. Play only these involuntary micro-signals: ${parent.emotionBeat.microActing}. Background remains softly recognizable as ${parent.loc}. No second face, no full body, no beautification or expression exaggeration.`;
  return {
    ep: parent.ep, scene: parent.scene, sceneName: parent.sceneName, id, frame, desc,
    func: `FACE COVERAGE · ${parent.id}의 감정 출구 ${parent.emotionBeat.exitState}를 얼굴에서 확인하고 다음 컷에 넘긴다.`,
    pri: 'must', char: [focal], costumeVariant: parent.costumeVariant || 'uniform', costumeVariants: parent.costumeVariants && parent.costumeVariants[focal] ? { [focal]: parent.costumeVariants[focal] } : {},
    loc: parent.loc, time: parent.time, mv: false, obj, sourcePrompt: desc, sourceScript: parent.sourceScript || parent.func,
    sourceShotId: `${parent.sourceShotId || parent.id}-FC${seq}`, startSec: Number(Math.max(Number(parent.startSec || 0), start).toFixed(2)), endSec: Number(parent.endSec || 0), durationSec: Number((Number(parent.endSec || 0) - Math.max(Number(parent.startSec || 0), start)).toFixed(2)),
    sourceRevision: '260812-emotional-face-coverage-v1', editBeat: 'emotional-face-coverage', coverageAlternative: true, coverageOfShotId: parent.id,
    negativePrompt: clean(`${parent.negativePrompt || ''}, alternate actor, face drift, beautification, full body, wide shot, second person, looking into filming lens, expression exaggeration`),
    emotionBeat: clone(parent.emotionBeat)
  };
}

let faceCoverageAdded = 0;
for (let ep = 1; ep <= 20; ep += 1) {
  const episodeShots = love.storyboardShots.filter(shot => Number(shot.ep) === ep);
  const existing = episodeShots.filter(isNamedFaceClose).length;
  const needed = Math.max(0, 5 - existing);
  if (!needed) continue;
  const candidates = episodeShots.map(shot => ({ shot, score: faceCandidateScore(shot) })).filter(item => Number.isFinite(item.score)).sort((a, b) => b.score - a.score);
  const picked = [];
  const usedPhase = new Set();
  for (const item of candidates) {
    if (picked.length >= needed) break;
    const phase = item.shot.emotionBeat.episodePhase || '';
    if (usedPhase.has(phase) && candidates.some(other => !picked.includes(other.shot) && !usedPhase.has(other.shot.emotionBeat?.episodePhase || '') && Number.isFinite(other.score))) continue;
    picked.push(item.shot); usedPhase.add(phase);
  }
  for (const item of candidates) {
    if (picked.length >= needed) break;
    if (!picked.includes(item.shot)) picked.push(item.shot);
  }
  picked.slice(0, needed).forEach((parent, index) => {
    const at = love.storyboardShots.findIndex(shot => shot.id === parent.id);
    love.storyboardShots.splice(at + 1, 0, makeFaceCoverage(parent, index + 1));
    faceCoverageAdded += 1;
  });
}

// Repair emotion handoffs after coverage insertion, without resetting established states.
for (let ep = 1; ep <= 20; ep += 1) {
  const lastByCharacter = new Map();
  for (const shot of love.storyboardShots.filter(item => Number(item.ep) === ep)) {
    const beat = shot.emotionBeat;
    if (!beat?.focalCharacter) continue;
    const previous = lastByCharacter.get(beat.focalCharacter);
    beat.continuityFromShotId = previous?.id || null;
    if (previous?.emotionBeat?.exitState) beat.entryState = previous.emotionBeat.exitState;
    lastByCharacter.set(beat.focalCharacter, shot);
  }
}

for (const shot of love.storyboardShots) shot.director15 = make15(shot, love);
love.openingRevision = '260812-freeze-face-montage-v1';
love.faceCoverageRevision = '260812-emotional-face-coverage-v1';
love.faceCoverageTarget = 'minimum 5 named CU/ECU face coverage shots per episode plus anonymous opening freeze-face montage';
love.directorSystem.assetGate = 'face/costume/space/prop/action must each score 10/10 before generation';

const ids = love.storyboardShots.map(shot => shot.id);
if (new Set(ids).size !== ids.length) throw new Error('duplicate shot id after expansion');
html = html.slice(0, located.start) + JSON.stringify(love) + html.slice(located.end);

replaceExact(
  '<div class="director-box"><h3>ASSET LOCK · 10/10 사전검증</h3>',
  '<div class="director-box"><h3>ASSET LOCK · 얼굴/의상/공간/소품/행동 10/10</h3>',
  1,
  'asset gate heading'
);

replaceExact(
`function directorAssetPreflight(shot,images,preset,context){
  images=Array.isArray(images)?images:[];preset=preset||{};context=context||{};
  const chars=directorResolveChars(shot);
  const types=images.map(function(i){return i&&i._type;});
  const faceOk=!chars.length||types.indexOf('face')!==-1||types.indexOf('character')!==-1||directorHasDefaultForChars(currentProject&&currentProject.defaultFaceRefs,chars);
  const costumeOk=!chars.length||types.indexOf('costume')!==-1||directorHasDefaultForChars(currentProject&&currentProject.defaultCostumeAssetRefs,chars)||!!context.costumeDna||!!preset.costume||!!(shot&&shot.costumeMode);
  const loc=(shot&&shot.loc)||(typeof resolveShotLoc==='function'&&resolveShotLoc(shot))||preset.loc||'';
  const spaceOk=types.indexOf('background')!==-1||!!context.spaceDna||!!(currentProject&&currentProject.spaceDNA&&currentProject.spaceDNA[loc]);
  const scores={face:faceOk?10:(chars.length?4:10),costume:costumeOk?10:(chars.length?5:10),space:spaceOk?10:(loc?7:2)};
  const failures=[];if(scores.face<10)failures.push('얼굴 '+scores.face+'/10');if(scores.costume<10)failures.push('의상 '+scores.costume+'/10');if(scores.space<10)failures.push('공간 '+scores.space+'/10');
  return {shotId:shot&&shot.id||'',scores:scores,pass:failures.length===0,failures:failures,characters:chars,location:loc,referenceCount:images.length,checkedAt:new Date().toISOString()};
}`,
`function directorAssetPreflight(shot,images,preset,context){
  images=Array.isArray(images)?images:[];preset=preset||{};context=context||{};
  const chars=directorResolveChars(shot);
  const types=images.map(function(i){return i&&i._type;});
  const faceOk=!chars.length||types.indexOf('face')!==-1||types.indexOf('character')!==-1||directorHasDefaultForChars(currentProject&&currentProject.defaultFaceRefs,chars);
  const costumeOk=!chars.length||types.indexOf('costume')!==-1||directorHasDefaultForChars(currentProject&&currentProject.defaultCostumeAssetRefs,chars)||!!context.costumeDna||!!preset.costume||!!(shot&&shot.costumeMode);
  const loc=(shot&&shot.loc)||(typeof resolveShotLoc==='function'&&resolveShotLoc(shot))||preset.loc||'';
  const spaceOk=types.indexOf('background')!==-1||!!context.spaceDna||!!(currentProject&&currentProject.spaceDNA&&currentProject.spaceDNA[loc]);
  const criticalProps=Array.isArray(shot&&shot.obj)?shot.obj.filter(Boolean):[];
  const propRefCount=types.filter(function(t){return t==='prop';}).length;
  const propOk=!criticalProps.length||propRefCount>=criticalProps.length;
  const actionText=[shot&&shot.desc,shot&&shot.func,shot&&shot.sourceScript].filter(Boolean).join(' ');
  const actionCritical=/손|쥐|잡|놓|누르|셔터|렌즈|카메라|라켓|우유|자전거|coat|carton|camera|shutter|grip|release|contact|rise|fall|freeze/i.test(actionText);
  const actionAuthorityOk=!actionCritical||(/위|아래|방향|접촉|이탈|정지|손가락|지지|향|vector|upward|downward|contact|release|support|point|freeze/i.test(actionText)&&propOk);
  const scores={face:faceOk?10:(chars.length?4:10),costume:costumeOk?10:(chars.length?5:10),space:spaceOk?10:(loc?7:2),prop:propOk?10:(criticalProps.length?3:10),action:actionAuthorityOk?10:(actionCritical?5:10)};
  const failures=[];if(scores.face<10)failures.push('얼굴 '+scores.face+'/10');if(scores.costume<10)failures.push('의상 '+scores.costume+'/10');if(scores.space<10)failures.push('공간 '+scores.space+'/10');if(scores.prop<10)failures.push('소품 형상 '+scores.prop+'/10');if(scores.action<10)failures.push('행동 권한 '+scores.action+'/10');
  return {shotId:shot&&shot.id||'',scores:scores,pass:failures.length===0,failures:failures,characters:chars,criticalProps:criticalProps,location:loc,referenceCount:images.length,checkedAt:new Date().toISOString()};
}`,
  1,
  'five-axis asset preflight'
);

replaceExact(
  "const move=(typeof recommendCameraMoveForShot==='function'?recommendCameraMoveForShot(shot):'locked-static');const risk=directorCameraAssessment(move,shot);",
  "const explicitLocked=/\\bLOCKED\\b|고정/i.test([shot.frame,shot.camera,shot.moving].join(' '));const move=explicitLocked?'locked-static':(typeof recommendCameraMoveForShot==='function'?recommendCameraMoveForShot(shot):'locked-static');const risk=directorCameraAssessment(move,shot);",
  1,
  'locked camera authority'
);

replaceExact(
  "d.blocks[14].value='route '+directorRouteModel('storyboard-image',shot,{referenceCount:images.length}).model+' · camera '+d.cameraRisk+' · asset '+gate.scores.face+'/'+gate.scores.costume+'/'+gate.scores.space+' · 9-frame QC >=90';",
  "d.blocks[14].value='route '+directorRouteModel('storyboard-image',shot,{referenceCount:images.length}).model+' · camera '+d.cameraRisk+' · asset '+gate.scores.face+'/'+gate.scores.costume+'/'+gate.scores.space+'/'+gate.scores.prop+'/'+gate.scores.action+' · 9-frame QC >=90';",
  1,
  'serialized five-axis scores'
);

replaceExact(
  ">ASSET '+gate.scores.face+'/'+gate.scores.costume+'/'+gate.scores.space+'</span>",
  ">ASSET '+gate.scores.face+'/'+gate.scores.costume+'/'+gate.scores.space+'/'+gate.scores.prop+'/'+gate.scores.action+'</span>",
  1,
  'card five-axis scores'
);

replaceExact(
  "['face','costume','space'].map(function(k){const v=gate.scores[k];return '<div style=\"display:flex;justify-content:space-between;margin:6px 0\"><span>'+({face:'얼굴',costume:'의상',space:'공간'}[k])+'</span><span class=\"director-score '+(v===10?'pass':'fail')+'\" style=\"font-size:18px\">'+v+'/10</span></div>';})",
  "['face','costume','space','prop','action'].map(function(k){const v=gate.scores[k];return '<div style=\"display:flex;justify-content:space-between;margin:6px 0\"><span>'+({face:'얼굴',costume:'의상',space:'공간',prop:'소품 형상',action:'행동 권한'}[k])+'</span><span class=\"director-score '+(v===10?'pass':'fail')+'\" style=\"font-size:18px\">'+v+'/10</span></div>';})",
  1,
  'panel five-axis scores'
);

replaceExact(
  "Return JSON only: {\"faceScore\":0-10,\"costumeScore\":0-10,\"spaceScore\":0-10,\"pass\":boolean,\"fatalIssues\":[],\"fixes\":[]}. A score of 10 means exact production-ready authority: face identity source is unambiguous, wardrobe state is exact, and location geometry is sufficient.",
  "Return JSON only: {\"faceScore\":0-10,\"costumeScore\":0-10,\"spaceScore\":0-10,\"propScore\":0-10,\"actionAuthorityScore\":0-10,\"pass\":boolean,\"fatalIssues\":[],\"fixes\":[]}. A score of 10 means exact production-ready authority: face identity is unambiguous, wardrobe state is exact, location geometry is sufficient, every critical prop matches its canonical geometry, and the intended action direction/contact is explicit.",
  1,
  'visual audit schema'
);

replaceExact(
  "audit.pass=Number(audit.faceScore)===10&&Number(audit.costumeScore)===10&&Number(audit.spaceScore)===10&&!(audit.fatalIssues||[]).length;",
  "audit.pass=Number(audit.faceScore)===10&&Number(audit.costumeScore)===10&&Number(audit.spaceScore)===10&&Number(audit.propScore)===10&&Number(audit.actionAuthorityScore)===10&&!(audit.fatalIssues||[]).length;",
  1,
  'visual audit five-axis pass'
);

fs.writeFileSync(outputPath, html);
console.log(JSON.stringify({ inputPath, outputPath, originalShotCount, finalShotCount: love.storyboardShots.length, openingInserts: openingInserts.length, faceCoverageAdded, cameraChangesDeferred: true }, null, 2));
