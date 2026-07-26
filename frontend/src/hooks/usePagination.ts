import { useMemo, useState } from "react";

/**
 * Client-side pagination over an already-fetched array. This caps how many
 * cards actually get rendered (the real source of UI slowdown for a large
 * table long before payload size becomes the bottleneck), without requiring
 * any change to how the data is fetched from the backend.
 *
 * Note: `page` auto-clamps to the valid range every render (e.g. after a
 * search narrows the list below the current page), so callers never need to
 * manually reset it.
 */
export function usePagination<T>(list: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(
    () => list.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [list, clampedPage, pageSize]
  );

  return { page: clampedPage, setPage, totalPages, pageItems, pageSize, total: list.length };
}
