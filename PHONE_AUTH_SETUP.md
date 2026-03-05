# 카카오톡 알림톡 인증 설정 가이드

## 1. 알리고 가입 및 설정

### 1.1 알리고 가입
1. [알리고](https://smartsms.aligo.in/) 접속
2. 회원가입 (사업자 등록번호 또는 개인 가능)
3. 로그인 후 충전 (최소 5만원 권장)

### 1.2 API 키 발급
1. 상단 메뉴 > `API 키 관리` 클릭
2. `인증키 발급` 버튼 클릭
3. API Key 복사

### 1.3 발신번호 등록
1. 상단 메뉴 > `발신번호 관리` 클릭
2. `발신번호 등록` 버튼 클릭
3. 휴대폰 번호 입력 후 인증
4. 승인 완료 (즉시 또는 1~2시간 소요)

### 1.4 카카오톡 채널 개설
1. [카카오톡 채널 관리자센터](https://center-pf.kakao.com/) 접속
2. 새 채널 만들기
3. 채널 정보 입력 (이름, 프로필 이미지 등)
4. 채널 ID 확인 (예: `@your_channel`)

### 1.5 알림톡 템플릿 등록
1. 알리고 > 상단 메뉴 > `알림톡 관리` > `템플릿 관리`
2. `새 템플릿 등록` 클릭
3. 템플릿 작성:
   ```
   템플릿명: P.A.T.H 인증번호
   템플릿 코드: TM_0001 (자동 생성 또는 직접 입력)
   
   내용:
   [P.A.T.H] 인증번호는 [#{code}] 입니다. 5분 이내에 입력해주세요.
   
   버튼 (선택):
   - 버튼명: 인증하기
   - 버튼 타입: 웹링크
   - 링크: https://your-domain.com/verify
   ```
4. 검수 요청 (카카오 승인 필요, 1~2일 소요)
5. 승인 완료 후 템플릿 코드 확인

## 2. 환경변수 설정

프로젝트 루트에 `.env` 파일 생성:

```bash
# 알리고 API 설정
ALIGO_API_KEY=your_aligo_api_key_here
ALIGO_USER_ID=your_aligo_user_id
ALIGO_SENDER=01012345678
ALIGO_TEMPLATE_CODE=TM_0001
ALIGO_PLUSFRIEND_ID=@your_channel

# 알림톡 옵션
ALIGO_TEST_MODE=false
ALIGO_SMS_FALLBACK=true

# 다계정 방지 설정
PHONE_ACCOUNT_LIMIT=2

# 개발 환경
NODE_ENV=production
```

### 환경변수 설명

| 변수 | 필수 | 설명 | 예시 |
|------|------|------|------|
| `ALIGO_API_KEY` | ✅ | 알리고 API 키 | `abcd1234efgh5678...` |
| `ALIGO_USER_ID` | ✅ | 알리고 사용자 ID | `your_id` |
| `ALIGO_SENDER` | ✅ | 발신번호 (하이픈 제거) | `01012345678` |
| `ALIGO_TEMPLATE_CODE` | ✅ | 승인받은 템플릿 코드 | `TM_0001` |
| `ALIGO_PLUSFRIEND_ID` | ✅ | 카카오톡 채널 ID | `@your_channel` |
| `ALIGO_TEST_MODE` | ❌ | 테스트 모드 활성화 (과금 없음) | `true` / `false` |
| `ALIGO_SMS_FALLBACK` | ❌ | 알림톡 실패 시 SMS 자동 발송 | `true` / `false` |
| `PHONE_ACCOUNT_LIMIT` | ❌ | 번호당 최대 계정 수 | `2` (기본값) |
| `NODE_ENV` | ❌ | 실행 환경 | `development` / `production` |

## 3. 패키지 설치

```bash
npm install
```

## 4. DB 마이그레이션

```bash
npm start
```

서버 실행 시 자동으로 DB 스키마가 업데이트됩니다.

## 5. API 테스트

### 5.1 인증번호 발송
```bash
curl -X POST http://localhost:3000/api/auth/send-verification \
  -H "Content-Type: application/json" \
  -d '{"phone": "01012345678"}'
```

**응답 예시:**
```json
{
  "ok": true,
  "message": "인증번호가 발송되었습니다.",
  "type": "alimtalk",
  "expiresIn": 300
}
```

### 5.2 인증번호 검증
```bash
curl -X POST http://localhost:3000/api/auth/verify-phone \
  -H "Content-Type: application/json" \
  -d '{"phone": "01012345678", "code": "123456"}'
```

**응답 예시:**
```json
{
  "ok": true,
  "message": "인증이 완료되었습니다.",
  "verified": true
}
```

### 5.3 회원가입
인증 완료 후 회원가입 가능:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -b "connect.sid=..." \
  -d '{
    "nickname": "testuser",
    "password": "password123",
    "real_name": "홍길동",
    "university": "서울대학교",
    "privacy_agreed": true,
    "is_n_su": false
  }'
```

## 6. 개발 모드

개발 환경에서 알리고 API 없이 테스트하려면:

1. `.env` 파일에서 `NODE_ENV=development` 설정
2. 또는 `ALIGO_API_KEY`를 설정하지 않음
3. 인증번호 발송 시 콘솔에 인증번호 출력

```bash
[개발 모드] 인증번호: 123456
```

## 7. 비용 안내

### 알리고 요금 (2026년 기준)
- **알림톡**: 건당 약 8~15원
- **SMS (실패 시 대체)**: 건당 약 15~20원
- **충전 금액**: 최소 5만원부터

### 예상 비용 계산
```
일 가입자 100명 기준:
- 알림톡 성공률 95% → 95명 × 15원 = 1,425원
- SMS 폴백 5% → 5명 × 20원 = 100원
- 일 합계: 약 1,525원
- 월 합계: 약 45,750원
```

## 8. 보안 권장사항

### 8.1 레이트리밋 (이미 구현됨)
- 같은 번호: 5분당 1회
- 같은 IP: 1시간당 10회

### 8.2 추가 보안
```javascript
// server/index.js에 추가
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5회
  message: { error: '너무 많은 요청입니다. 나중에 다시 시도해주세요.' }
});

app.use('/api/auth/send-verification', authLimiter);
app.use('/api/auth/verify-phone', authLimiter);
```

### 8.3 번호당 계정 제한
`.env`에서 `PHONE_ACCOUNT_LIMIT` 조정 (기본 2개)

## 9. 문제 해결

### 알림톡이 발송되지 않아요
1. 템플릿 검수 상태 확인 (승인 완료 확인)
2. 카카오톡 채널 ID 정확한지 확인 (`@` 포함)
3. 알리고 잔액 확인
4. 콘솔 에러 로그 확인

### SMS로 대체 발송되나요?
네, `ALIGO_SMS_FALLBACK=true` 설정 시 알림톡 실패 시 자동으로 SMS로 발송됩니다.

### 테스트 모드로 과금 없이 테스트하려면?
`.env`에서 `ALIGO_TEST_MODE=true` 설정하면 실제 발송 없이 테스트 가능합니다.

### 개발 중에는 어떻게 하나요?
`NODE_ENV=development` 설정 시 알리고 API 없이도 콘솔에 인증번호가 출력됩니다.

## 10. 다음 단계

- [ ] 프론트엔드에 인증 UI 추가
- [ ] 재발송 버튼 구현
- [ ] 인증 실패 횟수 제한
- [ ] 관리자 대시보드에서 인증 통계 확인
- [ ] 이메일 인증 추가 (선택)

## 참고 자료

- [알리고 API 문서](https://smartsms.aligo.in/admin/api/info.html)
- [카카오 비즈메시지 가이드](https://kakaobusiness.gitbook.io/main/ad/bizmessage)
- [알림톡 템플릿 가이드라인](https://kakaobusiness.gitbook.io/main/ad/bizmessage/notice/template)
