const assert = require('node:assert/strict');
const {rewrite} = require('../prompt-rewriter.js');
const catalog = require('../cinematography-catalog.json');
const originalPrompt = '[Shot 1] 복도에서 민수가 멈춘다. 8초. 민수 says: <d>[Korean] 문을 열지 마.</d> 남색 코트 유지.';
const analysis = {shots:[{id:'S1',sourceText:originalPrompt,description:'복도에서 민수가 멈춘다.',initialState:'민수가 복도에 있다.',endState:'민수가 멈춰 서 있다.',duration:8,speaker:'민수',dialogue:'문을 열지 마.',soundscape:'복도의 발소리',framing:'medium-close-up',movement:'static-shot'}],references:[],constraints:['남색 코트 유지.'],music:'',style:'Documentary / vlog',changes:['대사와 카메라를 모델 형식에 맞게 정리'],reviewIssues:['시작·종료 자세를 원래 행동에서 추론했으므로 검토 필요']};
(async()=>{
  for (const model of ['h3','seedance']) {
    const result=await rewrite({model,projectKey:'test',originalPrompt},async instructions=>{
      assert.ok(instructions.includes(JSON.stringify(originalPrompt)));
      return '```json\n'+JSON.stringify(analysis)+'\n```';
    },catalog);
    assert.equal(result.originalPrompt,originalPrompt);
    assert.ok(result.prompt.includes('문을 열지 마.'));
    assert.ok(result.prompt.includes('남색 코트 유지.'));
    assert.equal(result.reviewStatus,'needs-review');
    assert.equal(result.shots[0].sourceText,originalPrompt);
    assert.ok(result.reviewIssues.length);
  }
  const input={model:'h3',projectKey:'test',originalPrompt};
  const marked=await rewrite(input,async()=>JSON.stringify({...analysis,shots:[{...analysis.shots[0],dialogue:'[Korean] 문을 열지 마.'}]}),catalog);
  assert.ok(marked.prompt.includes('<d>[Korean] 문을 열지 마.</d>'));
  assert.ok(!marked.prompt.includes('[Korean] [Korean]'));
  await assert.rejects(()=>rewrite(input,async()=>JSON.stringify({...analysis,shots:[{...analysis.shots[0],dialogue:'열어.'}]}),catalog),/원문에 없는 대사/);
  await assert.rejects(()=>rewrite(input,async()=>JSON.stringify({...analysis,shots:[{...analysis.shots[0],dialogue:''}]}),catalog),/누락/);
  const canonical=await rewrite(input,async()=>JSON.stringify({...analysis,shots:[{...analysis.shots[0],sourceText:'잘못 베낀 발췌'}]}),catalog);
  assert.equal(canonical.shots[0].sourceText, originalPrompt);
  await assert.rejects(()=>rewrite({...input,originalPrompt:originalPrompt+'\n[Shot 2] 잠시 기다린다.'},async()=>JSON.stringify({...analysis,shots:[analysis.shots[0],{...analysis.shots[0],id:'S2',sourceText:'엉뚱한 사건'}]}),catalog),/대응하지/);
  await assert.rejects(()=>rewrite(input,async()=>JSON.stringify({...analysis,references:[{type:'image',index:1,role:'얼굴',exclude:'배경'}]}),catalog),/레퍼런스/);
  await assert.rejects(()=>rewrite(input,async()=> 'not JSON',catalog),/JSON/);
  console.log('prompt-rewriter: model formatting, source provenance, dialogue and reference preservation PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
