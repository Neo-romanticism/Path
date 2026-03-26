const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { pool, requireAuth, requireLatestEula, GOLD_LIKE_COST } = require('./_helpers');

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/view — 조회수 +1                             */
/* ════════════════════════════════════════════════════════════ */
const viewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
});

router.post('/posts/:id/view', viewLimiter, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 요청입니다.' });

  try {
    await pool.query('UPDATE community_posts SET views = views + 1 WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[community] POST /posts/:id/view', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/like — 추천 토글                             */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts/:id/like', requireAuth, requireLatestEula, async (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.session.userId;
  if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT 1 FROM community_likes WHERE post_id = $1 AND user_id = $2',
      [postId, userId],
    );

    let liked;
    if (existing.rows.length) {
      // 취소
      await client.query('DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2', [
        postId,
        userId,
      ]);
      await client.query(
        'UPDATE community_posts SET likes = GREATEST(0, likes - 1) WHERE id = $1',
        [postId],
      );
      liked = false;
    } else {
      // 추천
      await client.query('INSERT INTO community_likes (post_id, user_id) VALUES ($1, $2)', [
        postId,
        userId,
      ]);
      await client.query('UPDATE community_posts SET likes = likes + 1 WHERE id = $1', [postId]);
      liked = true;
    }

    const updated = await client.query('SELECT likes FROM community_posts WHERE id = $1', [postId]);
    await client.query('COMMIT');

    res.json({ liked, likes: updated.rows[0]?.likes ?? 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[community] POST /posts/:id/like', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/gold-like — 골드 추천(+1)                    */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts/:id/gold-like', requireAuth, requireLatestEula, async (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.session.userId;
  if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const postRes = await client.query(
      'SELECT id, likes FROM community_posts WHERE id = $1 FOR UPDATE',
      [postId],
    );
    if (!postRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const userRes = await client.query('SELECT gold FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!userRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const myGold = Number(userRes.rows[0].gold || 0);
    if (myGold < GOLD_LIKE_COST) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `골드가 부족합니다. 필요: ${GOLD_LIKE_COST}G` });
    }

    const spentRes = await client.query(
      `UPDATE users
             SET gold = gold - $1
             WHERE id = $2
             RETURNING gold`,
      [GOLD_LIKE_COST, userId],
    );

    const likeRes = await client.query(
      `UPDATE community_posts
             SET likes = likes + 1
             WHERE id = $1
             RETURNING likes`,
      [postId],
    );

    await client.query('COMMIT');
    return res.json({
      ok: true,
      cost: GOLD_LIKE_COST,
      likes: likeRes.rows[0]?.likes ?? 0,
      remainingGold: spentRes.rows[0]?.gold ?? 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[community] POST /posts/:id/gold-like', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/bookmark — 북마크 토글                        */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts/:id/bookmark', requireAuth, requireLatestEula, async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const userId = req.session.userId;
  if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const postRes = await client.query('SELECT id FROM community_posts WHERE id = $1', [postId]);
    if (!postRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const existing = await client.query(
      'SELECT 1 FROM community_bookmarks WHERE post_id = $1 AND user_id = $2',
      [postId, userId],
    );

    let bookmarked;
    if (existing.rows.length) {
      await client.query('DELETE FROM community_bookmarks WHERE post_id = $1 AND user_id = $2', [
        postId,
        userId,
      ]);
      bookmarked = false;
    } else {
      await client.query('INSERT INTO community_bookmarks (post_id, user_id) VALUES ($1, $2)', [
        postId,
        userId,
      ]);
      bookmarked = true;
    }

    await client.query('COMMIT');
    return res.json({ ok: true, bookmarked });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[community] POST /posts/:id/bookmark', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

module.exports = router;
