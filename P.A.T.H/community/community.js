/**
 * community.js — CommunityPage 컨트롤러
 *
 * 담당: 필터 상태 관리, 데이터 페치, 게시글 리스트 렌더링,
 *       무한 스크롤 초기화, 스켈레톤 표시/숨김
 */

import { PostListItem, SkeletonItem } from './PostListItem.js';
import { useInfiniteScroll }          from './useInfiniteScroll.js';

/* ─── 상수 ──────────────────────────────────────── */
const PAGE_SIZE   = 20;
const FILTERS     = ['전체', '념글', '정보', '질문'];
const FAKE_DELAY  = 700; // ms — 스켈레톤 체감용

/* ─── 상태 ──────────────────────────────────────── */
let currentFilter = '전체';
let currentPage   = 0;
let totalFakeData = [];
let scrollHook    = null;

/* ─── DOM 참조 ───────────────────────────────────── */
const filterBar   = document.getElementById('filter-bar');
const postList    = document.getElementById('post-list');
const sentinel    = document.getElementById('scroll-sentinel');
const writeBtn    = document.getElementById('write-btn');
const headerCount = document.getElementById('post-count');

/* ─── 초기화 ─────────────────────────────────────── */
function init() {
  buildFilterChips();
  generateFakeData();
  resetAndLoad();
  bindWriteButton();
}

/* ─── 필터 칩 생성 ───────────────────────────────── */
function buildFilterChips() {
  filterBar.innerHTML = '';
  FILTERS.forEach((label) => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip' + (label === currentFilter ? ' active' : '');
    btn.textContent = label;
    btn.setAttribute('aria-pressed', label === currentFilter);
    btn.addEventListener('click', () => onFilterChange(label));
    filterBar.appendChild(btn);
  });
}

/* ─── 필터 변경 ──────────────────────────────────── */
function onFilterChange(label) {
  if (label === currentFilter) return;
  currentFilter = label;

  filterBar.querySelectorAll('.filter-chip').forEach((btn) => {
    const active = btn.textContent === label;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });

  resetAndLoad();
}

/* ─── 초기화 후 첫 로드 ──────────────────────────── */
function resetAndLoad() {
  currentPage = 0;
  postList.innerHTML = '';
  if (scrollHook) scrollHook.disconnect();

  const initialSkeletons = Array.from({ length: 8 }, SkeletonItem);
  initialSkeletons.forEach((s) => postList.appendChild(s));

  loadNextPage().then(() => {
    scrollHook = useInfiniteScroll({
      onLoadMore: loadNextPage,
      hasMore:    () => hasMorePages(),
      sentinel,
    });
  });
}

/* ─── 다음 페이지 로드 ───────────────────────────── */
async function loadNextPage() {
  const skeletons = renderSkeletons(4);

  const filtered = getFilteredPosts();
  const start    = currentPage * PAGE_SIZE;
  const slice    = filtered.slice(start, start + PAGE_SIZE);

  await delay(FAKE_DELAY);

  removeSkeletons();
  skeletons.forEach((s) => s.remove()); // 방어적 제거

  if (slice.length === 0) {
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  slice.forEach((post) => fragment.appendChild(PostListItem(post)));
  postList.appendChild(fragment);

  currentPage++;
  updateHeaderCount(filtered.length);
}

/* ─── 스켈레톤 렌더 ──────────────────────────────── */
function renderSkeletons(count) {
  const items = Array.from({ length: count }, SkeletonItem);
  items.forEach((s) => postList.appendChild(s));
  return items;
}

function removeSkeletons() {
  postList.querySelectorAll('.skeleton-item').forEach((s) => s.remove());
}

/* ─── 빈 상태 ────────────────────────────────────── */
function renderEmptyState() {
  if (postList.querySelector('.empty-state')) return;
  const el = document.createElement('li');
  el.className = 'empty-state';
  el.innerHTML = `
    <div class="empty-icon">📭</div>
    <p class="empty-title">게시글이 없어요</p>
    <p class="empty-desc">첫 번째 글을 작성해 보세요!</p>
  `;
  postList.appendChild(el);
}

/* ─── 헤더 카운트 업데이트 ───────────────────────── */
function updateHeaderCount(total) {
  if (headerCount) headerCount.textContent = `${total.toLocaleString()}개`;
}

/* ─── 필터된 게시글 반환 ─────────────────────────── */
function getFilteredPosts() {
  if (currentFilter === '전체') return totalFakeData;
  return totalFakeData.filter((p) => p.category === currentFilter);
}

/* ─── 더 로드할 페이지가 있는지 ──────────────────── */
function hasMorePages() {
  const total = getFilteredPosts().length;
  return currentPage * PAGE_SIZE < total;
}

/* ─── 글쓰기 버튼 ────────────────────────────────── */
function bindWriteButton() {
  if (!writeBtn) return;
  writeBtn.addEventListener('click', () => {
    showWriteModal();
  });
}

/* ─── 글쓰기 모달 ────────────────────────────────── */
function showWriteModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  backdrop.innerHTML = `
    <div class="write-modal" role="dialog" aria-modal="true" aria-label="게시글 작성">
      <div class="write-modal-header">
        <h2 class="write-modal-title">게시글 작성</h2>
        <button class="write-modal-close" aria-label="닫기">✕</button>
      </div>
      <div class="write-modal-body">
        <div class="write-field">
          <label class="write-label">카테고리</label>
          <div class="write-category-chips">
            ${['념글', '정보', '질문'].map(c => `<button class="write-cat-chip" data-cat="${c}">${c}</button>`).join('')}
          </div>
        </div>
        <div class="write-field">
          <label class="write-label" for="write-title">제목</label>
          <input id="write-title" class="write-input" type="text" placeholder="제목을 입력하세요" maxlength="100" autocomplete="off"/>
        </div>
        <div class="write-field">
          <label class="write-label" for="write-body">내용</label>
          <textarea id="write-body" class="write-textarea" placeholder="내용을 입력하세요" rows="6" maxlength="2000"></textarea>
        </div>
      </div>
      <div class="write-modal-footer">
        <button class="write-cancel-btn">취소</button>
        <button class="write-submit-btn">등록</button>
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
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  let selectedCat = '정보';
  backdrop.querySelectorAll('.write-cat-chip').forEach((btn) => {
    if (btn.dataset.cat === selectedCat) btn.classList.add('active');
    btn.addEventListener('click', () => {
      backdrop.querySelectorAll('.write-cat-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCat = btn.dataset.cat;
    });
  });

  backdrop.querySelector('.write-submit-btn').addEventListener('click', () => {
    const title = backdrop.querySelector('#write-title').value.trim();
    if (!title) {
      backdrop.querySelector('#write-title').focus();
      return;
    }
    submitPost({ title, category: selectedCat });
    closeModal();
  });
}

/* ─── 게시글 등록 (목업) ─────────────────────────── */
function submitPost({ title, category }) {
  const newPost = generatePost(Date.now(), title, category);
  totalFakeData.unshift(newPost);
  resetAndLoad();
}

/* ─── 목업 데이터 생성 ───────────────────────────── */
const SAMPLE_TITLES = [
  '수능 국어 독서 고득점 전략 공유합니다',
  '미적분 극한 개념 정리본 올립니다 (오르비 스타일)',
  '재수 6개월 차 근황 + 멘탈 관리법',
  '현강 vs 인강 뭐가 더 나은가요? 제 경험 기준',
  '화학 킬러 유형 분석 — 2024 기출 기반',
  '국어 비문학 시간 단축하는 법 ㅇㅈ받음',
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
  '수학 시간 부족한 사람들 연습 방법',
  '논술 준비 언제부터 시작하면 적당할까',
  '내신 vs 수능 모드 전환 타이밍',
  '탐구 1+1 전략 — 생1+지1 조합 어때요',
  '재수 결정하고 제일 힘들었던 순간',
  'N수 기숙학원 꼭 가야 하나요? 솔직 후기',
];

const NICKNAMES = [
  '익명유저', '고3탈출러', '수험생활', '공부의신', '갤러리인',
  '현역수능', '재수챌린저', '논술준비중', '이과탈출', '문과선택',
];

const IP_PREFIXES = [
  '118.235', '175.196', '210.94', '61.255', '223.62',
  '1.225', '125.130', '39.7', '106.240', '14.52',
];

const CATEGORIES = ['념글', '정보', '질문', '전체'];
const CAT_WEIGHTS = [0.15, 0.35, 0.35, 0.15];

function weightedCategory() {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < CATEGORIES.length; i++) {
    acc += CAT_WEIGHTS[i];
    if (r < acc) return CATEGORIES[i];
  }
  return '정보';
}

function generatePost(id, title, category) {
  const now   = new Date();
  const ago   = Math.floor(Math.random() * 86400 * 3);
  const cTime = new Date(now - ago * 1000).toISOString();
  return {
    id,
    category:  category || weightedCategory(),
    title:     title    || SAMPLE_TITLES[id % SAMPLE_TITLES.length],
    nickname:  NICKNAMES[id % NICKNAMES.length],
    ipPrefix:  IP_PREFIXES[id % IP_PREFIXES.length],
    likes:     Math.floor(Math.random() * 200),
    comments:  Math.floor(Math.random() * 80),
    createdAt: cTime,
  };
}

function generateFakeData() {
  totalFakeData = Array.from({ length: 180 }, (_, i) => generatePost(i + 1));
}

/* ─── 유틸리티 ──────────────────────────────────── */
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ─── 부트스트랩 ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
