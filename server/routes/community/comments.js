const router = require('express').Router();
const {
  pool,
  requireAuth,
  requireAdmin,
  formatDisplayName,
  normalizeCommunityNickname,
  normalizeProfileImageUrl,
  requireLatestEula,
  requireLatestEulaIfAuthenticated,
  getIpPrefix,
} = require('./_helpers');

/* ════════════════════════════════════════════════════════════ */
/* GET /posts/:id/comments — 댓글 목록                          */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts/:id/comments', async (req, res) => {
  const postId = parseInt(req.params.id);
  if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  const viewerId = req.session?.userId ? parseInt(req.session.userId, 10) : null;
  const sort = String(req.query.sort || 'latest').trim();
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const orderBy = sort === 'likes' ? 'c.likes_count DESC, c.created_at DESC' : 'c.created_at DESC';

  try {
    const params = [postId];
    let blockedWhere = '';
    if (viewerId) {
      params.push(viewerId);
      blockedWhere = `
                AND (
                    c.user_id IS NULL OR NOT EXISTS (
                        SELECT 1
                        FROM user_blocks ub
                        WHERE ub.blocker_id = $2
                          AND ub.blocked_id = c.user_id
                    )
                )`;
    }

    const countPromise = pool.query(
      `SELECT COUNT(*)::int AS total
             FROM community_comments c
             WHERE c.post_id = $1
             ${blockedWhere}`,
      params,
    );

    const limitPlaceholder = params.length + 1;
    const offsetPlaceholder = params.length + 2;
    const listPromise = pool.query(
      `SELECT c.id, c.user_id, c.nickname, c.ip_prefix, c.body, c.created_at, c.updated_at, c.edit_count,
                    c.likes_count,
                    ${viewerId ? 'EXISTS (SELECT 1 FROM community_comment_likes ccl WHERE ccl.comment_id = c.id AND ccl.user_id = $2) AS is_liked,' : 'FALSE AS is_liked,'}
                    ${viewerId ? 'c.user_id = $2 AS is_mine,' : 'FALSE AS is_mine,'}
                    c.user_id IS NOT NULL AND c.user_id = p.user_id AS is_post_author,
                    u.nickname AS user_nickname, u.active_title,
                    u.profile_image_url,
                    (c.user_id IS NOT NULL AND u.nickname IS NOT NULL AND c.nickname = u.nickname) AS is_verified_nickname
             FROM community_comments c
             JOIN community_posts p ON p.id = c.post_id
             LEFT JOIN users u ON u.id = c.user_id
             WHERE c.post_id = $1
             ${blockedWhere}
             ORDER BY ${orderBy}
             LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`,
      [...params, limit, offset],
    );

    const [countRes, result] = await Promise.all([countPromise, listPromise]);
    const total = Number(countRes.rows[0]?.total || 0);
    const comments = result.rows.map((row) => ({
      ...row,
      profile_image_url: normalizeProfileImageUrl(row.profile_image_url),
      display_nickname: row.user_nickname
        ? formatDisplayName(row.user_nickname, row.active_title)
        : row.nickname,
    }));
    res.json({
      total,
      offset,
      limit,
      has_more: offset + comments.length < total,
      comments,
    });
  } catch (err) {
    console.error('[community] GET /posts/:id/comments', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/comments — 댓글 작성                         */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts/:id/comments', requireLatestEulaIfAuthenticated, async (req, res) => {
  const postId = parseInt(req.params.id);
  const { body } = req.body;

  if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });
  if (!body || !body.trim()) return res.status(400).json({ error: '내용을 입력해 주세요.' });
  if (body.trim().length > 1000)
    return res.status(400).json({ error: '댓글은 1,000자 이내로 입력해 주세요.' });

  const ipPrefix = getIpPrefix(req);
  const guestNickname = normalizeCommunityNickname(req.body?.anonymous_nickname);
  if (guestNickname === null) {
    return res.status(400).json({ error: '익명 닉네임은 2~20자로 입력해 주세요.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let authorUserId = null;
    let nickname = guestNickname || '익명';
    let activeTitle = null;
    let profileImageUrl = '';
    let isVerifiedNickname = false;

    if (req.session.userId) {
      const userRes = await client.query(
        'SELECT id, nickname, active_title, profile_image_url FROM users WHERE id = $1',
        [req.session.userId],
      );
      if (userRes.rows.length) {
        authorUserId = userRes.rows[0].id;
        nickname = userRes.rows[0].nickname;
        activeTitle = userRes.rows[0].active_title;
        profileImageUrl = normalizeProfileImageUrl(userRes.rows[0].profile_image_url);
        isVerifiedNickname = true;
      }
    }

    const result = await client.query(
      `INSERT INTO community_comments (post_id, user_id, body, ip_prefix, nickname)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, user_id, nickname, ip_prefix, body, likes_count, created_at, updated_at`,
      [postId, authorUserId, body.trim(), ipPrefix, nickname],
    );

    await client.query(
      'UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = $1',
      [postId],
    );

    await client.query('COMMIT');
    res.status(201).json({
      comment: {
        ...result.rows[0],
        display_nickname: isVerifiedNickname ? formatDisplayName(nickname, activeTitle) : nickname,
        profile_image_url: profileImageUrl,
        is_verified_nickname: isVerifiedNickname,
        is_liked: false,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[community] POST /posts/:id/comments', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

router.patch(
  '/posts/:postId/comments/:commentId',
  requireAuth,
  requireLatestEula,
  async (req, res) => {
    const postId = parseInt(req.params.postId, 10);
    const commentId = parseInt(req.params.commentId, 10);
    const userId = Number(req.session.userId || 0);
    const bodyRaw = typeof req.body?.body === 'string' ? req.body.body.trim() : '';

    if (!postId || !commentId) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (!bodyRaw) return res.status(400).json({ error: '내용을 입력해 주세요.' });
    if (bodyRaw.length > 1000)
      return res.status(400).json({ error: '댓글은 1,000자 이내로 입력해 주세요.' });

    try {
      const commentRes = await pool.query(
        `SELECT id, user_id
             FROM community_comments
             WHERE id = $1 AND post_id = $2`,
        [commentId, postId],
      );
      if (!commentRes.rows.length) {
        return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
      }

      const ownerId = Number(commentRes.rows[0].user_id || 0);
      if (ownerId !== userId) {
        return res.status(403).json({ error: '수정 권한이 없습니다.' });
      }

      const updated = await pool.query(
        `UPDATE community_comments
             SET body = $1,
                 updated_at = NOW(),
                 edit_count = COALESCE(edit_count, 0) + 1
             WHERE id = $2 AND post_id = $3
             RETURNING id, post_id, body, updated_at, edit_count`,
        [bodyRaw, commentId, postId],
      );

      return res.json({ comment: updated.rows[0] });
    } catch (err) {
      console.error('[community] PATCH /posts/:postId/comments/:commentId', err.message);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  },
);

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:postId/comments/:commentId/like — 댓글 좋아요 토글 */
/* ════════════════════════════════════════════════════════════ */
router.post(
  '/posts/:postId/comments/:commentId/like',
  requireAuth,
  requireLatestEula,
  async (req, res) => {
    const postId = parseInt(req.params.postId, 10);
    const commentId = parseInt(req.params.commentId, 10);
    const userId = req.session.userId;
    if (!postId || !commentId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const commentRes = await client.query(
        `SELECT c.id, c.likes_count, c.user_id AS comment_user_id,
                    p.id AS post_id, p.title AS post_title
             FROM community_comments c
             JOIN community_posts p ON p.id = c.post_id
             WHERE c.id = $1 AND c.post_id = $2
             FOR UPDATE`,
        [commentId, postId],
      );
      if (!commentRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
      }

      const existing = await client.query(
        'SELECT 1 FROM community_comment_likes WHERE comment_id = $1 AND user_id = $2',
        [commentId, userId],
      );

      let liked;
      if (existing.rows.length) {
        await client.query(
          'DELETE FROM community_comment_likes WHERE comment_id = $1 AND user_id = $2',
          [commentId, userId],
        );
        await client.query(
          'UPDATE community_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1',
          [commentId],
        );
        liked = false;
      } else {
        await client.query(
          'INSERT INTO community_comment_likes (comment_id, user_id) VALUES ($1, $2)',
          [commentId, userId],
        );
        await client.query(
          'UPDATE community_comments SET likes_count = likes_count + 1 WHERE id = $1',
          [commentId],
        );
        liked = true;

        const commentOwnerId = Number(commentRes.rows[0]?.comment_user_id || 0);
        if (commentOwnerId > 0 && commentOwnerId !== userId) {
          const rawTitle = String(commentRes.rows[0]?.post_title || '게시글').trim();
          const shortTitle = rawTitle.length > 28 ? `${rawTitle.slice(0, 28)}...` : rawTitle;
          const message = `회원님의 댓글에 공감이 추가됐어요 · ${shortTitle}`;
          await client.query(
            'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
            [commentOwnerId, 'community_like', message],
          );
        }
      }

      const updated = await client.query(
        'SELECT likes_count FROM community_comments WHERE id = $1',
        [commentId],
      );

      await client.query('COMMIT');
      return res.json({ ok: true, liked, likes_count: Number(updated.rows[0]?.likes_count || 0) });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[community] POST /posts/:postId/comments/:commentId/like', err.message);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    } finally {
      client.release();
    }
  },
);

/* ════════════════════════════════════════════════════════════ */
/* DELETE /posts/:postId/comments/:commentId — 관리자 댓글 삭제 */
/* ════════════════════════════════════════════════════════════ */
router.delete('/posts/:postId/comments/:commentId', requireAdmin, async (req, res) => {
  const postId = parseInt(req.params.postId, 10);
  const commentId = parseInt(req.params.commentId, 10);
  if (!postId || !commentId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deleted = await client.query(
      'DELETE FROM community_comments WHERE id = $1 AND post_id = $2 RETURNING id',
      [commentId, postId],
    );

    if (!deleted.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    await client.query(
      'UPDATE community_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1',
      [postId],
    );

    await client.query('COMMIT');
    res.json({ ok: true, deleted_comment_id: commentId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[community] DELETE /posts/:postId/comments/:commentId', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

module.exports = router;
