# zippy-pipeline 배포 가이드 (Codex/에이전트용)

> 이 문서 하나만 보고 파이프라인을 수정·배포할 수 있게 작성함. 모든 경로는 절대경로.

## 0. 한 줄 요약
`~/.zippy-deploy/zippy-pipeline/index.html` 수정 → 검증 → `git commit` → **`git push origin main`** 하면 Cloudflare가 자동 빌드·배포(~1–3분). 라이브: **https://zippy-pipeline.studiozippy25.workers.dev/**

---

## 1. 인프라 사실관계
| 항목 | 값 |
|---|---|
| GitHub repo | `studiozippy25-commits/zippy-pipeline` (branch `main`) |
| 로컬 클론 | `/Users/hyunwooheo/.zippy-deploy/zippy-pipeline` |
| 배포 대상 파일 | `index.html` (단일 파일, ~1.4MB, 모든 데이터·CSS·JS 인라인) |
| 배포 방식 | Cloudflare Workers Static Assets + GitHub 연동 **자동배포** (push→main 트리거) |
| 라이브 URL | https://zippy-pipeline.studiozippy25.workers.dev/ |
| 인증 | `~/.git-credentials` (chmod 600)에 PAT 저장됨. **토큰 값을 출력/로그하지 말 것** |
| 커밋 푸터 | `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` |

- `wrangler`로 수동 배포하지 않는다. **push가 곧 배포**다. `wrangler`/Pages 배포 흔적은 홈페이지(`studiozippy-site`) 쪽일 수 있으므로 파이프라인 배포에 쓰지 않는다.
- 이 repo에는 `wrangler.toml`/`wrangler.jsonc`가 없다. 수동 Wrangler 배포를 시도하지 말고 GitHub 연동 자동배포만 사용한다.
- 강제 재배포가 필요해도 빈 커밋(`--allow-empty`)에 의존하지 않는다. Cloudflare GitHub 연동이 트리 변경 없는 커밋을 새 HTML 게시로 처리하지 않을 수 있으므로, `index.html`에 무해한 고유 marker/meta 같은 **실제 바이트 변경**을 넣고 push한다.
- 데이터 구조: `index.html` 안 `const PROJECTS = { ... }` 객체에 프로젝트별로 들어있음. N시 = `ncity` 프로젝트.

---

## 2. 절대 규칙 (어기면 사고남)

### 2-1. ncity를 정확히 타깃해라 (first-match 함정)
`PROJECTS`에는 여러 프로젝트가 있고, `proof-of-taste`(PoT)가 **ncity보다 앞**에 있다.
`t.index("defaultSpaceRefs: {")` 처럼 첫 매치를 잡으면 **PoT를 오염**시킨다 (사고 2회 발생함).
반드시 **ncity 고유 앵커로 오프셋**을 준 뒤 검색한다:

```python
off = t.index("hasCostumes: false,")          # ncity 블록 진입 앵커
ds  = t.index("defaultSpaceRefs: {", off)      # 이 off 이후부터 검색
```
- 더 확실히 하려면 `t.index("SP-HANGAR")` 같은 **ncity에만 있는 문자열** 근처로 좁힌다.

### 2-2. 편집 전 백업
```bash
cd ~/.zippy-deploy/zippy-pipeline
cp index.html "index.html.bak_$(date +%Y%m%d_%H%M%S)"
```

### 2-3. 편집은 Python 파일 스크립트로 (heredoc 금지)
bash heredoc(`<<PY`)은 백슬래시를 먹어서 `\n`, 정규식이 깨진다.
→ 편집 로직은 `.py` 파일로 저장 후 `python3 파일.py` 실행. (작업 스크립트 모음: `~/studioZIPPY/N시_무법자_통합이미지/_레퍼런스화/`)

### 2-4. 문자열 치환은 유일성 검증 후
```python
assert t.count(anchor) == 1, f"anchor {t.count(anchor)}개 — 유일하지 않음"
t = t.replace(anchor, new)
assert t != orig
```

---

## 3. 표준 작업 순서

### STEP 1 — 편집 (예시 스크립트)
```python
#!/usr/bin/env python3
F = "/Users/hyunwooheo/.zippy-deploy/zippy-pipeline/index.html"
t = open(F, encoding="utf-8").read(); orig = t

off = t.index("hasCostumes: false,")           # ncity 타깃
anchor = '...유일한 원본 문자열...'
assert t.count(anchor) == 1
t = t.replace(anchor, '...바뀔 문자열...')

assert t != orig
open(F, "w", encoding="utf-8").write(t)
print("done, 길이변화:", len(t) - len(orig))
```

### STEP 2 — 검증 (필수, 깨진 JS 배포 방지)
가장 큰 `<script>` 블록을 `new Function`으로 파싱. `PROJECTS` 객체도 이 안에 있으므로 같이 검증됨.
```bash
cd ~/.zippy-deploy/zippy-pipeline
node -e 'const fs=require("fs");const s=fs.readFileSync("index.html","utf8");const re=/<script>([\s\S]*?)<\/script>/g;let m,b="";while((m=re.exec(s))){if(m[1].length>b.length)b=m[1];}try{new Function(b);console.log("OK");}catch(e){console.log("SYNTAX ERROR:",e.message)}'
```
→ `OK` 안 나오면 **커밋하지 말고** 백업으로 되돌린다.

### STEP 3 — 커밋 & 푸시 (foreground)
```bash
cd ~/.zippy-deploy/zippy-pipeline
git add -A
git commit -q -m "ncity: <변경 요약>

<본문>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```
- **push는 반드시 foreground.** (백그라운드 push가 origin에 안 닿은 사고 있었음)
- 강제 재배포 목적이면 빈 커밋 금지. `index.html`에 실제 바이트 변화가 있어야 한다.
- 기본 브랜치가 `main`이고 여기에 직접 push해 배포한다.

### STEP 4 — 라이브 검증 (자동배포 폴링)
push 후 ~1–3분. 방금 넣은 고유 문자열이 라이브에 뜰 때까지 폴링:
```bash
U="https://zippy-pipeline.studiozippy25.workers.dev"
for i in 1 2 3 4 5; do
  if curl -s "$U/" | grep -q "방금_넣은_고유문자열"; then echo "LIVE OK"; break; fi
  echo "대기 $((i*20))s..."; sleep 20
done
```
- 이미지/에셋은 개별 URL도 확인: `curl -s -o /dev/null -w "%{http_code}" "$U/assets/ncity/space/파일.jpg?v=1"` → `200` 이어야 함.

---

## 4. 에셋(이미지) 추가·교체

### 경로
`~/.zippy-deploy/zippy-pipeline/assets/ncity/` 아래:
`char/`(캐릭터시트) · `face/`,`face/6view/`(얼굴락 6전도) · `obj/`(무기·비히클·소품) · `space/`(공간 establishing) · `space-sheet/`(거점 멀티뷰 시트)

### 규칙
1. 이미지 파일을 해당 폴더에 넣는다(한글 파일명 OK).
2. `index.html`의 매핑 객체(`defaultCharRefs`/`defaultFaceRefs`/`defaultObjRefs`/`defaultSpaceRefs`/`defaultSpaceSheets`)에 `"정확한 키": "assets/ncity/.../파일.jpg?v=N"` 추가.
3. **이미지 파일도 반드시 `git add`** 한다. (매핑만 커밋하고 파일을 빼먹으면 라이브 404 — 실제 사고 있었음)
4. **캐시버스트**: 같은 파일명을 교체하면 URL의 `?v=N` 숫자를 올려야 브라우저·CDN이 갱신한다. 새 파일명이면 `?v=1`.

### 주의: `?v=` 쿼리 인코딩
파일명에 한글이 있으면 URL 인코딩할 때 **경로와 `?v=` 쿼리를 분리**해서 인코딩해야 한다(쿼리까지 %인코딩하면 404). 파이프라인의 `fetchImageAsB64`는 이미 패치돼 있으니, curl로 수동 확인할 때만 주의.

---

## 5. 자주 나는 실수 체크리스트
- [ ] ncity 아닌 PoT를 건드리지 않았나? (`hasCostumes: false,` 오프셋 썼나)
- [ ] `node` 구문검증 `OK` 떴나?
- [ ] 이미지 추가 시 **파일 자체를 `git add`** 했나?
- [ ] 같은 파일명 교체면 `?v=N` 올렸나?
- [ ] push를 foreground로 했나? `git log origin/main --oneline -1`로 반영 확인.
- [ ] 강제 재배포라면 빈 커밋이 아니라 `index.html` 실제 delta를 넣었나?
- [ ] 라이브 curl 폴링으로 실제 반영 확인했나?

---

## 6. (옵션) 이미지 생성 — gti (ChatGPT/Codex 구독)
- 라이브러리: `god-tibo-imagen` (`~/studioZIPPY/gti-bridge/`), 인증 `~/.codex/auth.json`.
- 배치 예시: `~/studioZIPPY/gti-bridge/gen6_batch.mjs`, `gen6_batch_masked.mjs`, `gen6_add.mjs`.
- 실행: `cd ~/studioZIPPY/gti-bridge && node <스크립트>.mjs` (장당 ~30–130초).
- 웹앱에서 직접 생성하려면 브리지: `npm start`(localhost:8799) + 바탕화면 런처 `gti-브리지-켜기.command`.

---

## 7. 롤백
```bash
cd ~/.zippy-deploy/zippy-pipeline
git checkout index.html              # 커밋 전 되돌리기
# 또는 백업 사용
cp index.html.bak_YYYYMMDD_HHMMSS index.html
# 이미 push 했다면
git revert <bad-commit-sha> && git push origin main
```
