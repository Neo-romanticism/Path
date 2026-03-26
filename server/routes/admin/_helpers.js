const fs = require('fs/promises');
const path = require('path');
const pool = require('../../db');
const { createRequireAdmin, createRequireMainAdmin } = require('../../middleware/auth');
const { validateNickname } = require('../../utils/validateNickname');
const { ALWAYS_MAIN_ADMIN_NICKNAME } = require('../../utils/constants');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const UNIVERSITY_DATA_DIR = path.join(ROOT_DIR, 'server', 'data');
const UNIVERSITY_MANIFEST_PATH = path.join(UNIVERSITY_DATA_DIR, 'source-manifest.json');
const UNIVERSITY_TRUST_POLICY_PATH = path.join(UNIVERSITY_DATA_DIR, 'university-trust-policy.json');
const UNIVERSITY_PIPELINE_PATH = path.join(UNIVERSITY_DATA_DIR, 'university-pipeline.json');
const UNIVERSITY_REJECTS_PATH = path.join(UNIVERSITY_DATA_DIR, 'university-rejects.json');

async function readJsonFile(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function writeAdminAuditLog(
  client,
  { action, actorUserId, targetUserId = null, details = {} },
) {
  await client.query(
    `INSERT INTO admin_audit_logs (action, actor_user_id, target_user_id, details)
         VALUES ($1, $2, $3, $4::jsonb)`,
    [action, actorUserId, targetUserId, JSON.stringify(details || {})],
  );
}

function isBlankAdminInput(value) {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function parseAdminIntegerField(
  rawValue,
  fallbackValue,
  { min = 0, max = Number.MAX_SAFE_INTEGER, error },
) {
  if (isBlankAdminInput(rawValue)) {
    return { ok: true, value: fallbackValue };
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { ok: false, error };
  }

  return { ok: true, value: parsed };
}

function normalizeAdminTier(rawValue, fallbackValue) {
  const nextValue = String(rawValue || '').trim();
  const resolved = nextValue || String(fallbackValue || 'BRONZE').trim() || 'BRONZE';
  if (!resolved || resolved.length > 20) {
    return { ok: false, error: '티어는 1~20자 사이여야 합니다.' };
  }

  return { ok: true, value: resolved };
}

function parseAdminScoreField(
  rawValue,
  { label, min, max, required = true, allowDecimal = false },
) {
  const text = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();

  if (!text) {
    if (!required) return { ok: true, value: null };
    return { ok: false, error: `${label}를 입력해주세요.` };
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `${label}는 숫자여야 합니다.` };
  }

  if (!allowDecimal && !Number.isInteger(parsed)) {
    return { ok: false, error: `${label}는 정수여야 합니다.` };
  }

  if (parsed < min || parsed > max) {
    return { ok: false, error: `${label}는 ${min}~${max} 범위여야 합니다.` };
  }

  return { ok: true, value: parsed };
}

function percentileToGrade(percentile) {
  const p = Number(percentile);
  if (!Number.isFinite(p)) return 9;
  if (p >= 96) return 1;
  if (p >= 89) return 2;
  if (p >= 77) return 3;
  if (p >= 60) return 4;
  if (p >= 40) return 5;
  if (p >= 23) return 6;
  if (p >= 11) return 7;
  if (p >= 4) return 8;
  return 9;
}

const requireAdmin = createRequireAdmin(pool, {
  alwaysMainAdminNickname: ALWAYS_MAIN_ADMIN_NICKNAME,
  logLabel: 'admin requireAdmin error',
  serverErrorMessage: '서버 오류',
});

const requireMainAdmin = createRequireMainAdmin(pool, {
  alwaysMainAdminNickname: ALWAYS_MAIN_ADMIN_NICKNAME,
  logLabel: 'admin requireMainAdmin error',
  serverErrorMessage: '서버 오류',
});

module.exports = {
  pool,
  validateNickname,
  readJsonFile,
  writeJsonFile,
  writeAdminAuditLog,
  isBlankAdminInput,
  parseAdminIntegerField,
  normalizeAdminTier,
  parseAdminScoreField,
  percentileToGrade,
  requireAdmin,
  requireMainAdmin,
  ROOT_DIR,
  UNIVERSITY_DATA_DIR,
  UNIVERSITY_MANIFEST_PATH,
  UNIVERSITY_TRUST_POLICY_PATH,
  UNIVERSITY_PIPELINE_PATH,
  UNIVERSITY_REJECTS_PATH,
};
