# N100 서버 퀵스타트

이 문서는 `d:\music` 프로젝트를 `N100 리눅스 서버`에 올릴 때 바로 따라할 수 있도록 만든 실전 절차이다.

## 1. 추천 배치 구조

- PostgreSQL: 같은 서버 내부 컨테이너
- 메인 앱(Next.js): Docker Compose로 실행
- Suno wrapper: 별도 디렉터리에서 따로 실행
- Nginx: 외부 공개 진입점

포트 예시:

- `3000`: 메인 앱
- `3001`: Suno wrapper
- `5432`: PostgreSQL

## 2. 서버 기본 준비

Ubuntu/Debian 계열 기준 예시:

```bash
sudo apt update
sudo apt install -y git curl nginx
```

Docker / Docker Compose 설치:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 3. 프로젝트 배치

예시 디렉터리:

```bash
mkdir -p ~/services
cd ~/services
git clone https://github.com/goldsky8080/music.git
cd music
```

## 4. 앱 환경 변수 준비

예시 파일 복사:

```bash
cp deploy/.env.n100.example deploy/.env.n100
```

필수 수정 항목:

- `POSTGRES_PASSWORD`
- `AUTH_SECRET`
- `APP_URL`
- `SUNO_API_BASE_URL`

현재 권장 값 예시:

```env
DATABASE_URL=postgresql://postgres:change-this-password@postgres:5432/music_platform?schema=public
SUNO_API_BASE_URL=http://127.0.0.1:3001
MUSIC_PROVIDER_MODE=suno
APP_URL=https://app.example.com
AUTH_SECRET=replace-with-a-long-random-secret
```

## 5. 메인 앱 실행

`deploy` 디렉터리에서 실행:

```bash
cd ~/services/music/deploy
docker compose -f docker-compose.n100.yml up -d --build
```

확인:

```bash
docker compose -f docker-compose.n100.yml ps
docker compose -f docker-compose.n100.yml logs -f music-app
```

## 6. Prisma 마이그레이션 적용

최초 1회:

```bash
cd ~/services/music
docker compose -f deploy/docker-compose.n100.yml exec music-app npx prisma migrate deploy
```

## 7. Suno wrapper 연결

wrapper는 현재 이 저장소 안에 포함되어 있지 않으므로 별도 디렉터리에서 운영한다.

예시:

```bash
cd ~/services
git clone https://github.com/gcui-art/suno-api.git
cd suno-api
```

wrapper `.env`에 필요한 대표 값:

```env
SUNO_COOKIE=...
TWOCAPTCHA_KEY=...
BROWSER=chromium
BROWSER_GHOST_CURSOR=false
BROWSER_LOCALE=en
BROWSER_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=0
PLAYWRIGHT_SKIP_BROWSER_GC=1
```

이후 wrapper를 `3001` 포트로 실행하고, 메인 앱 `SUNO_API_BASE_URL`을 그 주소로 맞춘다.

## 8. Nginx 리버스 프록시

예시 설정 파일:

- `/etc/nginx/sites-available/music-platform`

내용은 이 저장소의 [nginx.music-platform.conf.example](/d:/music/deploy/nginx.music-platform.conf.example) 참고

적용:

```bash
sudo ln -s /etc/nginx/sites-available/music-platform /etc/nginx/sites-enabled/music-platform
sudo nginx -t
sudo systemctl reload nginx
```

## 9. 도메인/HTTPS

추천:

- Cloudflare로 DNS 관리
- 서버에는 Nginx 설치
- 인증서는 `certbot` 또는 Cloudflare Tunnel/Proxy 조합 사용

## 10. 배포 후 체크리스트

- `docker compose ps` 에서 `music-app`, `postgres` 모두 실행 중인지
- `http://127.0.0.1:3000/api/health` 응답 확인
- PostgreSQL 연결 확인
- 회원가입/로그인 확인
- 음악 생성 버튼 클릭 시 크레딧 차감 확인
- wrapper 연결 후 실제 Suno 생성 확인

## 11. 사용자 증가 시 확장 순서

### 1단계

- N100 한 대에 `DB + 앱 + wrapper + Nginx`

### 2단계

- wrapper를 별도 서버/컨테이너로 분리
- 메인 앱은 그대로 유지

### 3단계

- PostgreSQL을 관리형 DB 또는 별도 서버로 분리
- 백업/모니터링 도입

### 4단계

- 영상 렌더링 워커 별도 분리
- 큐/Redis 도입 또는 강화

## 12. 오늘 바로 할 일

1. N100 서버에 Docker 설치
2. 이 저장소 클론
3. `deploy/.env.n100` 작성
4. `docker compose -f deploy/docker-compose.n100.yml up -d --build`
5. `npx prisma migrate deploy`
6. wrapper 서버를 별도 디렉터리에서 3001 포트로 실행
7. `SUNO_API_BASE_URL` 연결 후 실제 생성 테스트

