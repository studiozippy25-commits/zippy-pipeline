(function(){
  'use strict';

  const VERSION='1.1';
  let activeShotId='';
  let searchMode='broad';
  let cache={key:'',data:{}};

  function projectStorageKey(){
    const key=(typeof currentProjectKey!=='undefined'&&currentProjectKey)||(typeof currentProject!=='undefined'&&currentProject&&(currentProject.key||currentProject.id||currentProject.name))||'default';
    return 'zippy-cinema-reference/v1/'+String(key);
  }
  function loadState(){
    const key=projectStorageKey();
    if(cache.key===key)return cache.data;
    let data={};
    try{data=JSON.parse(localStorage.getItem(key)||'{}');if(!data||typeof data!=='object'||Array.isArray(data))data={};}catch(e){data={};}
    cache={key:key,data:data};return data;
  }
  function saveState(data){
    const key=projectStorageKey();cache={key:key,data:data||{}};
    try{localStorage.setItem(key,JSON.stringify(cache.data));return true;}catch(e){console.warn('Cinema reference save failed',e);return false;}
  }
  function shotById(id){return typeof SB_SHOTS!=='undefined'?SB_SHOTS.find(function(s){return s&&String(s.id)===String(id);})||null:null;}
  function itemsForShot(id){const data=loadState();return Array.isArray(data[id])?data[id]:[];}
  function esc(v){return typeof sbEscHtml==='function'?sbEscHtml(v):String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function rawText(shot){return [shot&&shot.frame,shot&&shot.desc,shot&&shot.func,shot&&shot.time,shot&&shot.light,shot&&shot.sceneName,shot&&shot.loc].filter(Boolean).join(' ');}
  function semanticSeed(shot){
    const raw=rawText(shot).toLowerCase();let subject='cinematic character';
    if(/등굣길|통학/.test(raw))subject='teenagers walking to school';
    else if(/교실|classroom/.test(raw))subject='students in a classroom';
    else if(/교문|school gate/.test(raw))subject='students at a school gate';
    else if(/운동장|테니스|court/.test(raw))subject='students on a sports court';
    else if(/카페|coffee|cafe/.test(raw))subject='people in a quiet cafe';
    else if(/골목|alley/.test(raw))subject='person in a city alley';
    else if(/옥상|rooftop/.test(raw))subject='person on a rooftop';
    if(/카메라|사진|셔터|camera|photo/.test(raw))subject+=' holding a vintage camera';
    if(/대화|말하|conversation|dialogue/.test(raw))subject+=' during a quiet conversation';
    if(/외로|쓸쓸|lonely/.test(raw))subject+=' with restrained loneliness';
    return subject;
  }
  function searchSpec(shot,semanticOverride,mode){
    const raw=rawText(shot),upper=raw.toUpperCase(),all=new URLSearchParams(),facets=[];
    all.set('type','movie');
    const ratio=String((typeof currentProject!=='undefined'&&currentProject&&currentProject.defaultRatio)||'').replace(/\s/g,'');
    const ratioMap={'16:9':'1.78','1.78:1':'1.78','2.39:1':'2.39','1.85:1':'1.85','4:3':'1.33','1.33:1':'1.33','1:1':'1.00'};
    if(ratioMap[ratio]){all.set('ar',ratioMap[ratio]);facets.push('AR '+ratioMap[ratio]);}
    const chars=shot&&Array.isArray(shot.char)?shot.char.filter(Boolean):[];let people=chars.length;
    if(!people&&/\b(2 SHOT|TWO[ -]?SHOT)\b|투샷|2인/.test(upper))people=2;
    if(!people&&/군중|CROWD|GROUP/.test(upper))people=6;
    if(people){const value=people>=6?'6+':String(Math.min(people,5));all.set('people',value);facets.push('PEOPLE '+value);}
    if(/\bEXT\.?\b|실외|야외|등굣길|골목|거리|옥상|운동장|교문/.test(upper)){all.set('int_ext','Exterior');facets.push('EXT');}
    else if(/\bINT\.?\b|실내|교실|카페|복도|체육관|암실/.test(upper)){all.set('int_ext','Interior');facets.push('INT');}
    let time='';
    if(/일출|SUNRISE/.test(upper))time='Sunrise';else if(/새벽|DAWN/.test(upper))time='Dawn';else if(/일몰|SUNSET/.test(upper))time='Sunset';else if(/황혼|DUSK/.test(upper))time='Dusk';else if(/밤|야간|NIGHT/.test(upper))time='Night';else if(/낮|아침|오전|DAY|MORNING/.test(upper))time='Day';
    if(time){all.set('time',time);facets.push(time);}
    let size='';
    if(/EXTREME CLOSE|\bECU\b|익스트림 클로즈|초근접/.test(upper))size='Extreme Close Up';
    else if(/MEDIUM CLOSE|\bMCU\b|미디엄 클로즈/.test(upper))size='Medium Close Up';
    else if(/CLOSE[ -]?UP|\bCU\b|클로즈업/.test(upper))size='Close Up';
    else if(/EXTREME WIDE|\bEWS\b|익스트림 와이드/.test(upper))size='Extreme Wide';
    else if(/MEDIUM WIDE|\bMWS\b|미디엄 와이드/.test(upper))size='Medium Wide';
    else if(/\bWIDE\b|\bWS\b|와이드|풀샷/.test(upper))size='Wide';
    if(size){all.set('size',size);facets.push(size);}
    let shotType='';
    if(/인서트|INSERT|MACRO/.test(upper))shotType='Insert';else if(/오버숄더|OVER THE SHOULDER|\bOTS\b/.test(upper))shotType='Over the shoulder';else if(/로우앵글|LOW ANGLE/.test(upper))shotType='Low angle';else if(/하이앵글|HIGH ANGLE/.test(upper))shotType='High angle';else if(/오버헤드|부감|OVERHEAD/.test(upper))shotType='Overhead';else if(/더치|DUTCH/.test(upper))shotType='Dutch angle';else if(people===2||/투샷|TWO[ -]?SHOT|2 SHOT/.test(upper))shotType='2 shot';else if(people===3)shotType='3 shot';else if(people>=4||/군중|GROUP/.test(upper))shotType='Group shot';else if(people===1)shotType='Clean single';
    if(shotType){all.set('shot',shotType);facets.push(shotType);}
    let comp='';
    if(/대칭|SYMMETR/.test(upper))comp='Symmetrical';else if(/숏사이드|SHORT SIDE/.test(upper))comp='Short side';else if(/좌측 편중|LEFT HEAVY/.test(upper))comp='Left Heavy';else if(/우측 편중|RIGHT HEAVY/.test(upper))comp='Right heavy';else if(/중앙|CENTER/.test(upper))comp='Center';else if(/균형|BALANCED/.test(upper))comp='Balanced';
    if(comp){all.set('comp',comp);facets.push(comp);}
    const lighting=[];
    if(/역광|BACKLIGHT/.test(upper))lighting.push('Backlight');if(/측광|SIDE LIGHT/.test(upper))lighting.push('Side light');if(/소프트|SOFT LIGHT|DIFFUSED/.test(upper))lighting.push('Soft light');if(/하드 라이트|HARD LIGHT/.test(upper))lighting.push('Hard light');if(/실루엣|SILHOUETTE/.test(upper))lighting.push('Silhouette');if(/고대비|HIGH CONTRAST|LOW KEY/.test(upper))lighting.push('High contrast');
    if(lighting.length){all.set('lighting',lighting.slice(0,2).join(','));facets.push.apply(facets,lighting.slice(0,2));}
    let color='';if(/따뜻|웜톤|WARM|GOLDEN/.test(upper))color='Warm';else if(/차가|쿨톤|COOL/.test(upper))color='Cool';else if(/저채도|DESATURATED/.test(upper))color='Desaturated';else if(/고채도|SATURATED/.test(upper))color='Saturated';
    if(color){all.set('color',color);facets.push(color);}
    const semantic=String(semanticOverride||semanticSeed(shot)).trim(),selected=['broad','precise','semantic'].includes(mode)?mode:'broad',finalParams=new URLSearchParams();let finalFacets=[];
    if(selected==='semantic'){if(semantic)finalParams.set('search',semantic);finalFacets=['SEMANTIC · BETA'];}
    else if(selected==='precise'){all.forEach(function(value,key){finalParams.set(key,value);});finalFacets=facets.slice();}
    else{finalParams.set('type','movie');finalFacets=['TYPE MOVIE'];const priority=[['size','SIZE '],['shot','SHOT '],['int_ext',''],['time',''],['lighting','LIGHT '],['color','COLOR ']];for(let i=0;i<priority.length;i++){if(all.has(priority[i][0])){const value=all.get(priority[i][0]);finalParams.set(priority[i][0],value);finalFacets.push(priority[i][1]+value);break;}}}
    return{url:'https://stillslab.com/filter?'+finalParams.toString(),semantic:semantic,facets:finalFacets,mode:selected};
  }
  function createModal(){
    let modal=document.getElementById('cinemaReferenceModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='cinemaReferenceModal';modal.className='cinema-ref-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const aspects=[['composition','구도'],['shot-size','샷 크기'],['angle','앵글'],['lighting','조명'],['color','색감'],['lens-depth','렌즈·심도'],['blocking','블로킹'],['mood','감정·분위기']];
    modal.innerHTML='<div class="cinema-ref-dialog"><div class="cinema-ref-header"><div><div class="cinema-ref-title">🎬 CINEMA REFERENCE</div><div id="cinemaReferenceShotLabel" style="font-size:10px;color:var(--mu);margin-top:3px"></div></div><button class="cinema-ref-close" type="button" onclick="cinemaReferenceClose()">×</button></div><div class="cinema-ref-body">'+
      '<div class="cinema-ref-box"><label class="cinema-ref-label">장면 의미 검색어 · 의미 검색 전용</label><input class="cinema-ref-input" id="cinemaReferenceSemantic" type="text"><div class="cinema-ref-facets" id="cinemaReferenceFacets" style="margin-top:9px"></div><div class="cinema-ref-actions" style="margin-top:10px"><button class="cinema-ref-primary" type="button" onclick="cinemaReferenceOpenSearch(\'broad\')">결과 우선 검색 ↗</button><button class="cinema-ref-secondary" type="button" onclick="cinemaReferenceOpenSearch(\'precise\')">정밀 필터</button><button class="cinema-ref-secondary" type="button" onclick="cinemaReferenceOpenSearch(\'semantic\')">의미 검색 · 베타</button><button class="cinema-ref-secondary" type="button" onclick="cinemaReferenceCopySearch()">현재 링크 복사</button></div><div id="cinemaReferenceModeLabel" style="font-family:var(--font-mono);font-size:9px;color:#d39b08;margin-top:8px"></div><input class="cinema-ref-input" id="cinemaReferenceSearchUrl" type="text" readonly style="margin-top:6px;font-family:var(--font-mono);font-size:10px"></div>'+
      '<div class="cinema-ref-box"><div class="cinema-ref-label">선택한 스틸의 출처 페이지 기록</div><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,.45fr);gap:8px"><input class="cinema-ref-input" id="cinemaReferenceSourceUrl" type="url" placeholder="https://stillslab.com/gallery/..."><input class="cinema-ref-input" id="cinemaReferenceSourceTitle" type="text" placeholder="작품명 / 에피소드"></div><div class="cinema-ref-label" style="margin-top:11px">프롬프트에 반영할 요소</div><div class="cinema-ref-checks">'+aspects.map(function(a){return'<label class="cinema-ref-check"><input type="checkbox" data-cinema-aspect value="'+a[0]+'"> '+a[1]+'</label>';}).join('')+'</div><label class="cinema-ref-label" style="margin-top:11px">구체적 적용 메모</label><textarea class="cinema-ref-textarea" id="cinemaReferenceNote" placeholder="예: 화면 좌측 인물 배치, 낮은 아침 역광, 숏사이드 구도만 참조"></textarea><div class="cinema-ref-actions" style="margin-top:10px"><button class="cinema-ref-primary" type="button" onclick="cinemaReferenceAdd()">출처·방향 저장</button><button class="cinema-ref-secondary" type="button" onclick="cinemaReferenceClearForm()">입력 초기화</button></div></div>'+
      '<div class="cinema-ref-box"><div class="cinema-ref-label">이 카드에 저장된 레퍼런스 · 최대 3개</div><div class="cinema-ref-list" id="cinemaReferenceSavedList"></div></div><div class="cinema-ref-legal">StillsLab 이미지를 자동 수집하거나 내려받지 않습니다. 검색은 새 탭에서 열리고, 여기에는 출처 페이지와 번역된 연출 요소만 저장됩니다.</div></div></div>';
    modal.addEventListener('click',function(e){if(e.target===modal)closeModal();});document.body.appendChild(modal);document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal.classList.contains('open'))closeModal();});modal.querySelector('#cinemaReferenceSemantic').addEventListener('input',function(){refreshPreview();});return modal;
  }
  function openModal(shotId){const shot=shotById(shotId);if(!shot)return;activeShotId=String(shotId);searchMode='broad';const modal=createModal();document.getElementById('cinemaReferenceShotLabel').textContent=String(shot.id||'')+' · '+String(shot.frame||shot.desc||'');document.getElementById('cinemaReferenceSemantic').value=semanticSeed(shot);refreshPreview('broad');clearForm();renderSaved();modal.classList.add('open');}
  function closeModal(){const modal=document.getElementById('cinemaReferenceModal');if(modal)modal.classList.remove('open');}
  function refreshPreview(mode){const shot=shotById(activeShotId);if(!shot)return null;if(['broad','precise','semantic'].includes(mode))searchMode=mode;const input=document.getElementById('cinemaReferenceSemantic'),spec=searchSpec(shot,input&&input.value,searchMode),out=document.getElementById('cinemaReferenceSearchUrl'),facets=document.getElementById('cinemaReferenceFacets'),label=document.getElementById('cinemaReferenceModeLabel');if(out)out.value=spec.url;if(facets)facets.innerHTML=spec.facets.map(function(f){return'<span class="cinema-ref-chip">'+esc(f)+'</span>';}).join('');if(label)label.textContent=spec.mode==='broad'?'결과 우선 · 영화 + 핵심 필터 1개':spec.mode==='precise'?'정밀 필터 · 카드 조건 전체 적용':'의미 검색 베타 · 결과가 없으면 결과 우선 검색 사용';return spec;}
  function openSearch(mode){const spec=refreshPreview(mode);if(!spec)return;const win=window.open(spec.url,'_blank','noopener,noreferrer');if(win)win.opener=null;}
  async function copySearch(){const spec=refreshPreview();if(!spec)return;try{await navigator.clipboard.writeText(spec.url);}catch(e){const input=document.getElementById('cinemaReferenceSearchUrl');if(input){input.select();document.execCommand('copy');}}}
  function clearForm(){['cinemaReferenceSourceUrl','cinemaReferenceSourceTitle','cinemaReferenceNote'].forEach(function(id){const el=document.getElementById(id);if(el)el.value='';});document.querySelectorAll('[data-cinema-aspect]').forEach(function(el){el.checked=false;});}
  function validSource(value){try{const u=new URL(String(value||'').trim()),host=u.hostname.toLowerCase();return u.protocol==='https:'&&(host==='stillslab.com'||host==='www.stillslab.com');}catch(e){return false;}}
  function addReference(){const shot=shotById(activeShotId);if(!shot)return;const url=String(document.getElementById('cinemaReferenceSourceUrl').value||'').trim(),title=String(document.getElementById('cinemaReferenceSourceTitle').value||'').trim(),note=String(document.getElementById('cinemaReferenceNote').value||'').trim(),aspects=Array.from(document.querySelectorAll('[data-cinema-aspect]:checked')).map(function(el){return el.value;});if(!validSource(url)){alert('stillslab.com의 갤러리 출처 페이지 URL을 입력하세요.');return;}if(!aspects.length||!note){alert('반영 요소와 구체적 적용 메모를 입력하세요.');return;}const data=loadState(),items=Array.isArray(data[activeShotId])?data[activeShotId].slice():[];if(items.length>=3){alert('컷당 최대 3개입니다.');return;}if(items.some(function(i){return i.url===url;})){alert('이미 저장된 출처입니다.');return;}items.push({id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now()),source:'StillsLab',url:url,title:title||'Untitled reference',aspects:aspects,note:note,searchUrl:(refreshPreview()||{}).url||'',createdAt:new Date().toISOString()});data[activeShotId]=items;if(!saveState(data)){alert('저장하지 못했습니다.');return;}clearForm();renderSaved();if(typeof directorRecordLog==='function')directorRecordLog('cinema-reference-added',shot,{reason:(title||'StillsLab')+' · '+aspects.join(', ')});if(typeof buildStoryboardTimeline==='function')buildStoryboardTimeline();if(typeof saveStoryboardState==='function')saveStoryboardState('cinema-reference-added');}
  function deleteReference(id){if(!confirm('이 시네마 레퍼런스를 삭제할까요?'))return;const data=loadState();data[activeShotId]=(data[activeShotId]||[]).filter(function(i){return i.id!==id;});if(!data[activeShotId].length)delete data[activeShotId];saveState(data);renderSaved();if(typeof buildStoryboardTimeline==='function')buildStoryboardTimeline();if(typeof saveStoryboardState==='function')saveStoryboardState('cinema-reference-deleted');}
  function renderSaved(){const root=document.getElementById('cinemaReferenceSavedList');if(!root)return;const items=itemsForShot(activeShotId);root.innerHTML=items.length?items.map(function(i){return'<div class="cinema-ref-item"><div class="cinema-ref-item-head"><div><strong style="font-size:12px">'+esc(i.title)+'</strong><div style="font-family:var(--font-mono);font-size:9px;color:#d39b08;margin-top:3px">'+esc((i.aspects||[]).join(' · '))+'</div></div><button class="cinema-ref-secondary" style="min-height:28px;padding:4px 7px;color:var(--er)" onclick="cinemaReferenceDelete(\''+esc(i.id)+'\')">삭제</button></div><a href="'+esc(i.url)+'" target="_blank" rel="noopener noreferrer">'+esc(i.url)+'</a><div class="cinema-ref-item-note">'+esc(i.note)+'</div></div>';}).join(''):'<div style="font-size:11px;color:var(--mu)">저장된 레퍼런스가 없습니다.</div>';}
  function renderControl(shot){const items=itemsForShot(String(shot&&shot.id||'')),safe=typeof sbQuoteJs==='function'?sbQuoteJs(shot.id):String(shot.id||'').replace(/'/g,"\\'"),summary=items.length?items.map(function(i){return i.title||'StillsLab';}).join(' · '):'샷 정보로 결과 우선 검색';return'<div class="cinema-ref-mini" onclick="event.stopPropagation()"><div class="cinema-ref-mini-head"><button class="cinema-ref-btn" onclick="cinemaReferenceOpen(\''+safe+'\')">🎬 CINEMA REF'+(items.length?' · '+items.length:'')+'</button><span class="cinema-ref-count">LINK ONLY · NO SCRAPING</span></div><div class="cinema-ref-summary">'+esc(summary)+'</div></div>';}
  function promptDirection(shot){const items=itemsForShot(String(shot&&shot.id||''));if(!items.length)return'';const names={composition:'composition','shot-size':'shot size',angle:'camera angle',lighting:'lighting direction and contrast',color:'color palette','lens-depth':'lens perspective and depth of field',blocking:'subject blocking',mood:'emotional tone'},lines=['CINEMA REFERENCE TRANSLATION — VISUAL TRAITS ONLY','Apply only the written visual traits below. Do not reproduce referenced actor identity, character, costume, production design, logo, signage, text, trademark, or story-specific intellectual property.'];items.forEach(function(i,n){lines.push('REFERENCE '+(n+1)+' TRAITS ['+(i.aspects||[]).map(function(k){return names[k]||k;}).join(', ')+']: '+String(i.note||'').trim());});return lines.join('\n');}
  function appendDirection(shot,prompt){const d=promptDirection(shot);return!d||String(prompt||'').includes('CINEMA REFERENCE TRANSLATION')?String(prompt||''):String(prompt||'')+'\n\n'+d;}
  function exportState(){return JSON.parse(JSON.stringify(loadState()));}
  function importState(data){if(data&&typeof data==='object')saveState(data);}

  window.CINEMA_REFERENCE_VERSION=VERSION;
  window.renderSBCinemaReferenceControl=renderControl;
  window.appendCinemaReferenceDirection=appendDirection;
  window.cinemaReferenceSearchSpec=searchSpec;
  window.cinemaReferenceValidSource=validSource;
  window.cinemaReferenceItems=itemsForShot;
  window.cinemaReferencePromptDirection=promptDirection;
  window.cinemaReferenceExportState=exportState;
  window.cinemaReferenceImportState=importState;
  window.cinemaReferenceOpen=openModal;
  window.cinemaReferenceClose=closeModal;
  window.cinemaReferenceOpenSearch=openSearch;
  window.cinemaReferenceCopySearch=copySearch;
  window.cinemaReferenceClearForm=clearForm;
  window.cinemaReferenceAdd=addReference;
  window.cinemaReferenceDelete=deleteReference;
})();
