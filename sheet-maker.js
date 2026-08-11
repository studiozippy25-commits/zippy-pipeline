(function(){
  'use strict';
  var mode='character',reference=null,result=null,resultMime='image/png';
  function el(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function field(id,fallback){var node=el(id);return String(node&&node.value||fallback||'').trim();}
  function status(text,type){var node=el('sheetMakerStatus');if(!node)return;node.textContent=text;node.className='sm-status '+(type||'');}
  function characterPrompt(){
    return [
      'CHARACTER IDENTITY MASTER SHEET — one consistent person, not five reinterpretations.',
      'Image 1 is the sole primary identity authority. Preserve the exact skull and facial geometry: forehead and hairline, brow shape, eye size and spacing, eyelids, nose bridge and nostrils, philtrum, lip contour, jaw, chin, cheek volume, ears, skin tone, age, and natural asymmetry. Do not average, beautify, idealize, de-age, gender-shift, replace, or merge the face.',
      '',
      'Layout: FOUR full-body views in one row — FRONT, 3/4, SIDE PROFILE, BACK — plus one large face close-up inset. Every panel depicts the same person at the same moment.',
      'Hair: '+field('smHair','preserve Image 1 exactly, including hairline, part, length, curl, bangs, and pins')+'.',
      'Makeup: '+field('smMakeup','natural pores, fine facial hair, tonal variation, and restrained camera-ready makeup')+'.',
      'Wardrobe: '+field('smOutfit','one project-approved outfit with exact material, construction, fit, closures, layers, and footwear')+'.',
      'Worn accessories: '+field('smAccessories','none')+'.',
      'Honest wear: '+field('smWear','natural fabric creases and subtle contact wear')+'.',
      '',
      'Lock the same body proportions, shoulder width, limb length, posture logic, hairstyle, garment construction, accessories, and footwear across every view. The back and profile must be physically inferred from the same body and garment, not redesigned. Neutral relaxed stance, hands visible with five correct fingers, full feet visible.',
      'Clean white studio cyclorama, even soft lookbook lighting, true skin and fabric color, 85mm-equivalent facial rendering without wide-angle distortion, generous margin. Photorealistic and detailed but not beauty-retouched.',
      'No readable text, panel label, logo, watermark, extra person, duplicated limb, cropped feet, identity drift, face morph, doll skin, oversized glassy eyes, fashion pose, smile change, collage border, or alternate outfit.'
    ].join('\n');
  }
  function spacePrompt(){
    return [
      'LOCATION 360-DEGREE CONTINUITY MASTER SHEET — one real space observed from one locked camera origin, not multiple similar rooms.',
      'Image 1 is the sole geometry, material, architecture, furniture, weather, time-of-day, and color authority. Preserve every visible structural fact; infer unseen sides conservatively and never redesign the location.',
      '',
      'Location: '+field('smSpaceName','the exact location shown in Image 1')+'.',
      'Geometry and scale: '+field('smSpaceGeometry','preserve the measured proportions and walkable scale implied by Image 1')+'.',
      'Continuity anchors: '+field('smSpaceAnchor','lock the exact doors, windows, columns, corners, stairs, permanent fixtures, furniture, and distances')+'.',
      'Lighting origin: '+field('smSpaceLight','one motivated source matching Image 1; identical direction and shadow logic in all panels')+'.',
      '',
      'Use a clean six-panel production sheet. Panels 1–4 are rectilinear 24mm views from the SAME fixed camera position at 1.6m eye height, looking exactly 0°, 90°, 180°, and 270°. Panels 5–6 show a ceiling/floor relationship view and a simple visual anchor map without readable labels. Adjacent wall edges, doors, windows, floor seams, ceiling lines, furniture, and light direction must connect continuously from one panel to the next. Keep lens, horizon, exposure, season, weather, object count, wear, and material color identical.',
      'Photorealistic production reference, readable spatial depth, straight verticals, full-frame detail. No people, no vehicle unless permanently present in Image 1, no new room, no moved door, no duplicated furniture, no impossible corridor, no inconsistent window, no fisheye, equirectangular warp, tiny-planet effect, drone angle, floorplan-only graphic, readable text, logo, or watermark.'
    ].join('\n');
  }
  function prompt(){return mode==='space360'?spacePrompt():characterPrompt();}
  function refreshPrompt(){var node=el('smPrompt');if(node)node.value=prompt();}
  function previewPlaceholder(){return mode==='space360'?'<b>+ 장소 기준 사진 1장</b><span>눈높이 · 수평 · 공간 구조와 출입구가 잘 보이는 사진 권장</span>':'<b>+ 얼굴 사진 1장</b><span>정면 · 어깨 위 · 고른 조명 · 피부 질감이 보이는 사진 권장</span>';}
  function syncUi(){
    if(el('smModeCharacter'))el('smModeCharacter').classList.toggle('on',mode==='character');
    if(el('smModeSpace'))el('smModeSpace').classList.toggle('on',mode==='space360');
    if(el('smCharacterFields'))el('smCharacterFields').hidden=mode!=='character';
    if(el('smSpaceFields'))el('smSpaceFields').hidden=mode!=='space360';
    if(el('smReferenceHeading'))el('smReferenceHeading').textContent=mode==='space360'?'1 · 장소 기준 사진':'1 · 얼굴 기준 사진';
    if(el('smModeBadge'))el('smModeBadge').textContent=mode==='space360'?'GPT IMAGE 2 · 360° GEO LOCK':'GPT IMAGE 2 · IDENTITY LOCK';
    if(el('smUsageRule'))el('smUsageRule').innerHTML=mode==='space360'?'<b>영상 사용 원칙</b><br>360° 시트는 공간 구조·앵커·재질·광원만 제공합니다. 쇼트 구도는 스토리보드 첫 프레임을 따르며 시트의 다중 패널을 영상에 재현하지 않습니다.':'<b>영상 사용 원칙</b><br>시트는 얼굴·헤어·체형·의상의 기준만 제공합니다. 영상 구도는 스토리보드 첫 프레임을 따르며, “Never render a reference sheet or duplicate a subject.” 문장을 자동 안전 규칙으로 사용합니다.';
    var box=el('smFacePreview');if(box&&!reference)box.innerHTML=previewPlaceholder();
    if(el('smDeleteReference'))el('smDeleteReference').hidden=!reference;
    status(mode==='space360'?'장소 사진과 공간 연속성 정보를 입력하세요.':'얼굴 사진과 의상 정보를 입력하세요.');
    refreshPrompt();
  }
  function setMode(next){var normalized=next==='space360'?'space360':'character';if(mode===normalized)return;mode=normalized;deleteReference(true);deleteResult(true);syncUi();}
  function loadReference(files){
    var file=files&&files[0];if(!file)return;var reader=new FileReader();reader.onload=function(e){var data=String(e.target.result||'');reference={b64:data.split(',')[1]||'',mime:file.type||'image/jpeg',name:file.name};var box=el('smFacePreview');if(box)box.innerHTML='<img src="'+data+'" alt="'+esc(file.name)+'"><span>'+esc(file.name)+'</span>';if(el('smDeleteReference'))el('smDeleteReference').hidden=false;status(mode==='space360'?'장소 기준 사진 준비됨':'얼굴 정체성 기준 사진 준비됨','ok');};reader.readAsDataURL(file);
  }
  function deleteReference(silent){reference=null;var input=el('smFaceInput');if(input)input.value='';var box=el('smFacePreview');if(box)box.innerHTML=previewPlaceholder();if(el('smDeleteReference'))el('smDeleteReference').hidden=true;if(!silent)status('기준 사진을 삭제했습니다.');}
  function deleteResult(silent){result=null;resultMime='image/png';var box=el('smResult');if(box)box.innerHTML='<span>생성된 시트가 여기에 표시됩니다.</span>';var actions=el('smResultActions');if(actions)actions.hidden=true;if(!silent)status('생성 결과를 삭제했습니다.');}
  async function generate(){
    if(!reference){status(mode==='space360'?'먼저 장소 기준 사진 1장을 올려주세요.':'먼저 얼굴 기준 사진 1장을 올려주세요.','bad');return;}
    refreshPrompt();var btn=el('smGenerate');if(btn){btn.disabled=true;btn.textContent='GPT Image 2 생성 중...';}status(mode==='space360'?'동일한 공간의 0°·90°·180°·270° 연속 시트를 생성 중입니다.':'동일 인물의 정면·3/4·측면·후면과 얼굴 확대를 생성 중입니다.','working');
    try{
      if(typeof callGPTImage!=='function')throw new Error('GPT Image 연결을 찾지 못했습니다.');
      var out=await callGPTImage({images:[{b64:reference.b64,mime:reference.mime,_type:mode==='space360'?'background':'character',_label:mode==='space360'?'sole location geometry authority':'sole primary identity authority'}],prompt:prompt()});
      if(!out||!out.imgB64)throw new Error('이미지 결과가 비어 있습니다.');
      result=out.imgB64;resultMime='image/png';var box=el('smResult');if(box)box.innerHTML='<img src="data:'+resultMime+';base64,'+result+'" alt="'+(mode==='space360'?'생성된 배경 360도 시트':'생성된 얼굴 고정 시트')+'">';var actions=el('smResultActions');if(actions)actions.hidden=false;status(mode==='space360'?'360° 공간 시트 생성 완료 · 벽·문·창문·광원의 연결을 확인하세요.':'시트 생성 완료 · 얼굴·체형·의상 일치를 확인하세요.','ok');
    }catch(e){status('생성 실패 · '+(e&&e.message?e.message:e),'bad');}
    finally{if(btn){btn.disabled=false;btn.textContent='GPT Image 2로 시트 생성';}}
  }
  function safeName(v){return String(v||'ASSET').trim().replace(/[^a-z0-9가-힣_-]+/gi,'_').replace(/^_+|_+$/g,'').toUpperCase()||'ASSET';}
  function fixedName(){return mode==='space360'?'LOCATION__'+safeName(field('smSpaceName','SPACE'))+'__360_SHEET.png':'CHARACTER__'+safeName(reference&&reference.name&&reference.name.replace(/\.[^.]+$/,''))+'__IDENTITY_SHEET.png';}
  function download(){if(!result)return;var a=document.createElement('a');a.href='data:'+resultMime+';base64,'+result;a.download=fixedName();a.click();}
  function saveAsset(){
    if(!result){status('먼저 시트를 생성하세요.','bad');return;}if(typeof assetLib==='undefined'){status('에셋 라이브러리를 찾지 못했습니다.','bad');return;}
    var bucket=mode==='space360'?'space-a':'char';if(!Array.isArray(assetLib[bucket]))assetLib[bucket]=[];assetLib[bucket].push({b64:result,mime:resultMime,name:fixedName(),source:'sheet-maker',role:mode==='space360'?'space-360-sheet':'character-identity-sheet'});
    if(typeof renderAssetGrid==='function')renderAssetGrid(bucket);if(typeof syncAssetBucketToStoryboard==='function')syncAssetBucketToStoryboard(bucket);if(typeof updateAssetCounts==='function')updateAssetCounts();if(typeof scheduleProjectAssetPersistence==='function')scheduleProjectAssetPersistence();status(mode==='space360'?'공간 에셋에 저장됨 · GEO와 스토리보드 배경 레퍼런스로 사용할 수 있습니다.':'캐릭터 에셋에 저장됨 · 스토리보드 인물 레퍼런스로 사용할 수 있습니다.','ok');
  }
  function copyVideoRule(){var text=mode==='space360'?'Use @Image 1 only for location geometry, scale, materials, continuity anchors, weather, and light direction. Preserve the storyboard first-frame composition and camera. Never render the 360 sheet, multiple panels, a floorplan, or a duplicated room.':'Use @Image 1 only as the sole identity, hair, body-proportion, wardrobe, and accessory authority for the same character in every shot. Preserve the storyboard first-frame composition. Never render a reference sheet or duplicate a subject.';if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text);status('영상용 시트 안전문구를 복사했습니다.','ok');}
  function init(){syncUi();var drop=el('smFaceDrop');if(drop&&!drop.dataset.bound){drop.dataset.bound='1';drop.addEventListener('dragover',function(e){e.preventDefault();drop.classList.add('drag');});drop.addEventListener('dragleave',function(){drop.classList.remove('drag');});drop.addEventListener('drop',function(e){e.preventDefault();drop.classList.remove('drag');loadReference(e.dataTransfer.files);});}}
  window.ZippySheetMaker={init:init,setMode:setMode,loadReference:loadReference,loadFace:loadReference,deleteReference:deleteReference,deleteResult:deleteResult,refreshPrompt:refreshPrompt,generate:generate,download:download,saveAsset:saveAsset,copyVideoRule:copyVideoRule,prompt:prompt,state:function(){return {mode:mode,reference:reference,result:result};}};
  document.addEventListener('DOMContentLoaded',init);
})();
