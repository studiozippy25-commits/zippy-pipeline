const assert = require('node:assert/strict');
const {rewrite} = require('../prompt-rewriter.js');
const catalog = require('../cinematography-catalog.json');
const source = '[Shot 1] A person lifts a cup. 6 seconds. No dialogue.';
const image = {index:4,kind:'start',shotNumber:1,label:'start.png',mime:'image/png',b64:'aGVsbG8=',width:10,height:10};
const analysis = {shots:[{id:'S1',sourceText:source,description:'A person lifts a cup.',initialState:'A person holds a cup on the table.',endState:'The cup is raised.',duration:6,dialogue:'',speaker:'',soundscape:'',framing:'medium-shot',movement:'static-shot'}],references:[],constraints:[],music:'',style:'Documentary',changes:[],reviewIssues:[],keyframeObservations:[{index:4,observation:'A person and cup are visible at the table.',conflicts:[],uncertainties:['The far hand is occluded.']}]};
(async()=>{
  for (const model of ['h3','seedance']) {
    const result = await rewrite({model,projectKey:'test',originalPrompt:source,keyframes:[image]},async (prompt,images)=>{
      assert.equal(images.length,1);
      assert.equal(images[0].b64,image.b64);
      assert.ok(prompt.includes('attachmentPosition'));
      assert.ok(prompt.includes('"index":4'));
      assert.ok(!prompt.includes(image.b64));
      return JSON.stringify(analysis);
    },catalog);
    assert.equal(result.originalPrompt,source);
    assert.equal(result.keyframes[0].index,4);
    assert.equal(result.keyframes[0].kind,'start');
    assert.equal(result.keyframes[0].shotNumber,1);
    assert.equal(result.references[0].index,4);
    assert.deepEqual(result.references[0].usedBy,['S1']);
    assert.ok(result.references[0].role.includes('START'));
    assert.equal(result.imageAnalysis.submittedCount,1);
    assert.equal(result.keyframeObservations.length,1);
    assert.ok(!JSON.stringify(result).includes(image.b64));
    assert.ok(!JSON.stringify(result).includes('data:image'));
  }
  const input={model:'h3',projectKey:'test',originalPrompt:source,keyframes:[image]};
  const respond=async()=>JSON.stringify(analysis);
  await assert.rejects(()=>rewrite({...input,keyframes:[image,image]},respond,catalog),/중복/);
  await assert.rejects(()=>rewrite({...input,keyframes:[{...image,mime:'image/svg+xml'}]},respond,catalog),/이미지/);
  await assert.rejects(()=>rewrite({...input,keyframes:[{...image,b64:'https://private.example/image'}]},respond,catalog),/이미지/);
  await assert.rejects(()=>rewrite({...input,keyframes:[{...image,index:10}]},respond,catalog),/번호/);
  await assert.rejects(()=>rewrite({...input,keyframes:[{...image,shotNumber:2}]},respond,catalog),/컷/);
  await assert.rejects(()=>rewrite(input,async()=>JSON.stringify({...analysis,keyframeObservations:[]}),catalog),/이미지 관찰/);
  await assert.rejects(()=>rewrite(input,async()=>JSON.stringify({...analysis,keyframeObservations:[{...analysis.keyframeObservations[0],index:1}]}),catalog),/이미지 관찰/);
  await assert.rejects(()=>rewrite({...input,keyframes:[]},async()=>JSON.stringify({...analysis,references:[{type:'image',index:4,role:'Face',exclude:'Background'}]}),catalog),/image 4/);
  const conflicts=await rewrite(input,async()=>JSON.stringify({...analysis,keyframeObservations:[{index:4,observation:'A cup is visible.',conflicts:['The text says lifted, but the reference shows the cup on the table.'],uncertainties:[]}]}),catalog);
  assert.ok(conflicts.reviewIssues.some(x=>x.includes('text says lifted')));
  console.log('prompt-keyframes: actual image delivery, mapping, privacy, validation and conflict review PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
