const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const {
  pool,
  requireAuth,
  validateNickname,
  USER_FIELDS,
  EULA_VERSION,
  addPercentile,
  enforceAlwaysMainAdminByNickname,
  ensureUserCode,
} = require('./_helpers');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '회원가입 시도가 너무 많습니다. 1시간 후 다시 시도해주세요.' },
});

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'qwerty',
  'qwerty123',
  'asdf1234',
  'letmein',
  'welcome',
  'admin',
  'admin123',
  'iloveyou',
  'abc123',
  '00000000',
  '11111111',
  '123123123',
  '12345678',
  '123456789',
  '1234567890',
  '1q2w3e4r',
  '1q2w3e4r5t',
  'zaq12wsx',
  'google123',
  'korea123',
  'changeme',
]);

function normalizeForPasswordChecks(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function hasSimpleSequentialPattern(password) {
  const onlyAlnum = String(password || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (onlyAlnum.length < 6) return false;

  const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz'];

  return sequences.some((seq) => {
    for (let i = 0; i <= seq.length - 6; i += 1) {
      const part = seq.slice(i, i + 6);
      const reversed = part.split('').reverse().join('');
      if (onlyAlnum.includes(part) || onlyAlnum.includes(reversed)) return true;
    }
    return false;
  });
}

function validatePasswordStrength({ password, nickname, realName }) {
  if (typeof password !== 'string') {
    return { ok: false, error: '비밀번호 형식이 올바르지 않습니다.' };
  }

  if (password.length < 10) {
    return { ok: false, error: '비밀번호는 10자 이상이어야 합니다.' };
  }

  if (password.length > 128) {
    return { ok: false, error: '비밀번호는 128자 이하여야 합니다.' };
  }

  if (!password.trim()) {
    return { ok: false, error: '공백만으로는 비밀번호를 만들 수 없습니다.' };
  }

  const normalizedPassword = normalizeForPasswordChecks(password);
  if (COMMON_PASSWORDS.has(normalizedPassword)) {
    return { ok: false, error: '너무 쉬운 비밀번호입니다. 더 긴 문장형 비밀번호를 사용해주세요.' };
  }

  if (/(.)\1{3,}/.test(password)) {
    return { ok: false, error: '같은 문자를 반복한 비밀번호는 사용할 수 없습니다.' };
  }

  if (hasSimpleSequentialPattern(password)) {
    return { ok: false, error: '연속된 문자/숫자 패턴이 포함된 비밀번호는 사용할 수 없습니다.' };
  }

  const normalizedNickname = normalizeForPasswordChecks(nickname);
  if (normalizedNickname.length >= 3 && normalizedPassword.includes(normalizedNickname)) {
    return { ok: false, error: '닉네임이 포함된 비밀번호는 사용할 수 없습니다.' };
  }

  const normalizedRealName = normalizeForPasswordChecks(realName);
  if (normalizedRealName.length >= 3 && normalizedPassword.includes(normalizedRealName)) {
    return { ok: false, error: '실명이 포함된 비밀번호는 사용할 수 없습니다.' };
  }

  return { ok: true };
}

router.post('/register', registerLimiter, async (req, res) => {
  const {
    real_name,
    nickname,
    password,
    university,
    is_n_su,
    prev_university,
    privacy_agreed,
    eula_agreed,
  } = req.body;
  if (!nickname || !password || !university) {
    return res.status(400).json({ error: '닉네임, 비밀번호, 대학교를 모두 입력해주세요.' });
  }
  if (!real_name) return res.status(400).json({ error: '실명을 입력해주세요.' });
  if (!privacy_agreed) return res.status(400).json({ error: '개인정보 수집·이용에 동의해주세요.' });
  if (!eula_agreed) return res.status(400).json({ error: '이용약관에 동의해주세요.' });
  if (nickname.length < 2 || nickname.length > 20)
    return res.status(400).json({ error: '닉네임은 2~20자 사이여야 합니다.' });
  const passwordValidation = validatePasswordStrength({ password, nickname, realName: real_name });
  if (!passwordValidation.ok) return res.status(400).json({ error: passwordValidation.error });
  if (is_n_su && !prev_university)
    return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE nickname = $1', [nickname]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });

    const hash = await bcrypt.hash(password, 10);

    const initialEstate = null;

    const result = await pool.query(
      `INSERT INTO users (nickname, password_hash, university, real_name, privacy_agreed, is_n_su, prev_university, phone_hash, phone_verified, phone_verified_at, eula_version, eula_agreed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
             RETURNING ${USER_FIELDS}`,
      [
        nickname,
        hash,
        initialEstate,
        real_name,
        !!privacy_agreed,
        !!is_n_su,
        prev_university || null,
        null,
        false,
        null,
        EULA_VERSION,
      ],
    );
    const user = result.rows[0];
    user.user_code = await ensureUserCode(user.id);

    req.session.userId = user.id;
    res.json({ ok: true, user: addPercentile(user) });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password)
    return res.status(400).json({ error: '닉네임과 비밀번호를 입력해주세요.' });
  try {
    const result = await pool.query(
      `SELECT ${USER_FIELDS}, password_hash FROM users WHERE nickname = $1`,
      [nickname],
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: '닉네임 또는 비밀번호가 올바르지 않습니다.' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: '닉네임 또는 비밀번호가 올바르지 않습니다.' });

    const enforced = await enforceAlwaysMainAdminByNickname(user.id);
    const ensuredUserCode = await ensureUserCode(user.id);
    req.session.userId = user.id;
    const { password_hash, ...safeUser } = user;
    safeUser.user_code = safeUser.user_code || ensuredUserCode;

    if (enforced?.is_admin === true) safeUser.is_admin = true;
    if (enforced?.admin_role) safeUser.admin_role = enforced.admin_role;

    res.json({ ok: true, user: addPercentile(safeUser) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    await enforceAlwaysMainAdminByNickname(req.session.userId);
    const result = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [
      req.session.userId,
    ]);
    if (result.rows.length === 0) {
      req.session.destroy();
      return res.status(401).json({ error: '유저를 찾을 수 없습니다.' });
    }
    const user = result.rows[0];
    user.user_code = user.user_code || (await ensureUserCode(user.id));
    res.json({ user: addPercentile(user) });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  const currentPassword =
    typeof req.body?.current_password === 'string' ? req.body.current_password : '';
  const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';

  if (!newPassword) {
    return res.status(400).json({ error: '새 비밀번호를 입력해주세요.' });
  }

  try {
    const result = await pool.query(
      'SELECT auth_provider, password_hash, nickname, real_name FROM users WHERE id = $1',
      [req.session.userId],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    const row = result.rows[0];
    const isGoogleOnly = row.auth_provider === 'google' || row.auth_provider === 'apple';

    if (!isGoogleOnly && !currentPassword) {
      return res.status(400).json({ error: '현재 비밀번호를 입력해주세요.' });
    }

    if (currentPassword) {
      const validCurrent = await bcrypt.compare(currentPassword, row.password_hash);
      if (!validCurrent) {
        return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
      }
    }

    if (currentPassword && currentPassword === newPassword) {
      return res.status(400).json({ error: '새 비밀번호가 현재 비밀번호와 동일합니다.' });
    }

    const passwordValidation = validatePasswordStrength({
      password: newPassword,
      nickname: row.nickname,
      realName: row.real_name,
    });
    if (!passwordValidation.ok) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      nextHash,
      req.session.userId,
    ]);

    return res.json({ ok: true, message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    console.error('change-password error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
