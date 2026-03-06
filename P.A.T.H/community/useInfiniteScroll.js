/**
 * useInfiniteScroll
 * Intersection Observer 기반 무한 스크롤 훅 (순수 JS 모듈)
 *
 * @param {object} options
 * @param {Function} options.onLoadMore   - 새 페이지를 불러올 때 호출되는 콜백
 * @param {Function} options.hasMore      - 더 불러올 데이터가 있는지 반환하는 함수
 * @param {HTMLElement} options.sentinel  - 관찰 대상 엘리먼트 (리스트 하단)
 * @param {number}  [options.rootMargin]  - 픽셀 단위 하단 여백 (기본 200px)
 * @returns {{ disconnect: Function }}
 */
export function useInfiniteScroll({ onLoadMore, hasMore, sentinel, rootMargin = 200 }) {
  let isLoading = false;

  const observer = new IntersectionObserver(
    async (entries) => {
      const entry = entries[0];
      if (!entry.isIntersecting || isLoading || !hasMore()) return;

      isLoading = true;
      await onLoadMore();
      isLoading = false;
    },
    { rootMargin: `0px 0px ${rootMargin}px 0px`, threshold: 0 }
  );

  observer.observe(sentinel);

  return {
    disconnect: () => observer.disconnect(),
  };
}
