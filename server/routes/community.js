/**
 * server/routes/community.js
 * 커뮤니티 게시판 API
 *
 * GET  /api/community/posts          - 목록 조회
 * GET  /api/community/posts/hot      - 베스트 (추천 Top 8)
 * POST /api/community/uploads/image  - 이미지 업로드
 * POST /api/community/posts          - 글 작성
 * POST /api/community/posts/:id/view - 조회수 +1
 * POST /api/community/posts/:id/like - 추천 토글 (auth)
 * POST /api/community/posts/:id/gold-like - 골드 추천 +1 (auth)
 * GET  /api/community/posts/:id/comments  - 댓글 목록
 * POST /api/community/posts/:id/comments  - 댓글 작성
 */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const {
  pool,
  requireAuth,
  formatDisplayName,
  imageUpload,
  normalizeProfileImageUrl,
  requireLatestEula,
  requireLatestEulaIfAuthenticated,
  REPORT_REASON_CODES,
} = require('./community/_helpers');

/* ── Sub-routers ─────────────────────────────────────────── */
router.use('/', require('./community/posts'));
router.use('/', require('./community/interactions'));
router.use('/', require('./community/comments'));
router.use('/', require('./community/myActivity'));

/* ════════════════════════════════════════════════════════════ */
/* POST /uploads/image — 커뮤니티 이미지 업로드                */
/* ════════════════════════════════════════════════════════════ */
router.post('/uploads/image', requireLatestEulaIfAuthenticated, (req, res) => {
  imageUpload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.message || '이미지 업로드에 실패했습니다.';
      return res.status(400).json({ error: msg });
    }

    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일을 선택해 주세요.' });
    }

    return res.status(201).json({
      image_url: `/uploads/community/${req.file.filename}`,
      file_name: req.file.originalname,
      size: req.file.size,
    });
  });
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

router.get('/blocks', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ub.blocked_id, u.nickname, ub.created_at
             FROM user_blocks ub
             JOIN users u ON u.id = ub.blocked_id
             WHERE ub.blocker_id = $1
             ORDER BY ub.created_at DESC`,
      [req.session.userId],
    );
    return res.json({ blocks: result.rows });
  } catch (err) {
    console.error('[community] GET /blocks', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/users/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!userId) return res.status(400).json({ error: '잘못된 요청입니다.' });
  const viewerId = parseInt(req.session?.userId, 10) || 0;

  try {
    const result = await pool.query(
      `SELECT id, nickname, university, tier, exp, gold,
                          profile_image_url, status_emoji, status_message,
                    active_title, streak_count, streak_last_date,
                    allow_friend_requests,
                    score_status
             FROM users
             WHERE id = $1`,
      [userId],
    );

    if (!result.rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    const row = result.rows[0];
    const safeUser = {
      id: row.id,
      nickname: row.nickname,
      display_nickname: formatDisplayName(row.nickname, row.active_title),
      university: row.university || '비공개',
      tier: row.tier || '브론즈',
      exp: Number(row.exp || 0),
      gold: Number(row.gold || 0),
      profile_image_url: normalizeProfileImageUrl(row.profile_image_url),
      status_emoji: row.status_emoji || '',
      status_message: row.status_message || '',
      active_title: row.active_title || null,
      streak_count: Number(row.streak_count || 0),
      streak_last_date: row.streak_last_date || null,
      allow_friend_requests: row.allow_friend_requests !== false,
      score_status: row.score_status || null,
    };

    if (viewerId > 0 && viewerId !== userId) {
      const friendshipResult = await pool.query(
        `SELECT id, status,
                        CASE WHEN sender_id = $1 THEN 'sent'
                             WHEN receiver_id = $1 THEN 'received'
                             ELSE NULL END AS friendship_dir
                 FROM friendships
                 WHERE (sender_id = $1 AND receiver_id = $2)
                    OR (sender_id = $2 AND receiver_id = $1)
                 LIMIT 1`,
        [viewerId, userId],
      );

      if (friendshipResult.rows.length > 0) {
        safeUser.friendship_status = friendshipResult.rows[0].status;
        safeUser.friendship_dir = friendshipResult.rows[0].friendship_dir || null;
        safeUser.friendship_id = friendshipResult.rows[0].id;
      } else {
        safeUser.friendship_status = 'none';
        safeUser.friendship_dir = null;
        safeUser.friendship_id = null;
      }
    }

    return res.json({ user: safeUser });
  } catch (err) {
    console.error('[community] GET /users/:userId', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/blocks/:userId', requireAuth, requireLatestEula, async (req, res) => {
  const blockerId = req.session.userId;
  const blockedId = parseInt(req.params.userId, 10);
  if (!blockedId) return res.status(400).json({ error: '잘못된 요청입니다.' });
  if (blockedId === blockerId)
    return res.status(400).json({ error: '자기 자신은 차단할 수 없습니다.' });

  try {
    const exists = await pool.query('SELECT id FROM users WHERE id = $1', [blockedId]);
    if (!exists.rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    await pool.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id)
             VALUES ($1, $2)
             ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [blockerId, blockedId],
    );

    return res.json({ ok: true, blocked_id: blockedId });
  } catch (err) {
    console.error('[community] POST /blocks/:userId', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.delete('/blocks/:userId', requireAuth, async (req, res) => {
  const blockedId = parseInt(req.params.userId, 10);
  if (!blockedId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  try {
    await pool.query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [
      req.session.userId,
      blockedId,
    ]);
    return res.json({ ok: true, blocked_id: blockedId });
  } catch (err) {
    console.error('[community] DELETE /blocks/:userId', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post(
  '/posts/:id/report',
  requireAuth,
  requireLatestEula,
  reportLimiter,
  async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const reporterId = req.session.userId;
    const reasonCode = String(req.body?.reason_code || '').trim();
    const detailRaw = req.body?.detail;
    const detail = typeof detailRaw === 'string' ? detailRaw.trim() : '';

    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (!REPORT_REASON_CODES.has(reasonCode)) {
      return res.status(400).json({ error: '신고 사유가 올바르지 않습니다.' });
    }
    if (detail.length > 500) {
      return res.status(400).json({ error: '신고 상세 내용은 500자 이내로 입력해 주세요.' });
    }

    try {
      const postRes = await pool.query('SELECT id, user_id FROM community_posts WHERE id = $1', [
        postId,
      ]);
      if (!postRes.rows.length) {
        return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
      }

      const reportedUserId = postRes.rows[0].user_id || null;
      if (reportedUserId && reportedUserId === reporterId) {
        return res.status(400).json({ error: '본인 게시글은 신고할 수 없습니다.' });
      }

      await pool.query(
        `INSERT INTO community_post_reports (post_id, reporter_id, reported_user_id, reason_code, detail, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             ON CONFLICT (post_id, reporter_id)
             DO UPDATE SET
                reason_code = EXCLUDED.reason_code,
                detail = EXCLUDED.detail,
                status = 'pending',
                reviewed_at = NULL,
                reviewed_by = NULL,
                created_at = NOW()`,
        [postId, reporterId, reportedUserId, reasonCode, detail || null],
      );

      return res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[community] POST /posts/:id/report', err.message);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  },
);

router.post(
  '/posts/:postId/comments/:commentId/report',
  requireAuth,
  requireLatestEula,
  reportLimiter,
  async (req, res) => {
    const postId = parseInt(req.params.postId, 10);
    const commentId = parseInt(req.params.commentId, 10);
    const reporterId = Number(req.session.userId || 0);
    const reasonCode = String(req.body?.reason_code || '').trim();
    const detailRaw = req.body?.detail;
    const detail = typeof detailRaw === 'string' ? detailRaw.trim() : '';

    if (!postId || !commentId) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (!REPORT_REASON_CODES.has(reasonCode)) {
      return res.status(400).json({ error: '신고 사유가 올바르지 않습니다.' });
    }
    if (detail.length > 500) {
      return res.status(400).json({ error: '신고 상세 내용은 500자 이내로 입력해 주세요.' });
    }

    try {
      const commentRes = await pool.query(
        `SELECT c.id, c.user_id, c.post_id
             FROM community_comments c
             WHERE c.id = $1 AND c.post_id = $2`,
        [commentId, postId],
      );
      if (!commentRes.rows.length) {
        return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
      }

      const reportedUserId = Number(commentRes.rows[0].user_id || 0) || null;
      if (reportedUserId && reportedUserId === reporterId) {
        return res.status(400).json({ error: '본인 댓글은 신고할 수 없습니다.' });
      }

      await pool.query(
        `INSERT INTO community_comment_reports (comment_id, post_id, reporter_id, reported_user_id, reason_code, detail, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')
             ON CONFLICT (comment_id, reporter_id)
             DO UPDATE SET
                reason_code = EXCLUDED.reason_code,
                detail = EXCLUDED.detail,
                status = 'pending',
                reviewed_at = NULL,
                reviewed_by = NULL,
                created_at = NOW()`,
        [commentId, postId, reporterId, reportedUserId, reasonCode, detail || null],
      );

      return res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[community] POST /posts/:postId/comments/:commentId/report', err.message);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  },
);

module.exports = router;
