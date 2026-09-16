const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const catalog = require('../cinematography-catalog.json');
const heading = text => ({tagName:'H3', textContent:text});
const link = (text, href) => ({tagName:'A', textContent:text, getAttribute:()=>href});
// Browser DOMParser already supplies DOM nodes. Test the extraction/routing against observed source anchor wording.
const nodes = [
  heading('Aerial Shot'), link('Read the complete Aerial Shot guide', '/cinematique/aerial-shot'),
  heading('Static Shot'), link('Read Guide', 'https://vvsvs.pro/cinematique/static-shot'),
  link('Read the complete malicious guide', 'https://other.example/cinematique/malicious'),
  link('Read script guide', 'javascript:alert(1)')
];
let offline = false, sourceRequests = 0;
const context = {
  URL, Set, AbortController, setTimeout, clearTimeout,
  document:{getElementById:()=>null},
  DOMParser:class { parseFromString() { return {querySelectorAll:()=>nodes}; } },
  ZippyPromptEngine:require('../prompt-engine.js'),
  fetch:async (url, options) => {
    if (url === 'cinematography-catalog.json') return {ok:true,json:async()=>catalog};
    sourceRequests++;
    assert.equal(url,'https://vvsvs.pro/cinematique');
    assert.equal(options.credentials,'omit'); assert.equal(options.referrerPolicy,'no-referrer');
    assert(options.signal);
    if (offline) throw new Error('test offline');
    return {ok:true,text:async()=>'<fixture supplied as parsed DOM nodes>'};
  }
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../cinematography-browser.js'),'utf8'),context);
(async()=>{
  const live=await context.ZippyCinematography.refresh();
  assert.equal(live.status.mode,'live'); assert.equal(live.status.count,2); assert.equal(live.status.matchedCount,2);
  assert.equal(live.liveEntries[0].name,'Aerial Shot');
  assert(live.liveEntries.every(entry=>entry.sourceUrl.startsWith('https://vvsvs.pro/cinematique/')));
  offline=true;
  const fallback=await context.ZippyCinematography.refresh();
  assert.equal(fallback.status.mode,'fallback'); assert.equal(fallback.status.error,'test offline');
  assert.equal(fallback.catalog.length,catalog.length); assert.equal(fallback.liveEntries.length,0);
  const recommended=await context.ZippyCinematography.query('항공 도시 전경');
  assert.equal(recommended.camera.framing.id,'aerial-shot'); assert.equal(sourceRequests,2);
  console.log('cinematography-browser: observed Read the complete…guide links, source origin, credential omission, fallback, offline recommendation PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
