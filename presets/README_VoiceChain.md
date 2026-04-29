# studioZIPPY Voice Chain v1.0 — Reaper 프로젝트 템플릿

## 사용법
1. `studioZIPPY_Voice_Chain_v1.RPP` 파일을 Reaper에서 엽니다
2. AI TTS 출력 파일(.wav/.mp3)을 **VOICE 트랙**에 드래그
3. FX 체인을 순서대로 활성화 (5단계)
4. 같은 공간 룸톤 앰비언스를 **ROOM TONE LAYER 트랙**에 추가
5. 마스터에서 라우드니스 -23 LUFS 정렬

## 5단 FX 체인 (VOICE 트랙)

### STEP 1 — ReaFir (노이즈 플로어 추가)
- Mode: **Subtract**
- 핑크 노이즈를 -50dB로 추가 (너무 깨끗한 디지털 보이스에 살짝 입자감)
- **무료 (Reaper 내장)**

### STEP 2 — Convolution Reverb (공간감)
- Plugin: ReaVerbate (무료) / Altiverb / LiquidSonics Cinematic Rooms
- IR: "Small Room Dialogue Booth" (15-30ms)
- Wet: -25 ~ -20dB

### STEP 3 — Mic Impulse Response (마이크 질감)
- Plugin: NadIR (무료) / MercuriallCab / Pulse
- IR: Neumann U87 또는 Sennheiser MKH 416
- "녹음된" 느낌 부여

### STEP 4 — EQ + Compression
**ReaEQ:**
- Band 1: 200 Hz, **-2 dB** (먹먹함 제거)
- Band 2: 2,500 Hz, **+3 dB** Q=1.0 (프레즌스)
- Band 3: 8,000 Hz, **-1.5 dB** shelving (디지털 쉭쉭거림)

**ReaComp:**
- Threshold: -18 dB
- Ratio: **4:1**
- Attack: **5 ms**
- Release: **80 ms**
- GR: 3-5 dB

### STEP 5 — Room Tone Layer (별도 트랙)
- Send to ROOM TONE LAYER 트랙
- 같은 공간 앰비언스 → **-45 dB**로 깔기
- Source: Freesound.org 무료 라이브러리

---

## 권장 라이브러리

### 한국어 TTS 모델
- **Supertone Shift** ⭐ (한국어 자연도 최상)
- **Typecast (네오사피엔스)** — 감정 톤 조절
- ElevenLabs v3 Turbo — 다국어/영어용

### 룸톤 앰비언스
- Freesound.org → "korean restaurant ambience"
- BBC Sound Effects (무료)
- Boom Library (유료)

### IR 라이브러리
- **Convolution Reverb IR**: Voxengo Free IR Pack
- **Mic IR**: Lancaster Audio Free Mic IRs

---

## 라우드니스 가이드

| 매체 | 권장 LUFS | True Peak |
|---|---|---|
| 영화 / 드라마 | -23 LUFS | -1 dBTP |
| YouTube | -14 LUFS | -1 dBTP |
| 팟캐스트 | -16 LUFS | -1 dBTP |

**studioZIPPY 표준:** -23 LUFS, True Peak -1 dBTP

---

## 체크리스트 (씬당)
- [ ] AI TTS 출력 입력
- [ ] STEP 1-5 FX 체인 통과
- [ ] ROOM TONE LAYER 깔림 (-45 dB)
- [ ] 마스터 라우드니스 -23 LUFS
- [ ] 200Hz/2.5kHz/8kHz EQ 포인트 확인
- [ ] Mic IR 적용됨

---

**End of Document**
