(function (root) {
  'use strict';
  const SOURCES = {
    cinematography: 'https://vvsvs.pro/cinematique',
    h3: 'https://oasis-dentist-28a.notion.site/5-MiniMax-H3-3b67425e612281e78e7fd69907054621',
    seedance: 'https://oasis-dentist-28a.notion.site/4-Seedance-2-5-3b27425e61228192892cdb9a57b368aa'
  };
  const DEFAULT_STYLE = 'Documentary / vlog observation. Available light, natural exposure and contrast, believable material variation and lived-in detail. Preserve the declared project medium and visual identity.';
  function clean(value, limit = 12000) { return String(value == null ? '' : value).trim().slice(0, limit); }
  function hasKeyword(text, word) {
    if (/^[a-z -]+$/i.test(word)) return new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text);
    return text.includes(word.toLowerCase());
  }
  function recommend(input, catalog) {
    if (!Array.isArray(catalog) || !catalog.length) throw new Error('촬영 기법 목록을 불러오지 못했습니다.');
    const scene = [input.description, input.initialState, input.endState].map(v => clean(v)).join(' ').toLowerCase();
    const byId = new Map(catalog.map(item => [item.id, item]));
    const rankings = kind => catalog.filter(item => item.kind === kind).map(item => {
      const matches = item.keywords.filter(word => hasKeyword(scene, word));
      return { item, matches, score: matches.reduce((sum, word) => sum + Math.min(word.length, 12), 0) };
    }).sort((a, b) => b.score - a.score);
    function select(kind, fallback) {
      const override = clean(input[kind]);
      if (override && override !== 'auto') {
        const chosen = byId.get(override);
        if (!chosen || chosen.kind !== kind) throw new Error('유효하지 않은 촬영 기법: ' + override);
        return { item: chosen, why: '직접 선택', manual: true };
      }
      const ranked = rankings(kind);
      // ponytail: explainable keyword routing; add semantic retrieval if natural-language coverage proves insufficient.
      if (ranked[0] && ranked[0].score) return { item: ranked[0].item, why: '장면 단서: ' + ranked[0].matches.join(', '), manual: false };
      const chosen = byId.get(fallback);
      if (!chosen) throw new Error('기본 촬영 기법이 목록에 없습니다: ' + fallback);
      return { item: chosen, why: clean(input.dialogue) ? '대사 전달과 입 모양을 읽기 위한 기본 구도' : '추가 공간·이동 단서가 없어 안정적인 관찰 구도로 제안', manual: false };
    }
    const f = select('framing', clean(input.dialogue) ? 'medium-close-up' : 'medium-shot');
    const m = select('movement', 'static-shot');
    return {
      framing: { ...f.item, manual: f.manual }, movement: { ...m.item, manual: m.manual },
      reason: f.item.nameKo + ': ' + f.why + '. ' + m.item.nameKo + ': ' + m.why + '.',
      method: 'local-keyword-rules-v1',
      alternatives: { framing: rankings('framing').filter(x => x.item.id !== f.item.id).slice(0, 3).map(x => x.item), movement: rankings('movement').filter(x => x.item.id !== m.item.id).slice(0, 3).map(x => x.item) }
    };
  }
  function reference(raw, model) {
    const type = clean(raw.type), index = Number(raw.index);
    if (!['image', 'video', 'audio'].includes(type) || !Number.isInteger(index) || index < 1) throw new Error('레퍼런스 종류와 업로드 번호를 확인하세요.');
    const limits = model === 'h3' ? {image:9,video:3,audio:3} : {image:30,video:10,audio:10};
    if (index > limits[type]) throw new Error('가이드의 레퍼런스 번호 범위를 넘었습니다.');
    const role = clean(raw.role, 2000), exclude = clean(raw.exclude, 2000);
    if (!role || !exclude) throw new Error('각 레퍼런스에 역할과 가져오지 않을 요소를 입력하세요.');
    const result = { type, index, role, exclude };
    if (Array.isArray(raw.usedBy)) result.usedBy = raw.usedBy.map(v => clean(v,100));
    if (raw.label) result.label = clean(raw.label, 200);
    if (raw.url) {
      const url = new URL(String(raw.url));
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('레퍼런스 URL을 확인하세요.');
      // Signed URLs and secrets are deliberately not included in a portable handoff.
      if (url.search || url.hash) throw new Error('서명·쿼리가 없는 레퍼런스 경로를 사용하세요.');
      result.url = url.href;
    }
    return result;
  }
  function tag(ref, model) {
    const name = ref.type === 'image' ? (model === 'h3' ? 'Picture' : 'Image') : ref.type[0].toUpperCase() + ref.type.slice(1);
    return model === 'h3' ? '<' + name + ' ' + ref.index + '>' : '@' + name + ' ' + ref.index;
  }
  function time(seconds) {
    const millis = Math.round(seconds * 1000);
    return String(Math.floor(millis / 60000)).padStart(2,'0') + ':' + (millis % 60000 / 1000).toFixed(3).padStart(6,'0');
  }
  function compile(input, catalog) {
    if (!input || !['h3','seedance'].includes(input.model)) throw new Error('H3 또는 Seedance 2.5를 선택하세요.');
    const model = input.model, projectKey = clean(input.projectKey, 150);
    if (!projectKey) throw new Error('프로젝트를 먼저 선택하세요.');
    if (!Array.isArray(input.shots) || !input.shots.length || input.shots.length > 30) throw new Error('1개 이상의 쇼트를 입력하세요.');
    let elapsed = 0;
    const ids = new Set();
    const shots = input.shots.map((raw, index) => {
      const id = clean(raw.id,100) || 'SHOT-' + (index + 1);
      const duration = Number(raw.duration);
      if (ids.has(id)) throw new Error('중복된 쇼트 ID: ' + id);
      ids.add(id);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 30) throw new Error('쇼트 길이를 확인하세요.');
      const shot = { id, description: clean(raw.description), initialState: clean(raw.initialState), endState: clean(raw.endState), dialogue: String(raw.dialogue == null ? '' : raw.dialogue), speaker: clean(raw.speaker,200), soundscape: clean(raw.soundscape,2000), duration, framing: clean(raw.framing)||'auto', movement: clean(raw.movement)||'auto', voiceover: raw.voiceover === true };
      if (!shot.description || !shot.initialState || !shot.endState) throw new Error(id + ': 행동·시작 상태·종료 상태를 모두 입력하세요.');
      if (shot.dialogue.length > 4000) throw new Error('대사가 너무 깁니다.');
      if (shot.dialogue.trim() && !shot.speaker) throw new Error(id + ': 대사의 화자를 입력하세요.');
      if (model === 'h3' && /<\/?d>|<scenetrans>|<cutoff>/i.test(shot.dialogue)) throw new Error('대사 칸에는 태그 없이 실제 대사만 입력하세요.');
      shot.startSeconds = elapsed;
      elapsed = Math.round((elapsed + duration) * 1000) / 1000;
      shot.endSeconds = elapsed;
      shot.camera = recommend(shot, catalog);
      return shot;
    });
    const maxSeconds = model === 'h3' ? 15 : 30;
    if (elapsed > maxSeconds || (model === 'h3' && elapsed < 5)) throw new Error(model === 'h3' ? 'H3 구성은 합계 5–15초로 작성하세요. 서비스별 실제 한도는 별도 확인하세요.' : 'Seedance 구성은 합계 30초 이내로 작성하세요.');
    const refs = (input.references || []).map(raw => reference(raw, model));
    if (refs.length > (model === 'h3' ? 12 : 50)) throw new Error('레퍼런스 합계가 가이드 한도를 넘었습니다.');
    if (new Set(refs.map(r=>r.type+':'+r.index)).size !== refs.length) throw new Error('레퍼런스 번호가 중복됩니다.');
    if (model === 'h3' && refs.length && refs.every(r => r.type === 'audio')) throw new Error('H3 오디오 레퍼런스만 단독으로 사용할 수 없습니다.');
    if (refs.some(r=>r.usedBy && r.usedBy.some(id=>!ids.has(id)))) throw new Error('레퍼런스가 선택되지 않은 쇼트를 가리킵니다.');
    const style = clean(input.style, 2000) || DEFAULT_STYLE;
    const music = clean(input.music, 2000) || 'No non-diegetic score. Keep the mix to diegetic sound only.';
    const refLines = refs.map(r => tag(r,model) + ' defines ' + r.role + '. Do not use ' + r.exclude + '.');
    const speakers = [...new Set(shots.filter(s=>s.dialogue.trim()).map(s=>s.speaker))];
    const cameraLine = shot => shot.camera.framing.instruction + ' ' + shot.camera.movement.instruction;
    const assigned = shot => refs.filter(r=>!r.usedBy || r.usedBy.includes(shot.id)).map(r=>tag(r,model));
    const continuity = 'Maintain the declared identities, headcount, wardrobe, prop ownership, handedness, geography, screen direction and motivated lighting. Preserve physical contact and consistent scale. Do not introduce extra events, characters, props, subtitles or watermarks.';
    let prompt, fields;
    if (model === 'h3') {
      const visual = shots.map((shot,index)=> {
        const opening = '[Shot ' + (index+1) + '] ' + (index ? 'At ' + time(shot.startSeconds) + ', the camera cuts to the following shot. ' : '');
        const spoken = shot.dialogue.trim() ? '\n' + shot.speaker + ' (S' + (speakers.indexOf(shot.speaker)+1) + ') says' + (shot.voiceover ? ' in an off-screen voiceover' : '') + ': <d>[Korean] ' + shot.dialogue + '</d>' + (shot.voiceover ? ' while their lips remain completely closed.' : ' Keep the mouth and face clearly framed while speaking.') : '\nNo dialogue or voiceover in this shot.';
        return opening + 'Initial state: ' + shot.initialState + '\nVisible action: ' + shot.description + '\nCamera: ' + cameraLine(shot) + '\nEnd state: ' + shot.endState + (assigned(shot).length ? '\nUse only these references for this shot: '+assigned(shot).join(', ')+'.' : '') + spoken;
      }).join('\n\n');
      fields = {
        integrated_multimodal_description: style + '\nDuration: ' + elapsed + ' seconds.\n' + (shots.length===1 ? 'One continuous shot, no cuts or dissolves.' : 'Hard cuts only, no dissolves.') + '\n\n' + visual + '\n\n' + continuity,
        overall_soundscape: shots.map((s,i)=>'[Shot '+(i+1)+'] '+(s.soundscape || 'Quiet location ambience and only the practical sounds caused by the visible action.')).join('\n'),
        non_diegetic_music: music
      };
      prompt = (refLines.length ? refLines.join('\n')+'\n\n' : '') + Object.entries(fields).map(([key,value])=>key+': '+value).join('\n\n');
    } else {
      const stages = shots.map((shot,index)=>'[Stage '+(index+1)+']\nInitial state: '+shot.initialState+(index?'\nContinue from Stage '+index+' end state; explicitly describe any intended change in the supplied initial state.':'')+'\nPrimary event: '+shot.description+'\nCamera: '+cameraLine(shot)+'\nEnd state: '+shot.endState+'\nAllocated duration: '+shot.duration+' seconds.'+(assigned(shot).length?'\nUse: '+assigned(shot).join(', ')+'.':'')+'\nAudio: <'+(shot.soundscape || 'Location ambience and practical action sounds only')+'>'+(shot.dialogue.trim()?'\nKorean, natural Korean accent; '+shot.speaker+(shot.voiceover?' in off-screen voiceover, with on-screen lips closed':' speaking naturally')+': {'+shot.dialogue+'}':'\nNo dialogue or voiceover in this stage.')).join('\n\n');
      prompt = '[Generation Goal]\n'+style+'\nCreate a '+elapsed+'-second sequence with '+shots.length+' stages in the declared order. One primary visible change per stage.\n\n[Material Roles]\n'+(refLines.join('\n')||'No uploaded references declared. Follow only the scene description.')+'\n\n'+stages+'\n\n[Maintain Consistency]\n'+continuity+'\n\n[Audio]\n('+music+')\nDo not generate subtitles. Stage durations allocate action time; they are not a frame-accurate edit decision list.';
    }
    const uuid = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : (typeof require === 'function' ? require('node:crypto').randomUUID() : null);
    if (!uuid) throw new Error('프롬프트 ID 생성에 보안 연결이 필요합니다.');
    return { schemaVersion:1, id:uuid, projectKey, model, createdAt:new Date().toISOString(), prompt, shots, references:refs, ...(fields ? {fields}:{}), sources:SOURCES, style, music, durationSeconds:elapsed, generationExecuted:false, reviewStatus:'draft', limitsBasis:'User-provided guides dated 2026-08-08 (H3) / 2026-08-04 (Seedance). Verify provider limits before execution.' };
  }
  const api = { recommend, compile, SOURCES, DEFAULT_STYLE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZippyPromptEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
