const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const catalog = require('../cinematography-catalog.json');
const elements = {}, saved = new Map();
let imageFailure = false, releaseDecode, holdDecode = false, calls = [], revoked = 0, inserted = '';
const unescape = value => value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const root = {
  querySelector:()=>({insertAdjacentHTML:(_,html)=>{inserted += html;}}),
  querySelectorAll:()=>[],
  set innerHTML(html) {
    this.html = html;
    for (const id of ['psStatus','psHistory','psReceipt']) elements[id] = {dataset:{},textContent:'',innerHTML:''};
    elements.psOutput = {value:unescape(html.match(/id="psOutput"[^>]*>([\s\S]*?)<\/textarea>/)[1])};
    elements.psSourceFile = {parentElement:{insertAdjacentHTML:(_,html)=>{inserted += html;}}};
  }
};
elements.promptStudioApp = root;
const context = {
  console, AbortController, TextDecoder, setTimeout, clearTimeout, Blob,
  currentProjectKey:'test', crypto:{randomUUID:()=>Math.random().toString(36)},
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
  URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL:()=>{revoked++;}},
  Image:class {
    constructor(){this.naturalWidth=4096;this.naturalHeight=2048;}
    set src(value){const finish=()=>imageFailure?this.onerror():this.onload();if(holdDecode)releaseDecode=finish;else queueMicrotask(finish);}
  },
  document:{getElementById:id=>elements[id]||null,querySelector:()=>null,createElement:tag=>{
    assert.equal(tag,'canvas');return {getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,aGVsbG8='};
  }},
  fetch:async()=>({ok:true,json:async()=>catalog}),
  ZippyPromptEngine:require('../prompt-engine.js'),
  ZippyPromptRewriter:require('../prompt-rewriter.js'),
  callLLM:async request=>{
    calls.push(request);
    return {textOut:JSON.stringify({shots:[{id:'S1',description:'A person lifts a cup.',initialState:'A cup on the table.',endState:'The cup is raised.',duration:6,dialogue:'',speaker:'',soundscape:'',framing:'medium-shot',movement:'static-shot'}],references:[],constraints:[],changes:[],reviewIssues:[],music:'',style:'Documentary',keyframeObservations:request.images.map(image=>({index:Number(image._label.match(/Picture (\d+)/)[1]),observation:'A person and cup are visible.',conflicts:[],uncertainties:['Far hand is occluded.']}))})};
  }
};
context.window=context; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../prompt-studio.js'),'utf8'),context);
const api=context.ZippyPromptStudio;
const file=name=>({name,type:'image/png',size:1000});
const input=(id,value,dataset={})=>root.oninput({target:{id,value,dataset}});
const click=dataset=>root.onclick({target:{closest:()=>({dataset})}});
const upload=files=>root.onchange({target:{id:'psKeyframeFiles',files}});
(async()=>{
  await api.init();
  input('psOriginal','[Shot 1] A person lifts a cup. 6 seconds. No dialogue.');
  await upload([file('start.png'),file('end.png')]);
  assert.equal(calls.length,0,'upload must not invoke model');
  input('',4,{keyframe:'0',field:'index'}); input('','start',{keyframe:'0',field:'kind'});
  input('','end',{keyframe:'1',field:'kind'});
  const result=await api.rewrite();
  assert.equal(calls.length,1); assert.equal(calls[0].images.length,2);
  assert(calls[0].images[0]._label.includes('Picture 2 / end / Shot 1'));
  assert(calls[0].images[1]._label.includes('Picture 4 / start / Shot 1'));
  assert.equal(result.keyframes[0].width,2048); assert.equal(result.keyframes[0].height,1024);
  assert.equal(result.keyframeObservations.length,2);
  assert(inserted.includes('Far hand is occluded.'));
  for(const value of saved.values()) assert(!value.includes('aGVsbG8=')&&!value.includes('data:image'));
  const regenerated=await api.generate();
  assert.equal(regenerated.imageAnalysis.submittedCount,2);
  assert.equal(regenerated.keyframeObservations.length,2);
  assert.equal(regenerated.keyframes.length,2);
  assert(!JSON.stringify(api.exportRecord()).includes('aGVsbG8='));
  const prior=api.exportRecord().id;
  imageFailure=true; await upload([file('bad.png')]); imageFailure=false;
  assert.equal(api.exportRecord().id,prior,'failed decode preserves prior result');
  assert(elements.psStatus.textContent.includes('이미지 첨부 실패'));
  assert.equal(revoked,3,'all object URLs revoked');
  await click({removeKeyframe:'1'});
  await assert.rejects(()=>api.generate(),/키프레임/);
  assert.throws(()=>api.exportRecord(),/키프레임/);
  const afterRemoval=await api.rewrite();
  assert.equal(afterRemoval.keyframes.length,1); assert.equal(afterRemoval.keyframes[0].index,4,'remove must not renumber');
  await click({history:afterRemoval.id});
  assert(inserted.includes('재첨부')); await api.rewrite();
  assert.equal(calls.at(-1).images.length,0,'history must not restore image bytes');
  await upload(Array.from({length:10},(_,i)=>file(i+'.png')));
  assert(elements.psStatus.textContent.includes('최대 9장'));
  holdDecode=true; const pending=upload([file('slow.png')]);
  await assert.rejects(()=>api.rewrite(),/준비 중/);
  context.currentProjectKey='other'; await api.init();
  context.currentProjectKey='test'; await api.init();
  holdDecode=false; releaseDecode(); await pending;
  input('psOriginal','[Shot 1] A person lifts a cup. 6 seconds. No dialogue.');
  await api.rewrite(); assert.equal(calls.at(-1).images.length,0,'A→B→A switch cannot accept stale upload');
  console.log('prompt-studio-keyframes: upload, 2048 resize, indexed forwarding, review, recompile, byte privacy, decode failure, remove, history/project reset and busy guards PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
