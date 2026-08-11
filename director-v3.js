(function(){
  'use strict';
  var ENGINE_VERSION='3.1.0';
  if(window.ZippyDirectorV3&&window.ZippyDirectorV3.__engineVersion===ENGINE_VERSION){if(typeof window.ZippyDirectorV3.render==='function')window.ZippyDirectorV3.render();return;}
  if(window.ZippyDirectorV3&&typeof window.ZippyDirectorV3.destroy==='function')window.ZippyDirectorV3.destroy();
  var STORE_PREFIX='zippy_director_v3_';
  var STATE_VERSION=5;
  var PROMPT_BEGIN='<<< ZIPPY_DIRECTOR_V3_BEGIN >>>',PROMPT_END='<<< ZIPPY_DIRECTOR_V3_END >>>';
  var activeProject='';
  var mountTimer=0;
  var refreshTimer=0;
  var assistantBusy=false;
  var faceAuditBusy={};
  var regenerationBusy={};
  var PHYSICS_KEYS=[
    ['contact','접촉·지지'],['anatomy','관절·해부학'],['gravity','중력·역학'],
    ['form','전문 동작 폼'],['shadow','그림자·반사'],['scale','원근·스케일'],
    ['props','소품 연속성']
  ];
  var CONTINUITY_KEYS=[['identity','아이덴티티'],['axis','스크린 축'],['text','문자 안정성']];
  var CLOUD_QC_KEYS=[['linework','선화 두께·형태'],['silhouette','실루엣 고정'],['cel','셀 셰이딩 안정'],['parallax','멀티플레인·패럴랙스'],['texture','2.5D 재질 일관성']];
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
    return {version:STATE_VERSION,mode:'preview',expertOpen:false,activeTab:'setup',setup:{format:p.defaultRatio||'16:9',world:'',stylePrefix:'',notes:''},canon:projectDefaultCanon(),assistant:{messages:[],last:''},assets:{character:{locked:false,evidence:0},location:{locked:false,evidence:0},prop:{locked:false,evidence:0},voice:{locked:false,evidence:0},behavior:{locked:false,evidence:0}},scenes:{},shotLights:{},faceAudits:{},regenerationPrompts:{},qc:{},logs:[],selectedScene:'',selectedShot:''};
  }
  function mergeState(raw){
    var base=defaultState(), out=Object.assign({},base,raw||{});
    out.setup=Object.assign({},base.setup,(raw&&raw.setup)||{});
    out.assets=base.assets;
    Object.keys(base.assets).forEach(function(k){out.assets[k]=Object.assign({},base.assets[k],raw&&raw.assets&&raw.assets[k]||{});});
    out.version=STATE_VERSION;out.canon=String(raw&&String(raw.canon||'').trim()?raw.canon:base.canon);out.assistant=Object.assign({},base.assistant,raw&&raw.assistant||{});out.assistant.messages=Array.isArray(out.assistant.messages)?out.assistant.messages.slice(-20):[];
    out.scenes=Object.assign({},raw&&raw.scenes||{});out.shotLights=Object.assign({},raw&&raw.shotLights||{});out.faceAudits=Object.assign({},raw&&raw.faceAudits||{});out.regenerationPrompts=Object.assign({},raw&&raw.regenerationPrompts||{});out.qc=Object.assign({},raw&&raw.qc||{});out.logs=Array.isArray(raw&&raw.logs)?raw.logs.slice(-500):[];
    if(raw&&Number(raw.version||0)<STATE_VERSION)out.logs.push({time:now(),projectKey:projectKey(),event:'migration',result:'Director 저장 상태 v'+Number(raw.version||0)+' → v'+STATE_VERSION+' · 프로젝트 헌법과 AI 감독 기억 연결'});
    return out;
  }
  function load(){try{var key=STORE_PREFIX+projectKey(),raw=JSON.parse(localStorage.getItem(key)||'null'),out=mergeState(raw);if(raw&&Number(raw.version||0)<STATE_VERSION)localStorage.setItem(key,JSON.stringify(out));return out;}catch(e){return defaultState();}}
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
  function isLoveProject(){var key=projectKey().toLowerCase(),name=String((project()||{}).name||'').toLowerCase();return key==='love-film'||name.indexOf('오늘은 왠지 love')!==-1;}
  function isCloudRiderProject(){var key=projectKey().toLowerCase(),name=String((project()||{}).name||'').toLowerCase();return key==='cloudrider'||name.indexOf('cloudrider')!==-1||name.indexOf('클라우드라이더')!==-1;}
  function loveVisualCanon(shot){var imagination=/상상|뮤지컬|무대\s*전환|imagination|musical/i.test([shot&&shot.frame,shot&&shot.desc,shot&&shot.func].join(' '));return 'LOVE LIVE-ACTION NATURALISM: contemporary Korean youth drama photographed as an observed real moment, never a posed fashion still. Preserve the approved face as the sole identity authority and the selected wardrobe as the sole clothing authority; no averaging, beautification, age shift, actor replacement, uniform redesign, or cross-character borrowing. Skin keeps pores, peach fuzz, tiny tonal variation, and natural asymmetry. Eyes stay moist but not glassy or enlarged. Hands perform the declared practical task with correct ownership, grip, five fingers, and believable joint range. Body weight settles through feet, hips, shoulders, and contact surfaces; no mannequin pose, twisted torso, floating limb, forced smile, direct-to-camera gaze, or synchronized extras. Emotion appears through 2–4 observable cues only: a breath change, precise eye-line, jaw or lip tension, a hand task that slows or stops, posture, distance, and reaction timing. Use one motivated sun, window, or practical source; natural Korean skin tone, clean whites, sky-blue and leaf-green accents, optical foreground/background bokeh only when the shot size supports it. '+(imagination?'This is a scripted musical-imagination beat: it must grow from the declared real physical trigger, preserve the same faces and wardrobe, heighten choreography and light without turning into a generic concert, then leave a visually readable path back to reality.':'This is a reality beat: no fantasy stage, concert lighting, glamour pose, magical particle field, or unmotivated spectacle.')+' One complete 16:9 cinematic frame, one readable instant, no collage, text, logo, watermark, anime, illustration, plastic CGI, or beauty-ad retouch.';}
  function cloudRiderTextureCanon(){return 'CLOUDRIDER 2.5D TEXTURE CONSTITUTION: premium cinematic 2.5D with clean expressive 2D linework and stable silhouettes, emotionally readable hand-drawn faces, restrained semi-3D facial and costume volume, soft painterly cel shading, delicately modeled eyes with tiny natural specular highlights, layered multiplane depth with subtle parallax, warm edge light against cool ambient shadow, controlled practical bokeh, and hand-painted environment texture. Aircraft and backgrounds may carry smoother dimensional form but never become glossy game-engine PBR, plastic 3D, flat vector art, chibi, or photoreal human skin. The style reference https://youtu.be/Qk-cio3amuI is material, light, and depth grammar only; never copy a person, protected character, exact composition, title, logo, or text.';}
  function projectVisualCanon(shot){return isLoveProject()?loveVisualCanon(shot):(isCloudRiderProject()?cloudRiderTextureCanon():'');}
  function projectDefaultCanon(){
    if(isLoveProject())return 'LOVE STORY & PERFORMANCE CANON: Every shot belongs only to 〈오늘은 왠지 LOVE〉 and contemporary Korean school life. Reality and musical imagination never leak into each other: imagination grows from one visible real-world trigger and returns through a readable physical bridge. Each character has one scene objective, one obstacle, one tactic for hiding or pursuing it, one beat change, and one unspoken subtext. Render those as 2–4 observable cues only—breath, exact eyeline, jaw or lip tension, a practical hand task, posture, interpersonal distance, and reaction timing. Preserve one approved face authority and one exact wardrobe variant per visible character. No cross-project character, scene, title card, style, costume, or generated reference may enter this project.';
    if(isCloudRiderProject())return 'CLOUDRIDER STORY & TEXTURE CANON: Preserve the 20-episode soft-SF road-movie world, real Earth regional cultures, human–machine companionship, exact character/craft identities, and approved location registry. Use the 2.5D style reference only as material, light, depth, and motion grammar. Characters keep clean expressive linework, stable silhouettes and painterly cel surfaces; craft and environments carry restrained semi-3D volume and layered multiplane parallax. Never drift to photoreal people, glossy PBR, plastic 3D, flat vector art, chibi, copied reference composition, or another project\'s spaces and assets.';
    return '';
  }
  function charList(shot){return shot&&Array.isArray(shot.char)?shot.char.filter(Boolean):[];}
  function propList(shot){return shot&&Array.isArray(shot.obj)?shot.obj.filter(Boolean):[];}
  function exactPeople(shot){var chars=charList(shot);return {count:chars.length,names:chars.map(function(n){return String(n).replace(/^.*?·\s*/,'');})};}
  function sceneGeo(state,shot){return state.scenes[sceneKey(shot)]||{};}
  function shotLightPlan(state,shot){return Object.assign({},sceneGeo(state,shot),state.shotLights&&state.shotLights[shot&&shot.id]||{});}
  function geoComplete(g){return !!(g&&g.space&&g.anchor&&g.anchorPosition&&g.distance&&g.axis&&g.light);}
  function styleStatus(value){var text=String(value||'').toLowerCase(),found=STYLE_SECTIONS.filter(function(name){return new RegExp('(^|\\n)\\s*'+name+'\\s*:','i').test(text);});return {count:found.length,complete:found.length===STYLE_SECTIONS.length,missing:STYLE_SECTIONS.filter(function(name){return found.indexOf(name)===-1;})};}
  function lightPlanText(g,shot){
    g=g||{};var source=g.light||shot&&shot.light||'one motivated practical or natural source',angle=g.lightAzimuth||'storyboard-declared side',height=g.lightHeight||'storyboard-declared height',temp=g.lightTemp||'scene-motivated neutral color temperature',intensity=g.lightIntensity||'restrained exposure',diffusion=g.lightDiffusion||'physically plausible softness',fill=g.fillRatio||'passive bounce only',background=g.backgroundExposure||'readable separation',atmosphere=g.atmosphere||'clean air';
    return 'PRIMARY MOTIVATED SOURCE: '+source+'. Position: '+angle+', '+height+'. Color temperature: '+temp+'. Intensity: '+intensity+'. Diffusion: '+diffusion+'. FILL POLICY: '+fill+'; fill is passive bounce or ambient return from the same motivated environment, never a contradictory second origin. BACKGROUND EXPOSURE: '+background+'. ATMOSPHERE: '+atmosphere+'. Keep light direction, temperature, intensity, shadow placement, catchlights, reflections, and exposure stable from first frame to last. Retain highlight and shadow detail; no lighting change, exposure shift, beauty-light flattening, or unmotivated rim spill.';
  }
  function geoText(g,shot){
    g=g||{};
    return [
      'GEO SPATIAL LAYOUT (locked across every shot — pure spatial map):',
      '— '+(g.space||shotLocation(shot)||'[SPACE]')+' = '+(g.material||'physical location geometry and practical materials')+'.',
      '— '+(g.anchor||'[ANCHOR]')+': '+(g.anchorPosition||'CENTER')+', '+(g.distance||'3')+' m from '+(g.origin||'the primary action area')+'.',
      g.entry?'— ENTRY / BOUNDARY: '+g.entry+'.':'— ENTRY / BOUNDARY: fixed by the current location reference.',
      '— 180° AXIS: camera ALWAYS stays on the '+(g.axis||'[declared]')+' side — it NEVER crosses the line.',
      '— LIGHT PLOT: '+lightPlanText(g,shot)
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
  function actingBlock(shot,people){
    var names=people.names.length?people.names:['NO VISIBLE CHARACTER'],goal=String(shot&&shot.func||shot&&shot.desc||'complete the current scene beat'),physical=physicalize(shot&&shot.desc||'continue the declared practical action');
    return names.map(function(name,index){var role=index===0?'primary beat carrier':'reaction and pressure source';return [
      name+' — '+role+'.',
      'Objective: '+goal+'.',
      'Obstacle: the other person, environment, timing, or consequence already visible in this scene; invent no new backstory.',
      'Tactic: '+physical+' while concealing or pursuing the objective through the declared practical task.',
      'Beat change: one precise reaction point only; '+(index===0?'the task, breath, or eyeline changes first':'react after the primary character, never in synchronization')+'.',
      'Subtext stays unspoken. Show only 2–4 cues from breath, exact eyeline, jaw or lip tension, hand-task speed, posture, interpersonal distance, and reaction timing.'
    ].join(' ');}).join('\n');
  }
  function dialogueText(shot){return String(shot&&(shot.audioDialogue||shot.dialogue||'')||'').trim();}
  function hasTextCue(shot){return /한글|문자|메시지|말풍선|타이핑|채팅|휴대폰|폰\s*화면|간판|칠판|게시물|현수막|명찰|라벨|자막|text|message|typing|sign/i.test([shot&&shot.desc,shot&&shot.frame,shot&&shot.func].join(' '));}
  function refsForShot(shot){var refs=[];try{if(typeof getSBRefsForShot==='function')refs=getSBRefsForShot(shot.scene,shot.id)||[];}catch(e){}return Array.isArray(refs)?refs:[];}
  function generatedFrame(shot){
    var value='';try{if(typeof sbGenImages!=='undefined'&&shot)value=sbGenImages[shot.id]||'';}catch(e){}
    if((!value||value==='__ZIPPY_HISTORY_REF__')&&shot)try{if(typeof sbSeqImages!=='undefined'&&Array.isArray(sbSeqImages[shot.id]))value=sbSeqImages[shot.id][0]||'';}catch(e){}
    if(value&&typeof value==='object')value=value.b64||value.data||'';
    value=String(value||'');if(!value||value==='__ZIPPY_HISTORY_REF__'||value.length<256)return '';
    var mime='image/png',match=value.match(/^data:([^;,]+);base64,/i);if(match){mime=match[1];value=value.slice(match[0].length);}return {b64:value,mime:mime};
  }
  function frameSignature(frame){return frame&&frame.b64?String(frame.b64.length)+':'+frame.b64.slice(0,24)+':'+frame.b64.slice(-24):'';}
  function prepareFaceAuditImage(input){
    if(!input||!input.b64)return Promise.resolve(input);if(input.b64.length<900000||typeof Image==='undefined')return Promise.resolve(input);
    return new Promise(function(resolve){var img=new Image();img.onload=function(){try{var max=1280,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));canvas.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);var data=canvas.toDataURL('image/jpeg',.9);resolve({b64:data.slice(data.indexOf(',')+1),mime:'image/jpeg'});}catch(e){resolve(input);}};img.onerror=function(){resolve(input);};img.src='data:'+(input.mime||'image/png')+';base64,'+input.b64;});
  }
  function faceRefsForShot(shot){var seen={};return refsForShot(shot).filter(function(r){return String(r&&r._type||'').toLowerCase()==='face';}).map(function(r,i){
    var b64=String(r&&((r.b64)||(r.inline_data&&r.inline_data.data)||(r.data))||''),mime=String(r&&((r.mime)||(r.inline_data&&r.inline_data.mime_type))||'image/png'),m=b64.match(/^data:([^;,]+);base64,/i);if(m){mime=m[1];b64=b64.slice(m[0].length);}var label=String(r&&r._label||'승인 얼굴 '+(i+1));return {b64:b64,mime:mime,label:label};
  }).filter(function(r){var key=r.label+'|'+r.b64.slice(0,32);if(!r.b64||seen[key])return false;seen[key]=1;return true;});}
  function faceVisibleInShot(shot){
    if(!exactPeople(shot).count)return false;var text=[shot&&shot.frame,shot&&shot.desc,shot&&shot.func].join(' ');
    if(/손|손가락|발|신발|카드|라벨|소품|오브제|기체|풍경|전경|insert|macro|object|prop|back\s*view|후면|등만|실루엣만/i.test(text)&&!/얼굴|표정|눈빛|face|portrait|headshot/i.test(text))return false;
    return true;
  }
  function currentFaceAudit(state,shot){var frame=generatedFrame(shot),audit=state&&state.faceAudits&&shot&&state.faceAudits[shot.id];return frame&&audit&&audit.signature===frameSignature(frame)?audit:null;}
  function referenceManifest(shot){
    var refs=refsForShot(shot);
    if(!refs.length)return 'No uploaded reference is assumed. Use the Canon Registry and current shot only.';
    return refs.map(function(r,i){return (i+1)+'. '+String(r._type||'reference').toUpperCase()+' — '+String(r._label||'locked project asset');}).join('\n')+'\nEach reference keeps only its declared role. Location references provide space and texture only; never inherit their starting composition, angle, or grade.';
  }
  function formatOf(state){return state.setup.format||((project()||{}).defaultRatio)||'16:9';}
  function referenceCount(shot){return refsForShot(shot).length;}
  function routePlan(shot,state){var refs=referenceCount(shot),textCue=hasTextCue(shot),image='gemini-image',video='existing-video-provider',post='없음',why=[];
    if(textCue){image='gemini-image';post='AE 텍스트 합성';why.push('한글·UI는 빈 플레이트 생성 후 후반 합성이 안정적');}
    else if(refs>0&&refs<=3){image='grok-image-edit';why.push('핵심 레퍼런스 '+refs+'장이라 Grok image_edit 범위 안');}
    else if(refs>3){image='gemini-image';why.push('레퍼런스 '+refs+'장은 Grok 3장 제한을 넘으므로 Gemini 경로');}
    else why.push('레퍼런스 없는 신규 프레임은 Gemini 기본 경로');
    why.push('Seedance 프롬프트는 독립 탭에서 최대 30초 다중 씬으로 제작');
    return {image:image,video:video,post:post,refs:refs,why:why.join(' · '),availability:{grok:typeof callGrokBuildImageBridge==='function',gemini:typeof callImageGen==='function',seedance:!!document.getElementById('vidModel')}};
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
  function strictAnalyze(shot,state,opts){
    state=state||load();var report=analyze(shot,state),errors=report.errors.slice(),warnings=report.warnings.slice(),notes=report.notes.slice(),mode=state.mode||'preview',refs=refsForShot(shot),text=[shot&&shot.frame,shot&&shot.desc,shot&&shot.func,shot&&shot.loc,referenceManifest(shot)].join(' '),types=refs.map(function(r){return String(r&&r._type||'').toLowerCase();}),people=exactPeople(shot),props=propList(shot),move=selectedMove(shot),lightLocked=!!(state.shotLights&&state.shotLights[shot&&shot.id]),frame=generatedFrame(shot),faceVisible=faceVisibleInShot(shot),faceAudit=currentFaceAudit(state,shot),isRegenerating=!!(shot&&regenerationBusy[shot.id]);
    function strictGate(condition,msg){if(condition)return;if(mode==='production')errors.push(msg);else warnings.push(msg+' (엄격 본편 검사)');}
    function strictWarn(condition,msg){if(!condition)warnings.push(msg);}
    strictGate(!!String(shot&&shot.id||'').trim(),'쇼트 ID가 없습니다.');
    strictGate(!!String(shot&&shot.frame||'').trim(),'프레이밍·렌즈 정의가 없습니다.');
    strictGate(!!String(shot&&shot.desc||'').trim(),'화면에 보이는 물리 행동이 없습니다.');
    strictGate(!!String(shot&&shot.func||'').trim(),'이 쇼트의 서사 기능·변화 지점이 없습니다.');
    if(people.count){strictGate(types.some(function(t){return t==='face'||t==='character';}),'인물이 보이지만 얼굴 또는 캐릭터 권위 레퍼런스가 없습니다.');strictGate(types.indexOf('costume')!==-1,'인물이 보이지만 정확한 의상 변형 레퍼런스가 없습니다.');if(faceVisible){var faceAuthorityCount=selectFaceAuthorities(shot,faceRefsForShot(shot)).length;strictGate(faceAuthorityCount===people.count,'얼굴이 보이는 인물별 승인 FACE 원본이 부족합니다. '+faceAuthorityCount+' / '+people.count+'명 연결됨.');}}
    if(faceVisible&&frame&&!isRegenerating){
      strictGate(!!faceAudit,'생성된 인물 얼굴의 원본 일치도 정밀 평가가 아직 없습니다.');
      if(faceAudit){strictGate(faceAudit.status!=='unavailable','얼굴이 너무 작거나 가려져 일치도를 판정할 수 없습니다. 얼굴이 읽히는 프레임으로 재생성해야 합니다.');strictGate(Number(faceAudit.score||0)>=90,'얼굴 원본 일치도 '+Number(faceAudit.score||0)+'점 · 본편 기준 90점 미만입니다.');}
    } else if(faceVisible&&!frame)notes.push('FACE IDENTITY · 생성 전. 이미지 생성 후 승인 얼굴 원본과 별도 정밀 검수가 필요합니다.');
    else if(!faceVisible)notes.push('FACE IDENTITY · 손·소품·후면 등 얼굴 비노출 컷으로 자동 제외했습니다.');
    if(props.length)strictGate(types.some(function(t){return t==='prop'||t==='object';}),'선언된 소품이 있지만 소품 권위 레퍼런스가 없습니다.');
    strictWarn(refs.length<=3,'레퍼런스 '+refs.length+'장: Grok image_edit 3장 제한 초과. 모델 라우터가 Gemini로 보내는지 확인하세요.');
    if(/LOCKED|locked[- ]?off|고정/i.test(String(shot&&shot.frame||'')))strictGate(!move||/locked|static/i.test(move),'LOCKED 구도인데 카메라 무브 '+move+'가 선택되어 있습니다.');
    strictWarn(lightLocked,'쇼트 LIGHT PLOT이 미확정입니다. 씬 GEO 광원을 상속하지만 각도·색온도·Fill 비율 검토가 필요합니다.');
    var abstractEmotion=/슬픔|기쁨|분노|불안|긴장|설렘|질투|외로움|두려움|결심|sad|angry|nervous|happy|jealous|afraid/i.test(String(shot&&shot.desc||'')),observable=/숨|호흡|시선|눈|턱|입술|손|손가락|멈|속도|자세|거리|어깨|무게|고개|blink|breath|eye|jaw|lip|hand|posture|distance|stop/i.test(String(shot&&shot.desc||''));
    strictGate(!abstractEmotion||observable,'추상 감정어만 있고 호흡·시선·손·자세·거리 같은 관찰 가능한 단서가 없습니다.');
    var refText=refs.map(function(r){return [r&&r._label,r&&r.name,r&&r.url,r&&r.src].filter(Boolean).join(' ');}).join(' ').toLowerCase();
    if(isLoveProject()){
      strictGate(!/(cloudrider|proof[-_ ]?of[-_ ]?taste|취향의\s*증거|ncity|n시의\s*무법자|coffee5pm|午後5時)/i.test(text+' '+refText),'LOVE 쇼트에 다른 프로젝트의 장면·에셋·프롬프트가 섞였습니다.');
      var imagination=/상상|뮤지컬|무대\s*전환|imagination|musical/i.test(text),trigger=/셔터|사진|카메라|라켓|현실|복귀|돌아|trigger|return/i.test(text);
      strictGate(!imagination||trigger,'뮤지컬 상상 쇼트에 현실 트리거 또는 복귀 연결이 보이지 않습니다.');
    }
    if(isCloudRiderProject()){
      strictGate(/^\[CR-SP-/i.test(String(shotLocation(shot)||''))||!String(shotLocation(shot)||'').trim(),'CloudRider 장소가 승인된 [CR-SP-*] 공간 코드가 아닙니다.');
      strictGate(!/(assets\/(?:love-film|proof-of-taste|ncity|coffee5pm)|\[SP-|오늘은\s*왠지|취향의\s*증거)/i.test(text+' '+refText),'CloudRider 쇼트에 외부 프로젝트 공간·에셋이 섞였습니다.');
      strictGate(!/(photoreal human|live[- ]?action|glossy pbr|plastic 3d|flat vector|chibi)/i.test(String(shot&&shot.desc||'')),'CloudRider 쇼트 설명이 2.5D 질감 헌법과 충돌합니다.');
    }
    var blockCount=15;if(!opts||opts.compile!==false){var built=buildPrompt(shot,state);blockCount=(built.match(/^\d{2} · /gm)||[]).length;strictGate(blockCount===15,'15블록 프롬프트가 '+blockCount+'블록으로 컴파일되었습니다.');}
    var uniqueErrors=Array.from(new Set(errors)),uniqueWarnings=Array.from(new Set(warnings)),baseScore=Math.max(0,100-uniqueErrors.length*14-uniqueWarnings.length*5),score=baseScore;
    if(faceVisible&&frame){if(faceAudit)score=Math.min(Number(faceAudit.score||0),Math.min(100,Math.max(0,Math.round(baseScore*.55+Number(faceAudit.score||0)*.45))));else score=Math.min(score,60);}
    return Object.assign({},report,{ok:uniqueErrors.length===0,errors:uniqueErrors,warnings:uniqueWarnings,notes:notes,strictScore:score,strictReady:uniqueErrors.length===0&&uniqueWarnings.length===0,blockCount:blockCount,refsChecked:refs.length,lightLocked:lightLocked,faceVisible:faceVisible,faceFrame:!!frame,faceScore:faceAudit?Number(faceAudit.score||0):null,faceStatus:faceAudit?faceAudit.status:(faceVisible?(frame?'pending':'pre-generation'):'excluded'),faceAudit:faceAudit});
  }
  function buildPrompt(shot,state){
    state=state||load();var people=exactPeople(shot), g=sceneGeo(state,shot),lightPlan=shotLightPlan(state,shot), props=propList(shot), dialogue=dialogueText(shot), action=physicalize(shot&&shot.desc||'hold the storyboard-defined physical action'), names=people.names.length?people.names.join(', '):'NO VISIBLE CHARACTER';
    var acting=actingBlock(shot,people);
    var style=[projectVisualCanon(shot),String(state.canon||'').trim(),String(state.setup.stylePrefix||'').trim()].filter(Boolean).join('\n')||'Project style prefix pending — preserve the current project canon without inventing a new look.';
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
      ['LIGHTING',lightPlanText(lightPlan,shot)],
      ['AUDIO',dialogue?('Diegetic context only. Voice descriptor is locked separately. The exact line, and nothing else: "'+dialogue.replace(/"/g,'\\"')+'"\nNobody else speaks. Any smile or breath reaction is facial only, with no added vocalization. No music. No subtitles.'):'Diegetic environmental context only. Nobody speaks. No invented vocalization. No music. No subtitles.'],
      ['CHARACTER ACTING',acting],
      ['STYLE',style],
      ['QUALITY',(isCloudRiderProject()?'Stable linework, stable silhouettes, painterly cel surfaces, restrained dimensional volume, consistent multiplane depth, stable hands and faces, no jitter or flicker.':'Pore-level skin, wet living eyes with restrained catch-lights, stable hands and faces, no jitter, no flicker. All faces stay exactly their references at every distance. Physical cine optics; no plastic skin, no game-engine or CGI look.')+(isLoveProject()?' Avoid the generic AI portrait look: no beauty-commercial polish, doll skin, fashion pose, symmetrical expression, or empty camera-facing stare.':'')],
      ['POSITIVE CONSTRAINTS','Exactly '+people.count+' visible people and no one else. Exactly '+props.length+' declared prop references and no duplicates. The camera stays on the declared side of the 180° axis. '+(hasTextCue(shot)?'Existing first-frame text may be preserved; no new readable Korean is invented. ':'')+(isCloudRiderProject()?'Premium cinematic 2.5D animation with stable illustrated identity and physically coherent depth. NON-IP. '+formatOf(state)+'. SFX only. No live-action, photoreal human skin, glossy PBR, or plastic 3D.':'Naturalistic photoreal live-action cinema. NON-IP. '+formatOf(state)+'. SFX only. No plastic CGI look.')]
    ];
    return blocks.map(function(b,i){return String(i+1).padStart(2,'0')+' · '+b[0]+'\n'+b[1];}).join('\n\n');
  }
  function seedanceAudio(shot){
    var raw=dialogueText(shot);if(!raw)return '<Natural room tone and the practical sounds caused by the visible action.>\nNo dialogue, narration, subtitles, or background music.';
    var subtitle=raw.match(/^\s*(?:자막|subtitle)\s*[:：]\s*(.+)$/i);if(subtitle)return '['+subtitle[1].trim()+']\nNo spoken dialogue. Keep the image itself free of newly invented text.';
    if(/(?:효과음|소리|빗소리|발소리|충돌음|점화음|회전음|음파|sfx|sound effect)/i.test(raw)&&!/['\"]/.test(raw))return '<'+raw.replace(/[<>]/g,'').trim()+'>\nNo spoken dialogue or subtitles.';
    var speaker=(charList(shot)[0]||'the visible speaker').replace(/^.*?·\s*/,'');
    return 'Dialogue language: Korean. '+speaker+' speaks in the established voice, with restrained natural delivery: {'+raw.replace(/[{}]/g,'').trim()+'}\n<Quiet location ambience and only the practical sounds visible in the shot.>\nNo subtitles or background music.';
  }
  function seedanceCamera(shot,state){
    var advice=cameraAdvice(shot,state), block=cameraBlock(shot).replace(/\nThe camera never[\s\S]*$/,'');
    return 'Move: '+advice.id+'.\nTarget: the storyboard subject and its primary visible action.\n'+block+'\nVisible result: preserve subject scale, screen direction, readable geography, and settle on one clear final composition. Do not add a second camera move or cross the 180-degree axis.';
  }
  function buildSeedancePrompt(shot,state){
    state=state||load();var p=project()||{}, people=exactPeople(shot), names=people.names.length?people.names.join(', '):'no visible character', props=propList(shot), g=sceneGeo(state,shot),lightPlan=shotLightPlan(state,shot), action=physicalize(shot&&shot.desc||'hold the storyboard-defined physical action'), endState=shot&&shot.func||'the visible action reaches a clear readable completion';
    var subject=people.count?'Exactly '+people.count+' visible character'+(people.count===1?'':'s')+': '+names+'.':'No visible character; the declared prop or environment is the subject.';
    var visual=[projectVisualCanon(shot),String(state.canon||'').trim(),String(state.setup.stylePrefix||'').trim(),String(p.quality||'').trim()].filter(Boolean).join('\n')||'Photorealistic live-action cinema with physical optics, natural skin and stable detail.';
    var negative=String(p.negative||'').trim();
    return [
      '[Generation Goal]\nCreate one continuous image-to-video cinematic shot from the supplied storyboard frame. '+subject,
      '[Reference Roles]\n@Image 1 is the first frame. It defines the opening composition, visible identity, wardrobe, props, location, lighting, color, and screen direction. Preserve those elements; do not reinterpret @Image 1 as a collage or reference-sheet layout.\nIf additional reference images are attached, use only their explicitly assigned identity, wardrobe, prop, or location role. Never inherit an unrelated pose, camera angle, composition, text, or color grade.',
      '[Subject Profiles]\n'+subject+'\nDeclared props: '+(props.length?props.join(', '):'none')+'. Identity, clothing, prop ownership, scale, handedness, and anatomy remain unchanged.',
      '[Scene]\n'+(g.space||shotLocation(shot)||'the location shown in @Image 1')+'. Anchor: '+(g.anchor||'the primary action area')+' at '+(g.anchorPosition||'the position established in @Image 1')+'.\nLIGHT PLOT: '+lightPlanText(lightPlan,shot),
      '[Stage 1]\nInitial state: hold the exact first-frame composition for a clean readable opening.\nPrimary event: '+action+'. Only one primary state change occurs.\nEnd state: '+endState+'. The result must be visibly complete and stable before the shot ends.',
      '[Camera]\n'+seedanceCamera(shot,state),
      '[Visual Treatment]\n'+visual+'\nMotion remains physically plausible: real weight, gravity, contact, inertia, fabric response, shadows, reflections, and natural micro-movement.',
      '[Audio]\n'+seedanceAudio(shot),
      '[Maintain Consistency]\nPreserve the same face, body, hair, wardrobe, props, architecture, light direction, color logic, and screen axis throughout. No extra person, duplicate subject, face morph, costume change, prop duplication, invented readable text, graphic overlay, flicker, or anatomy error.'+(negative?'\nProject exclusions: '+negative:'' )+'\nNever render a reference sheet or duplicate a subject.'
    ].join('\n\n');
  }
  function appendLog(state,entry){state.logs.push(Object.assign({time:now(),projectKey:projectKey()},entry));if(state.logs.length>500)state.logs=state.logs.slice(-500);}
  function costValue(result){var r=result||{},c=r.costUsd!=null?r.costUsd:(r.cost_usd!=null?r.cost_usd:(r.cost!=null?r.cost:(r.usage&&r.usage.cost!=null?r.usage.cost:'')));if(c==null||c==='')return '';var n=Number(c);return Number.isFinite(n)?'$'+n.toFixed(4):String(c);}
  function beforeGenerate(shot,opts){
    var state=load(), report=strictAnalyze(shot,state),provider=opts&&opts.provider||'default';
    if(!report.ok){appendLog(state,{event:'blocked',shotId:shot.id,provider:provider,result:report.errors[0],issues:report.errors});try{localStorage.setItem(STORE_PREFIX+projectKey(),JSON.stringify(state));}catch(e){}openShot(shot.id);toast('본편 생성 차단 · '+shot.id+' · '+report.errors[0],'bad');render();return {ok:false,error:report.errors.join(' / ')};}
    appendLog(state,{event:'attempt',shotId:shot.id,provider:provider,model:opts&&opts.model||'',version:report.attempts+1,issues:report.warnings});try{localStorage.setItem(STORE_PREFIX+projectKey(),JSON.stringify(state));}catch(e){}
    if(state.mode==='preview'&&report.warnings.length)toast('프리비즈 권고 · '+shot.id+' · '+report.warnings[0],'warn');
    return {ok:true,report:report};
  }
  function beforeBatch(batchShots){var state=load();if(state.mode!=='production')return {ok:true};var bad=(batchShots||[]).map(function(s){return {shot:s,report:strictAnalyze(s,state)};}).filter(function(x){return !x.report.ok;});if(!bad.length)return {ok:true};openBatch(bad);return {ok:false,error:'엄격 본편 관문 미통과 '+bad.length+'쇼트'};}
  function afterGenerate(shot,result){mutate(function(state){var id=shot&&shot.id||'',regen=!!regenerationBusy[id];if(result&&result.ok&&id){delete state.faceAudits[id];delete state.regenerationPrompts[id];}appendLog(state,{event:result&&result.ok?(regen?'ai-director-regeneration':'success'):'failure',shotId:id,result:result&&result.error||'',provider:result&&result.provider||'',model:result&&result.model||'',cost:costValue(result),jobId:result&&result.jobId||''});});}
  function parseJsonObject(value){var text=String(value||'').replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim(),start=text.indexOf('{'),end=text.lastIndexOf('}');if(start<0||end<=start)throw new Error('얼굴 검사 JSON을 읽지 못했습니다.');return JSON.parse(text.slice(start,end+1));}
  function selectFaceAuthorities(shot,refs){var names=exactPeople(shot).names,picked=[],used=[];names.forEach(function(name,i){var lower=String(name).toLowerCase(),ref=refs.find(function(r){return used.indexOf(r)===-1&&String(r.label||'').toLowerCase().indexOf(lower)!==-1;})||refs.find(function(r){return used.indexOf(r)===-1;})||null;if(ref){used.push(ref);picked.push({name:name,ref:ref});}});return picked;}
  function faceAuditPrompt(name,label){return [
    'You are the strict facial-identity QC system for a film pipeline. Return JSON only.',
    'Image 1 is the sole approved facial identity authority for '+name+' ('+label+'). Image 2 is the newly generated storyboard frame.',
    'First decide whether the same declared character has a sufficiently visible face in Image 2. If the face is under about 80 pixels tall, heavily occluded, motion-blurred, or only an incompatible extreme profile, set status to unavailable and do not guess.',
    'Ignore expression, pose, lens perspective, lighting, makeup, and temporary hair motion unless they alter identity structure. Do not reward beauty or polish.',
    'Score structural identity out of 100: eyes/spacing/eyelids 20; nose/bridge/nostrils 15; mouth/philtrum 15; jaw/chin/cheeks 20; forehead/hairline/ears 15; apparent age/skin landmarks/natural asymmetry 15.',
    'Passing requires 90 or above. 80–89 is hold. Below 80 is fail. One obvious actor replacement, beautification, age shift, face averaging, or eye/jaw redesign must score below 80.',
    'JSON schema exactly: {"score":0,"status":"pass|hold|fail|unavailable","visibility":"clear|small|occluded|profile|absent","confidence":0,"mismatches":["specific structural mismatch"],"summary":"one concise Korean sentence"}'
  ].join('\n');}
  function buildRegenerationPrompt(shot,state,report){
    state=state||load();report=report||strictAnalyze(shot,state);var audit=report.faceAudit||currentFaceAudit(state,shot),corrections=[];
    if(audit&&Array.isArray(audit.characters))audit.characters.forEach(function(c){if(c.status!=='pass'||Number(c.score||0)<90){corrections.push(String(c.label||'인물')+' 얼굴 '+Number(c.score||0)+'점: '+((c.mismatches||[]).join('; ')||c.summary||'승인 원본 얼굴 구조로 복원'));}});
    report.errors.concat(report.warnings).forEach(function(x){if(corrections.length<8&&corrections.indexOf(x)===-1)corrections.push(String(x).replace(/ \((?:엄격 본편 검사|본편 모드에서 차단)\)$/,''));});
    if(!corrections.length)corrections.push('승인된 얼굴·의상·공간·소품 정체성을 더 정확히 고정하고 현재 샷의 물리 행동을 유지한다.');
    return [
      'AI DIRECTOR REGENERATION OVERRIDE — THIS CORRECTION HAS HIGHEST PRIORITY',
      'Regenerate SHOT '+shot.id+' as one replacement frame. Preserve the declared story beat, location geometry, camera side, lens, framing, wardrobe, props, light plot, and screen direction. Do not invent a new pose, composition, character, text, or event.',
      'FACE IDENTITY IS THE PRIMARY ACCEPTANCE TARGET. Each approved FACE reference is the sole authority for that named person. Reconstruct the same eye spacing and eyelids, nose bridge and nostrils, philtrum and mouth, jaw/chin/cheeks, forehead/hairline/ears, apparent age, skin landmarks, and natural asymmetry. Never average faces, beautify, make younger, enlarge eyes, sharpen the jaw, smooth skin, or substitute a similar actor.',
      'CORRECT ONLY THESE FAILED POINTS:',
      corrections.map(function(x,i){return (i+1)+'. '+x;}).join('\n'),
      'Keep expression and subtext observable through breath, exact eyeline, jaw/lip tension, hand task, posture, distance, and reaction timing without changing facial bone structure.',
      'Deliver one clean '+formatOf(state)+' cinematic storyboard frame. No collage, contact sheet, split screen, caption, logo, watermark, or explanation.'
    ].join('\n\n');
  }
  async function runFaceAudit(id){
    if(faceAuditBusy[id])return;var shot=selectedShotFrom(id),origin=projectKey(),frame=generatedFrame(shot),refs=faceRefsForShot(shot);if(!shot||!frame){toast('먼저 이 쇼트의 이미지를 생성하세요.','warn');return;}if(!faceVisibleInShot(shot)){toast('이 쇼트는 얼굴 비노출 컷으로 검사 대상이 아닙니다.','warn');return;}if(!refs.length){toast('승인된 FACE 레퍼런스가 없어 비교할 수 없습니다.','bad');return;}if(typeof callLLM!=='function'){toast('파이프라인 비전 LLM 연결을 찾지 못했습니다.','bad');return;}
    var authorities=selectFaceAuthorities(shot,refs);if(!authorities.length){toast('등장인물과 연결된 얼굴 원본을 찾지 못했습니다.','bad');return;}faceAuditBusy[id]=true;openShot(id);await new Promise(function(resolve){setTimeout(resolve,0);});
    try{
      var auditFrame=await prepareFaceAuditImage(frame),characters=[];for(var i=0;i<authorities.length;i++){var a=authorities[i],auditRef=await prepareFaceAuditImage(a.ref),out=await callLLM({images:[{b64:auditRef.b64,mime:auditRef.mime,_type:'face',_label:'APPROVED FACE AUTHORITY — '+a.name},{b64:auditFrame.b64,mime:auditFrame.mime,_type:'generated',_label:'GENERATED STORYBOARD FRAME'}],prompt:faceAuditPrompt(a.name,a.ref.label)}),parsed=parseJsonObject(out&&out.textOut||''),status=String(parsed.status||'unavailable').toLowerCase(),score=Math.max(0,Math.min(100,Number(parsed.score||0)));if(['pass','hold','fail','unavailable'].indexOf(status)===-1)status='unavailable';if(status!=='unavailable')status=score>=90?'pass':(score>=80?'hold':'fail');characters.push({label:a.name,authority:a.ref.label,score:score,status:status,visibility:String(parsed.visibility||''),confidence:Math.max(0,Math.min(100,Number(parsed.confidence||0))),mismatches:Array.isArray(parsed.mismatches)?parsed.mismatches.slice(0,8).map(String):[],summary:String(parsed.summary||'')});}
      if(projectKey()!==origin||frameSignature(generatedFrame(shot))!==frameSignature(frame)){toast('프로젝트 또는 생성 프레임이 바뀌어 검사 결과를 저장하지 않았습니다.','warn');return;}
      var scorable=characters.filter(function(c){return c.status!=='unavailable';}),score=scorable.length?Math.min.apply(null,scorable.map(function(c){return c.score;})):0,status=!scorable.length?'unavailable':(score>=90?'pass':(score>=80?'hold':'fail')),audit={signature:frameSignature(frame),score:score,status:status,characters:characters,findings:characters.reduce(function(all,c){return all.concat(c.mismatches.map(function(x){return c.label+': '+x;}));},[]),time:now(),provider:'pipeline-vision'};
      var state=load();state.faceAudits[id]=audit;var report=strictAnalyze(shot,state);state.regenerationPrompts[id]=buildRegenerationPrompt(shot,state,report);appendLog(state,{event:'face-identity-audit',shotId:id,result:'FACE '+score+' · '+status,note:audit.findings[0]||''});save(state);toast(status==='pass'?'얼굴 일치도 통과 · '+score+'점':'얼굴 일치도 '+score+'점 · 재생성 프롬프트를 만들었습니다.',status==='pass'?'':'bad');
    }catch(e){toast('얼굴 정밀 검사 실패 · '+String(e&&e.message||e),'bad');}finally{delete faceAuditBusy[id];if(projectKey()===origin)openShot(id);}
  }
  async function regenerateFromAudit(id){
    if(regenerationBusy[id])return;var shot=selectedShotFrom(id),frame=generatedFrame(shot);if(!shot||!frame){toast('재생성할 기존 프레임이 없습니다.','warn');return;}var state=load(),report=strictAnalyze(shot,state),prompt=state.regenerationPrompts[id]||buildRegenerationPrompt(shot,state,report);state.regenerationPrompts[id]=prompt;appendLog(state,{event:'ai-director-regeneration-request',shotId:id,result:report.faceScore!=null?'FACE '+report.faceScore+' 교정':'엄격 검사 실패 항목 교정'});save(state);regenerationBusy[id]=prompt;openShot(id);
    try{if(typeof generateSBShot!=='function')throw new Error('스토리보드 생성 함수를 찾지 못했습니다.');toast('AI 감독 교정 프롬프트로 바로 재생성합니다.');var result=await generateSBShot(id,null,{provider:'default',directorRegeneration:true});if(result&&result.ok)toast('재생성 완료 · 새 얼굴 정밀 검수가 필요합니다.');else throw new Error(result&&result.error||'재생성 결과가 없습니다.');}catch(e){toast('AI 감독 재생성 실패 · '+String(e&&e.message||e),'bad');}finally{delete regenerationBusy[id];openShot(id);}
  }
  function stripDirectorLayer(value){var text=String(value||''),start=text.indexOf(PROMPT_BEGIN),end=text.indexOf(PROMPT_END),compat='PROJECT CANON COMPATIBILITY — subordinate to the 15 blocks above';if(start!==-1&&end>start){text=(text.slice(0,start)+text.slice(end+PROMPT_END.length)).trim();if(text.indexOf(compat)===0)text=text.slice(compat.length).trim();return text;}if(/(?:LOVE IMAGE|CLOUDRIDER 2\.5D|DIRECTOR V3) DIRECTOR CONTROL LAYER — HIGHEST PRIORITY/.test(text)){var legacyAt=text.indexOf(compat);if(legacyAt!==-1)return text.slice(legacyAt+compat.length).trim();}return text;}
  function composeImagePrompt(shot,legacy){var state=load(),alwaysDirected=isLoveProject()||isCloudRiderProject(),base=stripDirectorLayer(legacy),correction=shot&&regenerationBusy[shot.id]||'';if(state.mode!=='production'&&!alwaysDirected&&!correction)return base;return PROMPT_BEGIN+'\n'+(isLoveProject()?'LOVE IMAGE DIRECTOR CONTROL LAYER — HIGHEST PRIORITY':isCloudRiderProject()?'CLOUDRIDER 2.5D DIRECTOR CONTROL LAYER — HIGHEST PRIORITY':'DIRECTOR V3 CONTROL LAYER — HIGHEST PRIORITY')+'\n\n'+buildPrompt(shot,state)+(correction?'\n\n'+correction:'')+'\n'+PROMPT_END+'\n\nPROJECT CANON COMPATIBILITY — subordinate to the 15 blocks above\n'+base;}
  function composeVideoPrompt(shot,legacy){return String(legacy||'');}
  function lockStatus(state,key){var m=ASSET_META[key],v=state.assets[key];return !!(v.locked&&Number(v.evidence)>=m.need);}
  function assetStatus(state,key){var v=state.assets[key],ok=lockStatus(state,key);if(ok)return {label:'LOCK',cls:'locked'};if(v.locked||Number(v.evidence)>0)return {label:'테스트중',cls:'testing'};return {label:'미승인',cls:'pending'};}
  function setMode(mode){mutate(function(s){s.mode=mode==='production'?'production':'preview';appendLog(s,{event:'change',result:'운용 모드 → '+s.mode});});toast(mode==='production'?'본편 모드: 관문을 통과한 쇼트만 생성됩니다.':'프리비즈 모드: 기존 생성은 유지되고 문제를 권고합니다.');}
  function setTab(tab){mutate(function(s){s.activeTab=tab;});}
  function setExpert(open){mutate(function(s){s.expertOpen=!!open;});}
  function autoStyle(p){var q=[projectVisualCanon(null),String(p.quality||'').trim()].filter(Boolean).join(' ')||'naturalistic photorealistic live action';return [
    'Style: '+q,
    'Cinematography: story-motivated coverage with one clear visual event per shot',
    'Lighting: one motivated practical or natural source with consistent shadow direction',
    'Color: project palette remains stable; natural skin is protected',
    'Camera: physical cine optics; one declared movement and one stable end frame',
    'Skin: pore-level living skin, wet eyes, no structural beautification',
    'Acting: emotion is expressed through breath, gaze, posture, hands, and muscle change',
    'Physics: gravity, inertia, contact, anatomy, fabric weight, and prop ownership remain real',
    'Composition: readable geography, clear subject hierarchy, and intentional negative space',
    'Continuity: identity, wardrobe, props, screen direction, and architecture remain locked',
    'Technical: stable faces and hands; no flicker, duplication, morphing, or invented text',
    'Audio: diegetic sound and exact scripted dialogue only; no invented voice or subtitle'
  ].join('\n');}
  function autoDistance(shot){var f=String(shot&&shot.frame||'');if(/ECU|macro|매크로|극근접/i.test(f))return '0.4';if(/CU|close|클로즈/i.test(f))return '1';if(/WS|wide|와이드|전경/i.test(f))return '5';return '2.5';}
  function autoDirector(){mutate(function(s){var p=project()||{};s.setup.format=p.defaultRatio||s.setup.format||'16:9';if(!String(s.setup.world||'').trim())s.setup.world=String(p.desc||p.name||'').trim()||'현재 프로젝트의 현실적 물리 법칙과 승인된 시각 세계를 유지한다.';if(!styleStatus(s.setup.stylePrefix).complete)s.setup.stylePrefix=autoStyle(p);sceneEntries().forEach(function(entry){var old=s.scenes[entry.key]||{},shot=entry.shot||{},props=propList(shot);s.scenes[entry.key]={space:old.space||entry.loc||'storyboard location',material:old.material||'approved location geometry and practical materials',anchor:old.anchor||props[0]||'primary action area',anchorPosition:old.anchorPosition||'CENTER',origin:old.origin||'primary action area',distance:old.distance||autoDistance(shot),entry:old.entry||'fixed by the approved location reference',axis:old.axis||'camera side established by the first storyboard shot',light:old.light||shot.light||'one motivated source matching the storyboard'};});s.selectedShot=s.selectedShot||(shots()[0]&&shots()[0].id||'');appendLog(s,{event:'change',result:'AI 감독 자동 준비 · 설정·장소·이미지 프롬프트 준비'});});toast('자동 준비 완료 · 에셋 최종 승인만 직접 확인하세요.');}
  function updateSetup(){mutate(function(s){s.setup.format=document.getElementById('zv3Format').value;s.setup.world=document.getElementById('zv3World').value.trim();s.setup.stylePrefix=document.getElementById('zv3Style').value.trim();s.setup.notes=document.getElementById('zv3Notes').value.trim();appendLog(s,{event:'change',result:'DIRECTOR SETUP 수정 · '+s.setup.format});});toast('Director Setup 저장 완료');}
  function saveCanon(){var node=document.getElementById('zv3Canon');mutate(function(s){s.canon=String(node&&node.value||'').trim();appendLog(s,{event:'change',result:'AI 감독 프로젝트 헌법 저장'});});toast('프로젝트 헌법을 저장했습니다.');}
  function directorSnapshot(state){
    var p=project()||{},r=readiness(state),selected=selectedShotFrom(state.selectedShot),recent=(state.logs||[]).slice(-20).map(function(l){return [l.shotId,l.event,l.result||l.note||'',l.cost||''].filter(Boolean).join(' · ');});
    return [
      'PROJECT: '+(p.name||projectKey())+' ('+projectKey()+')',
      'FORMAT: '+formatOf(state)+' / MODE: '+state.mode,
      'WORLD: '+String(state.setup.world||'미정'),
      'PROJECT CANON: '+String(state.canon||'미정'),
      'READY: setup '+r.setup+', assets '+r.assets+'/5, geo '+r.geo+'/'+r.totalGeo+', storyboard '+r.shots+' shots',
      'SELECTED SHOT: '+(selected?[selected.id,selected.frame,selected.desc,selected.func].filter(Boolean).join(' · '):'없음'),
      'PROJECT VISUAL CONSTITUTION: '+projectVisualCanon(selected),
      'RECENT LOG:\n'+(recent.join('\n')||'없음')
    ].join('\n');
  }
  function assistantPrompt(question,state){return [
    'You are STUDIO ZIPPY AI CINEMA DIRECTOR embedded in the production pipeline. Answer in concise, practical Korean.',
    'Do not invent facts that are absent from the snapshot. Clearly label assumptions. Give the next executable action first.',
    'DIRECTING PROTOCOL:',
    '1. DIRECTOR SETUP locks format, world, and the 12-part style prefix before shot work.',
    '2. ASSET LOCK accepts character and location only after 10/10 stress validation; one primary face authority per character, one exact wardrobe variant per shot.',
    '3. SCENE GEO locks spatial anchor, distance, entry boundary, 180-degree camera side, and one motivated light origin.',
    '4. STORYBOARD IMAGE PROMPT uses the complete 15-block contract. Fix only the failed block; do not rewrite unrelated blocks.',
    '5. CAMERA direction declares Movement, Speed, Framing, and End. Recommend the lowest-risk substitute when format or identity continuity is threatened.',
    '6. SEEDANCE planning may combine multiple scenes up to 30 seconds. Stage reference images by scene and attach only the roles needed at that moment.',
    '7. Emotion is not an adjective. Express objective, obstacle, tactic, beat change, and subtext as 2–4 observable cues in breath, eyeline, jaw/lips, hand task, posture, distance, and reaction timing.',
    '8. QC reviews nine frames and the seven physics laws. Re-roll one failed block; at v10 warn and propose simplification; at v15 redesign or split the shot.',
    '9. Film and style references supply visual grammar only. Never copy protected people, characters, logos, titles, text, or exact compositions.',
    '10. Every recommendation records the one-line change, expected cost impact, and why an option should be adopted or rejected.',
    '',
    directorSnapshot(state),
    '',
    'DIRECTOR QUESTION: '+String(question||'현재 프로젝트에서 가장 위험한 연속성 문제와 바로 할 일을 알려줘.')
  ].join('\n');}
  async function runAssistant(){
    if(assistantBusy)return;var q=document.getElementById('zv3AssistantQuestion'),question=String(q&&q.value||'').trim();if(!question){toast('AI 감독에게 물어볼 내용을 입력하세요.','warn');return;}
    var origin=projectKey(),state=load(),btn=document.getElementById('zv3AssistantRun');assistantBusy=true;if(btn){btn.disabled=true;btn.textContent='AI 감독 분석 중...';}toast('현재 프로젝트와 로그를 읽고 있습니다.');
    try{
      if(typeof callLLM!=='function')throw new Error('파이프라인 LLM 연결을 찾지 못했습니다.');
      var out=await callLLM({images:[],prompt:assistantPrompt(question,state)}),answer=String(out&&out.textOut||'').trim();if(!answer)throw new Error('AI 감독 답변이 비어 있습니다.');if(projectKey()!==origin){toast('프로젝트가 바뀌어 답변을 저장하지 않았습니다.','warn');return;}
      mutate(function(s){s.assistant.messages=(s.assistant.messages||[]).concat([{time:now(),question:question,answer:answer}]).slice(-20);s.assistant.last=answer;appendLog(s,{event:'director-advice',result:question.slice(0,120),provider:'pipeline-llm',cost:'provider-metered'});});
      toast('AI 감독 분석 완료','ok');
    }catch(e){toast('AI 감독 실패 · '+(e&&e.message?e.message:e),'bad');}
    finally{assistantBusy=false;var current=document.getElementById('zv3AssistantRun');if(current){current.disabled=false;current.textContent='AI 감독에게 묻기';}}
  }
  function copyAssistant(){var text=String(load().assistant.last||'');if(!text){toast('복사할 답변이 없습니다.','warn');return;}if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text);toast('AI 감독 답변을 복사했습니다.','ok');}
  function clearAssistant(){mutate(function(s){s.assistant={messages:[],last:''};appendLog(s,{event:'change',result:'AI 감독 대화 기록 삭제'});});toast('AI 감독 대화를 비웠습니다.');}
  function updateAsset(key,field,value){mutate(function(s){if(field==='locked')s.assets[key].locked=!!value;else s.assets[key].evidence=Math.max(0,Math.min(10,Number(value)||0));appendLog(s,{event:'change',result:'ASSET '+key+' · '+(s.assets[key].locked?'락':'미승인')+' · 증빙 '+s.assets[key].evidence+'/10'});});}
  function selectScene(key){mutate(function(s){s.selectedScene=key;});}
  function saveGeo(){var key=document.getElementById('zv3SceneSelect').value;mutate(function(s){s.selectedScene=key;s.scenes[key]={space:document.getElementById('zv3GeoSpace').value.trim(),material:document.getElementById('zv3GeoMaterial').value.trim(),anchor:document.getElementById('zv3GeoAnchor').value.trim(),anchorPosition:document.getElementById('zv3GeoPosition').value,origin:document.getElementById('zv3GeoOrigin').value.trim(),distance:document.getElementById('zv3GeoDistance').value.trim(),entry:document.getElementById('zv3GeoEntry').value.trim(),axis:document.getElementById('zv3GeoAxis').value.trim(),light:document.getElementById('zv3GeoLight').value.trim()};appendLog(s,{event:'change',result:'SCENE GEO 수정 · '+key});});toast('씬 GEO 저장 완료');}
  function lpOptions(values,selected){return values.map(function(v){return '<option value="'+attr(v)+'" '+(v===selected?'selected':'')+'>'+esc(v)+'</option>';}).join('');}
  function openLightPlot(id){
    var shot=selectedShotFrom(id);if(!shot)return;var state=load(),plan=shotLightPlan(state,shot),hasOverride=!!(state.shotLights&&state.shotLights[id]);plan=Object.assign({light:shot.light||'one motivated practical or natural source',lightAzimuth:'45° camera left',lightHeight:'above eyeline',lightTemp:'scene-motivated color temperature',lightIntensity:'100% key, restrained highlights',lightDiffusion:'soft gradual wrap',fillRatio:'passive bounce at 15% · about 6:1',backgroundExposure:'separated below subject',atmosphere:'clean air'},plan);
    var body='<div class="zv3-grid"><div class="zv3-card"><h4>STORYBOARD LIGHT PLOT</h4><p>씬 GEO 광원을 상속한 뒤 이 쇼트에서만 필요한 값을 덮어씁니다. 키라이트는 하나의 동기화된 원천이며 Fill은 같은 환경의 수동 반사광으로만 취급합니다.</p><label class="zv3-label">동기화된 주광원</label><textarea id="zv3LpSource" class="zv3-textarea" placeholder="예: frame-right classroom window daylight">'+esc(plan.light||shot.light||'one motivated practical or natural source')+'</textarea><div class="zv3-grid three"><div><label class="zv3-label">수평 각도</label><select id="zv3LpAzimuth" class="zv3-select">'+lpOptions(['90° camera left','45° camera left','15° camera left','front','15° camera right','45° camera right','90° camera right','back / rim'],plan.lightAzimuth||'45° camera left')+'</select></div><div><label class="zv3-label">높이</label><select id="zv3LpHeight" class="zv3-select">'+lpOptions(['above eyeline','eye level','below eyeline'],plan.lightHeight||'above eyeline')+'</select></div><div><label class="zv3-label">색온도</label><input id="zv3LpTemp" class="zv3-input" value="'+attr(plan.lightTemp||'5600K daylight-balanced')+'"></div></div><div class="zv3-grid three"><div><label class="zv3-label">세기·노출</label><input id="zv3LpIntensity" class="zv3-input" value="'+attr(plan.lightIntensity||'100% key, restrained highlights')+'"></div><div><label class="zv3-label">확산</label><select id="zv3LpDiffusion" class="zv3-select">'+lpOptions(['hard defined edge','semi-diffused','soft gradual wrap','very soft broad source'],plan.lightDiffusion||'soft gradual wrap')+'</select></div><div><label class="zv3-label">Fill 비율</label><input id="zv3LpFill" class="zv3-input" value="'+attr(plan.fillRatio||'passive bounce at 15% · about 6:1')+'"></div></div><div class="zv3-grid"><div><label class="zv3-label">배경 노출</label><select id="zv3LpBackground" class="zv3-select">'+lpOptions(['near black','dark with detail','separated below subject','even and readable'],plan.backgroundExposure||'separated below subject')+'</select></div><div><label class="zv3-label">대기</label><select id="zv3LpAtmosphere" class="zv3-select">'+lpOptions(['clean air','light haze','smoke','controlled flare','wet reflective air'],plan.atmosphere||'clean air')+'</select></div></div></div><div class="zv3-card"><h4>생성 프롬프트 반영값</h4><div class="zv3-code" style="min-height:260px">'+esc(lightPlanText(plan,shot))+'</div><p>카메라 렌즈·프레이밍·무브는 Camera Director가 관리합니다. 기존 바리에이션의 Relight 2.0은 생성 후 보정에만 사용합니다.</p></div></div><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.saveLightPlot(\''+js(id)+'\')">이 쇼트 LIGHT PLOT 저장</button>'+(hasOverride?'<button class="zv3-btn" onclick="ZippyDirectorV3.resetLightPlot(\''+js(id)+'\')">씬 기본광으로 되돌리기</button>':'')+'<a class="zv3-btn" href="https://lightplot.lisaparkstudio22.workers.dev/" target="_blank" rel="noopener noreferrer">Lightplot 참고 열기</a></div>';
    modal('LIGHT PLOT · '+id,body);var modalEl=document.getElementById('zv3Modal');if(modalEl)modalEl.querySelectorAll('input,textarea,select').forEach(function(node){node.addEventListener('input',function(){refreshLightPlotPreview(shot);});node.addEventListener('change',function(){refreshLightPlotPreview(shot);});});refreshLightPlotPreview(shot);
  }
  function readLightPlotForm(){return {light:document.getElementById('zv3LpSource').value.trim(),lightAzimuth:document.getElementById('zv3LpAzimuth').value,lightHeight:document.getElementById('zv3LpHeight').value,lightTemp:document.getElementById('zv3LpTemp').value.trim(),lightIntensity:document.getElementById('zv3LpIntensity').value.trim(),lightDiffusion:document.getElementById('zv3LpDiffusion').value,fillRatio:document.getElementById('zv3LpFill').value.trim(),backgroundExposure:document.getElementById('zv3LpBackground').value,atmosphere:document.getElementById('zv3LpAtmosphere').value};}
  function refreshLightPlotPreview(shot){var node=document.querySelector('#zv3Modal .zv3-code');if(node)node.textContent=lightPlanText(readLightPlotForm(),shot);}
  function saveLightPlot(id){
    var shot=selectedShotFrom(id);if(!shot)return;var value=readLightPlotForm();mutate(function(s){s.shotLights[id]=value;appendLog(s,{event:'light-plot',shotId:id,result:[value.lightAzimuth,value.lightHeight,value.lightTemp,value.fillRatio].join(' · ')});});closeModal();if(typeof window.buildStoryboardTimeline==='function')window.buildStoryboardTimeline();toast('LIGHT PLOT 저장 · 이미지와 Seedance에 연결됨','ok');
  }
  function resetLightPlot(id){mutate(function(s){delete s.shotLights[id];appendLog(s,{event:'light-plot',shotId:id,result:'쇼트 오버라이드 삭제 · 씬 GEO 광원 상속'});});closeModal();if(typeof window.buildStoryboardTimeline==='function')window.buildStoryboardTimeline();toast('씬 기본광으로 되돌렸습니다.');}
  function selectedShotFrom(id){return shots().find(function(s){return s.id===id;})||shots()[0]||null;}
  function selectPromptShot(id){mutate(function(s){s.selectedShot=id;});}
  function saveQc(){var id=document.getElementById('zv3QcShot').value, shot=selectedShotFrom(id);if(!shot)return;var keys=QC_KEYS.concat(isCloudRiderProject()?CLOUD_QC_KEYS:[]),checks={};keys.forEach(function(k){var el=document.getElementById('zv3Qc-'+k[0]);checks[k[0]]=!!(el&&el.checked);});var decision=document.getElementById('zv3QcDecision').value,note=document.getElementById('zv3QcNote').value.trim(),frames=Math.max(0,Math.min(9,Number(document.getElementById('zv3QcFrames').value)||0)),failed=keys.filter(function(k){return !checks[k[0]];});if(decision==='pass'&&(frames<9||failed.length)){decision='hold';note=('자동 보류: '+(frames<9?'9프레임 검토 미완료. ':'')+(failed.length?'물리·스타일 체크 미완료 — '+failed.map(function(k){return k[1];}).join(', ')+'. ':'')+note).trim();}mutate(function(s){s.selectedShot=id;s.qc[id]={checks:checks,framesReviewed:frames,decision:decision,note:note,time:now()};appendLog(s,{event:'qc',shotId:id,result:decision,note:note,failed:failed.map(function(k){return k[1];})});});toast('QC 판정 저장 · '+id+(decision==='hold'?' · 보류':'') ,decision==='hold'?'warn':'');}
  function readiness(state){var scenes=sceneEntries(),geo=scenes.filter(function(x){return geoComplete(state.scenes[x.key]);}).length,locked=Object.keys(ASSET_META).filter(function(k){return lockStatus(state,k);}).length,setup=!!String(state.setup.world||'').trim()&&styleStatus(state.setup.stylePrefix).complete;return {setup:setup,geo:geo,totalGeo:scenes.length,assets:locked,shots:shots().length,ready:setup&&geo===scenes.length&&locked===5};}
  function renderHeader(state){var r=readiness(state);return '<div class="zv3-head"><div><div class="zv3-kicker">AI DIRECTOR</div><div class="zv3-title">AI 감독 준비</div><div class="zv3-sub">프로젝트를 읽고 이미지 생성과 본편 제작에 필요한 설정을 자동으로 정리합니다. Seedance는 독립 프롬프트 탭에서 구성합니다.</div></div><div class="zv3-mode"><button class="'+(state.mode==='preview'?'on':'')+'" onclick="ZippyDirectorV3.setMode(\'preview\')">연습 생성</button><button class="production '+(state.mode==='production'?'on':'')+'" onclick="ZippyDirectorV3.setMode(\'production\')">본편 생성</button></div></div><div class="zv3-simple"><button class="zv3-auto" onclick="ZippyDirectorV3.autoDirector()">✨ 자동으로 준비하기</button><div class="zv3-ready-grid"><div class="'+(r.setup?'done':'need')+'"><b>'+(r.setup?'준비됨':'준비 필요')+'</b><span>작품 설정</span></div><div class="'+(r.geo===r.totalGeo?'done':'need')+'"><b>'+r.geo+' / '+r.totalGeo+'</b><span>장소 정리</span></div><div class="'+(r.shots?'done':'need')+'"><b>'+r.shots+'컷</b><span>스토리보드</span></div><div class="'+(r.assets===5?'done':'need')+'"><b>'+r.assets+' / 5</b><span>에셋 승인</span></div></div><div class="zv3-simple-result '+(r.ready?'ready':'check')+'">'+(r.ready?'✓ 본편 생성 가능':'에셋 승인 등 확인할 항목이 있습니다.')+'</div><button class="zv3-detail-toggle" onclick="ZippyDirectorV3.setExpert('+(!state.expertOpen)+')">'+(state.expertOpen?'상세 설정 닫기':'상세 설정 보기')+'</button></div>';
  }
  function renderTabs(state){var tabs=[['setup','1 · SETUP'],['assets','2 · ASSET LOCK'],['geo','3 · SCENE GEO'],['prompt','4 · IMAGE PROMPT'],['qc','5 · QC & LOG'],['assistant','6 · AI 감독']];return '<div class="zv3-tabs">'+tabs.map(function(t){return '<button class="'+(state.activeTab===t[0]?'on':'')+'" onclick="ZippyDirectorV3.setTab(\''+t[0]+'\')">'+t[1]+'</button>';}).join('')+'</div>';}
  function renderSetup(state){var style=styleStatus(state.setup.stylePrefix);return '<div class="zv3-grid"><div class="zv3-card"><h4>PROJECT CONSTITUTION</h4><label class="zv3-label">납품 포맷</label><select id="zv3Format" class="zv3-select"><option value="16:9" '+(formatOf(state)==='16:9'?'selected':'')+'>가로 16:9</option><option value="9:16" '+(formatOf(state)==='9:16'?'selected':'')+'>세로 9:16</option><option value="both" '+(formatOf(state)==='both'?'selected':'')+'>동시 납품 · 각각 생성</option></select><label class="zv3-label">세계관 한 문장</label><textarea id="zv3World" class="zv3-textarea" placeholder="이 작품의 물리 세계와 시각 문화를 한 문장으로">'+esc(state.setup.world)+'</textarea><label class="zv3-label">운용 메모</label><textarea id="zv3Notes" class="zv3-textarea" placeholder="종목 규칙·텍스트 합성·납품 주의사항">'+esc(state.setup.notes)+'</textarea></div><div class="zv3-card"><h4>STYLE PREFIX · 12항목 상수 <span class="zv3-status '+(style.complete?'locked':'testing')+'">'+style.count+'/12</span></h4><p>프로젝트 룩은 한 번 확정한 뒤 모든 쇼트에 토씨 그대로 사용합니다. Skin·Physics·Continuity·Audio 조항은 삭제하지 않습니다.</p><textarea id="zv3Style" class="zv3-textarea" style="min-height:230px" placeholder="Style: ...&#10;Cinematography: ...&#10;Lighting: ...&#10;Color: 60:30:10 ...&#10;Camera: Physical cine lens ...&#10;Skin: Pore-level realism ...&#10;Acting: ...&#10;Physics: Gravity and inertia respected ...&#10;Composition: ...&#10;Continuity: ...&#10;Technical: ...&#10;Audio: Environmental SFX only. No music.">'+esc(state.setup.stylePrefix)+'</textarea></div></div><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.updateSetup()">SETUP 저장</button></div>';}
  function assetRows(state){var inv=inventory();return Object.keys(ASSET_META).map(function(k){var m=ASSET_META[k],v=state.assets[k],ok=lockStatus(state,k),status=assetStatus(state,k);return '<div class="zv3-lock-row"><div><b>'+m.label+'</b><br><small>'+esc(m.desc)+'</small></div><small>등록 '+inv[k]+'개</small><span class="zv3-status '+status.cls+'">'+status.label+'</span><label class="zv3-check"><input type="checkbox" '+(v.locked?'checked':'')+' onchange="ZippyDirectorV3.updateAsset(\''+k+'\',\'locked\',this.checked)"> 감독 락</label><label class="zv3-check"><input class="zv3-input" style="width:58px;padding:5px" type="number" min="0" max="10" value="'+Number(v.evidence||0)+'" onchange="ZippyDirectorV3.updateAsset(\''+k+'\',\'evidence\',this.value)"> <span class="'+(ok?'zv3-ok':'zv3-warn')+'">/'+m.need+'</span></label></div>';}).join('');}
  function renderAssets(state){return '<div class="zv3-card"><h4>ASSET LOCK REGISTRY</h4><p>체크만으로 승인되지 않습니다. 캐릭터·로케이션은 스트레스 테스트 10/10이 함께 있어야 본편 관문을 통과합니다.</p>'+assetRows(state)+'</div>';}
  function renderAssetInline(state){var locked=Object.keys(ASSET_META).filter(function(k){return lockStatus(state,k);}).length;return '<section class="zv3-asset-inline compact"><div class="zv3-asset-inline-head"><div><b>에셋 최종 확인</b><small>인물·장소·소품·목소리·행동</small></div><span class="zv3-status '+(locked===5?'locked':'testing')+'">'+locked+' / 5 승인</span></div><p>'+(locked===5?'본편 생성에 사용할 기준 에셋이 승인되었습니다.':'자동 준비 후에도 최종 에셋 승인은 감독이 직접 확인합니다.')+'</p><div class="zv3-actions"><button class="zv3-btn" onclick="ZippyDirectorV3.focusDirectorTab(\'assets\')">에셋 승인 확인</button></div></section>';}
  function renderGeo(state){var entries=sceneEntries();var key=state.selectedScene&&entries.some(function(e){return e.key===state.selectedScene;})?state.selectedScene:(entries[0]&&entries[0].key||'');var entry=entries.find(function(e){return e.key===key;})||{},g=state.scenes[key]||{};return '<div class="zv3-grid"><div class="zv3-card"><h4>SCENE SELECT</h4><select id="zv3SceneSelect" class="zv3-select" onchange="ZippyDirectorV3.selectScene(this.value)">'+entries.map(function(e){return '<option value="'+attr(e.key)+'" '+(e.key===key?'selected':'')+'>'+esc(e.label)+(geoComplete(state.scenes[e.key])?' ✓':'')+'</option>';}).join('')+'</select><label class="zv3-label">공간 정의</label><input id="zv3GeoSpace" class="zv3-input" value="'+attr(g.space||entry.loc||'')+'"><label class="zv3-label">형태·재질·규모</label><input id="zv3GeoMaterial" class="zv3-input" value="'+attr(g.material||'')+'" placeholder="L-shaped concrete room, worn wood, 8m wide"><label class="zv3-label">앵커 오브젝트</label><input id="zv3GeoAnchor" class="zv3-input" value="'+attr(g.anchor||'')+'" placeholder="램프·문틀·기둥 등 하나"><div class="zv3-grid three"><div><label class="zv3-label">프레임 위치</label><select id="zv3GeoPosition" class="zv3-select">'+['frame-LEFT','CENTER-LEFT','CENTER','CENTER-RIGHT','frame-RIGHT'].map(function(v){return '<option '+(g.anchorPosition===v?'selected':'')+'>'+v+'</option>';}).join('')+'</select></div><div><label class="zv3-label">기준점</label><input id="zv3GeoOrigin" class="zv3-input" value="'+attr(g.origin||'primary action area')+'"></div><div><label class="zv3-label">거리 m</label><input id="zv3GeoDistance" class="zv3-input" value="'+attr(g.distance||'3')+'"></div></div></div><div class="zv3-card"><h4>AXIS · LIGHT</h4><label class="zv3-label">출입구·경계</label><input id="zv3GeoEntry" class="zv3-input" value="'+attr(g.entry||'')+'" placeholder="door at frame-LEFT, 8m from anchor"><label class="zv3-label">180° 축 — 카메라가 머무는 쪽</label><input id="zv3GeoAxis" class="zv3-input" value="'+attr(g.axis||'')+'" placeholder="door / court fence / corpse-field"><label class="zv3-label">단일 광원과 방향</label><textarea id="zv3GeoLight" class="zv3-textarea" placeholder="one soft window source from frame-RIGHT; shadow falls frame-LEFT">'+esc(g.light||'')+'</textarea><label class="zv3-label">생성될 GEO</label><div class="zv3-code" style="max-height:180px">'+esc(geoText(g,entry.shot||{}))+'</div></div></div><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.saveGeo()">이 씬 GEO 저장</button></div>';}
  function shotOptions(selected){return shots().map(function(s){return '<option value="'+attr(s.id)+'" '+(s.id===selected?'selected':'')+'>'+esc(s.id+' · '+(s.frame||s.desc||''))+'</option>';}).join('');}
  function cameraHtml(camera){var cls=camera.risk==='HIGH'?'pending':(camera.risk==='MEDIUM'?'testing':'locked');return '<p><b>CAMERA DIRECTOR · 57 MOVES</b><br><span class="zv3-status '+cls+'">'+esc(camera.risk)+'</span> '+esc(camera.id)+'<br><small>'+esc(camera.reason)+'</small><br><small>저위험 대체: '+esc(camera.alternative)+' · '+esc(camera.formatAlternative)+'</small></p>';}
  function renderPrompt(state){var shot=selectedShotFrom(state.selectedShot),id=shot&&shot.id||'';if(!shot)return '<div class="zv3-issue warning">스토리보드 쇼트가 없습니다.</div>';var report=strictAnalyze(shot,state);return '<div class="zv3-card"><h4>쇼트 선택</h4><select class="zv3-select" onchange="ZippyDirectorV3.selectPromptShot(this.value)">'+shotOptions(id)+'</select><div class="zv3-issues" style="margin-top:10px">'+issueHtml(report)+'</div><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.openShot(\''+js(id)+'\')">AI 감독 엄격 검사</button><button class="zv3-btn" onclick="ZippyDirectorV3.openLightPlot(\''+js(id)+'\')">💡 LIGHT PLOT</button><button class="zv3-btn" onclick="ZippyDirectorV3.openSeedance(\''+js(id)+'\')">Seedance 30초 구성으로 보내기</button></div></div><div class="zv3-card" style="margin-top:12px"><h4>스토리보드 이미지 프롬프트</h4><div class="zv3-code">'+esc(buildPrompt(shot,state))+'</div></div>';}
  function issueHtml(report){var html='',faceLabel=report.faceStatus==='excluded'?'제외':(report.faceStatus==='pre-generation'?'생성 전':(report.faceScore==null?'미검사':report.faceScore+'/100'));if(report.strictScore!=null)html+='<div class="zv3-strict-score '+(report.strictScore>=90?'pass':report.strictScore>=70?'warn':'fail')+'"><b>STRICT '+report.strictScore+' / 100</b><span>FACE '+faceLabel+' · 15블록 '+report.blockCount+' · 레퍼런스 '+report.refsChecked+' · LIGHT '+(report.lightLocked?'LOCK':'상속')+'</span></div>';if(!report.errors.length&&!report.warnings.length)html+='<div class="zv3-issue ok">엄격 감독 관문 통과 가능</div>';report.errors.forEach(function(x){html+='<div class="zv3-issue error">본편 차단 · '+esc(x)+'</div>';});report.warnings.forEach(function(x){html+='<div class="zv3-issue warning">'+esc(x)+'</div>';});report.notes.forEach(function(x){html+='<div class="zv3-issue">'+esc(x)+'</div>';});return html;}
  function qcChecksHtml(keys,q){return '<div class="zv3-qc">'+keys.map(function(k){return '<label><input id="zv3Qc-'+k[0]+'" type="checkbox" '+(q.checks&&q.checks[k[0]]?'checked':'')+'> '+k[1]+'</label>';}).join('')+'</div>';}
  function renderQc(state){var shot=selectedShotFrom(state.selectedShot),id=shot&&shot.id||'',q=state.qc[id]||{checks:{},framesReviewed:0,decision:'hold',note:''};var logs=state.logs.slice(-30).reverse(),cloudQc=isCloudRiderProject()?'<label class="zv3-label">CloudRider 2.5D 헌법 5항</label>'+qcChecksHtml(CLOUD_QC_KEYS,q):'';return '<div class="zv3-grid"><div class="zv3-card"><h4>VISUAL CONSTITUTION · SHOT QC</h4><select id="zv3QcShot" class="zv3-select" onchange="ZippyDirectorV3.selectPromptShot(this.value)">'+shotOptions(id)+'</select><label class="zv3-label">9프레임 QC · 검토 완료 수</label><input id="zv3QcFrames" class="zv3-input" type="number" min="0" max="9" value="'+Number(q.framesReviewed||0)+'"><label class="zv3-label">물리 헌법 7항</label>'+qcChecksHtml(PHYSICS_KEYS,q)+'<label class="zv3-label">연속성 보조 3항</label>'+qcChecksHtml(CONTINUITY_KEYS,q)+cloudQc+'<label class="zv3-label">판정</label><select id="zv3QcDecision" class="zv3-select"><option value="hold" '+(q.decision==='hold'?'selected':'')+'>보류</option><option value="pass" '+(q.decision==='pass'?'selected':'')+'>채택</option><option value="fail" '+(q.decision==='fail'?'selected':'')+'>폐기·리테이크</option></select><label class="zv3-label">판정 사유 · 헌법 위반</label><textarea id="zv3QcNote" class="zv3-textarea" placeholder="별로였음 금지 · 예: 4항 동작 폼 — 토스가 앞으로 기울어짐">'+esc(q.note||'')+'</textarea><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.saveQc()">QC 저장</button></div></div><div class="zv3-card"><h4>PRODUCTION LOG · 최근 30건</h4><div style="overflow:auto;max-height:460px"><table class="zv3-log"><thead><tr><th>시각</th><th>쇼트</th><th>이벤트</th><th>모델·비용</th><th>판정·사유</th></tr></thead><tbody>'+logs.map(function(l){return '<tr><td>'+esc(String(l.time||'').slice(5,16).replace('T',' '))+'</td><td>'+esc(l.shotId||'')+(l.version?' v'+l.version:'')+'</td><td>'+esc(l.event||'')+'</td><td>'+esc([l.provider,l.model,l.cost].filter(Boolean).join(' · ')||'-')+'</td><td>'+esc(l.result||l.note||(l.issues&&l.issues[0])||'')+'</td></tr>';}).join('')+'</tbody></table></div></div></div>';}
  function renderAssistant(state){var last=String(state.assistant&&state.assistant.last||'');return '<div class="zv3-grid"><div class="zv3-card"><h4>PROJECT CANON MEMORY</h4><p>이 프로젝트에서 절대 바뀌면 안 되는 이야기·연출·금지 규칙을 저장합니다. 저장 즉시 이미지와 Seedance 프롬프트에 합쳐집니다.</p><textarea id="zv3Canon" class="zv3-textarea" style="min-height:210px" placeholder="예: 주인공의 감정은 대사보다 손의 멈춤으로 먼저 보인다. 현실 씬에서는 뮤지컬 무대 조명을 쓰지 않는다.">'+esc(state.canon||'')+'</textarea><div class="zv3-actions"><button class="zv3-btn primary" onclick="ZippyDirectorV3.saveCanon()">프로젝트 헌법 저장</button></div></div><div class="zv3-card"><h4>AI DIRECTOR DESK</h4><p>현재 프로젝트·에셋·GEO·쇼트·QC·제작 로그를 읽고 다음 연출 판단을 제안합니다.</p><textarea id="zv3AssistantQuestion" class="zv3-textarea" style="min-height:112px" placeholder="예: 이 씬의 감정선과 가장 안전한 카메라 무브를 정리해줘"></textarea><div class="zv3-actions"><button id="zv3AssistantRun" class="zv3-btn primary" onclick="ZippyDirectorV3.runAssistant()">AI 감독에게 묻기</button><button class="zv3-btn" onclick="ZippyDirectorV3.copyAssistant()">답변 복사</button><button class="zv3-btn" onclick="ZippyDirectorV3.clearAssistant()">대화 삭제</button></div></div></div><div class="zv3-card" style="margin-top:12px"><h4>최근 AI 감독 답변</h4><div class="zv3-code" style="min-height:180px;white-space:pre-wrap">'+esc(last||'아직 답변이 없습니다.')+'</div></div>';}
  function render(){clearTimeout(mountTimer);mountTimer=setTimeout(function(){var el=document.getElementById('directorV3Mount'),assetEl=document.getElementById('directorV3AssetMount'),state=load(),body='';if(el){if(state.activeTab==='assets')body=renderAssets(state);else if(state.activeTab==='geo')body=renderGeo(state);else if(state.activeTab==='prompt')body=renderPrompt(state);else if(state.activeTab==='qc')body=renderQc(state);else if(state.activeTab==='assistant')body=renderAssistant(state);else body=renderSetup(state);el.innerHTML='<section class="zv3-shell">'+renderHeader(state)+(state.expertOpen?renderTabs(state)+'<div class="zv3-body">'+body+'</div>':'')+'</section>';}if(assetEl)assetEl.innerHTML=renderAssetInline(state);},0);}
  function cardControls(shot){var state=load(),report=strictAnalyze(shot,state,{compile:false}),cls=report.errors.length?'bad':(report.warnings.length?'':'ok'),label=String(report.strictScore),lit=!!(state.shotLights&&state.shotLights[shot.id]);return '<div class="zv3-shot-controls"><button class="zv3-shot-btn" onclick="event.stopPropagation();ZippyDirectorV3.openShot(\''+js(shot.id)+'\')">✨ 엄격 검사</button><button class="zv3-shot-btn '+(lit?'lit':'')+'" onclick="event.stopPropagation();ZippyDirectorV3.openLightPlot(\''+js(shot.id)+'\')">💡 '+(lit?'LIGHT LOCK':'LIGHT PLOT')+'</button><button class="zv3-shot-btn zv3-shot-dot '+cls+'" title="STRICT '+report.strictScore+' · '+attr(report.errors.concat(report.warnings).join(' · ')||'통과')+'">'+label+'</button></div>';}
  function modal(title,body){closeModal();var wrap=document.createElement('div');wrap.id='zv3Modal';wrap.className='zv3-modal';wrap.innerHTML='<div class="zv3-modal-card"><div class="zv3-modal-head"><b>'+esc(title)+'</b><button class="zv3-modal-close" onclick="ZippyDirectorV3.closeModal()">×</button></div><div class="zv3-modal-body">'+body+'</div></div>';wrap.addEventListener('click',function(e){if(e.target===wrap)closeModal();});document.body.appendChild(wrap);}
  function closeModal(){var el=document.getElementById('zv3Modal');if(el)el.remove();}
  function faceAuditHtml(shot,state,report){
    if(!report.faceVisible)return '<div class="zv3-card" style="margin-top:12px"><h4>FACE IDENTITY · 자동 제외</h4><p>이 컷은 손·소품·후면 등 얼굴이 평가 가능한 크기로 노출되지 않는 쇼트입니다.</p></div>';
    if(!report.faceFrame)return '<div class="zv3-card" style="margin-top:12px"><h4>FACE IDENTITY · 생성 후 검사</h4><p>이미지를 생성하면 승인 FACE 원본과 눈·코·입·턱·이마·나이·피부 랜드마크를 별도로 비교합니다. 얼굴 점수는 전체 엄격 점수의 45%이며 90점 미만은 본편에서 차단됩니다.</p></div>';
    var audit=report.faceAudit,busy=!!faceAuditBusy[shot.id],regen=!!regenerationBusy[shot.id],refs=faceRefsForShot(shot),html='<div class="zv3-card" style="margin-top:12px"><h4>FACE IDENTITY · 최우선 평가</h4><p>미모나 분위기가 아니라 승인 원본의 구조적 동일성을 검사합니다. 한 명이라도 90점 미만이면 최저점을 쇼트 얼굴 점수로 사용합니다.</p>';
    if(!refs.length)html+='<div class="zv3-issue error">본편 차단 · 승인된 FACE 레퍼런스가 없습니다.</div>';
    else if(!audit)html+='<div class="zv3-issue warning">생성 프레임은 있으나 얼굴 정밀 검사가 아직 없습니다.</div>';
    else{html+='<div class="zv3-strict-score '+(audit.score>=90?'pass':audit.score>=80?'warn':'fail')+'"><b>FACE '+audit.score+' / 100</b><span>'+esc(String(audit.status||'').toUpperCase())+' · 승인 기준 90</span></div>';html+=(audit.characters||[]).map(function(c){return '<div class="zv3-issue '+(c.status==='pass'?'ok':c.status==='unavailable'?'warning':'error')+'"><b>'+esc(c.label)+' · '+(c.status==='unavailable'?'판정 불가':c.score+'점')+'</b><br>'+esc((c.mismatches||[]).join(' · ')||c.summary||'구조적 불일치 없음')+'</div>';}).join('');}
    html+='<div class="zv3-actions"><button id="zv3FaceAuditRun" class="zv3-btn primary" '+((busy||!refs.length)?'disabled':'')+' onclick="ZippyDirectorV3.runFaceAudit(\''+js(shot.id)+'\')">'+(busy?'얼굴 비교 중...':'👤 얼굴 일치도 정밀 검사')+'</button></div></div>';
    var correction=state.regenerationPrompts[shot.id]||buildRegenerationPrompt(shot,state,report);html+='<div class="zv3-card" style="margin-top:12px"><h4>AI 감독 재생성 프롬프트</h4><p>검수 실패 항목만 고치고 구도·렌즈·행동·공간·의상·광원은 유지합니다.</p><div class="zv3-code" style="max-height:230px;overflow:auto">'+esc(correction)+'</div><div class="zv3-actions"><button class="zv3-btn" onclick="navigator.clipboard.writeText(ZippyDirectorV3.buildRegenerationPromptById(\''+js(shot.id)+'\'))">교정 프롬프트 복사</button><button id="zv3RegenerateRun" class="zv3-btn danger" '+(regen?'disabled':'')+' onclick="ZippyDirectorV3.regenerateFromAudit(\''+js(shot.id)+'\')">'+(regen?'재생성 중...':'↻ AI 감독 프롬프트로 바로 재생성')+'</button></div></div>';return html;
  }
  function openShot(id){var shot=selectedShotFrom(id);if(!shot)return;var state=load(),report=strictAnalyze(shot,state),imagePrompt=buildPrompt(shot,state);modal('AI 감독 엄격 검사 · '+id,'<div class="zv3-issues">'+issueHtml(report)+'</div>'+faceAuditHtml(shot,state,report)+'<div class="zv3-actions"><button class="zv3-btn primary" onclick="navigator.clipboard.writeText(ZippyDirectorV3.buildPromptById(\''+js(id)+'\'))">이미지 프롬프트 복사</button><button class="zv3-btn" onclick="ZippyDirectorV3.openLightPlot(\''+js(id)+'\')">💡 LIGHT PLOT</button><button class="zv3-btn" onclick="ZippyDirectorV3.openSeedance(\''+js(id)+'\')">Seedance 30초 구성으로 보내기</button></div><details class="zv3-technical"><summary>기술 상세 보기</summary><div class="zv3-card">'+cameraHtml(report.camera)+'<h4>자동 모델 선택</h4><p>'+esc(report.route)+'</p><div class="zv3-code" style="margin-top:10px">'+esc(imagePrompt)+'</div></div></details>');}
  function openSeedance(id){closeModal();if(window.ZippySeedancePlanner&&typeof window.ZippySeedancePlanner.openForShot==='function')window.ZippySeedancePlanner.openForShot(id);else if(typeof window.goStep==='function')window.goStep('seedance');}
  function openBatch(bad){modal('DIRECTOR BATCH GATE · '+bad.length+'쇼트 미통과','<div class="zv3-issues">'+bad.slice(0,100).map(function(x){return '<div class="zv3-issue error"><b>'+esc(x.shot.id)+'</b> · '+esc(x.report.errors.join(' / '))+'</div>';}).join('')+'</div>');}
  function focusDirectorTab(tab){closeModal();setTab(tab);var el=document.getElementById('directorV3Mount');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}
  function buildPromptById(id){var shot=selectedShotFrom(id);return shot?buildPrompt(shot,load()):'';}
  function buildRegenerationPromptById(id){var shot=selectedShotFrom(id),state=load();return shot?(state.regenerationPrompts[id]||buildRegenerationPrompt(shot,state,strictAnalyze(shot,state))):'';}
  function buildSeedancePromptById(id){var shot=selectedShotFrom(id);return shot?buildSeedancePrompt(shot,load()):'';}
  function toast(text,type){var old=document.getElementById('zv3Toast');if(old)old.remove();var el=document.createElement('div');el.id='zv3Toast';el.className='zv3-toast '+(type||'');el.textContent=text;document.body.appendChild(el);setTimeout(function(){if(el.parentNode)el.remove();},3800);}
  function refreshProject(){var key=projectKey();if(key!==activeProject){activeProject=key;render();}else if(document.getElementById('directorV3Mount')&&!document.querySelector('#directorV3Mount .zv3-shell'))render();}
  function destroy(){clearTimeout(mountTimer);if(refreshTimer)clearInterval(refreshTimer);refreshTimer=0;var modalEl=document.getElementById('zv3Modal');if(modalEl)modalEl.remove();}

  var api={__engineVersion:ENGINE_VERSION,destroy:destroy,render:render,setMode:setMode,setTab:setTab,setExpert:setExpert,autoDirector:autoDirector,updateSetup:updateSetup,saveCanon:saveCanon,runAssistant:runAssistant,copyAssistant:copyAssistant,clearAssistant:clearAssistant,updateAsset:updateAsset,selectScene:selectScene,saveGeo:saveGeo,openLightPlot:openLightPlot,saveLightPlot:saveLightPlot,resetLightPlot:resetLightPlot,selectPromptShot:selectPromptShot,saveQc:saveQc,openShot:openShot,openSeedance:openSeedance,openBatch:openBatch,closeModal:closeModal,focusDirectorTab:focusDirectorTab,cardControls:cardControls,analyze:strictAnalyze,cameraAdvice:function(shot){return cameraAdvice(shot,load());},routeShot:function(shot){return routePlan(shot,load());},beforeGenerate:beforeGenerate,beforeBatch:beforeBatch,afterGenerate:afterGenerate,runFaceAudit:runFaceAudit,regenerateFromAudit:regenerateFromAudit,composeImagePrompt:composeImagePrompt,composeVideoPrompt:composeVideoPrompt,buildPrompt:function(shot){return buildPrompt(shot,load());},buildPromptById:buildPromptById,buildRegenerationPromptById:buildRegenerationPromptById,buildSeedancePrompt:function(shot){return buildSeedancePrompt(shot,load());},buildSeedancePromptById:buildSeedancePromptById,geoText:function(shot){return geoText(sceneGeo(load(),shot),shot);},state:load};
  window.ZippyDirectorV3=api;
  document.addEventListener('DOMContentLoaded',function(){activeProject=projectKey();render();refreshTimer=setInterval(refreshProject,900);setTimeout(function(){var timeline=document.getElementById('sbTimelineInner');if(timeline&&timeline.children.length&&!timeline.querySelector('.zv3-shot-controls')&&typeof window.buildStoryboardTimeline==='function')window.buildStoryboardTimeline();},180);});
})();
