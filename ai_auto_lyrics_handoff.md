# AI Auto Lyrics Handoff

이 문서는 `d:\music` 메인 프로젝트와 별도 wrapper 프로젝트를 오가며 진행한 `AI 자동 생성` 복구 작업의 현재 상태를 다음 세션에서 바로 이어받을 수 있도록 정리한 인수인계 문서다.

## 1. 현재 결론

- 로컬 메인 앱에서 `AI 자동 생성` 버튼은 다시 활성화했다.
- 메인 앱의 auto 요청은 더 이상 direct Suno API가 아니라 wrapper `/api/custom_generate` 를 타도록 바꿨다.
- 테스트 wrapper `dev-suno.songsai.org` 에서 자동 가사 생성이 실제로 성공했다.
- 아직 운영 wrapper `suno.songsai.org` 와 운영 메인 앱에는 이 auto 경로를 반영하지 않았다.

즉, **운영 영향 없이 테스트 환경에서 auto 흐름 검증까지 끝난 상태**다.

## 2. 전체 구조

### 메인 프로젝트
- 경로: `d:\music`
- 로컬 개발 URL: `http://localhost:3000`
- 운영 URL: `https://songsai.org`

### 운영 wrapper
- 공개 주소: `https://suno.songsai.org`
- 서버 포트: `3101`
- 역할: 실제 운영 생성 요청 처리

### 테스트 wrapper
- 공개 주소: `https://dev-suno.songsai.org`
- 서버 포트: `3201`
- 역할: auto 관련 패치 검증 전용

## 3. 왜 wrapper 프로젝트를 따로 봐야 했는가

문제의 본질은 메인 UI가 아니라 wrapper였다.

초기 상태에서는:
- `manual` 생성은 wrapper `/api/custom_generate` 를 타므로 정상 동작
- `auto` 생성은 direct Suno API 호출 경로를 타므로 `Unauthorized`

따라서 진짜 목표는:
- 메인 앱의 auto 요청도 wrapper로 보내고
- wrapper가 `gpt_description_prompt` 기반 자동 가사 생성 payload를 처리하게 만드는 것

## 4. 메인 프로젝트에서 이미 반영한 변경

### 4-1. 로컬 env 전환
현재 로컬 `.env` 는 테스트 wrapper를 보도록 맞춰둔 상태다.

```env
APP_URL="http://localhost:3000"
MUSIC_PROVIDER_MODE="suno"
SUNO_API_BASE_URL="http://dev-suno.songsai.org"
```

참고:
- 테스트 초기에는 `https://dev-suno.songsai.org` 를 시도했지만 HTTPS 라우팅이 정리되기 전이라 메인 앱 404 HTML이 돌아온 적이 있었다.
- 현재 테스트는 `http://dev-suno.songsai.org` 기준으로 진행했다.

### 4-2. UI 차단 해제
파일:
- `d:\music\components\auth-panel.tsx`

반영 내용:
- `AI 자동 생성` 버튼 활성화
- `준비중` 문구 제거
- auto 선택 시 막던 메시지 제거

### 4-3. API 차단 해제
파일:
- `d:\music\app\api\music\route.ts`

반영 내용:
- `lyricMode === "auto"` 를 400으로 차단하던 로직 제거

### 4-4. provider 경로 정리
파일:
- `d:\music\server\music\provider.ts`

반영 내용:
- auto/manual 모두 wrapper `/api/custom_generate` 호출
- direct Suno `generate/v2` 호출 상수 제거
- auto payload에 `gpt_description_prompt`, `mv`, `metadata` 포함

핵심 방향:

```ts
const endpoint = `${env.SUNO_API_BASE_URL}/api/custom_generate`;
```

즉 현재 메인 앱에서는 auto/manual 모두 wrapper만 바라본다.

## 5. wrapper 프로젝트에서 확인한 핵심 payload

실제 DevTools 기준으로 auto 생성에 중요한 값은 다음 네 가지다.

- `gpt_description_prompt`
- `tags`
- `mv`
- `make_instrumental`

예시:

```json
{
  "generation_type": "TEXT",
  "gpt_description_prompt": "고향을 그리는 마음을 표현해서 가사를 만들어줘",
  "make_instrumental": false,
  "mv": "chirp-crow",
  "tags": "신비롭고 애절한 분위기 발라드"
}
```

보조 필드:
- `title`
- `negative_tags`
- `metadata.create_mode`
- `metadata.web_client_pathname`
- `metadata.vocal_gender`

## 6. wrapper 쪽 패치 방향

wrapper 프로젝트 기준 주요 수정 파일은 아래 두 개였다.

- `src/app/api/custom_generate/route.ts`
- `src/lib/SunoApi.ts`

### 6-1. custom_generate route
body 에서 아래 값을 받을 수 있게 확장했다.

- `mv`
- `gpt_description_prompt`
- `metadata`

그리고 `custom_generate(...)` 호출 시 이 값들을 그대로 넘기도록 맞췄다.

### 6-2. SunoApi.ts
다음 방향으로 수정했다.

- `GenerationMetadata` 타입 추가
- `custom_generate()` 시그니처 확장
- `generateSongs()` 시그니처 확장
- custom payload 내부에 `gpt_description_prompt` 와 `metadata` 포함
- `resolvedModel = metadata?.mv || model || DEFAULT_MODEL`
- payload `mv` 도 `resolvedModel` 기준으로 통일

## 7. auto 테스트 중 만난 실제 문제와 해결

### 7-1. direct call 문제
증상:
- `Unauthorized`

원인:
- 메인 앱 auto 요청이 wrapper를 우회해 direct Suno API 호출

해결:
- `provider.ts` 에서 auto도 wrapper `/api/custom_generate` 로 통일

### 7-2. HTTPS 라우팅 문제
증상:
- `https://dev-suno.songsai.org` 호출 시 메인 앱 404 HTML 반환

원인:
- dev-suno HTTPS 라우팅이 정리되기 전 메인 도메인 443 블록으로 빠짐

임시 해결:
- 로컬 `.env` 의 `SUNO_API_BASE_URL` 을 `http://dev-suno.songsai.org` 로 사용

### 7-3. Playwright 쿠키 주입 문제
증상:
- `Protocol error (Storage.setCookies): Invalid cookie fields`

원인:
- CAPTCHA 브라우저 실행 시 너무 많은 쿠키를 Playwright에 넣다가 실패

해결 방향:
- 테스트 wrapper `launchBrowser()` 에서 Playwright에 넣는 쿠키를 `__session` 하나만 남기도록 축소

핵심 형태:

```ts
const sessionValue = String(this.currentToken || "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
```

이후 `browserCookies` 에는 `__session` 쿠키 하나만 넣고 `addCookies()` 호출

## 8. 현재 테스트 상태

최신 상태:
- 테스트 wrapper `dev-suno.songsai.org` 에서 auto 생성 성공
- 실제로 자동 가사가 만들어지는 것 확인

의미:
- `gpt_description_prompt` 기반 auto 흐름이 테스트 wrapper 기준으로는 복구됨

아직 남은 일:
- 테스트 wrapper 코드 정리 및 재현 가능한 형태로 보관
- 운영 반영 여부 판단

## 9. 운영 반영은 아직 하지 말아야 하는 이유

운영에 바로 반영하지 않은 이유:
- 운영 wrapper는 실제 사용자 요청을 처리 중
- auto 관련 패치는 CAPTCHA, 쿠키, payload 형태까지 영향을 줌
- 충분히 안정화 전에는 운영 wrapper를 건드리면 생성 장애 가능

현재 원칙:
- 운영 wrapper `suno.songsai.org` 는 유지
- 테스트 wrapper `dev-suno.songsai.org` 에서만 검증
- 운영 반영은 별도 단계

## 10. 다음에 이어서 할 추천 순서

1. `D:\wrapper\suno-api` 의 실제 수정본 정리
2. 테스트 wrapper 코드와 로컬 수정본 차이 정리
3. wrapper 쪽 변경을 재현 가능한 방식으로 문서화
4. 메인 프로젝트에서 auto UI/문구를 다듬을지 결정
5. 충분히 안정화되면 운영 wrapper 반영 여부 판단

## 11. 새 세션에서 바로 이어가기 위한 문장

메인 프로젝트 세션에서:

```txt
music 프로젝트 이어서 하자. 먼저 d:\music\ai_auto_lyrics_handoff.md 와 d:\music\dev_server_cleanup_plan.md 읽고 현재 auto-lyrics 테스트 상태부터 이어가줘.
```

wrapper 프로젝트 세션에서:

```txt
wrapper 프로젝트 이어서 하자. 먼저 d:\wrapper\wrapper_project_handoff.md 읽고, dev-suno 테스트 wrapper에서 성공한 auto-lyrics 패치를 정리하는 작업부터 이어가줘.
```

## 12. 요약

지금은 메인 프로젝트의 auto 경로와 테스트 wrapper 경로가 연결된 상태다.
가장 큰 성과는 **운영 영향 없이 `dev-suno` 에서 자동 가사 생성 성공을 확인한 것**이다.
다음 작업은 “추가 개발”보다는 “정리, 문서화, 안정화, 운영 반영 판단”에 가깝다.
