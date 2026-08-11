const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
const sandbox = {
  console, Blob, TextEncoder, Uint8Array, URL, setTimeout, clearTimeout,
  currentProjectKey: 'love-film',
  currentProject: {name:'LOVE',nameEn:'LOVE',defaultRatio:'16:9'},
  SB_SHOTS:[{id:'1-1',scene:1,desc:'LOVE opening',func:'love beat',char:['LOVE heroine'],pri:'must'}],
  sbGenImages:{}, sbSeqImages:{},
  localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))},
  document:{addEventListener(){},getElementById(){return null;},createElement(){return {click(){},remove(){},style:{}};},body:{appendChild(){}}},
  navigator:{clipboard:{writeText:async()=>{}}}, location:{href:'https://example.test/'},
  getSBRefsForShot(){return [{b64:'REFBASE64',mime:'image/png',_type:'face',_label:'primary face'}];},
  callGtiBridge:async()=>({imgB64:'LOVE_GENERATED_FRAME'}),
  fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}),
  atob:value=>Buffer.from(value,'base64').toString('binary')
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('seedance-planner.js','utf8'),sandbox,{filename:'seedance-planner.js'});

(async function(){
  const planner=sandbox.ZippySeedancePlanner;
  planner.init();planner.addShot('1-1');await planner.generateFrame('1-1');
  assert.equal(planner.collectReferences().find(ref=>ref.type==='storyboard').b64,'LOVE_GENERATED_FRAME');

  sandbox.currentProjectKey='proof-of-taste';
  sandbox.currentProject={name:'취향의 증거',nameEn:'PROOF OF TASTE',defaultRatio:'16:9'};
  sandbox.SB_SHOTS.splice(0,sandbox.SB_SHOTS.length,{id:'1-1',scene:1,desc:'Proof opening',func:'proof beat',char:['정우'],pri:'must'});
  Object.keys(sandbox.sbGenImages).forEach(key=>delete sandbox.sbGenImages[key]);
  assert.equal(planner.buildPrompt(),'30초 안에 구성할 씬을 왼쪽에서 선택하세요.','prompt building must switch project context even before the tab is opened');
  planner.init();
  assert.equal(planner.state().projectKey,'proof-of-taste');
  assert.deepEqual(Array.from(planner.state().items),[],'new project must not inherit the previous selection');
  planner.addShot('1-1');
  assert.equal(planner.collectReferences().find(ref=>ref.type==='storyboard').b64,'','LOVE frame must not leak into Proof of Taste with the same shot id');

  sandbox.SB_SHOTS.push({id:'PT-4',scene:1,frame:'검은 화면 타이틀',desc:'Title: Proof of Taste',func:'타이틀 카드',pri:'must'});
  planner.addShot('PT-4');
  assert.equal(planner.collectReferences().some(ref=>ref.type==='storyboard'&&ref.shotId==='PT-4'),false);
  assert.match(planner.buildPrompt(),/add all readable title typography in editing/);
  console.log('PASS seedance project isolation, missing-frame filtering, and title-card routing');
})().catch(error=>{console.error(error);process.exitCode=1;});
