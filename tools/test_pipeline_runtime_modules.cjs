const assert = require('node:assert/strict');
const fs = require('node:fs');

const models = require('../zippy-model-registry.js');
const bridge = require('../zippy-local-5080-client.js');

assert.equal(models.version, '1.0.0');
assert.deepEqual(Object.keys(models.video), ['wan', 'minimax-h3', 'ltx25', 'ltx23', 'seedance25']);
assert.equal(models.video['minimax-h3'].nodes[2][2], 'MiniMax H3 FL2VA');
assert.equal(models.workflowLabels.ltx25, 'LTX 2.5 22B Distilled NVFP4 + Native Audio');
assert.ok(models.image.textToImage.some((model) => model.id === 'zimage-turbo'));
assert.ok(models.image.edit.some((model) => model.id === 'qwen-edit-2511'));
assert.equal(models.audio.music[0].id, 'ace-step-1.5-xl-turbo');
assert.deepEqual(models.getVideoRenderOptions('ltx25', 5, '16:9'), {fps:24, frames:121, width:736, height:416});
assert.deepEqual(models.getVideoRenderOptions('minimax-h3', 5, '9:16'), {fps:24, frames:124, width:768, height:1344});
assert.deepEqual(models.getVideoRenderOptions('wan', 5, '16:9'), {fps:16});

assert.equal(bridge.normalizeGateway('http://127.0.0.1:8000'), bridge.constants.defaultGateway);
assert.equal(bridge.normalizeGateway('https://zippy-5080.studiozippy.co.kr/comfy/'), 'https://zippy-5080.studiozippy.co.kr');
assert.equal(bridge.shouldProxy(bridge.constants.defaultGateway, 'localhost'), true);
assert.equal(bridge.shouldProxy(bridge.constants.defaultGateway, 'zippy-pipeline.studiozippy25.workers.dev'), false);
assert.equal(
  bridge.getComfyBase(bridge.constants.defaultGateway, {pageHostname:'localhost', grokBridgeBase:'http://127.0.0.1:8790/'}),
  'http://127.0.0.1:8790/proxy/local5080/comfy'
);
assert.deepEqual(bridge.buildHeaders({gatewayKey:'secret', proxied:true, grokKey:'local', json:true}), {
  'Content-Type':'application/json',
  Authorization:'Bearer secret',
  'X-Zippy-Gateway-Key':'secret',
  'X-Zippy-Grok-Key':'local'
});

function response(data, status = 200) {
  return {ok:status >= 200 && status < 300, status, async json() { return data; }};
}

(async () => {
  const immediateCalls = [];
  const immediateFetch = async (url, options) => {
    immediateCalls.push({url, options});
    if (url.endsWith('/health')) return response({comfy_ok:true, comfy:'8188'});
    return response({video_url:'https://example.test/video.mp4'});
  };
  const immediate = await bridge.requestVideo({
    base:'https://gateway.test',
    headers:{Authorization:'Bearer test'},
    payload:{workflow_profile:'ltx25'},
    fetchImpl:immediateFetch
  });
  assert.equal(immediate, 'https://example.test/video.mp4');
  assert.equal(immediateCalls.length, 2);
  assert.equal(immediateCalls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(immediateCalls[1].options.body), {workflow_profile:'ltx25'});

  const pollCalls = [];
  const pollFetch = async (url) => {
    pollCalls.push(url);
    if (url.endsWith('/health')) return response({comfy_ok:true});
    if (url.endsWith('/v1/videos/generations')) return response({request_id:'job-1'});
    return response({status:'succeeded', video:{url:'https://example.test/polled.mp4'}});
  };
  const polled = await bridge.requestVideo({
    base:'https://gateway.test/', payload:{}, fetchImpl:pollFetch, pollInterval:0, maxPolls:2
  });
  assert.equal(polled, 'https://example.test/polled.mp4');
  assert.equal(pollCalls[2], 'https://gateway.test/v1/videos/job-1');

  await assert.rejects(
    bridge.checkHealth({base:'https://gateway.test', fetchImpl:async () => response({status:'ok'})}),
    /comfy_ok/
  );

  const html = fs.readFileSync('index.html', 'utf8');
  const registryScript = html.indexOf('<script src="zippy-model-registry.js"></script>');
  const bridgeScript = html.indexOf('<script src="zippy-local-5080-client.js"></script>');
  const adapter = html.indexOf('const LOCAL_5080_CLIENT = globalThis.ZippyLocal5080Client;');
  assert.ok(registryScript >= 0 && bridgeScript > registryScript && adapter > bridgeScript);
  assert.match(html, /const VIDEO_NODE_PROFILES = MODEL_REGISTRY\.video;/);
  assert.match(html, /return LOCAL_5080_CLIENT\.requestVideo\(/);
  assert.doesNotMatch(html, /const VIDEO_NODE_PROFILES = \{/);

  console.log('pipeline runtime module tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
