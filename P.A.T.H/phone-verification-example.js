/**
 * 휴대폰 인증 프론트엔드 예시 코드
 * 
 * 회원가입 플로우:
 * 1. 사용자가 전화번호 입력
 * 2. "인증번호 발송" 버튼 클릭
 * 3. 카카오톡으로 인증번호 수신
 * 4. 인증번호 입력 후 검증
 * 5. 나머지 회원가입 정보 입력
 * 6. 회원가입 완료
 */

// ===== HTML 예시 =====
/*
<div class="phone-verification">
  <h3>휴대폰 인증</h3>
  
  <!-- 1단계: 전화번호 입력 -->
  <div id="phone-input-step">
    <input type="tel" id="phone" placeholder="010-1234-5678" maxlength="13">
    <button id="send-code-btn">인증번호 발송</button>
    <p id="phone-error" class="error"></p>
  </div>
  
  <!-- 2단계: 인증번호 입력 -->
  <div id="code-input-step" style="display: none;">
    <input type="text" id="code" placeholder="인증번호 6자리" maxlength="6">
    <button id="verify-code-btn">인증하기</button>
    <button id="resend-code-btn">재발송</button>
    <p id="timer">남은 시간: <span id="time-left">5:00</span></p>
    <p id="code-error" class="error"></p>
  </div>
  
  <!-- 3단계: 인증 완료 -->
  <div id="verified-step" style="display: none;">
    <p class="success">✅ 인증 완료</p>
  </div>
</div>
*/

// ===== JavaScript 코드 =====

class PhoneVerification {
  constructor() {
    this.phone = '';
    this.timerInterval = null;
    this.timeLeft = 300; // 5분
    this.init();
  }

  init() {
    // 이벤트 리스너 등록
    document.getElementById('send-code-btn')?.addEventListener('click', () => this.sendCode());
    document.getElementById('verify-code-btn')?.addEventListener('click', () => this.verifyCode());
    document.getElementById('resend-code-btn')?.addEventListener('click', () => this.resendCode());
    
    // 전화번호 자동 하이픈 추가
    document.getElementById('phone')?.addEventListener('input', (e) => {
      e.target.value = this.formatPhone(e.target.value);
    });
  }

  // 전화번호 포맷팅 (010-1234-5678)
  formatPhone(value) {
    const numbers = value.replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  }

  // 인증번호 발송
  async sendCode() {
    const phoneInput = document.getElementById('phone');
    const phone = phoneInput.value.replace(/[^0-9]/g, '');
    
    // 전화번호 검증
    if (!/^01[0-9]{8,9}$/.test(phone)) {
      this.showError('phone-error', '올바른 전화번호를 입력해주세요.');
      return;
    }

    this.phone = phone;
    
    // 버튼 비활성화
    const btn = document.getElementById('send-code-btn');
    btn.disabled = true;
    btn.textContent = '발송 중...';

    try {
      const response = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      const data = await response.json();

      if (response.ok) {
        // 성공: 인증번호 입력 단계로 이동
        this.showCodeInputStep();
        this.startTimer();
        this.showSuccess(`${data.type === 'alimtalk' ? '카카오톡' : 'SMS'}으로 인증번호가 발송되었습니다.`);
      } else {
        this.showError('phone-error', data.error || '인증번호 발송에 실패했습니다.');
        btn.disabled = false;
        btn.textContent = '인증번호 발송';
      }
    } catch (error) {
      console.error('발송 오류:', error);
      this.showError('phone-error', '서버 오류가 발생했습니다.');
      btn.disabled = false;
      btn.textContent = '인증번호 발송';
    }
  }

  // 인증번호 검증
  async verifyCode() {
    const codeInput = document.getElementById('code');
    const code = codeInput.value.trim();

    if (!/^\d{6}$/.test(code)) {
      this.showError('code-error', '6자리 숫자를 입력해주세요.');
      return;
    }

    const btn = document.getElementById('verify-code-btn');
    btn.disabled = true;
    btn.textContent = '확인 중...';

    try {
      const response = await fetch('/api/auth/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // 세션 쿠키 포함
        body: JSON.stringify({ phone: this.phone, code })
      });

      const data = await response.json();

      if (response.ok) {
        // 성공: 인증 완료
        this.stopTimer();
        this.showVerifiedStep();
        this.showSuccess('인증이 완료되었습니다!');
        
        // 회원가입 폼 활성화 등 추가 작업
        this.onVerificationSuccess();
      } else {
        this.showError('code-error', data.error || '인증번호가 일치하지 않습니다.');
        btn.disabled = false;
        btn.textContent = '인증하기';
      }
    } catch (error) {
      console.error('검증 오류:', error);
      this.showError('code-error', '서버 오류가 발생했습니다.');
      btn.disabled = false;
      btn.textContent = '인증하기';
    }
  }

  // 인증번호 재발송
  async resendCode() {
    this.stopTimer();
    await this.sendCode();
  }

  // 타이머 시작
  startTimer() {
    this.timeLeft = 300; // 5분
    this.updateTimer();
    
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.updateTimer();
      
      if (this.timeLeft <= 0) {
        this.stopTimer();
        this.showError('code-error', '인증 시간이 만료되었습니다. 재발송 버튼을 눌러주세요.');
        document.getElementById('verify-code-btn').disabled = true;
      }
    }, 1000);
  }

  // 타이머 중지
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // 타이머 UI 업데이트
  updateTimer() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    const timeLeftElement = document.getElementById('time-left');
    if (timeLeftElement) {
      timeLeftElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  // UI 전환
  showCodeInputStep() {
    document.getElementById('phone-input-step').style.display = 'none';
    document.getElementById('code-input-step').style.display = 'block';
    document.getElementById('code')?.focus();
  }

  showVerifiedStep() {
    document.getElementById('code-input-step').style.display = 'none';
    document.getElementById('verified-step').style.display = 'block';
  }

  // 에러 메시지 표시
  showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.color = 'red';
    }
  }

  // 성공 메시지 표시
  showSuccess(message) {
    alert(message); // 또는 Toast 알림으로 구현
  }

  // 인증 성공 시 콜백
  onVerificationSuccess() {
    // 회원가입 폼의 나머지 입력 활성화
    document.querySelectorAll('.register-form input').forEach(input => {
      input.disabled = false;
    });
    
    // 제출 버튼 활성화
    const submitBtn = document.getElementById('register-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  new PhoneVerification();
});

// ===== 회원가입 API 호출 예시 =====
async function register() {
  const formData = {
    nickname: document.getElementById('nickname').value,
    password: document.getElementById('password').value,
    real_name: document.getElementById('real_name').value,
    university: document.getElementById('university').value,
    is_n_su: document.getElementById('is_n_su').checked,
    prev_university: document.getElementById('prev_university')?.value,
    privacy_agreed: document.getElementById('privacy_agreed').checked
  };

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // 인증 세션 포함 필수!
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (response.ok) {
      alert('회원가입 성공!');
      window.location.href = '/mainHub';
    } else {
      alert(data.error || '회원가입 실패');
    }
  } catch (error) {
    console.error('회원가입 오류:', error);
    alert('서버 오류가 발생했습니다.');
  }
}
