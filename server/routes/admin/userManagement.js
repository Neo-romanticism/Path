const express = require('express');
const router = express.Router();
const {
  pool,
  validateNickname,
  writeAdminAuditLog,
  parseAdminIntegerField,
  normalizeAdminTier,
  requireAdmin,
  requireMainAdmin,
} = require('./_helpers');

// 관리자 API 상태
router.get('/', requireAdmin, (req, res) => {
  res.json({
    ok: true,
    service: 'admin-api',
    admin_role: req.adminRole,
    message: '관리자 API가 정상 동작 중입니다.',
    endpoints: [
      'GET /api/admin/pending',
      'GET /api/admin/all-users',
      'GET /api/admin/roles',
      'GET /api/admin/audit-logs',
      'GET /api/admin/community-reports',
      'GET /api/admin/university-data/config',
      'POST /api/admin/update-user',
      'POST /api/admin/university-data/config (main only)',
      'POST /api/admin/university-data/collect (main only)',
      'POST /api/admin/university-data/export (main only)',
      'POST /api/admin/university-data/report',
      'POST /api/admin/university-data/validate',
      'POST /api/admin/set-role (main only)',
      'POST /api/admin/approve-score',
      'POST /api/admin/reject-score',
      'POST /api/admin/approve-gpa',
      'POST /api/admin/reject-gpa',
      'POST /api/admin/community-reports/:id/review',
    ],
  });
});

// 전체 유저 목록
router.get('/all-users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nickname, real_name, university, prev_university, is_n_su,
                    gold, diamond, exp, tier, tickets, score_status,
                    score_image_url, gpa_score, gpa_status, gpa_image_url, gpa_public,
                    is_admin, admin_role, user_code, created_at
             FROM users ORDER BY created_at DESC`,
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

// 유저 정보 수정
router.post('/update-user', requireAdmin, async (req, res) => {
  const isMainAdmin = req.adminRole === 'main';
  const userId = parseInt(req.body?.user_id, 10);
  const nicknameRaw = typeof req.body?.nickname === 'string' ? req.body.nickname : '';
  const realNameRaw = typeof req.body?.real_name === 'string' ? req.body.real_name : '';
  const universityRaw = typeof req.body?.university === 'string' ? req.body.university : '';
  const isNSu =
    req.body?.is_n_su === true ||
    req.body?.is_n_su === 'true' ||
    req.body?.is_n_su === 1 ||
    req.body?.is_n_su === '1';
  const prevUniversityRaw =
    typeof req.body?.prev_university === 'string' ? req.body.prev_university : '';
  const goldRaw = req.body?.gold;
  const diamondRaw = req.body?.diamond;
  const expRaw = req.body?.exp;
  const tierRaw = typeof req.body?.tier === 'string' ? req.body.tier : '';
  const ticketsRaw = req.body?.tickets;
  const gpaScoreRaw = req.body?.gpa_score;
  const gpaPublic =
    req.body?.gpa_public === true ||
    req.body?.gpa_public === 'true' ||
    req.body?.gpa_public === 1 ||
    req.body?.gpa_public === '1';

  if (!userId) {
    return res.status(400).json({ error: '유저 ID를 확인해주세요.' });
  }

  const nickValidation = validateNickname(nicknameRaw);
  if (!nickValidation.ok) {
    return res.status(400).json({ error: nickValidation.error });
  }

  const realName = realNameRaw.trim();
  if (!realName) {
    return res.status(400).json({ error: '실명을 입력해주세요.' });
  }
  if (realName.length > 50) {
    return res.status(400).json({ error: '실명은 50자 이하여야 합니다.' });
  }

  const university = universityRaw.trim();
  if (university.length > 100) {
    return res.status(400).json({ error: '대학교명은 100자 이하여야 합니다.' });
  }

  const prevUniversity = prevUniversityRaw.trim();
  if (isNSu && !prevUniversity) {
    return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });
  }
  if (prevUniversity.length > 100) {
    return res.status(400).json({ error: '전적 대학교명은 100자 이하여야 합니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const target = await client.query(
      `SELECT id, is_admin, admin_role,
                    gold, diamond, exp, tier, tickets, gpa_score, gpa_public
             FROM users WHERE id = $1`,
      [userId],
    );
    if (!target.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
    }
    const targetUser = target.rows[0];

    const targetRole =
      targetUser.admin_role === 'main' || targetUser.admin_role === 'sub'
        ? targetUser.admin_role
        : targetUser.is_admin
          ? 'sub'
          : 'none';
    if (!isMainAdmin && targetRole !== 'none') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: '부관리자는 관리자 계정을 수정할 수 없습니다.' });
    }

    let gold = targetUser.gold;
    let diamond = targetUser.diamond;
    let exp = targetUser.exp;
    let tier = targetUser.tier;
    let tickets = targetUser.tickets;
    let gpaScore = targetUser.gpa_score;
    let nextGpaPublic = targetUser.gpa_public;

    const goldResult = parseAdminIntegerField(goldRaw, targetUser.gold, {
      min: 0,
      error: '골드는 0 이상의 정수여야 합니다.',
    });
    if (!goldResult.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: goldResult.error });
    }
    gold = goldResult.value;

    if (isMainAdmin) {
      const diamondResult = parseAdminIntegerField(diamondRaw, targetUser.diamond, {
        min: 0,
        error: '다이아는 0 이상의 정수여야 합니다.',
      });
      if (!diamondResult.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: diamondResult.error });
      }
      diamond = diamondResult.value;

      const expResult = parseAdminIntegerField(expRaw, targetUser.exp, {
        min: 0,
        error: 'EXP는 0 이상의 정수여야 합니다.',
      });
      if (!expResult.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: expResult.error });
      }
      exp = expResult.value;

      const tierResult = normalizeAdminTier(tierRaw, targetUser.tier);
      if (!tierResult.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: tierResult.error });
      }
      tier = tierResult.value;

      const ticketsResult = parseAdminIntegerField(ticketsRaw, targetUser.tickets, {
        min: 0,
        error: '티켓은 0 이상의 정수여야 합니다.',
      });
      if (!ticketsResult.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: ticketsResult.error });
      }
      tickets = ticketsResult.value;

      const gpaScoreText =
        gpaScoreRaw === null || gpaScoreRaw === undefined ? '' : String(gpaScoreRaw).trim();
      gpaScore = null;
      if (gpaScoreText) {
        gpaScore = parseFloat(gpaScoreText);
        if (!Number.isFinite(gpaScore) || gpaScore < 1.0 || gpaScore > 9.0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: '내신은 1.0~9.0 범위로 입력해주세요.' });
        }
      }

      nextGpaPublic = gpaPublic;
    }

    const duplicate = await client.query('SELECT id FROM users WHERE nickname = $1 AND id <> $2', [
      nickValidation.value,
      userId,
    ]);
    if (duplicate.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
    }

    const result = await client.query(
      `UPDATE users
             SET nickname = $1,
                 real_name = $2,
                 university = $3,
                 is_n_su = $4,
                 prev_university = $5,
                 gold = $6,
                 diamond = $7,
                 exp = $8,
                 tier = $9,
                 tickets = $10,
                 gpa_score = $11,
                 gpa_public = $12
             WHERE id = $13
             RETURNING id, nickname, real_name, university, is_n_su, prev_university,
                       gold, diamond, exp, tier, tickets, gpa_score, gpa_public,
                       is_admin, admin_role, user_code, created_at`,
      [
        nickValidation.value,
        realName,
        university || null,
        isNSu,
        isNSu ? prevUniversity : null,
        gold,
        diamond,
        exp,
        tier,
        tickets,
        gpaScore,
        nextGpaPublic,
        userId,
      ],
    );

    const updatedUser = result.rows[0];
    await writeAdminAuditLog(client, {
      action: 'admin.update_user',
      actorUserId: req.session.userId,
      targetUserId: userId,
      details: {
        actor_role: req.adminRole,
        before: {
          gold: targetUser.gold,
          diamond: targetUser.diamond,
          exp: targetUser.exp,
          tier: targetUser.tier,
          tickets: targetUser.tickets,
          gpa_score: targetUser.gpa_score,
          gpa_public: targetUser.gpa_public,
        },
        after: {
          gold: updatedUser.gold,
          diamond: updatedUser.diamond,
          exp: updatedUser.exp,
          tier: updatedUser.tier,
          tickets: updatedUser.tickets,
          gpa_score: updatedUser.gpa_score,
          gpa_public: updatedUser.gpa_public,
        },
      },
    });

    await client.query('COMMIT');

    return res.json({ ok: true, user: updatedUser });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('admin update-user error:', err.message);
    return res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

// 관리자 역할 목록
router.get('/roles', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nickname, is_admin,
                    CASE
                        WHEN admin_role IN ('main', 'sub') THEN admin_role
                        WHEN is_admin = TRUE THEN 'sub'
                        ELSE 'none'
                    END AS admin_role
             FROM users
             WHERE is_admin = TRUE OR admin_role IN ('main', 'sub')
             ORDER BY
                 CASE
                     WHEN admin_role = 'main' THEN 0
                     WHEN admin_role = 'sub' THEN 1
                     ELSE 2
                 END,
                 id ASC`,
    );
    res.json({ admins: result.rows });
  } catch (err) {
    console.error('admin roles error:', err.message);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 관리자 역할 설정
router.post('/set-role', requireMainAdmin, async (req, res) => {
  const { user_id, role } = req.body;
  const userId = parseInt(user_id, 10);
  const nextRole = typeof role === 'string' ? role.trim() : '';
  const validRoles = new Set(['none', 'sub', 'main']);

  if (!userId || !validRoles.has(nextRole)) {
    return res.status(400).json({ error: 'user_id와 role(none|sub|main)을 확인해주세요.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const targetRes = await client.query(
      'SELECT id, nickname, is_admin, admin_role FROM users WHERE id = $1',
      [userId],
    );
    if (!targetRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
    }
    const before = targetRes.rows[0];

    if (userId === req.session.userId && nextRole !== 'main') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '본인 계정은 main 역할로만 설정할 수 있습니다.' });
    }

    if (nextRole === 'main') {
      await client.query(
        `UPDATE users
                 SET admin_role = 'sub', is_admin = TRUE
                 WHERE admin_role = 'main' AND id <> $1`,
        [userId],
      );
    }

    const updated = await client.query(
      `UPDATE users
             SET admin_role = $1,
                 is_admin = CASE WHEN $1 IN ('main', 'sub') THEN TRUE ELSE FALSE END
             WHERE id = $2
             RETURNING id, nickname, is_admin, admin_role`,
      [nextRole, userId],
    );

    await writeAdminAuditLog(client, {
      action: 'admin.set_role',
      actorUserId: req.session.userId,
      targetUserId: userId,
      details: {
        before: {
          is_admin: before.is_admin,
          admin_role: before.admin_role,
        },
        after: {
          is_admin: updated.rows[0].is_admin,
          admin_role: updated.rows[0].admin_role,
        },
      },
    });

    await client.query('COMMIT');

    res.json({ ok: true, user: updated.rows[0] });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('admin set-role error:', err.message);
    res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

module.exports = router;
