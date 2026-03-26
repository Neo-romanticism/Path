function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') {
    return { ok: false, error: '닉네임을 입력해주세요.' };
  }
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { ok: false, error: '닉네임은 2~20자여야 합니다.' };
  }
  if (!/^[a-zA-Z0-9가-힣_]+$/.test(trimmed)) {
    return { ok: false, error: '닉네임은 영문, 한글, 숫자, 밑줄(_)만 사용할 수 있습니다.' };
  }
  return { ok: true, value: trimmed };
}

module.exports = { validateNickname };
