# 프롬프트 생성 탭 — 다른 Codex 인계

## 2026-09-16 검증 및 원문 표시 방식

최신 기준 커밋 `bc2694c` 위에 구현했다. 브라우저에서 H3와 Seedance 리라이팅을 실제 텍스트 모델로 시험했고, 대사·의상 보존과 카메라 무빙 `pan-left` 적용 후 재구성 및 JSON 복사를 확인했다. 프롬프트 분석은 의미 보존을 자동 보증하지 않으므로 결과의 `reviewStatus`는 검토 필요 상태다.

Cinematique에서 150개 목록을 실제 수집했고 카메라 관련 41개를 연결했다. 기존 카메라 무빙 57개도 별도로 재사용한다. 직접 외부 iframe은 검증 브라우저에서 빈 화면으로 남아, 수집 성공 시 **스크립트 없는 읽기용 원문 화면**을 sandbox iframe에 표시한다. 원본 사이트 자체의 검색·동영상은 원본 새 창 링크를 사용한다. 아래의 iframe 설명은 이 읽기용 표시 보완을 포함한다. 원본 HTML·스크립트를 파이프라인 DOM에서 실행하지 않는다.

GTI 자동 실행 설정은 기존 설치된 `/Users/hyunwooheo/studioZIPPY/gti-bridge/server.mjs`를 사용하도록 전환했다. 실제 `/health`는 이미지 `gpt-image-2.5-flare`, 컨트롤러 `gpt-6-astra`, 공급자 `private-codex`를 반환했다. 이미지 생성 과금 호출 자체는 시험하지 않았다. NAS 저장은 코드·응답 처리만 검증했고 실제 저장 호출은 실행하지 않았다.

## 기본 작업: 기존 프롬프트 분석·리라이팅

주 입력은 **원본 프롬프트**다. 기존 프롬프트를 붙여넣거나 UTF-8 `.txt`, `.md`, `.json` 파일을 가져오고 MiniMax H3 / Seedance 2.5를 선택한 뒤 **분석·리라이팅**을 누른다. 원문과 리라이팅 결과가 나란히 표시되며 변경 내용과 검토 항목도 표시한다. 파일은 최대 200KB, 추출 원문은 50,000자 이내다. JSON은 문자열 자체 또는 `prompt`, `originalPrompt` 문자열 순서로 읽는다. 다른 구조는 JSON 텍스트 그대로 분석한다. 파일 코드·스크립트는 실행하지 않는다.

원문 분석은 기존 파이프라인 `callLLM({images, prompt, signal})`을 사용한다. 첨부한 키프레임이 있으면 실제 이미지 데이터도 함께 전달한다. 상단 텍스트 모델 선택(Local / GPT / Gemini)에 따른 실제 호출이 발생한다. Local 사용 시 이미지 입력을 지원하는 비전 모델이 필요하다. 이미지·영상 생성은 실행하지 않는다. 연결이 없거나 분석 JSON·대사 보존 검증이 실패하면 새 출력 없이 오류를 표시한다. API 호출 전 원문과 첨부는 브라우저 안에만 있으며 **분석·리라이팅** 실행 시 선택된 텍스트 모델로 전달된다.

### 키프레임을 보고 리라이팅하기

원문 아래 이미지 첨부에서 PNG/JPEG/WebP를 고르고 Picture 번호, 적용 컷 번호(원문 순서 1부터), 역할을 지정한다. 시작 프레임은 해당 컷의 초기 자세·공간·프레이밍, 종료 프레임은 최종 상태, 외형/공간 참조는 인물·의상·배경 정보에만 적용한다. 원문과 키프레임이 충돌하면 모델이 검토 항목으로 보고해야 하며, 새로운 행동이나 대사를 임의로 추가하면 안 된다. 실제 내용 인식의 정확성은 관찰 결과와 원문을 비교해 검토한다.

Picture 번호는 파일 순서와 다를 수 있다. 모델 입력에는 첨부 순서와 Picture 번호 매핑을 따로 전달하며, 이미지를 제거해도 나머지 번호를 당겨 바꾸지 않는다. 한 컷에 시작 프레임과 종료 프레임은 각각 하나만 지정한다. 분석용 사본은 최대 2048px로 축소하므로 작은 글씨·극세부는 인식되지 않을 수 있다. 원본 파일은 변경하지 않는다.

이미지 데이터는 메모리에만 보유한다. JSON·브라우저 기록·NAS 스냅샷에는 `keyframes` 메타데이터, `keyframeObservations`, `imageAnalysis`만 저장하고 base64는 포함하지 않는다. 새로고침·프로젝트 전환·기록 불러오기 후 다시 분석하려면 파일을 다시 첨부한다. 다른 Codex에 JSON을 전달해도 이미지 파일 자체가 전달되는 것은 아니다. 이 대화에 첨부한 이미지가 파이프라인에 자동 연결되는 기능도 아니다.

고급 API에서는 `rewrite()`에 `keyframes:[{index:1,kind:'start',shotNumber:1,label:'start.png',mime:'image/png',b64:'...',width:1280,height:720}]`을 추가한다. 이 데이터는 직접 승인한 이미지로만 준비한다. `imageAnalysis.submittedCount`는 이미지가 요청에 전달됐음을 뜻하며 인식 정확도나 동영상 생성 성공을 보증하지 않는다.

```js
goStep('prompts');
await ZippyPromptStudio.init();
const rewritten = await ZippyPromptStudio.rewrite({
  originalPrompt: '[Shot 1] 민수가 복도에서 멈춘다. 8초. 대사: "문을 열지 마." 남색 코트 유지.',
  model: 'h3',
  projectKey: ZippyPromptStudio.getDraft().projectKey
});
const handoff = ZippyPromptStudio.exportRecord();
```

리라이팅 레코드는 `originalPrompt`, `changes`, `reviewIssues`, `constraints`, 각 컷의 `sourceText`와 검토 상태를 함께 저장한다. 대사·참조 번호·쇼트 수 등은 엔진의 검증을 거치며, 의미 전체의 보존은 원문/결과 비교 검토가 필요하다. 원문에서 명시한 음악도 유지한다. `rewrite()`에 `music`을 명시하는 경우에만 API 호출자가 이를 덮어쓴다. UI는 기존 상세 편집칸의 음악을 새 원문에 자동 덮어쓰지 않는다.

원문에 음악 지시가 없으면 BGM은 자동 OFF이며 현장음·행동 소리·대사는 유지된다. 상세 검토의 배경음악 칸도 비우고 **검토한 내용으로 다시 구성**을 누르면 BGM OFF가 명시된다.

**분석된 컷·카메라 상세 검토**를 열면 추출된 장면을 수정하거나 Cinematique/기존 카메라 무빙을 적용할 수 있다. **검토한 내용으로 다시 구성**은 추가 모델 호출 없이 형식을 다시 구성하며 원문·보존 조건·기존 참조 번호도 유지한다. 원문 자체를 바꾸면 분석·리라이팅을 다시 실행해야 한다. 아래 `generate()`는 이 상세 재구성과 고급 직접 입력을 위한 API다.

상단 **프롬프트 생성**에서 MiniMax H3 / Seedance 2.5를 선택한다. 기존 Seedance 플래너는 별도 탭으로 유지된다. **Seedance 선택 컷 가져오기**는 현재 프로젝트에서 선택한 컷만 가져오며, 해당 컷에 쓰이는 참조의 역할·라벨·업로드 순서만 포함한다. 이미지, base64, 인증 토큰은 인계 JSON에 넣지 않는다. 참조 파일 자체의 준비·업로드는 후속 작업이다.

장면의 핵심 행동·시작/종료 상태·대사·화자·현장음·길이를 입력한다. 각 컷의 프레이밍과 움직임은 자동 추천되며 드롭다운에서 직접 고정할 수 있다. 기본 표현은 Documentary / V-log다. Cinematique 카탈로그가 로드되지 않으면 생성이 중지되고 오류와 재시도 버튼이 표시된다.

## 브라우저에서 읽고 생성하기

같은 파이프라인 페이지의 브라우저 실행 문맥에서 사용한다. 아래 `generate()` 함수는 비동기이며 네트워크 모델을 호출하지 않는다. `rewrite()`는 앞서 설명한 텍스트 모델을 호출한다. 다른 프로젝트 키를 전달하면 오류가 발생한다. 프로젝트 키는 기존 `ZippySeedancePlanner.state().projectKey`로 확인할 수 있다.

```js
goStep('prompts');
await ZippyPromptStudio.init();
const projectKey = ZippySeedancePlanner.state().projectKey;
const result = await ZippyPromptStudio.generate({
  model: 'h3', // 또는 'seedance'
  projectKey,
  shots: [{
    id: 'S01', description: '인물이 문을 열고 방 안을 확인한다.',
    initialState: '닫힌 문 앞에서 손잡이를 잡는다.',
    endState: '문이 열린 뒤 방 안을 바라보며 멈춘다.',
    dialogue: '', speaker: '', soundscape: '문 경첩과 발소리',
    duration: 6, framing: 'auto', movement: 'auto'
  }],
  references: [], music: '',
  style: 'Documentary / V-log. Natural light, restrained contrast.'
});
const handoff = ZippyPromptStudio.exportRecord();
const recent = ZippyPromptStudio.history();
```

`generate()`는 생성 레코드 복사본을 Promise로 반환하고 현재 프로젝트 브라우저 기록에 저장한다. `exportRecord()`는 화면에서 편집한 프롬프트까지 포함한 복사본을 반환한다. 출력이 수정되면 새 ID와 `customized:true`, `structuredFieldsMatchPrompt:false`를 부여한다. 이때 H3 구조화 필드와 컷 설계는 생성 당시 값이며 수정된 본문을 역분석해 갱신하지 않는다. 입력을 변경한 경우 **프롬프트 생성**을 눌러야 결과에 반영된다. `history()`는 현재 프로젝트의 최근 30개 복사본을 반환한다.

결과는 `schemaVersion`, `id`, `projectKey`, `model`, `createdAt`, `prompt`, `shots`(카메라 선택 포함), `references`, `sources`를 가진다. H3에는 모델별 `fields`도 있다. 최상위 `music`, `style`은 엔진이 적용한 입력이다. `references`는 `type`, `index`, `role`, `exclude`(가져오지 않을 요소의 문자열)를 사용하며 가져온 참조에는 `label`, `usedBy`도 포함한다. 체크 해제한 참조는 재구성에서 빠진다. 리라이팅에서는 원문 번호를 유지하고, 원문 없는 수동 입력에서는 종류별로 1부터 번호 매긴다. 반드시 출력된 업로드 순서를 따른다. 화면의 참조 준비 상태는 가져올 때 기존 플래너가 참조를 보유했는지 여부이며 다른 Codex에 파일이 전달됐다는 뜻은 아니다. 파일 경로와 base64는 자동 인계하지 않는다.

## 저장과 전달

- 텍스트 복사: 프롬프트 본문만 복사한다.
- JSON 복사 / 다운로드: 카메라 선택과 참조 역할을 포함한 레코드를 전달한다.
- 브라우저 기록: 해당 브라우저의 localStorage에만 저장된다. 다른 기기나 Codex에 자동 공유되지 않는다. 저장 실패는 화면에 표시된다.
- NAS에 스냅샷 저장: 현재 결과에 새 고유 ID를 부여하고 기존 `zippyNasSaveJson('prompts', id, record, meta, {force:true})`를 한 번 호출한다. 매 저장은 새 ID이므로 이전 스냅샷을 덮어쓰지 않는다. 현재 프로젝트와 레코드 프로젝트가 다르면 저장하지 않는다. 성공은 실제 `{ok:true}` 응답을 받은 뒤 표시하며 반환 영수증을 화면에 보여준다. 실패는 오류로 표시한다. NAS 설정·연결은 기존 파이프라인 설정을 따른다.

NAS 저장 버튼을 누르기 전까지 결과는 로컬이다. 이 기능은 카메라 카탈로그와 모델별 규칙으로 프롬프트 텍스트를 구성한다. 실제 영상 생성·참조 업로드·대사 합성은 실행하지 않는다. 자동 추천은 키워드 기반이므로 사용자가 장면 의도와 연속성을 검토해야 한다.

검증 경로: 상단 탭 → 두 모델 각각 생성 → 수동 카메라 변경 → 다시 생성 → 텍스트 편집 → JSON 확인 → 프로젝트 전환 후 이전 레코드 반출 차단 확인. NAS 저장 검증은 실제 저장 권한과 연결이 있는 환경에서 별도로 수행한다.

## Cinematique 원본 탭과 자동 수집

상단 **Cinematique · 앵글**은 원본 사이트 iframe과 파이프라인 카메라 제어 화면을 함께 표시한다. 탭을 열면 공개 원본의 `h3` 기법 제목과 `Read Guide` 링크를 가져와 저장 카탈로그와 ID로 대조한다. 최초 진입 및 마지막 확인 5분 이후 재진입 시 자동 수집하고 **원본에서 다시 가져오기**로 즉시 갱신할 수 있다. 응답 제한은 12초다. 수집 실패는 **저장 카탈로그 사용 (실시간 아님)**으로 표시하며 기존 프롬프트 생성은 계속 동작한다.

원본 iframe은 페이지 표시용이며 다른 출처의 DOM을 읽지 않는다. 별도의 공개 HTTP 요청은 로그인 정보 없이 수행한다. 가져온 HTML과 스크립트는 파이프라인에 삽입하지 않고 제목·검증된 원본 링크만 읽는다. 원본에 추가된 미연결 기법은 **프롬프트 연결 전**으로 표시한다. 프롬프트 문장은 로컬의 검토된 카메라 지시문에서 구성한다. 따라서 라이브 사이트 변경이 지시문을 자동 덮어쓰지는 않는다.

프롬프트의 대상 컷을 선택하고 **현재 프롬프트 장면 가져오기 → 필요한 앵글 자동 찾기 → 선택 컷에 카메라 적용**을 누른다. 모델·장면·작성 중인 출력 본문은 유지되고 해당 컷의 카메라 선택만 바뀐다. 프롬프트 탭에서 다시 생성하면 카메라 지시문이 본문에 반영된다. 원본 사이트 내부 클릭은 프롬프트 설정을 직접 바꾸지 않는다.

```js
goStep('cinematique');
await ZippyCinematography.init();
const collected = await ZippyCinematography.refresh();
// collected.status.mode: live | fallback (실제 수집 여부 확인)
const recommendation = await ZippyCinematography.query('좁은 복도를 따라 인물 뒤에서 이동한다.');
const draft = ZippyPromptStudio.getDraft();
await ZippyCinematography.apply({
  projectKey: draft.projectKey, shotId: draft.shots[0].id,
  framing: recommendation.camera.framing.id,
  movement: recommendation.camera.movement.id
});
const result = await ZippyPromptStudio.generate(ZippyPromptStudio.getDraft());
```

`refresh()`는 원본 수집 후 `{source,status,liveEntries,catalog}`를 반환한다. `snapshot()`은 같은 구조의 마지막 상태를 즉시 읽는다. `query(string | shotObject)`는 `{camera,sourceStatus,instructionsSource,liveMatched}`를 반환한다. 원본 요청 없이도 저장 카탈로그로 추천 가능하다. `apply()`는 `ZippyPromptStudio.applyCamera()`를 통해 기존 컷의 프레이밍·움직임만 갱신하고 프롬프트 탭을 연다. 프로젝트가 바뀌었거나 컷 ID가 없으면 오류다. `getDraft()`는 현재 프로젝트의 입력 복사본을 반환한다. 이 API는 생성된 출력의 수동 편집본을 역분석하지 않는다.

## 기존 카메라 무빙 탭 연결

**카메라 무빙** 탭 상단에서 대상 프롬프트 컷을 선택한 뒤 선택 무빙 또는 개별 카드의 **프롬프트 생성기로** 버튼을 누른다. 기존 영상 탭·스토리보드 적용 기능도 그대로 유지한다.

기존 `CAMERA_MOVES`의 57개 정의를 프롬프트 생성기 메모리 카탈로그에 `legacy:<원본 ID>`로 연결한다. 예를 들어 `legacy:pan-left`는 기존 왼쪽 팬의 영문 지시문을 글자 그대로 사용하며 일반 팬으로 축약하지 않는다. 방향·속도·동작 지시를 유지하고 각 컷의 `camera.movement.sourceUrl`에 `https://aicameramovements.com/`를 기록한다. Cinematique의 원본 수집 목록 41개와는 다른 출처이며, 이 57개를 Cinematique에서 가져왔다고 표시하지 않는다. 로컬 JSON 파일을 변경하지 않고 기존 페이지 정의를 재사용한다.

```js
await ZippyPromptStudio.applyLegacyCameraMove('pan-left', {
  projectKey: ZippyPromptStudio.getDraft().projectKey,
  shotId: 'S01'
});
// 원본 기법 직접 적용도 가능. shotId 없이 shotIndex를 주면 해당 순서에 적용하며 기본은 0.
await ZippyPromptStudio.applyCamera({
  projectKey: ZippyPromptStudio.getDraft().projectKey,
  shotIndex: 0, movement: 'legacy:pan-right'
});
```

다른 Codex가 파이프라인 외부에서 로컬 엔진을 직접 호출할 때 `legacy:*`를 쓰려면 기존 `CAMERA_MOVES` 정의도 같은 형태의 카탈로그 엔트리로 제공해야 한다. 인계 JSON에는 사용한 카메라의 전체 지시문이 포함된다. 파이프라인 안의 `generate()`는 이미 병합된 카탈로그를 사용한다.
