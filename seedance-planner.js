(function(){
  'use strict';
  var MAX_SECONDS=30;
  var MAX_IMAGE_REFS=30;
  var state={items:[],query:'',busy:false};
  var generated={};

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function js(value){return esc(String(value==null?'':value).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/[\r\n\u2028\u2029]+/g,' '));}
  function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||min));}
  function shots(){try{return typeof SB_SHOTS!=='undefined'&&Array.isArray(SB_SHOTS)?SB_SHOTS:[];}catch(e){return [];}}
  function project(){try{return typeof currentProject!=='undefined'&&currentProject?currentProject:{};}catch(e){return {};}}
  function projectKey(){try{return String(currentProjectKey||project().nameEn||project().name||'project');}catch(e){return 'project';}}
  function storeKey(){return 'zippy_seedance_sequence_v1_'+projectKey().replace(/[^a-z0-9가-힣_-]+/gi,'-');}
  function save(){try{localStorage.setItem(storeKey(),JSON.stringify({items:state.items,query:state.query}));}catch(e){}}
  function load(){
    var raw=null;try{raw=JSON.parse(localStorage.getItem(storeKey())||'null');}catch(e){}
    if(raw&&Array.isArray(raw.items))state.items=raw.items.filter(function(item){return shotById(item.id);}).map(function(item){return {id:String(item.id),duration:clamp(item.duration,1,15)};});
    state.query=raw&&typeof raw.query==='string'?raw.query:'';
    enforceLimit();
  }
  function shotById(id){return shots().find(function(shot){return String(shot.id)===String(id);})||null;}
  function defaultDuration(shot){return clamp(shot&&(shot.durationSeconds||shot.duration||shot.seconds||shot.sec)||4,1,15);}
  function totalSeconds(){return Math.round(state.items.reduce(function(sum,item){return sum+Number(item.duration||0);},0)*10)/10;}
  function enforceLimit(){
    var used=0;state.items=state.items.filter(function(item){var duration=clamp(item.duration,1,15);if(used+duration>MAX_SECONDS)return false;item.duration=duration;used+=duration;return true;});
  }
  function shotLocation(shot){try{return typeof resolveShotLoc==='function'?(resolveShotLoc(shot)||shot.loc||''):shot.loc||'';}catch(e){return shot&&shot.loc||'';}}
  function shotLabel(shot){var ep=shot&&shot.ep!=null?'EP'+String(shot.ep).padStart(2,'0')+' · ':'';return ep+'S'+(shot&&shot.scene!=null?shot.scene:'?')+' · '+(shot&&shot.id||'');}
  function dialogue(shot){return String(shot&&(shot.audioDialogue||shot.dialogue||'')||'').trim();}
  function selectedShots(){return state.items.map(function(item){var shot=shotById(item.id);return shot?{shot:shot,duration:item.duration}:null;}).filter(Boolean);}
  function toast(text,type){var el=document.getElementById('seedancePlannerStatus');if(!el)return;el.textContent=text;el.className='sp-status '+(type||'');}

  function addShot(id){
    if(state.items.some(function(item){return item.id===id;}))return;
    var shot=shotById(id);if(!shot)return;var duration=defaultDuration(shot);
    if(totalSeconds()+duration>MAX_SECONDS){toast('30초를 넘습니다. 기존 씬의 시간을 줄인 뒤 추가하세요.','bad');return;}
    state.items.push({id:id,duration:duration});save();render();
  }
  function removeShot(id){state.items=state.items.filter(function(item){return item.id!==id;});save();render();}
  function setDuration(id,value){
    var item=state.items.find(function(entry){return entry.id===id;});if(!item)return;
    var previous=item.duration;item.duration=clamp(value,1,15);
    if(totalSeconds()>MAX_SECONDS){item.duration=previous;toast('합계는 30초를 넘을 수 없습니다.','bad');render();return;}
    save();render();
  }
  function moveShot(id,direction){var index=state.items.findIndex(function(item){return item.id===id;});var next=index+Number(direction||0);if(index<0||next<0||next>=state.items.length)return;var item=state.items.splice(index,1)[0];state.items.splice(next,0,item);save();render();}
  function clearShots(){state.items=[];save();render();}
  function autoFill(){
    var ordered=shots().slice().sort(function(a,b){var ap=a.pri==='must'?0:1,bp=b.pri==='must'?0:1;return ap-bp;});state.items=[];var used=0;
    ordered.some(function(shot){var duration=defaultDuration(shot);if(used+duration>MAX_SECONDS)return false;state.items.push({id:String(shot.id),duration:duration});used+=duration;return used>=MAX_SECONDS;});
    save();render();
  }
  function setQuery(value){state.query=String(value||'');save();renderShotList();}

  function directFrame(shot){
    var b64='';try{if(typeof sbGenImages!=='undefined')b64=sbGenImages[shot.id]||'';}catch(e){}
    try{if(!b64&&typeof sbSeqImages!=='undefined'&&Array.isArray(sbSeqImages[shot.id]))b64=sbSeqImages[shot.id].filter(Boolean)[0]||'';}catch(e){}
    try{if(b64&&typeof zippyHistoryMarker==='function'&&zippyHistoryMarker(b64))b64='';}catch(e){}
    if(generated[shot.id])b64=generated[shot.id];
    return b64;
  }
  function normalizeRef(raw,usedBy){
    if(!raw)return null;var data=raw.inline_data||{};
    return {type:String(raw._type||'reference'),label:String(raw._label||'Reference'),b64:String(raw.b64||data.data||''),mime:String(raw.mime||data.mime_type||'image/png'),url:String(raw.url||''),usedBy:[usedBy]};
  }
  function flattenUrls(value,out){
    out=out||[];if(!value)return out;if(typeof value==='string'){out.push(value);return out;}if(Array.isArray(value)){value.forEach(function(item){flattenUrls(item,out);});return out;}if(typeof value==='object'){Object.keys(value).sort().forEach(function(key){flattenUrls(value[key],out);});}return out;
  }
  function assetUrl(value){try{return new URL(String(value||''),location.href).href;}catch(e){return String(value||'');}}
  function selectedCharacterNames(){var names=[];selectedShots().forEach(function(entry){(entry.shot.char||[]).forEach(function(name){if(name&&names.indexOf(name)===-1)names.push(name);});});return names;}
  function originalCharacterRefs(){
    var p=project(),out=[];selectedCharacterNames().forEach(function(name){
      var usedBy=selectedShots().filter(function(entry){return (entry.shot.char||[]).indexOf(name)!==-1;}).map(function(entry){return entry.shot.id;});
      [['face',p.defaultFaceRefs&&p.defaultFaceRefs[name],name+' 얼굴'],['character',p.defaultCharRefs&&p.defaultCharRefs[name],name+' 캐릭터'],['costume',p.defaultCostumeAssetRefs&&p.defaultCostumeAssetRefs[name],name+' 의상']].forEach(function(spec){
        flattenUrls(spec[1]).forEach(function(url,index){out.push({type:spec[0],label:spec[2]+(index?' '+String(index+1).padStart(2,'0'):''),subject:name,variant:index+1,b64:'',mime:'',url:assetUrl(url),usedBy:usedBy.slice()});});
      });
    });
    return out;
  }
  function rawRefsForShot(shot){var refs=[];try{if(typeof getSBRefsForShot==='function')refs=getSBRefsForShot(shot.scene,shot.id)||[];}catch(e){}return refs.map(function(ref){return normalizeRef(ref,shot.id);}).filter(Boolean);}
  function refKey(ref){return String(ref.type||'reference').toLowerCase()+'|'+String(ref.label||'Reference').replace(/\s+/g,' ').trim().toLowerCase();}
  function collectReferences(){
    var all=[];selectedShots().forEach(function(entry){var shot=entry.shot;all.push({type:'storyboard',label:shot.id+' 첫 프레임',b64:directFrame(shot),mime:'image/png',url:'',usedBy:[shot.id],shotId:shot.id});rawRefsForShot(shot).forEach(function(ref){all.push(ref);});});
    originalCharacterRefs().forEach(function(ref){all.push(ref);});
    var map={},dedup=[];all.forEach(function(ref){var key=refKey(ref),old=map[key];if(!old){map[key]=ref;dedup.push(ref);return;}ref.usedBy.forEach(function(id){if(old.usedBy.indexOf(id)===-1)old.usedBy.push(id);});if(!old.b64&&ref.b64){old.b64=ref.b64;old.mime=ref.mime;}if(!old.url&&ref.url)old.url=ref.url;});
    var priority={storyboard:0,face:1,character:2,costume:3,background:4,location:4,prop:5,reference:6};
    dedup.sort(function(a,b){var pa=priority[a.type]!=null?priority[a.type]:9,pb=priority[b.type]!=null?priority[b.type]:9;return pa-pb||a.label.localeCompare(b.label,'ko');});
    dedup.forEach(function(ref,index){ref.uploadIndex=index<MAX_IMAGE_REFS?index+1:null;ref.ready=!!(ref.b64||ref.url);});return dedup;
  }
  function refsForShot(refs,shotId){return refs.filter(function(ref){return ref.uploadIndex&&ref.usedBy.indexOf(shotId)!==-1;}).map(function(ref){return '@Image '+ref.uploadIndex;});}
  function emotionalAction(shot){var action=String(shot.desc||'Complete the storyboard action').trim();var beat=String(shot.func||'the scene reaches a readable end state').trim();return action+' Emotional progression is performed through observable breath, gaze, hands, posture, and timing; it resolves as '+beat+'.';}
  function buildPrompt(){
    var entries=selectedShots();if(!entries.length)return '30초 안에 구성할 씬을 왼쪽에서 선택하세요.';
    var refs=collectReferences(),offset=0,timeline=[],audio=[];
    entries.forEach(function(entry,index){var shot=entry.shot,start=offset,end=Math.round((offset+entry.duration)*10)/10,assigned=refsForShot(refs,shot.id);offset=end;var line=dialogue(shot);var camera='storyboard-defined locked camera';try{if(window.ZippyDirectorV3)camera=window.ZippyDirectorV3.cameraAdvice(shot).id;}catch(e){}
      timeline.push('[Stage '+(index+1)+' · '+start.toFixed(1)+'–'+end.toFixed(1)+'s]\nScene: '+shotLabel(shot)+' · '+(shotLocation(shot)||'approved project location')+'.\nReferences: '+(assigned.length?assigned.join(', '):'use the declared project canon; create the missing first-frame reference before generation')+'.\nInitial state: begin on a clean, readable composition matching the storyboard and the assigned scene reference.\nPrimary event: '+emotionalAction(shot)+' Only one primary state change occurs in this stage.\nCamera: '+camera+'. Preserve screen direction and finish on one stable composition.\nEnd state: '+String(shot.func||'the visible action completes')+'; hold the readable result before the cut.\nTransition: '+(index===entries.length-1?'finish and hold':'clean motivated hard cut into Stage '+(index+2))+'.');
      if(line)audio.push('Stage '+(index+1)+' · Korean dialogue in the established voice: {'+line.replace(/[{}]/g,'')+'}');
    });
    var manifest=refs.slice(0,MAX_IMAGE_REFS).map(function(ref){return '@Image '+ref.uploadIndex+' — '+ref.type.toUpperCase()+' — '+ref.label+' — role only; used in '+ref.usedBy.join(', ')+(ref.ready?'':' — PREPARE BEFORE GENERATION');}).join('\n');
    var p=project(),format=(p&&p.defaultRatio)||'16:9';
    return '[Generation Goal]\nCreate one coherent multi-scene cinematic sequence lasting exactly '+totalSeconds().toFixed(1)+' seconds, never exceeding 30 seconds. Use '+entries.length+' stages in the declared order. Each stage contains one primary visible state change. Output format: '+format+'.\n\n[Reference Upload Order]\nUpload the following images in this exact order. Each image controls only its declared role; never inherit an unrelated pose, framing, layout, text, or grade.\n'+(manifest||'No reference has been prepared yet.')+'\n\n[Timeline]\n'+timeline.join('\n\n')+'\n\n[Audio]\n'+(audio.length?audio.join('\n'):'Use natural diegetic location sound and the practical sounds caused by visible actions.')+'\n\n[Continuity Across Scenes]\nThe same named character keeps the same face, body, hair, wardrobe, age, handedness, and voice across every stage. Declared props keep one owner, scale, material, and damage state. Locations keep their approved geometry and motivated light direction. Emotion changes in observable stages rather than snapping. Preserve real gravity, contact, inertia, fabric response, skin texture, reflections, and non-synchronised micro-movement. Use clean cuts; do not turn references into a collage, contact sheet, split screen, duplicated subject, or visible reference board.\n\n[Final Hold]\nEnd Stage '+entries.length+' on its declared visible result and hold a stable final composition.';
  }

  function refTypeLabel(type){return {storyboard:'스토리보드 첫 프레임',face:'얼굴',character:'캐릭터 시트',costume:'의상',background:'공간·배경',location:'공간·배경',prop:'소품'}[type]||'레퍼런스';}
  function selectedHtml(){
    var entries=selectedShots();if(!entries.length)return '<div class="sp-empty">선택된 씬이 없습니다.<br>아래 목록에서 최대 30초까지 추가하세요.</div>';
    return entries.map(function(entry,index){var shot=entry.shot;return '<div class="sp-scene"><div class="sp-order">'+String(index+1).padStart(2,'0')+'</div><div><b>'+esc(shotLabel(shot))+'</b><small>'+esc(shot.desc||shot.func||shot.frame||'')+'</small></div><div class="sp-duration"><input type="number" min="1" max="15" step="0.5" value="'+entry.duration+'" onchange="ZippySeedancePlanner.setDuration(\''+js(shot.id)+'\',this.value)"><span>초</span></div><div><button class="sp-icon" title="위로" onclick="ZippySeedancePlanner.moveShot(\''+js(shot.id)+'\',-1)">↑</button><button class="sp-icon" title="아래로" onclick="ZippySeedancePlanner.moveShot(\''+js(shot.id)+'\',1)">↓</button><button class="sp-icon" title="제거" onclick="ZippySeedancePlanner.removeShot(\''+js(shot.id)+'\')">×</button></div></div>';}).join('');
  }
  function renderShotList(){
    var el=document.getElementById('seedanceShotList');if(!el)return;var query=state.query.trim().toLowerCase(),added={};state.items.forEach(function(item){added[item.id]=true;});var filtered=shots().filter(function(shot){var hay=[shot.id,shot.scene,shot.ep,shot.desc,shot.func,shot.frame,shotLocation(shot)].join(' ').toLowerCase();return !query||hay.indexOf(query)!==-1;});
    el.innerHTML=filtered.slice(0,240).map(function(shot){return '<div class="sp-shot-row '+(added[shot.id]?'added':'')+'"><div><b>'+esc(shotLabel(shot))+'</b><small>'+esc((shotLocation(shot)?shotLocation(shot)+' · ':'')+(shot.desc||shot.func||shot.frame||''))+'</small></div><button '+(added[shot.id]?'disabled':'')+' onclick="ZippySeedancePlanner.addShot(\''+js(shot.id)+'\')">'+(added[shot.id]?'추가됨':'+ 추가')+'</button></div>';}).join('')+(filtered.length>240?'<div class="sp-limit">검색 결과가 많아 240개까지만 표시합니다. 쇼트 ID나 장면 설명으로 검색하세요.</div>':'');
  }
  function refsHtml(refs){if(!refs.length)return '<div class="sp-empty">씬을 선택하면 필요한 레퍼런스가 표시됩니다.</div>';return refs.map(function(ref,index){var stateClass=ref.uploadIndex?(ref.ready?'ready':'missing'):'omitted',stateText=ref.uploadIndex?(ref.ready?'준비됨':'준비 필요'):'30장 초과';return '<div class="sp-ref"><div class="sp-ref-num">'+(ref.uploadIndex?'@'+ref.uploadIndex:'—')+'</div><div><b>'+esc(refTypeLabel(ref.type)+' · '+ref.label)+'</b><small>'+esc(ref.usedBy.join(', '))+' · '+esc(refFilename(ref,index))+'</small></div><span class="sp-ref-state '+stateClass+'">'+stateText+'</span></div>';}).join('');}
  function gtiHtml(entries){if(!entries.length)return '<div class="sp-empty">씬을 선택하면 GTI 첫 프레임 제작 항목이 표시됩니다.</div>';return entries.map(function(entry){var shot=entry.shot,b64=directFrame(shot),ready=!!b64;return '<div class="sp-gti"><div><b>'+esc(shotLabel(shot))+' · Seedance 첫 프레임</b><small>'+esc(shot.desc||shot.func||'')+'<br>기존 캐릭터·의상·공간·소품 에셋을 입력으로 사용합니다.</small></div><div class="sp-gti-tools">'+(ready?'<img src="data:image/png;base64,'+b64+'" alt="">':'')+'<button class="sp-btn '+(ready?'':'green')+'" '+(state.busy?'disabled':'')+' onclick="ZippySeedancePlanner.generateFrame(\''+js(shot.id)+'\')">'+(ready?'GTI 재생성':'GTI 생성')+'</button></div></div>';}).join('');}
  function render(){
    var el=document.getElementById('seedancePlannerApp');if(!el)return;var total=totalSeconds(),refs=collectReferences(),entries=selectedShots(),over=total>MAX_SECONDS;
    el.innerHTML='<section class="sp-shell"><div class="sp-hero"><div><div class="sp-kicker">SEEDANCE 2.5 · 30S MULTI-SCENE PROMPT</div><h2>여러 씬을 하나의 30초 프롬프트로 구성</h2><p>스토리보드 쇼트를 순서대로 묶고 시간을 배분하면 통합 Seedance 프롬프트와 정확한 레퍼런스 업로드 순서를 만듭니다. 이 탭은 프롬프트·레퍼런스 준비 전용이며 영상을 직접 생성하지 않습니다.</p></div><div class="sp-meter '+(over?'over':'')+'"><b>'+total.toFixed(1)+' / 30.0s</b><span>'+entries.length+' SCENES SELECTED</span></div></div><div class="sp-grid"><section class="sp-card"><h3>1 · 30초 씬 타임라인</h3><p>각 씬은 하나의 주요 상태 변화만 갖도록 시간을 배분합니다.</p><div class="sp-actions"><button class="sp-btn primary" onclick="ZippySeedancePlanner.autoFill()">필수 쇼트 자동 담기</button><button class="sp-btn danger" onclick="ZippySeedancePlanner.clearShots()">전체 비우기</button></div><div class="sp-selected">'+selectedHtml()+'</div><h3 style="margin-top:16px">스토리보드에서 추가</h3><input class="sp-search" value="'+esc(state.query)+'" placeholder="쇼트 ID · 씬 · 장소 · 설명 검색" oninput="ZippySeedancePlanner.setQuery(this.value)"><div class="sp-shot-list" id="seedanceShotList"></div></section><section class="sp-card"><h3>2 · Seedance 통합 프롬프트</h3><p>선택 순서와 시간, 감정 변화, 컷 전환, 레퍼런스 역할이 한 번에 반영됩니다.</p><textarea class="sp-prompt" id="seedanceSequencePrompt" readonly>'+esc(buildPrompt())+'</textarea><div class="sp-actions"><button class="sp-btn primary" onclick="ZippySeedancePlanner.copyPrompt()">프롬프트 복사</button><button class="sp-btn" onclick="ZippySeedancePlanner.downloadPrompt()">TXT 저장</button></div><div id="seedancePlannerStatus" class="sp-status">'+(refs.length>MAX_IMAGE_REFS?'레퍼런스가 30장을 넘었습니다. 우선순위 상위 30장만 프롬프트 업로드 목록에 사용합니다.':'씬을 수정하면 프롬프트와 레퍼런스 목록이 즉시 다시 만들어집니다.')+'</div></section></div><section class="sp-card"><h3>3 · 레퍼런스 업로드 순서와 파일</h3><p>선택한 씬의 기존 에셋과 파이프라인 생성 프레임을 자동 수집합니다. 파일명은 같은 씬 구성에서 항상 동일합니다.</p><div class="sp-actions"><button class="sp-btn green" '+(!entries.length?'disabled':'')+' onclick="ZippySeedancePlanner.downloadReferencePack()">레퍼런스 ZIP 한 번에 다운로드</button></div><div class="sp-download-note">고정 파일명: CHARACTER__인물명__FACE / CHARACTER__인물명__SHEET / COSTUME__인물명 / LOCATION__장소명 / PROP__소품명 / STORYBOARD__쇼트ID__FRAME</div><div class="sp-ref-list">'+refsHtml(refs)+'</div></section><section class="sp-card"><h3>4 · 부족한 레퍼런스 GTI 자동 생성</h3><p>기존 에셋을 입력으로 사용해 선택한 씬의 Seedance 첫 프레임을 만듭니다. 생성 결과는 스토리보드 프레임으로 저장되어 ZIP에 자동 포함됩니다.</p><div class="sp-actions"><button class="sp-btn gold" '+(!entries.length||state.busy?'disabled':'')+' onclick="ZippySeedancePlanner.generateMissing()">부족한 첫 프레임 모두 GTI 생성</button></div><div class="sp-gti-list">'+gtiHtml(entries)+'</div></section></section>';
    renderShotList();
  }

  function copyPrompt(){var prompt=buildPrompt();if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(prompt).then(function(){toast('Seedance 통합 프롬프트를 복사했습니다.','good');});}
  function downloadBlob(blob,name){var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  function safeName(value){return String(value||'asset').normalize('NFKC').replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,110)||'asset';}
  function extension(ref){var mime=String(ref.mime||'').toLowerCase();if(mime.indexOf('jpeg')!==-1)return 'jpg';if(mime.indexOf('webp')!==-1)return 'webp';if(mime.indexOf('gif')!==-1)return 'gif';var clean=String(ref.url||'').split('?')[0],match=clean.match(/\.([a-z0-9]{2,5})$/i);return match?match[1].toLowerCase():'png';}
  function refFilename(ref,index){var ext=extension(ref),label=safeName(ref.label),subject=safeName(ref.subject||ref.label),variant=Number(ref.variant||1)>1?'__'+String(ref.variant).padStart(2,'0'):'';if(ref.type==='storyboard')return 'STORYBOARD__'+safeName(ref.shotId||ref.usedBy[0])+'__FRAME.'+ext;if(ref.type==='face')return 'CHARACTER__'+subject+'__FACE'+variant+'.'+ext;if(ref.type==='character')return 'CHARACTER__'+subject+'__SHEET'+variant+'.'+ext;if(ref.type==='costume')return 'COSTUME__'+subject+variant+'.'+ext;if(ref.type==='background'||ref.type==='location')return 'LOCATION__'+label+'.'+ext;if(ref.type==='prop')return 'PROP__'+label+'.'+ext;return 'REFERENCE__'+String(index+1).padStart(2,'0')+'__'+label+'.'+ext;}
  function downloadPrompt(){downloadBlob(new Blob([buildPrompt()],{type:'text/plain;charset=utf-8'}),'SEEDANCE__'+safeName(projectKey())+'__30S_PROMPT.txt');}

  function base64Bytes(value){var clean=String(value||'').replace(/^data:[^,]+,/,'').replace(/\s/g,''),binary=atob(clean),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
  async function refBytes(ref){if(ref.b64)return base64Bytes(ref.b64);if(ref.url){var response=await fetch(ref.url);if(!response.ok)throw new Error('HTTP '+response.status);return new Uint8Array(await response.arrayBuffer());}throw new Error('파일 데이터 없음');}
  var crcTable=null;
  function crc32(bytes){if(!crcTable){crcTable=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}}var crc=0xffffffff;for(var i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
  function le16(value){return new Uint8Array([value&255,(value>>>8)&255]);}
  function le32(value){return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);}
  function concat(parts){var length=parts.reduce(function(sum,part){return sum+part.length;},0),out=new Uint8Array(length),offset=0;parts.forEach(function(part){out.set(part,offset);offset+=part.length;});return out;}
  function zipStore(files){
    var encoder=new TextEncoder(),locals=[],centrals=[],offset=0;files.forEach(function(file){var name=encoder.encode(file.name),data=file.bytes,crc=crc32(data),flag=0x0800;var local=concat([le32(0x04034b50),le16(20),le16(flag),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),name,data]);locals.push(local);var central=concat([le32(0x02014b50),le16(20),le16(20),le16(flag),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(offset),name]);centrals.push(central);offset+=local.length;});var centralBytes=concat(centrals),body=concat(locals);var end=concat([le32(0x06054b50),le16(0),le16(0),le16(files.length),le16(files.length),le32(centralBytes.length),le32(body.length),le16(0)]);return new Blob([body,centralBytes,end],{type:'application/zip'});}
  async function downloadReferencePack(){
    var refs=collectReferences(),files=[],missing=[],usedNames={};toast('레퍼런스 파일을 모으는 중입니다...');
    for(var i=0;i<refs.length;i++){var ref=refs[i],name=refFilename(ref,i),base=name,count=2;while(usedNames[name]){var dot=base.lastIndexOf('.');name=(dot>0?base.slice(0,dot):base)+'__'+String(count++).padStart(2,'0')+(dot>0?base.slice(dot):'');}usedNames[name]=true;try{files.push({name:'references/'+name,bytes:await refBytes(ref)});}catch(e){missing.push({file:name,type:ref.type,label:ref.label,url:ref.url||'',error:e.message});}}
    var manifest={project:projectKey(),durationSeconds:totalSeconds(),sceneOrder:state.items,references:refs.map(function(ref,index){return {uploadIndex:ref.uploadIndex,type:ref.type,label:ref.label,file:refFilename(ref,index),usedBy:ref.usedBy,ready:ref.ready};}),missing:missing};var encoder=new TextEncoder();files.push({name:'SEEDANCE_30S_PROMPT.txt',bytes:encoder.encode(buildPrompt())});files.push({name:'REFERENCE_MANIFEST.json',bytes:encoder.encode(JSON.stringify(manifest,null,2))});files.push({name:'README.txt',bytes:encoder.encode('Upload reference images in the numbered order declared in SEEDANCE_30S_PROMPT.txt.\nStable filenames are preserved across repeated downloads.\nMissing or blocked external files are listed in REFERENCE_MANIFEST.json.\n')});downloadBlob(zipStore(files),'SEEDANCE__'+safeName(projectKey())+'__30S_REFERENCE_PACK.zip');toast('ZIP 다운로드 완료 · '+files.length+'개 파일'+(missing.length?' · 누락 '+missing.length+'개는 manifest 확인':'') ,missing.length?'bad':'good');
  }

  function gtiRefs(shot){var priority={face:0,character:1,costume:2,background:3,location:3,prop:4};return rawRefsForShot(shot).filter(function(ref){return ref.b64;}).sort(function(a,b){var pa=priority[a.type]!=null?priority[a.type]:9,pb=priority[b.type]!=null?priority[b.type]:9;return pa-pb;}).slice(0,8).map(function(ref){return {b64:ref.b64,mime:ref.mime,_type:ref.type,_label:ref.label};});}
  function gtiPrompt(shot){var imagePrompt='';try{if(window.ZippyDirectorV3)imagePrompt=window.ZippyDirectorV3.buildPrompt(shot)||'';}catch(e){}return 'SEEDANCE REFERENCE FRAME TASK\nCreate exactly one single cinematic first frame for '+shot.id+'. Use the supplied project assets as identity, face, wardrobe, location, and prop authorities. Preserve each asset only in its declared role. The composition must depict the instant immediately before the primary action begins, with readable geography and stable screen direction. This is a finished cinematic frame, not a character sheet, contact sheet, split screen, collage, or before-and-after layout. Do not invent a new face, outfit, location, prop, logo, or readable text.\n\n'+imagePrompt;}
  async function generateFrame(id){var shot=shotById(id);if(!shot||state.busy)return;state.busy=true;render();toast(id+' · 기존 에셋으로 GTI 첫 프레임 생성 중...');try{if(typeof callGtiBridge!=='function')throw new Error('GTI 브릿지 함수를 찾지 못했습니다.');var refs=gtiRefs(shot);if(!refs.length)throw new Error('이 씬에 사용할 기존 에셋이 없습니다. 먼저 캐릭터·의상·공간 에셋을 불러오세요.');var result=await callGtiBridge({images:refs,prompt:gtiPrompt(shot),onProgress:function(message){toast(id+' · '+message);}});if(!result||!result.imgB64)throw new Error('GTI 이미지 결과가 없습니다.');generated[id]=result.imgB64;try{if(typeof sbGenImages!=='undefined')sbGenImages[id]=result.imgB64;}catch(e){}try{if(typeof saveStoryboardState==='function')saveStoryboardState('seedance-gti-reference');}catch(e){}try{if(typeof saveToHistory==='function')saveToHistory(result.imgB64,'Seedance-GTI',id+' first frame');}catch(e){}try{if(typeof zippyNasSaveImage==='function')zippyNasSaveImage('seedance_reference',id,result.imgB64,'image/png',{shotId:id,prompt:gtiPrompt(shot),reason:'seedance-30s-reference'});}catch(e){}try{if(typeof buildStoryboardTimeline==='function')buildStoryboardTimeline();}catch(e){}toast(id+' · GTI 첫 프레임 생성·저장 완료','good');}catch(e){toast(id+' · '+(e.message||e),'bad');}finally{state.busy=false;render();}}
  async function generateMissing(){var entries=selectedShots().filter(function(entry){return !directFrame(entry.shot);});if(!entries.length){toast('부족한 첫 프레임이 없습니다.','good');return;}for(var i=0;i<entries.length;i++){await generateFrame(entries[i].shot.id);if(state.busy)break;}}

  function openForShot(id){if(typeof window.goStep==='function')window.goStep('seedance');if(id&&!state.items.some(function(item){return item.id===id;}))addShot(id);else render();}
  function init(){load();render();}
  var api={init:init,render:render,addShot:addShot,removeShot:removeShot,setDuration:setDuration,moveShot:moveShot,clearShots:clearShots,autoFill:autoFill,setQuery:setQuery,copyPrompt:copyPrompt,downloadPrompt:downloadPrompt,downloadReferencePack:downloadReferencePack,generateFrame:generateFrame,generateMissing:generateMissing,openForShot:openForShot,buildPrompt:buildPrompt,collectReferences:collectReferences,state:function(){return {items:state.items.slice(),totalSeconds:totalSeconds()};}};
  window.ZippySeedancePlanner=api;
  document.addEventListener('DOMContentLoaded',function(){load();});
})();
