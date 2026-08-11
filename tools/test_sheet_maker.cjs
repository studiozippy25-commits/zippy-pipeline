const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    id, value: '', hidden: false, dataset: {}, innerHTML: '', textContent: '', className: '',
    classList: {toggle() {}, add() {}, remove() {}}, addEventListener() {}
  });
  return nodes.get(id);
}
const context = {
  console,
  document: {
    getElementById: node,
    addEventListener() {},
    createElement() { return {click() {}}; }
  },
  navigator: {clipboard: {writeText() { return Promise.resolve(); }}},
  assetLib: {char: [], 'space-a': []}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('sheet-maker.js', 'utf8'), context);

const api = context.ZippySheetMaker;
assert.equal(typeof api.deleteReference, 'function');
assert.equal(typeof api.deleteResult, 'function');
assert.match(api.prompt(), /sole primary identity authority/);
assert.match(api.prompt(), /exact skull and facial geometry/);
assert.match(api.prompt(), /Do not average, beautify, idealize/);

api.setMode('space360');
const space = api.prompt();
assert.match(space, /SAME fixed camera position at 1\.6m eye height/);
assert.match(space, /0°, 90°, 180°, and 270°/);
assert.match(space, /no fisheye/i);
assert.equal(api.state().mode, 'space360');

const html = fs.readFileSync('index.html', 'utf8');
for (const id of ['smModeCharacter', 'smModeSpace', 'smDeleteReference', 'smSpaceFields']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(html, /ZippySheetMaker\.deleteResult\(\)/);

console.log('PASS sheet maker identity lock, 360 location mode and delete controls');
