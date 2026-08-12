import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const filePath = path.resolve(process.argv[2]);
const html = fs.readFileSync(filePath, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function locateProject(source, key) {
  const markerAt = source.indexOf(`  "${key}": `);
  assert(markerAt >= 0, `missing ${key}`);
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
    else if (ch === '}' && --depth === 0) return JSON.parse(source.slice(start, i + 1));
  }
  throw new Error(`unterminated ${key}`);
}

const love = locateProject(html, 'love-film');
const shots = love.storyboardShots;
assert(shots.length === 927, `expected 927 shots, got ${shots.length}`);
assert(new Set(shots.map(shot => shot.id)).size === shots.length, 'duplicate shot ids');
assert(shots.every(shot => shot.director15?.blocks?.length === 15), 'director15 missing');

const openingIds = ['LOVE-EP01-S04C', 'LOVE-EP01-S04D', 'LOVE-EP01-S04E', 'LOVE-EP01-S04F'];
openingIds.forEach(id => assert(shots.some(shot => shot.id === id), `${id} missing`));
const s04 = shots.find(shot => shot.id === 'LOVE-EP01-S04');
assert(s04.char.length === 0, 'S04 must not force a centered named heroine');
assert(Number(s04.durationSec) === 0.8, 'S04 master duration changed');
assert(/no centered heroine/i.test(s04.desc), 'S04 centered-heroine guard missing');

for (let ep = 1; ep <= 20; ep += 1) {
  const count = shots.filter(shot => Number(shot.ep) === ep && Array.isArray(shot.char) && shot.char.length && /(?:^|\/)\s*(?:CU|ECU)\b/i.test(shot.frame || '') && !/rear|back|등\s*뒤/i.test(shot.frame || '')).length;
  assert(count >= 5, `EP${ep} has only ${count} named face closeups`);
}

assert(!love.defaultObjRefs['obj-sig-cam-sheet'], 'deferred camera sheet must not ship');
assert(!love.cameraPropRevision, 'deferred camera revision must not ship');
assert(love.defaultObjRefs['obj-shutseq'] === 'assets/love-film/obj/shutseq.jpg?v=1', 'existing camera context must remain untouched');
assert(love.directorSystem.assetGate.includes('prop/action'), 'five-axis gate metadata missing');

const preflightMatch = html.match(/function directorAssetPreflight\(shot,images,preset,context\)\{[\s\S]*?\n\}/);
assert(preflightMatch, 'preflight function missing');
const context = { currentProject: love, resolveShotLoc: shot => shot.loc, console };
vm.createContext(context);
vm.runInContext(`function directorResolveChars(shot){return Array.isArray(shot&&shot.char)?shot.char.filter(Boolean):[];} function directorHasDefaultForChars(){return true;} ${preflightMatch[0]}`, context);
const sample = shots.find(shot => Array.isArray(shot.obj) && shot.obj.length) || shots[0];
const blocked = context.directorAssetPreflight(sample, [{ _type: 'face' }, { _type: 'costume' }, { _type: 'background' }], {}, { spaceDna: 'locked', costumeDna: 'locked' });
assert(blocked.pass === false && blocked.scores.prop < 10, 'missing prop refs must block generation');
const propCount = sample.obj.length;
const allowed = context.directorAssetPreflight(sample, [{ _type: 'face' }, { _type: 'costume' }, { _type: 'background' }, ...Array.from({ length: propCount }, () => ({ _type: 'prop' }))], {}, { spaceDna: 'locked', costumeDna: 'locked' });
assert(allowed.scores.prop === 10 && allowed.scores.action === 10, 'complete prop refs/action authority must score 10');

console.log(JSON.stringify({
  filePath,
  shotCount: shots.length,
  faceCoverageAdded: shots.filter(shot => shot.sourceRevision === '260812-emotional-face-coverage-v1').length,
  openingMontage: openingIds,
  cameraChangesDeferred: true,
  generationGate: 'face/costume/space/prop/action = 10/10',
  verified: true
}, null, 2));
