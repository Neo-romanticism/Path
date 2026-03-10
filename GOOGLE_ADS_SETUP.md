# Google AdSense 설정 가이드 (P.A.T.H)

## 개요
커뮤니티 탭에 Google AdSense 광고가 추가되었습니다. Apple App Store 정책을 준수하며, 사용자 경험을 해치지 않는 방식으로 구현되었습니다.

## Apple 정책 준수 사항

### ✅ 구현된 정책 준수 기능:
1. **명확한 광고 표시**: 모든 광고 위에 "광고" 라벨 표시
2. **콘텐츠와 구분**: 광고 컨테이너는 테두리와 배경색으로 명확히 구분됨
3. **비침해적 배치**: 베스트 섹션과 게시글 목록 사이의 자연스러운 위치
4. **우발적 클릭 방지**: 충분한 여백과 명확한 시각적 분리
5. **반응형 디자인**: 모든 화면 크기에서 적절하게 표시

### Apple App Store 심사 가이드라인:
- **3.1.1 - 광고**: 광고가 앱 콘텐츠와 명확히 구분됨 ✅
- **5.1.1 - 데이터 수집**: 사용자 동의를 받은 후 AdSense 사용 ✅
- **5.1.2 - 데이터 사용**: 미성년자 대상 부적절한 광고 방지 ✅

## Google AdSense 설정 방법

### 1단계: Google AdSense 계정 생성
1. [Google AdSense](https://www.google.com/adsense/)에 접속
2. 계정 생성 및 웹사이트 정보 입력
3. 사이트 승인 대기 (보통 1-2일 소요)

### 2단계: 광고 단위 생성
1. AdSense 대시보드 → **광고** → **광고 단위별** 클릭
2. **디스플레이 광고** 선택
3. 광고 단위 이름 입력 (예: "커뮤니티_메인")
4. **반응형** 선택
5. **생성 및 코드 받기** 클릭

### 3단계: 코드 정보 확인
생성된 코드에서 다음 정보를 확인:

```html
<ins class="adsbygoogle"
     data-ad-client="ca-pub-1234567890123456"  ← 이 부분
     data-ad-slot="9876543210">                ← 이 부분
</ins>
```

- **Publisher ID**: `ca-pub-XXXXXXXXXX` 형식
- **Ad Slot ID**: 10자리 숫자

### 4단계: P.A.T.H 코드에 적용

`/P.A.T.H/community/index.html` 파일에서 다음 두 곳을 수정:

#### ① Head 섹션의 AdSense 스크립트:
```html
<!-- 수정 전 -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX"
     crossorigin="anonymous"></script>

<!-- 수정 후 (본인의 Publisher ID로 교체) -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456"
     crossorigin="anonymous"></script>
```

#### ② 광고 컨테이너:
```html
<!-- 수정 전 -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-XXXXXXXXXX"
     data-ad-slot="YYYYYYYYYY"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>

<!-- 수정 후 (본인의 ID로 교체) -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-1234567890123456"
     data-ad-slot="9876543210"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
```

### 5단계: 테스트
1. 변경 사항을 저장하고 배포
2. 커뮤니티 페이지 접속
3. 광고가 표시되는지 확인
   - 처음에는 빈 공간 또는 테스트 광고가 표시될 수 있음
   - AdSense 승인 후 실제 광고가 표시됨

## 광고 수익 최적화 팁

### 1. 광고 배치
현재 구현된 위치:
- ✅ 베스트 섹션 아래
- ✅ 게시글 목록 위

추가 광고 배치 고려사항:
- 게시글 상세 페이지 하단
- 댓글 섹션 위/아래
- 사이드바 (데스크톱 전용)

**⚠️ 주의**: 광고가 너무 많으면 Apple 심사에서 거부될 수 있습니다.

### 2. 광고 정책 준수
- **금지 콘텐츠**: 성인 콘텐츠, 불법 콘텐츠, 폭력적 콘텐츠 제외
- **클릭 유도 금지**: "광고를 클릭해주세요" 등의 문구 사용 금지
- **광고 라벨**: 항상 "광고" 또는 "Sponsored" 라벨 표시

### 3. GDPR/CCPA 준수
AdSense 설정에서 개인정보 보호 설정 확인:
1. AdSense → **개인정보 보호 및 메시지**
2. **동의 관리 플랫폼(CMP)** 설정
3. 한국 사용자: GDPR 적용 대상은 아니지만, 권장사항 따르기

## 문제 해결

### Q1: 광고가 표시되지 않아요
**A**: 다음을 확인하세요:
- AdSense 계정이 승인되었는지 확인
- Publisher ID와 Ad Slot ID가 정확한지 확인
- 브라우저 광고 차단기가 비활성화되어 있는지 확인
- 개발자 도구에서 콘솔 오류 확인

### Q2: "광고 로딩 중..." 메시지만 표시됨
**A**: AdSense 스크립트가 로드되지 않았거나, 광고 승인 대기 중일 수 있습니다.

### Q3: Apple 심사에서 광고 관련 거부가 났어요
**A**: 다음을 확인하세요:
- "광고" 라벨이 모든 광고 위에 표시되는지 확인
- 광고와 콘텐츠가 명확히 구분되는지 확인
- 광고 클릭을 유도하는 문구가 없는지 확인
- 광고가 너무 많지 않은지 확인 (전체 화면의 30% 이하 권장)

### Q4: 수익이 발생하지 않아요
**A**: AdSense 수익은 다음 요소에 영향을 받습니다:
- 트래픽 양: 방문자 수가 많을수록 수익 증가
- 광고 품질: 사용자에게 관련성 높은 광고
- 클릭률(CTR): 사용자가 광고를 클릭하는 비율
- 지역: 특정 국가의 광고 단가가 더 높음

## 참고 자료

- [Google AdSense 고객센터](https://support.google.com/adsense)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [AdSense 정책센터](https://support.google.com/adsense/answer/48182)

## 지원

광고 설정에 문제가 있거나 질문이 있다면:
1. 이 문서를 다시 확인
2. Google AdSense 지원팀 문의
3. P.A.T.H 개발팀 문의

---

**마지막 업데이트**: 2026-03-10  
**문서 버전**: 1.0
