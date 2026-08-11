const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('index.html', 'utf8');
const start = source.indexOf('const generationReason = useGrokImageBridge');
const end = source.indexOf('return {ok:true, shotId:shotId, b64:imgB64};', start);
assert.ok(start > 0 && end > start, 'storyboard success path must be present');

const block = source.slice(start, end);
assert.ok(block.indexOf('sbHideLoading(shotId)') < block.indexOf('saveStoryboardFrameToHistory'), 'loading must clear before history persistence');
assert.doesNotMatch(block, /await\s+saveStoryboardFrameToHistory/, 'history persistence must not block generation completion');
assert.match(block, /Promise\.resolve\(saveStoryboardFrameToHistory[\s\S]*\.catch\(/, 'history persistence must handle asynchronous failure');
assert.match(block, /try \{ zippyNasSaveImage/, 'NAS persistence must be best effort');

const director = fs.readFileSync('director-v3.js', 'utf8');
assert.match(director, /face\\s\*\(\?:is\\s\*\)\?unreadable/);
assert.match(director, /원거리/);

console.log('PASS storyboard generation finalizes before history/NAS persistence');
