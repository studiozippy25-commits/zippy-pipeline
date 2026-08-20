(function () {
  'use strict';

  const DB_NAME = 'zippy-node-canvas';
  const DB_VERSION = 1;
  const GRAPH_KEY = 'current';
  const state = { graph: null, initialized: false, connecting: false, connectSource: null, dragging: null, db: null, abortController: null, stopRequested: false, zoom: 1 };
  const types = {
    script: { title: '프로젝트 스크립트', icon: 'S' },
    asset: { title: '프로젝트 에셋', icon: 'A' },
    shot: { title: '스토리보드 컷', icon: 'CUT' },
    prompt: { title: '프롬프트', icon: 'P' },
    reference: { title: '이미지 레퍼런스', icon: 'R' },
    gti: { title: 'GTI 이미지', icon: 'GTI' },
    localVideo: { title: 'Local 5080 I2V', icon: 'I2V' },
    grok: { title: 'Grok Build', icon: 'G' },
    voicebox: { title: 'Voicebox', icon: 'VB' },
    storyboard: { title: '스토리보드 출력', icon: 'SB' }
  };

  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function status(text, color) { const el = $('znodeStatus'); if (el) { el.textContent = text; el.style.color = color || 'var(--mu)'; } }

  function openDb() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('graphs')) db.createObjectStore('graphs');
        if (!db.objectStoreNames.contains('results')) db.createObjectStore('results', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }
  function dbGet(store, key) {
    return new Promise(resolve => {
      if (!state.db) return resolve(null);
      const req = state.db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => resolve(null);
    });
  }
  function dbPut(store, value, key) {
    return new Promise(resolve => {
      if (!state.db) return resolve(false);
      const req = state.db.transaction(store, 'readwrite').objectStore(store).put(value, key);
      req.onsuccess = () => resolve(true); req.onerror = () => resolve(false);
    });
  }

  function defaultGraph() {
    const nodes = [
      { id: 'script-1', type: 'script', x: 34, y: 70, config: { text: '' } },
      { id: 'prompt-1', type: 'prompt', x: 330, y: 70, config: { text: '실사 영화 스틸. 동일한 인물과 의상, 자연스러운 밝은 시간대, 실제 장소와 조화된 구도.' } },
      { id: 'reference-1', type: 'reference', x: 34, y: 360, config: { resultId: '' } },
      { id: 'gti-1', type: 'gti', x: 640, y: 145, config: { url: '', size: 'auto' } },
      { id: 'local-1', type: 'localVideo', x: 950, y: 145, config: { url: '', duration: 5, ratio: '16:9' } },
      { id: 'storyboard-1', type: 'storyboard', x: 1260, y: 145, config: {} },
      { id: 'grok-1', type: 'grok', x: 950, y: 430, config: { url: '', duration: 6, ratio: '16:9' } },
      { id: 'voicebox-1', type: 'voicebox', x: 330, y: 530, config: { url: '', profileId: '', language: 'ko', text: '' } }
    ];
    return { version: 1, nodes, edges: [
      { from: 'script-1', to: 'prompt-1' },
      { from: 'prompt-1', to: 'gti-1' }, { from: 'reference-1', to: 'gti-1' },
      { from: 'gti-1', to: 'local-1' }, { from: 'gti-1', to: 'grok-1' },
      { from: 'local-1', to: 'storyboard-1' }, { from: 'grok-1', to: 'storyboard-1' },
      { from: 'prompt-1', to: 'voicebox-1' }
    ] };
  }

  function getNode(id) { return state.graph.nodes.find(node => node.id === id); }
  function incoming(id) { return state.graph.edges.filter(edge => edge.to === id).map(edge => getNode(edge.from)).filter(Boolean); }
  function resultPreview(node) { return node.output && node.output.preview ? node.output.preview : ''; }

  function projectData() {
    try { return typeof currentProject !== 'undefined' ? currentProject : null; } catch (_) { return null; }
  }

  function safeGlobal(name) {
    try { return typeof window[name] !== 'undefined' ? window[name] : null; } catch (_) { return null; }
  }

  function assetUrl(value) {
    const url = String(value || '');
    if (!url || /^(?:data:|blob:|https?:\/\/)/i.test(url)) return url;
    return `https://zippy-pipeline.studiozippy25.workers.dev/${url.replace(/^\/+/, '')}`;
  }

  function projectAssets() {
    const project = projectData();
    if (!project) return [];
    const assets = [];
    const addMap = (category, map) => {
      if (!map || typeof map !== 'object') return;
      Object.entries(map).forEach(([name, rawUrl]) => {
        const urls = Array.isArray(rawUrl) ? rawUrl : [rawUrl];
        urls.filter(Boolean).forEach((url, index) => assets.push({
          category,
          name: Array.isArray(rawUrl) && urls.length > 1 ? `${name} · ${index + 1}` : name,
          url: assetUrl(url),
          key: `${category}:${name}:${index}`
        }));
      });
    };
    addMap('인물', project.defaultCharRefs);
    addMap('얼굴 락', project.defaultFaceRefs);
    addMap('의상', project.defaultCostumeRefs);
    addMap('장소', project.defaultSpaceRefs);
    addMap('소품', project.defaultObjRefs);
    return assets;
  }

  function projectScriptText() {
    const project = projectData();
    if (!project) return '';
    const shots = projectShots().slice(0, 24);
    const shotLines = shots.map((shot, index) => `${index + 1}. ${shot.id || 'SHOT'} · ${shot.desc || shot.frame || ''}`).join('\n');
    return [
      `작품: ${project.name || 'ZIPPY 프로젝트'}`,
      `로그라인/작품 설명: ${project.desc || ''}`,
      `연출 규칙: ${project.stability || ''}`,
      `비주얼 기준: ${project.quality || ''}`,
      shotLines ? `현재 에피소드 컷 요약:\n${shotLines}` : ''
    ].filter(Boolean).join('\n\n');
  }

  function selectedEpisode() {
    const active = document.querySelector('#sbEpChips .chip.on');
    if (!active) return 0;
    const onclick = active.getAttribute('onclick') || '';
    const match = onclick.match(/filterSBEp\((\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function projectShots(all = false) {
    const project = projectData();
    let shots = Array.isArray(project?.storyboardShots) ? project.storyboardShots : [];
    if (!shots.length) {
      const globalShots = safeGlobal('SB_SHOTS');
      shots = Array.isArray(globalShots) ? globalShots : [];
    }
    const episode = all ? 0 : selectedEpisode();
    if (episode) shots = shots.filter(shot => Number(shot.ep ?? shot.scene) === episode);
    return shots;
  }

  function shotImageUrl(shot) {
    if (!shot) return '';
    if (typeof shot.imageUrl === 'string') return assetUrl(shot.imageUrl);
    let generated = safeGlobal('sbGenImages');
    try { if (!generated && typeof sbGenImages !== 'undefined') generated = sbGenImages; } catch (_) {}
    const value = generated && generated[shot.id];
    if (typeof value === 'string') return assetUrl(value);
    if (value && typeof value === 'object') {
      if (value.url) return assetUrl(value.url);
      if (value.b64) return `data:${value.mime || 'image/png'};base64,${value.b64}`;
    }
    return '';
  }

  function shotHasImage(node) {
    return Boolean(node?.config?.imageUrl || node?.config?.imageResultId || node?.output?.resultId && node.output?.preview?.startsWith('image'));
  }

  function assetNodeImage(node) {
    return node?.config?.url || '';
  }

  function visualNodeMarkup(node) {
    if (node.type === 'asset') {
      const url = assetNodeImage(node);
      return `<div class="znode-visual-meta"><span>${esc(node.config?.category || '에셋')}</span><span>${esc(node.config?.assetKey || '')}</span></div>${url ? `<img class="znode-thumb" src="${esc(url)}" alt="${esc(node.config?.name || '')}" loading="lazy">` : '<div class="znode-thumb-empty">이미지 경로 없음</div>'}`;
    }
    if (node.type === 'shot') {
      const url = node.config?.imageUrl || '';
      const resultId = node.config?.imageResultId || '';
      const videoUrl = node.config?.videoUrl || '';
      const stateLabel = node.output?.status === 'done' ? '생성 완료' : node.output?.status === 'running' ? '생성 중' : node.output?.status === 'error' ? '실패' : '대기';
      return `<div class="znode-visual-meta"><span>${esc(node.config?.episodeLabel || 'STORYBOARD')}</span><span>${esc(stateLabel)}</span></div>${videoUrl ? `<video class="znode-thumb znode-shot-thumb" src="${esc(videoUrl)}" controls preload="metadata"></video>` : url ? `<img class="znode-thumb znode-shot-thumb" src="${esc(url)}" alt="${esc(node.config?.shotId || '')}" loading="lazy">` : resultId ? `<img class="znode-thumb znode-shot-thumb" data-znode-result-preview="${esc(resultId)}" alt="${esc(node.config?.shotId || '')}" loading="lazy"><div class="znode-preview-loading">생성 이미지 불러오는 중</div>` : '<div class="znode-thumb-empty">이미지 대기 · 영상 미생성</div>'}`;
    }
    return '';
  }

  function visualAssetMatch(asset, shot) {
    const text = [shot?.id, shot?.desc, shot?.scene, shot?.loc, shot?.location, shot?.character, shot?.characters, shot?.costume, shot?.object].filter(Boolean).join(' ').toLowerCase();
    const name = String(asset.name || '').toLowerCase();
    if (asset.category === '장소') {
      const token = name.replace(/^\[[^\]]+\]\s*/, '').split(' · ')[0];
      return token.length > 2 && text.includes(token);
    }
    if (asset.category === '소품') return ['카메라', '라켓', '테니스', '커피', '자판기', '사진', '필름', '응원봉', '비클', '차량'].some(token => name.includes(token) && text.includes(token));
    const characterTokens = name.replace(/^\[[^\]]+\]\s*/, '').split(' · ')[0].split('(')[0].trim();
    return characterTokens.length > 1 && text.includes(characterTokens.toLowerCase());
  }

  function addProjectAssets() {
    if (!state.graph) return 0;
    const assets = projectAssets();
    const removed = new Set(state.graph.nodes.filter(node => node.type === 'asset').map(node => node.id));
    state.graph.nodes = state.graph.nodes.filter(node => node.type !== 'asset');
    state.graph.edges = state.graph.edges.filter(edge => !removed.has(edge.from) && !removed.has(edge.to));
    const limit = 120;
    const visible = assets.slice(0, limit);
    visible.forEach((asset, index) => state.graph.nodes.push({
      id: `asset-${asset.key.replace(/[^a-z0-9가-힣]+/gi, '-').slice(0, 70)}-${index}`,
      type: 'asset', x: 28 + (Math.floor(index / 10) % 3) * 270, y: 34 + (index % 10) * 190,
      config: { ...asset }
    }));
    return visible.length;
  }

  function addStoryboardShots(all = false) {
    if (!state.graph) return 0;
    const shots = projectShots(all);
    const removed = new Set(state.graph.nodes.filter(node => node.type === 'shot').map(node => node.id));
    state.graph.nodes = state.graph.nodes.filter(node => node.type !== 'shot');
    state.graph.edges = state.graph.edges.filter(edge => !removed.has(edge.from) && !removed.has(edge.to));
    const limit = 120;
    const visible = shots.slice(0, limit);
    visible.forEach((shot, index) => {
      const episode = shot.ep ?? shot.scene ?? '';
      state.graph.nodes.push({
        id: `shot-${String(shot.id || index).replace(/[^a-z0-9가-힣]+/gi, '-')}`,
        type: 'shot', x: 1040 + (index % 5) * 270, y: 34 + Math.floor(index / 5) * 430,
        config: {
          shotId: shot.id || `SHOT-${index + 1}`,
          episodeLabel: episode ? `EP${String(episode).padStart(2, '0')}` : 'STORYBOARD',
          location: shot.loc || shot.location || '',
          prompt: [shot.desc, shot.frame, shot.angle, shot.lens].filter(Boolean).join(' · '),
          imageUrl: shotImageUrl(shot)
        }
      });
    });
    return visible.length;
  }

  function autoConnectProjectBoard() {
    const assets = allNodes('asset');
    const shots = allNodes('shot');
    let added = 0;
    shots.forEach(shot => {
      const matched = assets.filter(asset => visualAssetMatch(asset.config, shot.config));
      const selected = matched.length ? matched : assets.filter(asset => ['얼굴 락', '의상', '장소'].includes(asset.config?.category)).slice(0, 3);
      selected.slice(0, 6).forEach(asset => { added += connectOnce(asset, shot) ? 1 : 0; });
    });
    return added;
  }

  function downloadProjectGraph() {
    if (!state.graph) return;
    const payload = JSON.stringify({ version: state.graph.version, nodes: state.graph.nodes, edges: state.graph.edges }, null, 2);
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' })); link.download = `zippy-node-board-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status('노드 보드 JSON을 다운로드했습니다', 'var(--ok)');
  }

  function nodeSettings(node) {
    const c = node.config || (node.config = {});
    if (node.type === 'script') return `<label class="znode-label">프로젝트 스크립트 / 로그라인</label><textarea data-field="text" class="znode-script-text" placeholder="작품 설명, 장면 흐름, 대사, 연출 규칙">${esc(c.text || '')}</textarea><button type="button" class="znode-connect" data-script-fill>현재 프로젝트 텍스트 채우기</button>`;
    if (node.type === 'asset') return `<div class="znode-asset-name">${esc(c.name || '프로젝트 에셋')}</div><div class="znode-output">${esc(c.category || '에셋')} · 경로만 저장</div>`;
    if (node.type === 'shot') return `<div class="znode-asset-name">${esc(c.shotId || '스토리보드 컷')}</div><textarea data-field="prompt" placeholder="컷 프롬프트">${esc(c.prompt || '')}</textarea><div class="znode-shot-actions"><button type="button" class="znode-shot-action" data-generate-shot-image ${node.output?.status === 'running' ? 'disabled' : ''}>이미지 생성</button><button type="button" class="znode-shot-action znode-shot-video-action" data-generate-shot-video ${!shotHasImage(node) || node.output?.status === 'running' ? 'disabled' : ''}>Grok 영상 생성</button></div><div class="znode-output">상태: ${esc(node.output?.status === 'done' ? '생성 완료' : node.output?.status === 'error' ? '실패' : '대기')}</div>`;
    if (node.type === 'prompt') return `<label class="znode-label">생성 지시</label><textarea data-field="text" placeholder="장면/행동/카메라 지시">${esc(c.text || '')}</textarea>`;
    if (node.type === 'reference') return `<label class="znode-file">이미지 업로드 <input type="file" accept="image/*" data-ref-file></label>${c.resultId ? '<div class="znode-output">레퍼런스 저장됨</div>' : '<div class="znode-output">이미지를 올려주세요</div>'}`;
    if (node.type === 'gti') return `<label class="znode-label">GTI 브릿지 URL</label><input data-field="url" value="${esc(c.url || localStorage.getItem('zippy_gti_bridge') || 'http://127.0.0.1:8799')}" placeholder="http://127.0.0.1:8799"><label class="znode-label">이미지 크기</label><select data-field="size"><option value="auto" ${c.size === 'auto' ? 'selected' : ''}>auto</option><option value="1024x1024" ${c.size === '1024x1024' ? 'selected' : ''}>1024×1024</option><option value="1024x1536" ${c.size === '1024x1536' ? 'selected' : ''}>1024×1536</option></select>`;
    if (node.type === 'localVideo') return `<label class="znode-label">5080 Gateway URL</label><input data-field="url" value="${esc(c.url || localStorage.getItem('zippy_local_video_gateway') || 'https://zippy-5080.studiozippy.co.kr')}" placeholder="https://..."><label class="znode-label">워크플로우</label><select data-field="preset"><option value="wan" ${c.preset === 'wan' ? 'selected' : ''}>기본 Wan</option><option value="ltx23" ${c.preset === 'ltx23' ? 'selected' : ''}>LTX 2.3</option><option value="ltx25" disabled>LTX 2.5 · 업데이트 중</option></select><label class="znode-label">길이 / 비율</label><div style="display:flex;gap:5px"><input data-field="duration" type="number" min="1" max="30" value="${esc(c.duration || 5)}"><select data-field="ratio"><option value="16:9" ${c.ratio === '16:9' ? 'selected' : ''}>16:9</option><option value="9:16" ${c.ratio === '9:16' ? 'selected' : ''}>9:16</option></select></div>`;
    if (node.type === 'grok') return `<label class="znode-label">Grok Bridge URL</label><input data-field="url" value="${esc(c.url || localStorage.getItem('zippy_grok_build_bridge') || 'http://127.0.0.1:8790')}" placeholder="http://..."><label class="znode-label">길이 / 비율</label><div style="display:flex;gap:5px"><input data-field="duration" type="number" min="1" max="30" value="${esc(c.duration || 6)}"><select data-field="ratio"><option value="16:9" ${c.ratio === '16:9' ? 'selected' : ''}>16:9</option><option value="9:16" ${c.ratio === '9:16' ? 'selected' : ''}></option></select></div>`;
    if (node.type === 'voicebox') return `<label class="znode-label">Voicebox Bridge URL</label><input data-field="url" value="${esc(c.url || localStorage.getItem('zippy_voicebox_gateway') || 'http://127.0.0.1:17494')}" placeholder="http://..."><label class="znode-label">Profile ID</label><input data-field="profileId" value="${esc(c.profileId || '')}" placeholder="프로필 UUID"><label class="znode-label">대사 / 언어</label><textarea data-field="text" placeholder="비워두면 프롬프트 노드 사용">${esc(c.text || '')}</textarea><select data-field="language"><option value="ko" ${c.language === 'ko' ? 'selected' : ''}>한국어</option><option value="en" ${c.language === 'en' ? 'selected' : ''}>English</option><option value="ja" ${c.language === 'ja' ? 'selected' : ''}>日本語</option><option value="zh" ${c.language === 'zh' ? 'selected' : ''}>中文</option></select>`;
    return `<div class="znode-output">상류 결과를 저장하고 스토리보드/다음 노드로 전달합니다.</div>`;
  }

  function render() {
    const canvas = $('znodeCanvas'); if (!canvas || !state.graph) return;
    const width = Math.max(canvas.clientWidth || 1200, ...state.graph.nodes.map(node => node.x + 270), 1200);
    const height = Math.max(canvas.clientHeight || 680, ...state.graph.nodes.map(node => node.y + 230), 680);
    canvas.innerHTML = `<svg class="znode-links" style="width:${width}px;height:${height}px" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><marker id="znode-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b"></path></marker></defs>${state.graph.edges.map(edge => { const a = getNode(edge.from), b = getNode(edge.to); if (!a || !b) return ''; return `<path class="znode-link" d="M ${a.x + 250} ${a.y + 78} C ${a.x + 285} ${a.y + 78}, ${b.x - 35} ${b.y + 78}, ${b.x} ${b.y + 78}"></path>`; }).join('')}</svg>`;
    state.graph.nodes.forEach(node => {
      const def = types[node.type] || types.prompt;
      const card = document.createElement('article');
      card.className = 'znode-card' + (node.output?.status === 'running' ? ' running' : node.output?.status === 'done' ? ' done' : node.output?.status === 'error' ? ' error' : node.output?.status === 'stopped' ? ' stopped' : '');
      card.dataset.nodeId = node.id; card.style.left = node.x + 'px'; card.style.top = node.y + 'px';
      const preview = resultPreview(node);
      card.innerHTML = `<div class="znode-head"><span class="znode-icon">${esc(def.icon)}</span><span class="znode-title">${esc(node.config?.name || node.config?.shotId || def.title)}</span><button type="button" class="znode-remove" title="노드 삭제" data-remove-node>×</button></div><div class="znode-body">${visualNodeMarkup(node)}${nodeSettings(node)}<button type="button" class="znode-connect" data-connect-node>${state.connectSource === node.id ? '연결 시작점' : '이 노드를 연결'}</button>${preview ? `<div class="znode-output">${esc(preview)}</div>` : ''}</div>`;
      canvas.appendChild(card);
      bindCard(card, node);
    });
    hydrateResultPreviews();
  }

  async function hydrateResultPreviews() {
    const targets = Array.from(document.querySelectorAll('[data-znode-result-preview]'));
    for (const target of targets) {
      const id = target.getAttribute('data-znode-result-preview');
      if (!id) continue;
      const record = await dbGet('results', id);
      if (!record) continue;
      if (record.kind === 'image' && record.b64) {
        target.src = dataUrl(record);
        target.nextElementSibling?.remove();
      }
    }
  }

  function bindCard(card, node) {
    card.querySelector('[data-remove-node]').onclick = (event) => { event.stopPropagation(); state.graph.nodes = state.graph.nodes.filter(n => n.id !== node.id); state.graph.edges = state.graph.edges.filter(e => e.from !== node.id && e.to !== node.id); saveGraph(); render(); };
    card.querySelector('[data-connect-node]').onclick = (event) => { event.stopPropagation(); connectNode(node.id); };
    const scriptFill = card.querySelector('[data-script-fill]');
    if (scriptFill) scriptFill.onclick = async (event) => { event.stopPropagation(); node.config.text = projectScriptText(); await saveGraph(false); render(); status('현재 프로젝트 스크립트를 채웠습니다', 'var(--ok)'); };
    const shotImageButton = card.querySelector('[data-generate-shot-image]');
    if (shotImageButton) shotImageButton.onclick = async (event) => {
      event.stopPropagation();
      if (state.abortController) return;
      state.abortController = new AbortController();
      node.output = { status: 'running', preview: 'GTI 이미지 생성 중...' };
      shotImageButton.disabled = true; render(); status(`${node.config?.shotId || '컷'} 이미지 생성 중...`, 'var(--wn)');
      try {
        const result = await generateShotImage(node, state.abortController.signal);
        node.output = { status: 'done', resultId: result.id, preview: 'image · 생성 완료' };
        await saveGraph(false); render(); status(`${node.config?.shotId || '컷'} 이미지 생성 완료`, 'var(--ok)');
      } catch (error) {
        node.output = { status: error?.name === 'AbortError' ? 'stopped' : 'error', preview: error?.message || '생성 실패' };
        await saveGraph(false); render(); status(`${node.config?.shotId || '컷'} 이미지 생성 실패 · ${error?.message || error}`, 'var(--er)');
      } finally { state.abortController = null; }
    };
    const shotVideoButton = card.querySelector('[data-generate-shot-video]');
    if (shotVideoButton) shotVideoButton.onclick = async (event) => {
      event.stopPropagation();
      if (state.abortController || !shotHasImage(node)) return;
      state.abortController = new AbortController();
      node.output = { status: 'running', preview: 'Grok 영상 생성 중...' };
      shotVideoButton.disabled = true; render(); status(`${node.config?.shotId || '컷'} Grok 영상 생성 중...`, 'var(--wn)');
      try {
        const result = await generateShotVideo(node, 'grok', state.abortController.signal);
        node.config.videoUrl = result.url || '';
        node.output = { status: 'done', resultId: result.id, preview: 'video · Grok 생성 완료' };
        await saveGraph(false); render(); status(`${node.config?.shotId || '컷'} Grok 영상 생성 완료`, 'var(--ok)');
      } catch (error) {
        node.output = { status: error?.name === 'AbortError' ? 'stopped' : 'error', preview: error?.message || '영상 생성 실패' };
        await saveGraph(false); render(); status(`${node.config?.shotId || '컷'} Grok 영상 생성 실패 · ${error?.message || error}`, 'var(--er)');
      } finally { state.abortController = null; }
    };
    card.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('input', () => { node.config[input.dataset.field] = input.value; saveGraph(false); });
    });
    const refInput = card.querySelector('[data-ref-file]');
    if (refInput) refInput.addEventListener('change', async () => { const file = refInput.files?.[0]; if (!file) return; status('레퍼런스 저장 중...', 'var(--cy)'); const b64 = await blobToB64(file); const record = { id: uid('result'), kind: 'image', b64, mime: file.type || 'image/png', name: file.name, createdAt: Date.now() }; await dbPut('results', record); node.config.resultId = record.id; node.output = { status: 'done', resultId: record.id, preview: file.name }; await saveGraph(); render(); status('레퍼런스 준비됨', 'var(--ok)'); });
    const head = card.querySelector('.znode-head');
    head.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = $('znodeCanvas').getBoundingClientRect(); state.dragging = { id: node.id, dx: event.clientX - rect.left - node.x, dy: event.clientY - rect.top - node.y }; head.setPointerCapture(event.pointerId);
    });
    head.addEventListener('pointermove', event => { if (!state.dragging || state.dragging.id !== node.id) return; const rect = $('znodeCanvas').getBoundingClientRect(); node.x = Math.max(8, Math.min(rect.width - 260, event.clientX - rect.left - state.dragging.dx)); node.y = Math.max(8, Math.min(rect.height - 160, event.clientY - rect.top - state.dragging.dy)); render(); });
    head.addEventListener('pointerup', () => { if (state.dragging?.id === node.id) { state.dragging = null; saveGraph(false); } });
  }

  function connectNode(id) {
    if (!state.connecting) { state.connecting = true; state.connectSource = id; $('znodeCanvas')?.classList.add('connecting'); status('도착 노드를 클릭하세요', 'var(--cy)'); render(); return; }
    if (state.connectSource === id) return;
    const exists = state.graph.edges.some(edge => edge.from === state.connectSource && edge.to === id);
    if (!exists) state.graph.edges.push({ from: state.connectSource, to: id });
    state.connecting = false; state.connectSource = null; $('znodeCanvas')?.classList.remove('connecting'); saveGraph(); render(); status(exists ? '이미 연결되어 있습니다' : '연결됨', 'var(--ok)');
  }

  function addNode(type) { const n = { id: uid(type), type, x: 80 + (state.graph.nodes.length % 4) * 285, y: 80 + Math.floor(state.graph.nodes.length / 4) * 210, config: type === 'script' ? { text: projectScriptText() } : {} }; state.graph.nodes.push(n); saveGraph(); render(); }
  function connectOnce(from, to) {
    if (!from || !to || from.id === to.id) return false;
    if (state.graph.edges.some(edge => edge.from === from.id && edge.to === to.id)) return false;
    state.graph.edges.push({ from: from.id, to: to.id }); return true;
  }

  function arrangeGraph() {
    if (!state.graph) return 0;
    const columns = {
      script: [28, 32], reference: [28, 390], asset: [28, 760],
      prompt: [330, 110], voicebox: [330, 500], gti: [640, 180],
      localVideo: [950, 110], grok: [950, 450], storyboard: [1260, 110], shot: [1260, 410]
    };
    const counters = {};
    state.graph.nodes.forEach(node => {
      const [x, y] = columns[node.type] || [80, 80];
      const index = counters[node.type] || 0;
      const row = node.type === 'asset' ? index % 3 : node.type === 'shot' ? index % 4 : index;
      const col = node.type === 'asset' ? Math.floor(index / 3) : node.type === 'shot' ? Math.floor(index / 4) : 0;
      node.x = x + col * (node.type === 'shot' ? 246 : 264);
      node.y = y + row * (node.type === 'asset' ? 185 : node.type === 'shot' ? 430 : 250);
      counters[node.type] = index + 1;
    });
    return state.graph.nodes.length;
  }

  function ensureGraphShape(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return defaultGraph();
    if (!graph.nodes.some(node => node.type === 'script')) {
      graph.nodes.push({ id: 'script-migrated', type: 'script', x: 28, y: 32, config: { text: projectScriptText() } });
    }
    if (graph.layoutVersion !== 2) { graph.layoutVersion = 2; arrangeGraph(); }
    return graph;
  }
  function firstNode(type) { return state.graph.nodes.find(node => node.type === type); }
  function allNodes(type) { return state.graph.nodes.filter(node => node.type === type); }
  function autoConnectGraph() {
    if (!state.graph) return 0;
    const prompt = firstNode('prompt');
    const scripts = allNodes('script');
    const reference = firstNode('reference');
    const gti = firstNode('gti');
    const locals = allNodes('localVideo');
    const groks = allNodes('grok');
    const voiceboxes = allNodes('voicebox');
    const storyboards = allNodes('storyboard');
    let added = 0;
    if (prompt) {
      if (gti) added += connectOnce(prompt, gti) ? 1 : 0;
      voiceboxes.forEach(node => { added += connectOnce(prompt, node) ? 1 : 0; });
    }
    scripts.forEach(script => {
      if (prompt) added += connectOnce(script, prompt) ? 1 : 0;
      else if (gti) added += connectOnce(script, gti) ? 1 : 0;
      voiceboxes.forEach(node => { added += connectOnce(script, node) ? 1 : 0; });
    });
    if (reference) {
      if (gti) added += connectOnce(reference, gti) ? 1 : 0;
      else {
        locals.concat(groks).forEach(node => { added += connectOnce(reference, node) ? 1 : 0; });
      }
    }
    if (gti) {
      locals.concat(groks).forEach(node => { added += connectOnce(gti, node) ? 1 : 0; });
      if (!locals.length && !groks.length) storyboards.forEach(node => { added += connectOnce(gti, node) ? 1 : 0; });
    }
    const videoNodes = locals.concat(groks);
    if (videoNodes.length) videoNodes.forEach(video => storyboards.forEach(board => { added += connectOnce(video, board) ? 1 : 0; }));
    if (!gti && !videoNodes.length && reference) storyboards.forEach(board => { added += connectOnce(reference, board) ? 1 : 0; });
    if (allNodes('asset').length && allNodes('shot').length) added += autoConnectProjectBoard();
    if (scripts.length && allNodes('shot').length) scripts.forEach(script => allNodes('shot').forEach(shot => { added += connectOnce(script, shot) ? 1 : 0; }));
    return added;
  }
  function blobToB64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(file); }); }
  async function readResult(node) { if (node.config?.resultId) return dbGet('results', node.config.resultId); if (node.output?.resultId) return dbGet('results', node.output.resultId); return null; }
  function firstImage(values) { return values.find(value => value && value.kind === 'image') || null; }
  async function materializeImage(value) {
    if (!value || value.b64 || !value.url) return value;
    try {
      const response = await fetch(value.url);
      if (!response.ok) return value;
      const blob = await response.blob();
      return { ...value, b64: await blobToB64(blob), mime: value.mime || blob.type || 'image/png' };
    } catch (_) { return value; }
  }
  function textValue(values) { return values.find(value => value && value.kind === 'text')?.text || ''; }
  async function saveResult(record) { record.id = record.id || uid('result'); record.createdAt = record.createdAt || Date.now(); await dbPut('results', record); return record; }
  function dataUrl(record) { return record?.b64 ? `data:${record.mime || 'image/png'};base64,${record.b64}` : ''; }
  function bridgeUrl(node, fallback) { return String(node.config?.url || fallback).replace(/\/+$/, ''); }
  function bridgeHeaders(kind) {
    const headers = { 'Content-Type': 'application/json' };
    try {
      if (kind === 'local') { const key = localStorage.getItem('zippy_local_video_gateway_key') || ''; if (key) { headers.Authorization = 'Bearer ' + key; headers['X-Zippy-Gateway-Key'] = key; } }
      if (kind === 'grok') { const key = localStorage.getItem('zippy_grok_build_bridge_key') || ''; if (key) headers['X-Zippy-Grok-Key'] = key; }
      if (kind === 'gti') { const key = localStorage.getItem('zippy_gti_bridge_key') || ''; if (key) headers['X-Zippy-GTI-Key'] = key; }
    } catch {}
    return headers;
  }
  async function executeNode(node, values, signal) {
    if (node.type === 'asset') return { kind: 'image', url: node.config?.url || '', mime: 'image/png', name: node.config?.name || 'project-asset' };
    if (node.type === 'shot') return values.find(Boolean) || { kind: 'shot', name: node.config?.shotId || 'storyboard-shot', prompt: node.config?.prompt || '' };
    if (node.type === 'script') return { kind: 'text', text: node.config?.text || projectScriptText() };
    if (node.type === 'prompt') return { kind: 'text', text: node.config?.text || '' };
    if (node.type === 'reference') return (await readResult(node)) || null;
    if (node.type === 'storyboard') return values.find(Boolean) || null;
    const prompt = textValue(values) || 'Photorealistic live-action result. Preserve identity, outfit, lighting, composition, and natural bright-neutral exposure.';
    let image = firstImage(values);
    if (image && !image.b64) image = await materializeImage(image);
    if (node.type === 'gti') {
      const url = bridgeUrl(node, 'http://127.0.0.1:8799'); const body = { prompt, size: node.config?.size || 'auto', images: image ? [{ b64: image.b64, mime: image.mime || 'image/png' }] : [] };
      const res = await fetch(url + '/generate', { method: 'POST', headers: bridgeHeaders('gti'), body: JSON.stringify(body), signal }); const data = await res.json().catch(() => ({})); if (!res.ok || !data.imgB64) throw new Error(data.error || `GTI HTTP ${res.status}`);
      return saveResult({ kind: 'image', b64: data.imgB64, mime: data.mime || 'image/png', name: 'node-gti.png' });
    }
    if (node.type === 'localVideo') {
      if (node.config?.preset === 'ltx25') throw new Error('LTX 2.5 workflow 업데이트 중입니다. 현재는 큐에 보내지 않습니다.');
      if (!image) throw new Error('Local 5080에는 이미지 입력이 필요합니다'); const url = bridgeUrl(node, 'https://zippy-5080.studiozippy.co.kr'); const body = { image: { b64: image.b64, mime: image.mime || 'image/png' }, prompt, workflow_preset: node.config?.preset || 'wan', duration: Number(node.config?.duration || 5), aspect_ratio: node.config?.ratio || '16:9' };
      const res = await fetch(url + '/v1/videos/generations', { method: 'POST', headers: bridgeHeaders('local'), body: JSON.stringify(body), signal }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || data.hint || `Local 5080 HTTP ${res.status}`);
      return saveResult({ kind: 'video', url: data.video_url || data.video?.url, name: 'node-local-5080.mp4' });
    }
    if (node.type === 'grok') {
      if (!image) throw new Error('Grok Build에는 이미지 입력이 필요합니다'); const url = bridgeUrl(node, 'http://127.0.0.1:8790'); const body = { main_image: dataUrl(image), prompt, duration: Number(node.config?.duration || 6), aspect_ratio: node.config?.ratio || '16:9', metadata: { source: 'zippy-node-canvas' } };
      const res = await fetch(url + '/v1/grok/build/video', { method: 'POST', headers: bridgeHeaders('grok'), body: JSON.stringify(body), signal }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || `Grok HTTP ${res.status}`);
      return saveResult({ kind: 'video', url: data.video_url || data.video?.url || data.url, name: 'node-grok.mp4' });
    }
    if (node.type === 'voicebox') {
      const text = node.config?.text || prompt; const url = bridgeUrl(node, 'http://127.0.0.1:17494'); const body = { text, profile_id: node.config?.profileId || '', language: node.config?.language || 'ko' };
      const res = await fetch(url + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || `Voicebox HTTP ${res.status}`);
      const audioUrl = data.url ? (String(data.url).startsWith('/') ? url + data.url : data.url) : (data.audio_path ? url + '/audio?path=' + encodeURIComponent(data.audio_path) : ''); if (!audioUrl) throw new Error('Voicebox audio URL이 없습니다'); return saveResult({ kind: 'audio', url: audioUrl, name: 'node-voicebox.wav' });
    }
    return values.find(Boolean) || null;
  }

  async function shotInputImage(shotNode, signal) {
    const direct = shotNode.config?.imageUrl ? await materializeImage({ kind: 'image', url: shotNode.config.imageUrl, mime: 'image/png', name: shotNode.config.shotId }) : null;
    if (direct?.b64) return direct;
    const saved = shotNode.config?.imageResultId ? await dbGet('results', shotNode.config.imageResultId) : await readResult(shotNode);
    if (saved?.kind === 'image' && saved.b64) return saved;
    const parents = incoming(shotNode.id);
    for (const parent of parents) {
      const output = parent.output?.resultId ? await dbGet('results', parent.output.resultId) : null;
      if (output?.kind === 'image' && output.b64) return output;
      if (parent.type === 'asset' && parent.config?.url) {
        const asset = await materializeImage({ kind: 'image', url: parent.config.url, mime: 'image/png', name: parent.config.name });
        if (asset?.b64) return asset;
      }
    }
    return null;
  }

  async function generateShotImage(shotNode, signal) {
    const refs = [];
    for (const parent of incoming(shotNode.id).slice(0, 6)) {
      if (parent.type !== 'asset' || !parent.config?.url) continue;
      const asset = await materializeImage({ kind: 'image', url: parent.config.url, mime: 'image/png', name: parent.config.name });
      if (asset?.b64) refs.push({ b64: asset.b64, mime: asset.mime || 'image/png' });
    }
    const url = bridgeUrl({ config: { url: localStorage.getItem('zippy_gti_bridge') || '' } }, 'http://127.0.0.1:8799');
    const prompt = shotNode.config?.prompt || 'Cinematic storyboard shot, preserve all connected character, face, costume, location, and prop references.';
    const res = await fetch(url + '/generate', { method: 'POST', headers: bridgeHeaders('gti'), body: JSON.stringify({ prompt, size: 'auto', images: refs }), signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.imgB64) throw new Error(data.error || `GTI HTTP ${res.status}`);
    const record = await saveResult({ kind: 'image', b64: data.imgB64, mime: data.mime || 'image/png', name: `${shotNode.config?.shotId || 'shot'}-gti.png` });
    shotNode.config.imageResultId = record.id;
    return record;
  }

  async function generateShotVideo(shotNode, provider, signal) {
    let image = await shotInputImage(shotNode, signal);
    if (!image?.b64) image = await generateShotImage(shotNode, signal);
    const prompt = shotNode.config?.prompt || 'Photorealistic cinematic storyboard motion. Preserve identity, wardrobe, location, lighting, and composition. Natural controlled movement.';
    if (provider === 'grok') {
      const configuredBridge = localStorage.getItem('zippy_grok_build_bridge') || '';
      const url = bridgeUrl({ config: { url: configuredBridge } }, 'http://127.0.0.1:8790');
      const body = { main_image: dataUrl(image), prompt, duration: 5, aspect_ratio: '16:9', metadata: { source: 'zippy-node-canvas-shot', shot_id: shotNode.config?.shotId || '' } };
      const res = await fetch(url + '/v1/grok/build/video', { method: 'POST', headers: bridgeHeaders('grok'), body: JSON.stringify(body), signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Grok HTTP ${res.status}`);
      return saveResult({ kind: 'video', url: data.video_url || data.video?.url || data.url, name: `${shotNode.config?.shotId || 'shot'}-grok.mp4` });
    }
    const url = bridgeUrl({ config: {} }, 'https://zippy-5080.studiozippy.co.kr');
    const body = { image: { b64: image.b64, mime: image.mime || 'image/png' }, prompt, workflow_preset: 'wan', duration: 5, aspect_ratio: '16:9' };
    const res = await fetch(url + '/v1/videos/generations', { method: 'POST', headers: bridgeHeaders('local'), body: JSON.stringify(body), signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.hint || `Local 5080 HTTP ${res.status}`);
    return saveResult({ kind: 'video', url: data.video_url || data.video?.url || data.url, name: `${shotNode.config?.shotId || 'shot'}-local.mp4` });
  }

  async function batchGenerateVideos() {
    if (state.abortController) return;
    let shots = allNodes('shot');
    if (!shots.length) {
      if (!allNodes('asset').length) addProjectAssets();
      addStoryboardShots(true);
      autoConnectProjectBoard();
      arrangeGraph();
      await saveGraph(false);
      shots = allNodes('shot');
    }
    if (!shots.length) { status('스토리보드 컷이 없습니다', 'var(--er)'); return; }
    const provider = $('znodeBatchProvider')?.value || 'local';
    const runBtn = $('znodeBatchVideoBtn'); const stopBtn = $('znodeStopBtn');
    state.abortController = new AbortController(); state.stopRequested = false;
    if (runBtn) runBtn.disabled = true; if (stopBtn) stopBtn.disabled = false;
    let completed = 0;
    try {
      for (const shot of shots) {
        if (state.stopRequested || state.abortController.signal.aborted) throw new DOMException('배치 생성이 중단되었습니다', 'AbortError');
        shot.output = { status: 'running', preview: `${completed + 1}/${shots.length} 영상 생성 중` }; render();
        try {
          const video = await generateShotVideo(shot, provider, state.abortController.signal);
          shot.config.videoUrl = video.url || '';
          shot.output = { status: 'done', resultId: video.id || '', preview: 'video · 생성 완료' };
          completed += 1;
        } catch (error) {
          shot.output = { status: 'error', preview: error.message || '생성 실패' };
        }
        await saveGraph(false); render();
      }
      status(`스토리보드 영상 생성 완료 · ${completed}/${shots.length}`, completed === shots.length ? 'var(--ok)' : 'var(--wn)');
    } catch (error) {
      status(state.stopRequested || error?.name === 'AbortError' ? `배치 생성 중단 · ${completed}/${shots.length}` : '배치 실패 · ' + error.message, 'var(--wn)');
    } finally { state.abortController = null; state.stopRequested = false; if (runBtn) runBtn.disabled = false; if (stopBtn) stopBtn.disabled = true; await saveGraph(false); render(); }
  }

  async function batchGenerateImages() {
    if (state.abortController) return;
    let shots = allNodes('shot');
    if (!shots.length) {
      if (!allNodes('asset').length) addProjectAssets();
      addStoryboardShots(true);
      autoConnectProjectBoard();
      arrangeGraph();
      await saveGraph(false);
      shots = allNodes('shot');
    }
    if (!shots.length) { status('스토리보드 컷이 없습니다', 'var(--er)'); return; }
    const pendingShots = shots.filter(shot => !shotHasImage(shot));
    const skipped = shots.length - pendingShots.length;
    if (!pendingShots.length) { status(`전체 이미지가 이미 생성되어 있습니다 · ${shots.length}컷`, 'var(--ok)'); return; }
    const runBtn = $('znodeBatchImageBtn'); const stopBtn = $('znodeStopBtn');
    state.abortController = new AbortController(); state.stopRequested = false;
    if (runBtn) runBtn.disabled = true; if (stopBtn) stopBtn.disabled = false;
    let completed = 0;
    try {
      for (const shot of pendingShots) {
        if (state.stopRequested || state.abortController.signal.aborted) throw new DOMException('일괄 이미지 생성이 중단되었습니다', 'AbortError');
        shot.output = { status: 'running', preview: `${completed + 1}/${pendingShots.length} GTI 이미지 생성 중` }; render();
        try {
          const image = await generateShotImage(shot, state.abortController.signal);
          shot.output = { status: 'done', resultId: image.id || '', preview: 'image · 생성 완료' };
          completed += 1;
        } catch (error) {
          shot.output = { status: 'error', preview: error.message || '생성 실패' };
        }
        await saveGraph(false); render();
      }
      status(`전체 이미지 생성 완료 · ${completed}/${pendingShots.length}${skipped ? ` · 기존 ${skipped}컷 유지` : ''}`, completed === pendingShots.length ? 'var(--ok)' : 'var(--wn)');
    } catch (error) {
      status(state.stopRequested || error?.name === 'AbortError' ? `이미지 생성 중단 · ${completed}/${pendingShots.length}` : '이미지 일괄 생성 실패 · ' + error.message, 'var(--wn)');
    } finally { state.abortController = null; state.stopRequested = false; if (runBtn) runBtn.disabled = false; if (stopBtn) stopBtn.disabled = true; await saveGraph(false); render(); }
  }

  async function run() {
    if (!state.graph || state.abortController) return;
    const runBtn = $('znodeRunBtn'); const stopBtn = $('znodeStopBtn');
    state.abortController = new AbortController(); state.stopRequested = false;
    if (runBtn) runBtn.disabled = true; if (stopBtn) stopBtn.disabled = false; status('그래프 실행 중...', 'var(--wn)');
    const values = new Map(); const pending = new Set(state.graph.nodes.map(node => node.id));
    try {
      while (pending.size) {
        const ready = state.graph.nodes.filter(node => pending.has(node.id) && state.graph.edges.filter(edge => edge.to === node.id).every(edge => values.has(edge.from)));
        if (!ready.length) throw new Error('연결 그래프에 순환 또는 끊긴 노드가 있습니다');
        for (const node of ready) {
          if (state.stopRequested || state.abortController.signal.aborted) throw new DOMException('그래프 실행이 중단되었습니다', 'AbortError');
          node.output = { status: 'running', preview: '실행 중...' }; render();
          const inputValues = incoming(node.id).map(parent => values.get(parent.id)).filter(Boolean); const value = await executeNode(node, inputValues, state.abortController.signal); values.set(node.id, value); pending.delete(node.id);
          node.output = value ? { status: 'done', resultId: value.id || '', preview: value.kind + (value.name ? ' · ' + value.name : '') } : { status: 'done', preview: '입력 없음' }; await saveGraph(false); render();
        }
      }
      await saveGraph(); status('그래프 실행 완료', 'var(--ok)');
    } catch (error) {
      if (state.stopRequested || error?.name === 'AbortError') status('그래프 실행 중단됨', 'var(--wn)');
      else status('실패 · ' + (error.message || error), 'var(--er)');
    } finally { state.abortController = null; state.stopRequested = false; if (runBtn) runBtn.disabled = false; if (stopBtn) stopBtn.disabled = true; }
  }

  function stopRun() {
    if (!state.abortController) return;
    state.stopRequested = true;
    state.abortController.abort();
    state.graph.nodes.forEach(node => { if (node.output?.status === 'running') node.output = { status: 'stopped', preview: '중단됨' }; });
    render(); status('그래프 중단 요청 중...', 'var(--wn)');
  }

  async function saveGraph(show = true) { if (!state.graph) return; if (state.db) await dbPut('graphs', state.graph, GRAPH_KEY); else { try { localStorage.setItem('zippy_node_graph', JSON.stringify(state.graph)); } catch {} } if (show) status('그래프 저장됨', 'var(--ok)'); }
  async function loadGraph() { const stored = state.db ? await dbGet('graphs', GRAPH_KEY) : (() => { try { return JSON.parse(localStorage.getItem('zippy_node_graph') || 'null'); } catch { return null; } })(); return ensureGraphShape(stored && stored.nodes && stored.edges ? stored : defaultGraph()); }
  function bind() {
    document.querySelectorAll('[data-znode-add]').forEach(button => button.addEventListener('click', () => { addNode(button.dataset.znodeAdd); const added = autoConnectGraph(); saveGraph(false); render(); status(added ? `노드 추가 · ${added}개 자동 연결` : '노드 추가됨', 'var(--ok)'); }));
    $('znodeRunBtn')?.addEventListener('click', run); $('znodeStopBtn')?.addEventListener('click', stopRun); $('znodeSaveBtn')?.addEventListener('click', () => saveGraph(true));
    $('znodeArrangeBtn')?.addEventListener('click', async () => { arrangeGraph(); await saveGraph(false); render(); status('노드 배치를 정리했습니다', 'var(--ok)'); });
    $('znodeImportAssetsBtn')?.addEventListener('click', async () => { const count = addProjectAssets(); const links = autoConnectProjectBoard(); await saveGraph(false); render(); status(`${count}개 프로젝트 에셋 불러옴 · ${links}개 컷 연결`, 'var(--ok)'); });
    $('znodeImportShotsBtn')?.addEventListener('click', async () => { const count = addStoryboardShots(false); const links = autoConnectProjectBoard(); arrangeGraph(); await saveGraph(false); render(); status(`${count}개 현재 에피소드 컷 불러옴 · ${links}개 에셋 연결`, 'var(--ok)'); });
    $('znodeImportAllShotsBtn')?.addEventListener('click', async () => { const count = addStoryboardShots(true); const links = autoConnectProjectBoard(); arrangeGraph(); await saveGraph(false); render(); status(`${count}개 전체 스토리보드 컷 불러옴 · ${links}개 에셋 연결`, 'var(--ok)'); });
    $('znodeBatchImageBtn')?.addEventListener('click', batchGenerateImages);
    $('znodeBatchVideoBtn')?.addEventListener('click', batchGenerateVideos);
    $('znodeAutoConnectBtn')?.addEventListener('click', async () => { const added = autoConnectGraph(); await saveGraph(false); render(); status(added ? `${added}개 연결을 자동으로 추가했습니다` : '추가할 연결이 없습니다', added ? 'var(--ok)' : 'var(--mu)'); });
    $('znodeDownloadBtn')?.addEventListener('click', downloadProjectGraph);
    $('znodeResetBtn')?.addEventListener('click', async () => { state.graph = defaultGraph(); await saveGraph(); render(); status('기본 그래프로 초기화됨', 'var(--ok)'); });
    $('znodeConnectBtn')?.addEventListener('click', () => { state.connecting = !state.connecting; state.connectSource = null; $('znodeCanvas')?.classList.toggle('connecting', state.connecting); $('znodeConnectBtn').classList.toggle('active', state.connecting); status(state.connecting ? '연결 모드 · 시작 노드를 클릭하세요' : '연결 모드 해제', 'var(--cy)'); render(); });
    const canvas = $('znodeCanvas');
    canvas?.addEventListener('pointerdown', event => {
      const isCanvasSurface = event.target === canvas || event.target.closest('.znode-links');
      if (!isCanvasSurface || state.connecting) return;
      state.panning = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
      canvas.classList.add('panning');
      canvas.setPointerCapture(event.pointerId);
    });
    canvas?.addEventListener('pointermove', event => {
      if (!state.panning) return;
      canvas.scrollLeft = state.panning.left - (event.clientX - state.panning.x);
      canvas.scrollTop = state.panning.top - (event.clientY - state.panning.y);
    });
    canvas?.addEventListener('pointerup', event => {
      if (!state.panning) return;
      state.panning = null;
      canvas.classList.remove('panning');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    });
    canvas?.addEventListener('pointercancel', () => { state.panning = null; canvas.classList.remove('panning'); });
    canvas?.addEventListener('wheel', event => {
      event.preventDefault();
      state.zoom = Math.max(.55, Math.min(1.6, state.zoom * (event.deltaY < 0 ? 1.08 : .92)));
      canvas.style.zoom = String(state.zoom);
      const zoomLabel = $('znodeZoomLabel'); if (zoomLabel) zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    }, { passive: false });
    $('znodeZoomResetBtn')?.addEventListener('click', () => { state.zoom = 1; if (canvas) canvas.style.zoom = '1'; const zoomLabel = $('znodeZoomLabel'); if (zoomLabel) zoomLabel.textContent = '100%'; });
  }
  async function init() { if (!$('zippyNodeCanvasRoot')) return; state.db = await openDb(); state.graph = await loadGraph(); if (!state.initialized) { bind(); state.initialized = true; } render(); }
  async function loadStoryboardV2(payload) {
    await init();
    if (!state.graph || !Array.isArray(payload)) return 0;
    addProjectAssets();
    const removed = new Set(state.graph.nodes.filter(node => node.type === 'shot').map(node => node.id));
    state.graph.nodes = state.graph.nodes.filter(node => node.type !== 'shot');
    state.graph.edges = state.graph.edges.filter(edge => !removed.has(edge.from) && !removed.has(edge.to));
    const visible = payload.slice(0, 240);
    for (let index = 0; index < visible.length; index++) {
      const shot = visible[index];
      let imageResultId = '';
      if (shot.imageB64) {
        const record = await saveResult({ kind: 'image', b64: shot.imageB64, mime: shot.imageMime || 'image/png', name: `${shot.id || 'shot'}-storyboard-v2.png` });
        imageResultId = record.id;
      }
      state.graph.nodes.push({
        id: `shot-v2-${String(shot.id || index).replace(/[^a-z0-9가-힣]+/gi, '-')}`,
        type: 'shot', x: 1040 + (index % 5) * 270, y: 34 + Math.floor(index / 5) * 430,
        config: {
          shotId: shot.id || `SHOT-${index + 1}`,
          episodeLabel: shot.ep ? `EP${String(shot.ep).padStart(2, '0')}` : 'STORYBOARD V2',
          location: shot.loc || '',
          prompt: shot.desc || '',
          videoPrompt: shot.videoPrompt || '',
          imageResultId
        },
        output: imageResultId ? { status: 'done', resultId: imageResultId, preview: 'image · V2 전송 완료' } : { status: 'ready', preview: 'V2 컷 · 이미지 대기' }
      });
    }
    autoConnectProjectBoard(); arrangeGraph(); await saveGraph(false); render();
    status(`Storyboard V2 ${visible.length}컷을 불러왔습니다`, 'var(--ok)');
    return visible.length;
  }
  window.zippyNodeCanvasInit = init;
  window.zippyNodeCanvasLoadV2 = loadStoryboardV2;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
