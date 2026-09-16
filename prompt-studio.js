(function () {
  'use strict';
  var catalog = null, loading = null, record = null, project = '', model = 'h3';
  var items = [], references = [], music = '', style = 'Documentary / V-log. Natural observational realism, practical light, restrained contrast and physically plausible camera movement.';
  var storageWarning = '';
  var sourcePrompt = '', sourceName = '', rewriteBusy = false, rewriteController = null;
  var keyframes = [], uploadBusy = false, keyframesDirty = false, attachmentNote = '', projectEpoch = 0;
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function currentKey() {
    try { return String(currentProjectKey || (typeof currentProject !== 'undefined' && (currentProject.nameEn || currentProject.name)) || 'project'); }
    catch (_) { return 'project'; }
  }
  function uuid() { return 'prompt-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function key() { return 'zippy_prompt_studio_v1:' + encodeURIComponent(currentKey()); }
  function status(message, error) { var el = $('psStatus'); if (el) { el.textContent = message; el.dataset.error = error ? 'true' : 'false'; } }
  function emptyShot() { var n = 1; while (items.some(function (shot) { return shot.id === 'shot-' + n; })) n++; return { id: 'shot-' + n, description: '', initialState: '', endState: '', dialogue: '', speaker: '', soundscape: '', duration: 6, framing: 'auto', movement: 'auto' }; }
  function syncProject() {
    if (project !== currentKey()) { if (rewriteController) rewriteController.abort(); projectEpoch++; project = currentKey(); items = []; items = [emptyShot()]; references = []; record = null; music = ''; sourcePrompt = ''; sourceName = ''; storageWarning = ''; keyframes = []; keyframesDirty = false; attachmentNote = '프로젝트 전환 시 이미지 첨부는 초기화됩니다. 필요한 키프레임을 다시 첨부하세요.'; return true; }
    return false;
  }
  function assertProject(expected) { if (expected !== currentKey()) throw new Error('프로젝트가 변경되었습니다. 현재 프로젝트에서 다시 생성하세요.'); }
  function history() {
    try { var values = JSON.parse(localStorage.getItem(key()) || '[]'); return Array.isArray(values) ? values.filter(function (r) { return r.projectKey === currentKey(); }) : []; }
    catch (_) { storageWarning = '브라우저 기록을 읽지 못했습니다. JSON 다운로드로 보관하세요.'; return []; }
  }
  function remember(value) {
    assertProject(value.projectKey);
    try { localStorage.setItem(key(), JSON.stringify([clone(value)].concat(history().filter(function (r) { return r.id !== value.id; })).slice(0, 30))); }
    catch (_) { storageWarning = '브라우저 저장 실패. 결과는 화면에 있으며 JSON 다운로드로 보관할 수 있습니다.'; }
  }
  async function loadCatalog() {
    if (catalog) return catalog;
    if (!loading) loading = fetch('cinematography-catalog.json').then(function (response) {
      if (!response.ok) throw new Error('카메라 카탈로그 로드 실패: HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      if (!Array.isArray(data) || !data.length || data.some(function (entry) { return !entry.id || !entry.name || !entry.instruction || ['framing', 'movement'].indexOf(entry.kind) < 0; })) throw new Error('카메라 카탈로그 형식이 올바르지 않습니다.');
      var legacy = typeof CAMERA_MOVES !== 'undefined' && Array.isArray(CAMERA_MOVES) ? CAMERA_MOVES : [];
      catalog = data.concat(legacy.map(function (move) { return { id: 'legacy:' + move.id, name: move.name, nameKo: '무빙 라이브러리 · ' + move.ko, kind: 'movement', description: move.desc, instruction: move.prompt, keywords: [], sourceUrl: 'https://aicameramovements.com/' }; }));
      return catalog;
    }).finally(function () { loading = null; });
    return loading;
  }
  function options(kind, selected) {
    return '<option value="auto">자동 추천</option>' + (catalog || []).filter(function (entry) { return entry.kind === kind; }).map(function (entry) { return '<option value="' + esc(entry.id) + '"' + (selected === entry.id ? ' selected' : '') + '>' + esc(entry.nameKo || entry.name) + '</option>'; }).join('');
  }
  function field(index, name, label, multiline) {
    var id = 'ps-' + index + '-' + name, value = items[index][name] || '';
    return '<label for="' + id + '">' + label + (multiline ? '<textarea rows="2"' : '<input type="text"') + ' id="' + id + '" data-shot="' + index + '" data-field="' + name + '"' + (multiline ? '>' + esc(value) + '</textarea>' : ' value="' + esc(value) + '">') + '</label>';
  }
  function cameraText(camera) {
    if (!camera) return '';
    function name(value) { return typeof value === 'object' && value ? value.nameKo || value.name || value.id : value; }
    return [name(camera.framing), name(camera.movement), camera.reason].filter(Boolean).join(' · ');
  }
  function renderShots() {
    return items.map(function (shot, index) {
      return '<fieldset class="ps-shot"><legend>컷 ' + (index + 1) + ' · ' + esc(shot.id) + '</legend>' + field(index, 'description', '장면과 핵심 행동', true) + '<div class="ps-row">' + field(index, 'initialState', '시작 상태', true) + field(index, 'endState', '종료 상태', true) + '</div><div class="ps-row">' + field(index, 'speaker', '화자') + field(index, 'dialogue', '정확한 대사') + '</div>' + field(index, 'soundscape', '현장음·행동 소리') + '<div class="ps-row"><label for="ps-' + index + '-duration">길이 (초)<input id="ps-' + index + '-duration" type="number" min="1" step="0.1" value="' + esc(shot.duration) + '" data-shot="' + index + '" data-field="duration"></label><label for="ps-' + index + '-framing">앵글·프레이밍<select id="ps-' + index + '-framing" data-shot="' + index + '" data-field="framing">' + options('framing', shot.framing) + '</select></label></div><label for="ps-' + index + '-movement">카메라 움직임<select id="ps-' + index + '-movement" data-shot="' + index + '" data-field="movement">' + options('movement', shot.movement) + '</select></label><div class="ps-camera" id="psCamera' + index + '"></div><button type="button" data-remove="' + index + '"' + (items.length < 2 ? ' disabled' : '') + '>이 컷 제거</button></fieldset>';
    }).join('');
  }
  function renderRefs() {
    return references.length ? references.map(function (ref, index) {
      return '<div class="ps-ref"><label class="ps-check"><input type="checkbox" data-ref="' + index + '" data-field="enabled"' + (ref.enabled === false ? '' : ' checked') + '> ' + esc(ref.type) + ' ' + ref.index + ' · ' + esc(ref.label) + '</label><small>적용 컷: ' + esc((ref.usedBy || []).join(', ')) + ' · ' + (ref.ready === undefined ? '현재 참조 파일 상태 별도 확인' : ref.ready ? '기존 플래너에 참조 있음' : '생성 전에 참조 파일 준비 필요') + '</small><label>참조 역할<input data-ref="' + index + '" data-field="role" value="' + esc(ref.role) + '"></label><label>가져오지 않을 요소<input data-ref="' + index + '" data-field="exclude" value="' + esc(ref.exclude) + '"></label></div>';
    }).join('') : '<p class="ps-note">Seedance에서 선택한 컷을 가져오면 해당 컷의 참조 역할과 업로드 순서가 표시됩니다. 참조 파일은 별도로 준비하세요.</p>';
  }
  function keyframeMetadata(values) {
    return (values || []).map(function (frame) { return { index: frame.index, kind: frame.kind, shotNumber: frame.shotNumber, label: frame.label, mime: frame.mime, width: frame.width, height: frame.height }; });
  }
  function renderKeyframes() {
    var disabled = rewriteBusy || uploadBusy ? ' disabled' : '';
    return '<fieldset class="ps-keyframes"' + disabled + '><legend>키프레임 이미지 · ' + keyframes.length + '장</legend><label for="psKeyframeFiles">JPEG · PNG · WebP 첨부<input id="psKeyframeFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><p class="ps-note">H3 최대 9장 / Seedance 최대 30장 · 장당 10MB, 전체 40MB 이하 · 최대 변 2048px로 준비합니다. Picture 번호를 원문과 맞추고 시작·종료·일반 참조 및 적용 컷을 지정하세요.</p><div class="ps-keyframe-list">' + keyframes.map(function (frame, index) {
      return '<div class="ps-keyframe"><img src="data:' + frame.mime + ';base64,' + frame.b64 + '" alt="' + esc('Picture ' + frame.index + ' · ' + frame.label) + '"><div><p class="ps-keyframe-name">' + esc(frame.label) + ' · ' + frame.width + '×' + frame.height + '</p><div class="ps-row"><label>Picture 번호<input type="number" min="1" step="1" data-keyframe="' + index + '" data-field="index" value="' + frame.index + '"></label><label>적용 컷 번호<input type="number" min="1" step="1" data-keyframe="' + index + '" data-field="shotNumber" value="' + frame.shotNumber + '"></label></div><label>이미지 역할<select data-keyframe="' + index + '" data-field="kind">' + [['start', '시작 키프레임'], ['end', '종료 키프레임'], ['reference', '일반 참조']].map(function (entry) { return '<option value="' + entry[0] + '"' + (frame.kind === entry[0] ? ' selected' : '') + '>' + entry[1] + '</option>'; }).join('') + '</select></label><button type="button" data-remove-keyframe="' + index + '">이미지 제거</button></div></div>';
    }).join('') + '</div></fieldset><p class="ps-note">' + esc(attachmentNote) + '</p><p class="ps-note">이미지는 분석·리라이팅을 누를 때만 상단에서 선택한 텍스트 모델에 전송됩니다. 로컬 모델은 비전 입력을 지원해야 합니다. 첨부 원본·미리보기는 메모리에만 유지되며 브라우저 기록·JSON·NAS에는 이미지 파일이 포함되지 않습니다. 영상은 생성하지 않습니다.</p>';
  }
  function render() {
    var root = $('promptStudioApp'); if (!root) return;
    var disabled = rewriteBusy || uploadBusy ? ' disabled' : '';
    root.innerHTML = '<div class="ps-hero"><div><h2>프롬프트 분석·리라이팅</h2><p>' + esc(project) + ' · 기존 프롬프트의 사건과 대사를 보존하며 모델 형식·앵글·움직임을 보강합니다.</p></div><div class="ps-models" aria-label="리라이팅 대상 모델"><button data-model="h3" aria-pressed="' + (model === 'h3') + '"' + disabled + '>MiniMax H3</button><button data-model="seedance" aria-pressed="' + (model === 'seedance') + '"' + disabled + '>Seedance 2.5</button></div></div>' +
      '<div class="ps-layout"><section class="ps-card"><h3>원본 프롬프트</h3><label for="psOriginal">기존 프롬프트 붙여넣기<textarea id="psOriginal" class="ps-original" rows="14" spellcheck="false" placeholder="다른 Codex에서 만든 프롬프트나 기존 작업 프롬프트를 넣으세요."' + disabled + '>' + esc(sourcePrompt) + '</textarea></label>' +
      '<label for="psSourceFile">텍스트 파일 가져오기 (.txt · .md · .json)<input id="psSourceFile" type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json"' + disabled + '></label><p class="ps-note">' + esc(sourceName) + '</p><div class="ps-actions"><button class="ps-primary" data-action="rewrite"' + (!catalog || rewriteBusy ? ' disabled' : '') + '>' + (rewriteBusy ? '분석 중...' : '분석·리라이팅') + '</button><button data-action="cancel-rewrite"' + (rewriteBusy ? '' : ' hidden') + '>분석 중지</button><button data-action="retry"' + (catalog ? ' hidden' : '') + '>카탈로그 다시 불러오기</button></div>' +
      '<div id="psStatus" class="ps-status" role="status" aria-live="polite"></div><p class="ps-note">상단 파이프라인의 텍스트 모델 설정으로 원문을 분석합니다. 실제 대사·사건은 유지하고 모델별 프롬프트 형식과 촬영 지시를 정리합니다. 연결 실패 시 결과를 만들지 않습니다.</p>' +
      '<details id="psAnalyzed"' + (record ? ' open' : '') + '><summary>분석된 컷·카메라 상세 검토</summary><fieldset class="ps-analysis-fields"' + disabled + '><div class="ps-actions"><button data-action="import">Seedance 선택 컷 가져오기</button><button data-action="planner">기존 Seedance 플래너 열기</button><button data-action="cinematique">Cinematique에서 앵글 찾기</button><button data-action="camera-library">카메라 무빙 라이브러리</button></div><div id="psShots">' + renderShots() + '</div><button data-action="add">+ 컷 추가</button><label for="psStyle">표현 기준<textarea id="psStyle" rows="2">' + esc(style) + '</textarea></label><label for="psMusic">배경음악 지시<input id="psMusic" value="' + esc(music) + '" placeholder="비우면 BGM 자동 OFF · 현장음만"></label><p class="ps-note">배경음악 칸을 비우면 다시 구성할 때 BGM을 자동으로 끕니다. 현장음·행동 소리·대사는 유지됩니다. 원문 분석에서는 원문에 명시된 음악만 보존합니다.</p><details><summary>참조 역할 (' + references.length + '개)</summary><div id="psRefs">' + renderRefs() + '</div></details><button class="ps-primary" data-action="generate"' + (!catalog || rewriteBusy ? ' disabled' : '') + '>검토한 내용으로 다시 구성</button><p class="ps-note">상세 항목의 재구성은 추가 모델 호출 없이 실행합니다. 카메라 자동 추천은 장면 단서 기반이며 직접 변경할 수 있습니다.</p></fieldset></details></section>' +
      '<section class="ps-card"><h3>리라이팅 결과 · ' + (model === 'h3' ? 'MiniMax H3' : 'Seedance 2.5') + '</h3><label for="psOutput">편집 가능한 프롬프트<textarea id="psOutput" class="ps-output" spellcheck="false" placeholder="원문을 입력하고 분석·리라이팅을 실행하세요.">' + esc(record && record.prompt || '') + '</textarea></label><div class="ps-review"><h3>변경 내용</h3>' + reviewList(record && record.changes, '분석 후 변경 사항을 표시합니다.') + '<h3>확인할 내용</h3>' + reviewList(record && record.reviewIssues, '추가 확인 항목 없음') + '</div><div class="ps-actions"><button data-action="copy"' + (record ? '' : ' disabled') + '>텍스트 복사</button><button data-action="json"' + (record ? '' : ' disabled') + '>JSON 복사</button><button data-action="download"' + (record ? '' : ' disabled') + '>JSON 다운로드</button><button data-action="nas"' + (record ? '' : ' disabled') + '>NAS에 스냅샷 저장</button></div><p class="ps-note">원문·리라이팅·변경 사항은 JSON에 함께 보관됩니다. 최근 30개는 이 브라우저·프로젝트에 저장됩니다.</p><pre id="psReceipt" class="ps-receipt"></pre><div class="ps-history"><h3>현재 프로젝트 기록</h3><div id="psHistory"></div></div><details class="ps-sources"><summary>참고 자료</summary><a href="https://vvsvs.pro/cinematique" target="_blank" rel="noopener noreferrer">Cinematique 카메라 기법</a><br><a href="https://oasis-dentist-28a.notion.site/5-MiniMax-H3-3b67425e612281e78e7fd69907054621" target="_blank" rel="noopener noreferrer">MiniMax H3 가이드</a><br><a href="https://oasis-dentist-28a.notion.site/4-Seedance-2-5-3b27425e61228192892cdb9a57b368aa" target="_blank" rel="noopener noreferrer">Seedance 2.5 가이드</a></details></section></div>';
    var sourceField = $('psSourceFile');
    if (sourceField) sourceField.parentElement.insertAdjacentHTML('afterend', renderKeyframes());
    var review = root.querySelector('.ps-review');
    if (review) review.insertAdjacentHTML('beforeend', '<h3>키프레임 관찰·충돌 검토</h3>' + reviewList(record && (record.keyframeObservations || []).map(function (entry) { return 'Picture ' + entry.index + ' · ' + entry.observation + ((entry.conflicts || []).length ? '\n충돌: ' + entry.conflicts.join(' / ') : '') + ((entry.uncertainties || []).length ? '\n불확실: ' + entry.uncertainties.join(' / ') : ''); }), '아직 이미지 분석 결과가 없습니다. 첨부 후 분석·리라이팅을 실행하세요.'));
    renderHistory(); updateCameras();
    if (rewriteBusy || uploadBusy) root.querySelectorAll('input,textarea,select,button').forEach(function (el) { if (el.dataset.action !== 'cancel-rewrite') el.disabled = true; });
    if (storageWarning) status(storageWarning, true);
  }
  function reviewList(values, fallback) { return Array.isArray(values) && values.length ? '<ul>' + values.map(function (value) { return '<li>' + esc(typeof value === 'string' ? value : JSON.stringify(value)) + '</li>'; }).join('') + '</ul>' : '<p class="ps-note">' + fallback + '</p>'; }
  function renderHistory() { if ($('psHistory')) $('psHistory').innerHTML = history().map(function (r) { return '<button data-history="' + esc(r.id) + '">' + esc(r.model === 'h3' ? 'MiniMax H3' : 'Seedance 2.5') + ' · ' + esc(r.createdAt) + ' · ' + esc((r.shots || []).length) + '컷</button>'; }).join('') || '<p class="ps-note">저장된 기록 없음</p>'; }
  function input() {
    var counters = { image: 0, video: 0, audio: 0 };
    var selected = references.filter(function (ref) { return ref.enabled !== false; }).map(function (ref) { var result = clone(ref); if (!record || !record.originalPrompt) result.index = ++counters[result.type]; delete result.enabled; return result; });
    return { model: model, projectKey: project, shots: clone(items), references: selected, music: music, style: style };
  }
  function updateCameras() {
    if (!catalog || !window.ZippyPromptEngine) return;
    items.forEach(function (shot, index) {
      try { var camera = window.ZippyPromptEngine.recommend(shot, catalog); if ($('psCamera' + index)) $('psCamera' + index).textContent = cameraText(camera); }
      catch (error) { if ($('psCamera' + index)) $('psCamera' + index).textContent = error.message; }
    });
  }
  async function rewrite(value) {
    if (rewriteBusy || uploadBusy) throw new Error('이미 분석 또는 이미지 준비 중입니다. 완료한 뒤 다시 실행하세요.');
    syncProject();
    var request = value ? clone(value) : { originalPrompt: sourcePrompt, model: model, projectKey: project, style: style, keyframes: clone(keyframes) };
    assertProject(request.projectKey);
    if (!request.originalPrompt || !request.originalPrompt.trim()) throw new Error('기존 프롬프트를 먼저 입력하세요.');
    if (value) sourceName = '';
    retainOutput();
    sourcePrompt = request.originalPrompt; model = request.model; rewriteBusy = true;
    var originEpoch = projectEpoch;
    var controller = new AbortController(); rewriteController = controller;
    var message = '기존 프롬프트 분석 중 · 파이프라인 텍스트 모델을 호출합니다.', failed = false;
    render(); status(message);
    try {
      await loadCatalog(); assertProject(request.projectKey);
      if (!window.ZippyPromptRewriter) throw new Error('리라이팅 엔진을 불러오지 못했습니다. 새로고침하세요.');
      if (typeof callLLM !== 'function') throw new Error('파이프라인 텍스트 모델 연결을 사용할 수 없습니다. 상단 모델 설정을 확인하세요.');
      var result = await window.ZippyPromptRewriter.rewrite(request, async function (instructions, images) {
        if (controller.signal.aborted) throw new Error('분석을 중지했습니다.');
        var response = await callLLM({ images: images || [], prompt: instructions, signal: controller.signal });
        if (!response || typeof response.textOut !== 'string' || !response.textOut.trim()) throw new Error('텍스트 모델에서 분석 결과를 받지 못했습니다. 연결과 모델 설정을 확인하세요.');
        return response.textOut;
      }, catalog);
      assertProject(request.projectKey);
      if (originEpoch !== projectEpoch) throw new Error('프로젝트가 변경되어 이전 분석 결과를 반영하지 않았습니다.');
      if (controller.signal.aborted) throw new Error('분석을 중지했습니다.');
      record = clone(result); items = clone(result.shots); references = clone(result.references || []); music = result.music || ''; style = result.style || style;
      record.keyframes = keyframeMetadata(result.keyframes || request.keyframes); keyframesDirty = false;
      if (sourceName) record.sourceFileName = sourceName;
      remember(record); message = storageWarning || '리라이팅 완료 · 원문과 결과, 변경 내용·확인할 내용을 검토하세요.'; failed = !!storageWarning;
      return clone(record);
    } catch (error) {
      message = controller.signal.aborted ? '분석을 중지했습니다. 새 결과를 만들지 않았습니다.' : '리라이팅 실패 · ' + (error.message || String(error)); failed = true;
      throw error;
    } finally {
      if (rewriteController === controller) { rewriteController = null; rewriteBusy = false; }
      if (project === currentKey()) { render(); status(originEpoch === projectEpoch ? message : '프로젝트 전환으로 이전 분석을 중지했습니다. 이미지는 다시 첨부하세요.', failed); }
    }
  }
  async function loadSourceFile(file) {
    if (!file) return;
    if (rewriteBusy || uploadBusy) throw new Error('분석 또는 이미지 준비 완료 후 파일을 가져오세요.');
    if (!/\.(txt|md|json)$/i.test(file.name)) throw new Error('.txt, .md, .json 파일을 사용하세요.');
    if (file.size > 200000) throw new Error('텍스트 파일은 200KB 이하로 나눠 주세요.');
    var originKey = currentKey();
    var text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    assertProject(originKey);
    if (rewriteBusy) throw new Error('분석이 시작되어 파일 반영을 중지했습니다. 분석 완료 후 가져오세요.');
    if (/\.json$/i.test(file.name)) {
      var data;
      try { data = JSON.parse(text); } catch (_) { throw new Error('올바른 JSON 파일이 아닙니다.'); }
      if (typeof data === 'string') text = data;
      else if (data && typeof data.prompt === 'string') text = data.prompt;
      else if (data && typeof data.originalPrompt === 'string') text = data.originalPrompt;
    }
    if (!text.trim() || text.length > 50000) throw new Error('원문은 비어 있지 않은 50,000자 이내 텍스트여야 합니다.');
    sourcePrompt = text; sourceName = file.name; record = null; render(); status('파일 내용을 원문으로 가져왔습니다. 분석·리라이팅을 실행하세요.');
  }
  async function prepareKeyframe(file) {
    if (!/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type)) throw new Error('JPEG, PNG, WebP 이미지 파일만 첨부할 수 있습니다.');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error(file.name + ': 빈 파일 또는 10MB 초과 이미지입니다.');
    var url = URL.createObjectURL(file), img = new Image();
    try {
      await new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = function () { reject(new Error(file.name + ': 이미지를 해석할 수 없습니다.')); }; img.src = url; });
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h || w * h > 100000000) throw new Error(file.name + ': 유효하지 않거나 지나치게 큰 이미지입니다.');
      var scale = Math.min(1, 2048 / Math.max(w, h)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      var ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('이미지 준비용 캔버스를 사용할 수 없습니다.');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Existing compressor may skip small-byte images even when dimensions exceed the limit.
      var data = canvas.toDataURL('image/jpeg', 0.9);
      if (!data.startsWith('data:image/jpeg;base64,')) throw new Error('이미지 변환에 실패했습니다.');
      return { label: file.name, mime: 'image/jpeg', b64: data.slice(data.indexOf(',') + 1), width: canvas.width, height: canvas.height, sourceBytes: file.size };
    } finally { URL.revokeObjectURL(url); }
  }
  async function loadKeyframes(files) {
    if (rewriteBusy || uploadBusy) throw new Error('분석 또는 이미지 준비가 끝난 뒤 첨부하세요.');
    syncProject();
    var selected = Array.from(files || []); if (!selected.length) return;
    var limit = model === 'h3' ? 9 : 30;
    if (keyframes.length + selected.length > limit) throw new Error((model === 'h3' ? 'H3' : 'Seedance') + ' 이미지 첨부는 최대 ' + limit + '장입니다.');
    if (keyframes.reduce(function (sum, frame) { return sum + frame.sourceBytes; }, 0) + selected.reduce(function (sum, file) { return sum + file.size; }, 0) > 40 * 1024 * 1024) throw new Error('전체 첨부 이미지 원본은 40MB 이하여야 합니다.');
    retainOutput();
    var originKey = currentKey(), epoch = projectEpoch, pending = [];
    uploadBusy = true; render(); status('키프레임 이미지 준비 중 · 아직 모델에 전송하지 않습니다.');
    try {
      for (var file of selected) {
        pending.push(await prepareKeyframe(file));
        assertProject(originKey);
        if (epoch !== projectEpoch) throw new Error('프로젝트가 변경되어 이미지 첨부를 취소했습니다.');
      }
      var next = keyframes.slice();
      pending.forEach(function (frame) { var number = 1; while (next.some(function (entry) { return entry.index === number; })) number++; next.push(Object.assign(frame, { index: number, kind: 'reference', shotNumber: 1 })); });
      if (next.reduce(function (sum, frame) { return sum + frame.b64.length; }, 0) > 40 * 1024 * 1024) throw new Error('분석 전송용 이미지 데이터 합계가 40MB를 초과합니다. 이미지를 줄여 주세요.');
      keyframes = next; keyframesDirty = true; attachmentNote = '이미지 준비 완료. 원문에 맞게 번호·역할·컷을 확인하고 분석·리라이팅을 누르세요.';
    } finally {
      uploadBusy = false;
      if (project === currentKey()) { render(); status(attachmentNote); }
    }
  }
  async function generate(value) {
    if (rewriteBusy || uploadBusy) throw new Error('분석 또는 이미지 준비 중입니다. 완료 후 다시 구성하세요.');
    if (keyframesDirty) throw new Error('키프레임 첨부·매핑이 변경되었습니다. 분석·리라이팅을 다시 실행하세요.');
    if (value) { syncProject(); assertProject(value.projectKey); }
    else if (syncProject()) { render(); throw new Error('프로젝트가 변경되었습니다. 새 프로젝트의 장면을 입력하세요.'); }
    var request = value ? clone(value) : input();
    await loadCatalog(); assertProject(request.projectKey);
    if (!window.ZippyPromptEngine) throw new Error('프롬프트 엔진을 불러오지 못했습니다. 페이지를 새로고침하세요.');
    var compiled = window.ZippyPromptEngine.compile(request, catalog);
    assertProject(compiled.projectKey);
    if (record && record.originalPrompt) {
      if (sourcePrompt !== record.originalPrompt) throw new Error('원문이 변경되었습니다. 분석·리라이팅을 먼저 실행하세요.');
      compiled.originalPrompt = record.originalPrompt;
      compiled.keyframes = keyframeMetadata(record.keyframes);
      if (record.keyframeObservations) compiled.keyframeObservations = clone(record.keyframeObservations);
      if (record.imageAnalysis) compiled.imageAnalysis = clone(record.imageAnalysis);
      compiled.changes = (Array.isArray(record.changes) ? record.changes : []).concat(['검토한 컷·카메라 설정으로 모델별 프롬프트를 다시 구성했습니다.']);
      compiled.reviewIssues = clone(record.reviewIssues || []); compiled.reviewStatus = 'needs-review';
      compiled.constraints = clone(record.constraints || []);
      compiled.shots.forEach(function (shot) { var previous = record.shots.find(function (entry) { return entry.id === shot.id; }); if (previous && previous.sourceText) shot.sourceText = previous.sourceText; });
      if (compiled.constraints.length) {
        var constraints = '\n\n[Preserved Source Constraints]\n' + compiled.constraints.join('\n');
        if (compiled.fields) { compiled.fields.integrated_multimodal_description += constraints; var prefix = compiled.prompt.slice(0, compiled.prompt.indexOf('integrated_multimodal_description:')); compiled.prompt = prefix + Object.entries(compiled.fields).map(function (entry) { return entry[0] + ': ' + entry[1]; }).join('\n\n'); }
        else compiled.prompt += constraints;
      }
      compiled.preservation = { semanticReviewRequired: true, manuallyRecomposed: true };
    } else if (sourcePrompt) throw new Error('입력한 원문을 분석·리라이팅한 뒤 상세 내용을 다시 구성하세요.');
    record = clone(compiled); model = record.model; items = clone(request.shots); references = clone(record.references || []); music = request.music || ''; style = request.style || style;
    remember(record); render(); status(storageWarning || '생성 완료 · 자동 카메라 추천과 각 참조의 역할을 확인하세요.', !!storageWarning);
    return clone(record);
  }
  function exportRecord() {
    if (!record) throw new Error('먼저 프롬프트를 생성하세요.');
    assertProject(record.projectKey);
    if (keyframesDirty) throw new Error('키프레임 첨부·매핑이 변경되었습니다. 다시 분석한 뒤 내보내세요.');
    var edited = $('psOutput') ? $('psOutput').value : record.prompt;
    if (!edited.trim()) throw new Error('프롬프트가 비어 있습니다.');
    if (edited !== record.prompt) { record = Object.assign({}, record, { id: uuid(), prompt: edited, customized: true, structuredFieldsMatchPrompt: false, createdAt: new Date().toISOString() }); remember(record); renderHistory(); status('수정된 본문으로 새 기록을 저장했습니다. 구조화 필드는 생성 당시 값입니다.'); }
    return clone(record);
  }
  function importSelected() {
    syncProject();
    var planner = window.ZippySeedancePlanner;
    if (!planner) throw new Error('Seedance 플래너를 불러오지 못했습니다.');
    var selected = planner.state(); assertProject(selected.projectKey);
    var source = typeof SB_SHOTS !== 'undefined' && Array.isArray(SB_SHOTS) ? SB_SHOTS : [];
    if (!selected.items.length) throw new Error('기존 Seedance 플래너에서 먼저 컷을 선택하세요.');
    items = selected.items.map(function (entry) {
      var shot = source.find(function (s) { return String(s.id) === String(entry.id); });
      if (!shot) throw new Error('선택 컷을 찾을 수 없습니다: ' + entry.id);
      return { id: String(shot.id), description: String(shot.desc || shot.description || shot.frame || ''), initialState: String(shot.initialState || shot.frame || ''), endState: String(shot.endState || shot.func || ''), dialogue: String(shot.audioDialogue || shot.dialogue || ''), speaker: String(shot.speaker || ''), soundscape: String(shot.soundscape || shot.audioSfx || ''), duration: entry.duration, framing: 'auto', movement: 'auto' };
    });
    var ids = items.map(function (shot) { return shot.id; }), counters = { image: 0, video: 0, audio: 0 };
    references = planner.collectReferences().filter(function (ref) { return (ref.usedBy || []).some(function (id) { return ids.indexOf(String(id)) >= 0; }); }).map(function (ref) {
      var type = /^video\//.test(ref.mime || '') || ref.type === 'video' ? 'video' : /^audio\//.test(ref.mime || '') || ref.type === 'audio' ? 'audio' : 'image';
      return { type: type, index: ++counters[type], role: String(ref.type || 'reference') + ': ' + String(ref.label || ''), label: String(ref.label || ''), usedBy: (ref.usedBy || []).map(String).filter(function (id) { return ids.indexOf(id) >= 0; }), exclude: 'unrelated pose, framing, text, lighting and color grade outside the declared role', ready: !!ref.ready };
    });
    record = null; render(); status(items.length + '컷 · 참조 ' + references.length + '개를 가져왔습니다. 참조 파일은 JSON에 포함하지 않습니다.');
  }
  async function saveNas() {
    var snapshot = exportRecord();
    snapshot.id = uuid(); snapshot.createdAt = new Date().toISOString();
    assertProject(snapshot.projectKey);
    if (typeof zippyNasSaveJson !== 'function') throw new Error('NAS 저장 기능을 불러오지 못했습니다.');
    var button = document.querySelector('#promptStudioApp [data-action="nas"]'); if (button) button.disabled = true;
    status('NAS에 프롬프트 스냅샷을 저장하는 중입니다...');
    try {
      var receipt = await zippyNasSaveJson('prompts', snapshot.id, snapshot, { source: 'prompt-studio', projectKey: snapshot.projectKey, model: snapshot.model }, { force: true });
      if (!receipt || receipt.ok !== true) throw new Error('NAS 저장 확인 응답이 없습니다.');
      if (currentKey() !== snapshot.projectKey) { status('이전 프로젝트 ' + snapshot.projectKey + '의 NAS 저장 완료 · ' + snapshot.id); return clone(receipt); }
      remember(snapshot); renderHistory();
      if ($('psReceipt')) $('psReceipt').textContent = JSON.stringify({ id: snapshot.id, projectKey: snapshot.projectKey, receipt: receipt }, null, 2);
      status('NAS 저장 확인 · ' + snapshot.id); return clone(receipt);
    } finally { if (button) button.disabled = false; }
  }
  function download(value) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = value.id + '.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  async function action(event) {
    var target = event.target.closest('button'); if (!target) return;
    try {
      if ((rewriteBusy || uploadBusy) && target.dataset.action !== 'cancel-rewrite') throw new Error('분석 또는 이미지 준비 완료 후 조작하세요.');
      if (syncProject()) { render(); status('현재 프로젝트로 전환했습니다. 장면을 입력하세요.'); return; }
      if (target.dataset.model) { if (target.dataset.model === 'h3' && keyframes.length > 9) throw new Error('H3로 전환하려면 첨부 이미지를 9장 이하로 줄여 주세요.'); model = target.dataset.model; record = null; render(); return; }
      if (target.dataset.removeKeyframe != null) { retainOutput(); keyframes.splice(Number(target.dataset.removeKeyframe), 1); keyframesDirty = true; render(); status('첨부를 제거했습니다. 다른 Picture 번호는 유지됩니다. 분석을 다시 실행하세요.'); return; }
      if (target.dataset.remove != null) { var removed = items.splice(Number(target.dataset.remove), 1)[0]; references.forEach(function (ref) { ref.usedBy = (ref.usedBy || []).filter(function (id) { return id !== removed.id; }); }); references = references.filter(function (ref) { return ref.usedBy.length; }); record = null; render(); return; }
      if (target.dataset.history) {
        var saved = history().find(function (entry) { return entry.id === target.dataset.history; });
        if (!saved) throw new Error('기록을 찾을 수 없습니다.');
        keyframes = []; keyframesDirty = false; attachmentNote = '기록에는 이미지 파일이 없습니다. 다시 이미지 분석하려면 같은 Picture 번호로 키프레임을 재첨부하세요.';
        record = clone(saved); model = record.model; items = clone(record.shots); references = clone(record.references || []); music = record.music || ''; style = record.style || ''; sourcePrompt = record.originalPrompt || ''; sourceName = record.sourceFileName || ''; render(); status('브라우저에 저장된 프롬프트를 열었습니다. 이미지 재분석에는 재첨부가 필요합니다.'); return;
      }
      switch (target.dataset.action) {
        case 'add': items.push(emptyShot()); record = null; render(); break;
        case 'planner': window.goStep('seedance'); break;
        case 'cinematique': window.goStep('cinematique'); break;
        case 'camera-library': window.goStep('cam'); break;
        case 'rewrite': await rewrite(); break;
        case 'cancel-rewrite': if (rewriteController) rewriteController.abort(); break;
        case 'import': importSelected(); break;
        case 'generate': await generate(); break;
        case 'retry': await init(); break;
        case 'copy': await navigator.clipboard.writeText(exportRecord().prompt); status('텍스트 복사 완료'); break;
        case 'json': await navigator.clipboard.writeText(JSON.stringify(exportRecord(), null, 2)); status('JSON 복사 완료'); break;
        case 'download': download(exportRecord()); status('JSON 다운로드 요청 완료'); break;
        case 'nas': await saveNas(); break;
      }
    } catch (error) { status(error.message || String(error), true); }
  }
  async function init() {
    retainOutput();
    syncProject(); render();
    var root = $('promptStudioApp'); if (!root) return;
    root.onclick = action;
    root.oninput = function (event) {
      if (syncProject()) { render(); status('프로젝트가 변경되었습니다. 장면을 다시 입력하세요.', true); return; }
      var el = event.target;
      if (rewriteBusy || uploadBusy) return;
      if (el.dataset.keyframe != null) { var frame = keyframes[Number(el.dataset.keyframe)]; if (frame && ['index', 'kind', 'shotNumber'].indexOf(el.dataset.field) >= 0) { frame[el.dataset.field] = el.dataset.field === 'kind' ? el.value : Number(el.value); keyframesDirty = true; status('키프레임 매핑 변경됨 · 분석·리라이팅을 다시 실행하세요.'); } return; }
      if (el.dataset.shot != null) { items[Number(el.dataset.shot)][el.dataset.field] = el.dataset.field === 'duration' ? Number(el.value) : el.value; updateCameras(); }
      if (el.dataset.ref != null) references[Number(el.dataset.ref)][el.dataset.field] = el.dataset.field === 'enabled' ? el.checked : el.value;
      if (el.id === 'psMusic') music = el.value;
      if (el.id === 'psStyle') style = el.value;
      if (el.id === 'psOriginal') { sourcePrompt = el.value; sourceName = ''; }
      if (record && el.id !== 'psOutput') status(el.id === 'psOriginal' ? '원문 변경됨 · 분석·리라이팅을 다시 실행하세요.' : '입력 변경됨 · 검토한 내용으로 다시 구성을 눌러 결과에 반영하세요.');
    };
    root.onchange = function (event) {
      if (event.target.id === 'psSourceFile') return loadSourceFile(event.target.files[0]).catch(function (error) { status('파일 읽기 실패 · ' + error.message, true); });
      if (event.target.id === 'psKeyframeFiles') return loadKeyframes(event.target.files).catch(function (error) { status('이미지 첨부 실패 · ' + error.message, true); });
    };
    try { await loadCatalog(); if (project === currentKey()) { retainOutput(); render(); status('카메라 카탈로그 준비됨 · ' + catalog.length + '개 기법'); } }
    catch (error) { status(error.message + ' 생성이 중지되었습니다. 다시 불러오기를 눌러 재시도하세요.', true); }
  }
  function retainOutput() {
    if (!record || record.projectKey !== currentKey() || !$('psOutput') || $('psOutput').value === record.prompt) return;
    record = Object.assign({}, record, { id: uuid(), prompt: $('psOutput').value, customized: true, structuredFieldsMatchPrompt: false, createdAt: new Date().toISOString() });
    if (record.prompt.trim()) remember(record);
  }
  function getDraft() { syncProject(); return clone(input()); }
  async function applyCamera(value) {
    if (rewriteBusy || uploadBusy) throw new Error('분석 또는 이미지 준비 중입니다. 완료 후 카메라를 적용하세요.');
    if (!value || !value.projectKey) throw new Error('카메라를 적용할 프로젝트를 지정하세요.');
    assertProject(value.projectKey);
    var entries = await loadCatalog(); assertProject(value.projectKey);
    syncProject();
    var shot = value.shotId ? items.find(function (item) { return item.id === value.shotId; }) : items[value.shotIndex == null ? 0 : value.shotIndex];
    if (!shot) throw new Error('카메라를 적용할 컷을 찾을 수 없습니다.');
    ['framing', 'movement'].forEach(function (kind) {
      if (value[kind] && value[kind] !== 'auto' && !entries.some(function (entry) { return entry.id === value[kind] && entry.kind === kind; })) throw new Error('유효하지 않은 카메라 기법: ' + value[kind]);
    });
    retainOutput();
    ['framing', 'movement'].forEach(function (kind) { if (value[kind]) shot[kind] = value[kind]; });
    render(); status(shot.id + ' 카메라 선택 반영 · 검토한 내용으로 다시 구성 버튼으로 결과를 갱신하세요.');
    return getDraft();
  }
  function refreshLegacyTarget() {
    var draft = getDraft(), select = $('cmPromptTarget'); if (!select) return;
    var selected = select.dataset.projectKey === draft.projectKey ? select.value : '';
    select.dataset.projectKey = draft.projectKey;
    select.innerHTML = draft.shots.map(function (shot) { return '<option value="' + esc(shot.id) + '"' + (selected === shot.id ? ' selected' : '') + '>' + esc(shot.id + ' · ' + (shot.description || '장면 미입력').slice(0, 35)) + '</option>'; }).join('');
  }
  async function applyLegacyCameraMove(id, options) {
    options = options || {};
    var move = typeof getCameraMove === 'function' ? getCameraMove(id) : null;
    if (!move) throw new Error('카메라 무빙을 찾을 수 없습니다: ' + id);
    var draft = getDraft(), select = $('cmPromptTarget');
    if (select && select.dataset.projectKey && select.dataset.projectKey !== draft.projectKey) { refreshLegacyTarget(); throw new Error('프로젝트가 변경되었습니다. 적용 컷을 확인하고 다시 누르세요.'); }
    var result = await applyCamera({ projectKey: options.projectKey || draft.projectKey, shotId: options.shotId || (select && select.value) || undefined, shotIndex: options.shotIndex, movement: 'legacy:' + move.id });
    if (typeof window.goStep === 'function') window.goStep('prompts');
    return result;
  }
  window.ZippyPromptStudio = { init: init, rewrite: rewrite, generate: generate, exportRecord: exportRecord, getDraft: getDraft, applyCamera: applyCamera, applyLegacyCameraMove: applyLegacyCameraMove, refreshLegacyTarget: refreshLegacyTarget, history: function () { return clone(history()); } };
})();
