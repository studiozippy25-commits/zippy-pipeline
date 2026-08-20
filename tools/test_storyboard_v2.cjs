'use strict';

const assert = require('node:assert/strict');
const { buildSegments, h3Time, shotEpisode } = require('../zippy-storyboard-v2.js');

const shots = Array.from({ length: 6 }, (_, index) => ({
  id: `EP01-C${String(index + 1).padStart(3, '0')}`,
  ep: 1,
  scene: 1,
  sceneName: 'INT. TEST ROOM / DAY',
  loc: 'TEST ROOM',
  desc: `Action beat ${index + 1}`,
  frame: index === 0 ? 'WS' : 'CU',
  durationSec: 3,
  char: ['주연 · 테스트'],
  obj: []
}));

const episodes = buildSegments(shots, 15);
assert.equal(episodes.length, 1);
assert.equal(episodes[0].segments.length, 2, 'H3 segment must split after five keyframes');
assert.equal(episodes[0].segments[0].cuts.length, 5);
assert.equal(episodes[0].segments[0].totalSeconds, 15);
assert.equal(episodes[0].segments[1].cuts.length, 1);
assert.match(episodes[0].segments[0].h3Prompt, /Picture 2 .* 3\.00-second mark/);
assert.match(episodes[0].segments[0].h3Prompt, /\[Shot 2\] At 00:03\.000/);
assert.match(episodes[0].segments[0].h3Prompt, /integrated_multimodal_description:/);
assert.equal(h3Time(62.125), '01:02.125');
assert.equal(shotEpisode({ id: 'LOVE-EP20-S32' }), 20);
assert.equal(shotEpisode({ episode: 7, id: 'SHOT-1' }), 7);

const idOnlyEpisodes = buildSegments([
  { id: 'LOVE-EP01-S01', scene: 1, loc: 'A', desc: 'first', durationSec: 3 },
  { id: 'LOVE-EP02-S01', scene: 1, loc: 'A', desc: 'second', durationSec: 3 },
  { id: 'LOVE-EP20-S01', scene: 1, loc: 'A', desc: 'last', durationSec: 3 }
], 15);
assert.deepEqual(idOnlyEpisodes.map(episode => episode.ep), [1, 2, 20], 'episode numbers must fall back to shot IDs');

console.log('Storyboard V2 deterministic tests passed');
