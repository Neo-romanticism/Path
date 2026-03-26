const express = require('express');
const router = express.Router();
const pool = require('../db');
const {
  escapeHtml,
  jsonLdSafe,
  getSiteBaseUrl,
  safeExternalUrl,
  safeCommunityImageUrl,
} = require('../utils/textHelpers');

router.get('/community/post/:id', async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const targetCommentId = Math.max(0, parseInt(req.query.cmt, 10) || 0);
  if (!postId) {
    return res.status(400).type('text/html').send('<h1>잘못된 요청</h1>');
  }

  try {
    const [updateResult, commentsResult, targetCommentResult, otherPostsResult] = await Promise.all(
      [
        pool.query(
          `WITH updated AS (
                   UPDATE community_posts SET views = views + 1 WHERE id = $1
                   RETURNING id, user_id, category, title, body, image_url, link_url, nickname, ip_prefix, views, likes, comments_count, created_at
                 )
                 SELECT u_cp.*,
                        u.profile_image_url,
                        u.active_title,
                        (u_cp.user_id IS NOT NULL AND u.nickname IS NOT NULL AND u_cp.nickname = u.nickname) AS is_verified_nickname
                 FROM updated u_cp
                 LEFT JOIN users u ON u.id = u_cp.user_id`,
          [postId],
        ),
        pool.query(
          `SELECT c.id, c.nickname, c.ip_prefix, c.body, c.created_at,
                        u.profile_image_url,
                        (c.user_id IS NOT NULL AND u.nickname IS NOT NULL AND c.nickname = u.nickname) AS is_verified_nickname
                 FROM community_comments c
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE c.post_id = $1
                 ORDER BY c.created_at DESC
                 LIMIT 5`,
          [postId],
        ),
        targetCommentId
          ? pool.query(
              `SELECT c.id, c.nickname, c.ip_prefix, c.body, c.created_at,
                      u.profile_image_url,
                      (c.user_id IS NOT NULL AND u.nickname IS NOT NULL AND c.nickname = u.nickname) AS is_verified_nickname
                   FROM community_comments c
                   LEFT JOIN users u ON u.id = c.user_id
                   WHERE c.post_id = $1 AND c.id = $2
                   LIMIT 1`,
              [postId, targetCommentId],
            )
          : Promise.resolve({ rows: [] }),
        pool.query(
          `SELECT p.id, p.category, p.title, p.nickname, p.ip_prefix, p.likes, p.comments_count, p.views, p.created_at,
                        u.profile_image_url,
                        (p.user_id IS NOT NULL AND u.nickname IS NOT NULL AND p.nickname = u.nickname) AS is_verified_nickname
                 FROM community_posts p
                 LEFT JOIN users u ON u.id = p.user_id
                 WHERE p.id != $1
                 ORDER BY p.created_at DESC
                 LIMIT 10`,
          [postId],
        ),
      ],
    );

    if (!updateResult.rows.length) {
      return res.status(404).type('text/html').send('<h1>게시글을 찾을 수 없습니다.</h1>');
    }

    const post = updateResult.rows[0];
    if (
      post.profile_image_url &&
      /^\/uploads\/profiles\/[a-zA-Z0-9._-]+$/.test(post.profile_image_url.trim())
    ) {
      post.profile_image_url = post.profile_image_url.trim();
    } else {
      post.profile_image_url = '';
    }
    post.display_nickname = post.active_title
      ? `${post.nickname} [${post.active_title}]`
      : post.nickname || '익명';
    const comments = commentsResult.rows;
    if (targetCommentResult.rows.length) {
      const target = targetCommentResult.rows[0];
      if (!comments.some((c) => Number(c.id) === Number(target.id))) {
        comments.unshift(target);
      }
    }
    const highlightedCommentId = targetCommentResult.rows[0]?.id || null;
    comments.forEach((c) => {
      if (
        c.profile_image_url &&
        /^\/uploads\/profiles\/[a-zA-Z0-9._-]+$/.test(c.profile_image_url.trim())
      ) {
        c.profile_image_url = c.profile_image_url.trim();
      } else {
        c.profile_image_url = '';
      }
    });
    const otherPosts = otherPostsResult.rows;
    const baseUrl = getSiteBaseUrl(req);
    const canonical = `${baseUrl}/community/post/${post.id}`;
    const safeImageUrl = safeCommunityImageUrl(post.image_url);
    const safeLinkUrl = safeExternalUrl(post.link_url);
    const ogImageUrl = safeImageUrl.startsWith('/') ? `${baseUrl}${safeImageUrl}` : safeImageUrl;
    const title = `${post.title} | 입시 커뮤니티 - P.A.T.H`;
    const bodyPreview = (post.body || '').trim().replace(/\s+/g, ' ').slice(0, 150);
    const description = bodyPreview
      ? `${bodyPreview}...`
      : `${post.category} 카테고리의 수험생 커뮤니티 게시글`;
    const publishedIso = new Date(post.created_at).toISOString();

    const postSchema = {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      mainEntityOfPage: canonical,
      headline: post.title,
      articleBody: post.body || '',
      inLanguage: 'ko',
      datePublished: publishedIso,
      dateModified: publishedIso,
      author: {
        '@type': 'Person',
        name: post.nickname || '익명',
      },
      publisher: {
        '@type': 'Organization',
        name: 'P.A.T.H',
      },
      interactionStatistic: [
        {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'ViewAction' },
          userInteractionCount: post.views || 0,
        },
        {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'LikeAction' },
          userInteractionCount: post.likes || 0,
        },
        {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'CommentAction' },
          userInteractionCount: post.comments_count || 0,
        },
      ],
    };

    const commentSchema = comments.map((comment) => ({
      '@type': 'Comment',
      text: comment.body || '',
      dateCreated: new Date(comment.created_at).toISOString(),
      author: {
        '@type': 'Person',
        name: comment.nickname || '익명',
      },
    }));
    if (commentSchema.length) {
      postSchema.comment = commentSchema;
    }

    function renderCommentAvatar(c) {
      if (c.profile_image_url && c.is_verified_nickname) {
        return `<img class="cmt-avatar" src="${escapeHtml(c.profile_image_url)}" alt="" loading="lazy">`;
      }
      const initial = escapeHtml((c.nickname || '익').charAt(0).toUpperCase());
      return `<span class="cmt-avatar cmt-avatar--empty">${initial}</span>`;
    }

    const commentsHtml = comments.length
      ? comments
          .map(
            (comment) => `
      <li class="comment-item${Number(highlightedCommentId) === Number(comment.id) ? ' comment-item--target' : ''}" id="comment-${comment.id}">
        <div class="comment-meta">
          ${renderCommentAvatar(comment)}
          <span class="cmt-nick">${escapeHtml(comment.nickname || '익명')}${comment.is_verified_nickname ? '<span class="verified-badge">✓</span>' : ''}</span>
          ${comment.ip_prefix ? `<span class="cmt-ip">(${escapeHtml(comment.ip_prefix)})</span>` : ''}
          <span class="cmt-date">${escapeHtml(new Date(comment.created_at).toLocaleString('ko-KR'))}</span>
        </div>
        <p class="comment-body">${escapeHtml(comment.body || '')}</p>
      </li>`,
          )
          .join('')
      : '<li class="comment-empty">아직 댓글이 없습니다.</li>';

    const CATEGORY_COLORS = {
      정보: 'cat-info',
      질문: 'cat-qa',
      잡담: 'cat-chat',
      념글: 'cat-best',
      전체: 'cat-all',
    };
    function fmtRelDet(dateStr) {
      const diff = Date.now() - new Date(dateStr).getTime();
      if (diff < 60000) return '방금';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
      if (diff < 2592000000) return `${Math.floor(diff / 86400000)}일 전`;
      return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }
    const otherPostsHtml = otherPosts.length
      ? otherPosts
          .map((p) => {
            const catCls = CATEGORY_COLORS[p.category] || 'cat-all';
            const avatarHtml =
              p.profile_image_url && p.is_verified_nickname
                ? `<img class="post-row-avatar" src="${escapeHtml(p.profile_image_url)}" alt="" loading="lazy">`
                : `<span class="post-row-avatar post-row-avatar--empty">${escapeHtml((p.nickname || '익').charAt(0))}</span>`;
            return `<a class="post-row" href="/community/post/${p.id}">
              <div class="post-row__main">
                <div class="post-row__top">
                  <span class="post-cat ${catCls}">${escapeHtml(p.category || '전체')}</span>
                  <span class="post-title">${escapeHtml(p.title)}</span>
                </div>
                <div class="post-row__meta">
                  ${avatarHtml}
                  <span class="post-nick">${escapeHtml(p.nickname || '익명')}${p.is_verified_nickname ? '<span class="verified-badge">✓</span>' : ''}</span>
                  ${p.ip_prefix ? `<span class="post-ip">(${escapeHtml(p.ip_prefix)})</span>` : ''}
                  <span class="post-date">${fmtRelDet(p.created_at)}</span>
                  <span class="post-stats">
                    <span class="post-stat">👍 ${p.likes || 0}</span>
                    <span class="post-stat">💬 ${p.comments_count || 0}</span>
                  </span>
                </div>
              </div>
            </a>`;
          })
          .join('')
      : '<p class="other-empty">다른 게시글이 없습니다.</p>';

    const authorAvatarHtml =
      post.profile_image_url && post.is_verified_nickname
        ? `<img class="author-avatar" src="${escapeHtml(post.profile_image_url)}" alt="${escapeHtml(post.display_nickname)}" loading="lazy">`
        : `<span class="author-avatar author-avatar--empty">${escapeHtml((post.display_nickname || '익').charAt(0).toUpperCase())}</span>`;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="P.A.T.H">
  ${ogImageUrl ? `<meta property="og:image" content="${escapeHtml(ogImageUrl)}">` : ''}
  <meta property="article:published_time" content="${escapeHtml(publishedIso)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(post.title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#0D0D11" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#F6F8FC" media="(prefers-color-scheme: light)">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">
  <script type="application/ld+json">${jsonLdSafe(postSchema)}</script>
  <style>
    /* ── Design Tokens (dark default, matches community/style.css) */
    :root {
      --bg:#0D0D11;--surface:#17171D;--surface-2:#1F1F27;
      --border:rgba(255,255,255,0.07);--border-mid:rgba(255,255,255,0.11);
      --accent:#D4AF37;--accent-blue:#3B82F6;--accent-red:#FF453A;--accent-green:#30D158;
      --text-1:#EDEDF0;--text-2:#9191A0;--text-3:#5A5A6E;
      --radius:12px;--radius-lg:16px;--radius-pill:999px;
      --font:'Pretendard Variable','Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --shadow-sm:0 2px 8px rgba(0,0,0,0.35);--shadow-md:0 4px 20px rgba(0,0,0,0.5);
      --header-bg:rgba(13,13,17,0.9);--transition:180ms cubic-bezier(.4,0,.2,1);
    }
    body.light {
      --bg:#F6F8FC;--surface:#FFFFFF;--surface-2:#EEF2F8;
      --border:rgba(23,32,56,0.09);--border-mid:rgba(23,32,56,0.16);
      --accent:#B8860B;--accent-blue:#2563EB;--accent-red:#E23434;--accent-green:#0EA968;
      --text-1:#182033;--text-2:#4A556E;--text-3:#6F7B94;
      --shadow-sm:0 2px 8px rgba(16,24,40,0.08);--shadow-md:0 8px 24px rgba(16,24,40,0.12);
      --header-bg:rgba(246,248,252,0.92);
    }
    *{box-sizing:border-box;margin:0;padding:0}
    html{font-family:var(--font);font-size:14px;background:var(--bg);color:var(--text-1);-webkit-font-smoothing:antialiased}
    body{min-height:100dvh;background:var(--bg);padding-bottom:60px;transition:background var(--transition),color var(--transition)}
    a{color:inherit;text-decoration:none}
    button{border:none;background:none;cursor:pointer;font-family:var(--font);color:inherit}
    ul,ol{list-style:none}

    /* ── Header */
    .c-header{position:sticky;top:0;z-index:100;background:var(--header-bg);backdrop-filter:blur(20px) saturate(1.6);-webkit-backdrop-filter:blur(20px) saturate(1.6);border-bottom:1px solid var(--border)}
    .c-header__inner{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 16px;max-width:900px;margin:0 auto}
    .c-header__left{display:flex;align-items:center;gap:10px}
    .c-header__back{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;color:var(--text-1);transition:background var(--transition)}
    .c-header__back:hover{background:var(--surface-2)}
    .c-header__title{font-size:16px;font-weight:700;color:var(--text-1)}
    .c-header__right{display:flex;align-items:center;gap:4px}
    .c-header__icon-btn{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;color:var(--text-2);transition:background var(--transition),color var(--transition)}
    .c-header__icon-btn:hover{background:var(--surface-2);color:var(--text-1)}
    /* sun/moon icons */
    .theme-icon--moon{display:none}
    body:not(.light) .theme-icon--sun{display:none}
    body:not(.light) .theme-icon--moon{display:block}

    /* ── Page layout */
    .c-page{max-width:900px;margin:0 auto;padding:16px 14px 40px}

    /* ── Post card */
    .post-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;box-shadow:var(--shadow-md);margin-bottom:14px}
    .post-card__top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
    .post-date-meta{font-size:11.5px;color:var(--text-3);margin-left:auto}
    .post-card__title{font-size:20px;font-weight:800;line-height:1.38;word-break:break-word;color:var(--text-1);margin-bottom:12px;letter-spacing:-.02em}
    @media(min-width:600px){.post-card__title{font-size:24px}}

    /* ── Author profile row */
    .author-row{display:flex;align-items:center;gap:10px;padding:10px 0 14px;border-bottom:1px solid var(--border);margin-bottom:14px}
    .author-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;border:1.5px solid var(--border-mid);flex-shrink:0}
    .author-avatar--empty{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--surface-2);border:1.5px solid var(--border-mid);font-size:16px;font-weight:700;color:var(--text-2);flex-shrink:0}
    .author-info{min-width:0;flex:1}
    .author-nick{font-size:13.5px;font-weight:700;color:var(--text-1);display:flex;align-items:center;gap:4px}
    .author-ip{font-size:11px;color:var(--text-3);margin-top:1px}
    .author-stats{display:flex;gap:10px;margin-left:auto;flex-shrink:0}
    .author-stat{font-size:11.5px;color:var(--text-3)}

    /* ── Category chips */
    .post-cat{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:var(--radius-pill);font-size:11px;font-weight:700}
    .cat-info{background:rgba(59,130,246,0.18);color:#60a5fa}
    .cat-qa{background:rgba(48,209,88,0.15);color:#34d399}
    .cat-chat{background:rgba(212,175,55,0.18);color:#d4af37}
    .cat-best{background:rgba(255,69,58,0.15);color:#ff6b6b}
    .cat-all{background:var(--surface-2);color:var(--text-2)}

    /* ── Verified badge */
    .verified-badge{font-size:10px;font-weight:700;color:var(--accent-blue);margin-left:2px}

    /* ── Content */
    .post-body{font-size:14.5px;color:var(--text-1);line-height:1.72;white-space:pre-wrap;word-break:break-word;margin-bottom:16px}
    .post-thumb{margin:0 0 14px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface-2)}
    .post-thumb img{display:block;width:100%;max-height:480px;object-fit:contain}
    .post-outlink{display:inline-flex;align-items:center;gap:6px;margin-bottom:16px;padding:9px 14px;border-radius:var(--radius);background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);font-size:13px;font-weight:600;color:var(--accent-blue)}
    .post-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:10px;border-top:1px solid var(--border);margin-top:4px}
    .post-like-chip{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 14px;border-radius:var(--radius-pill);font-size:12.5px;font-weight:600;color:var(--text-2);border:1.5px solid var(--border-mid);background:var(--surface-2)}
    .share-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 14px;border-radius:var(--radius-pill);font-size:12.5px;font-weight:700;background:var(--accent-blue);color:#fff;margin-left:auto}

    /* ── Comments */
    .section-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:14px;box-shadow:var(--shadow-sm)}
    .section-title{font-size:14px;font-weight:700;color:var(--text-1);margin-bottom:12px}
    .cmt-item{padding:11px 0;border-bottom:1px solid var(--border)}
    .cmt-item:last-child{border-bottom:none;padding-bottom:0}
    .cmt-meta{display:flex;align-items:center;gap:5px;margin-bottom:5px;flex-wrap:wrap}
    .cmt-avatar{width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid var(--border-mid);flex-shrink:0}
    .cmt-avatar--empty{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--surface-2);border:1px solid var(--border-mid);font-size:11px;font-weight:700;color:var(--text-2);flex-shrink:0}
    .cmt-nick{font-size:12px;font-weight:600;color:var(--text-1)}
    .cmt-ip{font-size:11px;color:var(--text-3)}
    .cmt-date{font-size:11px;color:var(--text-3);margin-left:auto}
    .cmt-body{font-size:13.5px;color:var(--text-1);line-height:1.55;white-space:pre-wrap;word-break:break-word}
    .comment-empty{font-size:13px;color:var(--text-3);padding:12px 0;text-align:center}
    .comment-item--target{background:rgba(59,130,246,0.09);border-radius:10px;padding:10px 10px 12px;margin:0 -10px 2px}

    /* ── Other posts list (matches community main page) */
    .post-row{display:flex;padding:11px 0;border-bottom:1px solid var(--border);text-decoration:none;transition:background var(--transition)}
    .post-row:last-child{border-bottom:none}
    .post-row:hover{background:var(--surface-2);margin:0 -16px;padding:11px 16px;border-radius:var(--radius)}
    .post-row__main{flex:1;min-width:0}
    .post-row__top{display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap}
    .post-title{font-size:13.5px;font-weight:600;color:var(--text-1);word-break:break-word;line-height:1.4;flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .post-row__meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
    .post-row-avatar{width:18px;height:18px;border-radius:50%;object-fit:cover;flex-shrink:0}
    .post-row-avatar--empty{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--surface-2);font-size:9px;font-weight:700;color:var(--text-3);flex-shrink:0}
    .post-nick{font-size:11.5px;color:var(--text-2);font-weight:600}
    .post-ip{font-size:11px;color:var(--text-3)}
    .post-date{font-size:11px;color:var(--text-3);margin-left:auto}
    .post-stats{display:flex;gap:6px;margin-left:8px}
    .post-stat{font-size:11px;color:var(--text-3)}
    .other-empty{font-size:13px;color:var(--text-3);padding:16px 0;text-align:center}

    .footnote{margin-top:8px;font-size:12px;color:var(--text-3);text-align:center;padding:8px 0}
  </style>
</head>
<body>
  <!-- ── Header -->
  <header class="c-header">
    <div class="c-header__inner">
      <div class="c-header__left">
        <a class="c-header__back" href="/community/" aria-label="커뮤니티 목록으로">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12 5L7 10L12 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <span class="c-header__title">커뮤니티</span>
      </div>
      <div class="c-header__right">
        <button class="c-header__icon-btn" id="theme-toggle" aria-label="다크 모드 전환" title="다크 모드 전환">
          <svg class="theme-icon theme-icon--sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/>
            <path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/>
            <path d="M2 12h2"/><path d="M20 12h2"/>
            <path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>
          </svg>
          <svg class="theme-icon theme-icon--moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
          </svg>
        </button>
        <button class="share-btn" type="button" id="share-post-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          공유
        </button>
      </div>
    </div>
  </header>

  <main class="c-page">
    <!-- ── 게시글 카드 -->
    <article class="post-card">
      <div class="post-card__top">
        <span class="post-cat ${CATEGORY_COLORS[post.category] || 'cat-all'}">${escapeHtml(post.category || '전체')}</span>
        <span class="post-date-meta">${escapeHtml(new Date(post.created_at).toLocaleString('ko-KR'))}</span>
      </div>
      <h1 class="post-card__title">${escapeHtml(post.title)}</h1>

      <!-- ── 작성자 프로필 -->
      <div class="author-row">
        ${authorAvatarHtml}
        <div class="author-info">
          <div class="author-nick">
            ${escapeHtml(post.display_nickname)}
            ${post.is_verified_nickname ? '<span class="verified-badge">✓</span>' : ''}
          </div>
          ${post.ip_prefix ? `<div class="author-ip">(${escapeHtml(post.ip_prefix)})</div>` : ''}
        </div>
        <div class="author-stats">
          <span class="author-stat">조회 ${post.views || 0}</span>
          <span class="author-stat">추천 ${post.likes || 0}</span>
        </div>
      </div>

      ${safeImageUrl ? `<div class="post-thumb"><img src="${escapeHtml(safeImageUrl)}" alt="첨부 이미지" loading="lazy"></div>` : ''}
      ${post.body ? `<div class="post-body">${escapeHtml(post.body)}</div>` : ''}
      ${safeLinkUrl ? `<a class="post-outlink" href="${escapeHtml(safeLinkUrl)}" target="_blank" rel="noopener noreferrer nofollow">🔗 첨부 링크 열기</a>` : ''}

      <div class="post-actions">
        <span class="post-like-chip">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M6 1 7.5 4.5H11L8.2 6.8 9.3 10.5 6 8.3 2.7 10.5 3.8 6.8 1 4.5H4.5Z"/>
          </svg>
          추천 ${post.likes || 0}
        </span>
        <span class="post-like-chip">💬 댓글 ${post.comments_count || 0}</span>
      </div>
    </article>

    <!-- ── 댓글 프리뷰 -->
    <section class="section-card" aria-label="댓글 프리뷰">
      <p class="section-title">댓글 <strong>${comments.length}</strong></p>
      <ul>${commentsHtml}</ul>
      <p class="footnote">전체 댓글/추천/신고는 커뮤니티 앱 화면에서 이용할 수 있습니다.</p>
    </section>

    <!-- ── 다른 게시글 -->
    <section class="section-card" aria-label="다른 게시글">
      <p class="section-title">다른 게시글</p>
      ${otherPostsHtml}
    </section>
  </main>

  <script>
    (function() {
      // ── 테마 초기화
      function applyTheme() {
        var saved = localStorage.getItem('path_theme');
        var isLight = saved ? saved === 'light' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
        document.body.classList.toggle('light', !!isLight);
        syncThemeBtn();
      }
      function syncThemeBtn() {
        var btn = document.getElementById('theme-toggle');
        if (!btn) return;
        var isLight = document.body.classList.contains('light');
        btn.setAttribute('aria-label', isLight ? '다크 모드 전환' : '라이트 모드 전환');
        btn.title = isLight ? '다크 모드 전환' : '라이트 모드 전환';
      }
      applyTheme();
      var themeBtn = document.getElementById('theme-toggle');
      if (themeBtn) {
        themeBtn.addEventListener('click', function() {
          var nextLight = !document.body.classList.contains('light');
          document.body.classList.toggle('light', nextLight);
          localStorage.setItem('path_theme', nextLight ? 'light' : 'dark');
          syncThemeBtn();
        });
      }

      // ── 공유 버튼
      var shareBtn = document.getElementById('share-post-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', async function() {
          try {
            if (navigator.share) {
              await navigator.share({ title: ${jsonLdSafe(post.title)}, text: ${jsonLdSafe(description)}, url: window.location.href });
              return;
            }
            await navigator.clipboard.writeText(window.location.href);
            shareBtn.textContent = '링크 복사됨';
            setTimeout(function(){ shareBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> 공유'; }, 1400);
          } catch (_) {
            window.prompt('아래 링크를 복사해 공유하세요', window.location.href);
          }
        });
      }

      // ── 댓글 앵커 이동 (?cmt=123)
      try {
        var qs = new URLSearchParams(window.location.search);
        var cmtId = parseInt(qs.get('cmt') || '0', 10);
        if (cmtId > 0) {
          var targetEl = document.getElementById('comment-' + cmtId);
          if (targetEl) {
            setTimeout(function() {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              targetEl.classList.add('comment-item--target');
            }, 120);
          }
        }
      } catch (_) {}
    })();
  </script>
</body>
</html>`;

    return res.type('text/html').send(html);
  } catch (err) {
    console.error('[seo] GET /community/post/:id', err.message);
    return res.status(500).type('text/html').send('<h1>서버 오류</h1>');
  }
});

module.exports = router;
