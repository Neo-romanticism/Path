const router = require('express').Router();
const { pool, requireAuth, VALID_CATS } = require('./_helpers');

function parseActivityFilters(req) {
  const rawCategory = String(req.query.category || '').trim();
  const category = VALID_CATS.has(rawCategory) ? rawCategory : '';

  const daysRaw = parseInt(req.query.days, 10);
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 0;

  const q = String(req.query.q || '')
    .trim()
    .slice(0, 100);

  return { category, days, q };
}

function appendActivityFilters(conds, params, filters, opts = {}) {
  const categoryColumn = opts.categoryColumn;
  const dateColumn = opts.dateColumn;
  const textColumns = Array.isArray(opts.textColumns) ? opts.textColumns : [];

  if (filters.category && categoryColumn) {
    params.push(filters.category);
    conds.push(`${categoryColumn} = $${params.length}`);
  }

  if (filters.days > 0 && dateColumn) {
    params.push(filters.days);
    conds.push(`${dateColumn} >= NOW() - ($${params.length}::int * INTERVAL '1 day')`);
  }

  if (filters.q && textColumns.length > 0) {
    params.push(`%${filters.q}%`);
    const placeholder = `$${params.length}`;
    conds.push(`(${textColumns.map((col) => `${col} ILIKE ${placeholder}`).join(' OR ')})`);
  }
}

/* ════════════════════════════════════════════════════════════ */
/* GET /me/summary — 내 커뮤니티 활동 요약                     */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/summary', requireAuth, async (req, res) => {
  const userId = req.session.userId;

  try {
    const result = await pool.query(
      `SELECT
                (SELECT COUNT(*)::int FROM community_posts WHERE user_id = $1) AS posts_count,
                (SELECT COUNT(*)::int FROM community_comments WHERE user_id = $1) AS comments_count,
                (SELECT COALESCE(SUM(likes), 0)::int FROM community_posts WHERE user_id = $1) AS received_likes,
                (SELECT COUNT(*)::int FROM community_likes WHERE user_id = $1) AS liked_posts_count,
                                (SELECT COUNT(*)::int FROM community_bookmarks WHERE user_id = $1) AS bookmarks_count,
                (SELECT COUNT(*)::int FROM community_comment_likes WHERE user_id = $1) AS liked_comments_count,
                                (SELECT COUNT(*)::int FROM community_posts WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days') AS weekly_posts_count,
                                (SELECT COUNT(*)::int FROM community_comments WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days') AS weekly_comments_count,
                                (SELECT cp.category
                                     FROM community_posts cp
                                    WHERE cp.user_id = $1
                                        AND cp.created_at >= NOW() - INTERVAL '7 days'
                                    GROUP BY cp.category
                                    ORDER BY COUNT(*) DESC, MAX(cp.created_at) DESC
                                    LIMIT 1) AS top_category_7d`,
      [userId],
    );

    const row = result.rows[0] || {};
    return res.json({
      summary: {
        posts_count: Number(row.posts_count || 0),
        comments_count: Number(row.comments_count || 0),
        received_likes: Number(row.received_likes || 0),
        liked_posts_count: Number(row.liked_posts_count || 0),
        bookmarks_count: Number(row.bookmarks_count || 0),
        liked_comments_count: Number(row.liked_comments_count || 0),
        weekly_posts_count: Number(row.weekly_posts_count || 0),
        weekly_comments_count: Number(row.weekly_comments_count || 0),
        top_category_7d: row.top_category_7d || '',
      },
    });
  } catch (err) {
    console.error('[community] GET /me/summary', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/posts — 내가 작성한 게시글 목록                      */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/posts', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const filters = parseActivityFilters(req);

  try {
    const params = [userId];
    const conds = ['user_id = $1'];
    appendActivityFilters(conds, params, filters, {
      categoryColumn: 'category',
      dateColumn: 'created_at',
      textColumns: ['title', 'body'],
    });
    const where = `WHERE ${conds.join(' AND ')}`;

    const [countRes, listRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM community_posts ${where}`, params),
      pool.query(
        `SELECT id, category, title, likes, comments_count, views, created_at,
                        (image_url IS NOT NULL AND image_url <> '') AS has_image
                 FROM community_posts
                 ${where}
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    const total = Number(countRes.rows[0]?.total || 0);
    const posts = listRes.rows || [];
    return res.json({
      total,
      offset,
      limit,
      has_more: offset + posts.length < total,
      posts,
    });
  } catch (err) {
    console.error('[community] GET /me/posts', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/comments — 내가 작성한 댓글 목록                      */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/comments', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const filters = parseActivityFilters(req);

  try {
    const params = [userId];
    const conds = ['c.user_id = $1'];
    appendActivityFilters(conds, params, filters, {
      categoryColumn: 'p.category',
      dateColumn: 'c.created_at',
      textColumns: ['c.body', 'p.title'],
    });
    const where = `WHERE ${conds.join(' AND ')}`;

    const [countRes, listRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
                 FROM community_comments c
                 JOIN community_posts p ON p.id = c.post_id
                 ${where}`,
        params,
      ),
      pool.query(
        `SELECT c.id, c.post_id, c.body, c.created_at,
                        p.title AS post_title, p.category AS post_category
                 FROM community_comments c
                 JOIN community_posts p ON p.id = c.post_id
                 ${where}
                 ORDER BY c.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    const total = Number(countRes.rows[0]?.total || 0);
    const comments = listRes.rows || [];
    return res.json({
      total,
      offset,
      limit,
      has_more: offset + comments.length < total,
      comments,
    });
  } catch (err) {
    console.error('[community] GET /me/comments', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/liked-posts — 내가 추천한 게시글 목록                */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/liked-posts', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const filters = parseActivityFilters(req);

  try {
    const params = [userId];
    const conds = ['cl.user_id = $1'];
    appendActivityFilters(conds, params, filters, {
      categoryColumn: 'p.category',
      dateColumn: 'cl.created_at',
      textColumns: ['p.title', 'p.body'],
    });
    const where = `WHERE ${conds.join(' AND ')}`;

    const [countRes, listRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
                 FROM community_likes cl
                 JOIN community_posts p ON p.id = cl.post_id
                 ${where}`,
        params,
      ),
      pool.query(
        `SELECT p.id, p.category, p.title, p.likes, p.comments_count, p.views, p.created_at,
                        cl.created_at AS liked_at,
                        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image
                 FROM community_likes cl
                 JOIN community_posts p ON p.id = cl.post_id
                 ${where}
                 ORDER BY cl.created_at DESC, p.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    const total = Number(countRes.rows[0]?.total || 0);
    const posts = listRes.rows || [];
    return res.json({
      total,
      offset,
      limit,
      has_more: offset + posts.length < total,
      posts,
    });
  } catch (err) {
    console.error('[community] GET /me/liked-posts', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/bookmarks — 내가 북마크한 게시글 목록                */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/bookmarks', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const filters = parseActivityFilters(req);

  try {
    const params = [userId];
    const conds = ['cb.user_id = $1'];
    appendActivityFilters(conds, params, filters, {
      categoryColumn: 'p.category',
      dateColumn: 'cb.created_at',
      textColumns: ['p.title', 'p.body'],
    });
    const where = `WHERE ${conds.join(' AND ')}`;

    const [countRes, listRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
                 FROM community_bookmarks cb
                 JOIN community_posts p ON p.id = cb.post_id
                 ${where}`,
        params,
      ),
      pool.query(
        `SELECT p.id, p.category, p.title, p.likes, p.comments_count, p.views, p.created_at,
                        cb.created_at AS bookmarked_at,
                        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image
                 FROM community_bookmarks cb
                 JOIN community_posts p ON p.id = cb.post_id
                 ${where}
                 ORDER BY cb.created_at DESC, p.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    const total = Number(countRes.rows[0]?.total || 0);
    const posts = listRes.rows || [];
    return res.json({
      total,
      offset,
      limit,
      has_more: offset + posts.length < total,
      posts,
    });
  } catch (err) {
    console.error('[community] GET /me/bookmarks', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/liked-comments — 내가 공감한 댓글 목록               */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/liked-comments', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const filters = parseActivityFilters(req);

  try {
    const params = [userId];
    const conds = ['ccl.user_id = $1'];
    appendActivityFilters(conds, params, filters, {
      categoryColumn: 'p.category',
      dateColumn: 'ccl.created_at',
      textColumns: ['c.body', 'p.title'],
    });
    const where = `WHERE ${conds.join(' AND ')}`;

    const [countRes, listRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
                 FROM community_comment_likes ccl
                 JOIN community_comments c ON c.id = ccl.comment_id
                 JOIN community_posts p ON p.id = c.post_id
                 ${where}`,
        params,
      ),
      pool.query(
        `SELECT c.id AS comment_id,
                        c.post_id,
                        c.body,
                        c.created_at AS comment_created_at,
                        c.likes_count,
                        p.title AS post_title,
                        p.category AS post_category,
                        ccl.created_at AS liked_at
                 FROM community_comment_likes ccl
                 JOIN community_comments c ON c.id = ccl.comment_id
                 JOIN community_posts p ON p.id = c.post_id
                 ${where}
                 ORDER BY ccl.created_at DESC, c.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    const total = Number(countRes.rows[0]?.total || 0);
    const comments = listRes.rows || [];
    return res.json({
      total,
      offset,
      limit,
      has_more: offset + comments.length < total,
      comments,
    });
  } catch (err) {
    console.error('[community] GET /me/liked-comments', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* DELETE /me/posts/:id — 내 게시글 삭제                         */
/* ════════════════════════════════════════════════════════════ */
router.delete('/me/posts/:id', requireAuth, async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const userId = req.session.userId;
  if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  try {
    const deleted = await pool.query(
      'DELETE FROM community_posts WHERE id = $1 AND user_id = $2 RETURNING id',
      [postId, userId],
    );

    if (!deleted.rows.length) {
      return res.status(404).json({ error: '내가 작성한 게시글을 찾을 수 없습니다.' });
    }

    return res.json({ ok: true, deleted_post_id: postId });
  } catch (err) {
    console.error('[community] DELETE /me/posts/:id', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* DELETE /me/comments/:id — 내 댓글 삭제                        */
/* ════════════════════════════════════════════════════════════ */
router.delete('/me/comments/:id', requireAuth, async (req, res) => {
  const commentId = parseInt(req.params.id, 10);
  const userId = req.session.userId;
  if (!commentId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deleted = await client.query(
      `DELETE FROM community_comments
             WHERE id = $1 AND user_id = $2
             RETURNING id, post_id`,
      [commentId, userId],
    );

    if (!deleted.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '내가 작성한 댓글을 찾을 수 없습니다.' });
    }

    const postId = deleted.rows[0].post_id;
    await client.query(
      'UPDATE community_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1',
      [postId],
    );

    await client.query('COMMIT');
    return res.json({ ok: true, deleted_comment_id: commentId, post_id: postId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[community] DELETE /me/comments/:id', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

module.exports = router;
