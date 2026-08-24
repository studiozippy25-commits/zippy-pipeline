(function(root, factory) {
  const client = factory();
  root.ZippyLocal5080Client = client;
  if (typeof module === 'object' && module.exports) module.exports = client;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const constants = Object.freeze({
    defaultGateway:'https://zippy-5080.studiozippy.co.kr',
    defaultGrokBridge:'http://127.0.0.1:8790',
    proxyPath:'/proxy/local5080',
    comfyPath:'/comfy'
  });

  function isLegacyComfyDirectUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    try {
      const url = new URL(raw);
      const host = String(url.hostname || '').replace(/^\[|\]$/g, '');
      return ['127.0.0.1','localhost','::1'].includes(host) && url.port === '8000';
    } catch(error) {
      return /^(https?:\/\/)?(127\.0\.0\.1|localhost):8000(?:\/|$)/i.test(raw);
    }
  }

  function normalizeGateway(value) {
    const raw = String(value || '').trim();
    if (!raw || isLegacyComfyDirectUrl(raw)) return constants.defaultGateway;
    const normalized = raw.replace(/\/+$/, '').replace(/\/comfy$/i, '');
    return normalized || constants.defaultGateway;
  }

  function isZippyGateway(value) {
    try { return new URL(normalizeGateway(value)).hostname === 'zippy-5080.studiozippy.co.kr'; }
    catch(error) { return false; }
  }

  function shouldProxy(value, pageHostname) {
    try {
      const localPage = ['127.0.0.1','localhost','::1'].includes(String(pageHostname || '').replace(/^\[|\]$/g, ''));
      return localPage && new URL(normalizeGateway(value)).hostname === 'zippy-5080.studiozippy.co.kr';
    } catch(error) { return false; }
  }

  function getGatewayBase(value, options) {
    const opts = options || {};
    const normalized = normalizeGateway(value);
    if (shouldProxy(normalized, opts.pageHostname)) return String(opts.grokBridgeBase || constants.defaultGrokBridge).replace(/\/+$/, '') + constants.proxyPath;
    return normalized;
  }

  function getComfyBase(value, options) {
    const opts = options || {};
    const normalized = normalizeGateway(value);
    if (shouldProxy(normalized, opts.pageHostname)) return String(opts.grokBridgeBase || constants.defaultGrokBridge).replace(/\/+$/, '') + constants.proxyPath + constants.comfyPath;
    if (isZippyGateway(normalized)) return normalized + constants.comfyPath;
    return normalized;
  }

  function buildHeaders(options) {
    const opts = options || {};
    const headers = opts.json === false ? {} : {'Content-Type':'application/json'};
    const gatewayKey = String(opts.gatewayKey || '').trim();
    const grokKey = String(opts.grokKey || '').trim();
    if (gatewayKey) {
      headers.Authorization = 'Bearer ' + gatewayKey;
      headers['X-Zippy-Gateway-Key'] = gatewayKey;
    }
    if (opts.proxied && grokKey) headers['X-Zippy-Grok-Key'] = grokKey;
    return headers;
  }

  function makeAbortError() {
    try { return new DOMException('Video generation aborted', 'AbortError'); }
    catch(error) { const fallback = new Error('Video generation aborted'); fallback.name = 'AbortError'; return fallback; }
  }

  function throwIfAborted(signal) { if (signal && signal.aborted) throw makeAbortError(); }

  function wait(ms, signal) {
    return new Promise(function(resolve, reject) {
      if (signal && signal.aborted) return reject(makeAbortError());
      const timer = setTimeout(resolve, ms);
      if (signal) signal.addEventListener('abort', function() { clearTimeout(timer); reject(makeAbortError()); }, {once:true});
    });
  }

  function isAbortError(error) {
    return !!(error && (error.name === 'AbortError' || /aborted|abort|중단/i.test(error.message || String(error))));
  }

  async function checkHealth(options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || fetch;
    throwIfAborted(opts.signal);
    const response = await fetchImpl(String(opts.base || '').replace(/\/+$/, '') + '/health', {headers:opts.headers || {}, signal:opts.signal});
    const data = await response.json().catch(function() { return {}; });
    throwIfAborted(opts.signal);
    if (!response.ok) throw new Error(data.comfy_error || data.error || data.hint || ('HTTP ' + response.status));
    if (data.comfy_ok !== true) {
      if (data.comfy_ok == null) throw new Error('Local 5080 Gateway 응답에 comfy_ok가 없습니다. 브릿지 버전을 확인하세요.');
      throw new Error(data.comfy_error || data.error || data.hint || 'ComfyUI 연결 실패');
    }
    return data;
  }

  async function requestVideo(options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || fetch;
    const base = String(opts.base || '').replace(/\/+$/, '');
    const headers = opts.headers || {};
    const signal = opts.signal;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const pollInterval = Number.isFinite(opts.pollInterval) ? Math.max(0, opts.pollInterval) : 5000;
    const maxPolls = Number.isFinite(opts.maxPolls) ? Math.max(1, opts.maxPolls) : 120;

    if (onProgress) onProgress('ComfyUI 연결 확인 중...');
    await checkHealth({base, headers, signal, fetchImpl});
    if (onProgress) onProgress('Local 5080 Gateway 전송 중...');

    const response = await fetchImpl(base + '/v1/videos/generations', {
      method:'POST', headers, body:JSON.stringify(opts.payload || {}), signal
    });
    throwIfAborted(signal);
    if (!response.ok) {
      const errorData = await response.json().catch(function() { return {}; });
      throw new Error([errorData.stage, errorData.error || errorData.message || ('HTTP ' + response.status), errorData.hint].filter(Boolean).join(' · '));
    }
    const created = await response.json();
    const immediateUrl = created.video_url || (created.video && created.video.url);
    if (immediateUrl) return immediateUrl;
    const requestId = created.request_id || created.id;
    if (!requestId) throw new Error('Gateway 응답에 video_url 또는 request_id가 없습니다.');

    for (let index = 0; index < maxPolls; index++) {
      await wait(pollInterval, signal);
      if (onProgress) onProgress('영상 렌더링 중... (' + ((index + 1) * pollInterval / 1000) + '초 경과)');
      const pollResponse = await fetchImpl(base + '/v1/videos/' + encodeURIComponent(requestId), {headers, signal});
      if (!pollResponse.ok) continue;
      const result = await pollResponse.json();
      const status = result.status || result.state;
      if (['done','succeeded','success'].includes(status)) return result.video_url || (result.video && result.video.url);
      if (['failed','error'].includes(status)) throw new Error(result.error || result.message || '로컬 영상 생성 실패');
    }
    throw new Error('로컬 영상 렌더링 시간 초과');
  }

  function formatError(error) {
    if (isAbortError(error)) return '중단됨';
    const message = error && error.message ? error.message : String(error || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'Gateway에 연결할 수 없습니다. URL, 터널, CORS, Gateway Key를 확인하세요.';
    return message;
  }

  return Object.freeze({
    version:'1.0.0', constants, isLegacyComfyDirectUrl, normalizeGateway, isZippyGateway,
    shouldProxy, getGatewayBase, getComfyBase, buildHeaders, checkHealth, requestVideo,
    makeAbortError, throwIfAborted, wait, isAbortError, formatError
  });
});
