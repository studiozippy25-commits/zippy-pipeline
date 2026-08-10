(function(){
  'use strict';
  var STORE_PREFIX='zippy_director_v3_';
  var activeProject='';
  var mountTimer=0;
  var PHYSICS_KEYS=[
    ['contact','접촉·지지'],['anatomy','관절·해부학'],['gravity','중력·역학'],
    ['form','전문 동작 폼'],['shadow','그림자·반사'],['scale','원근·스케일'],
    ['props','소품 연속성']
  ];
  var CONTINUITY_KEYS=[['identity','아이덴티티'],['axis','스크린 축'],['text','문자 안정성']];
  var QC_KEYS=PHYSICS_KEYS.concat(CONTINUITY_KEYS);
  var ASSET_META={
    character:{label:'캐릭터',need:10,desc:'얼굴 CU·무두 전신 정면·전신 후면 + 10/10'},
    location:{label:'로케이션',need:10,desc:'3/4 뷰·앵커·단일 광원 + 10/10'},
    prop:{label:'소품',need:1,desc:'클로즈업·부분·은닉 상태 분리'},
    voice:{label:'보이스',need:1,desc:'음역·템포·억양·말버릇'},
    behavior:{label:'행동',need:1,desc:'움직임·손·습관·눈·무너짐'}
  };
  var STYLE_SECTIONS=['style','cinematography','lighting','color','camera','skin','acting','physics','composition','continuity','technical','audio'];

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function attr(v){return esc(v).replace(/`/g,'&#96;');}
  function js(v){return attr(String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/[\r\n\u2028\u2029]+/g,' '));}
  function now(){return new Date().toISOString();}
  function project(){try{return typeof currentProject!=='undefined'?currentProject:null;}catch(e){return null;}}
  function projectKey(){
    try{if(typeof currentProjectKey!=='undefined'&&currentProjectKey)return String(currentProjectKey);}catch(e){}
    var p=project(); return String((p&&(p.nameEn||p.name))||'default').replace(/[^a-z0-9가-힣_-]+/gi,'-');
  }
  function shots(){try{return typeof SB_SHOTS!=='undefined'&&Array.isArray(SB_SHOTS)?SB_SHOTS:[];}catch(e){return [];}}
  function defaultState(){
    var p=project()||{};
    return {version:3,mode:'preview',activeTab:'setup',setup:{format:p.defaultRatio||'16:9',world:'',stylePrefix:'',notes:''},assets:{character:{locked:false,evidence:0},location:{locked:false,evidence:0},prop:{locked:false,evidence:0},voice:{locked:false,evidence:0},behavior:{locked:false,evidence:0}},scenes:{},qc:{},logs:[],selectedScene:'',selectedShot:''};
  }
  function mergeState(raw){
    var base=defaultState(), out=Object.assign(base,raw||{});
    out.setup=Object.assign(base.setup,(raw&&raw.setup)||{});
    out.assets=base.assets;
    Object.keys(base.assets).forEach(function(k){out.assets[k]=Object.assign({},base.assets[k],raw&&raw.assets&&raw.assets[k]||{});});
    out.scenes=Object.assign({},raw&&raw.scenes||{}); out.qc=Object.assign({},raw&&raw.qc||{}); out.logs=Array.isArray(raw&&raw.logs)?raw.logs.slice(-500):[];
    return out;
  }
  function load(){try{return mergeState(JSON.parse(localStorage.getItem(STORE_PREFIX+projectKey())||'null'));}catch(e){return defaultState();}}
  function save(state){try{localStorage.setItem(STORE_PREFIX+projectKey(),JSON.stringify(state));}catch(e){} render();}
  function mutate(fn){var state=load();fn(state);save(state);return state;}
  function countUrls(value){if(!value)return 0;if(Array.isArray(value))return value.filter(Boolean).length;if(typeof value==='object')return Object.keys(value).filter(function(k){return value[k];}).length;return 1;}
  function countMap(map){var n=0;Object.keys(map||{}).forEach(function(k){n+=countUrls(map[k]);});return n;}
  function inventory(){
    var p=project()||{}, lib={};try{lib=typeof assetLib!=='undefined'?assetLib:{};}catch(e){}
    var chars=Math.max(countMap(p.defaultCharRefs),countMap(p.defaultFaceRefs),((lib.char||[]).length));
    var locs=Math.max(countMap(p.defaultSpaceRefs),countMap(p.defaultSpaceSheets),['space-a','space-b','space-c','space-d'].reduce(function(n,k){return n+(lib[k]||[]).length;},0));
    var props=Math.max(countMap(p.defaultObjRefs),(lib.obj||[]).length);
    Object.keys(lib).forEach(function(k){if(k.indexOf('obj-')===0)props+=(lib[k]||[]).length;});
    var people=(p.characterNames||p.characters||Object.keys(p.characterDNA||{}));
    return {character:chars,location:locs,prop:props,voice:Array.isArray(people)?people.length:Object.keys(people||{}).length,behavior:Array.isArray(people)?people.length:Object.keys(people||{}).length};
  }
  function sceneEntries(){
    var seen={}, out=[];
    shots().forEach(function(s){var key=sceneKey(s);if(seen[key])return;seen[key]=1;out.push({key:key,label:sceneLabel(s),loc:shotLocation(s),shot:s});});
    return out;
  }
  function sceneKey(shot){var ep=shot&&shot.ep!=null?'EP'+shot.ep:'';var sc=shot&&shot.scene!=null?'S'+shot.scene:'S0';return (ep?ep+'-':'')+sc+'|'+shotLocation(shot);}
  function sceneLabel(shot){var ep=shot&&shot.ep!=null?'EP'+String(shot.ep).padStart(2,'0')+' · ':'';return ep+'S'+(shot&&shot.scene!=null?shot.scene:'?')+' · '+(shotLocation(shot)||'장소 미지정');}
  function shotLocation(shot){
    try{if(typeof resolveShotLoc==='function')return resolveShotLoc(shot)||shot.loc||'';}catch(e){}
    return shot&&shot.loc||'';
  }
  function charList(shot){return shot&&Array.isArray(shot.char)?shot.char.filter(Boolean):[];}
  function propList(shot){return shot&&Array.isArray(shot.obj)?shot.obj.filter(Boolean):[];}
  function exactPeople(shot){var chars=charList(shot);return {count:chars.length,names:chars.map(function(n){return String(n).replace(/^.*?·\s*/,'');})};}
  function sceneGeo(state,shot){return state.scenes[sceneKey(shot)]||{};}
  function geoComplete(g){return !!(g&&g.space&&g.anchor&&g.anchorPosition&&g.distance&&g.axis&&g.light);}
  function styleStatus(value){var text=String(value||'').toLowerCase(),found=STYLE_SECTIONS.filter(function(name){return new RegExp('(^|\\n)\\s*'+name+'\\s*:','i').test(text);});return {count:found.length,complete:found.length===STYLE_SECTIONS.length,missing:STYLE_SECTIONS.filter(function(name){return found.indexOf(name)===-1;})};}
  function geoText(g,shot){
    g=g||{};
    return [
      'GEO SPATIAL LAYOUT (locked across every shot — pure spatial map):',
      '— '+(g.space||shotLocation(shot)||'[SPACE]')+' = '+(g.material||'physical location geometry and practical materials')+'.',
      '— '+(g.anchor||'[ANCHOR]')+': '+(g.anchorPosition||'CENTER')+', '+(g.distance||'3')+' m from '+(g.origin||'the primary action area')+'.',
      g.entry?'— ENTRY / BOUNDARY: '+g.entry+'.':'— ENTRY / BOUNDARY: fixed by the current location reference.',
      '— 180° AXIS: camera ALWAYS stays on the '+(g.axis||'[declared]')+' side — it NEVER crosses the line.',
      '— LIGHTING ORIGIN: '+(g.light||'one motivated practical source')+'.'
    ].join('\n');
  }
  function selectedMove(shot){try{return typeof getSelectedSBCameraMoveId==='function'?getSelectedSBCameraMoveId(shot):'';}catch(e){return '';}}
  function cameraBlock(shot){
    var id=selectedMove(shot), block='';
    try{if(id&&typeof getCameraMovePromptBlock==='function')block=getCameraMovePromptBlock(id)||'';}catch(e){}
    if(!block){try{var spec=typeof getSBCameraSpec==='function'?getSBCameraSpec(shot,{}):null;block=spec&&(spec.video||spec.summary)||'';}catch(e){}}
    if(!block)block=shot&&shot.frame||'locked-off static shot. Movement: hold one fixed camera position. Speed: still and steady. Framing: keep the composition. End: finish on the same framing.';
    if(!/Movement:/i.test(block))block+='\nMovement: execute only the storyboard-defined camera behavior.';
    if(!/Speed:/i.test(block))block+='\nSpeed: controlled and physically plausible.';
    if(!/Framing:/i.test(block))block+='\nFraming: keep the intended subject size, horizon, and screen direction stable.';
    if(!/End:/i.test(block))block+='\nEnd: settle on a clear stable final composition.';
    return block+'\nThe camera never invents an additional move and never crosses the declared 180-degree axis.';
  }
  function physicalize(text){
    return String(text||'').replace(/\bangry\b/gi,'the jaw sets and releases; breath exits once through the nose').replace(/\bsad\b/gi,'the throat swallows once; the lower lip tightens').replace(/\bshocked\b/gi,'the hands stop their work; breath draws in and holds').replace(/\bexhausted\b/gi,'the chest rises in short shallow pulls; one shoulder hangs lower').replace(/\bnervous\b/gi,'the fingers repeat a small task; weight shifts once');
  }
  function dialogueText(shot){return String(shot&&(shot.audioDialogue||shot.dialogue||'')||'').trim();}
  function hasTextCue(shot){return /한글|문자|메시지|말풍선|타이핑|채팅|휴대폰|폰\s*화면|간판|칠판|게시물|현수막|명찰|라벨|자막|text|message|typing|sign/i.test([shot&&shot.desc,shot&&shot.frame,shot&&shot.func].join(' '));}
  function referenceManifest(shot){
    var refs=[];try{if(typeof getSBRefsForShot==='function')refs=getSBRefsForShot(shot.scene,shot.id)||[];}catch(e){}
    if(!refs.length)return 'No uploaded reference is assumed. Use the Canon Registry and current shot only.';
    return refs.map(function(r,i){return (i+1)+'. '+String(r._type||'reference').toUpperCase()+' — '+String(r._label||'locked project asset');}).join('\n')+'\nEach reference keeps only its declared role. Location references provide space and texture only; never inherit their starting composition, angle, or grade.';
  }
  function formatOf(state){return state.setup.format||((project()||{}).defaultRatio)||'16:9';}
  function referenceCount(shot){var refs=[];try{if(typeof getSBRefsForShot==='function')refs=getSBRefsForShot(shot.scene,shot.id)||[];}catch(e){}return refs.length;}
  function routePlan(shot,state){var refs=referenceCount(shot),textCue=hasTextCue(shot),action=/달리|추격|스윙|서브|던지|충돌|회전|액션|fight|chase|swing/i.test([shot&&shot.desc,shot&&shot.func].join(' ')),camera=cameraAdvice(shot,state||load()),image='gemini-image',video='grok-video',post='없음',why=[];
    if(textCue){image='gemini-image';video='kling-video';post='AE 텍스트 합성';why.push('한글·UI는 빈 플레이트 생성 후 후반 합성이 안정적');}
    else if(refs>0&&refs<=3){image='grok-image-edit';why.push('핵심 레퍼런스 '+refs+'장이라 Grok image_edit 범위 안');}
    else if(refs>3){image='gemini-image';why.push('레퍼런스 '+refs+'장은 Grok 3장 제한을 넘으므로 Gemini 경로');}
    else why.push('레퍼런스 없는 신규 프레임은 Gemini 기본 경로');
    if(action||camera.risk==='HIGH'){video='kling-video';why.push('동작 또는 고위험 카메라는 Kling 우선');}else why.push('단순 I2V는 Grok 브릿지 우선');
    return {image:image,video:video,post:post,refs:refs,why:why.join(' · '),availability:{grok:typeof callGrokBuildImageBridge==='function',gemini:typeof callImageGen==='function',kling:typeof generateKlingJWT==='function'||!!document.getElementById('vidModel')}};
  }
  function modelRoute(shot,state){var r=routePlan(shot,state||load());return 'STILL: '+r.image+' · VIDEO: '+r.video+' · POST: '+r.post+' · '+r.why;}
  function cameraAdvice(shot,state){
    var id=selectedMove(shot)||'locked-static',format=formatOf(state||load()),risk='LOW',score=1,reason='한 축 또는 고정 구도로 연속성 유지가 쉽습니다.',alternative='locked-static';
    if(/whip|crash|orbit|arc-|snorri|chase|vehicle|helicopter|infinite|earth|pass-through|bullet|fpv|roll-|dolly-zoom|crane-overhead|macro-probe/i.test(id)){risk='HIGH';score=3;reason='회전·급가속·큰 시차 또는 복합 렌즈 동작으로 얼굴·배경·축 붕괴 위험이 큽니다.';}
    else if(/truck|slider|tracking|follow|reverse|low-tracking|crane|drone|pedestal|fast-zoom|push-past|handheld|dutch/i.test(id)){risk='MEDIUM';score=2;reason='이동 중 피사체 크기·지평선·배경 시차를 함께 유지해야 합니다.';}
    if(/orbit|arc-/i.test(id))alternative='slider-right + dolly-in';
    else if(/snorri|roll-|dutch|bullet/i.test(id))alternative='handheld-shot 또는 locked-static';
    else if(/chase|vehicle|fpv|helicopter/i.test(id))alternative='follow-shot 또는 tracking-shot';
    else if(/crash|infinite|earth|dolly-zoom/i.test(id))alternative='slow-zoom-in 또는 dolly-in';
    else if(/pass-through|macro-probe|crane-overhead/i.test(id))alternative='push-past 또는 crane-up';
    else if(score===2)alternative='dolly-in 또는 locked-static';
    var formatAlternative='현재 무브 유지 가능';
    if(format==='9:16'&&/pan|truck|slider|side-tracking|orbit|arc-/i.test(id))formatAlternative='9:16 대체: tilt-up/down · follow-shot · reverse-tracking · rack-focus';
    if(format==='16:9'&&/tilt|pedestal|crane-overhead/i.test(id))formatAlternative='16:9 대체: dolly-in/out · pan · slider';
    return {id:id,risk:risk,score:score,reason:reason,alternative:alternative,formatAlternative:formatAlternative};
  }
  function analyze(shot,state){
    state=state||load();var errors=[],warnings=[],notes=[],mode=state.mode||'preview';var g=sceneGeo(state,shot), chars=charList(shot), props=propList(shot), format=formatOf(state), move=selectedMove(shot);
    function gate(condition,msg){if(condition)return;if(mode==='production')errors.push(msg);else warnings.push(msg+' (본편 모드에서 차단)');}
    gate(!!String(state.setup.world||'').trim(),'세계관 한 문장이 비어 있습니다.');
    var styleCheck=styleStatus(state.setup.stylePrefix);
    gate(styleCheck.complete,'프로젝트 스타일 프리픽스 12항목이 완성되지 않았습니다. 누락: '+styleCheck.missing.join(', ')+'.');
    if(chars.length)gate(state.assets.character.locked&&Number(state.assets.character.evidence)>=10,'캐릭터 에셋 락 또는 10/10 증빙이 없습니다.');
    gate(state.assets.location.locked&&Number(state.assets.location.evidence)>=10,'로케이션 에셋 락 또는 10/10 증빙이 없습니다.');
    if(props.length)gate(state.assets.prop.locked&&Number(state.assets.prop.evidence)>=1,'이 쇼트의 소품 에셋이 락되지 않았습니다.');
    gate(state.assets.behavior.locked&&Number(state.assets.behavior.evidence)>=1,'행동 프로필이 락되지 않았습니다.');
    if(dialogueText(shot))gate(state.assets.voice.locked&&Number(state.assets.voice.evidence)>=1,'대사 쇼트인데 보이스가 락되지 않았습니다.');
    gate(geoComplete(g),'씬 GEO(공간·앵커·180° 축·광원)가 완성되지 않았습니다.');
    var text=[shot&&shot.desc,shot&&shot.frame,shot&&shot.func,dialogueText(shot)].join(' ');
    if(/\bdark\b/i.test(text))warnings.push('dark 대신 low key를 사용하세요.');
    if(/\bjolting\b/i.test(text))warnings.push('jolting 대신 rapid motion을 사용하세요.');
    if(/nobody moves/i.test(text))warnings.push('nobody moves는 프레임을 얼립니다. nobody steps toward anybody로 치환하세요.');
    if(/\b(teenager|17-year-old|high school student)\b/i.test(text))warnings.push('직접적인 나이 표현을 빼고 의상·공간·행동으로 표현하세요.');
    if(/\b(sad|angry|shocked|exhausted|nervous)\b/i.test(shot&&shot.desc||''))warnings.push('ACTION에서 감정어를 근육·호흡·시선 행동으로 치환하세요.');
    var camera=cameraAdvice(shot,state);
    if(format==='9:16'&&/pan|truck|side-track|slider|orbit|arc/i.test(move))warnings.push('세로의 짧은 축과 같은 수평 무브입니다. '+camera.formatAlternative+'.');
    if(format==='16:9'&&/tilt|pedestal/i.test(move))warnings.push('가로에서 수직 무브는 이탈 위험이 있습니다. Framing/End 락을 강화하세요.');
    if(camera.risk==='HIGH')warnings.push('카메라 위험도 HIGH · '+camera.reason+' 대체: '+camera.alternative+'.');
    if(hasTextCue(shot))notes.push(modelRoute(shot,state));
    notes.push('레퍼런스 역할 우선순위: 얼굴 → 캐릭터 → 의상 → 배경 → 소품. Grok image_edit 입력은 핵심 3장으로 축약.');
    var attempts=(state.logs||[]).filter(function(l){return l.shotId===shot.id&&l.event==='attempt';}).length;
    if(attempts>=15)errors.push('v15 도달: 워딩 수정을 중단하고 샷을 분할·단순화·재앵글해야 합니다.'); else if(attempts>=10)warnings.push('v10 도달: 대체 무브와 샷 분할을 검토하세요.');
    return {ok:errors.length===0,errors:errors,warnings:warnings,notes:notes,attempts:attempts,route:modelRoute(shot,state),routePlan:routePlan(shot,state),geo:g,format:format,move:move,camera:camera};
  }
  function buildPrompt(shot,state){
    state=state||load();var people=exactPeople(shot), g=sceneGeo(state,shot), props=propList(shot), dialogue=dialogueText(shot), action=physicalize(shot&&shot.desc||'hold the storyboard-defined physical action'), names=people.names.length?people.names.join(', '):'NO VISIBLE CHARACTER';
    var acting=(people.names.length?people.names:['NO VISIBLE CHARACTER']).map(function(name){return name+' — emotional context comes only from the scene; wants to complete the current beat; hides the consequence named by the scene function; dominant body rhythm remains physically specific; hands keep a practical task alive; what changes across the shot is visible in breath, gaze, posture, or the stopping of that task.';}).join('\n');
    var light=(g&&g.light)||shot&&shot.light||'one motivated practical source, one consistent shadow direction';
    var style=String(state.setup.stylePrefix||'').trim()||'Project style prefix pending — preserve the current project canon without inventing a new look.';
    var blocks=[
      ['SCENE CONTEXT','EXACT '+people.count+' CHARACTERS — NO DUPLICATES: '+names+'.\n'+sceneLabel(shot)+'. '+(shot&&shot.func||shot&&shot.desc||'Single storyboard beat')+'.'],
      ['ACTIVE REFERENCES',referenceManifest(shot)],
      ['LOCATION MAP',geoText(g,shot)],
      ['FIRST FRAME AND SPATIAL BLOCKING','First frame fixes the full readable geography: '+names+' at '+((g&&g.anchor)||'the declared location anchor')+', respecting '+((g&&g.anchorPosition)||'the storyboard position')+'. Capture the 0.3-second instant before the main action. Screen direction is already established.'],
      ['FORMAT MODE','Single complete cinematic storyboard frame. '+formatOf(state)+'. One moment only; no collage, split screen, contact sheet, before/after combination, or speed ramp.'],
      ['OPTICS',(shot&&shot.frame||'storyboard-defined physical cine lens')+'. Keep a physically plausible depth of field and the intended subject scale.'],
      ['CAMERA',cameraBlock(shot)],
      ['ACTION TIMING','0.0s — '+action+'.\nINNER (unspoken): '+(shot&&shot.func||'complete this beat without revealing what is being hidden')+'.\nMicro-life remains active: breath, precise eye-line, one non-uniform blink, and a practical hand task.'],
      ['PHYSICS','All bodies and props have real weight. Hands visibly grip what they carry. Joints stay within human range; five fingers remain intact. Gravity, inertia, contact shadows, perspective, and '+(props.length?props.length+' declared prop identities':'all practical props')+' remain physically correct.'],
      ['LIGHTING','One lighting origin only: '+light+'. Shadows and reflections follow that source; no floating or contradictory fill.'],
      ['AUDIO',dialogue?('Diegetic context only. Voice descriptor is locked separately. The exact line, and nothing else: "'+dialogue.replace(/"/g,'\\"')+'"\nNobody else speaks. Any smile or breath reaction is facial only, with no added vocalization. No music. No subtitles.'):'Diegetic environmental context only. Nobody speaks. No invented vocalization. No music. No subtitles.'],
      ['CHARACTER ACTING',acting],
      ['STYLE',style],
      ['QUALITY','Pore-level skin, wet living eyes with catch-lights, stable hands and faces, no jitter, no flicker. All faces stay exactly their references at every distance. Physical cine optics; no plastic skin, no game-engine or CGI look.'],
      ['POSITIVE CONSTRAINTS','Exactly '+people.count+' visible people and no one else. Exactly '+props.length+' declared prop references and no duplicates. The camera stays on the declared side of the 180° axis. '+(hasTextCue(shot)?'Existing first-frame text may be preserved; no new readable Korean is invented. ':'')+'Photoreal. NON-IP. '+formatOf(state)+'. SFX only. NO CGI. Cinematic.']
    ];
    return blocks.map(function(b,i){return String(i+1).padStart(2,'0')+' · '+b[0]+'\n'+b[1];}).join('\n\n');
  }
  function appendLog(state,entry){state.logs.push(Object.assign({time:now(),projectKey:projectKey()},entry));if(state.logs.length>500)state.logs=state.logs.slice(-500);}
  function costValue(result){var r=result||{},c=r.costUsd!=null?r.costUsd:(r.cost_usd!=null?r.cost_usd:(r.cost!=null?r.cost:(r.usage&&r.usage.cost!=null?r.usage.cost:'')));if(c==null||c==='')return '';var n=Number(c);return Number.isFinite(n)?'$'+n.toFixed(4):String(c);}
  function beforeGenerate(shot,opts){
    var state=load(), report=analyze(shot,state),provider=opts&&opts.provider||'default';
    if(!report.ok){appendLog(state,{event:'blocked',shotId:shot.id,provider:provider,result:report.errors[0],issues:report.errors});try{localStorage.setItem(STORE_PREFIX+projectKey(),JSON.stringify(state));}catch(e){}openShot(shot.id);toast('본편 생성 차단 · '+shot.id+' · '+report.errors[0],'bad');render();return {ok:false,error:report.errors.join(' / ')};}
    appendLog(state,{event:'attempt',shotId:shot.id,provider:provider,model:opts&&opts.model||'',version:report.attempts+1,issues:report.warnings});try{localStorage.setItem(STORE_PREFIX+projectKey(),JSON.stringify(state));}catch(e){}
    if(state.mode==='preview'&&report.warnings.length)toast('프리비즈 권고 · '+shot.id+' · '+report.warnings[0],'warn');
    return {ok:true,report:report};
  }
  function beforeBatch(batchShots){var state=load();if(state.mode!=='production')return {ok:true};var bad=(batchShots||[]).map(function(s){return {shot:s,report:analyze(s,state)};}).filter(function(x){return !x.report.ok;});if(!bad.length)return {ok:true};openBatch(bad);return {ok:false,error:'본편 관문 미통과 '+bad.length+'쇼트'};}
  function afterGenerate(shot,result){mutate(function(state){appendLog(state,{event:result&&result.ok?'success':'failure',shotId:shot&&shot.id||'',result:result&&result.error||'',provider:result&&result.provider||'',model:result&&result.model||'',cost:costValue(result),jobId:result&&result.jobId||''});});}
  function composeImagePrompt(shot,legacy){var state=load();if(state.mode!=='production')return legacy;return 'DIRECTOR V3 CONTROL LAYER — HIGHEST PRIORITY\n\n'+buildPrompt(shot,state)+'\n\nPROJECT CANON COMPATIBILITY — subordinate to the 15 blocks above\n'+String(legacy||'');}
  function composeVideoPrompt(shot,legacy){var state=load();if(state.mode!=='production')return legacy;return buildPrompt(shot,state)+'\n\nVIDEO EXECUTION NOTE\nUse the source image as the first frame. Preserve identity, wardrobe, location architecture, screen direction and lighting logic. Apply only the declared CAMERA movement. Trim-safe head and tail; no invented Korean text.\n\n'+String(legacy||'');}
  function lockStatus(state,key){var m=ASSET_META[key],v=state.assets[key];return !!(v.locked&&Number(v.evidence)>=m.need);}
  function assetStatus(state,key){var v=state.assets[key],ok=lockStatus(state,key);if(ok)return {label:'LOCK',cls:'locked'};if(v.locked||Number(v.evidence)>0)return {label:'테스트중',cls:'testing'};return {label:'미승인',cls:'pending'};}
  function setMode(mode){mutate(function(s){s.mode=mode==='production'?'production':'preview';appendLog(s,{event:'change',result:'운용 모드 → '+s.mode});});toast(mode==='production'?'본편 모드: 관문을 통과한 쇼트만 생성됩니다.':'프리비즈 모드: 기존 생성은 유지되고 문제를 권고합니다.');}
  function setTab(tab){mutate(function(s){s.activeTab=tab;});}
  function updateSetup(){mutate(function(s){s.setup.format=document.getElementById('zv3Format').value;s.setup.world=document.getElementById('zv3World').value.trim();s.setup.stylePrefix=document.getElementById('zv3Style').value.trim();s.setup.notes=document.getElementById('zv3Notes').value.trim();appendLog(s,{event:'change',result:'DIRECTOR SETUP 수정 · '+s.setup.format});});toast('Director Setup 저장 완료');}
  function updateAsset(key,field,value){mutate(function(s){if(field==='locked')s.assets[key].locked=!!value;else s.assets[key].evidence=Math.max(0,Math.min(10,Number(value)||0));appendLog(s,{event:'change',result:'ASSET '+key+' · '+(s.assets[key].locked?'락':'미승인')+' · 증빙 '+s.assets[key].evidence+'/10'});});}
  function selectScene(key){mutate(function(s){s.selectedScene=key;});}
  function saveGeo(){var key=document.getElementById('zv3SceneSelect').value;mutate(function(s){s.selectedScene=key;s.scenes[key]={space:document.getElementById('zv3GeoSpace').value.trim(),material:document.getElementById('zv3GeoMaterial').value.trim(),anchor:document.getElementById('zv3GeoAnchor').value.trim(),anchorPosition:document.getElementById('zv3GeoPosition').value,origin:document.getElementById('zv3GeoOrigin').value.trim(),distance:document.getElementById('zv3GeoDistance').value.trim(),entry:document.getElementById('zv3GeoEntry').value.trim(),axis:document.getElementById('zv3GeoAxis').value.trim(),light:document.getElementById('zv3GeoLight').value.trim()};appendLog(s,{event:'change',result:'SCENE GEO 수정 · '+key});});toast('씬 GEO 저장 완료');}
  function selectedShotFrom(id){return shots().find(function(s){return s.id===id;})||shots()[0]||null;}
  function selectPromptShot(id){mutate(function(s){s.selectedShot=id;});}
  function saveQc(){var id=document.getElementById('zv3QcShot').value, shot=selectedShotFrom(id);if(!shot)return;var checks={};QC_KEYS.forEach(function(k){var el=document.getElementById('zv3Qc-'+k[0]);checks[k[0]]=!!(el&&el.checked);});var decision=document.getElementById('zv3QcDecision').value,note=document.getElementById('zv3QcNote').value.trim(),frames=Math.max(0,Math.min(9,Number(document.getElementById('zv3QcFrames').value)||0)),failed=QC_KEYS.filter(function(k){return !checks[k[0]];});if(decision==='pass'&&(frames<9||failed.length)){decision='hold';note=('자동 보류: '+(frames<9?'9프레임 검토 미완료. ':'')+(failed.length?'물리 체크 미완료 — '+failed.map(function(k){return k[1];}).join(', ')+'. ':'')+note).trim();}mutate(function(s){s.selectedShot=id;s.qc[id]={checks:checks,framesReviewed:frames,decision:decision,note:note,time:now()};appendLog(s,{event:'qc',shotId:id,result:decision,note:note,failed:failed.map(function(k){return k[1];})});});toast('QC 판정 저장 · '+id+(decision==='hold'?' · 보류':'') ,decision==='hold'?'warn':'');}
  function renderHeader(state){var inv=inventory(), scenes=sceneEntries(), geoCount=scenes.filter(function(x){return geoComplete(state.scenes[x.key]);}).length,locked=Object.keys(ASSET_META).filter(function(k){return lockStatus(state,k);}).length,qcPass=Object.keys(state.qc).filter(function(k){return state.qc[k].decision==='pass';}).length,attempts=state.logs.filter(function(l){return l.event==='attempt';}).length;return '<div class="zv3-head"><div><div class="zv3-kicker">DIRECTOR CORE · AI CINEMA MANUAL v3.0</div><div class="zv3-title">스토리보드 감독 관문</div><div class="zv3-sub">기존 파이프라인은 유지합니다. 프리비즈는 권고, 본편은 에셋 락·GEO·15블록 검사를 강제합니다.</div></div><div class="zv3-mode"><button class="'+(state.mode==='preview'?'on':'')+'" onclick="ZippyDirectorV3.setMode(\'preview\')">프리비즈·권고</button><button class="production '+(state.mode==='production'?'on':'')+'" onclick="ZippyDirectorV3.setMode(\'production\')">본편·관문</button></div></div><div class="zv3-summary"><div class="zv3-stat"><b class="'+(locked===5?'zv3-ok':'zv3-warn')+'">'+locked+' / 5</b><span>에셋 락</span></div><div class="zv3-stat"><b class="'+(geoCount===scenes.length&&scenes.length?'zv3-ok':'zv3-warn')+'">'+geoCount+' / '+scenes.length+'</b><span>씬 GEO</span></div><div class="zv3-stat"><b>'+shots().length+'</b><span>스토리보드 쇼트</span></div><div class="zv3-stat"><b class="zv3-ok">'+qcPass+'</b><span>QC 통과</span></div><div class="zv3-stat"><b>'+attempts+'</b><span>생성 시도 로그</span></div></div>';
  }
  function renderTabs(state){var tabs=[['setup','1 · SETUP'],['assets','2 · ASSET LOCK'],['geo','3 · SCENE GEO'],['prompt','4 · 15 BLOCKS'],['qc','5 · QC & LOG']];return '<div class="zv3-tabs">'+tabs.map(function(t){return '<button class="'+(state.activeTab===t[0]?'on':'')+'" onclick="ZippyDirectorV3.setTab(\''+t[0]+'\')">'+t[1]+'</button>';}).join('')+'</div>';}
  function renderSetup(state){var style=styleStatus(state.setup.stylePrefix);return '<div class="zv3-grid"><div class="zv3-card"><h4>PROJECT CONSTITUTION</h4><label class="zv3-label">납품 포맷</label><select id="zv3Format" class="zv3-select"><option value="16:9" '+(formatOf(state)==='16:9'?'selected':'')+'>가로 16:9</option><option value="9:16" '+(formatOf(state)==='9:16'?'selected':'')+'>세로 9:16</option><option value="both" '+(formatOf(state)==='both'?'selected':'')+'>동시 납품 · 각각 생성</option></select><label class="zv3-label">세계관 한 문장</label><textarea id="zv3World" class="zv3-textarea" placeholder="이 작품의 물리 세계와 시각 문화를 한 문장으로">'+esc(state.setup.world)+'</textarea><label class="zv3-label">운용 메모</label><textarea id="zv3Notes" class="zv3-textarea" placeholder="종목 규칙·텍스트 합성·납품 주의사항">'+esc(state.setup.notes)+'</textarea></div><div class="zv3-card"><h4>STYLE PREFIX · 12항목 상수 <span class="zv3-status '+(style.complete?'locked':'testing')+'">'+style.count+'/12</span></h4><p>프로젝트 룩은 한 번 확정한 뒤 모든 쇼트에 토씨 그대로 사용합니다. Skin·Physics·Continuity·Audio 조항은 삭제하지 않습니다.</p><textarea id="zv3Style" class="zv3-textarea" style="min-height:230px" placeholder="Style: ...&#10;Cinematography: ...&#10;Lighting: ...&#10;Color: 60:30:10 ...&#10;Camera: Physical cine lens ...&#10;Skin: Pore-level realism ...&#10;Acting: ...&#10;Physics: Gravity and inertia respected ...&#10;Composition: ...&#10;Continuity: ...&#10;Technical: ...&#10;Audio: Environmental SFX only. No music.">'+esc(state.setup.stylePrefix)+'</textarea></div></div><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.updateSetup()">SETUP 저장</button></div>';}
  function assetRows(state){var inv=inventory();return Object.keys(ASSET_META).map(function(k){var m=ASSET_META[k],v=state.assets[k],ok=lockStatus(state,k),status=assetStatus(state,k);return '<div class="zv3-lock-row"><div><b>'+m.label+'</b><br><small>'+esc(m.desc)+'</small></div><small>등록 '+inv[k]+'개</small><span class="zv3-status '+status.cls+'">'+status.label+'</span><label class="zv3-check"><input type="checkbox" '+(v.locked?'checked':'')+' onchange="ZippyDirectorV3.updateAsset(\''+k+'\',\'locked\',this.checked)"> 감독 락</label><label class="zv3-check"><input class="zv3-input" style="width:58px;padding:5px" type="number" min="0" max="10" value="'+Number(v.evidence||0)+'" onchange="ZippyDirectorV3.updateAsset(\''+k+'\',\'evidence\',this.value)"> <span class="'+(ok?'zv3-ok':'zv3-warn')+'">/'+m.need+'</span></label></div>';}).join('');}
  function renderAssets(state){return '<div class="zv3-card"><h4>ASSET LOCK REGISTRY</h4><p>체크만으로 승인되지 않습니다. 캐릭터·로케이션은 스트레스 테스트 10/10이 함께 있어야 본편 관문을 통과합니다.</p>'+assetRows(state)+'</div>';}
  function renderAssetInline(state){var locked=Object.keys(ASSET_META).filter(function(k){return lockStatus(state,k);}).length;return '<section class="zv3-asset-inline"><div class="zv3-asset-inline-head"><b>DIRECTOR ASSET LOCK</b><span>'+locked+' / 5 승인 · '+(state.mode==='production'?'본편 관문':'프리비즈 권고')+'</span></div><div>'+assetRows(state)+'</div><div class="zv3-actions"><button class="zv3-btn" onclick="ZippyDirectorV3.focusDirectorTab(\'assets\')">감독 레지스트리에서 보기</button></div></section>';}
  function renderGeo(state){var entries=sceneEntries();var key=state.selectedScene&&entries.some(function(e){return e.key===state.selectedScene;})?state.selectedScene:(entries[0]&&entries[0].key||'');var entry=entries.find(function(e){return e.key===key;})||{},g=state.scenes[key]||{};return '<div class="zv3-grid"><div class="zv3-card"><h4>SCENE SELECT</h4><select id="zv3SceneSelect" class="zv3-select" onchange="ZippyDirectorV3.selectScene(this.value)">'+entries.map(function(e){return '<option value="'+attr(e.key)+'" '+(e.key===key?'selected':'')+'>'+esc(e.label)+(geoComplete(state.scenes[e.key])?' ✓':'')+'</option>';}).join('')+'</select><label class="zv3-label">공간 정의</label><input id="zv3GeoSpace" class="zv3-input" value="'+attr(g.space||entry.loc||'')+'"><label class="zv3-label">형태·재질·규모</label><input id="zv3GeoMaterial" class="zv3-input" value="'+attr(g.material||'')+'" placeholder="L-shaped concrete room, worn wood, 8m wide"><label class="zv3-label">앵커 오브젝트</label><input id="zv3GeoAnchor" class="zv3-input" value="'+attr(g.anchor||'')+'" placeholder="램프·문틀·기둥 등 하나"><div class="zv3-grid three"><div><label class="zv3-label">프레임 위치</label><select id="zv3GeoPosition" class="zv3-select">'+['frame-LEFT','CENTER-LEFT','CENTER','CENTER-RIGHT','frame-RIGHT'].map(function(v){return '<option '+(g.anchorPosition===v?'selected':'')+'>'+v+'</option>';}).join('')+'</select></div><div><label class="zv3-label">기준점</label><input id="zv3GeoOrigin" class="zv3-input" value="'+attr(g.origin||'primary action area')+'"></div><div><label class="zv3-label">거리 m</label><input id="zv3GeoDistance" class="zv3-input" value="'+attr(g.distance||'3')+'"></div></div></div><div class="zv3-card"><h4>AXIS · LIGHT</h4><label class="zv3-label">출입구·경계</label><input id="zv3GeoEntry" class="zv3-input" value="'+attr(g.entry||'')+'" placeholder="door at frame-LEFT, 8m from anchor"><label class="zv3-label">180° 축 — 카메라가 머무는 쪽</label><input id="zv3GeoAxis" class="zv3-input" value="'+attr(g.axis||'')+'" placeholder="door / court fence / corpse-field"><label class="zv3-label">단일 광원과 방향</label><textarea id="zv3GeoLight" class="zv3-textarea" placeholder="one soft window source from frame-RIGHT; shadow falls frame-LEFT">'+esc(g.light||'')+'</textarea><label class="zv3-label">생성될 GEO</label><div class="zv3-code" style="max-height:180px">'+esc(geoText(g,entry.shot||{}))+'</div></div></div><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.saveGeo()">이 씬 GEO 저장</button></div>';}
  function shotOptions(selected){return shots().map(function(s){return '<option value="'+attr(s.id)+'" '+(s.id===selected?'selected':'')+'>'+esc(s.id+' · '+(s.frame||s.desc||''))+'</option>';}).join('');}
  function cameraHtml(camera){var cls=camera.risk==='HIGH'?'pending':(camera.risk==='MEDIUM'?'testing':'locked');return '<p><b>CAMERA DIRECTOR · 57 MOVES</b><br><span class="zv3-status '+cls+'">'+esc(camera.risk)+'</span> '+esc(camera.id)+'<br><small>'+esc(camera.reason)+'</small><br><small>저위험 대체: '+esc(camera.alternative)+' · '+esc(camera.formatAlternative)+'</small></p>';}
  function renderPrompt(state){var shot=selectedShotFrom(state.selectedShot),id=shot&&shot.id||'';if(!shot)return '<div class="zv3-issue warning">스토리보드 쇼트가 없습니다.</div>';var report=analyze(shot,state);return '<div class="zv3-grid"><div class="zv3-card"><h4>SHOT PREFLIGHT</h4><select class="zv3-select" onchange="ZippyDirectorV3.selectPromptShot(this.value)">'+shotOptions(id)+'</select><div class="zv3-issues" style="margin-top:10px">'+issueHtml(report)+'</div>'+cameraHtml(report.camera)+'<p><b>MODEL ROUTE</b><br>'+esc(report.route)+'</p><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.openShot(\''+js(id)+'\')">상세 검사</button><button class="zv3-btn" onclick="navigator.clipboard.writeText(ZippyDirectorV3.buildPromptById(\''+js(id)+'\'))">15블록 복사</button></div></div><div class="zv3-card"><h4>15-BLOCK PREVIEW</h4><div class="zv3-code">'+esc(buildPrompt(shot,state))+'</div></div></div>';}
  function issueHtml(report){var html='';if(!report.errors.length&&!report.warnings.length)html+='<div class="zv3-issue ok">감독 관문 통과 가능</div>';report.errors.forEach(function(x){html+='<div class="zv3-issue error">'+esc(x)+'</div>';});report.warnings.forEach(function(x){html+='<div class="zv3-issue warning">'+esc(x)+'</div>';});report.notes.forEach(function(x){html+='<div class="zv3-issue">'+esc(x)+'</div>';});return html;}
  function qcChecksHtml(keys,q){return '<div class="zv3-qc">'+keys.map(function(k){return '<label><input id="zv3Qc-'+k[0]+'" type="checkbox" '+(q.checks&&q.checks[k[0]]?'checked':'')+'> '+k[1]+'</label>';}).join('')+'</div>';}
  function renderQc(state){var shot=selectedShotFrom(state.selectedShot),id=shot&&shot.id||'',q=state.qc[id]||{checks:{},framesReviewed:0,decision:'hold',note:''};var logs=state.logs.slice(-30).reverse();return '<div class="zv3-grid"><div class="zv3-card"><h4>VISUAL CONSTITUTION · SHOT QC</h4><select id="zv3QcShot" class="zv3-select" onchange="ZippyDirectorV3.selectPromptShot(this.value)">'+shotOptions(id)+'</select><label class="zv3-label">9프레임 QC · 검토 완료 수</label><input id="zv3QcFrames" class="zv3-input" type="number" min="0" max="9" value="'+Number(q.framesReviewed||0)+'"><label class="zv3-label">물리 헌법 7항</label>'+qcChecksHtml(PHYSICS_KEYS,q)+'<label class="zv3-label">연속성 보조 3항</label>'+qcChecksHtml(CONTINUITY_KEYS,q)+'<label class="zv3-label">판정</label><select id="zv3QcDecision" class="zv3-select"><option value="hold" '+(q.decision==='hold'?'selected':'')+'>보류</option><option value="pass" '+(q.decision==='pass'?'selected':'')+'>채택</option><option value="fail" '+(q.decision==='fail'?'selected':'')+'>폐기·리테이크</option></select><label class="zv3-label">판정 사유 · 헌법 위반</label><textarea id="zv3QcNote" class="zv3-textarea" placeholder="별로였음 금지 · 예: 4항 동작 폼 — 토스가 앞으로 기울어짐">'+esc(q.note||'')+'</textarea><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.saveQc()">QC 저장</button></div></div><div class="zv3-card"><h4>PRODUCTION LOG · 최근 30건</h4><div style="overflow:auto;max-height:460px"><table class="zv3-log"><thead><tr><th>시각</th><th>쇼트</th><th>이벤트</th><th>모델·비용</th><th>판정·사유</th></tr></thead><tbody>'+logs.map(function(l){return '<tr><td>'+esc(String(l.time||'').slice(5,16).replace('T',' '))+'</td><td>'+esc(l.shotId||'')+(l.version?' v'+l.version:'')+'</td><td>'+esc(l.event||'')+'</td><td>'+esc([l.provider,l.model,l.cost].filter(Boolean).join(' · ')||'-')+'</td><td>'+esc(l.result||l.note||(l.issues&&l.issues[0])||'')+'</td></tr>';}).join('')+'</tbody></table></div></div></div>';}
  function render(){clearTimeout(mountTimer);mountTimer=setTimeout(function(){var el=document.getElementById('directorV3Mount'),assetEl=document.getElementById('directorV3AssetMount'),state=load(),body='';if(el){if(state.activeTab==='assets')body=renderAssets(state);else if(state.activeTab==='geo')body=renderGeo(state);else if(state.activeTab==='prompt')body=renderPrompt(state);else if(state.activeTab==='qc')body=renderQc(state);else body=renderSetup(state);el.innerHTML='<section class="zv3-shell">'+renderHeader(state)+renderTabs(state)+'<div class="zv3-body">'+body+'</div></section>';}if(assetEl)assetEl.innerHTML=renderAssetInline(state);},0);}
  function cardControls(shot){var state=load(),report=analyze(shot,state),cls=report.errors.length?'bad':(report.warnings.length?'':'ok'),label=report.errors.length?'!':(report.warnings.length?String(report.warnings.length):'✓');return '<div class="zv3-shot-controls"><button class="zv3-shot-btn" onclick="event.stopPropagation();ZippyDirectorV3.openShot(\''+js(shot.id)+'\')">🎬 감독 검사 · 15블록</button><button class="zv3-shot-btn zv3-shot-dot '+cls+'" title="'+attr(report.errors.concat(report.warnings).join(' · ')||'통과')+'">'+label+'</button></div>';}
  function modal(title,body){closeModal();var wrap=document.createElement('div');wrap.id='zv3Modal';wrap.className='zv3-modal';wrap.innerHTML='<div class="zv3-modal-card"><div class="zv3-modal-head"><b>'+esc(title)+'</b><button class="zv3-modal-close" onclick="ZippyDirectorV3.closeModal()">×</button></div><div class="zv3-modal-body">'+body+'</div></div>';wrap.addEventListener('click',function(e){if(e.target===wrap)closeModal();});document.body.appendChild(wrap);}
  function closeModal(){var el=document.getElementById('zv3Modal');if(el)el.remove();}
  function openShot(id){var shot=selectedShotFrom(id);if(!shot)return;var state=load(),report=analyze(shot,state),prompt=buildPrompt(shot,state);modal('DIRECTOR PREFLIGHT · '+id,'<div class="zv3-grid"><div><div class="zv3-issues">'+issueHtml(report)+'</div><div class="zv3-card" style="margin-top:10px">'+cameraHtml(report.camera)+'<h4>MODEL ROUTE</h4><p>'+esc(report.route)+'</p><p>시도 버전: v'+(report.attempts+1)+(report.attempts>=15?' · 샷 재설계 필요':report.attempts>=10?' · 경고 구간':'')+'</p></div></div><div><div class="zv3-code">'+esc(prompt)+'</div><div class="zv3-actions"><button class="zv3-btn primary" onclick="navigator.clipboard.writeText(ZippyDirectorV3.buildPromptById(\''+js(id)+'\'))">15블록 복사</button><button class="zv3-btn" onclick="ZippyDirectorV3.focusDirectorTab(\'geo\')">GEO 수정</button></div></div></div>');}
  function openBatch(bad){modal('DIRECTOR BATCH GATE · '+bad.length+'쇼트 미통과','<div class="zv3-issues">'+bad.slice(0,100).map(function(x){return '<div class="zv3-issue error"><b>'+esc(x.shot.id)+'</b> · '+esc(x.report.errors.join(' / '))+'</div>';}).join('')+'</div>');}
  function focusDirectorTab(tab){closeModal();setTab(tab);var el=document.getElementById('directorV3Mount');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}
  function buildPromptById(id){var shot=selectedShotFrom(id);return shot?buildPrompt(shot,load()):'';}
  function toast(text,type){var old=document.getElementById('zv3Toast');if(old)old.remove();var el=document.createElement('div');el.id='zv3Toast';el.className='zv3-toast '+(type||'');el.textContent=text;document.body.appendChild(el);setTimeout(function(){if(el.parentNode)el.remove();},3800);}
  function refreshProject(){var key=projectKey();if(key!==activeProject){activeProject=key;render();}else if(document.getElementById('directorV3Mount')&&!document.querySelector('#directorV3Mount .zv3-shell'))render();}

  var api={render:render,setMode:setMode,setTab:setTab,updateSetup:updateSetup,updateAsset:updateAsset,selectScene:selectScene,saveGeo:saveGeo,selectPromptShot:selectPromptShot,saveQc:saveQc,openShot:openShot,openBatch:openBatch,closeModal:closeModal,focusDirectorTab:focusDirectorTab,cardControls:cardControls,analyze:analyze,cameraAdvice:function(shot){return cameraAdvice(shot,load());},routeShot:function(shot){return routePlan(shot,load());},beforeGenerate:beforeGenerate,beforeBatch:beforeBatch,afterGenerate:afterGenerate,composeImagePrompt:composeImagePrompt,composeVideoPrompt:composeVideoPrompt,buildPrompt:function(shot){return buildPrompt(shot,load());},buildPromptById:buildPromptById,geoText:function(shot){return geoText(sceneGeo(load(),shot),shot);},state:load};
  window.ZippyDirectorV3=api;
  document.addEventListener('DOMContentLoaded',function(){activeProject=projectKey();render();setInterval(refreshProject,900);setTimeout(function(){var timeline=document.getElementById('sbTimelineInner');if(timeline&&timeline.children.length&&!timeline.querySelector('.zv3-shot-controls')&&typeof window.buildStoryboardTimeline==='function')window.buildStoryboardTimeline();},180);});
})();
