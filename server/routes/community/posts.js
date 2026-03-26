const router = require('express').Router();
const {
  pool,
  requireAuth,
  getAdminRole,
  formatDisplayName,
  normalizeCommunityNickname,
  normalizeProfileImageUrl,
  requireLatestEula,
  requireLatestEulaIfAuthenticated,
  makeBlockedPostCondition,
  getIpPrefix,
  VALID_CATS,
  WRITABLE_CATS,
  BEST_MIN_LIKES,
} = require('./_helpers');

// SSRF 방어: 내부 IP/호스트네임 블랙리스트
const SSRF_BLOCKED_PATTERN =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|::1|fc00:|fd)/i;

function normalizeOptionalHttpUrl(raw, maxLength = 1000) {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length > maxLength) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  // SSRF 방어: 내부 주소 차단
  const hostname = parsed.hostname;
  if (SSRF_BLOCKED_PATTERN.test(hostname)) return null;

  return parsed.toString();
}

function normalizeOptionalImageUrl(raw) {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return '';

  // 내부 업로드 경로 허용
  if (/^\/uploads\/community\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }

  return normalizeOptionalHttpUrl(trimmed);
}

/* ════════════════════════════════════════════════════════════ */
/* GET /posts — 목록 조회                                        */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts', async (req, res) => {
  const page = Math.max(0, parseInt(req.query.page) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 25));
  const cat = req.query.category || '전체';
  const sort = String(req.query.sort || 'latest').trim();
  const q = (req.query.q || '').trim();
  const offset = page * limit;

  const params = [];
  const conds = [];

  if (cat === '념글') {
    params.push(BEST_MIN_LIKES);
    conds.push(`likes >= $${params.length}`);
  } else if (cat !== '전체' && VALID_CATS.has(cat)) {
    params.push(cat);
    conds.push(`category = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conds.push(`(title ILIKE $${params.length} OR body ILIKE $${params.length})`);
  }

  const viewerId = req.session?.userId ? parseInt(req.session.userId, 10) : null;
  const blockedCond = makeBlockedPostCondition(viewerId, params.length + 1, 'p');
  if (blockedCond.sql) {
    conds.push(blockedCond.sql);
    params.push(...blockedCond.params);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const whereWithAlias = where
    .replace(/\btitle\b/g, 'p.title')
    .replace(/\bbody\b/g, 'p.body')
    .replace(/\blikes\b/g, 'p.likes')
    .replace(/\bcategory\b/g, 'p.category');

  const orderByMap = {
    latest: 'p.created_at DESC',
    likes: 'p.likes DESC, p.created_at DESC',
    views: 'p.views DESC, p.created_at DESC',
  };
  const orderBy = orderByMap[sort] || orderByMap.latest;
  const viewerPlaceholder = params.length + 1;
  const limitPlaceholder = params.length + (viewerId ? 2 : 1);
  const offsetPlaceholder = params.length + (viewerId ? 3 : 2);
  const viewerSelect = viewerId
    ? `EXISTS (SELECT 1 FROM community_bookmarks cb WHERE cb.post_id = p.id AND cb.user_id = $${viewerPlaceholder}) AS is_bookmarked,
           EXISTS (SELECT 1 FROM community_likes cl WHERE cl.post_id = p.id AND cl.user_id = $${viewerPlaceholder}) AS is_liked`
    : `FALSE AS is_bookmarked,
           FALSE AS is_liked`;
  const listParams = viewerId ? [...params, viewerId, limit, offset] : [...params, limit, offset];

  try {
    const [cntRes, postsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM community_posts p ${whereWithAlias}`, params),
      pool.query(
        `SELECT p.id, p.category, p.title, p.nickname, p.ip_prefix,
                        p.user_id,
                        u.nickname AS user_nickname, u.active_title,
                        u.profile_image_url,
                    (p.user_id IS NOT NULL AND u.nickname IS NOT NULL AND p.nickname = u.nickname) AS is_verified_nickname,
                        p.views, p.likes, p.comments_count, p.created_at,
                        p.image_url,
                        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image,
                        ${viewerSelect}
                 FROM community_posts p
                 LEFT JOIN users u ON u.id = p.user_id
                 ${whereWithAlias}
                 ORDER BY ${orderBy}
                 LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`,
        listParams,
      ),
    ]);
    const posts = postsRes.rows.map((row) => {
      const displayNickname = row.active_title
        ? formatDisplayName(row.nickname, row.active_title)
        : row.nickname;
      return {
        ...row,
        profile_image_url: normalizeProfileImageUrl(row.profile_image_url),
        display_nickname: displayNickname,
      };
    });

    res.json({ total: parseInt(cntRes.rows[0].count), posts });
  } catch (err) {
    console.error('[community] GET /posts', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /posts/hot — 베스트 게시글 (추천 Top 8)                  */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts/hot', async (req, res) => {
  const cat = req.query.category || '전체';
  const params = [];
  const conds = [`likes >= ${BEST_MIN_LIKES}`];

  if (cat !== '전체' && cat !== '념글' && VALID_CATS.has(cat)) {
    params.push(cat);
    conds.push(`category = $${params.length}`);
  }

  const viewerId = req.session?.userId ? parseInt(req.session.userId, 10) : null;
  const blockedCond = makeBlockedPostCondition(viewerId, params.length + 1, 'p');
  if (blockedCond.sql) {
    conds.push(blockedCond.sql);
    params.push(...blockedCond.params);
  }

  const where = `WHERE ${conds.join(' AND ')}`;

  try {
    const result = await pool.query(
      `SELECT p.id, p.category, p.title, p.nickname, p.ip_prefix,
                    p.user_id,
                    u.nickname AS user_nickname, u.active_title,
                    u.profile_image_url,
                    (p.user_id IS NOT NULL AND u.nickname IS NOT NULL AND p.nickname = u.nickname) AS is_verified_nickname,
                    p.views, p.likes, p.comments_count, p.created_at,
                    p.image_url,
                    (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image
             FROM community_posts p
             LEFT JOIN users u ON u.id = p.user_id
             ${where.replace(/\blikes\b/g, 'p.likes').replace(/\bcategory\b/g, 'p.category')}
             ORDER BY p.likes DESC, p.created_at DESC
             LIMIT 8`,
      params,
    );
    const posts = result.rows.map((row) => ({
      ...row,
      profile_image_url: normalizeProfileImageUrl(row.profile_image_url),
      display_nickname: row.active_title
        ? formatDisplayName(row.nickname, row.active_title)
        : row.nickname,
    }));
    res.json({ posts });
  } catch (err) {
    console.error('[community] GET /posts/hot', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /posts/:id — 게시글 단건 조회                            */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 요청입니다.' });

  const viewerId = req.session?.userId ? parseInt(req.session.userId, 10) : null;

  try {
    const params = [id];
    let blockedWhere = '';
    if (viewerId) {
      params.push(viewerId);
      blockedWhere = `
                AND (
                    p.user_id IS NULL OR NOT EXISTS (
                        SELECT 1
                        FROM user_blocks ub
                        WHERE ub.blocker_id = $2
                          AND ub.blocked_id = p.user_id
                    )
                )`;
    }

    const result = await pool.query(
      `SELECT p.id, p.user_id, p.category, p.title, p.body, p.image_url, p.link_url, p.nickname, p.ip_prefix,
                    u.nickname AS user_nickname, u.active_title,
                    u.profile_image_url,
                    (p.user_id IS NOT NULL AND u.nickname IS NOT NULL AND p.nickname = u.nickname) AS is_verified_nickname,
                    p.views, p.likes, p.comments_count, p.created_at, p.updated_at
             FROM community_posts p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.id = $1
             ${blockedWhere}`,
      params,
    );
    if (!result.rows.length) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    const post = result.rows[0];
    if (viewerId) {
      const bookmarkRes = await pool.query(
        'SELECT 1 FROM community_bookmarks WHERE post_id = $1 AND user_id = $2',
        [id, viewerId],
      );
      post.is_bookmarked = bookmarkRes.rows.length > 0;

      const likeRes = await pool.query(
        'SELECT 1 FROM community_likes WHERE post_id = $1 AND user_id = $2',
        [id, viewerId],
      );
      post.is_liked = likeRes.rows.length > 0;
    } else {
      post.is_bookmarked = false;
      post.is_liked = false;
    }
    post.display_nickname = post.active_title
      ? formatDisplayName(post.nickname, post.active_title)
      : post.nickname;
    post.profile_image_url = normalizeProfileImageUrl(post.profile_image_url);
    res.json({ post });
  } catch (err) {
    console.error('[community] GET /posts/:id', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts — 글 작성                                         */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts', requireLatestEulaIfAuthenticated, async (req, res) => {
  const { category, title, body = '', anonymous_nickname, image_url, link_url } = req.body;
  const bodyText = typeof body === 'string' ? body : '';

  if (!title || !title.trim()) {
    return res.status(400).json({ error: '제목을 입력해 주세요.' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: '제목은 200자 이내로 입력해 주세요.' });
  }
  if (!WRITABLE_CATS.has(category)) {
    return res.status(400).json({ error: '카테고리가 올바르지 않습니다.' });
  }
  if (bodyText.length > 5000) {
    return res.status(400).json({ error: '내용은 5,000자 이내로 입력해 주세요.' });
  }

  const normalizedImageUrl = normalizeOptionalImageUrl(image_url);
  if (normalizedImageUrl === null) {
    return res.status(400).json({ error: '이미지 첨부가 올바르지 않습니다.' });
  }

  const normalizedLinkUrl = normalizeOptionalHttpUrl(link_url);
  if (normalizedLinkUrl === null) {
    return res.status(400).json({ error: '링크 주소는 http/https 형식으로 입력해 주세요.' });
  }

  const requestedNickname = normalizeCommunityNickname(anonymous_nickname);
  if (requestedNickname === null) {
    return res.status(400).json({ error: '익명 닉네임은 2~20자로 입력해 주세요.' });
  }

  const ipPrefix = getIpPrefix(req);

  try {
    let userId = null;
    let nickname = requestedNickname;
    if (req.session.userId) {
      const userRes = await pool.query('SELECT id, nickname FROM users WHERE id = $1', [
        req.session.userId,
      ]);
      if (userRes.rows.length) {
        userId = userRes.rows[0].id;
        const userNickname = normalizeCommunityNickname(userRes.rows[0].nickname) || '익명';
        const hasCustomNicknameInput =
          typeof anonymous_nickname === 'string' && anonymous_nickname.trim().length > 0;
        nickname = hasCustomNicknameInput ? requestedNickname : userNickname;
      }
    }

    const result = await pool.query(
      `INSERT INTO community_posts (user_id, category, title, body, image_url, link_url, ip_prefix, nickname)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, category, title, nickname, ip_prefix, image_url, link_url,
                       views, likes, comments_count, created_at,
                       (image_url IS NOT NULL AND image_url <> '') AS has_image`,
      [
        userId,
        category,
        title.trim(),
        bodyText.trim(),
        normalizedImageUrl || null,
        normalizedLinkUrl || null,
        ipPrefix,
        nickname,
      ],
    );
    res.status(201).json({ post: result.rows[0] });
  } catch (err) {
    console.error('[community] POST /posts', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.patch('/posts/:id', requireAuth, requireLatestEula, async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const userId = Number(req.session.userId || 0);
  const { category, title, body = '', anonymous_nickname, image_url, link_url } = req.body || {};
  const bodyText = typeof body === 'string' ? body : '';

  if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });
  if (!title || !title.trim()) {
    return res.status(400).json({ error: '제목을 입력해 주세요.' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: '제목은 200자 이내로 입력해 주세요.' });
  }
  if (!WRITABLE_CATS.has(category)) {
    return res.status(400).json({ error: '카테고리가 올바르지 않습니다.' });
  }
  if (bodyText.length > 5000) {
    return res.status(400).json({ error: '내용은 5,000자 이내로 입력해 주세요.' });
  }

  const normalizedImageUrl = normalizeOptionalImageUrl(image_url);
  if (normalizedImageUrl === null) {
    return res.status(400).json({ error: '이미지 첨부가 올바르지 않습니다.' });
  }

  const normalizedLinkUrl = normalizeOptionalHttpUrl(link_url);
  if (normalizedLinkUrl === null) {
    return res.status(400).json({ error: '링크 주소는 http/https 형식으로 입력해 주세요.' });
  }

  const requestedNickname = normalizeCommunityNickname(anonymous_nickname);
  if (requestedNickname === null) {
    return res.status(400).json({ error: '익명 닉네임은 2~20자로 입력해 주세요.' });
  }

  try {
    const postRes = await pool.query('SELECT id, user_id FROM community_posts WHERE id = $1', [
      postId,
    ]);
    if (!postRes.rows.length) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const ownerId = Number(postRes.rows[0].user_id || 0);
    if (ownerId !== userId) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const userRes = await pool.query('SELECT nickname FROM users WHERE id = $1', [userId]);
    const userNickname = normalizeCommunityNickname(userRes.rows[0]?.nickname) || '익명';
    const hasCustomNicknameInput =
      typeof anonymous_nickname === 'string' && anonymous_nickname.trim().length > 0;
    const nextNickname = hasCustomNicknameInput ? requestedNickname : userNickname;

    const result = await pool.query(
      `UPDATE community_posts
             SET category = $1,
                 title = $2,
                 body = $3,
                 image_url = $4,
                 link_url = $5,
                 nickname = $6,
                 updated_at = NOW()
             WHERE id = $7
             RETURNING id, category, title, body, image_url, link_url, nickname,
                       views, likes, comments_count, created_at, updated_at`,
      [
        category,
        title.trim(),
        bodyText.trim(),
        normalizedImageUrl || null,
        normalizedLinkUrl || null,
        nextNickname,
        postId,
      ],
    );

    return res.json({ post: result.rows[0] });
  } catch (err) {
    console.error('[community] PATCH /posts/:id', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* DELETE /posts/:id — 관리자/작성자 글 삭제                    */
/* ════════════════════════════════════════════════════════════ */
router.delete('/posts/:id', requireAuth, async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const userId = Number(req.session.userId || 0);
  if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  try {
    const postRes = await pool.query('SELECT id, user_id FROM community_posts WHERE id = $1', [
      postId,
    ]);
    if (!postRes.rows.length) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const postOwnerId = Number(postRes.rows[0].user_id || 0);
    const isOwner = postOwnerId > 0 && postOwnerId === userId;

    let canDelete = isOwner;
    if (!canDelete) {
      const adminRole = await getAdminRole(pool, userId);
      canDelete = adminRole !== 'none';
    }

    if (!canDelete) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    const deleted = await pool.query('DELETE FROM community_posts WHERE id = $1 RETURNING id', [
      postId,
    ]);
    if (!deleted.rows.length) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    res.json({ ok: true, deleted_post_id: postId });
  } catch (err) {
    console.error('[community] DELETE /posts/:id', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
