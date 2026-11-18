# 댓글·답글 근거 첨부

기존 GitHub Pages 화면의 댓글·답글·수정 폼에서 **근거 첨부**를 누릅니다. 직접 URL을 확인하거나 AI 추천 자료를 여러 개 골라 최대 8개까지 첨부할 수 있습니다. 작성 내용과 첨부 목록은 검색창 상태와 별도로 유지됩니다. 게시 후 본문 아래의 **📚 첨부된 근거 N개**를 펼치면 원문 링크를 볼 수 있습니다. 첨부는 사실 검증 인증이 아닙니다.

## Google 무료 제공 조건 — 2026-11-18 확인

- 공식 Google GenAI SDK `@google/genai`를 서버에서만 사용합니다. Google Search 경로의 기본 모델은 요청대로 `gemini-2.5-flash`입니다. 기본 모델이 종료된 경우 무료 Search를 지원하는 `gemini-2.5-flash-lite`만 재시도합니다.
- 공식 요금표는 2.5 Flash/Flash-Lite의 무료 Google Search Grounding을 합산 **일 500회**까지 명시합니다. 이는 검색 상품의 최대 한도이며, 프로젝트의 모델별 RPM·TPM·RPD 및 실제 무료 이용 자격은 더 낮거나 없을 수 있습니다.
- 2.5 Flash는 신규 사용이 제한되고 2026-12-01부터 3.5 Flash-Lite로 자동 연결됩니다. 3.5 Flash-Lite의 Google Search는 무료 티어에 제공되지 않으므로 서버는 해당 날짜부터 Grounding 요청 모델을 명시적으로 2.5 Flash-Lite로 바꿉니다. 3.x Google Search로 자동 전환하지 않습니다.
- 현재 운영 키에서는 2.5 Flash와 Flash-Lite가 모두 404로 거절됐습니다. UI는 이를 숨기지 않고 **무료 학술자료 검색 (Crossref)**을 안내합니다. 이 대안은 무료 Crossref REST 검색과 무료 티어 `gemini-3.5-flash-lite`의 주장 분석·자료 검토를 조합합니다. Google 검색으로 표시하지 않으며, 학술 서지 자료를 대상으로 합니다. 실제 운영 서버에서 성공을 확인했습니다.
- 운영의 `EVIDENCE_GOOGLE_AVAILABLE=false`는 확인된 이용 불가 상태를 화면과 API에 반영해 불필요한 실패 요청을 막습니다. 무료 Grounding을 지원하는 프로젝트로 키를 교체하고 실제 연결을 확인한 경우에만 이 값을 `true`로 변경합니다. Crossref 대안에는 영향을 주지 않습니다.
- 무료 여부는 **키를 발급한 Google 프로젝트의 결제 상태**로 결정됩니다. 서버의 제한이나 ‘무료’ 문구가 결제가 연결된 프로젝트의 과금을 해제하지는 않습니다. 반드시 결제가 연결되지 않은 무료 프로젝트의 `GEMINI_API_KEY`를 사용해야 합니다. 키는 Cloudflare Secret에 등록하며 프론트엔드·Git·로그에는 기록하지 않습니다.
- [Google 공식 요금표](https://ai.google.dev/gemini-api/docs/pricing), [모델 종료 일정](https://ai.google.dev/gemini-api/docs/deprecations), [프로젝트별 사용 제한](https://ai.google.dev/gemini-api/docs/rate-limits), [Google 검색 제안 표시 요건](https://firebase.google.com/docs/ai-logic/grounding-google-search), [Crossref 공개 API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/).

## 구성과 API

`worker/wrangler.jsonc`의 `EVIDENCE_GEMINI_MODEL`은 무료 Grounding 모델 두 개만 허용합니다. 기본 신규 검색 제한은 회원별 하루 3회, 사이트 전체 하루 5회, 회원별 분당 2회입니다. 검색 한 번은 분석·검색·검토 단계로 진행됩니다. Crossref 대안은 검색 단계에서 Google을 호출하지 않습니다. 무료 모델의 실제 제한이 더 작으면 제공자의 429 오류를 그대로 안전하게 처리합니다. `EVIDENCE_USER_DAILY_LIMIT`, `EVIDENCE_SITE_DAILY_LIMIT`으로 조정할 수 있으며 모델 제한과는 별개입니다.

| API | 역할 |
| --- | --- |
| `GET /v1/evidence/config` | 키 설정 여부·무료 검색용 모델·한도 |
| `POST /v1/evidence/url` | 로그인, 공개 URL 검사, 안전한 메타데이터 조회, 첨부 영수증 발급 |
| `POST /v1/evidence/search` | `content`, `context`, `consent:true`, `provider:google 또는 academic` |
| `GET /v1/evidence/jobs/:id` | 동일 사용자만 진행 단계·결과 조회 |

검색은 NDJSON으로 실제 단계(`analyzing`, `searching`, `reviewing`)와 결과를 전송합니다. 캐시가 있으면 JSON 결과를 반환하며, 동일 사용자·내용·문맥·검색 방식·모델의 결과를 6시간 재사용합니다. 진행 중인 동일 검색은 기존 작업을 조회합니다. 오류나 만료 작업만 다시 실행할 수 있습니다. 검색할 때 입력 전체를 D1에 저장하지 않으며 해시, 추출 주장, 추천 결과만 저장합니다. 검색창 닫기나 실패는 작성 내용을 지우지 않습니다.

Google 경로는 **모델이 본문에 적은 URL을 무시**하고 `groundingMetadata.groundingChunks`에 실제 포함된 출처만 후보로 만듭니다. Google 리디렉션을 원문 주소로 해석하지 못하면 추천에서 제외합니다. 검토 단계는 서버가 발급한 후보 ID만 선택할 수 있으며 URL·발행일을 생성할 수 없습니다. 검색 제안 HTML은 스크립트·동일 출처 접근 권한이 없는 sandbox iframe으로 표시합니다. Crossref 경로 역시 실제 API의 DOI·제목·출판사·발행일만 사용합니다.

본문 발췌를 확인한 경우에도 전체 논문·연구 방법·사실 여부가 검증된 것은 아닙니다. 원문에 접근하지 못하면 미검증으로 표시하고 신뢰도 판정을 유보합니다. 반대 자료가 상위 8개 밖에 있으면 마지막 카드 대신 포함합니다. 날짜가 확인되지 않으면 추정하지 않습니다.

## 저장과 권한

`0004_comment_evidence.sql`은 기존 의견에 `evidence_json`을 추가하고 `evidence_sources`, `evidence_jobs` 테이블을 만듭니다. 익명 댓글·답글 POST/PATCH의 `evidenceIds`는 서버가 발급한 해당 사용자 소유의 영수증으로만 해결합니다. 게시물에는 자료의 스냅샷이 남아 검색 캐시 만료 후에도 유지됩니다. 본문만 수정할 때 `evidenceIds`를 생략하면 기존 첨부를 보존하고, 빈 배열은 제거를 뜻합니다. 삭제된 댓글은 첨부를 공개하지 않습니다. 익명 댓글은 작성자만 수정할 수 있는 기존 권한을 유지합니다.

고민상담 댓글·답글은 기존 Firestore `posts.comments[].evidence`에 ID·URL·제목·출처·발행일·유형만 저장합니다. 클라이언트가 사실 인증이나 신뢰도 배지를 만들어 저장할 수 없도록 허용 필드를 제한합니다. 첨부만 변경하는 수정도 동시 편집 충돌을 확인합니다. 규칙은 `firestore.rules`, 검증 사례는 `tests/firestore-rules-cases.mjs`에 있습니다. 운영 적용에는 Firebase 관리 인증이 필요합니다.

## URL 안전성

공개 http/https URL만 허용합니다. IP 리터럴·내부 호스트·사설/링크로컬 주소·인증 정보·비표준 포트·민감한 서명 쿼리를 거절합니다. 서버에서 본문을 읽는 대상은 신뢰할 수 있는 출판사·기관 도메인 목록으로 제한하고, **각 리디렉션마다** URL과 모든 A/AAAA 주소가 공개 주소인지 검사합니다. Cloudflare fetch는 임의 사이트에 대해 DNS 결과를 고정할 수 없으므로 알 수 없는 사용자 도메인은 아예 요청하지 않습니다. DNS 검사만으로 재바인딩을 막았다고 가정하지 않습니다. 미지원 사이트도 공개 링크로 첨부할 수 있지만 메타데이터·원문 미확인 상태를 명시합니다. 원문 수집은 시간·크기·리디렉션·요청 수를 제한합니다. [OWASP SSRF 방어 지침](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

## 배포·검증

1. `worker`에서 `npm ci`, `npm test`, `npx wrangler deploy --dry-run`.
2. `npx wrangler d1 migrations apply mindly-debate --remote` 후 `npx wrangler deploy --keep-vars`.
3. Firebase 규칙 테스트 후 `firebase deploy --only firestore:rules --project mindly1-52859`.
4. 루트 `npm run build` 및 Playwright 회귀 테스트 후 기존 GitHub Pages 배포.

`worker/tests/evidence.test.mjs`는 SSRF, 실제 검색 후보 제한, 반대 근거, 캐시, 사용자별 소유권, 첨부 수정·삭제와 할당량 실패를 검증합니다. `tests/evidence.spec.mjs`는 초안 보존, 다중 선택, 답글 연결, 게시 후 목록, 첨부만 수정, 실패 복구와 모바일 화면을 검사합니다. 테스트는 Google 응답을 가장해 운영 성공으로 보고하지 않으며 실제 연결 결과는 별도로 확인합니다.
