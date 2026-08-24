(function(root, factory) {
  const registry = factory();
  root.ZippyPipelineModels = registry;
  if (typeof module === 'object' && module.exports) module.exports = registry;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const image = {
    textToImage: [
      { id:'zimage-turbo', label:'Z-Image Turbo', purpose:'fast-main', precision:'bf16' },
      { id:'zimage-turbo-nvfp4', label:'Z-Image Turbo NVFP4', purpose:'fast-low-vram', precision:'nvfp4' },
      { id:'qwen-image-turbo', label:'Qwen-Image 2512 Turbo', purpose:'quality-fast', steps:2 },
      { id:'qwen-image-lightning', label:'Qwen-Image 2512 Lightning', purpose:'quality', steps:4 },
      { id:'flux-klein', label:'FLUX.2 Klein 4B', purpose:'lightweight-flux', precision:'fp8' }
    ],
    edit: [
      { id:'qwen-edit-2509-l4', label:'Qwen Image Edit 2509 FP8', purpose:'fast-edit', steps:4 },
      { id:'qwen-edit-2509-l8', label:'Qwen Image Edit 2509 FP8', purpose:'detail-edit', steps:8 },
      { id:'qwen-edit-2511', label:'Qwen Image Edit 2511 BF16', purpose:'quality-edit', steps:4 }
    ]
  };

  const video = {
    wan: {
      id:'wan', label:'Wan 2.2 I2V 14B', purpose:'camera-motion', fps:16,
      summary:'Wan 2.2 I2V 14B · Camera LoRA · Local 5080',
      route:'Local Gateway → ComfyUI 8188',
      nodes:[['input','입력','START + END','키프레임'],['condition','조건','영상 프롬프트','카메라 무빙 LoRA'],['model','모델','Wan 2.2 I2V 14B','High + Low Noise'],['sample','샘플링','Lightning 4step','I2V sampler'],['finish','후처리','VAE Decode','프레임 복원'],['output','출력','MP4','Local 5080']]
    },
    'minimax-h3': {
      id:'minimax-h3', label:'MiniMax H3 I2V + Native Audio', purpose:'fast-insert', fps:24,
      summary:'MiniMax H3 FL2VA · INT8 ConvRot · Turbo 8step',
      route:'Local Gateway → ComfyUI 8188 · Native Audio',
      nodes:[['input','입력','START + END','First / Last Frame'],['condition','조건','Qwen3-VL 32B','NVFP4 AWQ'],['model','모델','MiniMax H3 FL2VA','Pruned INT8 ConvRot'],['sample','샘플링','Turbo 8step','res_multistep'],['finish','후처리','Video + Audio VAE','24fps · Stereo'],['output','출력','MP4 + Audio','Local 5080']]
    },
    ltx25: {
      id:'ltx25', label:'LTX 2.5 22B Distilled NVFP4 + Native Audio', purpose:'cinematic-i2v', fps:24,
      summary:'LTX 2.5 22B Distilled · Comfy NVFP4 · Fixed 8step',
      route:'Local Gateway → ComfyUI 8188 · Conv VAE',
      nodes:[['input','입력','START Frame','Image to Video'],['condition','조건','Gemma4 12B','Comfy INT8 ConvRot'],['model','모델','LTX 2.5 Distilled','Comfy NVFP4'],['sample','샘플링','Fixed 8step','CFG 1'],['finish','후처리','Conv VAE','저메모리 Decode'],['output','출력','MP4 + Audio','24fps']]
    },
    ltx23: {
      id:'ltx23', label:'LTX 2.3 22B', purpose:'legacy-compatibility', fps:16,
      summary:'LTX 2.3 22B · Legacy Compatibility',
      route:'Local Gateway → ComfyUI 8188',
      nodes:[['input','입력','START Frame','Image to Video'],['condition','조건','Prompt Encoder','Legacy preset'],['model','모델','LTX 2.3 22B','Distilled FP8'],['sample','샘플링','Legacy sampler','16fps preset'],['finish','후처리','VAE Decode','Video'],['output','출력','MP4','Local 5080']]
    },
    seedance25: {
      id:'seedance25', label:'ByteDance Seedance 2.5', purpose:'multi-scene', fps:24,
      summary:'ByteDance Seedance 2.5 · Comfy Credits · Multi-scene',
      route:'Local Gateway → Comfy Partner Node',
      nodes:[['input','입력','START + References','멀티모달 입력'],['condition','조건','30초 씬 프롬프트','Shot timing'],['model','모델','Seedance 2.5','Partner Node'],['sample','생성','Cloud Queue','Comfy Credits'],['finish','후처리','Audio + Video','서비스 출력'],['output','출력','MP4 + Audio','최대 30초']]
    }
  };

  const audio = {
    effects: [{ id:'stable-audio-open-1', label:'Stable Audio Open 1.0', purpose:'sfx-ambience' }],
    music: [{ id:'ace-step-1.5-xl-turbo', label:'ACE-Step v1.5 XL Turbo', purpose:'music-song-bgm', precision:'bf16' }]
  };

  function getVideoProfile(id) { return video[id] || video.wan; }

  function getVideoRenderOptions(id, durationSeconds, ratio) {
    if (id === 'seedance25') return { fps:24 };
    if (id === 'ltx25') {
      const dimensions = {'16:9':[736,416],'9:16':[416,736],'1:1':[576,576]}[ratio] || [736,416];
      const frames = 1 + Math.round((durationSeconds * 24) / 8) * 8;
      return { fps:24, frames:Math.max(41, Math.min(241, frames)), width:dimensions[0], height:dimensions[1] };
    }
    if (id !== 'minimax-h3') return { fps:16 };
    const dimensions = {'16:9':[1344,768],'9:16':[768,1344],'1:1':[768,768]}[ratio] || [1344,768];
    const targetFrames = Math.max(5, Math.round(durationSeconds * 24));
    const snappedFrames = targetFrames + ((5 - (targetFrames % 17) + 17) % 17);
    return { fps:24, frames:Math.max(124, Math.min(362, snappedFrames)), width:dimensions[0], height:dimensions[1] };
  }

  const workflowLabels = Object.keys(video).reduce(function(labels, id) {
    labels[id] = video[id].label;
    return labels;
  }, {});

  return Object.freeze({
    version:'1.0.0',
    image:Object.freeze(image),
    video:Object.freeze(video),
    audio:Object.freeze(audio),
    workflowLabels:Object.freeze(workflowLabels),
    getVideoProfile,
    getVideoRenderOptions
  });
});
