const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const router = express.Router();

const {
  pool,
  readJsonFile,
  writeJsonFile,
  requireAdmin,
  requireMainAdmin,
  ROOT_DIR,
  UNIVERSITY_MANIFEST_PATH,
  UNIVERSITY_TRUST_POLICY_PATH,
  UNIVERSITY_PIPELINE_PATH,
  UNIVERSITY_REJECTS_PATH,
} = require('./admin/_helpers');

const execFileAsync = promisify(execFile);

// ── Sub-routers ─────────────────────────────────────────────────────────────
router.use(require('./admin/userManagement'));
router.use(require('./admin/scoreVerification'));
router.use(require('./admin/admissionRounds'));

// ── Audit logs ──────────────────────────────────────────────────────────────
router.get('/audit-logs', requireAdmin, async (req, res) => {
  const page = Math.max(0, parseInt(req.query.page, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
  const offset = page * limit;
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
  const keyword = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const params = [];
  const where = [];

  if (action && action !== 'all') {
    params.push(action);
    where.push(`l.action = $${params.length}`);
  }
  if (keyword) {
    params.push(`%${keyword}%`);
    where.push(`(
            CAST(l.actor_user_id AS TEXT) ILIKE $${params.length}
            OR CAST(l.target_user_id AS TEXT) ILIKE $${params.length}
            OR COALESCE(a.nickname, '') ILIKE $${params.length}
            OR COALESCE(t.nickname, '') ILIKE $${params.length}
            OR CAST(l.details AS TEXT) ILIKE $${params.length}
        )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [countRes, listRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)
                 FROM admin_audit_logs l
                 LEFT JOIN users a ON a.id = l.actor_user_id
                 LEFT JOIN users t ON t.id = l.target_user_id
                 ${whereSql}`,
        params,
      ),
      pool.query(
        `SELECT l.id, l.action, l.actor_user_id, l.target_user_id, l.details, l.created_at,
                        a.nickname AS actor_nickname,
                        t.nickname AS target_nickname
                 FROM admin_audit_logs l
                 LEFT JOIN users a ON a.id = l.actor_user_id
                 LEFT JOIN users t ON t.id = l.target_user_id
                 ${whereSql}
                 ORDER BY l.created_at DESC, l.id DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return res.json({
      total: parseInt(countRes.rows[0].count, 10),
      page,
      limit,
      logs: listRes.rows,
    });
  } catch (err) {
    console.error('admin audit-logs error:', err.message);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// ── Community reports ───────────────────────────────────────────────────────
router.get('/community-reports', requireAdmin, async (req, res) => {
  const statusRaw = typeof req.query.status === 'string' ? req.query.status.trim() : 'pending';
  const page = Math.max(0, parseInt(req.query.page, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const offset = page * limit;

  const allowedStatus = new Set(['pending', 'reviewed', 'dismissed', 'all']);
  const status = allowedStatus.has(statusRaw) ? statusRaw : 'pending';

  const params = [];
  let where = '';
  if (status !== 'all') {
    params.push(status);
    where = `WHERE merged.status = $${params.length}`;
  }

  try {
    const [countRes, rowsRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)
                 FROM (
                    SELECT r.id, r.status
                    FROM community_post_reports r
                    UNION ALL
                    SELECT r.id, r.status
                    FROM community_comment_reports r
                 ) merged
                 ${where}`,
        params,
      ),
      pool.query(
        `SELECT merged.id, merged.report_type, merged.post_id, merged.comment_id,
                        merged.reporter_id, merged.reported_user_id,
                        merged.reason_code, merged.detail, merged.status,
                        merged.created_at, merged.reviewed_at, merged.reviewed_by,
                        merged.post_title, merged.comment_body,
                        ru.nickname AS reporter_nickname,
                        tu.nickname AS target_nickname,
                        au.nickname AS reviewed_by_nickname
                 FROM (
                    SELECT r.id,
                           'post'::text AS report_type,
                           r.post_id,
                           NULL::integer AS comment_id,
                           r.reporter_id,
                           r.reported_user_id,
                           r.reason_code,
                           r.detail,
                           r.status,
                           r.created_at,
                           r.reviewed_at,
                           r.reviewed_by,
                           p.title AS post_title,
                           NULL::text AS comment_body
                    FROM community_post_reports r
                    LEFT JOIN community_posts p ON p.id = r.post_id

                    UNION ALL

                    SELECT r.id,
                           'comment'::text AS report_type,
                           r.post_id,
                           r.comment_id,
                           r.reporter_id,
                           r.reported_user_id,
                           r.reason_code,
                           r.detail,
                           r.status,
                           r.created_at,
                           r.reviewed_at,
                           r.reviewed_by,
                           p.title AS post_title,
                           c.body AS comment_body
                    FROM community_comment_reports r
                    LEFT JOIN community_comments c ON c.id = r.comment_id
                    LEFT JOIN community_posts p ON p.id = r.post_id
                 ) merged
                 LEFT JOIN users ru ON ru.id = merged.reporter_id
                 LEFT JOIN users tu ON tu.id = merged.reported_user_id
                 LEFT JOIN users au ON au.id = merged.reviewed_by
                 ${where}
                 ORDER BY
                    CASE WHEN merged.status = 'pending' THEN 0 ELSE 1 END,
                    merged.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return res.json({
      total: parseInt(countRes.rows[0].count, 10),
      page,
      limit,
      status,
      reports: rowsRes.rows,
    });
  } catch (err) {
    console.error('admin community-reports error:', err.message);
    return res.status(500).json({ error: '서버 오류' });
  }
});

async function reviewCommunityReport(req, res, defaultType = '') {
  const reportType = String(req.params.type || defaultType || '').trim();
  const reportId = parseInt(req.params.id, 10);
  const decisionRaw = typeof req.body?.decision === 'string' ? req.body.decision.trim() : '';

  if (!reportId) {
    return res.status(400).json({ error: '신고 ID를 확인해주세요.' });
  }

  const typeMap = {
    post: { table: 'community_post_reports' },
    comment: { table: 'community_comment_reports' },
  };
  const target = typeMap[reportType];
  if (!target) {
    return res.status(400).json({ error: '신고 타입을 확인해주세요.' });
  }

  const decisionMap = {
    reviewed: 'reviewed',
    dismiss: 'dismissed',
    dismissed: 'dismissed',
  };
  const nextStatus = decisionMap[decisionRaw];
  if (!nextStatus) {
    return res.status(400).json({ error: 'decision 값은 reviewed 또는 dismiss 이어야 합니다.' });
  }

  try {
    const result = await pool.query(
      `UPDATE ${target.table}
             SET status = $1,
                 reviewed_at = NOW(),
                 reviewed_by = $2
             WHERE id = $3
             RETURNING id, status, reviewed_at, reviewed_by`,
      [nextStatus, req.session.userId, reportId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: '신고를 찾을 수 없습니다.' });
    }

    return res.json({ ok: true, report: result.rows[0] });
  } catch (err) {
    console.error('admin review report error:', err.message);
    return res.status(500).json({ error: '서버 오류' });
  }
}

router.post('/community-reports/:type/:id/review', requireAdmin, async (req, res) => {
  return reviewCommunityReport(req, res);
});

router.post('/community-reports/:id/review', requireAdmin, async (req, res) => {
  return reviewCommunityReport(req, res, 'post');
});

// ── University data management ──────────────────────────────────────────────
function normalizeTrustPolicy(input = {}) {
  return {
    minConfidence: Number.isFinite(Number(input.minConfidence))
      ? Number(input.minConfidence)
      : 0.75,
    requireYear: input.requireYear !== false,
    requireSourceId: input.requireSourceId !== false,
    requireSourceUrl: input.requireSourceUrl !== false,
    requireAtLeastOneScore: input.requireAtLeastOneScore !== false,
  };
}

async function runUniversityCli(args = []) {
  const scriptPath = path.join(ROOT_DIR, 'scripts', 'university-data-cli.js');
  const { stdout, stderr } = await execFileAsync('node', [scriptPath, ...args], {
    cwd: ROOT_DIR,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    stdout: (stdout || '').trim(),
    stderr: (stderr || '').trim(),
  };
}

async function runUniversityValidate() {
  const scriptPath = path.join(ROOT_DIR, 'scripts', 'validate-university-real-data.js');
  const realPath = path.join(ROOT_DIR, 'server', 'data', 'universities.real.json');
  const { stdout, stderr } = await execFileAsync('node', [scriptPath, realPath], {
    cwd: ROOT_DIR,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 4,
  });
  return {
    stdout: (stdout || '').trim(),
    stderr: (stderr || '').trim(),
  };
}

router.get('/university-data/config', requireAdmin, async (_req, res) => {
  try {
    const [manifest, trustPolicy, pipeline, rejects] = await Promise.all([
      readJsonFile(UNIVERSITY_MANIFEST_PATH, { sources: [] }),
      readJsonFile(UNIVERSITY_TRUST_POLICY_PATH, normalizeTrustPolicy()),
      readJsonFile(UNIVERSITY_PIPELINE_PATH, { sources: [], records: [] }),
      readJsonFile(UNIVERSITY_REJECTS_PATH, { totalRejected: 0, rejects: [] }),
    ]);

    return res.json({
      manifest,
      trustPolicy,
      summary: {
        sourceCount: Array.isArray(manifest?.sources) ? manifest.sources.length : 0,
        enabledSourceCount: Array.isArray(manifest?.sources)
          ? manifest.sources.filter((s) => s && s.enabled !== false).length
          : 0,
        pipelineSourceCount: Array.isArray(pipeline?.sources) ? pipeline.sources.length : 0,
        recordCount: Array.isArray(pipeline?.records) ? pipeline.records.length : 0,
        rejectedCount: Number.isFinite(Number(rejects?.totalRejected))
          ? Number(rejects.totalRejected)
          : 0,
        pipelineUpdatedAt: pipeline?.updatedAt || null,
      },
    });
  } catch (err) {
    console.error('admin university-data config error:', err.message);
    return res.status(500).json({ error: '대학 데이터 설정을 불러오지 못했습니다.' });
  }
});

router.post('/university-data/config', requireMainAdmin, async (req, res) => {
  const manifest = req.body?.manifest;
  const trustPolicyRaw = req.body?.trustPolicy;

  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.sources)) {
    return res.status(400).json({ error: 'manifest.sources 배열이 필요합니다.' });
  }

  const trustPolicy = normalizeTrustPolicy(trustPolicyRaw || {});
  if (
    !Number.isFinite(trustPolicy.minConfidence) ||
    trustPolicy.minConfidence < 0 ||
    trustPolicy.minConfidence > 1
  ) {
    return res.status(400).json({ error: 'minConfidence는 0~1 사이여야 합니다.' });
  }

  try {
    await Promise.all([
      writeJsonFile(UNIVERSITY_MANIFEST_PATH, {
        ...manifest,
        updatedAt: new Date().toISOString().slice(0, 10),
      }),
      writeJsonFile(UNIVERSITY_TRUST_POLICY_PATH, trustPolicy),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('admin university-data config save error:', err.message);
    return res.status(500).json({ error: '대학 데이터 설정 저장에 실패했습니다.' });
  }
});

router.post('/university-data/collect', requireMainAdmin, async (req, res) => {
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  const dryRun = req.body?.dryRun === true;
  const args = ['collect'];
  if (source) args.push('--source', source);
  if (dryRun) args.push('--dryRun', 'true');

  try {
    const result = await runUniversityCli(args);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('admin university-data collect error:', err.message);
    return res.status(500).json({ error: err.message || 'collect 실행 실패' });
  }
});

router.post('/university-data/export', requireMainAdmin, async (req, res) => {
  const allowUntrusted = req.body?.allowUntrusted === true;
  const args = ['export-real'];
  if (allowUntrusted) args.push('--allowUntrusted', 'true');

  try {
    const result = await runUniversityCli(args);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('admin university-data export error:', err.message);
    return res.status(500).json({ error: err.message || 'export 실행 실패' });
  }
});

router.post('/university-data/report', requireAdmin, async (_req, res) => {
  try {
    const result = await runUniversityCli(['quality-report']);
    let parsed = null;
    try {
      parsed = result.stdout ? JSON.parse(result.stdout) : null;
    } catch {
      parsed = null;
    }
    return res.json({ ok: true, ...result, report: parsed });
  } catch (err) {
    console.error('admin university-data report error:', err.message);
    return res.status(500).json({ error: err.message || 'report 실행 실패' });
  }
});

router.post('/university-data/validate', requireAdmin, async (_req, res) => {
  try {
    const result = await runUniversityValidate();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('admin university-data validate error:', err.message);
    return res.status(500).json({ error: err.message || 'validate 실행 실패' });
  }
});

module.exports = router;
