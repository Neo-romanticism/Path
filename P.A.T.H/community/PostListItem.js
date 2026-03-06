/**
 * PostListItem
 * 게시글 단일 아이템을 렌더링하는 순수 함수형 컴포넌트
 *
 * @param {object} post
 * @param {number}  post.id
 * @param {string}  post.category    - '전체' | '념글' | '정보' | '질문'
 * @param {string}  post.title
 * @param {string}  post.nickname
 * @param {string}  post.ipPrefix    - 예: '118.235'
 * @param {number}  post.likes
 * @param {number}  post.comments
 * @param {string}  post.createdAt   - ISO timestamp
 * @returns {HTMLElement}
 */
export function PostListItem(post) {
  const el = document.createElement('li');
  el.className = 'post-item';
  el.setAttribute('data-id', post.id);

  const timeLabel = formatRelativeTime(post.createdAt);
  const categoryMeta = CATEGORY_META[post.category] ?? CATEGORY_META['전체'];

  el.innerHTML = `
    <a class="post-link" href="#post-${post.id}" aria-label="${escapeHtml(post.title)}">
      <div class="post-category-badge" style="--badge-color:${categoryMeta.color}">${categoryMeta.label}</div>
      <p class="post-title">${escapeHtml(post.title)}</p>
      <div class="post-meta">
        <span class="post-author">
          <span class="post-nickname">${escapeHtml(post.nickname)}</span>
          <span class="post-ip">(${escapeHtml(post.ipPrefix)})</span>
        </span>
        <span class="post-stats">
          <span class="stat-item stat-likes" title="추천">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 1L7.5 4.5H11L8.2 6.8L9.3 10.5L6 8.3L2.7 10.5L3.8 6.8L1 4.5H4.5L6 1Z" fill="currentColor"/>
            </svg>
            ${post.likes}
          </span>
          <span class="stat-item stat-comments" title="댓글">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 2h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4l-2 2V3a1 1 0 0 1 1-1z" fill="currentColor"/>
            </svg>
            ${post.comments}
          </span>
          <span class="stat-time">${timeLabel}</span>
        </span>
      </div>
    </a>
  `;

  return el;
}

/**
 * SkeletonItem
 * 로딩 중에 표시할 스켈레톤 아이템
 * @returns {HTMLElement}
 */
export function SkeletonItem() {
  const el = document.createElement('li');
  el.className = 'post-item skeleton-item';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="post-link">
      <div class="skel skel-badge"></div>
      <div class="skel skel-title"></div>
      <div class="skel skel-title skel-title--short"></div>
      <div class="post-meta">
        <div class="skel skel-meta"></div>
        <div class="skel skel-meta skel-meta--wide"></div>
      </div>
    </div>
  `;
  return el;
}

/* ─── 내부 유틸리티 ──────────────────────────────── */

const CATEGORY_META = {
  '전체': { label: '전체', color: 'var(--text-2)' },
  '념글': { label: '념글', color: 'var(--accent)' },
  '정보': { label: '정보', color: '#34C759' },
  '질문': { label: '질문', color: '#0A84FF' },
};

function formatRelativeTime(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60)   return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const d = new Date(isoString);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
