# studioZIPPY AI Limitations & Solutions Reference v1.0

> **목적:** AI 생성 영상의 3대 한계(정직한 앵글 / AI스러운 색감 / 먹먹한 음성)를 프롬프트·파이프라인 차원에서 극복하기 위한 표준 레퍼런스
> **적용 기준서:** STUDIO_ZIPPY_AI_CINEMA_MANUAL_v2.0
> **작성:** studioZIPPY (허현우 감독)
> **버전:** v1.0 (2026.04)

---

## 0. 핵심 진단

| 한계 | 근본 원인 | 해결 레이어 |
|---|---|---|
| 정직한 앵글 | 학습 데이터 평균값 회귀 | 프롬프트 (90%) |
| AI스러운 색감/콘트라스트 | 디지털 클린 룩 + 과채도 + 클리핑 | 프롬프트 (70%) + 후반 LUT (30%) |
| 먹먹한 음성 | 룸톤·마이크 IR·프레즌스 대역 결손 | 후처리 파이프라인 (95%) |

---

## 1. 정직한 앵글 타파

### 1.1 원리
AI는 학습 데이터의 평균값으로 회귀한다. 평균을 깨려면 **카메라가 그 자리에 있어야 하는 이유**와 함께 **위치를 못 박아야** 한다. "low angle"이라고만 쓰면 평균적인 로우앵글이 나온다.

### 1.2 ZIPPY 7원칙 연계
- **0.3초 직전 순간 포착** → 사건 직전 모멘트가 정의되면 AI는 그것을 가장 잘 보여주는 앵글을 자동 선택
- **공간 우선 서술** → 카메라가 공간 어디에 박혀 있는지 먼저 명시

### 1.3 실전 키워드 세트

#### A. 비대칭 프레이밍
```
subject pushed to lower-left third, negative space dominates upper two-thirds, off-center composition
```

#### B. 렌즈 + 위치 결합
```
24mm wide lens at hip-height, slight dutch tilt 12 degrees, foreground object obstructing 30% of frame
```

#### C. OTS 변형
```
over-the-shoulder from behind a doorframe, rack focus pulled to background subject, foreground intentionally blurred
```

#### D. 참조 감독 명시
```
in the visual language of Emmanuel Lubezki / Roger Deakins / Bong Joon-ho's frame composition
```

#### E. 핸드헬드 명시
```
handheld camera with subtle organic sway, breathing motion, not stabilized
```

### 1.4 가장 강력한 한 방 (3종 세트)
> **참조 감독 + 구체적 카메라 위치 + 전경 오브젝트 삽입**
> 전경에 뭔가가 끼어들면 AI는 자동으로 비정상 앵글을 만든다.

### 1.5 적용 예시 (콘크리트 K-웨스턴 〈N시의 무법자〉 기준)

```
[KO]
ARRI ALEXA 35, ARRI Signature Prime 35mm, F4 조리개. 카메라는 독고탄의
부츠 옆 바닥 높이에 놓여 25도 위로 기울어져 있다. 전경에는 부서진 홀로그램
간판 파편이 프레임의 30%를 가리고, 그 너머로 독고탄이 천천히 고개를
돌린다. 핸드헬드의 미세한 호흡, 비정상적이지 않은 자연스러운 흔들림.
시점: Roger Deakins의 프레임 구성 언어, 사건 직전 0.3초.

[EN]
ARRI ALEXA 35, ARRI Signature Prime 35mm, F4. Camera placed at floor level
beside Dokgo Tan's boot, lens tilted up 25 degrees. Foreground: shattered
hologram sign fragments obstructing 30% of frame. Beyond it, Dokgo Tan
slowly turns his head. Handheld with subtle organic breathing motion,
naturalistic sway. In the visual language of Roger Deakins' frame composition.
The 0.3-second moment before the action.
```

---

## 2. AI스러운 콘트라스트·색감 해결

### 2.1 원리
AI 기본 출력의 4대 문제:
1. 과도한 콘트라스트
2. 부풀려진 채도
3. 디지털 클린 룩 (질감 결손)
4. 하이라이트 클리핑

프롬프트로 70~80%까지 잡을 수 있고, 나머지 20%는 후반 LUT 작업이 필수.

### 2.2 프롬프트 차원 해결

#### A. 필름 스톡 명시
```
shot on Kodak Vision3 500T film stock, scanned at 4K, natural film grain,
slight halation around highlights
```

#### B. DI(Digital Intermediate) 톤 지정
```
lifted blacks with milky shadows, rolled-off highlights, no crushed shadows,
desaturated muted palette, soft film contrast curve
```

#### C. 광원 온도 + 그린 틴트
```
3200K tungsten key light with subtle minus-green shift, neutral-warm overall
temperature, no teal-orange grading
```

#### D. 참조 영화 명시
```
color graded in the style of *Roma* (2018) / *In the Mood for Love* /
*The Revenant*'s natural light approach
```

#### E. 부정 키워드
```
no high contrast, no oversaturated colors, no digital clean look,
no HDR look, no Instagram filter aesthetic
```

### 2.3 studioZIPPY 고정 문장 (확장판)

기존 고정:
```
natural skin texture, subtle glow, visible pores, no synthetic shine,
soft diffused key light, 45-degree lighting angle, gentle shadow falloff,
bounce fill light, neutral-warm light temperature
```

**추가 권장 한 줄:**
```
subtle film grain, gentle halation on highlights, organic color bleed,
flat log-style base before grading
```

### 2.4 후반 LUT 워크플로우
```
[Generation] → Higgsfield Upscale → Filmconvert Nitrate (또는 Dehancer)
→ 색온도 미세조정 → Final
```

권장 LUT 베이스:
- **Filmconvert Nitrate** — Kodak 2383 / Fuji Eterna 250D 프로파일
- **Dehancer** — 필름 그레인 + 할레이션 + 게이트 위블 통합

### 2.5 콘크리트 K-웨스턴 색 규칙 연계
- 사이안 = 독고탄 전용 (프롬프트에 '전용' 단어 직접 기재 금지, 결과 기준만 지시)
- 오렌지 = HEXA 지구
- 그린·퍼플 = Grey Glitch · POLY
- 위 색 외에는 desaturated muted palette 기본

---

## 3. AI 음성의 먹먹함·어색함

### 3.1 원리
AI 음성이 먹먹한 이유 (4대 결손):
1. **룸톤 부재** — 공간감 없음
2. **마이크 임펄스 부재** — "녹음된" 느낌 없음
3. **다이내믹 레인지 압축** — 평면적
4. **1~3kHz 프레즌스 대역 결손** — 또렷함 부족

> **모델 하나로는 절대 해결 안 된다. 파이프라인이 답이다.**

### 3.2 모델 선택 (한국어 기준)

| 용도 | 추천 | 비고 |
|---|---|---|
| 한국어 자연스러움 | Supertone Shift, Typecast(네오사피엔스) | 한국어 음운 최적화 |
| 감정 톤 조절 | ElevenLabs Voice Design | 직접 보이스 설계 |
| 다국어/영어 | ElevenLabs v3 Turbo | 영어 우위 |

### 3.3 후처리 필수 5단 체인

```
[AI TTS Output]
    ↓
[1] iZotope RX 11 — Voice De-noise 역방향
    → 너무 깨끗한 노이즈 플로어에 살짝 노이즈 추가
    ↓
[2] Convolution Reverb (Altiverb / LiquidSonics Cinematic Rooms)
    → "small room" 또는 "dialogue booth" IR
    → 짧게 15~30ms
    ↓
[3] Mic Impulse Response
    → Neumann U87 또는 Sennheiser MKH 416 IR 적용
    → "마이크로 녹음한 것 같은" 질감 부여
    ↓
[4] EQ + Compression
    → 200Hz: -2dB cut (먹먹함 제거)
    → 2.5kHz: +3dB boost (프레즌스)
    → 8kHz↑: -1.5dB shelving (디지털 쉭쉭거림 제거)
    → Comp 4:1, Attack 5ms, Release 80ms, GR 3~5dB
    ↓
[5] Room Tone Layer
    → 같은 공간 분위기의 앰비언스를 -45dB로 깔기
    → Freesound.org 무료 라이브러리 활용 가능
    ↓
[Final Voice]
```

### 3.4 빠른 표준 체인 (DAW 프리셋화 권장)
**ElevenLabs/Supertone 출력 → RX 노이즈 추가 → Convolution Reverb → Mic IR → EQ/Comp → 룸톤 레이어**

이 체인을 한 번 셋업해두면 모든 보이스에 일괄 적용 가능. studioZIPPY 표준 보이스 체인으로 프리셋화 권장.

### 3.5 권장 DAW 환경
- **DAW:** Reaper / Pro Tools / Logic Pro
- **필수 플러그인:** iZotope RX 11, Altiverb 8 또는 LiquidSonics Cinematic Rooms, Mic IR Pack (Neumann/Sennheiser)
- **무료 대안:**
  - Convolution: Reaper ReaVerbate + 무료 IR 라이브러리
  - 노이즈: Cockos ReaFir
  - EQ/Comp: ReaEQ + ReaComp

---

## 4. 통합 체크리스트 (씬 단위 적용)

매 씬마다 아래 체크리스트로 검수:

### 영상 (앵글)
- [ ] 카메라 위치가 좌표·높이·기울기까지 명시되어 있는가?
- [ ] 전경 오브젝트가 프레임의 일부를 가리는가?
- [ ] 참조 감독/촬영감독 명시했는가?
- [ ] '0.3초 직전 순간'이 정의되어 있는가?
- [ ] 핸드헬드/도리/스테디캠 등 카메라 운용 방식 명시했는가?

### 영상 (색감)
- [ ] 필름 스톡 또는 DI 톤이 명시되어 있는가?
- [ ] 광원 온도(Kelvin) 명시했는가?
- [ ] 참조 영화의 그레이딩 언급했는가?
- [ ] 부정 키워드(no HDR, no oversaturated 등) 포함했는가?
- [ ] studioZIPPY 고정 문장(skin/lighting) 포함했는가?
- [ ] 후반 LUT 단계 계획되어 있는가?

### 음성
- [ ] 한국어 보이스는 Supertone/Typecast 우선 사용했는가?
- [ ] 5단 후처리 체인 통과시켰는가?
- [ ] 같은 공간 룸톤 레이어를 깔았는가?
- [ ] EQ 200Hz/2.5kHz/8kHz 포인트 처리했는가?
- [ ] Mic IR 적용했는가?

---

## 5. 파일 컨벤션

- **프롬프트 작성 표기:** studioZIPPY (소문자 studio, 대문자 ZIPPY, 띄어쓰기 없음)
- **카메라/렌즈:** ARRI ALEXA 35 / ARRI Signature Prime 고정
- **조리개:** F1.4 / F4 / F11 중 선택
- **기본 앵글:** 하이앵글
- **구조:** 5단(Subject → Style → Mood & Atmosphere → Lighting & Color → Detail & Composition)
- **병기:** 한국어 + 영문 분리 제공
- **마무리 문장:** "Ultra-realistic 8K with refined textile detail and tonal harmony."

---

## 6. 향후 확장 (TODO)

- [ ] 보이스 후처리 체인 Reaper 프로젝트 템플릿화 (.RPP)
- [ ] Filmconvert/Dehancer 프리셋 studioZIPPY 표준 LUT 등록
- [ ] 콘크리트 K-웨스턴 전용 카메라 포지션 라이브러리 (HEXA/POLY/GREY GLITCH별)
- [ ] Nano Banana Pipeline에 본 체크리스트 자동 검수 모듈 통합

---

**End of Document**
