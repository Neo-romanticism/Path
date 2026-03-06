/**
 * community.js — P.A.T.H 커뮤니티 컨트롤러
 *
 * 새 DCinside 스타일 (Toss 디자인) 커뮤니티 게시판
 * - 카테고리 탭 (전체 / 념글 / 정보 / Q&A / 잡담)
 * - 베스트 게시글 가로 스크롤 카드
 * - DCinside 스타일 목록 (번호 · 카테고리 · 제목 · 작성자 · 날짜 · 조회 · 추천)
 * - 검색 (제목 필터)
 * - 무한 스크롤
 * - 글쓰기 모달 (bottom-sheet / centered dialog)
 */

import { PostListItem, SkeletonItem, CATEGORY_META } from './PostListItem.js';
import { useInfiniteScroll }                          from './useInfiniteScroll.js';

/* ─── 상수 ────────────────────────────────────────────────────── */
const PAGE_SIZE     = 25;
const FAKE_DELAY    = 500;
const HOT_THRESHOLD = 15;   // 추천 수 ≥ 이 값이면 베스트

/* 카테고리 탭 정의 */
const CATEGORIES = [
  { key: '전체', label: '전체' },
  { key: '념글', label: '베스트' },
  { key: '정보', label: '정보' },
  { key: '질문', label: 'Q&A' },
  { key: '잡담', label: '잡담' },
];

/* ─── 상태 ────────────────────────────────────────────────────── */
let currentCat  = '전체';
let currentPage = 0;
let searchQuery = '';
let allPosts    = [];
let scrollHook  = null;

/* ─── DOM ─────────────────────────────────────────────────────── */
const categoryBar     = document.getElementById('category-bar');
const hotList         = document.getElementById('hot-list');
const hotSection      = document.getElementById('hot-section');
const postList        = document.getElementById('post-list');
const sentinel        = document.getElementById('scroll-sentinel');
const postCountBadge  = document.getElementById('post-count-badge');
const searchToggle    = document.getElementById('search-toggle');
const searchWrap      = document.getElementById('search-wrap');
const searchInput     = document.getElementById('search-input');
const searchClear     = document.getElementById('search-clear');
const writeFab        = document.getElementById('write-fab');
const writeHeaderBtn  = document.getElementById('write-header-btn');

/* ─── 초기화 ──────────────────────────────────────────────────── */
function init() {
  generateFakeData();
  buildCategoryBar();
  renderHotPosts();
  resetAndLoad();
  bindEvents();
}

/* ─── 카테고리 탭 ────────────────────────────────────────────── */
function buildCategoryBar() {
  categoryBar.innerHTML = '';
  CATEGORIES.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.className = 'c-cat-chip';
    btn.textContent = label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', key === currentCat ? 'true' : 'false');
    btn.addEventListener('click', () => onCatChange(key));
    categoryBar.appendChild(btn);
  });
}

function onCatChange(key) {
  if (key === currentCat) return;
  currentCat = key;
  categoryBar.querySelectorAll('.c-cat-chip').forEach((btn, i) => {
    const active = CATEGORIES[i].key === key;
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderHotPosts();
  resetAndLoad();
}

/* ─── 베스트 게시글 ──────────────────────────────────────────── */
function renderHotPosts() {
  const filtered = getFilteredPosts();
  const hot = filtered
    .filter(p => p.likes >= HOT_THRESHOLD)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 8);

  if (hot.length === 0) {
    hotSection.hidden = true;
    return;
  }
  hotSection.hidden = false;

  // skeletons while "loading"
  hotList.innerHTML = '';
  Array.from({ length: Math.min(hot.length, 4) }).forEach(() => {
    const s = document.createElement('li');
    s.className = 'c-hot-skel';
    hotList.appendChild(s);
  });

  setTimeout(() => {
    hotList.innerHTML = '';
    hot.forEach(post => hotList.appendChild(HotCard(post)));
  }, 300);
}

function HotCard(post) {
  const cat = CATEGORY_META[post.category] ?? CATEGORY_META['전체'];
  const li  = document.createElement('li');
  li.innerHTML = `
    <div class="c-hot-card" role="button" tabindex="0" aria-label="${escHtml(post.title)}">
      <div class="c-hot-card__cat ${cat.cls}">${cat.label}</div>
      <p class="c-hot-card__title">${escHtml(post.title)}</p>
      <div class="c-hot-card__footer">
        <span class="c-hot-card__author">${escHtml(post.nickname)}</span>
        <span class="c-hot-card__stats">
          <span class="c-hot-card__stat">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M6 1 7.5 4.5H11L8.2 6.8 9.3 10.5 6 8.3 2.7 10.5 3.8 6.8 1 4.5H4.5Z"/>
            </svg>
            ${post.likes}
          </span>
          <span class="c-hot-card__stat" style="color:var(--text-2)">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M2 2h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4l-2 2V3a1 1 0 0 1 1-1z"/>
            </svg>
            ${post.comments}
          </span>
        </span>
      </div>
    </div>
  `;
  return li;
}

/* ─── 목록 초기화 및 첫 로드 ──────────────────────────────────── */
function resetAndLoad() {
  currentPage = 0;
  postList.innerHTML = '';
  if (scrollHook) scrollHook.disconnect();

  // 초기 스켈레톤
  const skels = Array.from({ length: 10 }, SkeletonItem);
  skels.forEach(s => postList.appendChild(s));

  loadNextPage().then(() => {
    scrollHook = useInfiniteScroll({
      onLoadMore: loadNextPage,
      hasMore:    hasMorePages,
      sentinel,
    });
  });
}

/* ─── 다음 페이지 로드 ───────────────────────────────────────── */
async function loadNextPage() {
  const extra = Array.from({ length: 4 }, SkeletonItem);
  extra.forEach(s => postList.appendChild(s));

  const filtered = getFilteredPosts();
  const start    = currentPage * PAGE_SIZE;
  const slice    = filtered.slice(start, start + PAGE_SIZE);
  const total    = filtered.length;

  await delay(FAKE_DELAY);

  postList.querySelectorAll('.skel-row').forEach(s => s.remove());

  if (start === 0 && slice.length === 0) {
    renderEmpty();
    updateBadge(0);
    return;
  }

  const frag = document.createDocumentFragment();
  slice.forEach((post, i) => {
    const displayNum = total - start - i;
    frag.appendChild(PostListItem({ ...post, displayNum, isHot: post.likes >= HOT_THRESHOLD }));
  });
  postList.appendChild(frag);

  currentPage++;
  updateBadge(total);
}

/* ─── 필터 ────────────────────────────────────────────────────── */
function getFilteredPosts() {
  let list = currentCat === '전체'
    ? allPosts
    : allPosts.filter(p => p.category === currentCat);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(q));
  }
  return list;
}

function hasMorePages() {
  return currentPage * PAGE_SIZE < getFilteredPosts().length;
}

/* ─── UI 헬퍼 ─────────────────────────────────────────────────── */
function renderEmpty() {
  if (postList.querySelector('.c-empty')) return;
  const li = document.createElement('li');
  li.className = 'c-empty';
  li.innerHTML = `
    <div class="c-empty__icon">📭</div>
    <p class="c-empty__title">${searchQuery ? '검색 결과가 없어요' : '게시글이 없어요'}</p>
    <p class="c-empty__desc">${searchQuery ? `"${escHtml(searchQuery)}" 에 해당하는 글이 없습니다` : '첫 번째 글을 작성해 보세요!'}</p>
  `;
  postList.appendChild(li);
}

function updateBadge(total) {
  postCountBadge.textContent = total >= 1000
    ? `${(total / 1000).toFixed(1)}k`
    : `${total}`;
}

/* ─── 이벤트 바인딩 ──────────────────────────────────────────── */
function bindEvents() {
  // 검색 토글
  searchToggle.addEventListener('click', () => {
    const open = searchWrap.classList.toggle('open');
    searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      searchClear.classList.add('hidden');
      if (searchQuery) { searchQuery = ''; resetAndLoad(); renderHotPosts(); }
    }
  });

  // 검색 입력
  let searchTimer;
  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !val);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = val;
      resetAndLoad();
    }, 320);
  });

  // 검색 clear
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    searchInput.focus();
    searchQuery = '';
    resetAndLoad();
    renderHotPosts();
  });

  // 글쓰기
  writeFab.addEventListener('click', showWriteModal);
  writeHeaderBtn.addEventListener('click', showWriteModal);
}

/* ─── 글쓰기 모달 ────────────────────────────────────────────── */
function showWriteModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const cats = CATEGORIES.filter(c => c.key !== '전체');
  let selectedCat = currentCat !== '전체' ? currentCat : '정보';

  backdrop.innerHTML = `
    <div class="write-modal" role="dialog" aria-modal="true" aria-label="게시글 작성">
      <div class="write-modal-handle"></div>
      <div class="write-modal-header">
        <h2 class="write-modal-title">게시글 작성</h2>
        <button class="write-modal-close" aria-label="닫기">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
      </div>
      <div class="write-modal-body">
        <div class="write-field">
          <label class="write-label">카테고리</label>
          <div class="write-cat-chips">
            ${cats.map(c => `<button class="write-cat-chip${c.key === selectedCat ? ' active' : ''}" data-cat="${c.key}">${c.label}</button>`).join('')}
          </div>
        </div>
        <div class="write-field">
          <label class="write-label" for="wt-title">제목</label>
          <input id="wt-title" class="write-input" type="text" placeholder="제목을 입력하세요" maxlength="100" autocomplete="off">
        </div>
        <div class="write-field">
          <label class="write-label" for="wt-body">내용</label>
          <textarea id="wt-body" class="write-textarea" placeholder="자유롭게 작성해 보세요 (최대 2,000자)" maxlength="2000"></textarea>
          <span class="write-char-count" id="wt-char">0 / 2,000</span>
        </div>
      </div>
      <div class="write-modal-footer">
        <button class="write-cancel-btn">취소</button>
        <button class="write-submit-btn">등록하기</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const closeModal = () => {
    backdrop.classList.remove('visible');
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
  };

  backdrop.querySelector('.write-modal-close').addEventListener('click', closeModal);
  backdrop.querySelector('.write-cancel-btn').addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

  // category chips
  backdrop.querySelectorAll('.write-cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      backdrop.querySelectorAll('.write-cat-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCat = btn.dataset.cat;
    });
  });

  // char count
  const textarea  = backdrop.querySelector('#wt-body');
  const charCount = backdrop.querySelector('#wt-char');
  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len.toLocaleString()} / 2,000`;
    charCount.classList.toggle('warn', len > 1800);
  });

  // submit
  backdrop.querySelector('.write-submit-btn').addEventListener('click', () => {
    const title = backdrop.querySelector('#wt-title').value.trim();
    const body  = textarea.value.trim();
    if (!title) { backdrop.querySelector('#wt-title').focus(); return; }
    submitPost({ title, body, category: selectedCat });
    closeModal();
    showToast('게시글이 등록됐어요 ✓');
  });

  // focus title
  setTimeout(() => backdrop.querySelector('#wt-title').focus(), 250);
}

/* ─── 게시글 등록 ────────────────────────────────────────────── */
function submitPost({ title, body, category }) {
  const post = generatePost(Date.now(), title, body, category);
  allPosts.unshift(post);
  renderHotPosts();
  resetAndLoad();
}

/* ─── Toast ──────────────────────────────────────────────────── */
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'c-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => t.classList.add('visible'));
  });
  setTimeout(() => {
    t.classList.remove('visible');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, 2200);
}

/* ─── 목업 데이터 ─────────────────────────────────────────────── */
const SAMPLE_TITLES = [
  '수능 국어 독서 고득점 전략 공유합니다',
  '미적분 극한 개념 정리본 올립니다 (오르비 스타일)',
  '재수 6개월 차 근황 + 멘탈 관리법',
  '현강 vs 인강 뭐가 더 나은가요? 제 경험 기준',
  '화학 킬러 유형 분석 — 2024 기출 기반',
  '국어 비문학 시간 단축하는 법',
  'EBS 연계 올해 어떻게 나올 것 같냐',
  '수험생 수면 시간 몇 시간으로 유지하세요?',
  '탐구 선택 과목 조합 추천해줘요',
  '모의고사 2등급 → 수능 1등급 후기',
  '수학 가형 백점 나왔을 때 공부법 공개',
  '영어 절대평가 1등급 기준이 너무 낮지 않음?',
  '사탐 vs 과탐 N수생 입장에서 비교',
  '국어 등급 잘 안 오르는 사람들 특징',
  '인수분해 빠르게 하는 꿀팁 (킬러 대비)',
  '시대인재 현강 끊을지 인강으로 갈아탈지 고민',
  '수능 D-100 타임테이블 공유해요',
  '6월 모의 이후 공부 방향 잡는 법',
  '비문학 지문 처음 볼 때 어디서 막히세요?',
  '수학 시간 부족한 사람들을 위한 연습 방법',
  '논술 준비 언제부터 시작하면 적당할까',
  '내신 vs 수능 모드 전환 타이밍',
  '탐구 1+1 전략 — 생1+지1 조합 어때요',
  '재수 결정하고 제일 힘들었던 순간',
  'N수 기숙학원 꼭 가야 하나요? 솔직 후기',
  '매일 공부 12시간 하는 루틴 공개',
  '수능 D-200부터 시작한 플래너 방식',
  '킬러 문항 한 문제에 20분 쓸 가치 있음?',
  '이과 → 문과 전향 N수생 솔직 후기',
  '공부하다 멘탈 무너질 때 극복법',
  '수능 당일 컨디션 관리 팁 모음',
  '오르비 vs 메가 커뮤니티 어디 더 좋음?',
  '국어 만점자 공부법 요약 정리',
  '영어 독해 빠르게 읽는 훈련법',
  '수능 끝나고 바로 뭐 할 예정이에요?',
];

const NICKNAMES = [
  '익명', '고3탈출러', '수험생활', '공부의신', '갤러리인',
  '현역수능', '재수챌린저', '논술준비', '이과탈출', '문과선택',
  '미적분왕', '국어고수', '영어만점', '탐구신',  '수험일기',
];

const IP_PREFIXES = [
  '118.235', '175.196', '210.94', '61.255', '223.62',
  '1.225',   '125.130', '39.7',   '106.240', '14.52',
];

const CAT_KEYS    = ['념글', '정보', '질문', '잡담'];
const CAT_WEIGHTS = [0.12,   0.35,   0.33,   0.20];

function weightedCat() {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < CAT_KEYS.length; i++) {
    acc += CAT_WEIGHTS[i];
    if (r < acc) return CAT_KEYS[i];
  }
  return '정보';
}

function generatePost(id, title, body, category) {
  const ago = Math.floor(Math.random() * 86400 * 5);
  return {
    id,
    category:  category  || weightedCat(),
    title:     title     || SAMPLE_TITLES[id % SAMPLE_TITLES.length],
    body:      body      || '',
    nickname:  NICKNAMES[id % NICKNAMES.length],
    ipPrefix:  IP_PREFIXES[id % IP_PREFIXES.length],
    likes:     Math.floor(Math.random() * 120),
    comments:  Math.floor(Math.random() * 60),
    views:     Math.floor(Math.random() * 2800) + 20,
    createdAt: new Date(Date.now() - ago * 1000).toISOString(),
  };
}

function generateFakeData() {
  allPosts = Array.from({ length: 200 }, (_, i) => generatePost(i + 1));
}

/* ─── 유틸리티 ───────────────────────────────────────────────── */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── 부트스트랩 ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
