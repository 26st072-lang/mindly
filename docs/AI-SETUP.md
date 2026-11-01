# 마인들리 AI 연결 안내

사이트는 [GitHub Pages](https://26st072-lang.github.io/mindly/)에서 제공하고, 토론 저장·사진 분석·의견 검사는 Cloudflare Worker가 처리합니다. 기존 고민상담과 회원 로그인은 Firebase를 사용합니다.

토론 서버 주소: `https://mindly-debate-api.mindly-debate-worker.workers.dev`

## 1. Cloudflare 이메일 인증

가입한 이메일의 받은편지함에서 Cloudflare 메일을 열고 **Verify email address**를 누릅니다. 메일이 없으면 스팸함을 확인합니다. 다시 받으려면 [Cloudflare 대시보드](https://dash.cloudflare.com/) → 오른쪽 위 프로필 → **My Profile** → **Email Address** → **Send verification email**을 선택합니다. 이메일 옆에 `(verified)`가 나타나면 인증된 상태입니다. 인증 전에는 Worker 배포가 거부됩니다. [공식 안내](https://developers.cloudflare.com/fundamentals/user-profiles/verify-email-address/)

## 2. Gemini 무료 API 키 만들기

1. [Google AI Studio](https://aistudio.google.com/)에 Google 계정으로 로그인합니다.
2. **API keys / Get API key** 메뉴에서 **Create API key**를 선택합니다.
3. 무료로 사용할 때는 **결제를 연결하지 않은 프로젝트**에서 키를 만듭니다. Gemini의 무료·유료 구분은 Google 프로젝트의 결제 상태와 사용 한도에 따라 결정됩니다. 사이트의 ‘무료’ 버튼이 Google 계정의 결제 상태를 변경하지는 않습니다.
4. 생성한 키를 복사하고 다음 단계의 Cloudflare 비밀값 입력란에만 붙여넣습니다. 채팅, GitHub, `index.html`, `site-config.js`에 붙이지 않습니다.

기본 무료 경로는 `gemini-2.5-flash-lite`입니다. 사진을 직접 읽으면서 OCR와 토론 요약을 함께 수행합니다. 별도 OCR 유료 서비스는 사용하지 않습니다. 무료 API는 사용량 제한이 있고, 입력 내용이 서비스 개선에 사용될 수 있습니다. 댓글 사진의 이름·닉네임·얼굴·아이디를 먼저 가려야 합니다. [Gemini 요금·데이터 사용 안내](https://ai.google.dev/gemini-api/docs/pricing)

## 3. OpenRouter 키 만들기

1. [OpenRouter](https://openrouter.ai/)에서 가입·로그인합니다.
2. **Settings → API Keys**에서 마인들리용 키를 만듭니다.
3. 키에 사용 한도를 설정하고, 유료 기능이 필요할 때만 계정의 결제·크레딧을 준비합니다.
4. 키를 Cloudflare의 `OPENROUTER_API_KEY` 비밀값으로 등록합니다.

유료 경로의 모델 ID는 `openai/gpt-6-luna`입니다. ‘Luna’는 이 모델로 연결합니다. Gemini 한도가 끝나도 OpenRouter로 자동 전환하지 않습니다. 유료 모드를 관리자 화면에서 직접 선택해야 합니다. [OpenRouter 모델 안내](https://openrouter.ai/openai/gpt-6-luna)

## 4. API 키를 Cloudflare에 등록하기

Worker 배포가 완료된 후 진행합니다.

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인합니다.
2. **Workers & Pages**에서 **mindly-debate-api**를 선택합니다.
3. **Settings → Variables and Secrets**로 이동합니다.
4. **Add**를 누르고 **Type**을 **Secret**으로 선택합니다.
5. 아래 이름을 정확히 입력하고, **Value**에 해당 값을 붙여넣습니다.
6. **Save / Deploy**를 눌러 적용합니다. 저장만 하고 적용을 묻는 화면이 남으면 **Deploy**까지 누릅니다.

| 이름 | 넣을 값 | 필요한 기능 |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google AI Studio에서 만든 키 | 무료 사진 분석·의견 검사 |
| `OPENROUTER_API_KEY` | OpenRouter에서 만든 키 | 유료 GPT Luna 분석·의견 검사 |
| `ADMIN_UIDS` | Firebase 관리자 계정의 UID | 관리자 무료·유료 전환 |
| `ANON_SECRET` | 배포 과정에서 자동 생성하는 임의 비밀값 | 토론별 익명 이름 생성 |

`ANON_SECRET`은 배포 담당자가 생성합니다. 이미 등록되어 있다면 다시 만들지 않습니다. 관리자 여러 명의 UID는 쉼표로 구분할 수 있습니다. 이름과 이메일 주소를 UID 대신 넣으면 안 됩니다.

터미널에서 등록할 수도 있습니다. 프로젝트의 `worker` 폴더에서 다음 명령을 **한 번에 하나씩** 실행합니다. 명령이 값을 물을 때 붙여넣고 Enter를 누릅니다. 키 자체를 명령 뒤에 적지 않습니다.

```powershell
npx.cmd wrangler secret put GEMINI_API_KEY
npx.cmd wrangler secret put OPENROUTER_API_KEY
npx.cmd wrangler secret put ADMIN_UIDS
```

## 5. 관리자 UID 찾기

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 **mindly1-52859** 프로젝트를 엽니다.
2. 왼쪽 **Build → Authentication → Users**로 이동합니다.
3. 기존 관리자 이메일 **kickin_mindly@gmail.com**을 검색합니다.
4. 해당 계정의 **User UID**를 복사합니다.
5. Cloudflare의 `ADMIN_UIDS` 비밀값에 붙여넣습니다.

UID는 사용자 식별자입니다. 비밀번호나 API 키가 아닙니다. 계정이 검색되지 않으면 해당 이메일로 먼저 마인들리에 가입한 뒤 확인합니다. 화면의 관리자 메뉴는 기존 관리자 이메일을 기준으로 표시되고, Worker는 별도로 등록한 UID와 서명 검증된 Firebase 로그인 토큰을 확인합니다.

## 6. 연결 확인

1. 마인들리 사이트를 새로고침합니다.
2. 관리자 계정으로 로그인하고 **관리자 → 토론 AI · 무료 / 유료 선택**을 엽니다.
3. `무료 · Gemini`가 선택되는지 확인합니다. 키가 없는 경로는 선택할 수 없습니다.
4. **익명 토론 게시판 → 새 토론 열기**에서 개인정보를 가린 댓글 사진을 첨부합니다.
5. 사진 전송 동의에 체크하고 **사진 읽고 토론 초안 만들기**를 누릅니다.
6. 제목·맥락·쟁점·찬반 입장을 직접 검토한 뒤 **표현 확인 후 토론 게시하기**를 누릅니다.
7. 토론에서 찬성 또는 반대를 선택하고 이유를 5~500자로 입력합니다.
8. 수정 안내가 뜨면 제안을 읽고 **확인하고 직접 수정하기**를 누릅니다. 원래 입력란에서 직접 수정한 뒤 다시 제출합니다. 확인 버튼만 누르면 게시되지 않습니다.

API 키를 등록하기 전에는 실제 AI 분석이 동작하지 않습니다. AI가 실패하거나 한도에 도달하면 게시를 중단하고 입력을 보존합니다. 화면에서 분석 성공을 흉내 내거나 검사를 생략해 게시하지 않습니다.

## 7. 비용과 데이터

- Cloudflare Workers와 D1은 무료 플랜으로 구성합니다. 무료 제공량을 초과하면 서비스 이용이 제한될 수 있습니다. [Workers 제한](https://developers.cloudflare.com/workers/platform/limits/), [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/)
- 기본 서버 제한은 한 사용자당 하루 사진 분석 5회, 글·의견 검사 40회이며, 전체 AI 경로별 하루 200회입니다. 제공자의 실제 한도는 이보다 적을 수 있습니다. `AI_DAILY_LIMIT`으로 전체 한도를 조정할 수 있습니다.
- 원본 사진과 OCR 원문은 D1에 저장하지 않습니다. 사진은 선택된 AI 제공자에게 전송됩니다. 게시물에는 사용자가 확인한 요약·쟁점·입장만 저장합니다.
- 익명은 다른 이용자에게 계정 정보를 보여주지 않는다는 의미입니다. 서버는 한 사람 한 표와 개인 보관함을 위해 Firebase UID를 내부적으로 저장합니다.
- 브라우저에 있는 Firebase 웹 설정의 `apiKey`는 앱 식별에 사용하는 공개 웹 설정입니다. Gemini·OpenRouter 비밀 API 키와 용도가 다릅니다. Firebase 데이터 접근 권한은 Firebase 보안 규칙에서 관리합니다. [Firebase API 키 안내](https://firebase.google.com/docs/projects/api-keys)

## 8. 나중에 Worker 코드를 변경할 때

GitHub Pages는 `main`에 푸시하면 자동 배포됩니다. Worker 변경은 `worker` 폴더에서 다음 명령으로 별도 배포합니다. 코드 푸시만으로 Worker의 비밀값이 복사되거나 노출되지 않습니다.

```powershell
npm.cmd ci
npm.cmd test
npx.cmd wrangler d1 migrations apply mindly-debate --remote
npm.cmd run deploy
```

새 Worker 주소를 사용하면 루트 `site-config.js`의 `workerUrl`에 공개 주소만 적고 GitHub에 푸시합니다. API 키를 이 파일에 넣으면 안 됩니다.
