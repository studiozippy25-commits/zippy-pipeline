(function () {
  'use strict';
  var SOURCE = 'https://vvsvs.pro/cinematique';
  var catalog = null, catalogPromise = null, refreshPromise = null, live = [];
  var sourceState = { mode: 'pending', checkedAt: null, count: 0, matchedCount: 0, error: '' };
  var draft = null, scene = '', shotId = '', choice = null;
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function status(message, error) { if ($('cbStatus')) { $('cbStatus').textContent = message; $('cbStatus').dataset.error = error ? 'true' : 'false'; } }
  async function loadCatalog() {
    if (catalog) return catalog;
    if (!catalogPromise) catalogPromise = fetch('cinematography-catalog.json').then(function (response) {
      if (!response.ok) throw new Error('저장 카탈로그 HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      if (!Array.isArray(data) || !data.length || data.some(function (item) { return !item.id || !item.instruction || ['framing', 'movement'].indexOf(item.kind) < 0; })) throw new Error('저장 카탈로그 형식 오류');
      catalog = data; return catalog;
    }).finally(function () { catalogPromise = null; });
    return catalogPromise;
  }
  function parseSource(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), title = '', result = [], seen = new Set();
    // Read only inert headings and guide URLs. Never insert the source HTML into this page.
    doc.querySelectorAll('h3,a[href]').forEach(function (node) {
      if (node.tagName.toLowerCase() === 'h3') { title = node.textContent.trim().slice(0, 180); return; }
      var url;
      try { url = new URL(node.getAttribute('href'), SOURCE); } catch (_) { return; }
      if (url.origin !== 'https://vvsvs.pro' || !/^\/cinematique\/[a-z0-9-]+\/?$/i.test(url.pathname) || seen.has(url.pathname)) return;
      if (!/\bread\b[\s\S]*\bguide\b/i.test(node.textContent)) return;
      var slug = url.pathname.split('/').filter(Boolean).pop();
      seen.add(url.pathname); result.push({ id: slug, name: title || slug, sourceUrl: 'https://vvsvs.pro/cinematique/' + slug });
    });
    if (!result.length) throw new Error('원본 페이지에서 기법 제목과 Read Guide 링크를 찾지 못했습니다.');
    return result.slice(0, 400);
  }
  function displayReadableSource(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var sections = [], current = null;
    doc.querySelectorAll('h2,h3,p').forEach(function (node) {
      var tag = node.tagName.toLowerCase(), value = node.textContent.trim();
      if (tag === 'h2') { current = null; sections.push('<h2>' + esc(value) + '</h2>'); }
      if (tag === 'h3') {
        current = value;
        sections.push('<h3>' + esc(value) + '</h3>');
      }
      if (tag === 'p' && current && value) sections.push('<p>' + esc(value) + '</p>');
    });
    var frame = $('cbFrame');
    if (!frame || !sections.length) return;
    // Isolated text-only view of the explicitly requested public library; never execute imported scripts.
    frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
    frame.title = 'Cinematique 자동 수집 원문 · 읽기용';
    frame.srcdoc = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>body{margin:28px;background:#11151c;color:#e5e7eb;font:15px/1.7 system-ui}h1,h2,h3{color:#99f6e4}h2{margin-top:40px;border-top:1px solid #374151;padding-top:20px}p{white-space:pre-wrap}a{color:#93c5fd}small{color:#9ca3af}</style><h1>Cinematique</h1><small>자동 수집한 원문 읽기용 화면 · 원본 사이트의 검색과 동영상은 새 창에서 이용하세요.</small><p><a target="_blank" rel="noopener noreferrer" href="https://vvsvs.pro/cinematique">원본 사이트 열기 ↗</a></p>' + sections.join('') + '</html>';
    var note = document.querySelector('#cinematographyApp .cb-frame-note');
    if (note) note.textContent = '공개 원문을 자동으로 가져온 읽기용 화면입니다. 원본 사이트의 검색·동영상은 새 창 링크를 사용하세요. 왼쪽에서 기법을 추천·적용할 수 있습니다.';
  }
  function updateSource() {
    var el = $('cbSourceStatus'); if (!el) return;
    var when = sourceState.checkedAt ? new Date(sourceState.checkedAt).toLocaleString('ko-KR') : '';
    el.dataset.error = sourceState.mode === 'fallback' ? 'true' : 'false';
    el.textContent = sourceState.mode === 'live' ? '원본 목록 자동 수집 완료 · ' + sourceState.count + '개 / 프롬프트 연결 ' + sourceState.matchedCount + '개\n확인: ' + when : sourceState.mode === 'loading' ? '원본 사이트에서 기법 목록을 가져오는 중...' : sourceState.mode === 'fallback' ? '원본 수집 실패 · 저장 카탈로그 ' + (catalog || []).length + '개 사용 (실시간 아님)\n' + sourceState.error + '\n확인: ' + when : '원본 목록 수집 대기';
    if ($('cbCatalogCount')) $('cbCatalogCount').textContent = '프롬프트 연결 카탈로그 · ' + (catalog || []).length + '개';
    if ($('cbLiveList')) $('cbLiveList').innerHTML = (sourceState.mode === 'live' ? live : catalog || []).map(function (entry) {
      var local = (catalog || []).find(function (item) { return item.id === entry.id; });
      return '<article><a href="' + esc(entry.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(entry.nameKo || entry.name) + '</a><p>' + (local ? '프롬프트 연결됨 · ' + esc(local.nameKo) : '원본에서 확인 · 프롬프트 연결 전') + '</p></article>';
    }).join('');
  }
  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async function () {
      await loadCatalog(); sourceState.mode = 'loading'; updateSource();
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 12000);
      try {
        var response = await fetch(SOURCE, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
        if (!response.ok) throw new Error('원본 HTTP ' + response.status);
        var html = await response.text(); if (html.length > 4000000) throw new Error('원본 응답이 너무 큽니다.');
        live = parseSource(html);
        displayReadableSource(html);
        sourceState = { mode: 'live', checkedAt: new Date().toISOString(), count: live.length, matchedCount: catalog.filter(function (entry) { return live.some(function (raw) { return raw.id === entry.id; }); }).length, error: '' };
      } catch (error) {
        live = []; sourceState = { mode: 'fallback', checkedAt: new Date().toISOString(), count: 0, matchedCount: 0, error: error.name === 'AbortError' ? '12초 응답 시간 초과' : String(error.message || error) };
      } finally { clearTimeout(timer); updateSource(); }
      return snapshot();
    })().finally(function () { refreshPromise = null; });
    return refreshPromise;
  }
  function snapshot() { return clone({ source: SOURCE, status: sourceState, liveEntries: live, catalog: catalog || [] }); }
  function readStudio() {
    if (!window.ZippyPromptStudio || !window.ZippyPromptStudio.getDraft) throw new Error('프롬프트 생성기를 불러오지 못했습니다.');
    draft = window.ZippyPromptStudio.getDraft();
    if (!draft.shots.some(function (shot) { return shot.id === shotId; })) shotId = draft.shots[0] && draft.shots[0].id || '';
    if ($('cbShot')) $('cbShot').innerHTML = draft.shots.map(function (shot) { return '<option value="' + esc(shot.id) + '"' + (shot.id === shotId ? ' selected' : '') + '>' + esc(shot.id + ' · ' + (shot.description || '장면 미입력').slice(0, 35)) + '</option>'; }).join('');
    return draft;
  }
  function pullScene() {
    readStudio(); var shot = draft.shots.find(function (item) { return item.id === shotId; });
    scene = shot ? [shot.description, shot.initialState, shot.endState].filter(Boolean).join('\n') : '';
    if ($('cbScene')) $('cbScene').value = scene;
    choice = null; showChoice(); return scene;
  }
  async function query(value) {
    await loadCatalog();
    if (!window.ZippyPromptEngine) throw new Error('프롬프트 엔진을 불러오지 못했습니다.');
    var input = typeof value === 'string' ? { description: value } : value;
    if (!input || !String(input.description || '').trim()) throw new Error('추천할 장면을 입력하세요.');
    choice = window.ZippyPromptEngine.recommend(input, catalog); showChoice();
    return clone({ camera: choice, sourceStatus: sourceState, instructionsSource: 'curated-local-catalog', liveMatched: [choice.framing.id, choice.movement.id].filter(function (id) { return live.some(function (entry) { return entry.id === id; }); }) });
  }
  function showChoice() {
    ['framing', 'movement'].forEach(function (kind) {
      var el = $('cb-' + kind); if (!el) return;
      el.innerHTML = (catalog || []).filter(function (item) { return item.kind === kind; }).map(function (item) { return '<option value="' + esc(item.id) + '"' + (choice && choice[kind].id === item.id ? ' selected' : '') + '>' + esc(item.nameKo || item.name) + '</option>'; }).join('');
    });
    if ($('cbChoice')) $('cbChoice').textContent = choice ? choice.reason + '\n\n' + choice.framing.instruction + '\n' + choice.movement.instruction : '장면을 입력하고 자동 추천을 실행하세요.';
    if ($('cbApply')) $('cbApply').disabled = !choice;
  }
  async function apply(value) {
    if (!draft && !value) throw new Error('현재 프롬프트 장면을 먼저 가져오세요.');
    var request = value || { projectKey: draft.projectKey, shotId: shotId, framing: $('cb-framing').value, movement: $('cb-movement').value };
    var result = await window.ZippyPromptStudio.applyCamera(request);
    if (typeof window.goStep === 'function') window.goStep('prompts');
    return result;
  }
  async function init() {
    var root = $('cinematographyApp'); if (!root) return;
    if (!root.dataset.ready) {
      root.innerHTML = '<div class="cb-heading"><div><h2>Cinematique · 앵글 찾기</h2><p>원본 사이트를 보며 장면에 필요한 기법을 찾아 프롬프트 생성기에 적용합니다.</p></div><a href="' + SOURCE + '" target="_blank" rel="noopener noreferrer">원본 사이트 새 창으로 열기 ↗</a></div><div class="cb-layout"><section class="ps-card cb-controls"><h3>장면 → 앵글 자동 추천</h3><label for="cbShot">적용할 프롬프트 컷<select id="cbShot"></select></label><button data-cb="pull">현재 프롬프트 장면 가져오기</button><label for="cbScene">찾을 장면<textarea id="cbScene" rows="5" placeholder="예: 좁은 복도를 따라 인물 뒤에서 이동한다."></textarea></label><div class="ps-actions"><button data-cb="query" class="ps-primary">필요한 앵글 자동 찾기</button></div><div id="cbChoice" class="cb-choice"></div><label for="cb-framing">앵글·프레이밍<select id="cb-framing"></select></label><label for="cb-movement">카메라 움직임<select id="cb-movement"></select></label><button id="cbApply" data-cb="apply" class="ps-primary" disabled>선택 컷에 카메라 적용 → 프롬프트</button><div id="cbStatus" class="cb-status" role="status" aria-live="polite"></div><p class="ps-note">장면·모델·작성 중인 본문은 유지됩니다. 카메라를 적용한 뒤 검토한 내용으로 다시 구성 버튼으로 결과를 갱신하세요.</p><h3>원본 목록 자동 수집</h3><div id="cbSourceStatus" class="cb-status" role="status" aria-live="polite"></div><button data-cb="refresh">원본에서 다시 가져오기</button><details><summary id="cbCatalogCount">카탈로그</summary><div id="cbLiveList" class="cb-list"></div></details><p class="ps-note">원본의 기법 제목·가이드 링크를 자동 확인합니다. 프롬프트에는 검토된 카탈로그 지시문을 사용합니다. 원본에 새로 생긴 기법은 연결 전으로 표시됩니다.</p></section><section><iframe id="cbFrame" class="cb-frame" title="Cinematique 원본 촬영 기법 라이브러리" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="fullscreen" src="' + SOURCE + '"></iframe><p class="cb-frame-note">외부 사이트 화면입니다. 표시되지 않으면 위의 원본 새 창 링크를 사용하세요. 원본 화면의 선택과 왼쪽 프롬프트 설정은 별도로 동작합니다.</p></section></div>';
      root.dataset.ready = 'true';
      // The iframe is created only on tab open; hidden browser tabs otherwise defer lazy frames indefinitely.
      $('cbFrame').loading = 'eager';
      root.onclick = async function (event) {
        var button = event.target.closest('[data-cb]'); if (!button) return;
        try {
          if (button.dataset.cb === 'pull') { pullScene(); status('선택 컷의 현재 장면을 가져왔습니다.'); }
          if (button.dataset.cb === 'query') { scene = $('cbScene').value; await query(scene); status('앵글 추천 완료 · 직접 바꾼 뒤 적용할 수 있습니다.'); }
          if (button.dataset.cb === 'apply') { await apply(); }
          if (button.dataset.cb === 'refresh') { await refresh(); }
        } catch (error) { status(error.message || String(error), true); }
      };
      root.oninput = function (event) { if (event.target.id === 'cbScene') scene = event.target.value; };
      root.onchange = async function (event) {
        if (event.target.id === 'cbShot') { shotId = event.target.value; pullScene(); }
        if (choice && (event.target.id === 'cb-framing' || event.target.id === 'cb-movement')) {
          try { await query({ description: $('cbScene').value, framing: $('cb-framing').value, movement: $('cb-movement').value }); }
          catch (error) { status(error.message || String(error), true); }
        }
      };
    }
    try {
      await loadCatalog();
      var previousProject = draft && draft.projectKey; readStudio();
      if (previousProject !== draft.projectKey || !scene) pullScene();
      showChoice(); updateSource();
      if (!sourceState.checkedAt || Date.now() - Date.parse(sourceState.checkedAt) > 300000) await refresh();
    } catch (error) { status(error.message + ' · 프롬프트 생성 탭은 별도로 사용할 수 있습니다.', true); }
  }
  window.ZippyCinematography = { init: init, refresh: refresh, query: query, apply: apply, snapshot: snapshot };
})();
