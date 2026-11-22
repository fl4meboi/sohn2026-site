# 한국 중소벤처기업 정책자금연구소 웹사이트

네이버 블로그([blog.naver.com/sohn2026](https://blog.naver.com/sohn2026))의 모든 게시글과 카테고리를 체계적으로 정리해 보여주는 공식 웹사이트 및 **자동 동기화 시스템**입니다.

외부 npm 패키지 설치 없이 순수 Node.js(>=18)만으로 동작합니다.

---

## 주요 기능

1. **체계적인 기관형 웹사이트 구성**
   - **홈 포털 (`index.html`)**: 핵심 컨설팅 소개, 분야별 정책자금 카테고리 허브, 실시간 검색/필터 자료실, 컨설팅 절차, 간편 상담 요청서
   - **개별 게시글 페이지 (`posts/<logNo>.html`)**: SmartEditor 본문 정제, 반응형 표(`.article-table`), 이미지 라이트박스 확대, 자동 목차(TOC) 생성, 이전/다음 글 및 관련 자료 추천
   - **카테고리별 아카이브 (`category/<categoryNo>.html`)**: 블로그 카테고리와 1:1 자동 매핑 (새 카테고리 추가 시 자동 생성)
   - **전용 페이지**: `연구소 소개 (about.html)`, `컨설팅 상담신청 (consulting.html)`, `RSS (rss.xml)`

2. **신규 글 · 수정 · 삭제 자동 감지 및 반영 (`scripts/sync.mjs`)**
   - **RSS 피드** + **네이버 모바일 카테고리 API** + **PostTitleListAsync 전체 페이지네이션** + **게시글 원문 HTML**을 모두 수집합니다.
   - 게시글마다 제목·카테고리·본문 HTML·이미지·태그 기반 **SHA-256 해시**를 계산해, 새 글 등록뿐만 아니라 **기존 글 수정** 및 **삭제**까지 정확히 감지합니다.
   - 네이버 이미지 핫링크 차단(`Referer`)을 방지하기 위해 본문 이미지를 `data/media/<logNo>/`에 자동 로컬 캐싱합니다.

---

## 실행 방법

### 1) 최신 네이버 블로그 내용 동기화 + 사이트 빌드
```bash
npm run sync-and-build
```
- `npm run sync`: `blog.naver.com/sohn2026`에서 최신 글·수정사항·이미지를 가져와 `data/blog-data.json` 업데이트
- `npm run build`: `dist/` 폴더에 정적 웹사이트 생성

### 2) 자동 동기화 포함 로컬 서버 실행
```bash
npm start
```
- `http://localhost:3000` 에서 웹사이트 실행
- 기본 **15분마다** 네이버 블로그 변경 사항을 자동 확인하고, 변경이 있을 때만 자동으로 사이트를 다시 빌드합니다.
- 푸터의 **지금 동기화** 버튼 또는 `POST /api/sync`로 즉시 동기화할 수 있으며, `GET /api/status`에서 동기화 이력을 확인할 수 있습니다.
- 오프라인/초기 동기화 없이 바로 미리보기만 할 경우:
  ```bash
  npm run dev
  ```

### 3) GitHub Pages 자동 배포 (무료 · 주 1회 자동 + 수동 즉시 실행)
이 저장소는 GitHub Pages + GitHub Actions(`.github/workflows/sync-and-deploy.yml`)로 자동 배포됩니다.
- **자동 동기화**: 매주 월요일 오전 9시(KST)마다 네이버 블로그의 신규 글·수정·삭제를 자동 확인하고 변경 시에만 재배포합니다.
- **수동 즉시 동기화**: GitHub 저장소 **Actions → Sync Naver Blog & Deploy Website → Run workflow** 버튼으로 언제든지 즉시 업데이트할 수 있습니다.
- **커스텀 도메인 연결**: `config.json`의 `"customDomain"`에 도메인을 입력하고 DNS 레코드를 연결하면 자동으로 `CNAME`과 무료 HTTPS가 적용됩니다.

---

## 설정 변경 (`config.json`)
`config.json`에서 블로그 ID, 연락처, 동기화 주기(`sync.intervalMinutes`), 카테고리별 아이콘/설명 등을 손쉽게 수정할 수 있습니다.
