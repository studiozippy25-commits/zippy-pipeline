(function () {
  'use strict';

  const DB_NAME = 'zippy-storyboard-v2';
  const DB_VERSION = 1;
  const DOC_STORE = 'documents';
  const RESULT_STORE = 'results';
  const LIVE_BASE = 'https://zippy-pipeline.studiozippy25.workers.dev/';
  const state = {
    db: null,
    doc: null,
    projectKey: '',
    view: 'board',
    episode: 0,
    scene: 'all',
    abortController: null,
    resultCache: new Map(),
    previewUrls: new Map(),
    validation: null,
    initialized: false
  };

  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
  function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function asArray(value) { return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []; }
  function project() { try { return typeof currentProject !== 'undefined' ? currentProject : null; } catch (_) { return null; } }
  function projectKey() { try { return String(typeof currentProjectKey !== 'undefined' && currentProjectKey || project()?.nameEn || project()?.name || ''); } catch (_) { return ''; } }
  function sourceShots() {
    const p = project();
    if (Array.isArray(p?.storyboardShots) && p.storyboardShots.length) return p.storyboardShots;
    try { return typeof SB_SHOTS !== 'undefined' && Array.isArray(SB_SHOTS) ? SB_SHOTS : []; } catch (_) { return []; }
  }
  function generatedImages() { try { return typeof sbGenImages !== 'undefined' ? sbGenImages : {}; } catch (_) { return {}; } }
  function canonicalName(value) {
    return String(value || '')
      .replace(/^\[[^\]]+\]\s*/, '')
      .replace(/^(?:주연|조연|빌런|인물|캐릭터)\s*[·:]\s*/, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .trim();
  }
  function assetUrl(value) {
    const url = String(value || '');
    if (!url || /^(?:data:|blob:|https?:\/\/)/i.test(url)) return url;
    return LIVE_BASE + url.replace(/^\/+/, '');
  }
  function firstAsset(value) { return assetUrl(asArray(value)[0] || ''); }
  function refCount(value) { return asArray(value).length; }
  function mapMatch(map, name) {
    if (!map || typeof map !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    const target = canonicalName(name);
    const key = Object.keys(map).find(item => canonicalName(item) === target);
    return key ? map[key] : null;
  }
  function sourceFingerprint(p, shots) {
    const first = shots[0]?.id || '';
    const last = shots[shots.length - 1]?.id || '';
    return [projectKey(), p?.sourceRevision || '', shots.length, first, last].join('|');
  }

  function openDb() {
    return new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DOC_STORE)) db.createObjectStore(DOC_STORE, { keyPath: 'projectKey' });
        if (!db.objectStoreNames.contains(RESULT_STORE)) db.createObjectStore(RESULT_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }
  function dbGet(store, key) {
    return new Promise(resolve => {
      if (!state.db) return resolve(null);
      const request = state.db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }
  function dbPut(store, value) {
    return new Promise(resolve => {
      if (!state.db) return resolve(false);
      const request = state.db.transaction(store, 'readwrite').objectStore(store).put(value);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }
  async function saveDoc() {
    if (!state.doc) return;
    state.doc.updatedAt = new Date().toISOString();
    await dbPut(DOC_STORE, state.doc);
  }
  async function saveResult(record) {
    record.id = record.id || uid('sbv2-result');
    record.createdAt = record.createdAt || Date.now();
    await dbPut(RESULT_STORE, record);
    state.resultCache.set(record.id, record);
    return record;
  }

  function shotSeconds(shot) {
    const direct = Number(shot?.durationSec ?? shot?.seconds ?? shot?.duration);
    if (Number.isFinite(direct) && direct > 0) return Number(direct.toFixed(2));
    const start = Number(shot?.startSec), end = Number(shot?.endSec);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Number((end - start).toFixed(2));
    return 3;
  }
  function shotLocation(shot) {
    if (shot?.loc || shot?.location) return shot.loc || shot.location;
    try { return typeof resolveShotLoc === 'function' ? resolveShotLoc(shot) || '' : ''; } catch (_) { return ''; }
  }
  function shotCharacters(shot) { return asArray(shot?.char || shot?.characters).map(String); }
  function shotProps(shot) { return asArray(shot?.obj || shot?.props).map(String); }
  function inferShotSize(shot) {
    const text = `${shot?.frame || ''} ${shot?.desc || ''}`.toLowerCase();
    if (/ecu|extreme close|극단적 클로즈|초근접|매크로/.test(text)) return 'extreme-close';
    if (/\bcu\b|close[- ]?up|클로즈|특사/.test(text)) return 'close';
    if (/ews|extreme wide|대원경|초광각/.test(text)) return 'extreme-wide';
    if (/\bws\b|wide|와이드|전경|풀샷/.test(text)) return 'wide';
    return 'medium';
  }
  function recommendedCamera(shot) {
    if (shot?.camera) return shot.camera;
    try { if (typeof recommendCameraMoveForShot === 'function') return recommendCameraMoveForShot(shot) || 'Static Shot'; } catch (_) {}
    return 'Static Shot';
  }
  function suggestRecipe(shot, size) {
    const text = `${shot?.frame || ''} ${shot?.desc || ''} ${shot?.func || ''} ${shot?.audioDialogue || ''}`.toLowerCase();
    if (shot?.audioDialogue || /대화|말한다|묻는다|답한다|dialogue/.test(text)) return 'ots-shot-reverse';
    if (/등장|들어온|나타난|entrance|도착/.test(text)) return 'entrance-trio';
    if (/반응|놀라|바라본|시선|reaction/.test(text)) return 'reaction-hold';
    if (/드러나|공개|발견|reveal/.test(text)) return 'pull-reveal';
    if (/손|버튼|소품|카드|휴대폰|편지|도구|hand/.test(text)) return 'hands-tell';
    if (size === 'close' || size === 'extreme-close') return 'slow-push-face';
    if (/기체|차량|제품|장비|비행체|product/.test(text)) return 'product-orbit';
    return 'static-hold';
  }
  function buildFramePrompt(shot, size) {
    const sizePhrase = {
      'extreme-wide': 'extreme wide shot', wide: 'wide shot', medium: 'medium shot', close: 'close-up', 'extreme-close': 'extreme close-up'
    }[size] || 'medium shot';
    return [sizePhrase, shot?.sourcePrompt || shot?.desc || shot?.frame || '', shot?.frame || '', 'cinematic production storyboard frame'].filter(Boolean).join('. ');
  }
  function buildVideoPrompt(shot, camera) {
    return [
      shot?.desc || shot?.frame || '',
      camera || 'Static Shot',
      'Preserve exact face identity, wardrobe, location geometry, prop design, lighting direction, and screen direction from the start frame',
      'Natural controlled motion, physically plausible movement, no face morph, no wardrobe change, no background rebuild'
    ].filter(Boolean).join('. ');
  }

  function buildBibles(p, shots) {
    const characterMap = new Map();
    const ensureCharacter = name => {
      const id = canonicalName(name) || String(name || 'unknown');
      if (!characterMap.has(id)) characterMap.set(id, { id, name: String(name || id), aliases: new Set(), appearances: 0 });
      const item = characterMap.get(id); item.aliases.add(String(name || id)); return item;
    };
    [p?.characterDNA, p?.defaultCharRefs, p?.defaultFaceRefs, p?.defaultCostumeRefs].forEach(map => {
      Object.keys(map || {}).forEach(name => ensureCharacter(name));
    });
    shots.forEach(shot => shotCharacters(shot).forEach(name => { ensureCharacter(name).appearances += 1; }));
    const characters = Array.from(characterMap.values()).map(item => {
      const aliases = Array.from(item.aliases);
      const find = map => aliases.map(name => mapMatch(map, name)).find(Boolean);
      return {
        id: item.id,
        name: aliases.sort((a, b) => b.length - a.length)[0] || item.name,
        aliases,
        dna: aliases.map(name => mapMatch(p?.characterDNA, name)).find(Boolean) || '',
        characterRefs: refCount(find(p?.defaultCharRefs)),
        faceRefs: refCount(find(p?.defaultFaceRefs)),
        costumeRefs: refCount(find(p?.defaultCostumeRefs)),
        preview: firstAsset(find(p?.defaultFaceRefs) || find(p?.defaultCharRefs)),
        appearances: item.appearances
      };
    }).sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name, 'ko'));

    const spaceMap = new Map();
    const ensureSpace = name => {
      const id = String(name || '').trim();
      if (!id) return null;
      if (!spaceMap.has(id)) spaceMap.set(id, { id, name: id, appearances: 0 });
      return spaceMap.get(id);
    };
    [...asArray(p?.locations), ...asArray(p?.spaceNames), ...Object.keys(p?.spaceDNA || {}), ...Object.keys(p?.defaultSpaceRefs || {})].forEach(ensureSpace);
    shots.forEach(shot => { const item = ensureSpace(shotLocation(shot)); if (item) item.appearances += 1; });
    const spaces = Array.from(spaceMap.values()).map(item => ({
      ...item,
      dna: mapMatch(p?.spaceDNA, item.name) || '',
      refs: refCount(mapMatch(p?.defaultSpaceRefs, item.name)),
      preview: firstAsset(mapMatch(p?.defaultSpaceRefs, item.name))
    })).sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name, 'ko'));

    const propMap = new Map();
    asArray(p?.objectAssets).forEach(raw => propMap.set(String(raw.key || raw.name), {
      id: String(raw.key || raw.name), name: raw.name || raw.key, desc: raw.desc || '', appearances: 0
    }));
    Object.keys(p?.defaultObjRefs || {}).forEach(key => {
      if (!propMap.has(key)) propMap.set(key, { id: key, name: key, desc: '', appearances: 0 });
    });
    shots.forEach(shot => shotProps(shot).forEach(key => {
      if (!propMap.has(key)) propMap.set(key, { id: key, name: key, desc: '', appearances: 0 });
      propMap.get(key).appearances += 1;
    }));
    const props = Array.from(propMap.values()).map(item => ({
      ...item,
      refs: refCount(p?.defaultObjRefs?.[item.id]),
      preview: firstAsset(p?.defaultObjRefs?.[item.id])
    })).sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name, 'ko'));
    return { characters, spaces, props };
  }

  function buildScript(p, shots) {
    const episodes = new Map();
    shots.forEach((shot, index) => {
      const ep = Number(shot.ep ?? 1) || 1;
      if (!episodes.has(ep)) episodes.set(ep, { ep, title: p?.epTitles?.[ep] || `EP${String(ep).padStart(2, '0')}`, scenes: [] });
      const episode = episodes.get(ep);
      const sceneKey = `${shot.scene ?? ''}|${shot.sceneName || shot.loc || ''}`;
      let scene = episode.scenes.find(item => item.key === sceneKey);
      if (!scene) {
        scene = { key: sceneKey, sceneIndex: shot.scene ?? episode.scenes.length + 1, name: shot.sceneName || shotLocation(shot) || `Scene ${episode.scenes.length + 1}`, location: shotLocation(shot), beats: [] };
        episode.scenes.push(scene);
      }
      scene.beats.push({
        id: shot.sourceShotId || shot.id || `B${index + 1}`,
        shotId: shot.id || `SHOT-${index + 1}`,
        text: shot.desc || shot.frame || '',
        dialogue: shot.audioDialogue || '',
        seconds: shotSeconds(shot)
      });
    });
    return {
      title: p?.name || 'ZIPPY 프로젝트',
      logline: p?.desc || '',
      direction: p?.stability || '',
      visualRule: p?.quality || '',
      episodes: Array.from(episodes.values()).sort((a, b) => a.ep - b.ep)
    };
  }

  function h3Time(seconds) {
    const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
    const minutes = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
  function buildH3Prompt(segment) {
    const cuts = segment?.cuts || [];
    if (!cuts.length) return '';
    const alignment = cuts.length === 1
      ? 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.'
      : `How the reference pictures align with the target video — ${cuts.map((cut, index) => `Picture ${index + 1} (from Shot ${index + 1}) aligns with the ${cut.startSeconds.toFixed(2)}-second mark of the target video`).join('; ')}.`;
    const shotLines = cuts.map((cut, index) => {
      const source = findSourceShot(cut.sourceShotId);
      const dialogue = source?.audioDialogue ? ` Dialogue is spoken verbatim in Korean: <d>[Korean] ${source.audioDialogue}</d>.` : '';
      const prefix = index === 0 ? `[Shot 1]` : `[Shot ${index + 1}] At ${h3Time(cut.startSeconds)}, the camera cuts to <Picture ${index + 1}>:`;
      return `${prefix} ${cut.videoPrompt} Camera instruction: ${cut.camera}. Keep the composition and state anchored to <Picture ${index + 1}>.${dialogue}`;
    });
    const sounds = cuts.map(cut => {
      const source = findSourceShot(cut.sourceShotId);
      return source?.func || '';
    }).filter(Boolean);
    return [
      alignment,
      '',
      'integrated_multimodal_description:',
      ...shotLines,
      '',
      `overall_soundscape: ${sounds.length ? sounds.join('. ') : 'Natural location ambience, synchronized footsteps, cloth movement, object contact, and restrained non-verbal breathing.'}`,
      '',
      'non_diegetic_music: N/A'
    ].join('\n');
  }

  function buildSegments(shots, maxSeconds) {
    const episodes = new Map();
    const counters = new Map();
    let current = null;
    shots.forEach((shot, index) => {
      const ep = Number(shot.ep ?? 1) || 1;
      const sceneKey = `${ep}|${shot.scene ?? ''}|${shot.sceneName || shotLocation(shot) || ''}`;
      if (!episodes.has(ep)) episodes.set(ep, { ep, segments: [] });
      const episode = episodes.get(ep);
      const seconds = shotSeconds(shot);
      const mustSplit = !current || current.ep !== ep || current.sceneKey !== sceneKey || current.totalSeconds + seconds > maxSeconds || current.cuts.length >= 5;
      if (mustSplit) {
        const number = (counters.get(ep) || 0) + 1; counters.set(ep, number);
        current = {
          id: `E${String(ep).padStart(2, '0')}-${String(number).padStart(2, '0')}`,
          ep,
          sceneKey,
          sceneIndex: shot.scene ?? number,
          sceneName: shot.sceneName || shotLocation(shot) || `Scene ${shot.scene ?? number}`,
          location: shotLocation(shot),
          totalSeconds: 0,
          cuts: [],
          h3Prompt: '',
          videoResultId: '',
          videoUrl: '',
          status: 'ready'
        };
        episode.segments.push(current);
      }
      const size = inferShotSize(shot);
      const camera = recommendedCamera(shot);
      const cut = {
        id: shot.id || `SHOT-${index + 1}`,
        sourceShotId: shot.id || `SHOT-${index + 1}`,
        sourceBeatIds: [shot.sourceShotId || shot.id || `B${index + 1}`],
        startSeconds: Number(current.totalSeconds.toFixed(2)),
        seconds,
        characters: shotCharacters(shot),
        location: shotLocation(shot),
        props: shotProps(shot),
        shotSize: size,
        camera,
        recipe: suggestRecipe(shot, size),
        framePrompt: buildFramePrompt(shot, size),
        videoPrompt: buildVideoPrompt(shot, camera),
        imageResultId: '',
        videoResultId: '',
        videoUrl: '',
        status: 'ready'
      };
      current.cuts.push(cut);
      current.totalSeconds = Number((current.totalSeconds + seconds).toFixed(2));
    });
    const result = Array.from(episodes.values()).sort((a, b) => a.ep - b.ep);
    result.forEach(episode => episode.segments.forEach(segment => { segment.h3Prompt = buildH3Prompt(segment); }));
    return result;
  }

  function buildDocument() {
    const p = project(); const shots = sourceShots(); const maxSegmentSeconds = 15;
    return {
      schema: 'studio-zippy-storyboard-v2/2',
      projectKey: projectKey(),
      projectName: p?.name || projectKey(),
      sourceFingerprint: sourceFingerprint(p, shots),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      params: { maxSegmentSeconds, minCutSeconds: 2, maxCutSeconds: 5, maxOnScreen: 3, provider: 'minimax-h3' },
      script: buildScript(p, shots),
      bibles: buildBibles(p, shots),
      episodes: buildSegments(shots, maxSegmentSeconds)
    };
  }

  function allSegments() { return state.doc?.episodes?.flatMap(episode => episode.segments || []) || []; }
  function allCuts() { return allSegments().flatMap(segment => segment.cuts || []); }
  function findCut(id) { return allCuts().find(cut => cut.id === id); }
  function findSegment(id) { return allSegments().find(segment => segment.id === id); }
  function findSourceShot(id) { return sourceShots().find(shot => shot.id === id); }
  function selectedSegments() {
    let segments = allSegments();
    if (state.episode) segments = segments.filter(segment => segment.ep === state.episode);
    if (state.scene !== 'all') segments = segments.filter(segment => segment.sceneKey === state.scene);
    return segments;
  }
  function recalcSegment(segment) {
    let start = 0;
    segment.cuts.forEach(cut => { cut.startSeconds = Number(start.toFixed(2)); start += Number(cut.seconds) || 0; });
    segment.totalSeconds = Number(start.toFixed(2));
    segment.h3Prompt = buildH3Prompt(segment);
  }

  function bibleCharacter(name) {
    const target = canonicalName(name);
    return state.doc?.bibles?.characters?.find(item => item.id === target || item.aliases?.some(alias => canonicalName(alias) === target));
  }
  function bibleSpace(name) {
    const target = String(name || '');
    return state.doc?.bibles?.spaces?.find(item => item.name === target || canonicalName(item.name) === canonicalName(target));
  }
  function bibleProp(id) { return state.doc?.bibles?.props?.find(item => item.id === id || item.name === id); }

  function validateDocument() {
    if (!state.doc) return { gates: [], issuesByCut: new Map(), errors: 0, warnings: 0 };
    const issuesByCut = new Map();
    const add = (cut, severity, code, message) => {
      if (!issuesByCut.has(cut.id)) issuesByCut.set(cut.id, []);
      issuesByCut.get(cut.id).push({ severity, code, message });
    };
    const params = state.doc.params;
    const sourceIds = new Set(sourceShots().map(shot => shot.id));
    const claimed = new Map();
    allCuts().forEach(cut => {
      claimed.set(cut.sourceShotId, (claimed.get(cut.sourceShotId) || 0) + 1);
      if (!cut.sourceShotId || !sourceIds.has(cut.sourceShotId)) add(cut, 'error', 'source', '원본 대본 컷 연결 없음');
      if (!String(cut.framePrompt || '').trim()) add(cut, 'error', 'frame-prompt', '이미지 프롬프트 없음');
      if (!String(cut.videoPrompt || '').trim()) add(cut, 'warning', 'video-prompt', '영상 프롬프트 없음');
      if (cut.seconds < params.minCutSeconds || cut.seconds > params.maxCutSeconds) add(cut, 'warning', 'cut-duration', `권장 컷 길이 ${params.minCutSeconds}~${params.maxCutSeconds}초 밖`);
      if (cut.seconds <= 0 || cut.seconds > params.maxSegmentSeconds) add(cut, 'error', 'duration', '생성 가능한 컷 길이가 아님');
      if (cut.characters.length > params.maxOnScreen) add(cut, 'warning', 'on-screen', `화면 인물 ${cut.characters.length}명`);
      cut.characters.forEach(name => {
        const character = bibleCharacter(name);
        if (!character?.faceRefs) add(cut, 'warning', 'face-ref', `${canonicalName(name)} 얼굴 락 없음`);
        if (!character?.characterRefs) add(cut, 'warning', 'character-ref', `${canonicalName(name)} 캐릭터 시트 없음`);
        if (!character?.costumeRefs) add(cut, 'warning', 'costume-ref', `${canonicalName(name)} 의상 시트 없음`);
      });
      if (cut.location && !bibleSpace(cut.location)?.refs) add(cut, 'warning', 'space-ref', '장소 레퍼런스 없음');
      cut.props.forEach(id => { if (!bibleProp(id)?.refs) add(cut, 'warning', 'prop-ref', `${bibleProp(id)?.name || id} 소품 레퍼런스 없음`); });
      if (!cut.camera) add(cut, 'warning', 'camera', '카메라 무빙 없음');
      if (!cut.recipe) add(cut, 'warning', 'recipe', '샷 레시피 없음');
    });
    allSegments().forEach(segment => {
      if (segment.totalSeconds > params.maxSegmentSeconds) segment.cuts.forEach(cut => add(cut, 'error', 'segment-duration', `세그먼트 ${segment.totalSeconds}초 · 최대 ${params.maxSegmentSeconds}초`));
      if (!segment.cuts.length) return;
      const locations = new Set(segment.cuts.map(cut => cut.location).filter(Boolean));
      if (locations.size > 1) segment.cuts.forEach(cut => add(cut, 'error', 'scene-cross', '한 세그먼트 안에서 장소가 변경됨'));
      const expected = buildH3Prompt(segment); const actual = String(segment.h3Prompt || '');
      if (!actual.trim()) segment.cuts.forEach(cut => add(cut, 'error', 'h3-prompt', 'MiniMax H3 프롬프트 없음'));
      else {
        if (actual.split('\n')[0] !== expected.split('\n')[0]) segment.cuts.forEach(cut => add(cut, 'error', 'h3-alignment', 'H3 이미지 시간 정렬 문장이 컷 시간과 다름'));
        segment.cuts.forEach((cut, index) => {
          const marker = index === 0 ? '[Shot 1]' : `[Shot ${index + 1}] At ${h3Time(cut.startSeconds)}`;
          if (!actual.includes(marker)) add(cut, 'error', 'h3-timing', `H3 Shot ${index + 1} 시점 누락`);
        });
      }
    });
    claimed.forEach((count, id) => { if (count > 1) allCuts().filter(cut => cut.sourceShotId === id).forEach(cut => add(cut, 'error', 'duplicate-beat', '원본 비트가 중복 연결됨')); });
    const flatIssues = Array.from(issuesByCut.values()).flat();
    const errors = flatIssues.filter(issue => issue.severity === 'error').length;
    const warnings = flatIssues.filter(issue => issue.severity === 'warning').length;
    const gates = [
      { id: 'coverage', name: '대본 비트 전체 연결', pass: sourceIds.size === claimed.size && Array.from(claimed.values()).every(count => count === 1), detail: `${claimed.size}/${sourceIds.size}` },
      { id: 'segment', name: '세그먼트 길이·장소', pass: !flatIssues.some(issue => ['segment-duration', 'scene-cross'].includes(issue.code)), detail: `최대 ${params.maxSegmentSeconds}초` },
      { id: 'cut', name: '컷 길이', pass: !flatIssues.some(issue => ['duration', 'cut-duration'].includes(issue.code)), detail: `${params.minCutSeconds}~${params.maxCutSeconds}초` },
      { id: 'prompt', name: 'GTI·H3 프롬프트', pass: !flatIssues.some(issue => ['frame-prompt', 'video-prompt', 'h3-prompt', 'h3-alignment', 'h3-timing'].includes(issue.code)), detail: '키프레임·시간 정렬' },
      { id: 'identity', name: '캐릭터·얼굴·의상 바이블', pass: !flatIssues.some(issue => ['face-ref', 'character-ref', 'costume-ref'].includes(issue.code)), detail: `${state.doc.bibles.characters.length}명` },
      { id: 'art', name: '장소·소품 바이블', pass: !flatIssues.some(issue => ['space-ref', 'prop-ref'].includes(issue.code)), detail: `장소 ${state.doc.bibles.spaces.length} · 소품 ${state.doc.bibles.props.length}` },
      { id: 'camera', name: '카메라·샷 레시피', pass: !flatIssues.some(issue => ['camera', 'recipe'].includes(issue.code)), detail: '컷별 추천' },
      { id: 'generation', name: 'H3 생성 준비', pass: allSegments().every(segment => segment.cuts.every(cut => Boolean(cut.imageResultId || generatedImages()[cut.sourceShotId]))), detail: `${allCuts().filter(cut => cut.imageResultId || generatedImages()[cut.sourceShotId]).length}/${allCuts().length} keyframes` }
    ];
    state.validation = { gates, issuesByCut, errors, warnings, checkedAt: new Date().toISOString() };
    return state.validation;
  }

  function status(text, tone) {
    const el = $('sbv2Status'); if (!el) return;
    el.textContent = text; el.dataset.tone = tone || '';
  }
  function episodeOptions() {
    return state.doc?.episodes?.map(episode => `<option value="${episode.ep}" ${episode.ep === state.episode ? 'selected' : ''}>EP${String(episode.ep).padStart(2, '0')} · ${episode.segments.length} segments</option>`).join('') || '';
  }
  function sceneOptions() {
    const scenes = new Map();
    allSegments().filter(segment => !state.episode || segment.ep === state.episode).forEach(segment => scenes.set(segment.sceneKey, segment.sceneName));
    return `<option value="all">전체 장면</option>${Array.from(scenes.entries()).map(([key, name]) => `<option value="${esc(key)}" ${key === state.scene ? 'selected' : ''}>${esc(name)}</option>`).join('')}`;
  }
  function renderKpis() {
    const validation = state.validation || validateDocument();
    const cuts = allCuts(); const segments = allSegments();
    const imageDone = cuts.filter(cut => cut.imageResultId || generatedImages()[cut.sourceShotId]).length;
    const videoDone = segments.filter(segment => segment.videoUrl).length;
    return `
      <div class="sbv2-kpis">
        <div><span>대본 컷</span><b>${cuts.length}</b></div>
        <div><span>세그먼트</span><b>${segments.length}</b></div>
        <div><span>바이블</span><b>${state.doc.bibles.characters.length + state.doc.bibles.spaces.length + state.doc.bibles.props.length}</b></div>
        <div><span>이미지</span><b>${imageDone}/${cuts.length}</b></div>
        <div><span>H3 세그먼트</span><b>${videoDone}/${segments.length}</b></div>
        <div><span>검사</span><b class="${validation.errors ? 'bad' : validation.warnings ? 'warn' : 'good'}">${validation.errors ? `오류 ${validation.errors}` : validation.warnings ? `주의 ${validation.warnings}` : '통과'}</b></div>
      </div>`;
  }
  function viewButtons() {
    const views = [['script', '대본'], ['characters', '캐릭터 바이블'], ['art', '장소·소품 바이블'], ['board', '스토리보드'], ['validation', '검사']];
    return views.map(([id, label]) => `<button type="button" data-sbv2-view="${id}" class="${state.view === id ? 'on' : ''}">${label}</button>`).join('');
  }
  function renderShell() {
    const root = $('zippyStoryboardV2Root');
    if (!root) return;
    if (!state.doc) {
      root.innerHTML = '<div class="sbv2-empty">프로젝트를 먼저 선택하세요.</div>';
      return;
    }
    const changed = state.doc.sourceFingerprint !== sourceFingerprint(project(), sourceShots());
    root.innerHTML = `
      <div class="sbv2-head">
        <div><div class="sbv2-eyebrow">STUDIO ZIPPY · STORYBOARD V2</div><h2>${esc(state.doc.projectName)}</h2></div>
        <div class="sbv2-source ${changed ? 'changed' : ''}">${changed ? '원본 변경 감지 · 다시 구성 필요' : '현재 프로젝트 데이터와 동기화됨'}</div>
      </div>
      <div class="sbv2-toolbar">
        <button type="button" data-sbv2-action="rebuild">프로젝트에서 다시 구성</button>
        <button type="button" data-sbv2-action="validate">전체 검사</button>
        <button type="button" data-sbv2-action="batch-image" class="primary">현재 EP 이미지 생성</button>
        <button type="button" data-sbv2-action="batch-video" class="video">현재 EP H3 영상 생성</button>
        <button type="button" data-sbv2-action="stop" class="danger" ${state.abortController ? '' : 'disabled'}>중단</button>
        <button type="button" data-sbv2-action="nodes">현재 EP 노드 전송</button>
        <button type="button" data-sbv2-action="export">V2 JSON</button>
        <select id="sbv2Episode">${episodeOptions()}</select>
        <select id="sbv2Scene">${sceneOptions()}</select>
        <span id="sbv2Status" class="sbv2-status">준비됨</span>
      </div>
      ${renderKpis()}
      <div class="sbv2-views">${viewButtons()}</div>
      <div id="sbv2Content" class="sbv2-content"></div>`;
    bindShellControls();
    renderContent();
  }
  function bindShellControls() {
    $('sbv2Episode')?.addEventListener('change', event => { state.episode = Number(event.target.value) || 0; state.scene = 'all'; renderShell(); });
    $('sbv2Scene')?.addEventListener('change', event => { state.scene = event.target.value; renderContent(); });
  }
  function renderContent() {
    const content = $('sbv2Content'); if (!content || !state.doc) return;
    if (state.view === 'script') content.innerHTML = renderScript();
    else if (state.view === 'characters') content.innerHTML = renderCharacters();
    else if (state.view === 'art') content.innerHTML = renderArtBible();
    else if (state.view === 'validation') content.innerHTML = renderValidation();
    else content.innerHTML = renderBoard();
    hydrateMedia();
  }
  function renderScript() {
    const script = state.doc.script;
    const episodes = script.episodes.filter(episode => !state.episode || episode.ep === state.episode);
    return `<section class="sbv2-script-head"><h3>${esc(script.title)}</h3><p>${esc(script.logline || '로그라인 없음')}</p><div><b>연출 기준</b>${esc(script.direction || '없음')}</div><div><b>비주얼 기준</b>${esc(script.visualRule || '없음')}</div></section>
      <div class="sbv2-script-list">${episodes.map(episode => `<section class="sbv2-episode"><header>EP${String(episode.ep).padStart(2, '0')} · ${esc(episode.title)}</header>${episode.scenes.map(scene => `<div class="sbv2-scene-line"><div><b>${esc(scene.name)}</b><span>${esc(scene.location)}</span></div><ol>${scene.beats.map(beat => `<li><span>${esc(beat.shotId)} · ${beat.seconds}s</span>${esc(beat.text)}${beat.dialogue ? `<em>${esc(beat.dialogue)}</em>` : ''}</li>`).join('')}</ol></div>`).join('')}</section>`).join('')}</div>`;
  }
  function renderCharacters() {
    return `<div class="sbv2-bible-summary"><b>${state.doc.bibles.characters.length}명</b><span>현재 프로젝트의 DNA와 얼굴·캐릭터·의상 레퍼런스를 통합한 바이블</span></div>
      <div class="sbv2-bible-grid">${state.doc.bibles.characters.map(item => `<article class="sbv2-bible-item">
        <div class="sbv2-bible-media">${item.preview ? `<img src="${esc(item.preview)}" alt="${esc(item.name)}" data-sbv2-open-image>` : '<span>이미지 없음</span>'}</div>
        <div class="sbv2-bible-info"><h3>${esc(item.name)}</h3><div class="sbv2-chips"><span class="${item.faceRefs ? 'ok' : 'miss'}">얼굴 ${item.faceRefs}</span><span class="${item.characterRefs ? 'ok' : 'miss'}">시트 ${item.characterRefs}</span><span class="${item.costumeRefs ? 'ok' : 'miss'}">의상 ${item.costumeRefs}</span><span>등장 ${item.appearances}</span></div><p>${esc(item.dna || 'DNA 설명 없음')}</p></div>
      </article>`).join('')}</div>`;
  }
  function renderArtBible() {
    const spaces = state.doc.bibles.spaces.map(item => `<article class="sbv2-bible-item"><div class="sbv2-bible-media">${item.preview ? `<img src="${esc(item.preview)}" alt="${esc(item.name)}" data-sbv2-open-image>` : '<span>이미지 없음</span>'}</div><div class="sbv2-bible-info"><h3>${esc(item.name)}</h3><div class="sbv2-chips"><span class="${item.refs ? 'ok' : 'miss'}">장소 레퍼런스 ${item.refs}</span><span>등장 ${item.appearances}</span></div><p>${esc(item.dna || '공간 DNA 설명 없음')}</p></div></article>`).join('');
    const props = state.doc.bibles.props.map(item => `<article class="sbv2-bible-item"><div class="sbv2-bible-media">${item.preview ? `<img src="${esc(item.preview)}" alt="${esc(item.name)}" data-sbv2-open-image>` : '<span>이미지 없음</span>'}</div><div class="sbv2-bible-info"><h3>${esc(item.name)}</h3><div class="sbv2-chips"><span class="${item.refs ? 'ok' : 'miss'}">소품 레퍼런스 ${item.refs}</span><span>등장 ${item.appearances}</span></div><p>${esc(item.desc || '소품 설명 없음')}</p></div></article>`).join('');
    return `<div class="sbv2-section-title"><b>장소 바이블</b><span>${state.doc.bibles.spaces.length}개</span></div><div class="sbv2-bible-grid">${spaces}</div><div class="sbv2-section-title"><b>소품 바이블</b><span>${state.doc.bibles.props.length}개</span></div><div class="sbv2-bible-grid">${props}</div>`;
  }
  function issueMarkup(cut) {
    const issues = state.validation?.issuesByCut?.get(cut.id) || [];
    if (!issues.length) return '<span class="sbv2-pass">검사 통과</span>';
    return issues.map(issue => `<span class="sbv2-issue ${issue.severity}">${esc(issue.message)}</span>`).join('');
  }
  function renderCut(cut, segment) {
    const imageReady = Boolean(cut.imageResultId || generatedImages()[cut.sourceShotId]);
    return `<article class="sbv2-cut" data-cut-id="${esc(cut.id)}">
      <div class="sbv2-cut-top"><b>${esc(cut.id)}</b><span>${cut.startSeconds.toFixed(2)}s → ${(cut.startSeconds + cut.seconds).toFixed(2)}s</span><span>${esc(cut.shotSize)}</span><span>${esc(cut.camera)}</span></div>
      <div class="sbv2-cut-main">
        <div class="sbv2-cut-media" data-sbv2-image="${esc(cut.id)}"><span>${imageReady ? '이미지 불러오는 중' : '이미지 대기'}</span></div>
        <div class="sbv2-cut-copy">
          <div class="sbv2-cut-desc">${esc(findSourceShot(cut.sourceShotId)?.desc || findSourceShot(cut.sourceShotId)?.frame || '')}</div>
          <div class="sbv2-chips"><span>인물 ${cut.characters.length}</span><span>장소 ${cut.location ? 1 : 0}</span><span>소품 ${cut.props.length}</span><span class="recipe">${esc(cut.recipe)}</span></div>
          <div class="sbv2-issues">${issueMarkup(cut)}</div>
          <div class="sbv2-cut-actions"><button data-sbv2-action="image" data-cut-id="${esc(cut.id)}">이미지 생성</button></div>
        </div>
      </div>
      ${cut.videoUrl ? `<video class="sbv2-video" src="${esc(cut.videoUrl)}" controls preload="metadata"></video>` : ''}
      <details><summary>컷 설정과 프롬프트</summary><div class="sbv2-fields">
        <label>길이<input type="number" min="1" max="30" step="0.5" value="${cut.seconds}" data-sbv2-field="seconds" data-cut-id="${esc(cut.id)}"></label>
        <label>카메라<input value="${esc(cut.camera)}" data-sbv2-field="camera" data-cut-id="${esc(cut.id)}"></label>
        <label>샷 레시피<input value="${esc(cut.recipe)}" data-sbv2-field="recipe" data-cut-id="${esc(cut.id)}"></label>
        <label class="wide">이미지 프롬프트<textarea data-sbv2-field="framePrompt" data-cut-id="${esc(cut.id)}">${esc(cut.framePrompt)}</textarea></label>
        <label class="wide">영상 프롬프트<textarea data-sbv2-field="videoPrompt" data-cut-id="${esc(cut.id)}">${esc(cut.videoPrompt)}</textarea></label>
      </div></details>
    </article>`;
  }
  function renderBoard() {
    const validation = state.validation || validateDocument();
    const segments = selectedSegments();
    if (!segments.length) return '<div class="sbv2-empty">선택한 범위에 세그먼트가 없습니다.</div>';
    return `<div class="sbv2-board-note">Scene은 장소와 시간의 단위, Segment는 MiniMax H3 한 번의 생성 단위, Cut은 2~5초 키프레임 단위다. 오류 ${validation.errors} · 주의 ${validation.warnings}</div>${segments.map(segment => {
      const allImagesReady = segment.cuts.every(cut => cut.imageResultId || generatedImages()[cut.sourceShotId]);
      return `<section class="sbv2-segment"><header><div><b>${esc(segment.id)}</b><span>${esc(segment.sceneName)}</span></div><div><span>${segment.cuts.length} cuts</span><strong class="${segment.totalSeconds > state.doc.params.maxSegmentSeconds ? 'bad' : ''}">${segment.totalSeconds.toFixed(2)}s</strong><button class="sbv2-segment-video" data-sbv2-action="segment-video" data-segment-id="${esc(segment.id)}" ${allImagesReady ? '' : 'disabled'}>MiniMax H3 생성</button></div></header><div class="sbv2-cuts">${segment.cuts.map(cut => renderCut(cut, segment)).join('')}</div>${segment.videoUrl ? `<video class="sbv2-video" src="${esc(segment.videoUrl)}" controls preload="metadata"></video>` : ''}<details class="sbv2-h3"><summary>H3 다중 이미지 정렬 프롬프트</summary><textarea data-sbv2-segment-field="h3Prompt" data-segment-id="${esc(segment.id)}">${esc(segment.h3Prompt || buildH3Prompt(segment))}</textarea></details></section>`;
    }).join('')}`;
  }
  function renderValidation() {
    const validation = validateDocument();
    const failedCuts = allCuts().filter(cut => validation.issuesByCut.has(cut.id));
    return `<div class="sbv2-gates">${validation.gates.map(gate => `<div class="${gate.pass ? 'pass' : 'fail'}"><span>${gate.pass ? 'PASS' : 'CHECK'}</span><b>${esc(gate.name)}</b><em>${esc(gate.detail)}</em></div>`).join('')}</div>
      <div class="sbv2-validation-summary">오류 ${validation.errors} · 주의 ${validation.warnings} · 확인 필요 컷 ${failedCuts.length}</div>
      <div class="sbv2-validation-list">${failedCuts.slice(0, 300).map(cut => `<div><b>${esc(cut.id)}</b><span>${(validation.issuesByCut.get(cut.id) || []).map(issue => esc(issue.message)).join(' · ')}</span></div>`).join('') || '<div>모든 검사 통과</div>'}</div>`;
  }

  function b64ToBlob(b64, mime) {
    const bytes = atob(b64); const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      const slice = bytes.slice(offset, offset + 1024); const array = new Uint8Array(slice.length);
      for (let i = 0; i < slice.length; i++) array[i] = slice.charCodeAt(i);
      chunks.push(array);
    }
    return new Blob(chunks, { type: mime || 'image/png' });
  }
  async function imageRecord(cut) {
    const legacy = generatedImages()[cut.sourceShotId];
    if (typeof legacy === 'string' && legacy) return { kind: 'image', b64: legacy, mime: 'image/png' };
    if (!cut.imageResultId) return null;
    if (state.resultCache.has(cut.imageResultId)) return state.resultCache.get(cut.imageResultId);
    const record = await dbGet(RESULT_STORE, cut.imageResultId);
    if (record) state.resultCache.set(record.id, record);
    return record;
  }
  async function previewUrl(cut) {
    if (state.previewUrls.has(cut.id)) return state.previewUrls.get(cut.id);
    const record = await imageRecord(cut); if (!record?.b64) return '';
    const url = URL.createObjectURL(b64ToBlob(record.b64, record.mime));
    state.previewUrls.set(cut.id, url); return url;
  }
  async function hydrateMedia() {
    const targets = Array.from(document.querySelectorAll('[data-sbv2-image]'));
    for (const target of targets) {
      const cut = findCut(target.dataset.sbv2Image); if (!cut) continue;
      const url = await previewUrl(cut); if (!url || !target.isConnected) continue;
      const img = document.createElement('img'); img.src = url; img.alt = cut.id; img.dataset.sbv2OpenImage = '';
      target.replaceChildren(img);
    }
  }
  function clearPreview(cutId) {
    const url = state.previewUrls.get(cutId); if (url) URL.revokeObjectURL(url);
    state.previewUrls.delete(cutId);
  }

  async function referenceImages(cut) {
    const shot = findSourceShot(cut.sourceShotId); if (!shot) return [];
    let refs = [];
    try {
      if (typeof getSBRefsForShot === 'function') refs = getSBRefsForShot(shot.scene, shot.id) || [];
    } catch (_) {}
    const priority = { face: 0, character: 1, costume: 2, background: 3, prop: 4 };
    return refs.map(ref => ref.inline_data ? { b64: ref.inline_data.data, mime: ref.inline_data.mime_type, _type: ref._type, _label: ref._label } : ref)
      .filter(ref => ref?.b64)
      .sort((a, b) => (priority[a._type] ?? 9) - (priority[b._type] ?? 9))
      .slice(0, 10);
  }
  function imagePrompt(cut, refs) {
    const p = project();
    const roles = refs.map((ref, index) => `Reference ${index + 1}: ${ref._type || 'visual'} only · ${ref._label || ''}`).join('\n');
    const dna = cut.characters.map(name => bibleCharacter(name)?.dna).filter(Boolean).join('\n');
    const space = bibleSpace(cut.location)?.dna || '';
    const props = cut.props.map(id => bibleProp(id)?.desc).filter(Boolean).join('\n');
    return [
      'STUDIO ZIPPY STORYBOARD V2 FRAME',
      cut.framePrompt,
      `CAMERA: ${cut.shotSize}; ${cut.camera}; recipe ${cut.recipe}.`,
      'REFERENCE AUTHORITY: face references decide face identity only; character sheets decide body and hair; costume references decide clothing only and must never replace the face; location references decide spatial geometry only; prop references decide object design and scale only.',
      'Identity priority is absolute. Preserve the exact approved face without beautification, age change, actor substitution, or identity blending.',
      'Integrate subject and background with one coherent exposure, contact shadows, reflected light, lens response, and atmospheric depth. No pasted composite look.',
      'Avoid underexposure and the characteristic dark GPT-image cast. Keep readable natural exposure unless this exact scripted shot requires darkness.',
      roles,
      dna && `CHARACTER BIBLE:\n${dna}`,
      space && `LOCATION BIBLE:\n${space}`,
      props && `PROP BIBLE:\n${props}`,
      p?.stability && `PROJECT LOCK:\n${p.stability}`,
      p?.quality && `VISUAL QUALITY:\n${p.quality}`,
      p?.negative && `NEGATIVE:\n${p.negative}`
    ].filter(Boolean).join('\n\n');
  }
  async function callV2Gti(images, prompt, signal) {
    try {
      if (typeof callGtiBridge === 'function') return await callGtiBridge({ images, prompt, signal, onProgress: message => status(message, 'working') });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw error;
    }
    let base = 'http://127.0.0.1:8799';
    try { base = localStorage.getItem('zippy_gti_bridge') || base; } catch (_) {}
    const headers = { 'Content-Type': 'application/json' };
    try { const key = localStorage.getItem('zippy_gti_bridge_key') || ''; if (key) headers['X-Zippy-GTI-Key'] = key; } catch (_) {}
    const response = await fetch(String(base).replace(/\/+$/, '') + '/generate', {
      method: 'POST', headers, signal,
      body: JSON.stringify({ prompt, size: 'auto', images: images.map(image => ({ b64: image.b64, mime: image.mime || 'image/png' })) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.imgB64) throw new Error(data.error || `GTI HTTP ${response.status}`);
    return data;
  }
  async function generateImage(cut, signal) {
    if (!cut) throw new Error('컷을 찾을 수 없습니다');
    const refs = await referenceImages(cut);
    cut.status = 'image-running'; renderContent(); status(`${cut.id} GTI 이미지 생성 중`, 'working');
    const result = await callV2Gti(refs, imagePrompt(cut, refs), signal);
    if (!result?.imgB64) throw new Error('GTI 이미지 응답 없음');
    const record = await saveResult({ kind: 'image', b64: result.imgB64, mime: result.mime || 'image/png', shotId: cut.sourceShotId, projectKey: state.projectKey });
    cut.imageResultId = record.id; cut.status = 'image-done'; clearPreview(cut.id);
    try { generatedImages()[cut.sourceShotId] = record.b64; } catch (_) {}
    const shot = findSourceShot(cut.sourceShotId);
    try { if (typeof recordContinuityCardForShot === 'function') recordContinuityCardForShot(shot, { summary: cut.camera }, record.b64); } catch (_) {}
    try { if (typeof saveStoryboardFrameToHistory === 'function') await saveStoryboardFrameToHistory(cut.sourceShotId, record.b64, 0, 'storyboard-v2'); } catch (_) {}
    try { if (typeof zippyNasSaveImage === 'function') zippyNasSaveImage('storyboard-v2', cut.sourceShotId, record.b64, record.mime, { shotId: cut.sourceShotId, reason: 'storyboard-v2' }); } catch (_) {}
    await saveDoc(); return record;
  }
  function videoRequestId(prefix) {
    try { if (typeof makeVideoPayloadId === 'function') return makeVideoPayloadId(prefix); } catch (_) {}
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function videoHash(b64) {
    try { if (typeof videoB64Hash === 'function') return videoB64Hash(b64); } catch (_) {}
    const text = String(b64 || ''); let hash = 2166136261; const step = Math.max(1, Math.floor(text.length / 4096));
    for (let i = 0; i < text.length; i += step) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function h3ImagePayload(role, record, requestId, index) {
    try { if (typeof makeVideoImagePayload === 'function') return makeVideoImagePayload(role, record.b64, record.mime, requestId, index); } catch (_) {}
    return { name: `zippy_${role}_${requestId}_${index + 1}.png`, mime: record.mime || 'image/png', b64: record.b64, hash: videoHash(record.b64), role };
  }
  function h3RenderOptions(duration, ratio) {
    try { if (typeof getLocalVideoRenderOptions === 'function') return getLocalVideoRenderOptions('minimax-h3', duration, ratio); } catch (_) {}
    const dimensions = { '16:9': [1344, 768], '9:16': [768, 1344], '1:1': [768, 768] }[ratio] || [1344, 768];
    const targetFrames = Math.max(5, Math.round(duration * 24));
    const frames = targetFrames + ((5 - (targetFrames % 17) + 17) % 17);
    return { fps: 24, frames: Math.max(124, Math.min(362, frames)), width: dimensions[0], height: dimensions[1] };
  }
  function localVideoHeaders() {
    try { if (typeof getLocalVideoGatewayHeaders === 'function') return getLocalVideoGatewayHeaders(); } catch (_) {}
    const headers = { 'Content-Type': 'application/json' };
    try { const key = localStorage.getItem('zippy_local_video_gateway_key') || ''; if (key) { headers.Authorization = `Bearer ${key}`; headers['X-Zippy-Gateway-Key'] = key; } } catch (_) {}
    return headers;
  }
  function abortableWait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('중단됨', 'AbortError'));
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('중단됨', 'AbortError')); }, { once: true });
    });
  }
  async function requestH3(payload, signal, onProgress) {
    try { if (typeof requestLocalVideo === 'function') return await requestLocalVideo(payload, onProgress, { signal }); } catch (error) { throw error; }
    let base = 'https://zippy-5080.studiozippy.co.kr';
    try { base = localStorage.getItem('zippy_local_video_gateway') || base; } catch (_) {}
    base = String(base).replace(/\/+$/, ''); const headers = localVideoHeaders();
    onProgress?.('MiniMax H3 워크플로우 전송 중');
    const response = await fetch(base + '/v1/videos/generations', { method: 'POST', headers, body: JSON.stringify(payload), signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Local 5080 HTTP ${response.status}`);
    if (data.video_url || data.video?.url) return data.video_url || data.video.url;
    const requestId = data.request_id || data.id; if (!requestId) throw new Error('H3 응답에 video_url/request_id가 없습니다');
    for (let i = 0; i < 120; i++) {
      await abortableWait(5000, signal); onProgress?.(`MiniMax H3 렌더링 중 · ${(i + 1) * 5}초`);
      const poll = await fetch(base + '/v1/videos/' + encodeURIComponent(requestId), { headers, signal });
      if (!poll.ok) continue;
      const result = await poll.json(); const current = result.status || result.state;
      if (['done', 'succeeded', 'success'].includes(current)) return result.video_url || result.video?.url;
      if (['failed', 'error'].includes(current)) throw new Error(result.error || result.message || 'MiniMax H3 생성 실패');
    }
    throw new Error('MiniMax H3 렌더링 시간 초과');
  }
  async function generateH3Segment(segment, signal) {
    let records = [];
    for (const cut of segment.cuts) {
      const record = await imageRecord(cut); if (!record?.b64) throw new Error(`${cut.id} 이미지가 없습니다`);
      records.push(record);
    }
    try {
      if (typeof prepareImageRefsForJsonBridge === 'function') {
        records = await prepareImageRefsForJsonBridge(records, {
          maxRefs: 5, maxSide: 1280, quality: 0.82, byteBudget: 12 * 1024 * 1024,
          singleRefMaxBytes: 3 * 1024 * 1024, fallbackMaxSide: 960, fallbackQuality: 0.74,
          hardInputMaxBytes: 30 * 1024 * 1024
        });
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
    segment.status = 'video-running'; segment.h3Prompt = segment.h3Prompt || buildH3Prompt(segment); renderContent();
    status(`${segment.id} MiniMax H3 생성 중`, 'working');
    const requestId = videoRequestId(`sbv2_${segment.id}`); const ratio = project()?.defaultRatio || '16:9';
    const duration = clamp(Number(segment.totalSeconds) || 5, 1, state.doc.params.maxSegmentSeconds);
    const render = h3RenderOptions(duration, ratio);
    const frames = records.map((record, index) => h3ImagePayload(index === 0 ? 'start' : `frame_${index + 1}`, record, requestId, index));
    const timeline = segment.cuts.map((cut, index) => ({ picture: index + 1, shot: index + 1, cut_id: cut.id, at_seconds: cut.startSeconds, duration: cut.seconds }));
    const payload = {
      request_id: requestId,
      client_request_id: requestId,
      source_image_hash: frames[0].hash,
      model: 'local-5080-minimax-h3',
      workflow_profile: 'minimax-h3',
      workflow_preset: 'minimax-h3',
      image: frames[0],
      images: frames.slice(1),
      keyframes: frames.map((frame, index) => ({ name: frame.name, mime: frame.mime, hash: frame.hash, role: index === 0 ? 'start' : `frame_${index + 1}`, at_seconds: timeline[index].at_seconds })),
      frame_timeline: timeline,
      prompt: segment.h3Prompt,
      duration,
      aspect_ratio: ratio,
      fps: render.fps,
      frames: render.frames,
      width: render.width,
      height: render.height,
      native_audio: true,
      metadata: { source: 'zippy-storyboard-v2', provider: 'minimax-h3', project: state.projectKey, segment_id: segment.id, frame_timeline: timeline }
    };
    const url = await requestH3(payload, signal, message => status(`${segment.id} · ${message}`, 'working'));
    if (!url) throw new Error('MiniMax H3 영상 URL 없음');
    const record = await saveResult({ kind: 'video', url, segmentId: segment.id, projectKey: state.projectKey, provider: 'minimax-h3' });
    segment.videoResultId = record.id; segment.videoUrl = url; segment.status = 'video-done'; await saveDoc(); return record;
  }
  async function runBatch(kind) {
    if (state.abortController) return;
    const segments = selectedSegments(); const cuts = segments.flatMap(segment => segment.cuts);
    const queue = kind === 'image'
      ? cuts.filter(cut => !(cut.imageResultId || generatedImages()[cut.sourceShotId]))
      : segments.filter(segment => segment.cuts.every(cut => cut.imageResultId || generatedImages()[cut.sourceShotId]) && !segment.videoUrl);
    if (!queue.length) { status(kind === 'image' ? '생성할 이미지가 없습니다' : 'H3 생성 가능한 남은 세그먼트가 없습니다', 'ok'); return; }
    state.abortController = new AbortController(); renderShell();
    let done = 0, failed = 0;
    try {
      for (const item of queue) {
        if (state.abortController.signal.aborted) throw new DOMException('중단됨', 'AbortError');
        try {
          if (kind === 'image') await generateImage(item, state.abortController.signal);
          else await generateH3Segment(item, state.abortController.signal);
          done += 1;
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          item.status = 'error'; item.lastError = error?.message || String(error); failed += 1; await saveDoc();
        }
        renderContent(); status(`${kind === 'image' ? '이미지' : '영상'} ${done + failed}/${queue.length} · 성공 ${done} · 실패 ${failed}`, failed ? 'warning' : 'working');
      }
      status(`완료 · 성공 ${done} · 실패 ${failed}`, failed ? 'warning' : 'ok');
    } catch (error) {
      status(error?.name === 'AbortError' ? `중단 · 완료 ${done}/${queue.length}` : `실패 · ${error?.message || error}`, 'warning');
    } finally {
      state.abortController = null; await saveDoc();
      try { if (typeof buildStoryboardTimeline === 'function') buildStoryboardTimeline(); } catch (_) {}
      try { if (typeof updateSBProgress === 'function') updateSBProgress(); } catch (_) {}
      renderShell();
    }
  }

  async function sendToNodes() {
    const segments = selectedSegments(); const payload = [];
    status('노드 전송 데이터 준비 중', 'working');
    for (const segment of segments) {
      for (const cut of segment.cuts) {
        const image = await imageRecord(cut);
        payload.push({
          id: cut.id, ep: cut.ep || segment.ep, scene: segment.sceneIndex, sceneName: segment.sceneName,
          loc: cut.location, char: cut.characters, obj: cut.props, desc: cut.framePrompt, frame: cut.shotSize,
          camera: cut.camera, lens: cut.recipe, durationSec: cut.seconds, videoPrompt: cut.videoPrompt,
          imageB64: image?.b64 || '', imageMime: image?.mime || 'image/png'
        });
      }
    }
    window.zippyStoryboardV2NodePayload = payload;
    if (typeof window.zippyNodeCanvasLoadV2 === 'function') await window.zippyNodeCanvasLoadV2(payload);
    window.goStep('node');
    status(`${payload.length}컷을 노드 캔버스로 전송했습니다`, 'ok');
  }
  function exportJson() {
    const clean = JSON.stringify(state.doc, null, 2);
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([clean], { type: 'application/json' }));
    link.download = `${state.projectKey || 'zippy'}-storyboard-v2.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  function openImage(src) {
    const modal = $('sbv2Modal'); if (!modal) return;
    const img = modal.querySelector('img'); img.src = src; modal.classList.add('open');
  }

  async function handleAction(action, cutId, segmentId) {
    if (action === 'rebuild') {
      state.doc = buildDocument(); state.episode = state.doc.episodes[0]?.ep || 0; state.scene = 'all'; state.resultCache.clear();
      state.validation = validateDocument(); await saveDoc(); renderShell(); status('현재 프로젝트 데이터로 V2를 다시 구성했습니다', 'ok'); return;
    }
    if (action === 'validate') { state.validation = validateDocument(); renderShell(); state.view = 'validation'; renderShell(); return; }
    if (action === 'batch-image') return runBatch('image');
    if (action === 'batch-video') return runBatch('video');
    if (action === 'stop') { state.abortController?.abort(); status('중단 요청 중', 'warning'); return; }
    if (action === 'nodes') return sendToNodes();
    if (action === 'export') return exportJson();
    if (action === 'segment-video') {
      const segment = findSegment(segmentId); if (!segment || state.abortController) return;
      state.abortController = new AbortController(); renderShell();
      try {
        await generateH3Segment(segment, state.abortController.signal);
        status(`${segment.id} MiniMax H3 생성 완료`, 'ok');
      } catch (error) {
        segment.status = error?.name === 'AbortError' ? 'stopped' : 'error'; segment.lastError = error?.message || String(error);
        status(`${segment.id} 실패 · ${segment.lastError}`, 'error'); await saveDoc();
      } finally { state.abortController = null; state.validation = validateDocument(); renderShell(); }
      return;
    }
    const cut = findCut(cutId); if (!cut || state.abortController) return;
    state.abortController = new AbortController(); renderShell();
    try {
      if (action === 'image') await generateImage(cut, state.abortController.signal);
      status(`${cut.id} GTI 이미지 생성 완료`, 'ok');
    } catch (error) {
      cut.status = error?.name === 'AbortError' ? 'stopped' : 'error'; cut.lastError = error?.message || String(error);
      status(`${cut.id} 실패 · ${cut.lastError}`, 'error'); await saveDoc();
    } finally { state.abortController = null; state.validation = validateDocument(); renderShell(); }
  }

  function bindPanel() {
    const panel = $('pSB2'); if (!panel) return;
    panel.addEventListener('click', event => {
      const view = event.target.closest('[data-sbv2-view]');
      if (view) { state.view = view.dataset.sbv2View; renderShell(); return; }
      const action = event.target.closest('[data-sbv2-action]');
      if (action) { event.preventDefault(); handleAction(action.dataset.sbv2Action, action.dataset.cutId, action.dataset.segmentId); return; }
      const image = event.target.closest('[data-sbv2-open-image]');
      if (image?.src) openImage(image.src);
    });
    panel.addEventListener('change', async event => {
      const segmentField = event.target.dataset.sbv2SegmentField; const segmentId = event.target.dataset.segmentId;
      if (segmentField && segmentId) {
        const segment = findSegment(segmentId); if (!segment) return;
        segment[segmentField] = event.target.value; state.validation = validateDocument(); await saveDoc(); renderShell(); return;
      }
      const field = event.target.dataset.sbv2Field; const cutId = event.target.dataset.cutId;
      if (!field || !cutId) return;
      const cut = findCut(cutId); if (!cut) return;
      cut[field] = field === 'seconds' ? Number(event.target.value) || 0 : event.target.value;
      const segment = allSegments().find(item => item.cuts.includes(cut)); if (segment) recalcSegment(segment);
      state.validation = validateDocument(); await saveDoc(); renderShell();
    });
    $('sbv2Modal')?.addEventListener('click', event => { if (event.target.id === 'sbv2Modal' || event.target.closest('[data-sbv2-close]')) $('sbv2Modal').classList.remove('open'); });
  }

  async function loadProjectDocument() {
    const key = projectKey();
    if (!key || !project()) { state.doc = null; state.projectKey = ''; renderShell(); return; }
    if (state.projectKey === key && state.doc) { renderShell(); return; }
    state.projectKey = key; state.resultCache.clear();
    state.previewUrls.forEach(url => URL.revokeObjectURL(url)); state.previewUrls.clear();
    let doc = await dbGet(DOC_STORE, key);
    if (!doc) { doc = buildDocument(); await dbPut(DOC_STORE, doc); }
    if (doc.schema !== 'studio-zippy-storyboard-v2/2') {
      doc.schema = 'studio-zippy-storyboard-v2/2'; doc.params = { ...(doc.params || {}), provider: 'minimax-h3' };
      (doc.episodes || []).forEach(episode => (episode.segments || []).forEach(segment => {
        segment.h3Prompt = buildH3Prompt(segment); segment.videoResultId = segment.videoResultId || ''; segment.videoUrl = segment.videoUrl || ''; segment.status = segment.status || 'ready';
      }));
      await dbPut(DOC_STORE, doc);
    }
    state.doc = doc; state.episode = doc.episodes?.[0]?.ep || 0; state.scene = 'all'; state.validation = validateDocument(); renderShell();
  }
  function showV2() {
    document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));
    $('pSB2')?.classList.add('active');
    document.querySelectorAll('.snav .stab').forEach(tab => { tab.className = tab.className.replace(/\b(?:a1|a2|a3)\b/g, '').replace(/\s+/g, ' ').trim(); });
    $('tabSB2')?.classList.add('a2');
    loadProjectDocument();
  }

  function injectUi() {
    if ($('tabSB2')) return;
    const style = document.createElement('style'); style.textContent = `
      #pSB2{padding-bottom:50px}.sbv2-root{display:grid;gap:12px}.sbv2-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;padding:4px 0 10px;border-bottom:1px solid var(--bd)}.sbv2-eyebrow{font:10px var(--font-mono);color:var(--cy);letter-spacing:1.2px}.sbv2-head h2{font-size:21px;margin:4px 0 0}.sbv2-source{font:10px var(--font-mono);color:var(--ok)}.sbv2-source.changed{color:var(--wn)}
      .sbv2-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:9px;background:var(--sf);border:1px solid var(--bd);border-radius:6px}.sbv2-toolbar button,.sbv2-toolbar select{min-height:32px;border:1px solid var(--bd);border-radius:5px;background:var(--card);color:var(--tx);padding:0 10px;font:10px var(--font-mono);cursor:pointer}.sbv2-toolbar button.primary{border-color:var(--cy);color:var(--cy)}.sbv2-toolbar button.video{border-color:#a78bfa;color:#c4b5fd}.sbv2-toolbar button.danger{border-color:var(--er);color:var(--er)}.sbv2-toolbar button:disabled{opacity:.4;cursor:not-allowed}.sbv2-status{margin-left:auto;font:10px var(--font-mono);color:var(--mu)}.sbv2-status[data-tone=ok]{color:var(--ok)}.sbv2-status[data-tone=error]{color:var(--er)}.sbv2-status[data-tone=warning]{color:var(--wn)}.sbv2-status[data-tone=working]{color:var(--cy)}
      .sbv2-kpis{display:grid;grid-template-columns:repeat(6,minmax(90px,1fr));border:1px solid var(--bd);border-radius:6px;overflow:hidden}.sbv2-kpis>div{padding:9px 12px;background:var(--card);border-right:1px solid var(--bd)}.sbv2-kpis>div:last-child{border-right:0}.sbv2-kpis span{display:block;color:var(--mu);font:9px var(--font-mono)}.sbv2-kpis b{display:block;margin-top:3px;font:700 16px var(--font-mono)}.sbv2-kpis .good{color:var(--ok)}.sbv2-kpis .warn{color:var(--wn)}.sbv2-kpis .bad{color:var(--er)}
      .sbv2-views{display:flex;gap:3px;border-bottom:1px solid var(--bd)}.sbv2-views button{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--mu);padding:9px 12px;font:700 11px var(--font-mono);cursor:pointer}.sbv2-views button.on{color:var(--cy);border-bottom-color:var(--cy)}.sbv2-content{min-height:420px}.sbv2-empty{padding:80px 20px;text-align:center;color:var(--mu);font:12px var(--font-mono)}
      .sbv2-script-head{display:grid;gap:8px;padding:14px 0;border-bottom:1px solid var(--bd)}.sbv2-script-head h3{font-size:20px}.sbv2-script-head p{font-size:14px;line-height:1.65}.sbv2-script-head>div{display:grid;grid-template-columns:90px 1fr;gap:8px;color:var(--mu);font-size:11px;line-height:1.5}.sbv2-script-head b{color:var(--tx)}.sbv2-script-list{display:grid;gap:14px;margin-top:14px}.sbv2-episode{border-top:2px solid var(--cy)}.sbv2-episode>header{padding:9px 0;font:700 12px var(--font-mono)}.sbv2-scene-line{display:grid;grid-template-columns:240px 1fr;gap:14px;padding:10px 0;border-top:1px solid var(--bd)}.sbv2-scene-line>div span{display:block;margin-top:4px;color:var(--mu);font-size:10px}.sbv2-scene-line ol{margin:0;padding-left:22px}.sbv2-scene-line li{padding:4px 0;font-size:12px;line-height:1.45}.sbv2-scene-line li>span{display:inline-block;min-width:130px;color:var(--cy);font:9px var(--font-mono)}.sbv2-scene-line em{display:block;color:var(--wn);font-style:normal;margin-left:130px}
      .sbv2-bible-summary,.sbv2-section-title{display:flex;align-items:baseline;gap:10px;padding:10px 0;border-bottom:1px solid var(--bd)}.sbv2-bible-summary b,.sbv2-section-title b{font-size:16px}.sbv2-bible-summary span,.sbv2-section-title span{color:var(--mu);font-size:11px}.sbv2-section-title{margin-top:18px}.sbv2-bible-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1px;background:var(--bd);border:1px solid var(--bd);margin-top:10px}.sbv2-bible-item{display:grid;grid-template-columns:112px 1fr;min-height:138px;background:var(--card)}.sbv2-bible-media{display:grid;place-items:center;background:#10161d;color:var(--mu);font:9px var(--font-mono);overflow:hidden}.sbv2-bible-media img{width:100%;height:100%;max-height:170px;object-fit:cover;cursor:zoom-in}.sbv2-bible-info{padding:11px;min-width:0}.sbv2-bible-info h3{font-size:13px;margin:0 0 7px}.sbv2-bible-info p{margin:8px 0 0;color:var(--mu);font-size:10px;line-height:1.5;max-height:75px;overflow:auto}.sbv2-chips{display:flex;gap:4px;flex-wrap:wrap}.sbv2-chips span{padding:2px 5px;border:1px solid var(--bd);border-radius:3px;color:var(--mu);font:8px var(--font-mono)}.sbv2-chips span.ok{color:var(--ok);border-color:rgba(34,197,94,.35)}.sbv2-chips span.miss{color:var(--er);border-color:rgba(239,68,68,.35)}.sbv2-chips span.recipe{color:#c4b5fd}
      .sbv2-board-note{padding:9px 11px;border-left:3px solid var(--cy);background:rgba(34,211,238,.05);color:var(--mu);font-size:10px;line-height:1.55;margin-bottom:12px}.sbv2-segment{margin-bottom:18px;border-top:2px solid #64748b}.sbv2-segment>header{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 2px}.sbv2-segment>header>div{display:flex;align-items:center;gap:9px}.sbv2-segment>header b{font:700 13px var(--font-mono);color:var(--cy)}.sbv2-segment>header span{color:var(--mu);font-size:10px}.sbv2-segment>header strong{font:700 11px var(--font-mono)}.sbv2-segment>header strong.bad{color:var(--er)}.sbv2-segment-video{border:1px solid #a78bfa;background:rgba(167,139,250,.08);color:#c4b5fd;border-radius:4px;padding:5px 8px;font:700 9px var(--font-mono);cursor:pointer}.sbv2-segment-video:disabled{opacity:.35;cursor:not-allowed}.sbv2-cuts{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:8px}.sbv2-cut{background:var(--card);border:1px solid var(--bd);border-radius:5px;overflow:hidden}.sbv2-cut-top{display:flex;align-items:center;gap:7px;padding:7px 9px;border-bottom:1px solid var(--bd);font:9px var(--font-mono)}.sbv2-cut-top b{color:var(--tx);margin-right:auto}.sbv2-cut-top span{color:var(--mu)}.sbv2-cut-main{display:grid;grid-template-columns:130px 1fr;min-height:126px}.sbv2-cut-media{display:grid;place-items:center;background:#0e141a;color:var(--mu);font:9px var(--font-mono);overflow:hidden}.sbv2-cut-media img{width:100%;height:100%;object-fit:cover;cursor:zoom-in}.sbv2-cut-copy{padding:9px;display:flex;flex-direction:column;gap:7px;min-width:0}.sbv2-cut-desc{font-size:11px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.sbv2-issues{display:flex;gap:3px;flex-wrap:wrap}.sbv2-pass,.sbv2-issue{padding:2px 4px;border-radius:3px;font:8px var(--font-mono)}.sbv2-pass{color:var(--ok);background:rgba(34,197,94,.08)}.sbv2-issue.warning{color:var(--wn);background:rgba(245,158,11,.08)}.sbv2-issue.error{color:var(--er);background:rgba(239,68,68,.08)}.sbv2-cut-actions{display:flex;gap:5px;margin-top:auto}.sbv2-cut-actions button{border:1px solid var(--cy);background:transparent;color:var(--cy);border-radius:4px;padding:5px 7px;font:9px var(--font-mono);cursor:pointer}.sbv2-cut-actions button.video{border-color:#a78bfa;color:#c4b5fd}.sbv2-cut-actions button:disabled{opacity:.35;cursor:not-allowed}.sbv2-cut details{border-top:1px solid var(--bd)}.sbv2-cut summary{padding:6px 9px;color:var(--mu);font:9px var(--font-mono);cursor:pointer}.sbv2-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px}.sbv2-fields label{display:grid;gap:3px;color:var(--mu);font:8px var(--font-mono)}.sbv2-fields label.wide{grid-column:1/-1}.sbv2-fields input,.sbv2-fields textarea{width:100%;border:1px solid var(--bd);border-radius:4px;background:var(--sf);color:var(--tx);padding:6px;font:9px var(--font-mono)}.sbv2-fields textarea{min-height:65px;resize:vertical}.sbv2-h3{border:1px solid rgba(167,139,250,.24);border-top:0;background:rgba(167,139,250,.035)}.sbv2-h3 summary{padding:8px 10px;color:#c4b5fd;font:10px var(--font-mono);cursor:pointer}.sbv2-h3 textarea{display:block;width:calc(100% - 20px);min-height:220px;margin:0 10px 10px;padding:9px;border:1px solid var(--bd);border-radius:4px;background:#10141b;color:#d8d5ff;font:10px/1.55 var(--font-mono);resize:vertical}.sbv2-video{display:block;width:100%;max-height:520px;background:#000;border-top:1px solid var(--bd)}
      .sbv2-gates{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.sbv2-gates>div{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;padding:10px;border:1px solid var(--bd);background:var(--card)}.sbv2-gates>div>span{grid-row:1/3;font:700 9px var(--font-mono);align-self:center}.sbv2-gates .pass>span{color:var(--ok)}.sbv2-gates .fail>span{color:var(--er)}.sbv2-gates b{font-size:11px}.sbv2-gates em{color:var(--mu);font:9px var(--font-mono);font-style:normal}.sbv2-validation-summary{margin-top:14px;padding:10px 0;border-bottom:1px solid var(--bd);font:11px var(--font-mono)}.sbv2-validation-list>div{display:grid;grid-template-columns:120px 1fr;gap:10px;padding:7px 0;border-bottom:1px solid var(--bd);font-size:10px}.sbv2-validation-list b{font-family:var(--font-mono);color:var(--cy)}.sbv2-validation-list span{color:var(--mu)}
      .sbv2-modal{position:fixed;inset:0;z-index:99999;display:none;place-items:center;padding:30px;background:rgba(0,0,0,.86)}.sbv2-modal.open{display:grid}.sbv2-modal img{max-width:min(94vw,1500px);max-height:90vh;object-fit:contain}.sbv2-modal button{position:absolute;top:18px;right:20px;width:36px;height:36px;border:1px solid #64748b;background:#111;color:#fff;font-size:22px;cursor:pointer}
      @media(max-width:900px){.sbv2-kpis{grid-template-columns:repeat(3,1fr)}.sbv2-kpis>div:nth-child(3){border-right:0}.sbv2-scene-line{grid-template-columns:1fr}.sbv2-gates{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.sbv2-head{align-items:flex-start;flex-direction:column}.sbv2-kpis{grid-template-columns:repeat(2,1fr)}.sbv2-kpis>div{border-bottom:1px solid var(--bd)}.sbv2-bible-grid,.sbv2-cuts{grid-template-columns:1fr}.sbv2-bible-item{grid-template-columns:90px 1fr}.sbv2-cut-main{grid-template-columns:105px 1fr}.sbv2-gates{grid-template-columns:1fr}.sbv2-views{overflow-x:auto}.sbv2-status{width:100%;margin-left:0}}
    `; document.head.appendChild(style);
    const nav = document.querySelector('.snav'); const tab = document.createElement('button');
    tab.className = 'stab'; tab.id = 'tabSB2'; tab.textContent = '스토리보드 V2'; tab.style.borderBottomColor = 'var(--cy)'; tab.style.color = 'var(--cy)'; tab.onclick = () => window.goStep('sb2');
    nav?.insertBefore(tab, $('tabVid') || $('tabHist'));
    const panel = document.createElement('div'); panel.className = 'panel'; panel.id = 'pSB2';
    panel.innerHTML = '<div class="sbv2-root" id="zippyStoryboardV2Root"></div><div class="sbv2-modal" id="sbv2Modal"><button type="button" data-sbv2-close>×</button><img alt="확대 이미지"></div>';
    ($('pSB') || $('pHist'))?.insertAdjacentElement('afterend', panel);
    bindPanel();
  }
  async function init() {
    if (state.initialized) return;
    injectUi(); state.db = await openDb();
    const originalGoStep = window.goStep;
    window.goStep = function (step) {
      if (step === 'sb2') { showV2(); return; }
      $('pSB2')?.classList.remove('active'); $('tabSB2')?.classList.remove('a1', 'a2', 'a3');
      return typeof originalGoStep === 'function' ? originalGoStep(step) : undefined;
    };
    state.initialized = true;
  }
  if (typeof window !== 'undefined') window.zippyStoryboardV2Init = init;
  if (typeof module !== 'undefined' && module.exports) module.exports = { h3Time, buildH3Prompt, buildSegments, inferShotSize, suggestRecipe };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})();
