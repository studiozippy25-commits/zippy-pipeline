(function(){
  'use strict';
  var face=null,result=null,resultMime='image/png';
  function el(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function field(id,fallback){var node=el(id);return String(node&&node.value||fallback||'').trim();}
  function status(text,type){var node=el('sheetMakerStatus');if(!node)return;node.textContent=text;node.className='sm-status '+(type||'');}
  function prompt(){
    return 'Character reference sheet as FOUR full-body views in a row on a clean white studio background — FRONT, 3/4, SIDE PROFILE, BACK — plus one large face close-up inset panel.\n\nSubject: the same character, identity strictly from the attached reference face. Do not beautify, age-shift, replace, or merge the identity.\nHair: '+field('smHair','preserve the attached reference hair exactly')+'.\nMakeup: '+field('smMakeup','natural skin texture and restrained camera-ready makeup')+'.\nWardrobe: '+field('smOutfit','the complete project-approved outfit, with exact material, construction, fit, closures, layers, and footwear')+'.\nWorn accessories: '+field('smAccessories','no additional accessories')+'.\nHonest wear: '+field('smWear','natural fabric creases, slight edge wear, and subtle contact marks')+'.\n\nSame person, same face, same body proportions, same hairstyle, same outfit, same accessories, and the same neutral standing-pose logic in every view. Every garment layer remains structurally identical from all four directions. Clean even studio lighting like a fashion lookbook turnaround, true skin tone, true fabric color, realistic garment weight, full feet visible, generous white margin. Photorealistic, ultra-detailed. No readable text, no labels, no logo, no watermark, no extra person, no duplicate panel, no cropped feet.';
  }
  function refreshPrompt(){var node=el('smPrompt');if(node)node.value=prompt();}
  function loadFace(files){var file=files&&files[0];if(!file)return;var reader=new FileReader();reader.onload=function(e){var data=String(e.target.result||'');face={b64:data.split(',')[1]||'',mime:file.type||'image/jpeg',name:file.name};var box=el('smFacePreview');if(box)box.innerHTML='<img src="'+data+'" alt="'+esc(file.name)+'"><span>'+esc(file.name)+'</span>';status('얼굴 기준 사진 준비됨','ok');};reader.readAsDataURL(file);}
  async function generate(){
    if(!face){status('먼저 얼굴 기준 사진 1장을 올려주세요.','bad');return;}
    refreshPrompt();var btn=el('smGenerate');if(btn){btn.disabled=true;btn.textContent='GPT Image 2 생성 중...';}status('정면·3/4·측면·후면과 얼굴 확대를 한 장에 생성 중입니다.','working');
    try{
      if(typeof callGPTImage!=='function')throw new Error('GPT Image 연결을 찾지 못했습니다.');
      var out=await callGPTImage({images:[{b64:face.b64,mime:face.mime,_type:'character',_label:'identity reference face only'}],prompt:prompt()});
      if(!out||!out.imgB64)throw new Error('이미지 결과가 비어 있습니다.');
      result=out.imgB64;resultMime='image/png';var box=el('smResult');if(box)box.innerHTML='<img src="data:'+resultMime+';base64,'+result+'" alt="생성된 얼굴 고정 시트">';var actions=el('smResultActions');if(actions)actions.hidden=false;status('시트 생성 완료 · 얼굴과 의상 일치를 확인한 뒤 에셋으로 저장하세요.','ok');
    }catch(e){status('생성 실패 · '+(e&&e.message?e.message:e),'bad');}
    finally{if(btn){btn.disabled=false;btn.textContent='GPT Image 2로 시트 생성';}}
  }
  function download(){if(!result)return;var a=document.createElement('a');a.href='data:'+resultMime+';base64,'+result;a.download='face_lock_sheet_'+Date.now()+'.png';a.click();}
  function saveAsset(){
    if(!result){status('먼저 시트를 생성하세요.','bad');return;}
    if(typeof assetLib==='undefined'){status('에셋 라이브러리를 찾지 못했습니다.','bad');return;}
    if(!Array.isArray(assetLib.char))assetLib.char=[];assetLib.char.push({b64:result,mime:resultMime,name:'GPT_face_lock_sheet_'+Date.now()+'.png',source:'sheet-maker',role:'character-sheet'});
    if(typeof renderAssetGrid==='function')renderAssetGrid('char');if(typeof syncAssetBucketToStoryboard==='function')syncAssetBucketToStoryboard('char');if(typeof updateAssetCounts==='function')updateAssetCounts();if(typeof scheduleProjectAssetPersistence==='function')scheduleProjectAssetPersistence();status('에셋 라이브러리에 저장됨 · 스토리보드 인물 레퍼런스로 사용할 수 있습니다.','ok');
  }
  function copyVideoRule(){var text='Use @Image 1 only as the identity, hair, body-proportion, wardrobe, and accessory reference for the same character in every shot. Preserve the shot composition from the storyboard first frame. Never render a reference sheet or duplicate a subject.';if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text);status('영상용 시트 안전문구를 복사했습니다.','ok');}
  function init(){refreshPrompt();var drop=el('smFaceDrop');if(drop&&!drop.dataset.bound){drop.dataset.bound='1';drop.addEventListener('dragover',function(e){e.preventDefault();drop.classList.add('drag');});drop.addEventListener('dragleave',function(){drop.classList.remove('drag');});drop.addEventListener('drop',function(e){e.preventDefault();drop.classList.remove('drag');loadFace(e.dataTransfer.files);});}}
  window.ZippySheetMaker={init:init,loadFace:loadFace,refreshPrompt:refreshPrompt,generate:generate,download:download,saveAsset:saveAsset,copyVideoRule:copyVideoRule,prompt:prompt};
  document.addEventListener('DOMContentLoaded',init);
})();
