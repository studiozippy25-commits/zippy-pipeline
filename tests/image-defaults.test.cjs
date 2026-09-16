const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const elements = {styleModeSel: {value: 'liveaction'}, gptImgModel: {value: 'gpt-image-2'}};
const calls = [];
let health = {ok: true, model: 'gpt-6-astra', imageModel: 'gpt-image-2.5-flare'};
const ctx = {
  console, DOMException, currentProject: {styleMode: 'liveaction'},
  document: {getElementById: id => elements[id] || null},
  localStorage: {getItem: () => null, setItem() {}},
  setTimeout: fn => fn(),
  prepareImageRefsForJsonBridge: async refs => refs,
  buildImageRefManifestForPrompt: () => '',
  isStringLimitError: () => false,
  fetch: async (url, options) => {
    calls.push({url, options});
    return {ok: true, json: async () => url.endsWith('/health') ? health :
      url.includes('/proxy/openai/') ? {data: [{b64_json: 'API'}]} : {imgB64: 'GTI'}};
  }
};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('const ZIPPY_LIVE_ACTION_MANDATE ='), html.indexOf('function grokBuildImageRefRole(')), ctx);
vm.runInContext(html.slice(html.indexOf('async function callGPTImage('), html.indexOf('async function checkComfy()')), ctx);
ctx.isProofOfTasteNoFaceDetailShot = () => false;
ctx.resolveShotLoc = shot => shot.loc;
vm.runInContext(html.slice(html.indexOf('function buildProofOfTasteFallbackPrompt('), html.indexOf('/* ═══ STORYBOARD DATA & FUNCTIONS ═══ */')), ctx);

(async () => {
  const scene = 'At night, 24mm low angle, horizon on upper third. Sign says "Cinematic Café". Keep face A and outfit B.';
  const styled = ctx.enforceLiveActionPrompt(scene);
  assert.ok(styled.includes(scene), 'explicit wording, geography and identity remain unchanged');
  assert.match(styled, /DOCUMENTARY \/ V-LOG/);
  assert.equal(ctx.enforceLiveActionPrompt(styled), styled, 'multiple request boundaries do not duplicate policy');
  elements.styleModeSel.value = 'animation';
  const animation = ctx.enforceLiveActionPrompt('approved 2.5D anime frame');
  assert.match(animation, /ANIMATION MANDATE/);
  assert.doesNotMatch(animation, /IMAGE CAPTURE DEFAULT|LIVE-ACTION DOCUMENTARY/);
  elements.styleModeSel.value = 'liveaction';

  await ctx.callGtiBridge({prompt: scene, images: [{b64: 'REF', mime: 'image/png'}]});
  const generation = calls.find(call => call.url.endsWith('/generate'));
  assert.ok(calls.findIndex(call => call.url.endsWith('/health')) < calls.indexOf(generation));
  const payload = JSON.parse(generation.options.body);
  assert.ok(payload.prompt.includes(scene));
  assert.match(payload.prompt, /DOCUMENTARY \/ V-LOG/);
  assert.doesNotMatch(payload.prompt, /cinematic fashion-film|BRIGHT REAL-WORLD TONE LOCK/);
  assert.deepEqual(payload.images, [{b64: 'REF', mime: 'image/png'}]);
  assert.equal(payload.model, undefined, 'controller is configured by bridge, not overwritten with an image model');
  assert.equal(payload.imageModel, undefined, 'bridge has no per-request image model field');
  for (const imageModel of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-sunburst-2026-09-16', 'gpt-image-2.5-flare-20260916']) {
    assert.equal(ctx.requireGtiImageModel({ok: true, imageModel}), imageModel);
  }
  assert.throws(() => ctx.requireGtiImageModel({ok: true, imageModel: 'gpt-image-2.5-flare-unverified'}));
  calls.length = 0;
  elements.styleModeSel.value = 'animation';
  await ctx.callGtiBridge({prompt: 'approved 2.5D anime frame'});
  const animatedRequest = JSON.parse(calls.find(call => call.url.endsWith('/generate')).options.body).prompt;
  assert.match(animatedRequest, /ANIMATION MANDATE/);
  assert.doesNotMatch(animatedRequest, /IMAGE CAPTURE DEFAULT|LIVE-ACTION DOCUMENTARY|GTI LIGHTING CONTROL/);
  elements.styleModeSel.value = 'liveaction';

  for (const old of [{ok: true, model: 'gpt-6-astra', imageModel: 'gpt-image-2'}, {ok: true, model: 'gpt-image-2.5-flare'}]) {
    health = old;
    calls.length = 0;
    await assert.rejects(ctx.callGtiBridge({prompt: scene}), /GPT Image 2.5 확인 필요/);
    assert.ok(calls.every(call => call.url.endsWith('/health')), 'incompatible bridge must never receive generation or references');
  }
  calls.length = 0;
  await ctx.callGPTImage({prompt: scene});
  const api = JSON.parse(calls[0].options.body);
  assert.equal(api.model, 'gpt-image-2', 'legacy public API route retains its supported selection');
  assert.ok(api.prompt.includes(scene));
  assert.doesNotMatch(calls[0].options.body, /gpt-image-2\.5-flare/, 'private bridge model never enters public API payload');
  const imageSection = html.slice(html.indexOf('// === IMAGE PROMPT ('), html.indexOf('// === 8-Layer Stack 영상 프롬프트'));
  assert.doesNotMatch(imageSection, /cinematic|film still|film photography|Deakins|Lubezki|Wong Kar-wai|시네마틱/i, 'actual image prompt composer has no automatic cinema treatment or director stacking');
  assert.match(imageSection, /Documentary \/ v-log photography/);
  const quickImage = html.slice(html.indexOf('async function generateIGImage()'), html.indexOf('function renderIGHistory()'));
  assert.doesNotMatch(quickImage, /cinematic|시네마틱|film still/i, 'quick image generation and prompt suggestion defaults are natural');
  assert.doesNotMatch(html, /Generate a SINGLE complete cinematic frame|detailed cinematic shot description for AI image generation|CINEMATIC STORYBOARD FRAME/);
  assert.ok(html.includes("vidPrompt += '[META] cinematic, photorealistic, Kling-optimized, '"), 'separate video prompt is unchanged');
  const fallback = ctx.buildProofOfTasteFallbackPrompt({id: 'TEST', desc: 'Read the card', loc: 'Cafe', time: 'night'}, {}, {summary: '24mm low angle'}, 'original walls', 'jacket B', 'face A', '', 'preserve hand');
  assert.doesNotMatch(fallback, /cinematic|film still|Kodak/i);
  assert.match(fallback, /documentary \/ v-log photograph/);
  assert.match(fallback, /CAMERA: 24mm low angle/);
  assert.match(fallback, /TIME: night/);
  assert.match(fallback, /SUBJECT DNA: face A/);
  console.log('PASS image defaults: documentary, animation preservation, idempotence, real bridge model verification, API isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
